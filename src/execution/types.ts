import type { SecretReference } from '../deployment/config.js';
import type { RelayerBinding } from '../providers/relayer-client.js';
import type { TypedDataAction } from '../domain/signing.js';

export const executionProfile = 'erc3009-relayer-v1' as const;

export interface ExecutionSponsor {
  clientId: string;
  accountId: string;
  binding: RelayerBinding;
  fundingAgreement: string;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  l1FeeReserveWei: string;
  lifetimeBudgetWei: string;
}

/** Optional fixed-profile execution. Secrets and RPC addresses remain server configuration. */
export interface ExecutionConfiguration {
  profile: typeof executionProfile;
  relayer: { url: string; apiKey: SecretReference };
  rpc: {
    endpoints: SecretReference[];
    genesisHash: string;
    tokenCodeHash: string;
  };
  sponsors: ExecutionSponsor[];
  pollIntervalSeconds: number;
  maxLogRange: number;
}

/** Immutable private plan. HTTP callers never supply calldata, signatures or a sponsor. */
export interface TransferExecutionPlan {
  profile: typeof executionProfile;
  revision: '1';
  action: TypedDataAction;
  sponsor: ExecutionSponsor;
  configurationHash: string;
  genesisHash: string;
  tokenCodeHash: string;
  data: string;
  scanFromBlock: string;
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
  profile: typeof executionProfile;
  revision: '1';
  executionId: string;
  signingKey: string;
  configurationHash: string;
  sponsorClientId: string;
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
  profile: typeof executionProfile;
  profile_revision: '1';
  action_id: string;
  execution_id: string;
  dispatch_status:
    'not_started' | 'pending' | 'accepted' | 'unknown' | 'failed';
  observation_revision: number;
  next_poll_after_ms: number;
}

export interface ExecutionProvider {
  prepare(plan: TransferExecutionPlan): Promise<void>;
  submit(plan: TransferExecutionPlan): Promise<string>;
  transactionHash(
    plan: TransferExecutionPlan,
    transactionId: string,
  ): Promise<string | undefined>;
}

export interface ExecutionObserver {
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
