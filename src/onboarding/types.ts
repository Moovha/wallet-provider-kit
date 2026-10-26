import type { ApprovedCallsRecord } from '../deployment/actions.js';
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
  'contracts:request',
  'members:manage',
  'owners:manage',
] as const;
/** Contract delegation must be explicitly enabled; it is never a default permission. */
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
    action_policy_revision?: string;
    source_application_id?: string;
    sharing_revision?: string;
    account_id?: string;
    wallet_reference?: string;
    membership_revision?: number;
  };
}
export interface WalletDescription {
  reference: string;
  name: string;
  kind: 'personal' | 'shared';
}
/** A request may reuse the caller's current stored identity evidence; consent is always supplied. */
export type AccessRequestInput = Omit<AccessInput, 'user'> & {
  user?: Omit<ApplicationUserAssertion, 'identity'> & {
    identity?: ApplicationUserAssertion['identity'];
  };
};
export interface AccessInput {
  mode: 'create' | 'connect' | 'connect_from_application';
  source_application_id?: string;
  source_account_id?: string;
  wallet?: WalletDescription;
  account_id?: string;
  identity_record?: ApplicationIdentityRecord;
  user?: ApplicationUserAssertion;
  authorization_details: [{ type: typeof accessType; actions: Permission[] }];
}
export interface WalletSharingPolicy {
  revision?: string;
  applications: string[];
  matchingFields: string[];
  agreement: string;
}
export interface ApplicationPolicy {
  issuer: string;
  clientId: string;
  name: string;
  enabled?: boolean;
  /** Explicit permission to attest user identity and consent; an OAuth scope alone is insufficient. */
  assertionTrust?: { agreement: string };
  walletSharing?: WalletSharingPolicy;
  permissions?: Permission[];
  /** Contractually agreed reimbursement, not a payment instruction or vendor price quote. */
  funding?: { agreement: string; monthlyLimitMinor: number };
}
/** Shared requirements for application-attested identity and wallet consent. */
export interface UserCheckSettings {
  required_fields: string[];
  verification_level: string;
  max_identity_age_days: number;
  max_access_days: number;
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
  readonly consentRevision?: string;
  currentApplication?: (principal: VerifiedPrincipal) => ApplicationPolicy;
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
export interface VerifiedUserRecord {
  id: string;
  issuer: string;
  clientId: string;
  userId: string;
  identity: ApplicationUserAssertion['identity'];
  evidenceHash: string;
  acceptedUntil: number;
  revision: string;
}
export interface WalletMember {
  name?: string;
  id: string;
  issuer: string;
  clientId: string;
  userId: string;
  permissions: Permission[];
  revision: number;
  state: 'invited' | 'active' | 'removed';
  sourceSharing?: { applicationId: string; revision: string };
}
export interface AccessRequest {
  userOwner?: string;
  membership?: { personId: string; revision: number };
  sharing?: {
    sourceApplicationId: string;
    sourceRequestId: string;
    subjectOwner: string;
    revision: string;
    evidenceHash: string;
  };
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
  actionPolicyRevision?: string;
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
  creatorApplication?: { issuer: string; clientId: string };
  wallet?: WalletDescription;
  members?: Record<string, WalletMember>;
  membersRevision?: number;
  /** Permanent application-user bindings; sharing never replaces the original owner. */
  linkedOwners?: string[];
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
  actionPolicyRevision?: string;
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
  verifiedUsers?: Record<string, VerifiedUserRecord>;
  managementCommands?: Record<
    string,
    { hash: string; result: unknown; at: number }
  >;
  management?: Record<
    string,
    import('../management/service.js').ManagementState
  >;
  format: 'moovha-onboarding-1';
  assetReservations?: Record<string, { budgetId: string; units: string }>;
  assetBudgetBindings?: Record<string, { revision: string }>;
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
  supportedActions?: Record<string, ApprovedCallsRecord>;
  deploymentBindings?: Record<
    string,
    {
      origin: string;
      provider: string;
      binding: string;
      network?: import('../networks.js').ProviderNetwork;
      activeRevision?: string;
      transportRevision?: string;
      networkSetRevision?: string;
      managementInstallationId?: string;
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
