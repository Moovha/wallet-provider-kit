import { recoverAddress, TypedDataEncoder, toQuantity } from 'ethers';
import type {
  JournaledProviderOptions,
  WalletAttemptClaim,
  WalletAttemptJournal,
  WalletAttemptRequest,
  WalletAttemptResult,
} from '../domain/attempt-journal.js';
import {
  validateRelayerAction,
  type RelayerExecutionProvider,
  type RelayerExecutionAction,
  type RelayerTransactionStatus,
} from '../domain/relayer-execution.js';
import {
  WalletProviderError,
  type EmbeddedAccount,
  type WalletSigningProvider,
} from '../domain/signing.js';
import {
  createAttemptLifecycle,
  journalUnavailable,
} from './attempt-lifecycle.js';
import { evmTypedDataPayload } from './evm-typed-data.js';
import { createJournaledWalletProvider } from './journaled.js';
import {
  createRelayerClient,
  record,
  uuid,
  type RelayerConnection,
} from './relayer-client.js';

export {
  RelayerExecutionService,
  hashRelayerTransaction,
} from '../domain/relayer-execution.js';
export type {
  RelayerTransaction,
  RelayerExecutionAction,
  RelayerExecutionAuthority,
  RelayerExecutionAuthorityRecord,
  RelayerExecutionProvider,
  RelayerAcceptance,
  RelayerTransactionStatus,
} from '../domain/relayer-execution.js';
export type { RelayerConnection, RelayerBinding } from './relayer-client.js';

export interface RelayerAttemptJournal extends WalletAttemptJournal {
  /** No claims, reservations, state transitions or writes during read. */
  read(request: WalletAttemptRequest): Promise<WalletAttemptClaim | null>;
}
export interface RelayerAttemptOptions extends JournaledProviderOptions {
  journal: RelayerAttemptJournal;
  /** Current read permission for the original attempt; no new spending lease required. */
  authorizeStatus(request: WalletAttemptRequest): Promise<boolean>;
}

async function authorize(
  callback: JournaledProviderOptions['authorizeAttempt'],
  request: WalletAttemptRequest,
): Promise<void> {
  let allowed: boolean;
  try {
    allowed = await callback(request);
  } catch {
    throw new WalletProviderError('wallet_provider_unavailable');
  }
  if (allowed !== true)
    throw new WalletProviderError('wallet_authorization_denied');
}

/** Binds preconfigured Relayer keys; never creates a signer or wallet through its admin API. */
export function createOpenZeppelinRelayerWalletProvider(
  connection: RelayerConnection,
  attempts: JournaledProviderOptions,
  request: typeof fetch = fetch,
): WalletSigningProvider {
  const client = createRelayerClient(connection, request);
  const providerName = 'openzeppelin-relayer-v1';
  const lifecycle = createAttemptLifecycle(providerName, attempts);
  const policy = { ...attempts };
  const backend: WalletSigningProvider = {
    provider: providerName,
    async createAccount(accountId) {
      const selected = await client.binding(accountId);
      if (!selected)
        throw new WalletProviderError('wallet_authorization_denied');
      return { accountId, address: selected.binding.address };
    },
    async findAccount(accountId) {
      const selected = await client.binding(accountId, false);
      return selected ? { accountId, address: selected.binding.address } : null;
    },
    async signTypedData(account, action, attemptId) {
      const boundAccount = structuredClone(account);
      const boundAction = structuredClone(action);
      evmTypedDataPayload(boundAccount, boundAction, connection.network);
      const selected = await client.binding(boundAccount.accountId);
      if (
        !selected ||
        selected.binding.address.toLowerCase() !==
          boundAccount.address.toLowerCase() ||
        selected.binding.bindingRevision !== boundAction.binding_revision
      )
        throw new WalletProviderError('wallet_authorization_denied');
      const admitted = lifecycle.request(
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
      await authorize(policy.authorizeAttempt, admitted);
      await client.current(boundAccount.accountId, selected.binding);
      evmTypedDataPayload(boundAccount, boundAction, connection.network);
      const { EIP712Domain: _domain, ...types } = boundAction.payload.types;
      const body = JSON.stringify({
        domain_separator: TypedDataEncoder.hashDomain(
          boundAction.payload.domain,
        ),
        hash_struct_message: TypedDataEncoder.from(types).hash(
          boundAction.payload.message,
        ),
      });
      const data = await client.call(
        'POST',
        `/relayers/${selected.binding.relayerId}/sign-typed-data`,
        body,
      );
      try {
        if (
          !data ||
          typeof data.sig !== 'string' ||
          !/^(?:0x)?[0-9a-fA-F]{130}$/.test(data.sig) ||
          recoverAddress(
            boundAction.payload_hash,
            data.sig.startsWith('0x') ? data.sig : `0x${data.sig}`,
          ).toLowerCase() !== selected.binding.address.toLowerCase()
        )
          throw new Error();
        return data.sig.startsWith('0x') ? data.sig : `0x${data.sig}`;
      } catch {
        throw new WalletProviderError('wallet_provider_response', 'unknown');
      }
    },
  };
  return createJournaledWalletProvider(backend, attempts);
}

const statuses = [
  'canceled',
  'pending',
  'sent',
  'submitted',
  'mined',
  'confirmed',
  'failed',
  'expired',
];

/** Relayer allocates nonces and owns its queue/broadcast workers. Host approval stays here. */
export function createOpenZeppelinRelayerExecutor(
  connection: RelayerConnection,
  options: RelayerAttemptOptions,
  request: typeof fetch = fetch,
): RelayerExecutionProvider {
  const client = createRelayerClient(connection, request);
  const policy = { ...options };
  if (
    typeof options.journal?.read !== 'function' ||
    typeof options.authorizeStatus !== 'function'
  )
    throw new WalletProviderError('wallet_provider_configuration');
  const journal = options.journal;
  const lifecycle = createAttemptLifecycle(
    'openzeppelin-relayer-execution-v1',
    options,
  );

  function attempt(
    account: EmbeddedAccount,
    action: RelayerExecutionAction,
    attemptId: string,
  ): WalletAttemptRequest {
    return lifecycle.request(
      'relay_transaction',
      account.accountId,
      attemptId,
      action.actionId,
      {
        account: {
          accountId: account.accountId,
          address: account.address.toLowerCase(),
        },
        action,
      },
    );
  }

  function result(value: WalletAttemptResult): WalletAttemptResult {
    if (
      !value ||
      value.kind !== 'relay_transaction' ||
      !uuid.test(value.transactionId)
    )
      throw new WalletProviderError('wallet_provider_response', 'unknown');
    return { kind: 'relay_transaction', transactionId: value.transactionId };
  }

  function transactionResponse(
    data: Record<string, unknown> | null,
    account: EmbeddedAccount,
    action: RelayerExecutionAction,
    relayerId: string,
  ): RelayerTransactionStatus {
    const tx = action.transaction;
    try {
      if (
        !data ||
        typeof data.id !== 'string' ||
        !uuid.test(data.id) ||
        data.relayer_id !== relayerId ||
        typeof data.from !== 'string' ||
        data.from.toLowerCase() !== account.address.toLowerCase() ||
        typeof data.to !== 'string' ||
        data.to.toLowerCase() !== tx.to.toLowerCase() ||
        typeof data.value !== 'string' ||
        !/^(?:0x[0-9a-fA-F]{1,64}|0|[1-9][0-9]{0,77})$/.test(data.value) ||
        BigInt(data.value) !== BigInt(tx.value) ||
        (data.data ?? '0x') !== tx.data ||
        typeof data.status !== 'string' ||
        !statuses.includes(data.status) ||
        data.gas_limit !== Number(tx.gasLimit) ||
        (data.hash != null &&
          (typeof data.hash !== 'string' ||
            !/^0x[0-9a-fA-F]{64}$/.test(data.hash))) ||
        (data.max_fee_per_gas != null &&
          (!/^[0-9]+$/.test(String(data.max_fee_per_gas)) ||
            BigInt(String(data.max_fee_per_gas)) > BigInt(tx.maxFeePerGas)))
      )
        throw new Error();
      return {
        transactionId: data.id,
        status: data.status as RelayerTransactionStatus['status'],
        ...(data.hash ? { hash: data.hash as string } : {}),
      };
    } catch {
      throw new WalletProviderError('wallet_provider_response', 'unknown');
    }
  }

  function snapshot(
    account: EmbeddedAccount,
    action: RelayerExecutionAction,
    requireUnexpired = true,
  ) {
    try {
      const boundAccount = structuredClone(account);
      const boundAction = structuredClone(action);
      validateRelayerAction(
        boundAccount,
        boundAction,
        requireUnexpired,
        connection.network,
      );
      return { boundAccount, boundAction };
    } catch {
      throw new WalletProviderError('wallet_provider_input');
    }
  }

  return {
    async submit(account, action, attemptId) {
      const { boundAccount, boundAction } = snapshot(account, action);
      const admitted = attempt(boundAccount, boundAction, attemptId);
      const accepted = await lifecycle.execute(
        admitted,
        async () => {
          const selected = await client.binding(boundAccount.accountId);
          if (
            !selected ||
            selected.binding.address.toLowerCase() !==
              boundAccount.address.toLowerCase() ||
            selected.binding.bindingRevision !== boundAction.bindingRevision
          )
            throw new WalletProviderError('wallet_authorization_denied');
          const tx = boundAction.transaction;
          const policies = selected.metadata.policies;
          // Require a normal-bump fee cap and explicit gas limit. NOOP recovery costs are separate.
          if (
            !record(policies) ||
            policies.gas_limit_estimation !== false ||
            !Number.isSafeInteger(policies.gas_price_cap) ||
            Number(policies.gas_price_cap) <= 0 ||
            BigInt(Number(policies.gas_price_cap)) > BigInt(tx.maxFeePerGas)
          )
            throw new WalletProviderError('wallet_provider_configuration');
          await authorize(policy.authorizeAttempt, admitted);
          await client.current(boundAccount.accountId, selected.binding);
          validateRelayerAction(
            boundAccount,
            boundAction,
            true,
            connection.network,
          );
          // v1.8.0 uses Alloy U256 hex strings; bounded u64/u128 fields use exact safe JSON numbers.
          const body = JSON.stringify({
            to: tx.to,
            value: toQuantity(BigInt(tx.value)),
            data: tx.data,
            gas_limit: Number(tx.gasLimit),
            max_fee_per_gas: Number(tx.maxFeePerGas),
            max_priority_fee_per_gas: Number(tx.maxPriorityFeePerGas),
            valid_until: boundAction.expiresAt,
          });
          const data = await client.call(
            'POST',
            `/relayers/${selected.binding.relayerId}/transactions`,
            body,
          );
          const accepted = transactionResponse(
            data,
            boundAccount,
            boundAction,
            selected.binding.relayerId,
          );
          return {
            kind: 'relay_transaction',
            transactionId: accepted.transactionId,
          };
        },
        result,
        () =>
          validateRelayerAction(
            boundAccount,
            boundAction,
            true,
            connection.network,
          ),
      );
      if (accepted.kind !== 'relay_transaction') throw journalUnavailable();
      return { transactionId: accepted.transactionId };
    },
    async status(account, action, attemptId, transactionId) {
      // Reading original accepted work remains possible after its dispatch deadline.
      const { boundAccount, boundAction } = snapshot(account, action, false);
      if (!uuid.test(transactionId))
        throw new WalletProviderError('wallet_provider_input');
      const admitted = attempt(boundAccount, boundAction, attemptId);
      await authorize(policy.authorizeStatus, admitted);
      let stored: WalletAttemptClaim | null;
      try {
        stored = structuredClone(await journal.read(admitted));
      } catch {
        throw journalUnavailable();
      }
      if (
        !stored ||
        stored.attemptId !== admitted.attemptId ||
        stored.resourceKey !== admitted.resourceKey ||
        stored.requestHash !== admitted.requestHash ||
        stored.state !== 'succeeded' ||
        !record(stored.result) ||
        stored.result.kind !== 'relay_transaction' ||
        stored.result.transactionId !== transactionId
      )
        throw new WalletProviderError('wallet_authorization_denied');
      const selected = await client.binding(boundAccount.accountId, false);
      if (
        !selected ||
        selected.binding.address.toLowerCase() !==
          boundAccount.address.toLowerCase() ||
        selected.binding.bindingRevision !== boundAction.bindingRevision
      )
        throw new WalletProviderError('wallet_authorization_denied');
      await authorize(policy.authorizeStatus, admitted);
      const data = await client.call(
        'GET',
        `/relayers/${selected.binding.relayerId}/transactions/${transactionId}`,
      );
      await authorize(policy.authorizeStatus, admitted);
      await client.current(boundAccount.accountId, selected.binding);
      const observed = transactionResponse(
        data,
        boundAccount,
        boundAction,
        selected.binding.relayerId,
      );
      if (observed.transactionId !== transactionId)
        throw new WalletProviderError('wallet_provider_response');
      return observed;
    },
  };
}
