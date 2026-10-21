# TypeScript API reference

Use these declarations when embedding the toolkit in your own server. Start with
[TypeScript integration](api.md) to choose the module and responsibility boundary.
Applications calling a running provider use the [HTTP API](http-api.md) instead.

These excerpts preserve exact source names and are not standalone programs.
Follow each source link for its declaration. The root `@moovha/wallet-provider-kit`
re-exports core, HTTP, onboarding, identity, telemetry, storage and deployment;
provider adapters use explicit subpaths. [Package guidance](package.md) explains
consumer checks, and the [contributor guide](../CONTRIBUTING.md#development) covers regeneration.

## Host authority and signing attempts

Import from `@moovha/wallet-provider-kit/core`. [Integration guide](api.md#core-wallet-service).

- [AuthorityContext](#authoritycontext)
- [createJournaledWalletProvider](#createjournaledwalletprovider)
- [EmbeddedAccount](#embeddedaccount)
- [EmbeddedWalletAuthority](#embeddedwalletauthority)
- [EmbeddedWalletService](#embeddedwalletservice)
- [JournaledProviderOptions](#journaledprovideroptions)
- [SigningAuthority](#signingauthority)
- [TypedDataAction](#typeddataaction)
- [VerifiedPrincipal](#verifiedprincipal)
- [WalletAttemptClaim](#walletattemptclaim)
- [WalletAttemptFailure](#walletattemptfailure)
- [WalletAttemptJournal](#walletattemptjournal)
- [WalletAttemptRequest](#walletattemptrequest)
- [WalletAttemptResult](#walletattemptresult)
- [WalletProviderError](#walletprovidererror)
- [WalletSigningProvider](#walletsigningprovider)

### AuthorityContext

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/principal.ts).

```ts
export interface AuthorityContext {
  readonly principal: VerifiedPrincipal;
  /** Bind this key to principal, operation, resource and exact request durably. */
  readonly idempotencyKey: string;
}
```

### createJournaledWalletProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/journaled.ts).

```ts
/** Decorates an authorized backend; no database choice, credentials, retries or policy bypass. */
export declare function createJournaledWalletProvider(
  provider: WalletSigningProvider,
  options: JournaledProviderOptions,
): WalletSigningProvider;
```

### EmbeddedAccount

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/signing.ts).

```ts
export interface EmbeddedAccount {
  accountId: string;
  address: string;
}
```

### EmbeddedWalletAuthority

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/embedded-wallet.ts).

```ts
/**
 * Server-owned authority port for current policy and durable attempt admission.
 * Each call must verify the principal's current grant/session/proof and owner permission,
 * read current stored KYC, and durably admit the exact attempt and usage budget.
 * Signing additionally requires current consent, immutable committed plan/action,
 * active binding and lease. Return null on denial; throw on storage uncertainty.
 * Never construct these records from an HTTP body or a cached approval.
 */
export interface EmbeddedWalletAuthority {
  provision(
    context: AuthorityContext,
    accountId: string,
  ): Promise<OwnerAuthority | null>;
  sign(
    context: AuthorityContext,
    actionId: string,
  ): Promise<SigningAuthority | null>;
}
```

### EmbeddedWalletService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/embedded-wallet.ts).

```ts
/** HTTP-independent wallet service; the host supplies authoritative persistence and policy. */
export declare class EmbeddedWalletService {
  constructor(
    authority: EmbeddedWalletAuthority,
    provider: WalletSigningProvider,
  );
  provision(
    context: AuthorityContext,
    accountId: string,
    enrollmentGuard?: (ownerSubject: string) => Promise<void>,
  ): Promise<EmbeddedAccount>;
  sign(
    context: AuthorityContext,
    actionId: string,
    accessGuard?: (ownerSubject: string, accountId: string) => Promise<void>,
  ): Promise<string>;
}
```

### JournaledProviderOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/attempt-journal.ts).

```ts
export interface JournaledProviderOptions {
  /** Stable deployment/backend environment identity; never a credential or URL. */
  namespace: string;
  journal: WalletAttemptJournal;
  /**
   * Resolve the admitted attempt's CURRENT owner/grant/KYC/consent/proof and exact
   * immutable request. Called on every request and again after a dispatch claim.
   * A JWT scope or the existence of a journal row cannot return true by itself.
   */
  authorizeAttempt(request: WalletAttemptRequest): Promise<boolean>;
}
```

### SigningAuthority

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/embedded-wallet.ts).

```ts
export interface SigningAuthority extends OwnerAuthority {
  account: EmbeddedAccount;
  chainAccountId: string;
  bindingRevision: string;
  capabilityRevision: string;
  action: TypedDataAction;
}
```

### TypedDataAction

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/signing.ts).

```ts
/** Internal owner-signer envelope for Safe intent approval, account bootstrap and immutable SafeOp signing. */
export interface TypedDataAction {
  action_id: string;
  operation_id: string;
  plan_revision: string;
  plan_hash: string;
  binding_revision: string;
  capability_revision: string;
  profile: 'safe_owner_v1';
  profile_revision: string;
  chain_id: string;
  chain_account_id: string;
  payload_hash: string;
  dependencies: string[];
  expires_at: string;
  status:
    | 'blocked'
    | 'ready'
    | 'pending'
    | 'fulfilled'
    | 'rejected'
    | 'expired'
    | 'unknown';
  kind: 'sign_typed_data';
  payload: {
    domain: Record<string, TypedValue>;
    types: Record<
      string,
      {
        name: string;
        type: string;
      }[]
    >;
    message: Record<string, TypedValue>;
    primaryType: string;
  };
}
```

### VerifiedPrincipal

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/principal.ts).

```ts
/** Constructed by a trusted authentication adapter, never from a request body. */
export interface VerifiedPrincipal {
  readonly issuer: string;
  readonly subject: string;
  readonly clientId: string;
  /** Untrusted wallet-grant selector; the authority layer verifies caller, wallet and current member permissions. */
  readonly accessGrantId?: string;
  readonly credentialRevision?: number;
  readonly scopes: readonly string[];
}
```

### WalletAttemptClaim

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/attempt-journal.ts).

```ts
export type WalletAttemptClaim = {
  attemptId: string;
  resourceKey: string;
  requestHash: string;
} & (
  | {
      state: 'dispatch';
      leaseToken: string;
      leaseExpiresAt: string;
    }
  | {
      state: 'pending' | 'unknown' | 'conflict';
    }
  | {
      state: 'succeeded';
      result: WalletAttemptResult;
    }
  | {
      state: 'failed';
      failure: WalletAttemptFailure;
    }
);
```

### WalletAttemptFailure

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/attempt-journal.ts).

```ts
export interface WalletAttemptFailure {
  code: WalletProviderError['code'];
  outcome: WalletProviderError['outcome'];
}
```

### WalletAttemptJournal

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/attempt-journal.ts).

```ts
/**
 * Transactional persistence supplied through the SQLite journal or a host adapter.
 *
 * claim must atomically bind namespace/provider/attempt and resource identities,
 * reserve the bounded usage, and commit dispatch with a fresh fencing token.
 * Identical callers share one record; mismatched request/resource reuse conflicts.
 * Only one caller may receive dispatch, including after process restart.
 * Lease expiry after dispatch is unknown, never permission for another dispatch.
 *
 * complete/fail must fence the token and atomically store a terminal result and
 * its audit/outbox event. Preserve results beyond HTTP/vendor cache lifetimes.
 * Never retry uncertain writes or release reservations for unknown outcomes.
 */
export interface WalletAttemptJournal {
  claim(request: WalletAttemptRequest): Promise<WalletAttemptClaim>;
  complete(
    request: WalletAttemptRequest,
    leaseToken: string,
    result: WalletAttemptResult,
  ): Promise<void>;
  fail(
    request: WalletAttemptRequest,
    leaseToken: string,
    failure: WalletAttemptFailure,
  ): Promise<void>;
}
```

### WalletAttemptRequest

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/attempt-journal.ts).

```ts
/** References and fingerprints only: no token, raw action, private key or PII. */
export interface WalletAttemptRequest {
  readonly namespace: string;
  readonly provider: string;
  readonly attemptId: string;
  readonly kind: 'provision' | 'sign_typed_data' | 'infrastructure_transaction';
  readonly accountId: string;
  readonly resourceKey: string;
  readonly requestHash: string;
}
```

### WalletAttemptResult

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/attempt-journal.ts).

```ts
export type WalletAttemptResult =
  | {
      kind: 'provision';
      account: EmbeddedAccount;
    }
  | {
      kind: 'sign_typed_data';
      signature: string;
    }
  | {
      kind: 'infrastructure_transaction';
      transactionId: string;
    };
```

### WalletProviderError

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/signing.ts).

```ts
export declare class WalletProviderError extends Error {
  readonly code:
    | 'wallet_provider_configuration'
    | 'wallet_provider_input'
    | 'wallet_provider_rejected'
    | 'wallet_provider_unavailable'
    | 'wallet_provider_response'
    | 'wallet_authorization_denied'
    | 'wallet_attempt_conflict'
    | 'wallet_attempt_pending'
    | 'wallet_attempt_unavailable'
    | 'wallet_identity_invalid'
    | 'wallet_identity_unavailable'
    | 'wallet_onboarding_unavailable'
    | 'wallet_enrollment_unavailable';
  readonly outcome: 'not_dispatched' | 'rejected' | 'unknown';
  constructor(
    code:
      | 'wallet_provider_configuration'
      | 'wallet_provider_input'
      | 'wallet_provider_rejected'
      | 'wallet_provider_unavailable'
      | 'wallet_provider_response'
      | 'wallet_authorization_denied'
      | 'wallet_attempt_conflict'
      | 'wallet_attempt_pending'
      | 'wallet_attempt_unavailable'
      | 'wallet_identity_invalid'
      | 'wallet_identity_unavailable'
      | 'wallet_onboarding_unavailable'
      | 'wallet_enrollment_unavailable',
    outcome?: 'not_dispatched' | 'rejected' | 'unknown',
  );
}
```

### WalletSigningProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/signing.ts).

```ts
export interface WalletSigningProvider {
  readonly provider: string;
  createAccount(accountId: string, attemptId: string): Promise<EmbeddedAccount>;
  findAccount(accountId: string): Promise<EmbeddedAccount | null>;
  signTypedData(
    account: EmbeddedAccount,
    action: TypedDataAction,
    attemptId: string,
  ): Promise<string>;
}
```

## HTTP composition and authentication

Import from `@moovha/wallet-provider-kit/http`. [Integration guide](api.md#http-and-authentication).

- [Authenticate](#authenticate)
- [createAuthenticator](#createauthenticator)
- [createServer](#createserver)
- [OAuthConfiguration](#oauthconfiguration)
- [ProviderPaths](#providerpaths)
- [ServerOptions](#serveroptions)
- [WalletCallsBatchSummary](#walletcallsbatchsummary)
- [WalletCallsService](#walletcallsservice)

### Authenticate

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/service/auth.ts).

```ts
export type Authenticate = (
  authorization: string | undefined,
  requiredScope: string,
) => Promise<VerifiedPrincipal>;
```

### createAuthenticator

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/service/auth.ts).

```ts
/** RFC 9068 resource server; keys and issuer are operator configuration, never token input. */
export declare function createAuthenticator(
  configuration: OAuthConfiguration,
  keys?: JWTVerifyGetKey,
): Authenticate;
```

### createServer

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/service/server.ts).

```ts
export declare function createServer(
  options?: ServerOptions,
): Promise<
  Fastify.FastifyInstance<
    import('http').Server<
      typeof import('http').IncomingMessage,
      typeof import('http').ServerResponse
    >,
    import('http').IncomingMessage,
    import('http').ServerResponse<import('http').IncomingMessage>,
    Fastify.FastifyBaseLogger,
    Fastify.FastifyTypeProviderDefault
  >
>;
```

### OAuthConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/service/auth.ts).

```ts
export interface OAuthConfiguration {
  issuer: string;
  audience: string;
  jwksUrl: string;
}
```

### ProviderPaths

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/protocol/provider-api.generated.ts).

Generated OpenAPI path types from [the implemented provider contract](../spec/provider-api.json).
Use `ProviderPaths["/v1/accounts/{accountId}/wallet"]["post"]` to select an operation.
See the [HTTP reference](http-reference.md).

### ServerOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/service/server.ts).

```ts
export interface ServerOptions {
  management?: ManagementService;
  managementReady?: () => Promise<boolean>;
  providerOrigin?: string;
  localManagementOrigin?: string;
  requestsPerMinute?: number;
  safeWallet?: import('../sponsorship/safe-wallet.js').SafeWalletRuntime;
  authorizationServer?: {
    register(app: import('fastify').FastifyInstance): void;
  };
  walletCalls?: WalletCallsService;
  runtimeConfiguration?: RuntimeConfigurationService;
  authenticate?: Authenticate;
  service?: EmbeddedWalletService;
  /** Enabling enrollment also gates the provisioning route on current provider acceptance. */
  enrollment?: EnrollmentService;
  /** Application-led access or explicit hosted compatibility access. Independent of legacy OIDC enrollment. */
  onboarding?: OnboardingHttpOptions;
  /** Must check durable authority/recovery dependencies; never infer readiness from env keys. */
  ready?: () => Promise<boolean>;
  documentation?: boolean;
  /** Optional operator-authenticated client-credentials broker for the deployed explorer. */
  documentationTokens?: DocumentationTokenOptions;
  configurationProfile?: 'provider-service-v1';
  actionProfiles?: readonly 'provider-approved-contracts-v1'[];
  /** Release host-owned resources when the service closes. Registered before ready. */
  onClose?: () => Promise<void>;
}
```

### WalletCallsBatchSummary

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/types.ts).

```ts
export interface WalletCallsBatchSummary extends WalletCallsStatus {
  account_id: string;
  sender: string;
  queue_stage:
    | 'cancelled'
    | 'expired'
    | 'blocked'
    | 'succeeded'
    | 'included'
    | 'failed'
    | 'queued'
    | 'executing';
  policy_revision: string;
  expires_at: string;
  application_id: string;
}
```

### WalletCallsService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/service.ts).

```ts
/** Account-scoped EIP-5792 adapter. The server selects the durable execution driver for each account. */
export declare class WalletCallsService {
  account(
    principal: VerifiedPrincipal,
    accountId: string,
  ): Promise<{
    address: string;
    chainId: '0x2105' | '0x14a34';
  }>;
  constructor(actions: SupportedActions, driver: WalletCallsDriver);
  list(
    principal: VerifiedPrincipal,
    authorizeOperator?: (state: ProviderState) => void,
  ): Promise<{
    truncated: boolean;
    batches: import('./types.js').WalletCallsBatchSummary[];
  }>;
  /** Streams current authorized status; notifications contain no account data. */
  watch(
    principal: VerifiedPrincipal,
    accountId: string,
    batchId: string,
    signal: AbortSignal,
  ): AsyncGenerator<WalletCallsStatus | undefined, void, unknown>;
  request(
    principal: VerifiedPrincipal,
    accountId: string,
    method: string,
    params: unknown[],
  ): Promise<unknown>;
}
```

## Onboarding, owner login and access

Import from `@moovha/wallet-provider-kit/onboarding`. [Integration guide](onboarding.md).

- [AccessInput](#accessinput)
- [AccessRequestInput](#accessrequestinput)
- [accessType](#accesstype)
- [ApplicationIdentityRecord](#applicationidentityrecord)
- [ApplicationPolicy](#applicationpolicy)
- [ApplicationRecordPolicy](#applicationrecordpolicy)
- [ApplicationUserAssertion](#applicationuserassertion)
- [createDiditIdentityAdapter](#creatediditidentityadapter)
- [createFileOnboardingStore](#createfileonboardingstore)
- [createOnboardingJournal](#createonboardingjournal)
- [createOnboardingProvider](#createonboardingprovider)
- [createOwnerLogin](#createownerlogin)
- [createSumsubIdentityAdapter](#createsumsubidentityadapter)
- [defineOnboardingPolicy](#defineonboardingpolicy)
- [DiditConfiguration](#diditconfiguration)
- [IdentityAdapter](#identityadapter)
- [IdentityEvidence](#identityevidence)
- [OnboardingPolicy](#onboardingpolicy)
- [OnboardingProviderConfiguration](#onboardingproviderconfiguration)
- [OnboardingService](#onboardingservice)
- [OnboardingStore](#onboardingstore)
- [OwnerIdentity](#owneridentity)
- [ownerKey](#ownerkey)
- [OwnerLogin](#ownerlogin)
- [OwnerLoginConfiguration](#ownerloginconfiguration)
- [Permission](#permission)
- [ProviderState](#providerstate)
- [SumsubConfiguration](#sumsubconfiguration)
- [VendorPrice](#vendorprice)
- [VerifiedUserRecord](#verifieduserrecord)
- [WalletDescription](#walletdescription)
- [WalletMember](#walletmember)
- [WalletSharingPolicy](#walletsharingpolicy)

### AccessInput

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface AccessInput {
  mode: 'create' | 'connect' | 'connect_from_application';
  source_application_id?: string;
  source_account_id?: string;
  wallet?: WalletDescription;
  account_id?: string;
  identity_record?: ApplicationIdentityRecord;
  user?: ApplicationUserAssertion;
  authorization_details: [
    {
      type: typeof accessType;
      actions: Permission[];
    },
  ];
}
```

### AccessRequestInput

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
/** A request may reuse the caller's current stored identity evidence; consent is always supplied. */
export type AccessRequestInput = Omit<AccessInput, 'user'> & {
  user?: Omit<ApplicationUserAssertion, 'identity'> & {
    identity?: ApplicationUserAssertion['identity'];
  };
};
```

### accessType

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export declare const accessType = 'https://moovha.com/wallet/account-access';
```

### ApplicationIdentityRecord

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
/** Application assertions for an unfunded evaluation; not externally verified identity evidence. */
export interface ApplicationIdentityRecord {
  reference: string;
  fields: Record<string, string>;
}
```

### ApplicationPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface ApplicationPolicy {
  issuer: string;
  clientId: string;
  name: string;
  enabled?: boolean;
  /** Explicit permission to attest user identity and consent; an OAuth scope alone is insufficient. */
  assertionTrust?: {
    agreement: string;
  };
  walletSharing?: WalletSharingPolicy;
  permissions?: Permission[];
  /** Contractually agreed reimbursement, not a payment instruction or vendor price quote. */
  funding?: {
    agreement: string;
    monthlyLimitMinor: number;
  };
}
```

### ApplicationRecordPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface ApplicationRecordPolicy {
  requiredFields: string[];
}
```

### ApplicationUserAssertion

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
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
```

### createDiditIdentityAdapter

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/vendors.ts).

```ts
/** Recipient-only B2B import. An upstream approval never becomes provider acceptance. */
export declare function createDiditIdentityAdapter(
  input: DiditConfiguration,
  request?: typeof fetch,
): IdentityAdapter;
```

### createFileOnboardingStore

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/file-store.ts).

```ts
/** Small, single-host reference store. Requires a private local POSIX filesystem with atomic rename/fsync. */
export declare function createFileOnboardingStore(
  directory: string,
): OnboardingStore;
```

### createOnboardingJournal

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/journal.ts).

```ts
/** Provisioning-only reference journal. Access grants never enable generic signatures. */
export declare function createOnboardingJournal(
  store: OnboardingStore,
): WalletAttemptJournal;
```

### createOnboardingProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/provider.ts).

```ts
/** One configuration, hosted consent/review, persistent grants and journaled account creation. */
export declare function createOnboardingProvider(
  config: OnboardingProviderConfiguration,
): Promise<
  import('fastify').FastifyInstance<
    import('http').Server<
      typeof import('http').IncomingMessage,
      typeof import('http').ServerResponse
    >,
    import('http').IncomingMessage,
    import('http').ServerResponse<import('http').IncomingMessage>,
    import('fastify').FastifyBaseLogger,
    import('fastify').FastifyTypeProviderDefault
  >
>;
```

### createOwnerLogin

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/login.ts).

```ts
/** The maintained OIDC client handles protocol validation; the provider's IdP owns login and MFA. */
export declare function createOwnerLogin(
  inputConfiguration: OwnerLoginConfiguration,
  origin: string,
  store: OnboardingStore,
): Promise<OwnerLogin>;
```

### createSumsubIdentityAdapter

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/vendors.ts).

```ts
export declare function createSumsubIdentityAdapter(
  input: SumsubConfiguration,
  request?: typeof fetch,
): IdentityAdapter;
```

### defineOnboardingPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/policy.ts).

```ts
export declare function defineOnboardingPolicy(
  input: OnboardingPolicy,
): ResolvedPolicy;
```

### DiditConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/vendors.ts).

```ts
export interface DiditConfiguration {
  apiKey: string;
  workflowId: string;
  importPrice?: VendorPrice;
  verificationPrice?: VendorPrice;
}
```

### IdentityAdapter

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface IdentityAdapter {
  vendor: Vendor;
  /** Public workflow/level and review profile identity; excludes credentials. */
  policyFingerprint?: string;
  price?: VendorPrice;
  verificationPrice?: VendorPrice;
  startVerification?(correlation: string): Promise<{
    url: string;
    reference?: string;
  }>;
  readByCorrelation?(correlation: string): Promise<IdentityEvidence>;
  importShared(token: string, correlation: string): Promise<IdentityEvidence>;
  read(reference: string, correlation: string): Promise<IdentityEvidence>;
}
```

### IdentityEvidence

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface IdentityEvidence {
  vendor: Vendor;
  reference: string;
  correlation: string;
  status: 'approved' | 'review' | 'rejected';
  /** Recipient review time. Retrieval/import time must never substitute for verification time. */
  verifiedAt?: string;
  fetchedAt: string;
}
```

### OnboardingPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface OnboardingPolicy {
  version: string;
  provider: {
    name: string;
    origin: string;
    privacyUrl: string;
  };
  applications: ApplicationPolicy[];
  identity?: {
    maxAgeDays?: number;
    application?: {
      requiredFields: string[];
      verificationLevel: string;
    };
    /** Explicit provider-reviewed record submission for unfunded, read-only evaluation. */
    records?: ApplicationRecordPolicy;
  };
  access?: {
    maxAgeDays?: number;
    mode?: 'application' | 'hosted';
  };
}
```

### OnboardingProviderConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/provider.ts).

```ts
export interface OnboardingProviderConfiguration {
  policy: OnboardingPolicy;
  /** Existing file-store configuration. Use this or storage, exclusively. */
  storageDirectory?: string;
  /** Supplied database.onboardingStore or an equivalent transactional host store. */
  storage?: OnboardingStore;
  oauth: OAuthConfiguration;
  ownerLogin?: OwnerLoginConfiguration;
  reviewers?: string[];
  identity: {
    didit?: DiditConfiguration;
    sumsub?: SumsubConfiguration;
  };
  walletBackend: WalletSigningProvider;
  /** Prove the selected backend's lifecycle and recovery before enabling provisioning. */
  ready: () => Promise<boolean>;
}
```

### OnboardingService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/service.ts).

```ts
/** Provider decisions are stored locally. Vendor results, OAuth scopes and share tokens cannot grant access. */
export declare class OnboardingService {
  readonly store: OnboardingStore;
  readonly runtimeContracts: boolean;
  readonly safeOnlyWallet: boolean;
  readonly policy: import('./types.js').ResolvedPolicy;
  readonly installationPolicyRevision: string;
  constructor(
    input: OnboardingPolicy,
    store: OnboardingStore,
    adapters?: IdentityAdapter[],
    walletReader?: Pick<WalletSigningProvider, 'findAccount'> | undefined,
    actionPolicyRevision?: string | undefined,
    runtimeContracts?: boolean,
    safeOnlyWallet?: boolean,
    liveApplications?: {
      userChecks?():
        | (import('./types.js').UserCheckSettings & {
            revision: number;
          })
        | undefined;
      list(): import('./types.js').ApplicationPolicy[];
      current(
        principal: VerifiedPrincipal,
      ): import('./types.js').ApplicationPolicy;
    },
  );
  applicationAccessPolicy(
    principal: VerifiedPrincipal,
    sourceApplicationId?: string,
  ): Promise<
    | {
        wallet_sharing?:
          | {
              source_application_id: string;
              matching_fields: string[];
              revision: string;
            }
          | undefined;
        source: string;
        evaluation_only: boolean;
        required_fields: string[];
        maximum_field_characters: number;
        owner_consent_required: boolean;
        provider_login_required: boolean;
        provider_review_required: boolean;
        verification_level?: string | undefined;
        max_identity_age_days: number;
        max_access_days: number;
        action_policy_revision?: string | undefined;
        flow: 'application' | 'hosted';
        policy_revision: string;
      }
    | {
        action_policy_revision: string | undefined;
        required_fields: string[];
        runtime_contract_terms: import('../runtime-configuration/authority.js').RuntimePolicySnapshot;
        wallet_sharing?:
          | {
              source_application_id: string;
              matching_fields: string[];
              revision: string;
            }
          | undefined;
        source: string;
        evaluation_only: boolean;
        maximum_field_characters: number;
        owner_consent_required: boolean;
        provider_login_required: boolean;
        provider_review_required: boolean;
        verification_level?: string | undefined;
        max_identity_age_days: number;
        max_access_days: number;
        flow: 'application' | 'hosted';
        policy_revision: string;
      }
  >;
  request(
    inputContext: AuthorityContext,
    value: AccessRequestInput,
  ): Promise<{
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'contracts:request'
          | 'members:manage'
        )[]
      | undefined;
    expires_at?: string | undefined;
    membership_revision?: number | undefined;
    wallet?: import('./types.js').WalletDescription | undefined;
    account_id?: string | undefined;
    grant_id?: string | undefined;
    consent_url?: string | undefined;
    request_id: string;
    status: string;
  }>;
  read(
    context: AuthorityContext,
    id: string,
  ): Promise<{
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'contracts:request'
          | 'members:manage'
        )[]
      | undefined;
    expires_at?: string | undefined;
    membership_revision?: number | undefined;
    wallet?: import('./types.js').WalletDescription | undefined;
    account_id?: string | undefined;
    grant_id?: string | undefined;
    consent_url?: string | undefined;
    request_id: string;
    status: string;
  }>;
  accessPolicy(principal: VerifiedPrincipal): {
    source: string;
    evaluation_only: boolean;
    required_fields: string[];
    maximum_field_characters: number;
    owner_consent_required: boolean;
    provider_login_required: boolean;
    provider_review_required: boolean;
    verification_level?: string | undefined;
    max_identity_age_days: number;
    max_access_days: number;
    action_policy_revision?: string | undefined;
    flow: 'application' | 'hosted';
    policy_revision: string;
  };
  submitRecords(
    inputContext: AuthorityContext,
    records: ApplicationIdentityRecord[],
  ): Promise<{
    results: (
      | {
          index: number;
          status: 'invalid';
          required_fields: string[];
        }
      | {
          index: number;
          status: 'submitted';
          receipt: Awaited<ReturnType<OnboardingService['request']>>;
        }
    )[];
  }>;
  consentView(
    id: string,
    identity: OwnerIdentity,
  ): Promise<{
    verificationUrl?: string | undefined;
    identitySource?: 'application_record' | undefined;
    application: string;
    provider: string;
    privacyUrl: string;
    permissions: (
      | 'account:read'
      | 'operations:request'
      | 'contracts:request'
      | 'members:manage'
    )[];
    mode: 'create' | 'connect' | 'connect_from_application';
    durationDays: number;
    status: string;
  }>;
  consent(
    id: string,
    identity: OwnerIdentity,
    approve: boolean,
  ): Promise<{
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'contracts:request'
          | 'members:manage'
        )[]
      | undefined;
    expires_at?: string | undefined;
    membership_revision?: number | undefined;
    wallet?: import('./types.js').WalletDescription | undefined;
    account_id?: string | undefined;
    grant_id?: string | undefined;
    consent_url?: string | undefined;
    request_id: string;
    status: string;
  }>;
  importIdentity(
    inputContext: AuthorityContext,
    id: string,
    vendor: Vendor,
    token: string,
  ): Promise<{
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'contracts:request'
          | 'members:manage'
        )[]
      | undefined;
    expires_at?: string | undefined;
    membership_revision?: number | undefined;
    wallet?: import('./types.js').WalletDescription | undefined;
    account_id?: string | undefined;
    grant_id?: string | undefined;
    consent_url?: string | undefined;
    request_id: string;
    status: string;
  }>;
  verificationVendors(): Vendor[];
  startVerification(
    id: string,
    identity: OwnerIdentity,
    vendor: Vendor,
  ): Promise<
    | {
        dispatch: boolean;
        url: string;
        status: string;
      }
    | {
        dispatch: boolean;
        status: string;
        url?: undefined;
      }
  >;
  reviews(principal: VerifiedPrincipal): Promise<
    {
      applicationRecord?: ApplicationIdentityRecord | undefined;
      application?: string | undefined;
      requestId: string;
      owner: Pick<OwnerIdentity, 'issuer' | 'subject'> | undefined;
      vendor: Vendor | undefined;
      reference: string | undefined;
      verifiedAt: string | undefined;
      status: string;
    }[]
  >;
  providerAccounts(principal: VerifiedPrincipal): Promise<
    {
      id: string;
      status: 'active' | 'suspended';
      provisioned: boolean;
    }[]
  >;
  suspendAccount(principal: VerifiedPrincipal, id: string): Promise<void>;
  reconcileAccount(
    principal: VerifiedPrincipal,
    id: string,
  ): Promise<{
    status: string;
  }>;
  review(
    principal: VerifiedPrincipal,
    id: string,
    input: {
      decision: 'accept' | 'reject';
      identity_matches_owner: boolean;
      verified_at?: string;
      reference?: string;
      vendor?: Vendor;
    },
  ): Promise<{
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'contracts:request'
          | 'members:manage'
        )[]
      | undefined;
    expires_at?: string | undefined;
    membership_revision?: number | undefined;
    wallet?: import('./types.js').WalletDescription | undefined;
    account_id?: string | undefined;
    grant_id?: string | undefined;
    consent_url?: string | undefined;
    request_id: string;
    status: string;
  }>;
  /** Verify a current, independently consented sharing grant for an application-bound Safe. */
  hasSharedWalletAccess(
    state: ProviderState,
    applicationId: string,
    accountId: string,
  ): boolean;
  authorize(
    principal: VerifiedPrincipal,
    accountId: string,
    permission: Permission,
  ): Promise<AccessGrant>;
  /** Run synchronous trusted storage work in the same transaction as current account-access checks. */
  withAccountAccess<T>(
    principal: VerifiedPrincipal,
    accountId: string,
    permission: Permission,
    operation: (state: ProviderState, grant: AccessGrant) => T,
  ): Promise<T>;
  account(
    principal: VerifiedPrincipal,
    accountId: string,
  ): Promise<{
    status: string;
    address?: string | undefined;
    identity_source?:
      'application_record' | 'application_attestation' | undefined;
    evaluation_only?: boolean | undefined;
    wallet?: import('./types.js').WalletDescription | undefined;
    account_id: string;
  }>;
  /** Return only this application's currently consented wallets for its exact private user reference. */
  wallets(
    context: AuthorityContext,
    userId: string,
  ): Promise<{
    accounts: {
      account_id: string;
      is_default: boolean;
      wallet: import('./types.js').WalletDescription;
      grant_id: string;
      permissions: (
        | 'account:read'
        | 'operations:request'
        | 'contracts:request'
        | 'members:manage'
      )[];
      expires_at: string;
      role: string;
    }[];
  }>;
  members(
    principal: VerifiedPrincipal,
    accountId: string,
  ): Promise<{
    account_id: string;
    wallet: import('./types.js').WalletDescription;
    revision: number;
    members: {
      permissions: (
        | 'account:read'
        | 'operations:request'
        | 'contracts:request'
        | 'members:manage'
      )[];
      membership_revision: number;
      status: 'active' | 'invited' | 'removed';
      user_id?: string | undefined;
      member_id: string;
      application_id: string;
      name: string;
    }[];
  }>;
  saveMember(
    context: AuthorityContext,
    accountId: string,
    input: {
      expected_revision: number;
      user_id?: string;
      member_id?: string;
      name?: string;
      enabled: boolean;
      permissions: Permission[];
    },
  ): Promise<{
    account_id: string;
    wallet: import('./types.js').WalletDescription;
    revision: number;
    members: {
      permissions: (
        | 'account:read'
        | 'operations:request'
        | 'contracts:request'
        | 'members:manage'
      )[];
      membership_revision: number;
      status: 'active' | 'invited' | 'removed';
      user_id?: string | undefined;
      member_id: string;
      application_id: string;
      name: string;
    }[];
  }>;
  revokeApplicationGrant(
    context: AuthorityContext,
    id: string,
  ): Promise<{
    grant_id: string;
    status: 'revoked';
  }>;
  ownerRequests(identity: OwnerIdentity): Promise<
    {
      id: string;
      application: string;
      status: string;
    }[]
  >;
  cancelPending(
    id: string,
    identity: OwnerIdentity,
  ): Promise<{
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'contracts:request'
          | 'members:manage'
        )[]
      | undefined;
    expires_at?: string | undefined;
    membership_revision?: number | undefined;
    wallet?: import('./types.js').WalletDescription | undefined;
    account_id?: string | undefined;
    grant_id?: string | undefined;
    consent_url?: string | undefined;
    request_id: string;
    status: string;
  }>;
  ownerGrants(identity: OwnerIdentity): Promise<
    {
      id: string;
      application: string;
      permissions: (
        | 'account:read'
        | 'operations:request'
        | 'contracts:request'
        | 'members:manage'
      )[];
      state: 'active' | 'revoked' | 'suspended';
      expiresAt: number;
    }[]
  >;
  changeGrant(
    id: string,
    stateValue: 'suspended' | 'revoked',
    identity: OwnerIdentity | VerifiedPrincipal,
  ): Promise<{
    grant_id: string;
    status: 'revoked' | 'suspended';
  }>;
  /** Use on an existing financial authority; exact-action approval still belongs to that authority. */
  bindWalletAuthority(
    authority: EmbeddedWalletAuthority,
  ): EmbeddedWalletAuthority;
  authorizeCurrent(
    principal: VerifiedPrincipal,
    accountId: string,
  ): Promise<AccessGrant>;
  /** Ready-to-compose creation authority. No signing is enabled without an exact-action host integration. */
  walletAuthority(): EmbeddedWalletAuthority;
  canDispatchProvision(attemptId: string, accountId: string): Promise<boolean>;
}
```

### OnboardingStore

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
/** Callback is synchronous; never make vendor/network calls inside a storage transaction. */
export interface OnboardingStore {
  transaction<T>(operation: (state: ProviderState) => T): Promise<T>;
}
```

### OwnerIdentity

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface OwnerIdentity {
  issuer: string;
  subject: string;
  authenticatedAt: number;
}
```

### ownerKey

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/service.ts).

```ts
export declare function ownerKey(
  owner: Pick<OwnerIdentity, 'issuer' | 'subject'>,
): string;
```

### OwnerLogin

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/login.ts).

```ts
export interface OwnerLogin {
  start(requestId: string, browserToken: string): Promise<string>;
  finish(
    url: URL,
    browserToken: string,
  ): Promise<{
    sessionToken: string;
    requestId: string;
  }>;
  session(token: string): Promise<{
    identity: OwnerIdentity;
    csrf: string;
  }>;
}
```

### OwnerLoginConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/login.ts).

```ts
export interface OwnerLoginConfiguration {
  issuer: string;
  clientId: string;
  clientSecret: string;
  idTokenAlgorithm?: 'RS256' | 'ES256';
}
```

### Permission

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export type Permission = (typeof permissions)[number];
```

### ProviderState

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface ProviderState {
  verifiedUsers?: Record<string, VerifiedUserRecord>;
  managementCommands?: Record<
    string,
    {
      hash: string;
      result: unknown;
      at: number;
    }
  >;
  management?: Record<
    string,
    import('../management/service.js').ManagementState
  >;
  format: 'moovha-onboarding-1';
  assetReservations?: Record<
    string,
    {
      budgetId: string;
      units: string;
    }
  >;
  assetBudgetBindings?: Record<
    string,
    {
      revision: string;
    }
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
    {
      mechanism: import('../storage/execution-binding.js').OperationMechanism;
    }
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
      managementInstallationId?: string;
      accessMode?: 'application' | 'hosted';
      runtimeConfiguration?: import('../runtime-configuration/service.js').RuntimeConfigurationState;
    }
  >;
  requests: Record<string, AccessRequest>;
  accounts: Record<string, AccountRecord>;
  grants: Record<string, AccessGrant>;
  idempotency: Record<
    string,
    {
      hash: string;
      id: string;
    }
  >;
  budgets: Record<string, number>;
  evidenceOwners: Record<string, string>;
  attempts: Record<string, StoredAttempt>;
  admissions: Record<
    string,
    {
      accountId: string;
      grantId: string;
      caller: AccessRequest['caller'];
    }
  >;
  sessions: Record<
    string,
    {
      owner: OwnerIdentity;
      expiresAt: number;
      csrf: string;
    }
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
  audit: {
    at: number;
    event: string;
    resource: string;
    revision: string;
  }[];
}
```

### SumsubConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/vendors.ts).

```ts
export interface SumsubConfiguration {
  appToken: string;
  secretKey: string;
  levelName: string;
  /** Confirm the newer Reusable KYC Share feature is enabled; legacy ignores body controls. */
  reusableKycShareEnabled: true;
  importPrice?: VendorPrice;
  verificationPrice?: VendorPrice;
}
```

### VendorPrice

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface VendorPrice {
  /** Upper bound in USD cents, confirmed with the vendor for this configured workflow/level. */
  maximumMinor: number;
  termsReference: string;
}
```

### VerifiedUserRecord

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
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
```

### WalletDescription

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface WalletDescription {
  reference: string;
  name: string;
  kind: 'personal' | 'shared';
}
```

### WalletMember

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface WalletMember {
  name?: string;
  id: string;
  issuer: string;
  clientId: string;
  userId: string;
  permissions: Permission[];
  revision: number;
  state: 'invited' | 'active' | 'removed';
  sourceSharing?: {
    applicationId: string;
    revision: string;
  };
}
```

### WalletSharingPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface WalletSharingPolicy {
  revision?: string;
  applications: string[];
  matchingFields: string[];
  agreement: string;
}
```

## OIDC Identity Assurance enrollment

Import from `@moovha/wallet-provider-kit/identity`. [Integration guide](enrollment.md).

- [createIdentityVerifier](#createidentityverifier)
- [EnrollmentAuthority](#enrollmentauthority)
- [EnrollmentChallenge](#enrollmentchallenge)
- [EnrollmentDecision](#enrollmentdecision)
- [EnrollmentRecord](#enrollmentrecord)
- [EnrollmentService](#enrollmentservice)
- [EnrollmentStatus](#enrollmentstatus)
- [IdentityAttribute](#identityattribute)
- [IdentityConfiguration](#identityconfiguration)
- [IdentityVerifier](#identityverifier)
- [VerifiedIdentity](#verifiedidentity)

### createIdentityVerifier

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/identity/oidc.ts).

```ts
/** Narrow OIDC Core / Identity Assurance profile; no token-driven discovery or evidence fetching. */
export declare function createIdentityVerifier(
  configuration: IdentityConfiguration,
  keys?: JWTVerifyGetKey,
): IdentityVerifier;
```

### EnrollmentAuthority

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/enrollment.ts).

```ts
/** Trusted enrollment policy/persistence port; SQLite storage still requires host authorization and acceptance callbacks. */
export interface EnrollmentAuthority {
  /** Authorize current caller; atomically reserve IDs/unique nonce and bind the idempotency key. Return original record on exact retry. */
  begin(
    context: AuthorityContext,
    proposal: EnrollmentChallenge,
  ): Promise<EnrollmentRecord | null>;
  /** Current tenant/client/grant/object authorization, including completed-result reads. Reject a previously consumed submission key bound to another enrollment. */
  load(
    context: AuthorityContext,
    enrollmentId: string,
  ): Promise<EnrollmentRecord | null>;
  /** Apply provider policy and independently verified enrollment consent. Atomically consume nonce and submission idempotency key, bind issuer/subject to owner/account, persist decision and proofHash. Exact proof replay returns stored result; changed proofs conflict. Never provision/sign here. */
  decide(
    context: AuthorityContext,
    challenge: EnrollmentChallenge,
    identity: VerifiedIdentity,
  ): Promise<EnrollmentRecord>;
  /** Recheck current acceptance, consent, revocation, subject/account mapping and policy. Null denies. */
  forAccount(
    context: AuthorityContext,
    accountId: string,
  ): Promise<EnrollmentRecord | null>;
}
```

### EnrollmentChallenge

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/enrollment.ts).

```ts
export interface EnrollmentChallenge {
  enrollmentId: string;
  accountId: string;
  nonce: string;
  createdAt: string;
  expiresAt: string;
  caller: Pick<VerifiedPrincipal, 'issuer' | 'subject' | 'clientId'>;
  identityIssuer: string;
  identityClientId: string;
  /** Claimed at enrollment start; becomes verified only after matching the issuer's ID token. */
  identitySubject: string;
}
```

### EnrollmentDecision

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/enrollment.ts).

```ts
export interface EnrollmentDecision {
  proofHash: string;
  identityIssuer: string;
  identitySubject: string;
  verifiedAt: string;
  policyRevision: string;
  /** Required for acceptance; host-resolved owner, never copied from an API claim. */
  ownerSubject?: string;
  consentReference?: string;
  acceptanceExpiresAt?: string;
}
```

### EnrollmentRecord

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/enrollment.ts).

```ts
export interface EnrollmentRecord extends EnrollmentChallenge {
  status: EnrollmentStatus;
  decision?: EnrollmentDecision;
}
```

### EnrollmentService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/enrollment.ts).

```ts
/** Enrollment consumes identity evidence; it never creates grants, changes KYC or calls a signing backend. */
export declare class EnrollmentService {
  constructor(identity: IdentityVerifier, authority: EnrollmentAuthority);
  begin(
    input: AuthorityContext,
    identitySubject: string,
  ): Promise<{
    nonce: string;
    expires_at: string;
    identity_issuer: string;
    identity_client_id: string;
    required_claims: (
      | 'name'
      | 'given_name'
      | 'family_name'
      | 'middle_name'
      | 'birthdate'
      | 'phone_number'
    )[];
    enrollment_id: string;
    account_id: string;
    status: EnrollmentStatus;
  }>;
  complete(
    input: AuthorityContext,
    enrollmentId: string,
    token: string,
  ): Promise<{
    enrollment_id: string;
    account_id: string;
    status: EnrollmentStatus;
  }>;
  read(
    input: AuthorityContext,
    enrollmentId: string,
  ): Promise<{
    enrollment_id: string;
    account_id: string;
    status: EnrollmentStatus;
  }>;
  provision(
    wallets: EmbeddedWalletService,
    input: AuthorityContext,
    accountId: string,
  ): Promise<import('./signing.js').EmbeddedAccount>;
}
```

### EnrollmentStatus

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/enrollment.ts).

```ts
export type EnrollmentStatus =
  'awaiting_identity' | 'accepted' | 'needs_verification' | 'rejected';
```

### IdentityAttribute

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/identity/oidc.ts).

```ts
export type IdentityAttribute = (typeof attributeNames)[number];
```

### IdentityConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/identity/oidc.ts).

```ts
export interface IdentityConfiguration {
  issuer: string;
  /** Provider's registered OIDC RP client; separate from the API OAuth audience. */
  clientId: string;
  jwksUrl: string;
  requiredClaims: readonly IdentityAttribute[];
  /** Provider-selected freshness, not a universal KYC lifetime. */
  maxVerificationAgeSeconds: number;
}
```

### IdentityVerifier

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/identity/oidc.ts).

```ts
export interface IdentityVerifier {
  readonly issuer: string;
  readonly clientId: string;
  readonly requiredClaims: readonly IdentityAttribute[];
  readonly maxVerificationAgeSeconds: number;
  verify(
    token: string,
    challenge: IdentityChallenge,
  ): Promise<VerifiedIdentity>;
}
```

### VerifiedIdentity

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/identity/oidc.ts).

```ts
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  proofHash: string;
  verifiedAt: string;
  authenticatedAt: string;
  verifiedClaims: {
    verification: {
      trust_framework: string;
      time: string;
      verification_process: string;
      assurance_level?: string;
    };
    claims: Partial<Record<IdentityAttribute, string>>;
  };
}
```

## Telemetry lifecycle

Import from `@moovha/wallet-provider-kit/telemetry`. [Integration guide](operations.md).

- [startTelemetry](#starttelemetry)

### startTelemetry

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/service/telemetry.ts).

```ts
export declare function startTelemetry(
  endpoint?: string,
  allowInsecureDevelopment?: boolean,
): {
  shutdown: () => Promise<void>;
};
```

## Open Wallet Standard adapter

Import from `@moovha/wallet-provider-kit/ows`. [Integration guide](ows-adapter.md).

- [createOwsSigningBackend](#createowssigningbackend)
- [createOwsWalletProvider](#createowswalletprovider)
- [OwsProviderOptions](#owsprovideroptions)

### createOwsSigningBackend

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/ows.ts).

```ts
/** Internal backend; the caller must supply its durable financial journal. */
export declare function createOwsSigningBackend(
  options: OwsProviderOptions,
): WalletSigningProvider;
```

### createOwsWalletProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/ows.ts).

```ts
/** Experimental local OWS owner-credential profile. No export, broadcast or raw signing. */
export declare function createOwsWalletProvider(
  options: OwsProviderOptions,
  attempts: JournaledProviderOptions,
): WalletSigningProvider;
```

### OwsProviderOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/ows.ts).

```ts
export interface OwsProviderOptions {
  network?: ProviderNetwork;
  /** Dedicated, existing, operator-owned vault; never the ambient ~/.ows vault. */
  vaultPath: string;
  /** Owner credential from the host secret store. Never from an HTTP caller. */
  passphrase(): Promise<string>;
}
```

## Durable storage

Import from `@moovha/wallet-provider-kit/storage`. [Integration guide](storage.md).

- [AssetBudgetCharge](#assetbudgetcharge)
- [assetBudgetId](#assetbudgetid)
- [AttemptAdmission](#attemptadmission)
- [DatabaseEnrollmentOptions](#databaseenrollmentoptions)
- [FinancialApproval](#financialapproval)
- [FinancialAuthorityOptions](#financialauthorityoptions)
- [FinancialAuthorization](#financialauthorization)
- [openProviderDatabase](#openproviderdatabase)
- [PolicyBudgetCharge](#policybudgetcharge)
- [ProviderDatabase](#providerdatabase)
- [ProviderDatabaseOptions](#providerdatabaseoptions)

### AssetBudgetCharge

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/types.ts).

```ts
/** Compatibility name for direct-token allowance charges. */
export interface AssetBudgetCharge extends PolicyBudgetCharge {}
```

### assetBudgetId

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/asset-budgets.ts).

```ts
export declare function assetBudgetId(
  origin: string,
  accountId: string,
  token: string,
): string;
```

### AttemptAdmission

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/journal.ts).

```ts
export interface AttemptAdmission {
  request: WalletAttemptRequest;
  budgetId: string;
  /** Nonnegative decimal integer usage units; reservations are retained after unknown effects. */
  units: string;
}
```

### DatabaseEnrollmentOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/enrollment.ts).

```ts
export interface DatabaseEnrollmentOptions {
  /** Fresh caller, current consent, object and policy checks. No provider effects. */
  authorize(
    context: AuthorityContext,
    record: EnrollmentRecord,
    purpose: 'begin' | 'read' | 'decide' | 'provision',
  ): Promise<boolean>;
  /** Host acceptance policy, independent of vendor approval. Raw verified claims are never persisted. */
  decide(
    context: AuthorityContext,
    challenge: EnrollmentChallenge,
    identity: VerifiedIdentity,
  ): Promise<{
    status: Exclude<EnrollmentRecord['status'], 'awaiting_identity'>;
    decision: EnrollmentDecision;
  }>;
}
```

### FinancialApproval

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/types.ts).

```ts
/** Insert only from the host's trusted exact-action authorization flow, never an HTTP body. */
export interface FinancialApproval {
  ownerSubject: string;
  caller: Pick<
    VerifiedPrincipal,
    'issuer' | 'subject' | 'clientId' | 'accessGrantId'
  >;
  grantId: string;
  consentReference: string;
  policyRevision: string;
  account: EmbeddedAccount;
  /** Original user authority for provider-owned application Safe signing. */
  userAccount?: EmbeddedAccount;
  action: TypedDataAction;
  budgetId: string;
  units: string;
  additionalBudgets?: PolicyBudgetCharge[];
}
```

### FinancialAuthorityOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/types.ts).

```ts
export interface FinancialAuthorityOptions {
  namespace: string;
  provider: string;
  /** Recheck live owner/grant/KYC/consent, unchanged plan, dependencies and any step-up proof. No vendor effects. */
  authorize(
    context: AuthorityContext,
    approval: FinancialApproval,
    purpose: 'sign' | 'status',
  ): Promise<FinancialAuthorization | null>;
}
```

### FinancialAuthorization

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/types.ts).

```ts
/** Fresh host evidence; matching a stored approval is necessary but is not a policy check. */
export interface FinancialAuthorization {
  ownerSubject: string;
  accountId: string;
  address: string;
  chainAccountId: string;
  currentUserStatus: 'ID VERIFIED';
  grantId: string;
  consentReference: string;
  policyRevision: string;
  bindingRevision: string;
  capabilityRevision: string;
  planRevision: string;
  planHash: string;
  expiresAt: string;
}
```

### openProviderDatabase

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/index.ts).

```ts
/** Opt-in toolkit-owned SQLite database. Initialization never activates a wallet backend. */
export declare function openProviderDatabase(
  options: ProviderDatabaseOptions,
): {
  managementSnapshot():
    import('../management/service.js').ManagementState | undefined;
  onboardingStore: import('../index.js').OnboardingStore;
  sponsorship: {
    load: (
      id: string,
    ) => import('../sponsorship/admission.js').SponsorshipAdmission | null;
    reserve(
      input: Omit<
        import('../sponsorship/admission.js').SponsorshipAdmission,
        'phases' | 'signingActionId'
      >,
    ): import('../sponsorship/admission.js').SponsorshipAdmission;
    claim(
      id: string,
      stage: 'stub' | 'final',
      requestHash: string,
    ):
      | {
          state: 'succeeded';
          result: import('../index.js').PaymasterStubV07;
          token?: undefined;
        }
      | {
          state: 'dispatch';
          token: `${string}-${string}-${string}-${string}-${string}`;
          result?: undefined;
        };
    assertDispatch(
      id: string,
      stage: 'stub' | 'final',
      token: string,
      requestHash: string,
    ): boolean;
    complete(
      id: string,
      stage: 'stub' | 'final',
      token: string,
      result: import('../index.js').PaymasterStubV07 | null,
    ): void;
  };
  journal: import('../domain/attempt-journal.js').WalletAttemptJournal & {
    read(
      request: WalletAttemptRequest,
    ): Promise<
      import('../domain/attempt-journal.js').WalletAttemptClaim | null
    >;
  };
  ready: () => Promise<boolean>;
  close: () => void;
  /** Read-only ownership guard before assigning an empty toolkit store to a configured service. */
  hasStoredRecords(): Promise<boolean>;
  /** Configured writers must fence budget changes against the active service revision. */
  setBudget(
    id: string,
    maximum: string,
    configuredRevision?: string,
  ): Promise<void>;
  ensureAssetBudget(
    origin: string,
    accountId: string,
    token: string,
    maximum: string,
    revision: string,
  ): Promise<string>;
  budget(id: string): Promise<{
    maximum: string;
    reserved: string;
  } | null>;
  approveAction(approval: FinancialApproval): Promise<string>;
  /** Read current immutable approval and revocation without admitting a financial attempt. */
  isApprovedAction(
    approval: FinancialApproval,
    allowExpired?: boolean,
  ): Promise<boolean>;
  hasAttemptAdmission(request: WalletAttemptRequest): boolean;
  /** Synchronous inside the shared storage transaction; any admission retains possible signing exposure. */
  hasActionAttempts(id: string): boolean;
  revokeAction(id: string): Promise<void>;
  financialAuthority: (configuration: FinancialAuthorityOptions) => {
    authority: import('../core.js').EmbeddedWalletAuthority;
    journal: import('../domain/attempt-journal.js').WalletAttemptJournal & {
      read(
        request: WalletAttemptRequest,
      ): Promise<
        import('../domain/attempt-journal.js').WalletAttemptClaim | null
      >;
    };
    authorizeAttempt: (request: WalletAttemptRequest) => Promise<boolean>;
    authorizeStatus: (request: WalletAttemptRequest) => Promise<boolean>;
  };
  enrollmentAuthority: (
    configuration: DatabaseEnrollmentOptions,
  ) => import('../index.js').EnrollmentAuthority;
  revokeEnrollment(id: string): Promise<void>;
  /** For existing trusted host authorities. Supply current authorizeAttempt when wrapping the backend. */
  admitAttempt(input: AttemptAdmission): Promise<WalletAttemptRequest>;
  reconcileAttempt: (
    request: WalletAttemptRequest,
    result: WalletAttemptResult,
    evidenceReference: string,
    verify: (
      request: WalletAttemptRequest,
      result: WalletAttemptResult,
      evidenceReference: string,
    ) => Promise<boolean>,
  ) => Promise<void>;
};
```

### PolicyBudgetCharge

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/types.ts).

```ts
/** Explicit optional policy charge; units and meaning are defined by the selecting adapter. */
export interface PolicyBudgetCharge {
  budgetId: string;
  units: string;
  maximum: string;
}
```

### ProviderDatabase

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/index.ts).

```ts
export type ProviderDatabase = ReturnType<typeof openProviderDatabase>;
```

### ProviderDatabaseOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/storage/connection.ts).

```ts
export interface ProviderDatabaseOptions {
  /** Dedicated private directory on persistent local POSIX storage. */
  directory: string;
  /** Explicitly initialize an empty toolkit database. Never upgrades an existing schema. */
  initialize?: boolean;
}
```

## Configuration-first provider service

Import from `@moovha/wallet-provider-kit/deployment`. [Integration guide](setup.md).

- [AdapterInput](#adapterinput)
- [ApprovedCallInput](#approvedcallinput)
- [ApprovedCallIntent](#approvedcallintent)
- [approvedCallPayload](#approvedcallpayload)
- [ApprovedCallPolicy](#approvedcallpolicy)
- [ApprovedCallsConfiguration](#approvedcallsconfiguration)
- [ApprovedContractCall](#approvedcontractcall)
- [buildApprovedCallIntent](#buildapprovedcallintent)
- [BundledAuthorizationConfiguration](#bundledauthorizationconfiguration)
- [CompiledOperationAdapter](#compiledoperationadapter)
- [compileOperationAdapter](#compileoperationadapter)
- [ConfigurationError](#configurationerror)
- [createConfiguredProvider](#createconfiguredprovider)
- [createSafeRecoveryManifest](#createsaferecoverymanifest)
- [createWalletCallsProvider](#createwalletcallsprovider)
- [defaultSafeProvisioning](#defaultsafeprovisioning)
- [inspectSafeRecovery](#inspectsaferecovery)
- [loadProviderConfiguration](#loadproviderconfiguration)
- [OperationAdapters](#operationadapters)
- [OperationAdapterTerms](#operationadapterterms)
- [PinnedContract](#pinnedcontract)
- [predictSafeAddress](#predictsafeaddress)
- [ProviderConfiguration](#providerconfiguration)
- [runtimeApplicationId](#runtimeapplicationid)
- [RuntimeConfigurationOptions](#runtimeconfigurationoptions)
- [RuntimeConfigurationService](#runtimeconfigurationservice)
- [RuntimePolicy](#runtimepolicy)
- [RuntimePolicyChange](#runtimepolicychange)
- [RuntimePolicyProposal](#runtimepolicyproposal)
- [RuntimePolicyRevision](#runtimepolicyrevision)
- [RuntimePolicySnapshot](#runtimepolicysnapshot)
- [RuntimeReview](#runtimereview)
- [SafeAccountBinding](#safeaccountbinding)
- [SafeProvisioningConfiguration](#safeprovisioningconfiguration)
- [SafeRecoveryManifest](#saferecoverymanifest)
- [SafeRecoveryReader](#saferecoveryreader)
- [SecretReference](#secretreference)
- [TokenTransferAdapter](#tokentransferadapter)
- [validateApprovedCallPolicy](#validateapprovedcallpolicy)
- [validateProviderConfiguration](#validateproviderconfiguration)
- [WalletCallsClientOptions](#walletcallsclientoptions)
- [WalletCallsReceipt](#walletcallsreceipt)
- [WalletCallsRpcError](#walletcallsrpcerror)
- [WalletCallsService](#walletcallsservice)
- [WalletCallsStatus](#walletcallsstatus)

### AdapterInput

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operation-adapters.ts).

```ts
export type AdapterInput =
  | Exclude<
      ApprovedCallInput,
      {
        kind: 'contract-call';
      }
    >
  | {
      kind: 'token-transfer';
      token: string;
      recipient: string;
      amount: string;
    };
```

### ApprovedCallInput

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
export type ApprovedCallInput =
  | {
      account_id: string;
      kind: 'contract-call';
      calls: ApprovedContractCall[];
      application_action?: {
        name: string;
        payload: Record<string, string>;
      };
    }
  | {
      account_id: string;
      kind: 'swap';
      route: string;
      amount_in: string;
      minimum_out: string;
      deadline: string;
    }
  | {
      account_id: string;
      kind: 'vault-deposit';
      route: string;
      assets: string;
      minimum_shares: string;
    };
```

### ApprovedCallIntent

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
export interface ApprovedCallIntent extends OperationAdapterTerms {
  adapterInput?: AdapterInput;
  nativeRecipients?: string[];
  version: '1';
  mechanism: 'safe-1.4.1';
  input: ApprovedCallInput;
  account: SafeAccountBinding;
  multiSend: PinnedContract;
  calls: ApprovedContractCall[];
  contracts: PinnedContract[];
  effects: {
    token: string;
    from: string;
    to: string;
    minimum: string;
    maximum?: string;
  }[];
  nonce: string;
}
```

### approvedCallPayload

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
export declare function approvedCallPayload(
  intent: ApprovedCallIntent,
  network?: ProviderNetwork,
): TypedDataAction['payload'];
```

### ApprovedCallPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
export interface ApprovedCallPolicy {
  mechanism: 'safe-1.4.1';
  adapters?: OperationAdapters;
  nativeTransfers?: {
    recipients: (PinnedContract & {
      maximumValueWei: string;
    })[];
  };
  accounts: SafeAccountBinding[];
  multiSend: PinnedContract;
  maximumNativeValueWei: string;
  lifetimeOperations: string;
  contracts: (PinnedContract & {
    selectors: string[];
    maximumValueWei: string;
  })[];
  swaps?: {
    id: string;
    router: PinnedContract;
    tokenIn: PinnedContract;
    tokenOut: PinnedContract;
    fee: number;
    maximumInput: string;
  }[];
  vaults?: {
    id: string;
    router: PinnedContract;
    vault: PinnedContract;
    asset: PinnedContract;
    maximumAssets: string;
  }[];
}
```

### ApprovedCallsConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
export interface ApprovedCallsConfiguration {
  policy: ApprovedCallPolicy;
  maxValiditySeconds: number;
}
```

### ApprovedContractCall

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
export interface ApprovedContractCall {
  to: string;
  value: string;
  data: string;
}
```

### buildApprovedCallIntent

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
/** Construct exact calls server-side; callers cannot supply a signature, nonce or Safe transaction. */
export declare function buildApprovedCallIntent(
  policy: ApprovedCallPolicy,
  input: ApprovedCallInput,
  nonce: string,
  expiresAt: string,
): ApprovedCallIntent;
```

### BundledAuthorizationConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/authorization-contract.ts).

```ts
export interface BundledAuthorizationConfiguration {
  signingKey: SecretReference;
  operatorClients?: {
    clientId: string;
    clientSecret: SecretReference;
  }[];
  clients: {
    clientId: string;
    clientSecret: SecretReference;
    scopes: string[];
  }[];
}
```

### CompiledOperationAdapter

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operation-adapters.ts).

```ts
export interface CompiledOperationAdapter extends OperationAdapterTerms {
  calls: ApprovedContractCall[];
  contracts: PinnedContract[];
  effects: ApprovedCallIntent['effects'];
}
```

### compileOperationAdapter

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operation-adapters.ts).

```ts
/** Compatibility requests compile to the same ordered calls as generic batches. */
export declare function compileOperationAdapter(
  policy: ApprovedCallPolicy,
  input: ApprovedCallInput,
  account: SafeAccountBinding,
  expiresAt: string,
): CompiledOperationAdapter;
```

### ConfigurationError

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/config.ts).

```ts
export declare class ConfigurationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]);
}
```

### createConfiguredProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/provider.ts).

```ts
/** Compose the supported configured service with built-in authority and journals; activation remains explicit. */
export declare function createConfiguredProvider(
  input: unknown,
  directory?: string,
): Promise<
  import('fastify').FastifyInstance<
    import('http').Server<
      typeof import('http').IncomingMessage,
      typeof import('http').ServerResponse
    >,
    import('http').IncomingMessage,
    import('http').ServerResponse<import('http').IncomingMessage>,
    import('fastify').FastifyBaseLogger,
    import('fastify').FastifyTypeProviderDefault
  >
>;
```

### createSafeRecoveryManifest

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/recovery.ts).

```ts
export declare function createSafeRecoveryManifest(input: {
  config: SafeProvisioningConfiguration;
  owner: string;
  module: PinnedContract;
  entryPoint: PinnedContract;
  saltNonce: string;
  proxyCreationCode: string;
}): SafeRecoveryManifest;
```

### createWalletCallsProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/client.ts).

```ts
/** EIP-1193-shaped request interface for EIP-5792, bound to one provider account endpoint. */
export declare function createWalletCallsProvider(
  options: WalletCallsClientOptions,
): {
  request: (input: {
    method: string;
    params?: readonly unknown[] | object;
  }) => Promise<unknown>;
  watchCallsStatus: (
    batchId: string,
    signal?: AbortSignal,
  ) => AsyncGenerator<WalletCallsStatus>;
};
```

### defaultSafeProvisioning

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/defaults.ts).

```ts
/** Safe 1.4.1 canonical deployments from safe-deployments v1.37.40 and safe-contracts 1.4.1. Runtime code is checked against the accepted pins before deployment. */
export declare function defaultSafeProvisioning(): SafeProvisioningConfiguration;
```

### inspectSafeRecovery

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/recovery.ts).

```ts
/** Read-only preparation. The host separately authorizes deployment and any asset movement. */
export declare function inspectSafeRecovery(
  reader: SafeRecoveryReader,
  manifest: SafeRecoveryManifest,
  target: {
    chainId: number;
    genesisHash: string;
  },
): Promise<{
  transaction?:
    | {
        to: string;
        data: string;
        value: string;
      }
    | undefined;
  chainId: number;
  address: string;
  blockNumber: string;
  blockHash: string;
  status: 'undeployed' | 'deployed';
}>;
```

### loadProviderConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/config.ts).

```ts
export declare function loadProviderConfiguration(path: string): Promise<{
  config: ProviderConfiguration;
  directory: string;
}>;
```

### OperationAdapters

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operation-adapters.ts).

```ts
export interface OperationAdapters {
  tokenTransfers?: TokenTransferAdapter[];
  swaps?: NonNullable<ApprovedCallPolicy['swaps']>;
  vaults?: NonNullable<ApprovedCallPolicy['vaults']>;
}
```

### OperationAdapterTerms

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operation-adapters.ts).

```ts
/** Optional terms supplied by selected policy adapters; absent when no additional adapter terms are selected. */
export interface OperationAdapterTerms {
  assetBudgets?: {
    token: string;
    units: string;
    maximum: string;
  }[];
}
```

### PinnedContract

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
export interface PinnedContract {
  address: string;
  codeHash: string;
  implementation?: {
    address: string;
    codeHash: string;
  };
}
```

### predictSafeAddress

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/recovery.ts).

```ts
export declare function predictSafeAddress(
  input: Pick<
    SafeRecoveryManifest,
    'factory' | 'singleton' | 'initializer' | 'saltNonce' | 'proxyCreationCode'
  >,
): string;
```

### ProviderConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/config.ts).

```ts
export interface ProviderConfiguration {
  management?: {
    claim: SecretReference;
    localOrigin?: string;
  };
  safeWallet?: import('../sponsorship/safe-wallet.js').SafeWalletConfiguration;
  network?: ProviderNetwork;
  safeProvisioning?: import('../provisioning/safe.js').SafeProvisioningConfiguration;
  runtimeConfiguration?: RuntimeConfigurationOptions;
  configVersion: 1;
  profile: 'provider-service-v1';
  policy: OnboardingPolicy;
  oauth: OAuthConfiguration;
  authorizationServer?: BundledAuthorizationConfiguration;
  apiExplorer?: ExplorerTokensConfiguration;
  ownerLogin?: {
    issuer: string;
    clientId: string;
    clientSecret: SecretReference;
    idTokenAlgorithm?: 'RS256' | 'ES256';
  };
  reviewers?: string[];
  identity: {
    didit?: {
      apiKey: SecretReference;
      workflowId: string;
      importPrice?: VendorPrice;
      verificationPrice?: VendorPrice;
    };
    sumsub?: {
      appToken: SecretReference;
      secretKey: SecretReference;
      levelName: string;
      reusableKycShareEnabled: true;
      importPrice?: VendorPrice;
      verificationPrice?: VendorPrice;
    };
  };
  backend: {
    kind: 'ows';
    binding: string;
    vaultDirectory: string;
    passphrase: SecretReference;
  };
  storage: {
    kind: 'sqlite';
    directory: string;
  };
  activation: {
    enabled: boolean;
    backendAcceptance?: string;
    recoveryAcceptance?: string;
  };
  approvedCalls?: import('../execution/approved-calls.js').ApprovedCallsConfiguration;
  http?: {
    requestsPerMinute?: number;
    host?: '127.0.0.1' | '0.0.0.0' | '::1' | '::';
    port?: number;
    documentation?: boolean;
    ingress?: 'caddy' | 'existing';
  };
}
```

### runtimeApplicationId

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/runtime-configuration/service.ts).

```ts
export declare const runtimeApplicationId: (
  issuer: string,
  clientId: string,
) => string;
```

### RuntimeConfigurationOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/runtime-configuration/service.ts).

```ts
export interface RuntimeConfigurationOptions {
  rpcVerification?: 'single' | 'quorum';
  authorizeContracts?: boolean;
  credentialKey?: {
    env: string;
  };
  operators: {
    issuer: string;
    clientId: string;
    subject: string;
  }[];
}
```

### RuntimeConfigurationService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/runtime-configuration/service.ts).

```ts
/** Durable configuration control plane. Published records do not authorize wallet effects. */
export declare class RuntimeConfigurationService {
  readonly onboardingPolicy: ResolvedPolicy;
  get rpcVerification(): 'single' | 'quorum';
  withRpc<T>(
    applicationId: string,
    work: (endpoints: string[]) => Promise<T>,
    transport?: typeof fetch,
  ): Promise<T>;
  withSubmissionRpc<T>(
    applicationId: string,
    work: (endpoint: string, unavailable: () => void) => Promise<T>,
    transport?: typeof fetch,
  ): Promise<T>;
  constructor(
    onboardingPolicy: ResolvedPolicy,
    store: OnboardingStore,
    options: RuntimeConfigurationOptions,
    deploymentRevision: string,
    transportRevision?: string | undefined,
    network?: ProviderNetwork | undefined,
    credentialCipher?: ApplicationCredentialCipher | undefined,
    currentOperator?: ((principal: VerifiedPrincipal) => void) | undefined,
  );
  assertOperator(principal: VerifiedPrincipal): void;
  assertOperatorState(principal: VerifiedPrincipal, state: ProviderState): void;
  /** Initialize the current deployment's empty registry without publishing policy or granting access. */
  initialize(): Promise<void>;
  readCredentials(
    principal: VerifiedPrincipal,
    applicationId?: string,
  ): Promise<CredentialMetadata[]>;
  writeCredential(
    context: AuthorityContext,
    reference: string,
    input: {
      expected_revision: string;
      endpoint: string | null;
    },
  ): Promise<CredentialMetadata>;
  /** Resolve only accepted resources belonging to the authenticated application's identity. */
  rpcEndpoints(
    applicationId: string,
    kind?: 'rpc-verification' | 'rpc-submission' | 'rpc-observation',
  ): Promise<string[]>;
  acceptedSponsorship(applicationId: string): Promise<ObligationRecord>;
  readObligations(
    principal: VerifiedPrincipal,
    applicationId?: string,
  ): Promise<{
    application_id: string;
    resources: ObligationRecord[];
    authorizes_spending: false;
    activates_execution: false;
  }>;
  submitObligation<K extends ObligationKind>(
    context: AuthorityContext,
    kind: K,
    input: {
      expected_revision: string;
      value: ApplicationObligations[K];
    },
  ): Promise<ObligationRecord>;
  decideObligation(
    context: AuthorityContext,
    applicationId: string,
    kind: ObligationKind,
    input: {
      expected_revision: string;
      expected_decision_revision: string;
      decision: 'accepted' | 'rejected';
    },
  ): Promise<ObligationRecord>;
  propose(
    context: AuthorityContext,
    input: RuntimePolicyChange,
  ): Promise<RuntimePolicyProposal>;
  listApplications(
    principal: VerifiedPrincipal,
    applicationId?: string,
  ): Promise<{
    network: 'base' | 'base-sepolia';
    role: 'provider' | 'application';
    applications: {
      active_revision: string;
      review: RuntimeReview | undefined;
      publications: RuntimePolicyRevision[];
      publication: RuntimePolicyRevision | undefined;
      proposals_truncated: boolean;
      proposals: {
        published_revision: string | undefined;
        proposal_id: string;
        application_id: string;
        based_on_revision: string;
        policy_hash: string;
        policy: RuntimePolicy;
        created_at: string;
      }[];
      application_id: string;
      name: string;
    }[];
  }>;
  setReview(
    context: AuthorityContext,
    applicationId: string,
    input: {
      expected_revision: string;
      expected_review_revision: string;
      mode: 'automatic' | 'manual';
    },
  ): Promise<RuntimeReview>;
  read(
    principal: VerifiedPrincipal,
    revision?: string,
  ): Promise<{
    authorizes_spending: false;
    publication?: RuntimePolicyRevision | undefined;
    application_id: string;
    active_revision: string;
    revision: string;
  }>;
  readApplication(
    principal: VerifiedPrincipal,
    applicationId: string,
  ): Promise<{
    authorizes_spending: false;
    publication?: RuntimePolicyRevision | undefined;
    application_id: string;
    active_revision: string;
    revision: string;
  }>;
  proposal(
    principal: VerifiedPrincipal,
    proposalId: string,
  ): Promise<RuntimePolicyProposal>;
  publish(
    context: AuthorityContext,
    proposalId: string,
    expectedRevision: string,
  ): Promise<RuntimePolicyRevision>;
  update(
    context: AuthorityContext,
    applicationId: string,
    input: RuntimePolicyChange,
  ): Promise<RuntimePolicyRevision>;
}
```

### RuntimePolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/runtime-configuration/service.ts).

```ts
export interface RuntimePolicy {
  action_requirements?: ApplicationObligations['actions'];
  application_resources_hash?: string;
  version: '1';
  native_transfers?: {
    address: string;
    code_hash: string;
    maximum_value_wei: string;
  }[];
  call_adapters?: import('../execution/operation-adapters.js').OperationAdapters;
  enabled: boolean;
  chain_id: ProviderChainId;
  contracts: {
    address: string;
    code_hash: string;
    implementation?: {
      address: string;
      code_hash: string;
    };
    methods: {
      signature: string;
      maximum_value_wei: string;
      user_address_parameters?: number[];
    }[];
  }[];
  maximum_calls: number;
  maximum_native_value_wei: string;
  max_validity_seconds: number;
  claim_requirements: {
    name: string;
    allowed_values: string[];
    max_age_seconds: number;
  }[];
}
```

### RuntimePolicyChange

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/runtime-configuration/service.ts).

```ts
export interface RuntimePolicyChange {
  expected_revision: string;
  policy: RuntimePolicy;
}
```

### RuntimePolicyProposal

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/runtime-configuration/service.ts).

```ts
export interface RuntimePolicyProposal {
  proposal_id: string;
  application_id: string;
  based_on_revision: string;
  policy_hash: string;
  policy: RuntimePolicy;
  created_at: string;
}
```

### RuntimePolicyRevision

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/runtime-configuration/service.ts).

```ts
export interface RuntimePolicyRevision {
  published_by: string;
  application_id: string;
  revision: string;
  previous_revision: string;
  policy_hash: string;
  policy: RuntimePolicy;
  published_at: string;
  proposal_id?: string;
}
```

### RuntimePolicySnapshot

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/runtime-configuration/authority.ts).

```ts
/** Immutable application publication carried with consent, actions and execution plans. */
export interface RuntimePolicySnapshot {
  application_id: string;
  revision: string;
  policy_hash: string;
  policy: RuntimePolicy;
}
```

### RuntimeReview

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/runtime-configuration/service.ts).

```ts
export interface RuntimeReview {
  mode: 'automatic' | 'manual';
  revision: string;
  approved_by: string;
}
```

### SafeAccountBinding

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
export interface SafeAccountBinding extends PinnedContract {
  accountId: string;
  singleton: PinnedContract;
}
```

### SafeProvisioningConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/safe.ts).

```ts
export interface SafeProvisioningConfiguration {
  profile: 'safe-1.4.1';
  factory: PinnedContract;
  singleton: PinnedContract;
  proxyCodeHash: string;
  maxValiditySeconds: number;
}
```

### SafeRecoveryManifest

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/recovery.ts).

```ts
/** Public deployment data. Back this up with the original owner's recovery material. */
export interface SafeRecoveryManifest {
  format: 'safe-recovery-1';
  address: string;
  owner: string;
  initializer: string;
  saltNonce: string;
  proxyCreationCode: string;
  factory: PinnedContract;
  singleton: PinnedContract;
  proxyCodeHash: string;
  module: PinnedContract;
  entryPoint: PinnedContract;
}
```

### SafeRecoveryReader

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/recovery.ts).

```ts
export interface SafeRecoveryReader {
  call(method: string, params: unknown[]): Promise<unknown>;
}
```

### SecretReference

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/config.ts).

```ts
export interface SecretReference {
  env: string;
}
```

### TokenTransferAdapter

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operation-adapters.ts).

```ts
export interface TokenTransferAdapter {
  token: PinnedContract;
  recipients: string[];
  maximumAmount: string;
  lifetimeAmount?: string;
}
```

### validateApprovedCallPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/approved-calls.ts).

```ts
/** Operator policies explicitly delegate targets/functions; unknown contracts are denied. */
export declare function validateApprovedCallPolicy(
  policy: ApprovedCallPolicy,
  allowUnboundAccounts?: boolean,
): void;
```

### validateProviderConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/config.ts).

```ts
/** Offline and side-effect free. Diagnostics never include configuration values or credentials. */
export declare function validateProviderConfiguration(
  input: unknown,
): ProviderConfiguration;
```

### WalletCallsClientOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/client.ts).

```ts
/** Host-authorized transport. Never place an OAuth client secret in a browser. */
export interface WalletCallsClientOptions {
  network?: ProviderNetwork;
  url: string;
  /** Select the person’s current wallet-specific approval, required for shared wallets. */
  accessGrantId?: string;
  authorization: () => Promise<string>;
  fetch?: typeof fetch;
  /** Present status in the application's wallet UI; called only after an authenticated status read. */
  showCallsStatus?: (status: WalletCallsStatus) => Promise<void>;
}
```

### WalletCallsReceipt

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/types.ts).

```ts
/** EIP-5792 version 2.0.0 wire types for the supported Safe batch profile. */
export interface WalletCallsReceipt {
  logs: {
    address: string;
    data: string;
    topics: string[];
  }[];
  status: string;
  blockHash: string;
  blockNumber: string;
  gasUsed: string;
  transactionHash: string;
}
```

### WalletCallsRpcError

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/client.ts).

```ts
export declare class WalletCallsRpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string);
}
```

### WalletCallsService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/service.ts).

```ts
/** Account-scoped EIP-5792 adapter. The server selects the durable execution driver for each account. */
export declare class WalletCallsService {
  account(
    principal: VerifiedPrincipal,
    accountId: string,
  ): Promise<{
    address: string;
    chainId: '0x2105' | '0x14a34';
  }>;
  constructor(actions: SupportedActions, driver: WalletCallsDriver);
  list(
    principal: VerifiedPrincipal,
    authorizeOperator?: (state: ProviderState) => void,
  ): Promise<{
    truncated: boolean;
    batches: import('./types.js').WalletCallsBatchSummary[];
  }>;
  /** Streams current authorized status; notifications contain no account data. */
  watch(
    principal: VerifiedPrincipal,
    accountId: string,
    batchId: string,
    signal: AbortSignal,
  ): AsyncGenerator<WalletCallsStatus | undefined, void, unknown>;
  request(
    principal: VerifiedPrincipal,
    accountId: string,
    method: string,
    params: unknown[],
  ): Promise<unknown>;
}
```

### WalletCallsStatus

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/types.ts).

```ts
export interface WalletCallsStatus {
  version: '2.0.0';
  id: string;
  chainId: '0x14a34' | '0x2105';
  status: 100 | 200 | 400 | 500;
  atomic: true;
  capabilities?: {
    preconfirmation?: {
      stage: 'preconfirmed';
      transactionHash: string;
      observedAt: string;
    };
  };
  receipts?: WalletCallsReceipt[];
}
```

## Standard wallet calls request adapter

Import from `@moovha/wallet-provider-kit/wallet-calls`. [Integration guide](wallet-calls.md).

- [createWalletCallsProvider](#createwalletcallsprovider)
- [WalletCallsClientOptions](#walletcallsclientoptions)
- [WalletCallsReceipt](#walletcallsreceipt)
- [WalletCallsRpcError](#walletcallsrpcerror)
- [WalletCallsStatus](#walletcallsstatus)

### createWalletCallsProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/client.ts).

```ts
/** EIP-1193-shaped request interface for EIP-5792, bound to one provider account endpoint. */
export declare function createWalletCallsProvider(
  options: WalletCallsClientOptions,
): {
  request: (input: {
    method: string;
    params?: readonly unknown[] | object;
  }) => Promise<unknown>;
  watchCallsStatus: (
    batchId: string,
    signal?: AbortSignal,
  ) => AsyncGenerator<WalletCallsStatus>;
};
```

### WalletCallsClientOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/client.ts).

```ts
/** Host-authorized transport. Never place an OAuth client secret in a browser. */
export interface WalletCallsClientOptions {
  network?: ProviderNetwork;
  url: string;
  /** Select the person’s current wallet-specific approval, required for shared wallets. */
  accessGrantId?: string;
  authorization: () => Promise<string>;
  fetch?: typeof fetch;
  /** Present status in the application's wallet UI; called only after an authenticated status read. */
  showCallsStatus?: (status: WalletCallsStatus) => Promise<void>;
}
```

### WalletCallsReceipt

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/types.ts).

```ts
/** EIP-5792 version 2.0.0 wire types for the supported Safe batch profile. */
export interface WalletCallsReceipt {
  logs: {
    address: string;
    data: string;
    topics: string[];
  }[];
  status: string;
  blockHash: string;
  blockNumber: string;
  gasUsed: string;
  transactionHash: string;
}
```

### WalletCallsRpcError

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/client.ts).

```ts
export declare class WalletCallsRpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string);
}
```

### WalletCallsStatus

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/types.ts).

```ts
export interface WalletCallsStatus {
  version: '2.0.0';
  id: string;
  chainId: '0x14a34' | '0x2105';
  status: 100 | 200 | 400 | 500;
  atomic: true;
  capabilities?: {
    preconfirmation?: {
      stage: 'preconfirmed';
      transactionHash: string;
      observedAt: string;
    };
  };
  receipts?: WalletCallsReceipt[];
}
```

## ERC-4337 and ERC-7677 sponsorship foundation

Import from `@moovha/wallet-provider-kit/sponsorship`. [Integration guide](account-abstraction-sponsorship.md).

- [ApplicationGasAllowance](#applicationgasallowance)
- [applicationGasBudgetId](#applicationgasbudgetid)
- [applicationGasBudgetLimit](#applicationgasbudgetlimit)
- [BundlerConfigurationV07](#bundlerconfigurationv07)
- [createBundlerClientV07](#createbundlerclientv07)
- [createLocalPaymasterTransport](#createlocalpaymastertransport)
- [createPaymasterClientV07](#createpaymasterclientv07)
- [LocalPaymasterAuthorization](#localpaymasterauthorization)
- [localPaymasterDeployment](#localpaymasterdeployment)
- [localPaymasterHashV07](#localpaymasterhashv07)
- [localPaymasterUrl](#localpaymasterurl)
- [LocalVerifyingPaymasterOptions](#localverifyingpaymasteroptions)
- [maximumUserOperationCostV07](#maximumuseroperationcostv07)
- [normalizeUserOperationV07](#normalizeuseroperationv07)
- [packedUserOperation](#packeduseroperation)
- [PaymasterClientOptionsV07](#paymasterclientoptionsv07)
- [PaymasterContext](#paymastercontext)
- [PaymasterDataV07](#paymasterdatav07)
- [PaymasterStubV07](#paymasterstubv07)
- [prepareRuntimeUserOperationV07](#prepareruntimeuseroperationv07)
- [RuntimeUserOperationPreparationOptions](#runtimeuseroperationpreparationoptions)
- [Safe4337Acceptance](#safe4337acceptance)
- [Safe4337SigningConfiguration](#safe4337signingconfiguration)
- [Safe4337SigningOptions](#safe4337signingoptions)
- [Safe4337SigningService](#safe4337signingservice)
- [Safe4337Verifier](#safe4337verifier)
- [safeOpActionV07](#safeopactionv07)
- [safeOpPayloadV07](#safeoppayloadv07)
- [safeOpSignatureV07](#safeopsignaturev07)
- [safeOpTypes](#safeoptypes)
- [safeUserOperationCallData](#safeuseroperationcalldata)
- [signedUserOperationHash](#signeduseroperationhash)
- [SignedUserOperationV07](#signeduseroperationv07)
- [singletonPaymasterSource](#singletonpaymastersource)
- [SponsorshipConsentTerms](#sponsorshipconsentterms)
- [UserOperationDomainV07](#useroperationdomainv07)
- [UserOperationExecution](#useroperationexecution)
- [userOperationExecutionBinding](#useroperationexecutionbinding)
- [UserOperationExecutionCoordinator](#useroperationexecutioncoordinator)
- [userOperationHashV07](#useroperationhashv07)
- [UserOperationObservation](#useroperationobservation)
- [UserOperationReceiptObserver](#useroperationreceiptobserver)
- [UserOperationV07](#useroperationv07)
- [UserOperationWalletCallsConfiguration](#useroperationwalletcallsconfiguration)
- [UserOperationWalletCallsDriver](#useroperationwalletcallsdriver)
- [WalletCallsDriver](#walletcallsdriver)

### ApplicationGasAllowance

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/budget.ts).

```ts
export interface ApplicationGasAllowance {
  clientId: string;
  lifetimeBudgetWei: string;
}
```

### applicationGasBudgetId

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/budget.ts).

```ts
/** One application gas ledger across execution mechanisms and payer pool members. */
export declare function applicationGasBudgetId(
  origin: string,
  issuer: string,
  clientId: string,
): string;
```

### applicationGasBudgetLimit

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/budget.ts).

```ts
/** Pool members cannot multiply the application's configured lifetime allowance. */
export declare function applicationGasBudgetLimit(
  sponsors: readonly ApplicationGasAllowance[],
  clientId: string,
): string;
```

### BundlerConfigurationV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/bundler.ts).

```ts
export interface BundlerConfigurationV07 {
  profile: 'safe4337-bundler-v07';
  url: string;
  maxLogRange: number;
}
```

### createBundlerClientV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/bundler.ts).

```ts
/** Fixed trusted bundler. No retries or URL selection from wallet calls. */
export declare function createBundlerClientV07(
  config: BundlerConfigurationV07,
  domain: UserOperationDomainV07,
  authorization: () => Promise<string>,
  request?: typeof fetch,
): {
  ready: () => Promise<void>;
  send(
    input: SignedUserOperationV07,
    authorizeEffect: () => Promise<void>,
  ): Promise<string>;
  transactionHint(hash: string): Promise<string | undefined>;
};
```

### createLocalPaymasterTransport

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/local-paymaster.ts).

```ts
/** In-process ERC-7677 transport for an application-owned paymaster; all other requests use the supplied transport. */
export declare function createLocalPaymasterTransport(
  options: LocalVerifyingPaymasterOptions,
  fallback?: typeof fetch,
): typeof fetch;
```

### createPaymasterClientV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/paymaster.ts).

```ts
/** ERC-7677 transport for trusted embedded hosts. No public sponsorship endpoint or automatic retry. */
export declare function createPaymasterClientV07(
  options: PaymasterClientOptionsV07,
  request?: typeof fetch,
): {
  stub: (
    operation: UserOperationV07,
    context: PaymasterContext,
  ) => Promise<PaymasterStubV07>;
  data: (
    operation: UserOperationV07,
    context: PaymasterContext,
  ) => Promise<PaymasterStubV07>;
};
```

### LocalPaymasterAuthorization

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/local-paymaster.ts).

```ts
export interface LocalPaymasterAuthorization {
  method: 'pm_getPaymasterStubData' | 'pm_getPaymasterData';
  operation: UserOperationV07;
  context: PaymasterContext;
  maximumCostWei: string;
}
```

### localPaymasterDeployment

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/local-paymaster.ts).

```ts
/** Exact constructor payload and runtime pin for a new application-owned upstream paymaster. */
export declare function localPaymasterDeployment(
  entryPoint: string,
  owner: string,
  manager: string,
  signer: string,
): {
  data: string;
  runtimeCodeHash: string;
};
```

### localPaymasterHashV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/local-paymaster.ts).

```ts
/** Hash used by the pinned upstream SingletonPaymasterV7 verifying mode. */
export declare function localPaymasterHashV07(
  operation: UserOperationV07,
  chainId: string,
): string;
```

### localPaymasterUrl

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/local-paymaster.ts).

```ts
/** Internal transport identity; this address is never resolved over the network. */
export declare const localPaymasterUrl =
  'https://local-paymaster.wallet-provider-kit.invalid/v07';
```

### LocalVerifyingPaymasterOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/local-paymaster.ts).

```ts
export interface LocalVerifyingPaymasterOptions {
  domain: PaymasterClientOptionsV07['domain'];
  paymaster: string;
  signer: string;
  maximumVerificationGas: string;
  maximumPostOpGas: string;
  maximumCostWei: string;
  l1FeeReserveWei: string;
  maximumValiditySeconds?: number;
  /** Resolve current persisted authority and the already claimed sponsorship phase. */
  authorize(request: LocalPaymasterAuthorization): Promise<{
    validAfter: string;
    validUntil: string;
  } | null>;
  /** Protected infrastructure signer. Sign the EIP-191 digest of these exact hash bytes. */
  sign(hash: string, request: LocalPaymasterAuthorization): Promise<string>;
}
```

### maximumUserOperationCostV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/user-operation.ts).

```ts
/** Conservative native-fee reservation, including paymaster validation/post-operation gas. */
export declare function maximumUserOperationCostV07(
  input: UserOperationV07,
  l1FeeReserveWei?: string,
): string;
```

### normalizeUserOperationV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/user-operation.ts).

```ts
export declare function normalizeUserOperationV07(
  input: UserOperationV07,
): UserOperationV07;
```

### packedUserOperation

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/bundler.ts).

```ts
/** Packed EntryPoint v0.7 tuple; signatures are compared as well as the operation hash. */
export declare function packedUserOperation(input: SignedUserOperationV07): {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: string;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
};
```

### PaymasterClientOptionsV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/paymaster.ts).

```ts
export interface PaymasterClientOptionsV07 {
  url: string;
  domain: UserOperationDomainV07;
  paymaster: string;
  maximumVerificationGas: string;
  maximumPostOpGas: string;
  maximumCostWei: string;
  l1FeeReserveWei: string;
  /** Server-owned credential supplier; never use an application-provided URL or secret. */
  authorization(): Promise<string>;
  /** Trusted host gate. Both methods can issue usable sponsorship. Require a durable worst-case reservation and fresh owner/grant/consent/claim authority. */
  authorizeRequest(request: {
    method: 'pm_getPaymasterStubData' | 'pm_getPaymasterData';
    operation: UserOperationV07;
    domain: UserOperationDomainV07;
    context: PaymasterContext;
    maximumCostWei: string;
  }): Promise<boolean>;
}
```

### PaymasterContext

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/paymaster.ts).

```ts
export interface PaymasterContext {
  applicationId: string;
  policyRevision: string;
  policyHash: string;
  actionId: string;
  policyId?: string;
}
```

### PaymasterDataV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/paymaster.ts).

```ts
export interface PaymasterDataV07 {
  paymaster: string;
  paymasterData: string;
  paymasterVerificationGasLimit: string;
  paymasterPostOpGasLimit: string;
}
```

### PaymasterStubV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/paymaster.ts).

```ts
export interface PaymasterStubV07 extends PaymasterDataV07 {
  isFinal: boolean;
  sponsor?: {
    name: string;
  };
}
```

### prepareRuntimeUserOperationV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/preparation.ts).

```ts
/** Pure policy/encoding preparation. It does not establish current owner authority or reserve funds. */
export declare function prepareRuntimeUserOperationV07(
  options: RuntimeUserOperationPreparationOptions,
): {
  profile: 'safe-4337-v07-preparation-v1';
  authorizes_spending: false;
  authorizes_sponsorship: false;
  operation: UserOperationV07;
  domain: UserOperationDomainV07;
  intent: ApprovedCallIntent;
  runtimePolicy: RuntimePolicySnapshot;
  expiresAt: string;
  userOperationHash: string;
  intentHash: string;
  budget: {
    id: string;
    maximum: string;
    maximumCostWei: string;
  };
};
```

### RuntimeUserOperationPreparationOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/preparation.ts).

```ts
export interface RuntimeUserOperationPreparationOptions {
  providerOrigin: string;
  principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>;
  runtimePolicy: RuntimePolicySnapshot;
  basePolicy: ApprovedCallPolicy;
  input: ApprovedCallInput;
  operation: UserOperationV07;
  domain: UserOperationDomainV07;
  sponsors: readonly ApplicationGasAllowance[];
  expiresAt: string;
  maxValiditySeconds: number;
  l1FeeReserveWei: string;
}
```

### Safe4337Acceptance

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/verifier.ts).

```ts
export interface Safe4337Acceptance {
  profile: 'safe-4337-module-0.3.0-v07';
  domain: UserOperationDomainV07;
  entryPoint: PinnedContract;
  module: PinnedContract;
  paymaster: PinnedContract;
  genesisHash: string;
  rpcUrls: string[];
  rpcVerification?: 'single' | 'quorum';
  aggregateReads?: boolean;
  observationRpcUrls?: string[];
}
```

### Safe4337SigningConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/signing.ts).

```ts
export interface Safe4337SigningConfiguration {
  submissionBinding?: string;
  acceptance: Safe4337Acceptance;
  basePolicy: ApprovedCallPolicy;
  sponsors: ApplicationGasAllowance[];
  maxValiditySeconds: number;
  paymaster: Omit<
    PaymasterClientOptionsV07,
    | 'authorization'
    | 'authorizeRequest'
    | 'domain'
    | 'paymaster'
    | 'maximumCostWei'
  >;
}
```

### Safe4337SigningOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/signing.ts).

```ts
export interface Safe4337SigningOptions {
  /** Unwrapped protected signing backend; this service supplies its financial journal. */
  backend: WalletSigningProvider;
  authorization: PaymasterClientOptionsV07['authorization'];
  /** Resolve fresh persisted owner consent to these exact sponsorship/driver terms. Access scopes or contract registration alone are insufficient. */
  authorizeSponsorship(
    context: AuthorityContext,
    terms: SponsorshipConsentTerms,
  ): Promise<{
    termsHash: string;
    consentReference: string;
  } | null>;
}
```

### Safe4337SigningService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/signing.ts).

```ts
/** Advanced embedded-host AS2 adapter. Signs only admitted exact SafeOps; never broadcasts or installs modules. */
export declare class Safe4337SigningService {
  constructor(
    actions: SupportedActions,
    database: ProviderDatabase,
    configuration: Safe4337SigningConfiguration,
    options: Safe4337SigningOptions,
    request?: typeof fetch,
  );
  /** Bind the stored intent approval and exact UserOperation to one idempotency identity. */
  requestCalls(
    context: AuthorityContext,
    input: ApprovedCallInput,
    operation: UserOperationV07,
    expiresAt?: string,
  ): Promise<{
    operation_id: string;
    terms_hash: string;
    maximum_cost_wei: string;
  }>;
  executionBinding(): {
    configurationHash: string;
    submissionBinding: string | undefined;
    acceptance: Safe4337Acceptance;
    paymasterUrl: string;
    accountIds: string[];
  };
  prepareCalls(
    principal: import('../domain/principal.js').VerifiedPrincipal,
    input: ApprovedCallInput,
    gas: Pick<
      UserOperationV07,
      | 'callGasLimit'
      | 'verificationGasLimit'
      | 'preVerificationGas'
      | 'maxFeePerGas'
      | 'maxPriorityFeePerGas'
    >,
  ): Promise<UserOperationV07>;
  assertAccepted(
    principal: import('../domain/principal.js').VerifiedPrincipal,
    accountId: string,
  ): Promise<void>;
  authorizeSubmission(
    context: AuthorityContext,
    id: string,
    verifyChain?: boolean,
  ): Promise<void>;
  /** Internal paymaster port. A claimed durable phase and current authority are required before usable sponsorship. */
  authorizeLocalPaymaster(request: LocalPaymasterAuthorization): Promise<{
    validAfter: string;
    validUntil: string;
  }>;
  withExecutionRead<T>(
    principal: import('../domain/principal.js').VerifiedPrincipal,
    id: string,
    operation: (
      state: import('../onboarding/types.js').ProviderState,
      record: SponsorshipAdmission,
    ) => T,
  ): Promise<T>;
  admit(
    context: AuthorityContext,
    id: string,
    operation: UserOperationV07,
  ): Promise<{
    operation_id: string;
    terms_hash: string;
    maximum_cost_wei: string;
  }>;
  /** Replays only recorded successful quotes. Unknown/leased phases cannot contact the paymaster again. */
  sponsor(
    context: AuthorityContext,
    id: string,
  ): Promise<{
    paymaster: string;
    paymasterData: string;
    paymasterVerificationGasLimit: string;
    paymasterPostOpGasLimit: string;
    sender: string;
    nonce: string;
    callData: string;
    callGasLimit: string;
    verificationGasLimit: string;
    preVerificationGas: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  }>;
  sign(
    context: AuthorityContext,
    id: string,
  ): Promise<{
    signature: string;
    paymaster: string;
    paymasterData: string;
    paymasterVerificationGasLimit: string;
    paymasterPostOpGasLimit: string;
    sender: string;
    nonce: string;
    callData: string;
    callGasLimit: string;
    verificationGasLimit: string;
    preVerificationGas: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  }>;
}
```

### Safe4337Verifier

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/verifier.ts).

```ts
/** Independent chain reads at a common block. Checks only the accepted ERC-4337 account configuration. */
export declare class Safe4337Verifier {
  constructor(config: Safe4337Acceptance, request?: typeof fetch);
  /** Advisory nonce preparation only. Admission must still verify the complete account proof. */
  prepareNonce(account: string): Promise<string>;
  verify(
    intent: Pick<
      ApprovedCallIntent,
      'account' | 'multiSend' | 'calls' | 'contracts' | 'nativeRecipients'
    > &
      Partial<Pick<ApprovedCallIntent, 'adapterInput' | 'effects'>>,
    owner: string,
    nonce?: string,
  ): Promise<string>;
}
```

### safeOpActionV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/safe-op.ts).

```ts
export declare function safeOpActionV07(
  payload: TypedDataAction['payload'],
  signer: EmbeddedAccount,
  actionId: string,
  operationId: string,
): TypedDataAction;
```

### safeOpPayloadV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/safe-op.ts).

```ts
export declare function safeOpPayloadV07(
  input: UserOperationV07,
  domain: UserOperationDomainV07,
  module: string,
  validAfter: string,
  validUntil: string,
): TypedDataAction['payload'];
```

### safeOpSignatureV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/safe-op.ts).

```ts
/** Strict single-owner EIP-712 signature, prefixed with the validity window expected by Safe4337Module. */
export declare function safeOpSignatureV07(
  action: TypedDataAction,
  owner: string,
  signature: string,
): string;
```

### safeOpTypes

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/safe-op.ts).

```ts
/** Safe4337Module 0.3.0, EntryPoint v0.7. Field order and uint widths match its SafeOp type hash. */
export declare const safeOpTypes: {
  SafeOp: {
    name: string;
    type: string;
  }[];
};
```

### safeUserOperationCallData

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/preparation.ts).

```ts
/** Encode the exact ordered calls for Safe4337Module execution. */
export declare function safeUserOperationCallData(
  intent: ApprovedCallIntent,
): string;
```

### signedUserOperationHash

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/bundler.ts).

```ts
export declare function signedUserOperationHash(
  input: SignedUserOperationV07,
  domain: UserOperationDomainV07,
): string;
```

### SignedUserOperationV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/bundler.ts).

```ts
export type SignedUserOperationV07 = UserOperationV07 & {
  signature: string;
};
```

### singletonPaymasterSource

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/local-paymaster.ts).

```ts
export declare const singletonPaymasterSource =
  '1e2305d1102242379b582142f62bd17add12b8c2';
```

### SponsorshipConsentTerms

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/signing.ts).

```ts
export interface SponsorshipConsentTerms {
  operationId: string;
  sourceApprovalHash: string;
  configurationHash: string;
  preparation: ReturnType<typeof prepareRuntimeUserOperationV07>;
  validAfter: string;
  validUntil: string;
  maximumCostWei: string;
}
```

### UserOperationDomainV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/user-operation.ts).

```ts
export interface UserOperationDomainV07 {
  entryPointVersion: '0.7';
  entryPoint: string;
  chainId: '0x14a34' | '0x2105' | '0xaa36a7';
}
```

### UserOperationExecution

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/execution-types.ts).

```ts
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
```

### userOperationExecutionBinding

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/execution.ts).

```ts
export declare function userOperationExecutionBinding(
  config: BundlerConfigurationV07,
): string;
```

### UserOperationExecutionCoordinator

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/execution.ts).

```ts
/** One durable bundler dispatch per admitted operation. Recovery only reads independent chain evidence. */
export declare class UserOperationExecutionCoordinator {
  readonly actions: SupportedActions;
  readonly signing: Safe4337SigningService;
  readonly configurationHash: string;
  subscribe(listener: (id: string) => void): () => void;
  constructor(
    actions: SupportedActions,
    database: ProviderDatabase,
    signing: Safe4337SigningService,
    configuration: BundlerConfigurationV07,
    authorization: () => Promise<string>,
    request?: typeof fetch,
  );
  load(id: string): Promise<UserOperationExecution | null>;
  execute(
    context: AuthorityContext,
    id: string,
  ): Promise<UserOperationExecution | null>;
  refresh(id: string): Promise<UserOperationExecution | null>;
  read(
    principal: VerifiedPrincipal,
    id: string,
  ): Promise<UserOperationExecution | null>;
}
```

### userOperationHashV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/user-operation.ts).

```ts
/** EntryPoint v0.7 hashing; signatures are not accepted by this unsigned preparation profile. */
export declare function userOperationHashV07(
  input: UserOperationV07,
  domain: UserOperationDomainV07,
): string;
```

### UserOperationObservation

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/execution-types.ts).

```ts
export interface UserOperationObservation {
  state: 'pending' | 'included' | 'safe' | 'finalized' | 'reorged' | 'expired';
  expiry?: {
    validUntil: string;
    finalizedBlock: string;
    blockHash: string;
    blockTimestamp: string;
  };
  receipt?: WalletCallsReceipt;
  actualGasCost?: string;
  actualGasUsed?: string;
  observedAt: string;
  scanNextBlock: string;
}
```

### UserOperationReceiptObserver

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/receipts.ts).

```ts
/** Independent canonical EntryPoint evidence, including per-operation log boundaries inside a shared bundle. */
export declare class UserOperationReceiptObserver {
  constructor(
    acceptance: Safe4337Acceptance,
    maxLogRange: number,
    request?: typeof fetch,
  );
  anchor(): Promise<string>;
  observe(
    plan: UserOperationExecution,
    maximumCostWei: string,
    hint?: string,
  ): Promise<UserOperationObservation>;
}
```

### UserOperationV07

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/user-operation.ts).

```ts
/** Deployed-account, EntryPoint v0.7 wire profile. No factories or EIP-7702 delegation. */
export interface UserOperationV07 {
  sender: string;
  nonce: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymaster?: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  paymasterData?: string;
}
```

### UserOperationWalletCallsConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/wallet-calls.ts).

```ts
export interface UserOperationWalletCallsConfiguration {
  gas: Pick<
    UserOperationV07,
    | 'callGasLimit'
    | 'verificationGasLimit'
    | 'preVerificationGas'
    | 'maxFeePerGas'
    | 'maxPriorityFeePerGas'
  >;
  maxDepthPerSafe: number;
  maxWaitSeconds: number;
  pollIntervalSeconds: number;
  maxConcurrentAccounts?: number;
  maxDepthTotal?: number;
}
```

### UserOperationWalletCallsDriver

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/wallet-calls.ts).

```ts
/** Durable ERC-4337 batch lane. Uncertain batches retain their immutable operation identity. */
export declare class UserOperationWalletCallsDriver implements WalletCallsDriver {
  constructor(
    actions: SupportedActions,
    database: ProviderDatabase,
    execution: UserOperationExecutionCoordinator,
    configuration: UserOperationWalletCallsConfiguration,
    networkFees?:
      | (() => Promise<
          Pick<UserOperationV07, 'maxFeePerGas' | 'maxPriorityFeePerGas'>
        >)
      | undefined,
    prepareWork?: ((work: () => Promise<void>) => Promise<void>) | undefined,
    estimateOperation?:
      ((operation: UserOperationV07) => Promise<UserOperationV07>) | undefined,
    wake?: ((delay: number) => void) | undefined,
  );
  subscribe(listener: (batchId: string) => void): () => void;
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
    refresh?: boolean,
  ): Promise<WalletCallsStatus>;
  list(
    principal: VerifiedPrincipal,
    authorizeOperator?: (state: ProviderState) => void,
  ): Promise<{
    truncated: boolean;
    batches: WalletCallsBatchSummary[];
  }>;
  runOnce(
    snapshot?: readonly UserOperationBatch[],
    settlement?: boolean,
  ): Promise<void>;
  /** Observe historical inclusion separately so finality reads cannot hold an admission worker. */
  settleOnce(snapshot?: readonly UserOperationBatch[]): Promise<boolean>;
  start(): void;
  stop(): Promise<void>;
}
```

### WalletCallsDriver

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/execution-types.ts).

```ts
export interface WalletCallsDriver {
  subscribe?(listener: (batchId: string) => void): () => void;
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
    refresh?: boolean,
  ): Promise<import('../wallet-calls/types.js').WalletCallsStatus>;
  list(
    principal: VerifiedPrincipal,
    authorizeOperator?: (
      state: import('../onboarding/types.js').ProviderState,
    ) => void,
  ): Promise<{
    truncated: boolean;
    batches: WalletCallsBatchSummary[];
  }>;
}
```

## Personal and shared wallets

Import from `@moovha/wallet-provider-kit/wallets`. [Integration guide](multiple-wallets.md).

- [AccessRequestInput](#accessrequestinput)
- [createWalletsClient](#createwalletsclient)
- [MemberSettings](#membersettings)
- [WalletAccessError](#walletaccesserror)
- [WalletDescription](#walletdescription)
- [WalletSummary](#walletsummary)

### AccessRequestInput

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
/** A request may reuse the caller's current stored identity evidence; consent is always supplied. */
export type AccessRequestInput = Omit<AccessInput, 'user'> & {
  user?: Omit<ApplicationUserAssertion, 'identity'> & {
    identity?: ApplicationUserAssertion['identity'];
  };
};
```

### createWalletsClient

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallets/client.ts).

```ts
/** For a trusted application backend. Supply short-lived bearer authorization; never embed a client secret in a browser. */
export declare function createWalletsClient(options: {
  url: string;
  network?: ProviderNetwork;
  authorization(): Promise<string>;
  fetch?: typeof fetch;
}): {
  requestAccess(
    input: AccessRequestInput,
    idempotencyKey: string,
  ): Promise<{
    request_id: string;
    status: string;
    account_id?: string;
    grant_id?: string;
    wallet?: WalletDescription;
    permissions?: Permission[];
    expires_at?: string;
  }>;
  revokeAccess(
    grantId: string,
    idempotencyKey: string,
  ): Promise<{
    grant_id: string;
    status: 'revoked';
  }>;
  listWallets(userId: string): Promise<{
    accounts: WalletSummary[];
  }>;
  account(
    accountId: string,
    grantId?: string,
  ): Promise<{
    account_id: string;
    wallet: WalletDescription;
    status: string;
    address?: string;
  }>;
  provision(
    accountId: string,
    grantId: string,
    idempotencyKey: string,
  ): Promise<{
    account_id: string;
    address: string;
  }>;
  members(accountId: string, grantId: string): Promise<MemberSettings>;
  saveMember(
    accountId: string,
    grantId: string,
    input: {
      expected_revision: number;
      user_id?: string;
      member_id?: string;
      name?: string;
      enabled: boolean;
      permissions: ('account:read' | 'contracts:request')[];
    },
    idempotencyKey: string,
  ): Promise<MemberSettings>;
  walletProvider(wallet: WalletSummary): {
    request: (input: {
      method: string;
      params?: readonly unknown[] | object;
    }) => Promise<unknown>;
    watchCallsStatus: (
      batchId: string,
      signal?: AbortSignal,
    ) => AsyncGenerator<import('../wallet-calls/types.js').WalletCallsStatus>;
  };
};
```

### MemberSettings

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallets/client.ts).

```ts
export interface MemberSettings {
  account_id: string;
  wallet: WalletDescription;
  revision: number;
  members: {
    member_id: string;
    application_id: string;
    user_id?: string;
    name: string;
    permissions: Permission[];
    membership_revision: number;
    status: 'invited' | 'active' | 'removed';
  }[];
}
```

### WalletAccessError

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallets/client.ts).

```ts
export declare class WalletAccessError extends Error {
  readonly status: number;
  constructor(status: number);
}
```

### WalletDescription

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface WalletDescription {
  reference: string;
  name: string;
  kind: 'personal' | 'shared';
}
```

### WalletSummary

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallets/client.ts).

```ts
export interface WalletSummary {
  account_id: string;
  is_default: boolean;
  wallet: WalletDescription;
  grant_id: string;
  permissions: Permission[];
  expires_at: string;
  role: 'owner' | 'member';
}
```
