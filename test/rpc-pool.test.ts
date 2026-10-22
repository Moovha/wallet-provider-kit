import { afterEach, expect, it, vi } from 'vitest';
import { RpcEndpointPool } from '../src/execution/rpc-pool.js';
import { RpcReader } from '../src/execution/chain.js';
import {
  rpcCapacity,
  runWithBackgroundRpcReads,
} from '../src/execution/rpc-capacity.js';
import { WalletProviderError } from '../src/domain/signing.js';
afterEach(() => vi.useRealTimers());
const endpoints = [
  'https://primary.example.test',
  'https://secondary.example.test',
];
it('retries a complete genesis read through another endpoint when history is pruned', async () => {
  const seen: string[] = [];
  const transport = (async (url) => {
    seen.push(String(url));
    return Response.json(
      String(url) === endpoints[0]
        ? {
            jsonrpc: '2.0',
            id: 1,
            error: {
              code: 4444,
              message: 'pruned history unavailable: requested 0',
            },
          }
        : { jsonrpc: '2.0', id: 1, result: { hash: '0x' + '12'.repeat(32) } },
    );
  }) as typeof fetch;
  const pool = new RpcEndpointPool(endpoints, transport);
  const value = await pool.run((endpoint) =>
    new RpcReader(endpoint, transport, 1, false, 'endpoint-failover').call(
      'eth_getBlockByNumber',
      ['0x0', false],
    ),
  );
  expect(value).toEqual({ hash: '0x' + '12'.repeat(32) });
  expect(seen).toEqual(endpoints);
});
it('rotates whole operations and skips a throttled provider', async () => {
  const transport = vi.fn() as unknown as typeof fetch,
    pool = new RpcEndpointPool(endpoints, transport),
    seen: string[] = [];
  await pool.run(async (url) => seen.push(url));
  await pool.run(async (url) => seen.push(url));
  expect(seen).toEqual(endpoints);
  rpcCapacity(transport, endpoints[0]).retryAfter = Date.now() + 60000;
  expect(await pool.run(async (url) => url)).toBe(endpoints[1]);
});
it('fails over a complete read after endpoint failure but never retries a policy or proof error', async () => {
  const transport = vi.fn() as unknown as typeof fetch,
    pool = new RpcEndpointPool(endpoints, transport),
    seen: string[] = [];
  expect(
    await pool.run(async (url) => {
      seen.push(url);
      if (url === endpoints[0]) {
        rpcCapacity(transport, url).recordReadFailure();
        throw new WalletProviderError('wallet_provider_unavailable');
      }
      return 'read-from-secondary';
    }),
  ).toBe('read-from-secondary');
  expect(seen).toEqual(endpoints);
  const calls = vi.fn(async () => {
    throw new WalletProviderError('wallet_authorization_denied');
  });
  await expect(
    new RpcEndpointPool(endpoints, transport).run(calls),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(calls).toHaveBeenCalledTimes(1);
});
it('keeps submission nonce cooldowns separate from funding and read capacity', async () => {
  const transport = vi.fn() as unknown as typeof fetch;
  const submissions = new RpcEndpointPool(endpoints, transport);
  const reads = new RpcEndpointPool(endpoints, transport);
  const seen: string[] = [];
  expect(
    await submissions.run(async (endpoint) => {
      seen.push(endpoint);
      if (endpoint === endpoints[0]) {
        submissions.cooldown(endpoint);
        throw new WalletProviderError('wallet_provider_unavailable');
      }
      return endpoint;
    }),
  ).toBe(endpoints[1]);
  expect(seen).toEqual(endpoints);
  expect(rpcCapacity(transport, endpoints[0]).retryAfter).toBe(0);
  expect(await reads.run(async (endpoint) => endpoint)).toBe(endpoints[0]);
});
it('fails immediately when every endpoint is cooling down', async () => {
  const transport = vi.fn() as unknown as typeof fetch;
  for (const endpoint of endpoints)
    rpcCapacity(transport, endpoint).retryAfter = Date.now() + 60000;
  const work = vi.fn();
  await expect(
    new RpcEndpointPool(endpoints, transport).run(work),
  ).rejects.toMatchObject({ code: 'wallet_provider_unavailable' });
  expect(work).not.toHaveBeenCalled();
});
it('prefers responsive RPCs, spills concurrent work to the alternate, probes stale providers and retains throttle backoff', async () => {
  vi.useFakeTimers();
  const transport = vi.fn() as unknown as typeof fetch;
  const fast = rpcCapacity(transport, endpoints[0]),
    slow = rpcCapacity(transport, endpoints[1]);
  fast.recordReadSuccess(100);
  slow.recordReadSuccess(400);
  const pool = new RpcEndpointPool(endpoints, transport, true);
  for (let i = 0; i < 5; i++)
    expect(await pool.run(async (url) => url)).toBe(endpoints[0]);
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const seen: string[] = [];
  const running = Array.from({ length: 5 }, () =>
    pool.run(async (url) => {
      seen.push(url);
      await gate;
    }),
  );
  await Promise.resolve();
  expect(seen.filter((url) => url === endpoints[1]).length).toBeGreaterThan(0);
  release();
  await Promise.all(running);
  await vi.advanceTimersByTimeAsync(31000);
  fast.recordReadSuccess(100);
  expect(await pool.run(async (url) => url)).toBe(endpoints[1]);
  slow.retryAfter = Date.now() + 60000;
  expect(await pool.run(async (url) => url)).toBe(endpoints[0]);
});

it('uses aggregate read pressure across independently owned preparation and observation pools', async () => {
  const transport = vi.fn() as unknown as typeof fetch;
  const fast = rpcCapacity(transport, endpoints[0]),
    alternate = rpcCapacity(transport, endpoints[1]);
  fast.recordReadSuccess(100);
  alternate.recordReadSuccess(150);
  const observation = new RpcEndpointPool(endpoints, transport, true);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const preparing = Array.from({ length: 8 }, () => fast.run(async () => gate));
  try {
    expect(fast.readPressure).toBe(8);
    expect(await observation.run(async (endpoint) => endpoint)).toBe(
      endpoints[1],
    );
    alternate.recordReadSuccess(3000);
    expect(await observation.run(async (endpoint) => endpoint)).toBe(
      endpoints[0],
    );
  } finally {
    release();
    await Promise.all(preparing);
  }
  expect(fast.readPressure).toBe(0);
  expect(await observation.run(async (endpoint) => endpoint)).toBe(
    endpoints[0],
  );
});

it('remembers a provider capability failure without excluding its supported reads', async () => {
  const transport = vi.fn() as unknown as typeof fetch;
  const pool = new RpcEndpointPool(endpoints, transport);
  const seen: string[] = [];
  expect(
    await pool.run(
      async (url) => {
        seen.push(url);
        if (url === endpoints[0]) {
          rpcCapacity(transport, url).unsupportedFor('state-overrides');
          throw new WalletProviderError('wallet_provider_unavailable');
        }
        return url;
      },
      ['state-overrides'],
    ),
  ).toBe(endpoints[1]);
  expect(seen).toEqual(endpoints);
  expect(await pool.run(async (url) => url, ['state-overrides'])).toBe(
    endpoints[1],
  );
  expect(await pool.run(async (url) => url)).toBe(endpoints[0]);
});

it('classifies dRPC state override routing rejection without disabling ordinary RPC reads', async () => {
  const transport = vi.fn(
    async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return body.params.length === 3
        ? Response.json(
            {
              jsonrpc: '2.0',
              id: 1,
              error: {
                code: 12,
                message: "Can't route your request to suitable provider",
              },
            },
            { status: 400 },
          )
        : Response.json({ jsonrpc: '2.0', id: 1, result: '0x14a34' });
    },
  );
  const reader = new RpcReader(
    endpoints[0],
    transport,
    4,
    true,
    'endpoint-failover',
  );
  await expect(reader.call('eth_call', [{}, 'latest', {}])).rejects.toThrow();
  expect(rpcCapacity(transport, endpoints[0]).supports('state-overrides')).toBe(
    false,
  );
  expect(rpcCapacity(transport, endpoints[0]).retryAfter).toBe(0);
  expect(await reader.call('eth_chainId', [])).toBe('0x14a34');
});

it('routes current reads using the capacity ahead of historical waiters while retaining historical load balancing', async () => {
  const transport = vi.fn(async () =>
    Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' }),
  );
  const primary = rpcCapacity(transport, endpoints[0]);
  const secondary = rpcCapacity(transport, endpoints[1]);
  primary.recordReadSuccess(100);
  secondary.recordReadSuccess(200);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const historical = runWithBackgroundRpcReads(() =>
    Promise.all(Array.from({ length: 16 }, () => primary.run(() => gate))),
  );
  const pool = new RpcEndpointPool(endpoints, transport, true);
  try {
    await expect(pool.run(async (endpoint) => endpoint)).resolves.toBe(
      endpoints[0],
    );
    await expect(
      runWithBackgroundRpcReads(() => pool.run(async (endpoint) => endpoint)),
    ).resolves.toBe(endpoints[1]);
  } finally {
    release();
    await historical;
  }
});

it('excludes queued historical proof jobs from current endpoint selection while retaining their own load accounting', async () => {
  const transport = vi.fn(async () =>
    Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' }),
  );
  rpcCapacity(transport, endpoints[0]).recordReadSuccess(100);
  const secondary = rpcCapacity(transport, endpoints[1]);
  secondary.recordReadSuccess(200);
  secondary.unsupportedFor('historical-proof');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pool = new RpcEndpointPool(endpoints, transport, true);
  const historical = runWithBackgroundRpcReads(() =>
    Promise.all(
      Array.from({ length: 16 }, () =>
        pool.run(
          (endpoint) => rpcCapacity(transport, endpoint).run(() => gate),
          ['historical-proof'],
        ),
      ),
    ),
  );
  try {
    await expect(pool.run(async (endpoint) => endpoint)).resolves.toBe(
      endpoints[0],
    );
    await expect(
      runWithBackgroundRpcReads(() => pool.run(async (endpoint) => endpoint)),
    ).resolves.toBe(endpoints[1]);
  } finally {
    release();
    await historical;
  }
});
