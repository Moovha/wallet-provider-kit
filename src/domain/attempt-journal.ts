import type { EmbeddedAccount, WalletProviderError } from './signing.js';

/** References and fingerprints only: no token, raw action, private key or PII. */
export interface WalletAttemptRequest {
  readonly namespace: string;
  readonly provider: string;
  readonly attemptId: string;
  readonly kind: 'provision' | 'sign_typed_data';
  readonly accountId: string;
  readonly resourceKey: string;
  readonly requestHash: string;
}

export type WalletAttemptResult =
  | { kind: 'provision'; account: EmbeddedAccount }
  | { kind: 'sign_typed_data'; signature: string };

export interface WalletAttemptFailure {
  code: WalletProviderError['code'];
  outcome: WalletProviderError['outcome'];
}

export type WalletAttemptClaim = {
  attemptId: string;
  resourceKey: string;
  requestHash: string;
} & (
  | { state: 'dispatch'; leaseToken: string; leaseExpiresAt: string }
  | { state: 'pending' | 'unknown' | 'conflict' }
  | { state: 'succeeded'; result: WalletAttemptResult }
  | { state: 'failed'; failure: WalletAttemptFailure }
);

/**
 * Host-owned transactional persistence. No default or in-memory implementation.
 *
 * claim must atomically bind namespace/provider/attempt and resource identities,
 * reserve the bounded usage, and commit dispatch with a fresh fencing token.
 * Identical callers share one record; mismatched request/resource reuse conflicts.
 * Only one caller may receive dispatch, including after process restart.
 * Lease expiry after dispatch is unknown, never permission for another dispatch.
 *
 * complete/fail must fence the token and atomically store a terminal result and
 * its audit/outbox event. Preserve results beyond HTTP/vendor cache lifetimes.
 * Never retry uncertain writes or release reservations for unknown outcomes.
 */
export interface WalletAttemptJournal {
  claim(request: WalletAttemptRequest): Promise<WalletAttemptClaim>;
  complete(
    request: WalletAttemptRequest,
    leaseToken: string,
    result: WalletAttemptResult,
  ): Promise<void>;
  fail(
    request: WalletAttemptRequest,
    leaseToken: string,
    failure: WalletAttemptFailure,
  ): Promise<void>;
}

export interface JournaledProviderOptions {
  /** Stable deployment/backend environment identity; never a credential or URL. */
  namespace: string;
  journal: WalletAttemptJournal;
  /**
   * Resolve the admitted attempt's CURRENT owner/grant/KYC/consent/proof and exact
   * immutable request. Called on every request and again after a dispatch claim.
   * A JWT scope or the existence of a journal row cannot return true by itself.
   */
  authorizeAttempt(request: WalletAttemptRequest): Promise<boolean>;
}
