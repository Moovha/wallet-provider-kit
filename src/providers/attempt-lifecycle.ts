import { createHash } from 'node:crypto';
import type {
  JournaledProviderOptions,
  WalletAttemptClaim,
  WalletAttemptFailure,
  WalletAttemptRequest,
  WalletAttemptResult,
} from '../domain/attempt-journal.js';
import { WalletProviderError } from '../domain/signing.js';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const identifier = /^[a-z][a-z0-9._-]{0,63}$/;
export const failureCodes: readonly WalletProviderError['code'][] = [
  'wallet_provider_configuration',
  'wallet_provider_input',
  'wallet_provider_rejected',
  'wallet_provider_unavailable',
  'wallet_provider_response',
  'wallet_authorization_denied',
  'wallet_attempt_conflict',
  'wallet_attempt_pending',
  'wallet_attempt_unavailable',
];

export function journalUnavailable(): WalletProviderError {
  return new WalletProviderError('wallet_attempt_unavailable', 'unknown');
}

/** Private deterministic fingerprint, not a replacement for the EIP-712 digest. */
function canonical(value: unknown, depth = 0): string {
  if (depth > 12) throw new WalletProviderError('wallet_provider_input');
  if (typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((entry) => canonical(entry, depth + 1)).join(',')}]`;
  if (
    value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonical(record[key], depth + 1)}`,
      )
      .join(',')}}`;
  }
  throw new WalletProviderError('wallet_provider_input');
}

function fingerprint(value: unknown): string {
  const serialized = canonical(value);
  if (Buffer.byteLength(serialized, 'utf8') > 32768)
    throw new WalletProviderError('wallet_provider_input');
  return createHash('sha256').update(serialized).digest('hex');
}

/** Shared admission/completion mechanics; storage and current policy remain host-owned. */
export function createAttemptLifecycle(
  providerNameInput: string,
  options: JournaledProviderOptions,
) {
  if (
    typeof options.namespace !== 'string' ||
    !identifier.test(options.namespace) ||
    typeof providerNameInput !== 'string' ||
    !identifier.test(providerNameInput) ||
    !options.journal ||
    typeof options.journal.claim !== 'function' ||
    typeof options.journal.complete !== 'function' ||
    typeof options.journal.fail !== 'function' ||
    typeof options.authorizeAttempt !== 'function'
  )
    throw new WalletProviderError('wallet_provider_configuration');
  // Capture configuration once; caller mutation cannot retarget an existing wrapper.
  const namespace = options.namespace;
  const providerName = providerNameInput;
  const journal = options.journal;
  const authorizeAttempt = options.authorizeAttempt;

  function request(
    kind: WalletAttemptRequest['kind'],
    accountId: string,
    attemptId: string,
    resourceId: string,
    exactInput: unknown,
  ): WalletAttemptRequest {
    if (!uuid.test(accountId) || !uuid.test(attemptId))
      throw new WalletProviderError('wallet_provider_input');
    return Object.freeze({
      namespace,
      provider: providerName,
      attemptId,
      kind,
      accountId,
      resourceKey: fingerprint({
        namespace,
        provider: providerName,
        kind,
        resourceId,
      }),
      requestHash: fingerprint(exactInput),
    });
  }

  async function authorize(attempt: WalletAttemptRequest): Promise<void> {
    let permitted: boolean;
    try {
      permitted = await authorizeAttempt(attempt);
    } catch {
      throw new WalletProviderError('wallet_provider_unavailable');
    }
    if (permitted !== true)
      throw new WalletProviderError('wallet_authorization_denied');
  }

  async function execute(
    attempt: WalletAttemptRequest,
    dispatch: () => Promise<WalletAttemptResult>,
    checkResult: (result: WalletAttemptResult) => WalletAttemptResult,
    recheck: () => void = () => undefined,
  ): Promise<WalletAttemptResult> {
    await authorize(attempt);
    let claim: WalletAttemptClaim;
    try {
      claim = structuredClone(await journal.claim(attempt));
    } catch {
      throw journalUnavailable();
    }
    if (
      !claim ||
      claim.attemptId !== attempt.attemptId ||
      claim.resourceKey !== attempt.resourceKey ||
      claim.requestHash !== attempt.requestHash
    )
      throw journalUnavailable();
    if (claim.state === 'conflict')
      throw new WalletProviderError('wallet_attempt_conflict');
    if (claim.state === 'pending')
      throw new WalletProviderError('wallet_attempt_pending', 'unknown');
    if (claim.state === 'unknown')
      throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
    if (claim.state === 'failed') {
      if (
        !claim.failure ||
        !failureCodes.includes(claim.failure.code) ||
        !['not_dispatched', 'rejected', 'unknown'].includes(
          claim.failure.outcome,
        )
      )
        throw journalUnavailable();
      throw new WalletProviderError(claim.failure.code, claim.failure.outcome);
    }
    if (claim.state === 'succeeded') {
      await authorize(attempt);
      recheck();
      return checkResult(claim.result);
    }
    if (
      claim.state !== 'dispatch' ||
      !uuid.test(claim.leaseToken) ||
      !Number.isFinite(Date.parse(claim.leaseExpiresAt))
    )
      throw journalUnavailable();
    const leaseToken = claim.leaseToken;
    let result: WalletAttemptResult;
    let dispatchStarted = false;
    try {
      await authorize(attempt);
      if (Date.parse(claim.leaseExpiresAt) <= Date.now())
        throw journalUnavailable();
      recheck();
      dispatchStarted = true;
      result = checkResult(await dispatch());
    } catch (error) {
      const failure: WalletAttemptFailure =
        error instanceof WalletProviderError &&
        failureCodes.includes(error.code) &&
        ['not_dispatched', 'rejected', 'unknown'].includes(error.outcome)
          ? { code: error.code, outcome: error.outcome }
          : {
              code: 'wallet_provider_unavailable',
              outcome: dispatchStarted ? 'unknown' : 'not_dispatched',
            };
      try {
        await journal.fail(attempt, leaseToken, failure);
      } catch {
        throw journalUnavailable();
      }
      throw new WalletProviderError(failure.code, failure.outcome);
    }
    try {
      await journal.complete(attempt, leaseToken, structuredClone(result));
    } catch {
      throw journalUnavailable();
    }
    return result;
  }

  return { request, execute };
}
