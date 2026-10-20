import { it, expect } from 'vitest';
import { observationBatch } from '../src/execution/inclusion.js';
import type { TransferExecutionRecord } from '../src/execution/types.js';
const record = (id: string, included: boolean) => ({
  id,
  execution: {
    observation: {
      verification: 'rpc-single',
      chain_status: included ? 'included' : 'pending',
      outcome: included ? 'succeeded' : 'unknown',
    },
  } as TransferExecutionRecord,
});
it('serves pending inclusions ahead of old settlement work without starving either group', () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => record('old-' + i, true)),
    ...Array.from({ length: 7 }, (_, i) => record('pending-' + i, false)),
  ];
  let cursors = { pending: 0, settlement: 0 };
  const pending = new Set<string>(),
    old = new Set<string>();
  for (let n = 0; n < 20; n++) {
    const batch = observationBatch(rows, cursors);
    cursors = batch.cursors;
    expect(batch.ids.filter((id) => id.startsWith('pending'))).toHaveLength(3);
    expect(batch.ids.filter((id) => id.startsWith('old'))).toHaveLength(1);
    for (const id of batch.ids)
      (id.startsWith('pending') ? pending : old).add(id);
  }
  expect(pending.size).toBe(7);
  expect(old.size).toBe(20);
});
it('uses bounded available capacity for one group and tolerates disappearing records', () => {
  const c = { pending: 99, settlement: 77 };
  expect(observationBatch([], c).ids).toEqual([]);
  expect(
    observationBatch(
      Array.from({ length: 10 }, (_, i) => record('pending-' + i, false)),
      c,
    ).ids,
  ).toHaveLength(4);
  expect(
    observationBatch(
      Array.from({ length: 10 }, (_, i) => record('old-' + i, true)),
      c,
    ).ids,
  ).toHaveLength(4);
  expect(
    observationBatch([record('one', false), record('two', true)], c).ids,
  ).toEqual(['one', 'two']);
});
