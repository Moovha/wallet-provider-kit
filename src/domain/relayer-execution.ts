import { AbiCoder, getAddress, keccak256 } from 'ethers';
import type { AuthorityContext } from './principal.js';
import { WalletProviderError, type EmbeddedAccount } from './signing.js';

/** Relayer owns the nonce. This is NOT the draft's fully populated Transaction. */
export interface RelayerTransaction {
  to: string;
  value: string;
  data: string;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

export interface RelayerExecutionAction {
  actionId: string;
  operationId: string;
  kind: 'relay_transaction';
  profile: 'oz_relayer_evm_v1';
  profileRevision: '1';
  status: 'ready';
  chainId: 'eip155:84532';
  chainAccountId: string;
  bindingRevision: string;
  capabilityRevision: string;
  planRevision: string;
  planHash: string;
  payloadHash: string;
  expiresAt: string;
  transaction: RelayerTransaction;
}

export interface RelayerAcceptance {
  /** A provider record ID. Never a chain transaction hash or settlement proof. */
  transactionId: string;
}

export interface RelayerExecutionProvider {
  submit(
    account: EmbeddedAccount,
    action: RelayerExecutionAction,
    attemptId: string,
  ): Promise<RelayerAcceptance>;
  /** Read-only; checks current host authority and the original stored request. */
  status(
    account: EmbeddedAccount,
    action: RelayerExecutionAction,
    attemptId: string,
    transactionId: string,
  ): Promise<RelayerTransactionStatus>;
}

export interface RelayerTransactionStatus extends RelayerAcceptance {
  status:
    | 'canceled'
    | 'pending'
    | 'sent'
    | 'submitted'
    | 'mined'
    | 'confirmed'
    | 'failed'
    | 'expired';
  hash?: string;
}

export interface RelayerExecutionAuthorityRecord {
  sessionSubject: string;
  ownerSubject: string;
  currentUserStatus: string | null;
  accountId: string;
  attemptId: string;
  account: EmbeddedAccount;
  bindingRevision: string;
  capabilityRevision: string;
  action: RelayerExecutionAction;
}

export interface RelayerExecutionAuthority {
  /** Load immutable action by ID, verify current owner/grant/KYC/consent and admit its budget durably. */
  execution(
    context: AuthorityContext,
    actionId: string,
    purpose: 'submit' | 'status',
  ): Promise<RelayerExecutionAuthorityRecord | null>;
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const amount = /^(0|[1-9][0-9]{0,77})$/;

/** Hash the approved call/initial fees, not an unsigned Ethereum transaction. */
export function hashRelayerTransaction(
  transaction: RelayerTransaction,
): string {
  try {
    if (
      Object.keys(transaction).sort().join(',') !==
        'data,gasLimit,maxFeePerGas,maxPriorityFeePerGas,to,value' ||
      !/^0x[0-9a-fA-F]{40}$/.test(transaction.to) ||
      /^0x0{40}$/.test(transaction.to) ||
      !/^0x(?:[0-9a-f]{2}){0,8192}$/.test(transaction.data) ||
      ![
        transaction.value,
        transaction.gasLimit,
        transaction.maxFeePerGas,
        transaction.maxPriorityFeePerGas,
      ].every((v) => typeof v === 'string' && amount.test(v)) ||
      BigInt(transaction.value) >= 1n << 256n ||
      ![
        transaction.gasLimit,
        transaction.maxFeePerGas,
        transaction.maxPriorityFeePerGas,
      ].every((v) => BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER)) ||
      BigInt(transaction.gasLimit) < 21000n ||
      BigInt(transaction.maxFeePerGas) === 0n ||
      BigInt(transaction.maxPriorityFeePerGas) >
        BigInt(transaction.maxFeePerGas)
    )
      throw new Error();
    return keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256', 'bytes', 'uint256', 'uint256', 'uint256'],
        [
          getAddress(transaction.to),
          transaction.value,
          transaction.data,
          transaction.gasLimit,
          transaction.maxFeePerGas,
          transaction.maxPriorityFeePerGas,
        ],
      ),
    );
  } catch {
    throw new WalletProviderError('wallet_provider_input');
  }
}

export function validateRelayerAction(
  account: EmbeddedAccount,
  action: RelayerExecutionAction,
  requireUnexpired = true,
): void {
  try {
    if (
      !uuid.test(account.accountId) ||
      /^0x0{40}$/.test(account.address) ||
      !uuid.test(action.actionId) ||
      !uuid.test(action.operationId) ||
      action.kind !== 'relay_transaction' ||
      action.profile !== 'oz_relayer_evm_v1' ||
      action.profileRevision !== '1' ||
      action.status !== 'ready' ||
      action.chainId !== 'eip155:84532' ||
      action.chainAccountId.toLowerCase() !==
        `eip155:84532:${getAddress(account.address).toLowerCase()}` ||
      ![
        action.bindingRevision,
        action.capabilityRevision,
        action.planRevision,
      ].every((r) => /^[1-9][0-9]{0,19}$/.test(r)) ||
      !/^0x[0-9a-f]{64}$/.test(action.planHash) ||
      action.payloadHash !== hashRelayerTransaction(action.transaction) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(action.expiresAt) ||
      !Number.isFinite(Date.parse(action.expiresAt)) ||
      new Date(action.expiresAt).toISOString() !== action.expiresAt ||
      (requireUnexpired && Date.parse(action.expiresAt) <= Date.now())
    )
      throw new Error();
  } catch {
    throw new WalletProviderError('wallet_provider_input');
  }
}

/** Library-only stored-action service. No raw transaction HTTP endpoint is added. */
export class RelayerExecutionService {
  constructor(
    private readonly authority: RelayerExecutionAuthority,
    private readonly provider: RelayerExecutionProvider,
  ) {}

  private async admitted(
    context: AuthorityContext,
    actionId: string,
    purpose: 'submit' | 'status',
  ): Promise<RelayerExecutionAuthorityRecord> {
    let value: RelayerExecutionAuthorityRecord | null;
    try {
      value = await this.authority.execution(context, actionId, purpose);
    } catch {
      throw new WalletProviderError('wallet_provider_unavailable');
    }
    if (
      !value ||
      !value.ownerSubject ||
      !value.account ||
      !value.action ||
      value.sessionSubject !== value.ownerSubject ||
      value.currentUserStatus !== 'ID VERIFIED' ||
      value.action.actionId !== actionId ||
      value.account.accountId !== value.accountId ||
      value.action.bindingRevision !== value.bindingRevision ||
      value.action.capabilityRevision !== value.capabilityRevision
    )
      throw new WalletProviderError('wallet_authorization_denied');
    return value;
  }

  async submit(
    context: AuthorityContext,
    actionId: string,
  ): Promise<RelayerAcceptance> {
    const admitted = await this.admitted(context, actionId, 'submit');
    return this.provider.submit(
      admitted.account,
      admitted.action,
      admitted.attemptId,
    );
  }

  async status(
    context: AuthorityContext,
    actionId: string,
    transactionId: string,
  ): Promise<RelayerTransactionStatus> {
    const admitted = await this.admitted(context, actionId, 'status');
    return this.provider.status(
      admitted.account,
      admitted.action,
      admitted.attemptId,
      transactionId,
    );
  }
}
