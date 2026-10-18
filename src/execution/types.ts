import type { SecretReference } from '../deployment/config.js';
import type { RelayerBinding } from '../providers/relayer-client.js';
import type { WalletAttemptRequest } from '../domain/attempt-journal.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import type {
  ServiceSigningKey,
  ServiceVerificationKey,
} from '../executor/auth.js';
import type { TypedDataAction } from '../domain/signing.js';

export const executionProfile = 'erc3009-relayer-v1' as const;
export const designatedExecutionProfile = 'erc3009-executor-v1' as const;
export type ExecutionProfile =
  | typeof executionProfile
  | typeof designatedExecutionProfile
  | 'approved-evm-executor-v1';

export interface ExecutionSponsor {
  clientId: string;
  accountId: string;
  binding: Pick<RelayerBinding, 'address' | 'bindingRevision'> &
    Partial<Pick<RelayerBinding, 'relayerId' | 'signerId'>>;
  fundingAgreement: string;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  l1FeeReserveWei: string;
  lifetimeBudgetWei: string;
}

/** Optional versioned approved-action execution. Secrets and RPC addresses remain server configuration. */
export interface ExecutionConfiguration {
  profile: ExecutionProfile;
  relayer?: { url: string; apiKey: SecretReference };
  service?: {
    url: string;
    providerId: string;
    providerRevision: string;
    signing: ServiceSigningKey;
    keys: ServiceVerificationKey[];
  };
  rpc: {
    endpoints: SecretReference[];
    genesisHash: string;
    tokenCodeHash?: string;
  };
  sponsors: ExecutionSponsor[];
  sponsorPool?: { strategy: 'round-robin'; maxInFlightPerSponsor: number };
  safeQueue?: { maxDepthPerSafe: number; maxWaitSeconds: number };
  recovery?: import('./recovery.js').RecoveryConfiguration;
  pollIntervalSeconds: number;
  maxLogRange: number;
}

/** Immutable private plan. Requests may propose policy-controlled calls; execute uses only this stored envelope and server-selected sponsor. */
export interface ApprovedExecutionPlan {
  profile: ExecutionProfile;
  revision: '1';
  action: TypedDataAction;
  sponsor: ExecutionSponsor;
  configurationHash: string;
  genesisHash: string;
  tokenCodeHash?: string;
  data: string;
  scanFromBlock: string;
  intent?: import('./approved-calls.js').ApprovedCallIntent;
}

export interface ChainObservation {
  chain_status:
    'unobserved' | 'pending' | 'included' | 'safe' | 'finalized' | 'reorged';
  verification: 'unverified' | 'rpc-quorum';
  outcome: 'unknown' | 'succeeded' | 'reverted';
  settlement: 'pending' | 'succeeded' | 'reverted';
  observed_at: string;
  transaction_hash?: string;
  block_hash?: string;
  block_number?: string;
  execution_origin?: 'sponsor' | 'external';
}

export interface TransferExecutionRecord {
  profile: ExecutionProfile;
  revision: '1';
  executionId: string;
  signingKey: string;
  dispatchPrincipal?: VerifiedPrincipal;
  dispatchLeaseUntil?: number;
  configurationHash: string;
  sponsorClientId: string;
  sponsorAccountId?: string;
  sponsorAddress?: string;
  startedAt?: number;
  providerNonce?: string;
  recovery?: import('./recovery.js').RecoveryDiagnosis;
  plan?: TransferExecutionPlan;
  planHash?: string;
  observation?: ChainObservation;
  observationRevision: number;
  integrityFailure?: boolean;
  effectObserved?: boolean;
  transactionHashes?: string[];
  scanNextBlock?: string;
  events?: ExecutionCloudEvent[];
  eventSequence?: number;
  lastDispatchStatus?: ExecutionReceipt['dispatch_status'];
}

export interface ExecutionReceipt extends ChainObservation {
  recovery?: import('./recovery.js').RecoveryDiagnosis;
  profile: ExecutionProfile;
  profile_revision: '1';
  action_id: string;
  execution_id: string;
  dispatch_status:
    'not_started' | 'pending' | 'accepted' | 'unknown' | 'failed';
  observation_revision: number;
  outcome_scope?:
    | 'token-transfer'
    | 'contract-execution'
    | 'swap-effects'
    | 'vault-deposit-effects';
  next_poll_after_ms: number;
}

export interface ExecutionDispatchContext {
  executionId: string;
  request: WalletAttemptRequest;
  authorizeEffect?: () => Promise<void>;
}
export interface ExecutionRecovery {
  accepted: boolean;
  transactionId?: string;
  transactionHash?: string;
}
export interface ExecutionProvider {
  inspect?(
    plan: TransferExecutionPlan,
    transactionId: string,
  ): Promise<import('./recovery.js').ProviderInspection>;
  prepare(plan: TransferExecutionPlan): Promise<void>;
  submit(
    plan: TransferExecutionPlan,
    context?: ExecutionDispatchContext,
  ): Promise<string>;
  recover?(
    plan: TransferExecutionPlan,
    context: ExecutionDispatchContext,
  ): Promise<ExecutionRecovery>;
  transactionHash(
    plan: TransferExecutionPlan,
    transactionId: string,
  ): Promise<string | undefined>;
}

export interface ExecutionObserver {
  nonceSnapshot?(
    plan: TransferExecutionPlan,
    ownHash?: string,
  ): Promise<import('./recovery.js').NonceSnapshot>;
  anchor(): Promise<string>;
  preflight(plan: TransferExecutionPlan): Promise<void>;
  observe(
    plan: TransferExecutionPlan,
    candidates: string[],
    ownHash?: string,
    scanFromBlock?: string,
  ): Promise<ChainObservation & { scanNextBlock?: string }>;
}

/** CloudEvents 1.0 envelope; data semantics are pinned by the execution profile revision. */
export interface ExecutionCloudEvent {
  specversion: '1.0';
  id: string;
  source: string;
  type: 'com.moovha.wallet-provider.execution.observed.v1';
  subject: string;
  time: string;
  datacontenttype: 'application/json';
  sequence: number;
  data: ExecutionReceipt;
}

/** Common immutable execution envelope; transfer plans remain source compatible. */
export type TransferExecutionPlan = ApprovedExecutionPlan;
