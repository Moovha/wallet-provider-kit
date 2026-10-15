import type { VerifiedPrincipal } from '../domain/principal.js';
import type {
  WalletAttemptRequest,
  WalletAttemptResult,
  WalletAttemptFailure,
} from '../domain/attempt-journal.js';

export const accessType = 'https://moovha.com/wallet/account-access';
export const permissions = ['account:read', 'operations:request'] as const;
export type Permission = (typeof permissions)[number];
export type Vendor = 'didit' | 'sumsub';
export interface AccessInput {
  mode: 'create' | 'connect';
  account_id?: string;
  authorization_details: [{ type: typeof accessType; actions: Permission[] }];
}
export interface ApplicationPolicy {
  issuer: string;
  clientId: string;
  name: string;
  enabled?: boolean;
  permissions?: Permission[];
  /** Contractually agreed reimbursement, not a payment instruction or vendor price quote. */
  funding?: { agreement: string; monthlyLimitMinor: number };
}
export interface OnboardingPolicy {
  version: string;
  provider: { name: string; origin: string; privacyUrl: string };
  applications: ApplicationPolicy[];
  identity?: { maxAgeDays?: number };
  access?: { maxAgeDays?: number };
}
export interface ResolvedPolicy extends OnboardingPolicy {
  identity: { maxAgeDays: number };
  access: { maxAgeDays: number };
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
}
export interface AccessGrant {
  id: string;
  requestId: string;
  accountId: string;
  owner: string;
  caller: AccessRequest['caller'];
  permissions: Permission[];
  revision: string;
  expiresAt: number;
  state: 'active' | 'suspended' | 'revoked';
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
