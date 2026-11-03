import { afterEach, expect, it, vi } from 'vitest';
import {
  UsdZarFxReader,
  fiatMinimumOutput,
  validUsdZarSnapshot,
} from '../src/orders/usd-zar-fx.js';
const now = 1790000000;
const snapshot = {
  source: 'exchangerate-api-open' as const,
  numerator: '16613417',
  denominator: '1000000',
  updatedAt: now - 100,
  fetchedAt: now,
};
const body = () => ({
  result: 'success',
  base_code: 'USD',
  rates: { USD: 1, ZAR: 16.613417 },
  time_last_update_unix: now - 100,
  time_next_update_unix: now + 86300,
});
afterEach(() => vi.useRealTimers());
it('rounds the net 90% floor outward with token decimals in either direction', () => {
  expect(
    fiatMinimumOutput('333890000000000000000', 'zar-to-usd', snapshot, 1000),
  ).toEqual({
    referenceAmountOutUnits: '20097612',
    minimumRequiredOutUnits: '18087851',
  });
  expect(
    fiatMinimumOutput('1000000', 'usd-to-zar', snapshot, 1000)
      .minimumRequiredOutUnits,
  ).toBe('14952075300000000000');
  expect(
    fiatMinimumOutput('1', 'zar-to-usd', snapshot, 1000)
      .minimumRequiredOutUnits,
  ).toBe('1');
});
it('coalesces concurrent refreshes, returns isolated copies, expires cached rates and never falls back after an outage', async () => {
  let clock = now;
  const send = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(body())));
  const reader = new UsdZarFxReader({ fetch: send, now: () => clock });
  const [first, second] = await Promise.all([reader.get(), reader.get()]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(first).toEqual(snapshot);
  first!.numerator = '1';
  expect(second!.numerator).toBe(snapshot.numerator);
  expect((await reader.get())!.numerator).toBe(snapshot.numerator);
  clock += 3600;
  send.mockRejectedValue(new Error('offline'));
  expect(await reader.get()).toBeNull();
  expect(await reader.get()).toBeNull();
  expect(send).toHaveBeenCalledTimes(2);
  clock += 30;
  expect(await reader.get()).toBeNull();
  expect(send).toHaveBeenCalledTimes(3);
});
it.each([
  'stale',
  'future',
  'wrong base',
  'wrong USD',
  'zero',
  'negative',
  'missing source time',
  'bad next update',
  'oversized',
])('rejects %s feed data', async (kind) => {
  const data = body();
  if (kind === 'stale') data.time_last_update_unix = now - 129600;
  if (kind === 'future') data.time_last_update_unix = now + 1;
  if (kind === 'wrong base') data.base_code = 'ZAR';
  if (kind === 'wrong USD') data.rates.USD = 2;
  if (kind === 'zero') data.rates.ZAR = 0;
  if (kind === 'negative') data.rates.ZAR = -16;
  if (kind === 'missing source time')
    delete (data as Partial<typeof data>).time_last_update_unix;
  if (kind === 'bad next update')
    data.time_next_update_unix = data.time_last_update_unix;
  const send = vi.fn<typeof fetch>(
    async () =>
      new Response(
        kind === 'oversized' ? ' '.repeat(65537) : JSON.stringify(data),
      ),
  );
  expect(
    await new UsdZarFxReader({ fetch: send, now: () => now }).get(),
  ).toBeNull();
});
it('bounds ignored-abort timeouts and cannot cache late responses', async () => {
  vi.useFakeTimers();
  let resolve!: (r: Response) => void;
  const send = vi.fn<typeof fetch>(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const reader = new UsdZarFxReader({ fetch: send, now: () => now });
  const pending = reader.get();
  await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toBeNull();
  resolve(new Response(JSON.stringify(body())));
  await vi.advanceTimersByTimeAsync(0);
  expect(await reader.get()).toBeNull();
});
it('rejects expired, future-fetched and malformed internal snapshots', () => {
  expect(validUsdZarSnapshot({ ...snapshot, fetchedAt: now + 1 }, now)).toBe(
    false,
  );
  expect(validUsdZarSnapshot({ ...snapshot, denominator: '0' }, now)).toBe(
    false,
  );
  expect(validUsdZarSnapshot(snapshot, now + 3600)).toBe(false);
});
