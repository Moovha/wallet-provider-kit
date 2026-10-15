import { getAddress, recoverAddress, TypedDataEncoder } from 'ethers';
import type {
  JournaledProviderOptions,
  WalletAttemptRequest,
  WalletAttemptResult,
} from '../domain/attempt-journal.js';
import {
  createAttemptLifecycle,
  failureCodes,
  journalUnavailable,
} from './attempt-lifecycle.js';
import {
  WalletProviderError,
  type EmbeddedAccount,
  type TypedDataAction,
  type WalletSigningProvider,
} from '../domain/signing.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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
  const providerName = provider.provider;
  const { request, execute } = createAttemptLifecycle(providerName, options);

  return {
    provider: providerName,
    async createAccount(accountId, attemptId) {
      const attempt = request('provision', accountId, attemptId, accountId, {
        accountId,
      });
      const result = await execute(
        attempt,
        async () => ({
          kind: 'provision',
          account: await provider.createAccount(accountId, attemptId),
        }),
        (result) => checkedResult(result, attempt),
      );
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
        (result) => checkedResult(result, attempt, boundAccount, boundAction),
        () => validateAction(boundAccount, boundAction),
      );
      if (result.kind !== 'sign_typed_data') throw journalUnavailable();
      return result.signature;
    },
  };
}
