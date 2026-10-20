import { expect, it, vi } from 'vitest';
import { SafeExecutionQueue } from '../src/execution/queue.js';
it('expires an unsigned head before attempting to observe a quarantined predecessor', async () => {
  const finish = vi.fn(async () => {}),
    blocked = vi.fn(async () => {}),
    read = vi.fn(() => {
      throw Error('Quarantined predecessor');
    });
  const queue = Object.assign(Object.create(SafeExecutionQueue.prototype), {
    finishUnsigned: finish,
    block: blocked,
    actions: { onboarding: { store: { transaction: read } } },
    database: { hasActionAttempts: () => false },
  }) as { advance: (entry: unknown) => Promise<void> };
  const entry = { expiresAt: new Date(Date.now() - 1000).toISOString() };
  await queue.advance(entry);
  expect(finish).toHaveBeenCalledWith(entry, 'expired');
  expect(read).not.toHaveBeenCalled();
  expect(blocked).not.toHaveBeenCalled();
});
