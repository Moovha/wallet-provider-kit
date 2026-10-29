import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  FundingMonitor,
  fundingRecoveryIntervalMs,
} from '../src/sponsorship/funding-monitor.js';
let monitor: FundingMonitor;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
});
afterEach(async () => {
  await monitor?.close();
  vi.useRealTimers();
});
const full = {
  deposit: 100n,
  executor: 100n,
  depositTarget: 100n,
  executorTarget: 100n,
};
it('checks once at startup and once per fifteen minutes, never every ten seconds', async () => {
  const work = vi.fn().mockResolvedValue(undefined);
  monitor = new FundingMonitor(async () => ['a', 'b', 'a'], work);
  monitor.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(work.mock.calls.map((v) => v[0])).toEqual(['a', 'b']);
  await vi.advanceTimersByTimeAsync(10000);
  expect(work).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(fundingRecoveryIntervalMs - 10000);
  expect(work).toHaveBeenCalledTimes(4);
  await monitor.close();
  await vi.advanceTimersByTimeAsync(fundingRecoveryIntervalMs);
  expect(work).toHaveBeenCalledTimes(4);
});
it('uses receipt costs only as refill hints, deduplicates observations and isolates applications', async () => {
  const work = vi.fn().mockResolvedValue(undefined);
  monitor = new FundingMonitor(async () => [], work);
  monitor.start();
  monitor.observed('a', full);
  monitor.observed('b', full);
  for (let i = 0; i < 5; i++) {
    monitor.spent('a', String(i), 'tx', 10n);
    monitor.spent('a', String(i), 'tx', 10n);
  }
  await vi.advanceTimersByTimeAsync(500);
  expect(work).not.toHaveBeenCalled();
  monitor.spent('a', 'next', 'tx', 10n);
  monitor.spent('a', 'last', 'tx', 10n);
  await vi.advanceTimersByTimeAsync(250);
  expect(work).toHaveBeenCalledExactlyOnceWith('a', false);
  monitor.spent('b', 'small', 'other', 1n);
  await vi.advanceTimersByTimeAsync(250);
  expect(work).toHaveBeenCalledTimes(1);
});
it('shares concurrent checks and upgrades a running background check for an urgent admission', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const work = vi
    .fn()
    .mockImplementationOnce(() => gate)
    .mockResolvedValue(undefined);
  monitor = new FundingMonitor(async () => [], work);
  const first = monitor.check('a');
  await Promise.resolve();
  const urgent = monitor.check('a', true);
  expect(urgent).toBe(first);
  release();
  await urgent;
  expect(work.mock.calls).toEqual([
    ['a', false],
    ['a', true],
  ]);
});
it('refreshes insufficient admission funding immediately and leaves healthy admissions alone', async () => {
  const work = vi.fn().mockResolvedValue(undefined);
  monitor = new FundingMonitor(async () => [], work);
  monitor.observed('a', full);
  expect(await monitor.beforeAdmission('a', 80n, 10n, 100n)).toBe(false);
  expect(work).not.toHaveBeenCalled();
  expect(await monitor.beforeAdmission('a', 80n, 90n, 100n)).toBe(true);
  expect(work).toHaveBeenCalledExactlyOnceWith('a', true);
});
it('propagates failed urgent checks and contains background failures', async () => {
  const work = vi.fn().mockRejectedValue(new Error('unavailable'));
  monitor = new FundingMonitor(async () => ['a'], work);
  monitor.start();
  await vi.advanceTimersByTimeAsync(0);
  await expect(monitor.beforeAdmission('a', 0n, 1n, 100n)).rejects.toThrow(
    'unavailable',
  );
  await vi.advanceTimersByTimeAsync(fundingRecoveryIntervalMs);
  expect(work).toHaveBeenCalledTimes(3);
});
it('reconciles reorged or unknown balances without adding estimated money back', async () => {
  const work = vi.fn().mockResolvedValue(undefined);
  monitor = new FundingMonitor(async () => [], work);
  monitor.start();
  monitor.observed('a', full);
  monitor.invalidate('a');
  await vi.advanceTimersByTimeAsync(250);
  expect(work).toHaveBeenCalledExactlyOnceWith('a', false);
});
it('bounds activity-triggered retries and does not keep stopped timers alive', async () => {
  const work = vi.fn().mockResolvedValue(undefined);
  monitor = new FundingMonitor(async () => [], work);
  monitor.start();
  monitor.invalidate('a');
  await vi.advanceTimersByTimeAsync(250);
  expect(work).toHaveBeenCalledTimes(1);
  monitor.invalidate('a');
  await vi.advanceTimersByTimeAsync(10000);
  expect(work).toHaveBeenCalledTimes(1);
  await monitor.close();
  await vi.advanceTimersByTimeAsync(60000);
  expect(work).toHaveBeenCalledTimes(1);
});
