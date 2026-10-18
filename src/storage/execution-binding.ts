import { WalletProviderError } from '../domain/signing.js';
import { fingerprint } from '../onboarding/policy.js';
import type { StorageConnection } from './connection.js';
import type { FinancialApproval } from './types.js';

export type OperationMechanism = 'relayer' | 'safe-4337-v07';
function identity(approval: FinancialApproval) {
  return fingerprint([
    'financial-operation-v1',
    approval.caller.issuer,
    approval.caller.subject,
    approval.caller.clientId,
    approval.ownerSubject,
    approval.account.accountId,
    approval.action.kind === 'sign_typed_data'
      ? approval.action.operation_id
      : approval.action.operationId,
  ]);
}
export function approvalMechanism(
  approval: FinancialApproval,
): OperationMechanism {
  return approval.action.kind === 'sign_typed_data' &&
    approval.action.payload.primaryType === 'SafeOp'
    ? 'safe-4337-v07'
    : 'relayer';
}
/** Called inside the admission transaction. A financial operation never changes mechanisms. */
export function bindExecutionMechanism(
  connection: StorageConnection,
  approval: FinancialApproval,
  mechanism: OperationMechanism,
) {
  const key = identity(approval);
  const previous = connection.get(
    'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
    'executionBindings',
    key,
  );
  if (previous && JSON.parse(String(previous.record)).mechanism !== mechanism)
    throw new WalletProviderError('wallet_attempt_conflict');
  // Existing v1 admissions predate the lock. Treat every admitted signature as possible exposure,
  // including failures, unknown responses and expired leases, independent of backend namespace.
  for (const row of connection.all(
    'SELECT DISTINCT p.record FROM approvals p JOIN admissions a ON a.approval_id=p.id WHERE p.account_id=?',
    approval.account.accountId,
  )) {
    const admitted: FinancialApproval = JSON.parse(String(row.record));
    if (identity(admitted) === key && approvalMechanism(admitted) !== mechanism)
      throw new WalletProviderError('wallet_attempt_conflict');
  }
  if (!previous) {
    connection.run(
      'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?)',
      'executionBindings',
      key,
      JSON.stringify({ mechanism }),
    );
    connection.audit('execution_mechanism_bound', key);
  }
}
