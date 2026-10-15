import { createHash } from 'node:crypto';
import { getAddress, recoverAddress, TypedDataEncoder } from 'ethers';
import type {
  JournaledProviderOptions,
  WalletAttemptClaim,
  WalletAttemptFailure,
  WalletAttemptRequest,
  WalletAttemptResult,
} from '../domain/attempt-journal.js';
import {
  WalletProviderError,
  type EmbeddedAccount,
  type TypedDataAction,
  type WalletSigningProvider,
} from '../domain/signing.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const identifier = /^[a-z][a-z0-9._-]{0,63}$/;
const failureCodes: readonly WalletProviderError['code'][] = [
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

function journalUnavailable(): WalletProviderError {
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

function checkedAccount(
  account: EmbeddedAccount,
  accountId: string,
): EmbeddedAccount {
  try {
    if (
      !uuid.test(accountId) ||
      account.accountId !== accountId ||
      !/^0x[0-9a-fA-F]{40}$/.test(account.address) ||
      /^0x0{40}$/.test(account.address)
    )
      throw new Error();
    return { accountId, address: getAddress(account.address) };
  } catch {
    throw new WalletProviderError('wallet_provider_response', 'unknown');
  }
}

function validateAction(
  account: EmbeddedAccount,
  action: TypedDataAction,
): void {
  try {
    const chain = /^eip155:([1-9][0-9]*)$/.exec(action.chain_id);
    if (
      !chain ||
      !uuid.test(action.action_id) ||
      !uuid.test(action.operation_id) ||
      action.kind !== 'sign_typed_data' ||
      action.profile !== 'evm_eoa_v1' ||
      action.profile_revision !== '1' ||
      action.status !== 'ready' ||
      action.payload.domain.chainId !== chain[1] ||
      action.chain_account_id.toLowerCase() !==
        `${action.chain_id}:${account.address.toLowerCase()}` ||
      !/^0x[0-9a-f]{64}$/.test(action.payload_hash) ||
      !/^0x[0-9a-f]{64}$/.test(action.plan_hash) ||
      ![
        action.binding_revision,
        action.capability_revision,
        action.plan_revision,
      ].every((revision) => /^[1-9][0-9]{0,19}$/.test(revision)) ||
      !Number.isFinite(Date.parse(action.expires_at)) ||
      Date.parse(action.expires_at) <= Date.now()
    )
      throw new Error();
    const { EIP712Domain, ...types } = action.payload.types;
    const payload = TypedDataEncoder.getPayload(
      action.payload.domain,
      types,
      action.payload.message,
    );
    if (
      payload.primaryType !== action.payload.primaryType ||
      (EIP712Domain &&
        JSON.stringify(EIP712Domain) !==
          JSON.stringify(payload.types.EIP712Domain)) ||
      TypedDataEncoder.hash(
        action.payload.domain,
        types,
        action.payload.message,
      ) !== action.payload_hash
    )
      throw new Error();
  } catch {
    throw new WalletProviderError('wallet_provider_input');
  }
}

function checkedResult(
  result: WalletAttemptResult,
  request: WalletAttemptRequest,
  account?: EmbeddedAccount,
  action?: TypedDataAction,
): WalletAttemptResult {
  try {
    if (request.kind === 'provision' && result.kind === 'provision') {
      return {
        kind: 'provision',
        account: checkedAccount(result.account, request.accountId),
      };
    }
    if (
      request.kind !== 'sign_typed_data' ||
      result.kind !== 'sign_typed_data' ||
      !account ||
      !action ||
      !/^0x[0-9a-fA-F]{130}$/.test(result.signature) ||
      recoverAddress(action.payload_hash, result.signature).toLowerCase() !==
        account.address.toLowerCase()
    )
      throw new Error();
    return { kind: 'sign_typed_data', signature: result.signature };
  } catch {
    throw new WalletProviderError('wallet_provider_response', 'unknown');
  }
}

/** Decorates an authorized backend; no database choice, credentials, retries or policy bypass. */
export function createJournaledWalletProvider(
  provider: WalletSigningProvider,
  options: JournaledProviderOptions,
): WalletSigningProvider {
  if (
    typeof options.namespace !== 'string' ||
    !identifier.test(options.namespace) ||
    typeof provider.provider !== 'string' ||
    !identifier.test(provider.provider) ||
    !options.journal ||
    typeof options.journal.claim !== 'function' ||
    typeof options.journal.complete !== 'function' ||
    typeof options.journal.fail !== 'function' ||
    typeof options.authorizeAttempt !== 'function'
  )
    throw new WalletProviderError('wallet_provider_configuration');
  // Capture configuration once; caller mutation cannot retarget an existing wrapper.
  const namespace = options.namespace;
  const providerName = provider.provider;
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
    account?: EmbeddedAccount,
    action?: TypedDataAction,
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
      if (account && action) validateAction(account, action);
      return checkedResult(claim.result, attempt, account, action);
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
      if (action && account) validateAction(account, action); // Expiry may pass during admission.
      dispatchStarted = true;
      result = checkedResult(await dispatch(), attempt, account, action);
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

  return {
    provider: providerName,
    async createAccount(accountId, attemptId) {
      const attempt = request('provision', accountId, attemptId, accountId, {
        accountId,
      });
      const result = await execute(attempt, async () => ({
        kind: 'provision',
        account: await provider.createAccount(accountId, attemptId),
      }));
      if (result.kind !== 'provision') throw journalUnavailable();
      return result.account;
    },
    async findAccount(accountId) {
      if (!uuid.test(accountId))
        throw new WalletProviderError('wallet_provider_input');
      try {
        const account = await provider.findAccount(accountId);
        return account === null ? null : checkedAccount(account, accountId);
      } catch (error) {
        if (
          error instanceof WalletProviderError &&
          failureCodes.includes(error.code) &&
          ['not_dispatched', 'rejected', 'unknown'].includes(error.outcome)
        ) {
          throw new WalletProviderError(error.code, error.outcome);
        }
        throw new WalletProviderError('wallet_provider_unavailable');
      }
    },
    async signTypedData(account, action, attemptId) {
      let boundAccount: EmbeddedAccount;
      let boundAction: TypedDataAction;
      try {
        boundAccount = checkedAccount(
          structuredClone(account),
          account.accountId,
        );
        boundAction = structuredClone(action);
        validateAction(boundAccount, boundAction);
      } catch {
        throw new WalletProviderError('wallet_provider_input');
      }
      const attempt = request(
        'sign_typed_data',
        boundAccount.accountId,
        attemptId,
        boundAction.action_id,
        {
          account: {
            accountId: boundAccount.accountId,
            address: boundAccount.address.toLowerCase(),
          },
          action: boundAction,
        },
      );
      const result = await execute(
        attempt,
        async () => ({
          kind: 'sign_typed_data',
          signature: await provider.signTypedData(
            structuredClone(boundAccount),
            structuredClone(boundAction),
            attemptId,
          ),
        }),
        boundAccount,
        boundAction,
      );
      if (result.kind !== 'sign_typed_data') throw journalUnavailable();
      return result.signature;
    },
  };
}
