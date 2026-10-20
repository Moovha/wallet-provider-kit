import { expect, it, vi } from 'vitest';
import { ObservationWorker } from '../src/execution/observation-worker.js';
import type { TransferExecutionRecord } from '../src/execution/types.js';
it('refills independent bounded workers while the first observation remains stalled', async () => {
  let release!: () => void;
  const stuck = new Promise<void>((resolve) => {
    release = resolve;
  });
  const done = new Set<string>();
  let active = 0,
    maximum = 0;
  const observe = vi.fn(async (id: string) => {
    active++;
    maximum = Math.max(maximum, active);
    if (id === '0') await stuck;
    done.add(id);
    active--;
  });
  const worker = new ObservationWorker(
    async () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        execution: {} as TransferExecutionRecord,
      })).filter((r) => !done.has(r.id)),
    observe,
    10000,
  );
  worker.start();
  try {
    await vi.waitFor(() => expect(done.size).toBe(9));
    expect(done.has('0')).toBe(false);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(observe).toHaveBeenCalledTimes(10);
  } finally {
    release();
    await worker.close();
  }
});

it('bounds repeated block hints without waiting for a long fallback interval', async () => {
  vi.useFakeTimers();
  const observe = vi.fn(async () => {});
  const worker = new ObservationWorker(
    async () => [{ id: 'pending', execution: {} as TransferExecutionRecord }],
    observe,
    300000,
  );
  try {
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(observe).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(200);
      worker.hint();
      await vi.advanceTimersByTimeAsync(0);
      expect(observe).toHaveBeenCalledTimes(1);
    }
    await vi.advanceTimersByTimeAsync(200);
    worker.hint();
    await vi.advanceTimersByTimeAsync(0);
    expect(observe).toHaveBeenCalledTimes(2);
  } finally {
    await worker.close();
    vi.useRealTimers();
  }
});
