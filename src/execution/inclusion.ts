import type { TransferExecutionRecord } from './types.js';

export function rpcVerified(value: string | undefined): boolean {
  return value === 'rpc-quorum' || value === 'rpc-single';
}

/** Verified inclusion frees execution capacity; it never releases financial reservations. */
export function includedExecution(
  execution?: Pick<TransferExecutionRecord, 'observation' | 'integrityFailure'>,
): boolean {
  const observation = execution?.observation;
  return (
    !!observation &&
    !execution?.integrityFailure &&
    rpcVerified(observation.verification) &&
    ['included', 'safe', 'finalized'].includes(observation.chain_status) &&
    ['succeeded', 'reverted'].includes(observation.outcome)
  );
}

/** A successful outer Safe transaction proves nonce consumption, including inner-call failure. */
export function consumedSafeNonce(
  execution?: Pick<TransferExecutionRecord, 'observation' | 'integrityFailure'>,
): boolean {
  return (
    includedExecution(execution) &&
    (execution?.observation?.safe_nonce_consumed === true ||
      execution?.observation?.callsReceipt?.status === '0x1')
  );
}

/** Pending inclusion is observed promptly; finality tracking yields capacity to new work. */
export function observationDue(
  execution: Pick<TransferExecutionRecord, 'observation' | 'integrityFailure'>,
): boolean {
  if (
    execution.integrityFailure ||
    execution.observation?.chain_status === 'finalized'
  )
    return false;
  if (!includedExecution(execution)) return true;
  const observed = Date.parse(execution.observation!.observed_at);
  return !Number.isFinite(observed) || Date.now() - observed >= 30000;
}

/** Reserve capacity for pending inclusion and keep one fair finality slot under load. */
export function observationBatch(
  records: { id: string; execution: TransferExecutionRecord }[],
  cursors: { pending: number; settlement: number },
) {
  const pending = records.filter((r) => !includedExecution(r.execution));
  const settlement = records.filter((r) => includedExecution(r.execution));
  const take = (group: typeof records, cursor: number, count: number) =>
    Array.from(
      { length: Math.min(count, group.length) },
      (_, i) => group[(cursor + i) % group.length].id,
    );
  const p = take(pending, cursors.pending, settlement.length ? 3 : 4);
  const s = take(settlement, cursors.settlement, pending.length ? 1 : 4);
  return {
    ids: [...p, ...s],
    cursors: {
      pending: pending.length
        ? (cursors.pending + p.length) % pending.length
        : 0,
      settlement: settlement.length
        ? (cursors.settlement + s.length) % settlement.length
        : 0,
    },
  };
}
