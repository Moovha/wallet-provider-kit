import { afterEach, expect, it, vi } from 'vitest';
import { createBundlerRpc } from '../scripts/bundler-rpc.mjs';
const config = {
  rpcUrls: ['https://one.example.test', 'https://two.example.test'],
  chainId: '0x14a34',
  genesisHash: '0x' + '1'.repeat(64),
};
const body = (
  id: number,
  method = 'eth_getBalance',
  params: unknown[] = ['0x1234', 'latest'],
) => ({ jsonrpc: '2.0' as const, id, method, params });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture(
  effect?: (
    url: string,
    b: ReturnType<typeof body>,
  ) => Promise<Response> | Response,
) {
  const calls: { endpoint: string; method: string; params: unknown[] }[] = [];
  const request = vi.fn(async (url, init) => {
    const b = JSON.parse(String(init?.body));
    const endpoint = String(url);
    calls.push({ endpoint, method: b.method, params: b.params });
    if (b.method === 'eth_chainId')
      return Response.json({
        jsonrpc: '2.0',
        id: b.id,
        result: config.chainId,
      });
    if (b.method === 'eth_getBlockByNumber' && b.params[0] === '0x0')
      return Response.json({
        jsonrpc: '2.0',
        id: b.id,
        result: { hash: config.genesisHash },
      });
    return effect
      ? effect(endpoint, b)
      : Response.json({ jsonrpc: '2.0', id: b.id, result: '0x1' });
  }) as typeof fetch;
  return { calls, rpc: createBundlerRpc(() => config, request) };
}
it('distributes concurrent reads across verified supplied endpoints and coalesces identical overlapping reads with caller IDs', async () => {
  vi.spyOn(performance, 'now').mockReturnValue(1);
  const f = fixture();
  await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      f.rpc(body(i + 1, 'eth_getBalance', ['0x' + i.toString(16), 'latest'])),
    ),
  );
  expect(
    f.calls.filter((c) => c.method === 'eth_getBalance').map((c) => c.endpoint),
  ).toEqual([
    config.rpcUrls[0],
    config.rpcUrls[1],
    config.rpcUrls[0],
    config.rpcUrls[1],
  ]);
  const replies = await Promise.all([f.rpc(body(5)), f.rpc(body(6))]);
  expect(replies.map((r) => r.id)).toEqual([5, 6]);
  expect(f.calls.filter((c) => c.method === 'eth_getBalance')).toHaveLength(5);
});
it('uses background reads to probe an idle source without assigning a critical read solely for probing', async () => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockReturnValue(1);
  const f = fixture();
  await f.rpc(body(1));
  await vi.advanceTimersByTimeAsync(10001);
  await f.rpc(body(2));
  expect(
    f.calls.filter((c) => c.method === 'eth_getBalance').map((c) => c.endpoint),
  ).toEqual([config.rpcUrls[0], config.rpcUrls[0]]);
  await f.rpc(body(3, 'eth_blockNumber', []));
  expect(f.calls.find((c) => c.method === 'eth_blockNumber')?.endpoint).toBe(
    config.rpcUrls[1],
  );
});
it('refreshes shared head data after its short feed window and never shares broadcasts', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.rpc(body(1, 'eth_blockNumber', []));
  await f.rpc(body(2, 'eth_blockNumber', []));
  expect(f.calls.filter((c) => c.method === 'eth_blockNumber')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(251);
  await f.rpc(body(3, 'eth_blockNumber', []));
  expect(f.calls.filter((c) => c.method === 'eth_blockNumber')).toHaveLength(2);
  await Promise.all([
    f.rpc(body(4, 'eth_sendRawTransaction', ['0x1234'])),
    f.rpc(body(5, 'eth_sendRawTransaction', ['0x1234'])),
  ]);
  expect(
    f.calls.filter((c) => c.method === 'eth_sendRawTransaction'),
  ).toHaveLength(2);
});
it('fails over read transport loss while a lost broadcast has exactly one dispatch', async () => {
  const f = fixture((url, b) => {
    if (url === config.rpcUrls[0]) throw Error('private transport detail');
    return Response.json({ jsonrpc: '2.0', id: b.id, result: '0x1' });
  });
  expect((await f.rpc(body(1))).result).toBe('0x1');
  const mutation = fixture(() => {
    throw Error('lost reply');
  });
  await expect(
    mutation.rpc(body(2, 'eth_sendRawTransaction', ['0x1234'])),
  ).rejects.toThrow('lost reply');
  expect(
    mutation.calls.filter((c) => c.method === 'eth_sendRawTransaction'),
  ).toHaveLength(1);
});
it('routes unsupported state overrides elsewhere without retrying deterministic EVM errors', async () => {
  const f = fixture((url, b) =>
    Response.json({
      jsonrpc: '2.0',
      id: b.id,
      ...(url === config.rpcUrls[0]
        ? { error: { code: -32602, message: 'overrides unavailable' } }
        : { result: '0x1' }),
    }),
  );
  const params = [{ to: '0x1234' }, 'latest', { '0x5678': { code: '0x00' } }];
  expect((await f.rpc(body(1, 'eth_call', params))).result).toBe('0x1');
  expect((await f.rpc(body(2, 'eth_call', params))).result).toBe('0x1');
  expect(
    f.calls.filter(
      (c) => c.method === 'eth_call' && c.endpoint === config.rpcUrls[0],
    ),
  ).toHaveLength(1);
  const revert = fixture((_url, b) =>
    Response.json({
      jsonrpc: '2.0',
      id: b.id,
      error: { code: -32000, message: 'execution reverted' },
    }),
  );
  expect(await revert.rpc(body(3, 'eth_call', params))).toMatchObject({
    error: { code: -32000 },
  });
  expect(revert.calls.filter((c) => c.method === 'eth_call')).toHaveLength(1);
});
it('learns a routing capability rejection from an HTTP 400 response and keeps ordinary reads available', async () => {
  const f = fixture((url, b) =>
    Response.json(
      {
        jsonrpc: '2.0',
        id: b.id,
        ...(url === config.rpcUrls[0] && b.method === 'eth_call'
          ? {
              error: {
                code: 12,
                message: "Can't route your request to suitable provider",
              },
            }
          : { result: '0x1' }),
      },
      {
        status:
          url === config.rpcUrls[0] && b.method === 'eth_call' ? 400 : 200,
      },
    ),
  );
  const params = [{ to: '0x1234' }, 'latest', { '0x5678': { code: '0x00' } }];
  expect((await f.rpc(body(1, 'eth_call', params))).result).toBe('0x1');
  expect((await f.rpc(body(2, 'eth_call', params))).result).toBe('0x1');
  expect(
    f.calls.filter(
      (c) => c.endpoint === config.rpcUrls[0] && c.method === 'eth_call',
    ),
  ).toHaveLength(1);
  await f.rpc(body(3));
  expect(f.calls.filter((c) => c.method === 'eth_getBalance')).toHaveLength(1);
});
it('shares the first override capability result across different concurrent requests and retries positive gateway errors only for reads', async () => {
  const f = fixture(async (url, b) => {
    if (url === config.rpcUrls[0] && b.method === 'eth_call') {
      await new Promise((r) => setTimeout(r, 10));
      return Response.json(
        {
          jsonrpc: '2.0',
          id: b.id,
          error: {
            code: 12,
            message: "Can't route your request to suitable provider",
          },
        },
        { status: 400 },
      );
    }
    return Response.json({ jsonrpc: '2.0', id: b.id, result: '0x1' });
  });
  const replies = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      f.rpc(
        body(i, 'eth_call', [
          { to: '0x1234', data: '0x' + i.toString(16).padStart(2, '0') },
          'latest',
          { '0x5678': { code: '0x00' } },
        ]),
      ),
    ),
  );
  expect(replies.every((r) => r.result === '0x1')).toBe(true);
  expect(
    f.calls.filter(
      (c) => c.endpoint === config.rpcUrls[0] && c.method === 'eth_call',
    ),
  ).toHaveLength(1);
  const gateway = fixture((url, b) =>
    Response.json(
      {
        jsonrpc: '2.0',
        id: b.id,
        ...(url === config.rpcUrls[0]
          ? { error: { code: 35, message: 'Provider service restriction' } }
          : { result: [] }),
      },
      { status: url === config.rpcUrls[0] ? 400 : 200 },
    ),
  );
  expect((await gateway.rpc(body(1, 'eth_getLogs', [{}]))).result).toEqual([]);
  const mutation = fixture((_url, b) =>
    Response.json(
      {
        jsonrpc: '2.0',
        id: b.id,
        error: { code: 35, message: 'Provider service restriction' },
      },
      { status: 400 },
    ),
  );
  expect(
    await mutation.rpc(body(2, 'eth_sendRawTransaction', ['0x1234'])),
  ).toMatchObject({ error: { code: 35 } });
  expect(
    mutation.calls.filter((c) => c.method === 'eth_sendRawTransaction'),
  ).toHaveLength(1);
});
it('fails closed on a supplied endpoint from the wrong chain before any user read or write', async () => {
  const calls: string[] = [];
  const request = (async (_url, init) => {
    const b = JSON.parse(String(init?.body));
    calls.push(b.method);
    return Response.json({
      jsonrpc: '2.0',
      id: b.id,
      result: b.method === 'eth_chainId' ? '0x1' : { hash: config.genesisHash },
    });
  }) as typeof fetch;
  const rpc = createBundlerRpc(() => config, request);
  await expect(
    rpc(body(1, 'eth_sendRawTransaction', ['0x1234'])),
  ).rejects.toThrow('identity mismatch');
  expect(calls).not.toContain('eth_sendRawTransaction');
});
it('bounds concurrent endpoint reads and releases queued work after completion', async () => {
  let active = 0,
    maximum = 0,
    blocking = false;
  const releases: (() => void)[] = [];
  const f = fixture(async (_url, b) => {
    if (!blocking)
      return Response.json({ jsonrpc: '2.0', id: b.id, result: '0x1' });
    active++;
    maximum = Math.max(maximum, active);
    await new Promise<void>((r) => releases.push(r));
    active--;
    return Response.json({ jsonrpc: '2.0', id: b.id, result: '0x1' });
  });
  await Promise.all([
    f.rpc(body(100, 'eth_getBalance', ['0x100', 'latest'])),
    f.rpc(body(101, 'eth_getBalance', ['0x101', 'latest'])),
  ]);
  blocking = true;
  const tasks = Array.from({ length: 24 }, (_, i) =>
    f.rpc(body(i, 'eth_getBalance', ['0x' + i.toString(16), 'latest'])),
  );
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 1));
  expect(maximum).toBe(16);
  while (releases.length) {
    releases.splice(0).forEach((r) => r());
    await new Promise((r) => setTimeout(r, 1));
  }
  await Promise.all(tasks);
  expect(maximum).toBe(16);
});
