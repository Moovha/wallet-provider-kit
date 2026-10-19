import type { RelayerBinding } from '../providers/openzeppelin-relayer.js';
import type { TransferRecord } from '../deployment/actions.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import type {
  WalletAttemptRequest,
  WalletAttemptResult,
  WalletAttemptFailure,
} from '../domain/attempt-journal.js';

export const accessType = 'https://moovha.com/wallet/account-access';
export const permissions = [
  'account:read',
  'operations:request',
  'transfers:request',
  'contracts:request',
] as const;
/** Transfer delegation must be explicitly enabled; it is never a default permission. */
export const defaultPermissions: readonly Permission[] = [
  'account:read',
  'operations:request',
];
export type Permission = (typeof permissions)[number];
export type Vendor = 'didit' | 'sumsub';
/** Application assertions for an unfunded evaluation; not externally verified identity evidence. */
export interface ApplicationIdentityRecord {
  reference: string;
  fields: Record<string, string>;
}
export interface ApplicationRecordPolicy {
  requiredFields: string[];
}
/** Attested by a registered application under an explicit provider trust agreement. */
export interface ApplicationUserAssertion {
  id: string;
  identity: {
    reference: string;
    level: string;
    verified_at: string;
    fields: Record<string, string>;
  };
  consent: {
    reference: string;
    granted_at: string;
    expires_at: string;
    policy_revision: string;
    transfer_policy_revision?: string;
    action_policy_revision?: string;
  };
}
export interface AccessInput {
  mode: 'create' | 'connect';
  account_id?: string;
  identity_record?: ApplicationIdentityRecord;
  user?: ApplicationUserAssertion;
  authorization_details: [{ type: typeof accessType; actions: Permission[] }];
}
export interface ApplicationPolicy {
  issuer: string;
  clientId: string;
  name: string;
  enabled?: boolean;
  /** Explicit permission to attest user identity and consent; an OAuth scope alone is insufficient. */
  assertionTrust?: { agreement: string };
  permissions?: Permission[];
  /** Contractually agreed reimbursement, not a payment instruction or vendor price quote. */
  funding?: { agreement: string; monthlyLimitMinor: number };
}
export interface OnboardingPolicy {
  version: string;
  provider: { name: string; origin: string; privacyUrl: string };
  applications: ApplicationPolicy[];
  identity?: {
    maxAgeDays?: number;
    application?: { requiredFields: string[]; verificationLevel: string };
    /** Explicit provider-reviewed record submission for unfunded, read-only evaluation. */
    records?: ApplicationRecordPolicy;
  };
  access?: { maxAgeDays?: number; mode?: 'application' | 'hosted' };
}
export interface ResolvedPolicy extends OnboardingPolicy {
  identity: {
    maxAgeDays: number;
    records?: ApplicationRecordPolicy;
    application?: { requiredFields: string[]; verificationLevel: string };
  };
  access: { maxAgeDays: number; mode: 'application' | 'hosted' };
  revision: string;
}
export interface VendorPrice {
  /** Upper bound in USD cents, confirmed with the vendor for this configured workflow/level. */
  maximumMinor: number;
  termsReference: string;
}
export interface IdentityEvidence {
  vendor: Vendor;
  reference: string;
  correlation: string;
  status: 'approved' | 'review' | 'rejected';
  /** Recipient review time. Retrieval/import time must never substitute for verification time. */
  verifiedAt?: string;
  fetchedAt: string;
}
export interface IdentityAdapter {
  vendor: Vendor;
  /** Public workflow/level and review profile identity; excludes credentials. */
  policyFingerprint?: string;
  price?: VendorPrice;
  verificationPrice?: VendorPrice;
  startVerification?(
    correlation: string,
  ): Promise<{ url: string; reference?: string }>;
  readByCorrelation?(correlation: string): Promise<IdentityEvidence>;
  importShared(token: string, correlation: string): Promise<IdentityEvidence>;
  read(reference: string, correlation: string): Promise<IdentityEvidence>;
}
export interface OwnerIdentity {
  issuer: string;
  subject: string;
  authenticatedAt: number;
}
export interface AccessRequest {
  runtimePolicy?: import('../runtime-configuration/authority.js').RuntimePolicySnapshot;
  id: string;
  caller: Pick<VerifiedPrincipal, 'issuer' | 'subject' | 'clientId'>;
  input: AccessInput;
  revision: string;
  createdAt: number;
  expiresAt: number;
  accountId: string;
  owner?: string;
  ownerIdentity?: Pick<OwnerIdentity, 'issuer' | 'subject'>;
  consent?: { at: number; revision: string; privacyUrl: string };
  /** Financial-policy terms explicitly consented to for delegated transfers. */
  transferPolicyRevision?: string;
  denied?: boolean;
  fundingRequired?: boolean;
  evidence?: IdentityEvidence;
  verification?: { vendor: Vendor; url: string; reference?: string };
  importAttempt?: {
    vendor: Vendor;
    fingerprint: string;
    state: 'pending' | 'unknown' | 'complete';
    budgetKey: string;
    reservedMinor: number;
    startedAt: number;
  };
  acceptance?: {
    reviewer: string;
    evidenceHash: string;
    at: number;
    expiresAt: number;
    source?: 'application_record' | 'application_attestation';
  };
  grantId?: string;
}
export interface AccountRecord {
  id: string;
  owner: string;
  acceptedUntil: number;
  acceptanceRevision: string;
  evidenceHash: string;
  status: 'active' | 'suspended';
  address?: string;
  identitySource?: 'application_record' | 'application_attestation';
}
export interface AccessGrant {
  transferPolicyRevision?: string;
  id: string;
  requestId: string;
  accountId: string;
  owner: string;
  caller: AccessRequest['caller'];
  permissions: Permission[];
  revision: string;
  expiresAt: number;
  state: 'active' | 'suspended' | 'revoked';
  /** Explicit withdrawal, distinct from replacing a grant during renewal. */
  withdrawnAt?: number;
}
export interface StoredAttempt {
  request: WalletAttemptRequest;
  grantId: string;
  lease: string;
  expiresAt: number;
  state: 'dispatch' | 'succeeded' | 'failed' | 'unknown';
  result?: WalletAttemptResult;
  failure?: WalletAttemptFailure;
}
export interface ProviderState {
  format: 'moovha-onboarding-1';
  assetReservations?: Record<string, { budgetId: string; units: string }>;
  assetBudgetMigrations?: Record<
    string,
    { revision: string; profile: 'direct-token-transfers-v1' }
  >;
  userOperationExecutions?: Record<
    string,
    import('../sponsorship/execution-types.js').UserOperationExecution
  >;
  userOperationBatches?: Record<
    string,
    import('../sponsorship/execution-types.js').UserOperationBatch
  >;
  executionBindings?: Record<
    string,
    { mechanism: import('../storage/execution-binding.js').OperationMechanism }
  >;
  sponsorships?: Record<
    string,
    import('../sponsorship/admission.js').SponsorshipAdmission
  >;
  operations?: Record<
    string,
    import('../execution/operations.js').OperationsState
  >;
  executionPools?: Record<string, number>;
  sponsorQuarantines?: Record<string, string[]>;
  safeRequests?: Record<
    string,
    import('../execution/queue.js').SafeQueueRecord
  >;
  supportedActions?: Record<string, TransferRecord>;
  backendAccounts?: Record<string, { binding: string; signer: RelayerBinding }>;
  deploymentBindings?: Record<
    string,
    {
      origin: string;
      provider: string;
      binding: string;
      network?: import('../networks.js').ProviderNetwork;
      activeRevision?: string;
      transportRevision?: string;
      accessMode?: 'application' | 'hosted';
      runtimeConfiguration?: import('../runtime-configuration/service.js').RuntimeConfigurationState;
    }
  >;
  requests: Record<string, AccessRequest>;
  accounts: Record<string, AccountRecord>;
  grants: Record<string, AccessGrant>;
  idempotency: Record<string, { hash: string; id: string }>;
  budgets: Record<string, number>;
  evidenceOwners: Record<string, string>;
  attempts: Record<string, StoredAttempt>;
  admissions: Record<
    string,
    { accountId: string; grantId: string; caller: AccessRequest['caller'] }
  >;
  sessions: Record<
    string,
    { owner: OwnerIdentity; expiresAt: number; csrf: string }
  >;
  logins: Record<
    string,
    {
      verifier: string;
      nonce: string;
      browserHash: string;
      requestId: string;
      expiresAt: number;
    }
  >;
  audit: { at: number; event: string; resource: string; revision: string }[];
}
/** Callback is synchronous; never make vendor/network calls inside a storage transaction. */
export interface OnboardingStore {
  transaction<T>(operation: (state: ProviderState) => T): Promise<T>;
}
