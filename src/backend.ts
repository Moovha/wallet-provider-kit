import { getAddress, recoverAddress, Signature } from 'ethers';
import { baseSepoliaPayload } from './providers/evm-typed-data.js';
import {
  WalletProviderError,
  type EmbeddedAccount,
  type TypedDataAction,
  type WalletSigningProvider,
} from './domain/signing.js';

export interface StoredSigningResult {
  attemptId: string;
  state: 'admitted' | 'dispatching' | 'succeeded' | 'rejected' | 'unknown';
  signature: string | null;
}
export interface StoredSigningDispatch {
  attemptId: string;
  leaseToken: string;
  accountId: string;
  address: string;
  action: TypedDataAction;
}
/** Trusted host policy/storage, never records or callbacks supplied by an HTTP caller. */
export interface StoredSigningAuthority<Context> {
  admit(context: Context, actionId: string): Promise<StoredSigningResult>;
  dispatch(context: Context, attemptId: string): Promise<StoredSigningDispatch>;
  finish(
    dispatch: StoredSigningDispatch,
    state: 'succeeded' | 'rejected' | 'unknown',
    signature?: string,
  ): Promise<StoredSigningResult>;
}
export interface StoredTypedDataSigner {
  readonly provider: string;
  signTypedData(dispatch: StoredSigningDispatch): Promise<string>;
}
export interface StoredAccountRecord {
  accountId: string;
  attemptId: string;
  state: 'admitted' | 'dispatching' | 'bound' | 'unknown';
  leaseToken: string;
  address: string | null;
}
export interface StoredAccountResult {
  accountId: string;
  address: string | null;
  state: StoredAccountRecord['state'];
}
export interface StoredAccountAuthority<Context> {
  reserve(context: Context, recover: boolean): Promise<StoredAccountRecord>;
  claim(
    context: Context,
    account: StoredAccountRecord,
  ): Promise<StoredAccountRecord>;
  finish(
    account: StoredAccountRecord,
    address: string | null,
  ): Promise<StoredAccountResult>;
}
export interface StoredWalletBackendConfiguration<
  SigningContext,
  AccountContext,
> {
  /** Explicit host opt-in; credentials never activate this backend. */
  enabled: boolean;
  provider: WalletSigningProvider;
  signingAuthority: StoredSigningAuthority<SigningContext>;
  accountAuthority: StoredAccountAuthority<AccountContext>;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function unavailable(): never {
  throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
}
function checkedAddress(account: EmbeddedAccount, expectedId: string): string {
  try {
    if (
      !account ||
      account.accountId !== expectedId ||
      /^0x0{40}$/i.test(account.address)
    )
      unavailable();
    return getAddress(account.address).toLowerCase();
  } catch {
    return unavailable();
  }
}
/** Supplied durable dispatch: admission and dispatch commits precede the only signing call. */
export function createDurableSigningService<Context>(
  authority: StoredSigningAuthority<Context>,
  signer: StoredTypedDataSigner,
) {
  if (
    !authority ||
    !signer ||
    !/^[a-z][a-z0-9._-]{0,63}$/.test(signer.provider) ||
    typeof authority.admit !== 'function' ||
    typeof authority.dispatch !== 'function' ||
    typeof authority.finish !== 'function' ||
    typeof signer.signTypedData !== 'function'
  ) {
    throw new WalletProviderError('wallet_provider_configuration');
  }
  const { admit, dispatch, finish } = {
    admit: authority.admit.bind(authority),
    dispatch: authority.dispatch.bind(authority),
    finish: authority.finish.bind(authority),
  };
  const signTypedData = signer.signTypedData.bind(signer);
  return {
    async sign(
      context: Context,
      actionId: string,
    ): Promise<StoredSigningResult> {
      if (!uuid.test(actionId))
        throw new WalletProviderError('wallet_provider_input');
      const boundContext = structuredClone(context);
      const admitted = structuredClone(await admit(boundContext, actionId));
      if (admitted.state !== 'admitted') return admitted;
      // Do not retry uncertain persistence, or keep a transaction open across the provider call.
      const claimed = structuredClone(
        await dispatch(boundContext, admitted.attemptId),
      );
      let signature: string;
      try {
        if (
          !uuid.test(claimed.attemptId) ||
          claimed.attemptId !== admitted.attemptId ||
          !uuid.test(claimed.leaseToken) ||
          claimed.action.action_id !== actionId
        )
          unavailable();
        const account = {
          accountId: claimed.accountId,
          address: claimed.address,
        };
        baseSepoliaPayload(account, claimed.action);
        signature = Signature.from(
          await signTypedData(structuredClone(claimed)),
        ).serialized.toLowerCase();
        if (
          recoverAddress(
            claimed.action.payload_hash,
            signature,
          ).toLowerCase() !== checkedAddress(account, claimed.accountId)
        )
          unavailable();
      } catch {
        // Provider errors, malformed responses and lost responses never authorize a second dispatch.
        return finish(claimed, 'unknown');
      }
      return finish(claimed, 'succeeded', signature);
    },
  };
}
/** Ready-made lifecycle around a selected provider and trusted host policy/storage adapters. */
export function createStoredWalletBackend<SigningContext, AccountContext>(
  configuration: StoredWalletBackendConfiguration<
    SigningContext,
    AccountContext
  >,
) {
  if (
    !configuration ||
    configuration.enabled !== true ||
    !configuration.provider ||
    !configuration.accountAuthority ||
    ['createAccount', 'findAccount', 'signTypedData'].some(
      (name) =>
        typeof configuration.provider[name as keyof WalletSigningProvider] !==
        'function',
    ) ||
    ['reserve', 'claim', 'finish'].some(
      (name) =>
        typeof configuration.accountAuthority[
          name as keyof StoredAccountAuthority<AccountContext>
        ] !== 'function',
    )
  ) {
    throw new WalletProviderError('wallet_provider_configuration');
  }
  const provider = configuration.provider;
  const createAccount = provider.createAccount.bind(provider);
  const findAccount = provider.findAccount.bind(provider);
  const signTypedData = provider.signTypedData.bind(provider);
  const reserve = configuration.accountAuthority.reserve.bind(
    configuration.accountAuthority,
  );
  const claim = configuration.accountAuthority.claim.bind(
    configuration.accountAuthority,
  );
  const finish = configuration.accountAuthority.finish.bind(
    configuration.accountAuthority,
  );
  const signing = createDurableSigningService(configuration.signingAuthority, {
    provider: provider.provider,
    signTypedData: (record) =>
      signTypedData(
        { accountId: record.accountId, address: record.address },
        record.action,
        record.attemptId,
      ),
  });
  return {
    sign: signing.sign,
    async account(
      context: AccountContext,
      recover = false,
    ): Promise<StoredAccountResult> {
      const boundContext = structuredClone(context);
      let record = structuredClone(await reserve(boundContext, recover));
      if (
        !uuid.test(record.accountId) ||
        !uuid.test(record.attemptId) ||
        !uuid.test(record.leaseToken)
      )
        unavailable();
      if (record.state === 'bound') {
        if (!record.address) unavailable();
        return {
          accountId: record.accountId,
          address: checkedAddress(
            { accountId: record.accountId, address: record.address },
            record.accountId,
          ),
          state: record.state,
        };
      }
      if (recover) {
        // Read the original account identity only. Missing accounts never cause replacement provisioning.
        let found: EmbeddedAccount | null;
        try {
          found = await findAccount(record.accountId);
        } catch {
          return unavailable();
        }
        return finish(
          record,
          found === null ? null : checkedAddress(found, record.accountId),
        );
      }
      if (record.state !== 'admitted') unavailable();
      const reserved = record;
      record = structuredClone(
        await claim(boundContext, structuredClone(reserved)),
      );
      if (
        record.accountId !== reserved.accountId ||
        record.attemptId !== reserved.attemptId ||
        record.state !== 'dispatching' ||
        !uuid.test(record.leaseToken)
      )
        unavailable();
      let address: string;
      try {
        address = checkedAddress(
          await createAccount(record.accountId, record.attemptId),
          record.accountId,
        );
      } catch {
        return finish(record, null);
      }
      // Completion uncertainty propagates: never retry the create or completion write.
      return finish(record, address);
    },
  };
}
