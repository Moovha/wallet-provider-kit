import { randomUUID } from 'node:crypto';
import { getAddress, recoverAddress } from 'ethers';
import type {
  WalletAttemptClaim,
  WalletAttemptFailure,
  WalletAttemptRequest,
  WalletAttemptResult,
} from '../domain/attempt-journal.js';
import { WalletProviderError } from '../domain/signing.js';
import type { RelayerAttemptJournal } from '../providers/openzeppelin-relayer.js';
import { failureCodes } from '../providers/attempt-lifecycle.js';
import { fingerprint, text, uuid } from '../onboarding/policy.js';
import { StorageConnection, unavailable } from './connection.js';
import type { FinancialApproval } from './types.js';

export interface AttemptAdmission {
  request: WalletAttemptRequest;
  budgetId: string;
  /** Nonnegative decimal integer usage units; reservations are retained after unknown effects. */
  units: string;
}

export function units(value: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value))
    throw new WalletProviderError('wallet_provider_input');
  return BigInt(value);
}

export function validateRequest(request: WalletAttemptRequest) {
  if (
    !request ||
    Object.keys(request).sort().join(',') !==
      'accountId,attemptId,kind,namespace,provider,requestHash,resourceKey' ||
    !/^[a-z][a-z0-9._-]{0,63}$/.test(request.namespace) ||
    !/^[a-z][a-z0-9._-]{0,63}$/.test(request.provider) ||
    !uuid.test(request.attemptId) ||
    !uuid.test(request.accountId) ||
    !['provision', 'sign_typed_data', 'relay_transaction'].includes(
      request.kind,
    ) ||
    !/^[a-f0-9]{64}$/.test(request.resourceKey) ||
    !/^[a-f0-9]{64}$/.test(request.requestHash)
  )
    throw new WalletProviderError('wallet_provider_input');
}

export function admission(
  connection: StorageConnection,
  input: AttemptAdmission,
  approvalId: string | null = null,
  context: string | null = null,
): WalletAttemptRequest {
  validateRequest(input.request);
  units(input.units);
  if (!text(input.budgetId))
    throw new WalletProviderError('wallet_provider_input');
  const request = input.request;
  const previous = connection.get(
    'SELECT * FROM admissions WHERE namespace=? AND provider=? AND (attempt_id=? OR resource_key=?)',
    request.namespace,
    request.provider,
    request.attemptId,
    request.resourceKey,
  );
  if (previous) {
    if (
      fingerprint(JSON.parse(String(previous.request))) !==
        fingerprint(request) ||
      previous.budget_id !== input.budgetId ||
      previous.units !== input.units ||
      previous.approval_id !== approvalId ||
      previous.context !== context
    )
      throw new WalletProviderError('wallet_attempt_conflict');
    return request;
  }
  if (!connection.get('SELECT id FROM budgets WHERE id=?', input.budgetId))
    throw new WalletProviderError('wallet_authorization_denied');
  connection.run(
    'INSERT INTO admissions(namespace,provider,attempt_id,resource_key,request_hash,request,approval_id,context,budget_id,units) VALUES(?,?,?,?,?,?,?,?,?,?)',
    request.namespace,
    request.provider,
    request.attemptId,
    request.resourceKey,
    request.requestHash,
    JSON.stringify(request),
    approvalId,
    context,
    input.budgetId,
    input.units,
  );
  connection.audit('attempt_admitted', request.attemptId);
  return request;
}

function claimed(connection: StorageConnection, request: WalletAttemptRequest) {
  return connection.get(
    'SELECT a.*, d.request, d.approval_id FROM attempts a JOIN admissions d USING(namespace,provider,attempt_id) WHERE namespace=? AND provider=? AND attempt_id=?',
    request.namespace,
    request.provider,
    request.attemptId,
  );
}

function identity(request: WalletAttemptRequest) {
  return {
    attemptId: request.attemptId,
    resourceKey: request.resourceKey,
    requestHash: request.requestHash,
  };
}

function claimValue(
  row: NonNullable<ReturnType<typeof claimed>>,
  request: WalletAttemptRequest,
): WalletAttemptClaim {
  const id = identity(request);
  if (fingerprint(JSON.parse(String(row.request))) !== fingerprint(request))
    return { ...id, state: 'conflict' };
  if (row.state === 'succeeded')
    return {
      ...id,
      state: 'succeeded',
      result: JSON.parse(String(row.result)),
    };
  if (row.state === 'failed')
    return { ...id, state: 'failed', failure: JSON.parse(String(row.failure)) };
  return {
    ...id,
    state:
      row.state === 'dispatch' && Number(row.lease_expires_at) > Date.now()
        ? 'pending'
        : 'unknown',
  };
}

function checkedResult(
  connection: StorageConnection,
  request: WalletAttemptRequest,
  result: WalletAttemptResult,
  approvalId: unknown,
) {
  if (!result || result.kind !== request.kind) unavailable();
  if (result.kind === 'provision') {
    if (
      Object.keys(result).sort().join(',') !== 'account,kind' ||
      Object.keys(result.account).sort().join(',') !== 'accountId,address'
    )
      unavailable();
    if (
      result.account.accountId !== request.accountId ||
      /^0x0{40}$/i.test(result.account.address)
    )
      unavailable();
    getAddress(result.account.address);
  } else if (result.kind === 'sign_typed_data') {
    if (Object.keys(result).sort().join(',') !== 'kind,signature')
      unavailable();
    if (!/^0x[0-9a-fA-F]{130}$/.test(result.signature)) unavailable();
    if (approvalId) {
      const approval: FinancialApproval = JSON.parse(
        String(
          connection.get(
            'SELECT record FROM approvals WHERE id=?',
            String(approvalId),
          )?.record,
        ),
      );
      if (
        approval.action.kind !== 'sign_typed_data' ||
        recoverAddress(
          approval.action.payload_hash,
          result.signature,
        ).toLowerCase() !== approval.account.address.toLowerCase()
      )
        unavailable();
    }
  } else if (
    Object.keys(result).sort().join(',') !== 'kind,transactionId' ||
    !uuid.test(result.transactionId)
  )
    unavailable();
}

export function sqliteJournal(
  connection: StorageConnection,
  beforeClaim?: () => void,
): RelayerAttemptJournal {
  return {
    async claim(input) {
      const request = structuredClone(input);
      validateRequest(request);
      return connection.transaction(() => {
        beforeClaim?.();
        const previous = claimed(connection, request);
        if (previous) {
          if (
            fingerprint(JSON.parse(String(previous.request))) !==
            fingerprint(request)
          )
            return { ...identity(request), state: 'conflict' as const };
          if (
            previous.state === 'dispatch' &&
            Number(previous.lease_expires_at) <= Date.now()
          ) {
            connection.run(
              "UPDATE attempts SET state='unknown' WHERE namespace=? AND provider=? AND attempt_id=?",
              request.namespace,
              request.provider,
              request.attemptId,
            );
            connection.audit('attempt_unknown', request.attemptId);
          }
          return claimValue(previous, request);
        }
        const admitted = connection.get(
          'SELECT * FROM admissions WHERE namespace=? AND provider=? AND attempt_id=?',
          request.namespace,
          request.provider,
          request.attemptId,
        );
        if (
          !admitted ||
          fingerprint(JSON.parse(String(admitted.request))) !==
            fingerprint(request)
        )
          return { ...identity(request), state: 'conflict' as const };
        if (
          admitted.approval_id &&
          connection.get(
            'SELECT revoked FROM approvals WHERE id=?',
            String(admitted.approval_id),
          )?.revoked !== 0
        )
          throw new WalletProviderError('wallet_authorization_denied');
        const budget = connection.get(
          'SELECT maximum,reserved FROM budgets WHERE id=?',
          String(admitted.budget_id),
        );
        if (!budget) unavailable();
        const reserved =
          units(String(budget.reserved)) + units(String(admitted.units));
        if (reserved > units(String(budget.maximum)))
          throw new WalletProviderError('wallet_authorization_denied');
        connection.run(
          'UPDATE budgets SET reserved=? WHERE id=?',
          reserved.toString(),
          String(admitted.budget_id),
        );
        const leaseToken = randomUUID();
        const expires = Date.now() + 30000;
        connection.run(
          "INSERT INTO attempts(namespace,provider,attempt_id,state,lease_token,lease_expires_at) VALUES(?,?,?,'dispatch',?,?)",
          request.namespace,
          request.provider,
          request.attemptId,
          leaseToken,
          expires,
        );
        connection.audit('attempt_dispatched', request.attemptId);
        return {
          ...identity(request),
          state: 'dispatch' as const,
          leaseToken,
          leaseExpiresAt: new Date(expires).toISOString(),
        };
      });
    },
    async read(input) {
      const request = structuredClone(input);
      validateRequest(request);
      try {
        const row = claimed(connection, request);
        return row ? claimValue(row, request) : null;
      } catch {
        return unavailable();
      }
    },
    async complete(input, leaseToken, inputResult) {
      const request = structuredClone(input);
      const result = structuredClone(inputResult);
      validateRequest(request);
      connection.transaction(() => {
        const row = claimed(connection, request);
        if (
          !row ||
          row.state !== 'dispatch' ||
          row.lease_token !== leaseToken ||
          Number(row.lease_expires_at) <= Date.now() ||
          fingerprint(JSON.parse(String(row.request))) !== fingerprint(request)
        )
          unavailable();
        checkedResult(connection, request, result, row.approval_id);
        connection.run(
          "UPDATE attempts SET state='succeeded',result=? WHERE namespace=? AND provider=? AND attempt_id=?",
          JSON.stringify(result),
          request.namespace,
          request.provider,
          request.attemptId,
        );
        connection.audit('attempt_succeeded', request.attemptId);
      });
    },
    async fail(input, leaseToken, inputFailure) {
      const request = structuredClone(input);
      const failure: WalletAttemptFailure = {
        code: inputFailure.code,
        outcome: inputFailure.outcome,
      };
      validateRequest(request);
      connection.transaction(() => {
        const row = claimed(connection, request);
        if (
          !row ||
          row.state !== 'dispatch' ||
          row.lease_token !== leaseToken ||
          Number(row.lease_expires_at) <= Date.now() ||
          fingerprint(JSON.parse(String(row.request))) !==
            fingerprint(request) ||
          !failureCodes.includes(failure.code) ||
          !['not_dispatched', 'rejected', 'unknown'].includes(failure.outcome)
        )
          unavailable();
        const state = failure.outcome === 'unknown' ? 'unknown' : 'failed';
        connection.run(
          'UPDATE attempts SET state=?,failure=? WHERE namespace=? AND provider=? AND attempt_id=?',
          state,
          JSON.stringify(failure),
          request.namespace,
          request.provider,
          request.attemptId,
        );
        connection.audit('attempt_' + state, request.attemptId);
      });
    },
  };
}

/** Recovery stores verified evidence/results; it never makes an attempt dispatchable. */
export async function reconcileAttempt(
  connection: StorageConnection,
  input: WalletAttemptRequest,
  inputResult: WalletAttemptResult,
  evidenceReference: string,
  verify: (
    request: WalletAttemptRequest,
    result: WalletAttemptResult,
    evidenceReference: string,
  ) => Promise<boolean>,
): Promise<void> {
  const request = structuredClone(input);
  const result = structuredClone(inputResult);
  validateRequest(request);
  if (!text(evidenceReference) || typeof verify !== 'function')
    throw new WalletProviderError('wallet_provider_input');
  let verified: boolean;
  try {
    verified = await verify(
      structuredClone(request),
      structuredClone(result),
      evidenceReference,
    );
  } catch {
    return unavailable();
  }
  if (verified !== true)
    throw new WalletProviderError('wallet_authorization_denied');
  connection.transaction(() => {
    const row = claimed(connection, request);
    if (
      !row ||
      (row.state !== 'unknown' &&
        !(
          row.state === 'dispatch' && Number(row.lease_expires_at) <= Date.now()
        )) ||
      fingerprint(JSON.parse(String(row.request))) !== fingerprint(request)
    )
      unavailable();
    checkedResult(connection, request, result, row.approval_id);
    connection.run(
      "UPDATE attempts SET state='succeeded',result=?,failure=NULL WHERE namespace=? AND provider=? AND attempt_id=?",
      JSON.stringify(result),
      request.namespace,
      request.provider,
      request.attemptId,
    );
    // Store a fingerprint of the evidence reference, never vendor URLs or proof bodies.
    connection.audit(
      'attempt_reconciled_' + fingerprint(evidenceReference),
      request.attemptId,
    );
  });
}
