import { afterEach, expect, it, vi } from 'vitest';
import { waitForObservation } from '../src/execution/read-observation.js';

afterEach(() => vi.useRealTimers());

it('returns a completed observation without waiting for the read budget', async () => {
  await expect(waitForObservation(Promise.resolve())).resolves.toBe(true);
});

it('bounds the wait without cancelling observation or leaking a later rejection', async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  const refresh = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  const read = waitForObservation(refresh);
  await vi.advanceTimersByTimeAsync(250);
  await expect(read).resolves.toBe(false);
  reject(new Error('Offline RPC unavailable'));
  await vi.runAllTimersAsync();
});

it('preserves failures detected before the read budget expires', async () => {
  await expect(
    waitForObservation(Promise.reject(new Error('integrity'))),
  ).rejects.toThrow('integrity');
});
