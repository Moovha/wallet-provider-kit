import type { SignedUserOperationV07 } from './bundler.js';
import type {
  WalletCallsReceipt,
  WalletCallsMetadata,
  WalletCallsBatchSummary,
} from '../wallet-calls/types.js';
import type {
  ApprovedCallIntent,
  ApprovedCallInput,
} from '../execution/approved-calls.js';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
export interface UserOperationObservation {
  state: 'pending' | 'included' | 'safe' | 'finalized' | 'reorged';
  receipt?: WalletCallsReceipt;
  actualGasCost?: string;
  actualGasUsed?: string;
  observedAt: string;
  scanNextBlock: string;
}
export interface UserOperationExecution {
  operationId: string;
  configurationHash: string;
  sponsorshipHash: string;
  operation: SignedUserOperationV07;
  intent: ApprovedCallIntent;
  userOperationHash: string;
  scanFromBlock: string;
  planHash: string;
  dispatch?: {
    token: string;
    expiresAt: number;
    state: 'dispatch' | 'accepted' | 'unknown';
  };
  observation: UserOperationObservation;
  observationRevision: number;
}
export interface UserOperationBatch {
  id: string;
  metadata: WalletCallsMetadata;
  context: AuthorityContext;
  input: ApprovedCallInput;
  owner: string;
  grantId: string;
  consentReference: string;
  address: string;
  configurationHash: string;
  revision: string;
  expiresAt: string;
  sequence: number;
  operationId?: string;
  stage: 'queued' | 'processing' | 'blocked' | 'complete' | 'expired';
}
export interface WalletCallsDriver {
  handles(accountId: string): boolean;
  capabilities(principal: VerifiedPrincipal, accountId: string): Promise<void>;
  acceptPaymaster(value: unknown): void;
  assertSize(
    principal: VerifiedPrincipal,
    input: ApprovedCallInput,
  ): Promise<void>;
  enqueue(
    context: AuthorityContext,
    input: ApprovedCallInput,
    metadata: WalletCallsMetadata,
  ): Promise<void>;
  status(
    principal: VerifiedPrincipal,
    accountId: string,
    id: string,
  ): Promise<import('../wallet-calls/types.js').WalletCallsStatus>;
  list(
    principal: VerifiedPrincipal,
    authorizeOperator?: (
      state: import('../onboarding/types.js').ProviderState,
    ) => void,
  ): Promise<{ truncated: boolean; batches: WalletCallsBatchSummary[] }>;
}
