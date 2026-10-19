import { afterEach, expect, it, vi } from 'vitest';
import { RpcReader } from '../src/execution/chain.js';
afterEach(() => vi.useRealTimers());
const success = () => Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' });

it('serializes RPC reads without retrying successful requests', async () => {
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
    return success();
  });
  const reader = new RpcReader('https://rpc.example.test', request);
  const first = reader.call('eth_chainId', []),
    second = reader.call('eth_getBalance', []);
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  release();
  expect(await Promise.all([first, second])).toEqual(['0x1', '0x1']);
  expect(maximum).toBe(1);
  expect(request).toHaveBeenCalledTimes(2);
});
it('retries throttled read-only requests within a bounded backoff', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('private upstream detail', { status: 429 }),
    )
    .mockImplementation(async () => success());
  const reader = new RpcReader('https://rpc.example.test', request);
  const assertion = expect(reader.call('eth_chainId', [])).resolves.toBe('0x1');
  await vi.runAllTimersAsync();
  await assertion;
  expect(request).toHaveBeenCalledTimes(2);
});
it('stops after three throttled reads and withholds upstream details', async () => {
  const request = vi.fn(
    async () =>
      new Response('private upstream detail', {
        status: 429,
        headers: { 'retry-after': '0' },
      }),
  );
  const reader = new RpcReader('https://rpc.example.test', request);
  await expect(reader.call('eth_chainId', [])).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
    outcome: 'unknown',
  });
  expect(request).toHaveBeenCalledTimes(3);
});
it('honors a long server backoff without waiting on or repeating the request', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('', { status: 429, headers: { 'retry-after': '60' } }),
    )
    .mockImplementation(async () => success());
  const reader = new RpcReader('https://rpc.example.test', request);
  await expect(reader.call('eth_chainId', [])).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
  await expect(reader.call('eth_chainId', [])).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
  expect(request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  await expect(reader.call('eth_chainId', [])).resolves.toBe('0x1');
});
it('never sends or retries a financial RPC method', async () => {
  const request = vi.fn(async () => success());
  const reader = new RpcReader('https://rpc.example.test', request);
  await expect(
    reader.call('eth_sendRawTransaction' as never, []),
  ).rejects.toMatchObject({ code: 'wallet_provider_input' });
  expect(request).not.toHaveBeenCalled();
});

it('retains the exact parameters captured before a queued read', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const observed: unknown[][] = [];
  const request: typeof fetch = async (_input, init) => {
    observed.push(JSON.parse(String(init?.body)).params);
    await gate;
    return success();
  };
  const reader = new RpcReader('https://rpc.example.test', request);
  const first = reader.call('eth_chainId', []);
  const params = ['0x1', 'latest'];
  const second = reader.call('eth_getBalance', params);
  params[0] = '0x2';
  release();
  await Promise.all([first, second]);
  expect(observed[1]).toEqual(['0x1', 'latest']);
});
