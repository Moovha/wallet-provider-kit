import { randomUUID } from 'node:crypto';
import type {
  WalletAttemptJournal,
  WalletAttemptRequest,
} from '../domain/attempt-journal.js';
import { WalletProviderError } from '../domain/signing.js';
import { fingerprint } from './policy.js';
import type { OnboardingStore, ProviderState, StoredAttempt } from './types.js';

/** Provisioning-only reference journal. Access grants never enable generic signatures. */
export function createOnboardingJournal(
  store: OnboardingStore,
): WalletAttemptJournal {
  const key = (request: WalletAttemptRequest) =>
    fingerprint([request.namespace, request.provider, request.attemptId]);
  function owned(
    state: ProviderState,
    request: WalletAttemptRequest,
    lease: string,
  ): StoredAttempt {
    const record = state.attempts[key(request)];
    if (
      !record ||
      fingerprint(record.request) !== fingerprint(request) ||
      record.lease !== lease ||
      record.state !== 'dispatch' ||
      record.expiresAt <= Date.now()
    )
      throw new WalletProviderError('wallet_attempt_unavailable', 'unknown');
    return record;
  }
  return {
    claim: (request) =>
      store.transaction((state) => {
        const identity = {
          attemptId: request.attemptId,
          resourceKey: request.resourceKey,
          requestHash: request.requestHash,
        };
        if (request.kind !== 'provision')
          return { ...identity, state: 'conflict' as const };
        const existing = state.attempts[key(request)];
        if (existing) {
          if (fingerprint(existing.request) !== fingerprint(request))
            return { ...identity, state: 'conflict' as const };
          if (existing.state === 'dispatch' && existing.expiresAt <= Date.now())
            existing.state = 'unknown';
          if (existing.state === 'succeeded')
            return {
              ...identity,
              state: 'succeeded' as const,
              result: existing.result!,
            };
          if (existing.state === 'failed')
            return {
              ...identity,
              state: 'failed' as const,
              failure: existing.failure!,
            };
          return {
            ...identity,
            state:
              existing.state === 'dispatch'
                ? ('pending' as const)
                : ('unknown' as const),
          };
        }
        if (
          Object.values(state.attempts).some(
            (a) =>
              a.request.namespace === request.namespace &&
              a.request.provider === request.provider &&
              a.request.resourceKey === request.resourceKey,
          )
        )
          return { ...identity, state: 'conflict' as const };
        const admission = state.admissions[request.attemptId];
        if (!admission || admission.accountId !== request.accountId)
          return { ...identity, state: 'conflict' as const };
        const lease = randomUUID();
        const expiresAt = Date.now() + 30000;
        state.attempts[key(request)] = {
          request: structuredClone(request),
          grantId: admission.grantId,
          state: 'dispatch',
          lease,
          expiresAt,
        };
        return {
          ...identity,
          state: 'dispatch' as const,
          leaseToken: lease,
          leaseExpiresAt: new Date(expiresAt).toISOString(),
        };
      }),
    complete: (request, lease, result) =>
      store.transaction((state) => {
        const attempt = owned(state, request, lease);
        if (
          result.kind !== 'provision' ||
          result.account.accountId !== request.accountId
        )
          throw new WalletProviderError(
            'wallet_attempt_unavailable',
            'unknown',
          );
        attempt.state = 'succeeded';
        attempt.result = structuredClone(result);
        state.accounts[request.accountId].address = result.account.address;
        state.audit.push({
          at: Date.now(),
          event: 'wallet_provisioned',
          resource: request.accountId,
          revision: state.accounts[request.accountId].acceptanceRevision,
        });
      }),
    fail: (request, lease, failure) =>
      store.transaction((state) => {
        const attempt = owned(state, request, lease);
        attempt.state = failure.outcome === 'unknown' ? 'unknown' : 'failed';
        attempt.failure = { ...failure };
        state.audit.push({
          at: Date.now(),
          event: 'wallet_attempt_' + attempt.state,
          resource: request.accountId,
          revision: state.accounts[request.accountId].acceptanceRevision,
        });
      }),
  };
}
