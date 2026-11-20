import { afterEach, expect, it, vi } from 'vitest';
import { UniswapXTransport } from '../src/orders/transport.js';
const hash = '0x' + 'aa'.repeat(32),
  signature = '0x' + '11'.repeat(65);
afterEach(() => vi.useRealTimers());
it('accepts only fixed-endpoint 201 responses and makes no retry on ambiguity', async () => {
  const send = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify({ orderId: hash, orderStatus: 'filled' }), {
        status: 201,
      }),
  );
  const transport = new UniswapXTransport(
    () => 'offline-placeholder-key',
    send,
  );
  expect(await transport.post({}, signature, hash)).toEqual({
    status: 'filled',
  });
  expect(send.mock.calls[0][0]).toBe(
    'https://trade-api.gateway.uniswap.org/v1/order',
  );
  expect(send.mock.calls[0][1]?.redirect).toBe('error');
  send.mockRejectedValue(new Error('response lost'));
  await expect(transport.post({}, signature, hash)).rejects.toMatchObject({
    outcome: 'unknown',
  });
  expect(send).toHaveBeenCalledTimes(2);
});
it('bounds a transport that ignores abort', async () => {
  vi.useFakeTimers();
  const send = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const promise = new UniswapXTransport(
    () => 'offline-placeholder-key',
    send,
  ).post({}, signature, hash);
  const check = expect(promise).rejects.toMatchObject({ outcome: 'unknown' });
  await vi.advanceTimersByTimeAsync(8001);
  await check;
  expect(send).toHaveBeenCalledTimes(1);
});
it('fails missing credentials without sending or exposing credential errors', async () => {
  const send = vi.fn<typeof fetch>();
  await expect(
    new UniswapXTransport(() => '', send).post({}, signature, hash),
  ).rejects.toThrow('wallet_provider_unavailable');
  expect(send).not.toHaveBeenCalled();
});
