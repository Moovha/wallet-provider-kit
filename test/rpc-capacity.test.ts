import { afterEach, expect, it, vi } from 'vitest';
import { RpcCapacity } from '../src/execution/rpc-capacity.js';
import { RpcReader } from '../src/execution/chain.js';
afterEach(() => vi.useRealTimers());

it('bounds requests waiting inside an application reader before endpoint admission', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = vi.fn(async () => {
    await gate;
    return Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' });
  });
  const reader = new RpcReader('https://offline.example.test', request, 4);
  const calls = Array.from({ length: 64 }, () =>
    reader.call('eth_chainId', []),
  );
  await expect(reader.call('eth_chainId', [])).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
  release();
  await expect(Promise.all(calls)).resolves.toHaveLength(64);
  await expect(reader.call('eth_chainId', [])).resolves.toBe('0x1');
});

it('shares the endpoint concurrency ceiling across independent application readers', async () => {
  let active = 0,
    maximum = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = vi.fn(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await gate;
    active--;
    return Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' });
  });
  const readers = Array.from(
    { length: 3 },
    () => new RpcReader('https://offline.example.test', request, 4),
  );
  const reads = readers.flatMap((reader) =>
    Array.from({ length: 4 }, () => reader.call('eth_chainId', [])),
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(8);
  release();
  await expect(Promise.all(reads)).resolves.toHaveLength(12);
  expect(maximum).toBe(8);
});

it('bounds queued work, expires waiting requests and restores capacity after a stalled burst', async () => {
  vi.useFakeTimers();
  const capacity = new RpcCapacity();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const active = Array.from({ length: 8 }, () => capacity.run(() => gate));
  const waiting = Promise.allSettled(
    Array.from({ length: 64 }, () => capacity.run(() => Promise.resolve())),
  );
  await expect(capacity.run(() => Promise.resolve())).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
  await vi.advanceTimersByTimeAsync(3000);
  expect((await waiting).every((r) => r.status === 'rejected')).toBe(true);
  release();
  await Promise.all(active);
  await expect(capacity.run(() => Promise.resolve('recovered'))).resolves.toBe(
    'recovered',
  );
});

it('applies a shared server backoff to requests already waiting for endpoint capacity', async () => {
  const releases: ((response: Response) => void)[] = [];
  const request = vi.fn(
    () => new Promise<Response>((resolve) => releases.push(resolve)),
  );
  const readers = Array.from(
    { length: 3 },
    () => new RpcReader('https://offline.example.test', request, 4),
  );
  const calls = readers.flatMap((reader) =>
    Array.from({ length: 4 }, () => reader.call('eth_chainId', [])),
  );
  const completed = Promise.allSettled(calls);
  await Promise.resolve();
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(8);
  releases[0](
    new Response('', { status: 429, headers: { 'retry-after': '60' } }),
  );
  await expect(calls[0]).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
  for (const release of releases.slice(1))
    release(Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' }));
  const results = await completed;
  expect(request).toHaveBeenCalledTimes(8);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5);
});

it('backs off a persistently failing endpoint and resets the failure window after recovery time', () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const capacity = new RpcCapacity();
  const delays = [];
  for (let i = 0; i < 7; i++) {
    capacity.recordReadFailure();
    delays.push(capacity.retryAfter - Date.now());
  }
  expect(delays).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  vi.setSystemTime(131000);
  capacity.recordReadFailure();
  expect(capacity.retryAfter - Date.now()).toBe(1000);
});
it('bounds immutable genesis reuse by endpoint, expected pin, expiry and availability failure', async () => {
  vi.useFakeTimers();
  const capacity = new RpcCapacity(),
    check = vi.fn(async () => {});
  await Promise.all([
    capacity.verifyGenesis('base', check),
    capacity.verifyGenesis('base', check),
  ]);
  expect(check).toHaveBeenCalledTimes(1);
  await capacity.verifyGenesis('base', check);
  expect(check).toHaveBeenCalledTimes(1);
  await capacity.verifyGenesis('other-network', check);
  expect(check).toHaveBeenCalledTimes(2);
  await capacity.verifyGenesis('base', check);
  expect(check).toHaveBeenCalledTimes(3);
  capacity.recordReadFailure();
  await capacity.verifyGenesis('base', check);
  expect(check).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(60001);
  await capacity.verifyGenesis('base', check);
  expect(check).toHaveBeenCalledTimes(5);
  capacity.invalidateGenesis();
  const failed = vi.fn(async () => {
    throw new Error('offline');
  });
  await expect(capacity.verifyGenesis('base', failed)).rejects.toThrow();
  await expect(capacity.verifyGenesis('base', failed)).rejects.toThrow();
  expect(failed).toHaveBeenCalledTimes(2);
});

it('shares head feed and capacity through independently bound user transport wrappers', async () => {
  const { bindRpcTransport, rpcCapacity } =
    await import('../src/execution/rpc-capacity.js');
  const request = vi.fn(async () =>
    Response.json({
      jsonrpc: '2.0',
      id: 1,
      result: { number: '0x64', hash: '0x' + 'b'.repeat(64) },
    }),
  );
  const wrappers = Array.from({ length: 10 }, () => {
    const wrapper: typeof fetch = (...args) => request();
    bindRpcTransport(wrapper, request);
    return wrapper;
  });
  const readers = wrappers.map(
    (w) =>
      new RpcReader(
        'https://offline.example.test',
        w,
        4,
        true,
        'endpoint-failover',
      ),
  );
  const heads = await Promise.all(
    readers.map((r) => r.feed('eth_getBlockByNumber', ['latest', false])),
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(heads).toHaveLength(10);
  for (const wrapper of wrappers)
    expect(rpcCapacity(wrapper, 'https://offline.example.test')).toBe(
      rpcCapacity(request, 'https://offline.example.test'),
    );
  await readers[0].feed('eth_getBlockByNumber', ['latest', false]);
  expect(request).toHaveBeenCalledTimes(1);
});
