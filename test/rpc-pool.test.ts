import { afterEach, expect, it, vi } from 'vitest';
import { RpcEndpointPool } from '../src/execution/rpc-pool.js';
import { RpcReader } from '../src/execution/chain.js';
import { rpcCapacity } from '../src/execution/rpc-capacity.js';
import { WalletProviderError } from '../src/domain/signing.js';
import { SingleRpcExecutionObserver } from '../src/execution/single-rpc.js';
import { executionFixture } from './helpers/execution.js';
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
it('labels one-provider receipts honestly and rotates independent complete observations', async () => {
  const f = executionFixture(),
    plan = await f.plan();
  f.state.included = true;
  const used: string[] = [];
  const transport = (async (input, init) => {
    used.push(String(input));
    return f.request(input, init);
  }) as typeof fetch;
  const observer = new SingleRpcExecutionObserver(
    endpoints,
    f.configuration.rpc.genesisHash,
    10000,
    transport,
  );
  expect(
    await observer.observe(plan, [f.transactionHash], f.transactionHash),
  ).toMatchObject({ verification: 'rpc-single', outcome: 'succeeded' });
  expect(new Set(used)).toEqual(new Set([endpoints[0]]));
  used.length = 0;
  expect(
    await observer.observe(plan, [f.transactionHash], f.transactionHash),
  ).toMatchObject({ verification: 'rpc-single', outcome: 'succeeded' });
  expect(new Set(used)).toEqual(new Set([endpoints[1]]));
});
it.each([429, 503, 'timeout'] as const)(
  'restarts a single-source observation on the alternate RPC after %s',
  async (failure) => {
    vi.useFakeTimers();
    const f = executionFixture(),
      plan = await f.plan();
    f.state.included = true;
    const transport = (async (input, init) => {
      if (String(input) !== endpoints[0]) return f.request(input, init);
      if (failure === 'timeout')
        throw new DOMException('Timed out', 'TimeoutError');
      return new Response('', {
        status: failure,
        headers: { 'retry-after': '60' },
      });
    }) as typeof fetch;
    const observer = new SingleRpcExecutionObserver(
      endpoints,
      f.configuration.rpc.genesisHash,
      10000,
      transport,
    );
    const result = expect(
      observer.observe(plan, [f.transactionHash], f.transactionHash),
    ).resolves.toMatchObject({
      verification: 'rpc-single',
      outcome: 'succeeded',
    });
    await vi.runAllTimersAsync();
    await result;
  },
);
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
it.each(['short throttle', 'internal error'] as const)(
  'fails over an optimized complete proof after %s without sleeping or retrying the affected endpoint',
  async (failure) => {
    vi.useFakeTimers();
    const f = executionFixture(),
      plan = await f.plan();
    f.state.included = true;
    let failedReads = 0;
    const transport = (async (input, init) => {
      if (String(input) !== endpoints[0]) return f.request(input, init);
      failedReads++;
      return failure === 'short throttle'
        ? new Response('', { status: 429, headers: { 'retry-after': '1' } })
        : Response.json({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32603, message: 'Offline unavailable' },
          });
    }) as typeof fetch;
    const observer = new SingleRpcExecutionObserver(
      endpoints,
      f.configuration.rpc.genesisHash,
      10000,
      transport,
      undefined,
      true,
    );
    const started = Date.now();
    await expect(
      observer.observe(plan, [f.transactionHash], f.transactionHash),
    ).resolves.toMatchObject({
      verification: 'rpc-single',
      outcome: 'succeeded',
    });
    expect(Date.now()).toBe(started);
    expect(failedReads).toBeGreaterThan(0);
    expect(failedReads).toBeLessThanOrEqual(4);
    expect(rpcCapacity(transport, endpoints[0]).retryAfter).toBeGreaterThan(
      Date.now(),
    );
    await vi.runAllTimersAsync();
  },
);
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
