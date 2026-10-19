# TypeScript API reference

Use these declarations when extending the backend selected in
[Backend](setup-wizard.md#_2-backend), or embedding the service in your own server.
The configured wizard service does not require library composition. For the API
your connected applications call after deployment, use the [HTTP guide](http-api.md).
For contributing or regeneration, see the [development guide](../CONTRIBUTING.md#development).

Start with the [API guide](api.md) for composition, ownership and errors, or the
[runnable integration tutorial](integration-example.md). These declaration excerpts
are a reference, not standalone programs. Read [roles and terms](concepts.md)
for owners, application clients, host authority, wallet backends and journals.
Supporting names and schema aliases
retain their source declaration names; follow the declaration link for their imports.

The root `@moovha/wallet-provider-kit` re-exports core, HTTP, onboarding,
identity, telemetry, storage and deployment. Provider adapters require their explicit subpaths.

## Host authority and signing attempts

Import from `@moovha/wallet-provider-kit/core`. [Integration guide](api.md#core-wallet-service).

- [AuthorityContext](#authoritycontext)
- [createDurableSigningService](#createdurablesigningservice)
- [createJournaledWalletProvider](#createjournaledwalletprovider)
- [createStoredWalletBackend](#createstoredwalletbackend)
- [EmbeddedAccount](#embeddedaccount)
- [EmbeddedWalletAuthority](#embeddedwalletauthority)
- [EmbeddedWalletService](#embeddedwalletservice)
- [JournaledProviderOptions](#journaledprovideroptions)
- [SigningAuthority](#signingauthority)
- [StoredAccountAuthority](#storedaccountauthority)
- [StoredAccountRecord](#storedaccountrecord)
- [StoredAccountResult](#storedaccountresult)
- [StoredSigningAuthority](#storedsigningauthority)
- [StoredSigningDispatch](#storedsigningdispatch)
- [StoredSigningResult](#storedsigningresult)
- [StoredTypedDataSigner](#storedtypeddatasigner)
- [StoredWalletBackendConfiguration](#storedwalletbackendconfiguration)
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

### createDurableSigningService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
/** Supplied durable dispatch: admission and dispatch commits precede the only signing call. */
export declare function createDurableSigningService<Context>(
  authority: StoredSigningAuthority<Context>,
  signer: StoredTypedDataSigner,
  network?: ProviderNetwork,
): {
  sign(context: Context, actionId: string): Promise<StoredSigningResult>;
};
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

### createStoredWalletBackend

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
/** Ready-made lifecycle around a selected provider and trusted host policy/storage adapters. */
export declare function createStoredWalletBackend<
  SigningContext,
  AccountContext,
>(
  configuration: StoredWalletBackendConfiguration<
    SigningContext,
    AccountContext
  >,
): {
  sign: (
    context: SigningContext,
    actionId: string,
  ) => Promise<StoredSigningResult>;
  account(
    context: AccountContext,
    recover?: boolean,
  ): Promise<StoredAccountResult>;
};
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

### StoredAccountAuthority

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
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
```

### StoredAccountRecord

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredAccountRecord {
  accountId: string;
  attemptId: string;
  state: 'admitted' | 'dispatching' | 'bound' | 'unknown';
  leaseToken: string;
  address: string | null;
}
```

### StoredAccountResult

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredAccountResult {
  accountId: string;
  address: string | null;
  state: StoredAccountRecord['state'];
}
```

### StoredSigningAuthority

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
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
```

### StoredSigningDispatch

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredSigningDispatch {
  attemptId: string;
  leaseToken: string;
  accountId: string;
  address: string;
  action: TypedDataAction;
}
```

### StoredSigningResult

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredSigningResult {
  attemptId: string;
  state: 'admitted' | 'dispatching' | 'succeeded' | 'rejected' | 'unknown';
  signature: string | null;
}
```

### StoredTypedDataSigner

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredTypedDataSigner {
  readonly provider: string;
  signTypedData(dispatch: StoredSigningDispatch): Promise<string>;
}
```

### StoredWalletBackendConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredWalletBackendConfiguration<
  SigningContext,
  AccountContext,
> {
  /** Explicit host opt-in; credentials never activate this backend. */
  enabled: boolean;
  network?: ProviderNetwork;
  provider: WalletSigningProvider;
  signingAuthority: StoredSigningAuthority<SigningContext>;
  accountAuthority: StoredAccountAuthority<AccountContext>;
}
```

### TypedDataAction

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/signing.ts).

```ts
export type TypedDataAction = components['schemas']['TypedDataAction'];
```

### VerifiedPrincipal

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/principal.ts).

```ts
/** Constructed by a trusted authentication adapter, never from a request body. */
export interface VerifiedPrincipal {
  readonly issuer: string;
  readonly subject: string;
  readonly clientId: string;
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
  readonly kind: 'provision' | 'sign_typed_data' | 'relay_transaction';
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
      kind: 'relay_transaction';
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
Use `ProviderPaths["/v1/actions/{actionId}/sign"]["post"]` to select an operation.
See the [HTTP reference](http-reference.md).

### ServerOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/service/server.ts).

```ts
export interface ServerOptions {
  safeProvisioning?: import('../provisioning/safe.js').SafeProvisioningService;
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
  operationsHealth?: () => Promise<
    import('../execution/operations.js').OperationsHealth
  >;
  documentation?: boolean;
  /** Optional operator-authenticated client-credentials broker for the deployed explorer. */
  documentationTokens?: DocumentationTokenOptions;
  configurationProfile?: 'provider-service-v1';
  actionProfiles?: readonly (
    'provider-authorized-erc3009-v1' | 'provider-approved-contracts-v1'
  )[];
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
    'cancelled' | 'expired' | 'blocked' | 'succeeded' | 'queued' | 'executing';
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
  constructor(actions: SupportedActions, driver: WalletCallsDriver);
  constructor(
    actions: SupportedActions,
    queue: SafeExecutionQueue,
    execution: ApprovedExecutionCoordinator,
    driver?: WalletCallsDriver,
  );
  list(
    principal: VerifiedPrincipal,
    authorizeOperator?: (state: ProviderState) => void,
  ): Promise<{
    truncated: boolean;
    batches: import('./types.js').WalletCallsBatchSummary[];
  }>;
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

### AccessInput

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/onboarding/types.ts).

```ts
export interface AccessInput {
  mode: 'create' | 'connect';
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
    transfer_policy_revision?: string;
    action_policy_revision?: string;
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
  readonly policy: Readonly<{
    revision: string;
    identity: {
      maxAgeDays: number;
      records?: import('./types.js').ApplicationRecordPolicy;
      application?: {
        requiredFields: string[];
        verificationLevel: string;
      };
    };
    access: {
      maxAgeDays: number;
      mode: 'application' | 'hosted';
    };
    version: string;
    provider: {
      name: string;
      origin: string;
      privacyUrl: string;
    };
    applications: import('./types.js').ApplicationPolicy[];
  }>;
  constructor(
    input: OnboardingPolicy,
    store: OnboardingStore,
    adapters?: IdentityAdapter[],
    walletReader?: Pick<WalletSigningProvider, 'findAccount'> | undefined,
    transferPolicyRevision?: string | undefined,
    runtimeContracts?: boolean,
  );
  applicationAccessPolicy(principal: VerifiedPrincipal): Promise<
    | {
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
        transfer_policy_revision?: string | undefined;
        action_policy_revision?: string | undefined;
        flow: 'application' | 'hosted';
        policy_revision: string;
      }
    | {
        action_policy_revision: string | undefined;
        transfer_policy_revision: string | undefined;
        required_fields: string[];
        runtime_contract_terms: import('../runtime-configuration/authority.js').RuntimePolicySnapshot;
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
    value: AccessInput,
  ): Promise<{
    account_id?: string | undefined;
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'transfers:request'
          | 'contracts:request'
        )[]
      | undefined;
    expires_at?: string | undefined;
    grant_id?: string | undefined;
    consent_url?: string | undefined;
    request_id: string;
    status: string;
  }>;
  read(
    context: AuthorityContext,
    id: string,
  ): Promise<{
    account_id?: string | undefined;
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'transfers:request'
          | 'contracts:request'
        )[]
      | undefined;
    expires_at?: string | undefined;
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
    transfer_policy_revision?: string | undefined;
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
      | 'transfers:request'
      | 'contracts:request'
    )[];
    mode: 'connect' | 'create';
    durationDays: number;
    status: string;
  }>;
  consent(
    id: string,
    identity: OwnerIdentity,
    approve: boolean,
  ): Promise<{
    account_id?: string | undefined;
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'transfers:request'
          | 'contracts:request'
        )[]
      | undefined;
    expires_at?: string | undefined;
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
    account_id?: string | undefined;
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'transfers:request'
          | 'contracts:request'
        )[]
      | undefined;
    expires_at?: string | undefined;
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
      status: 'suspended' | 'active';
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
    account_id?: string | undefined;
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'transfers:request'
          | 'contracts:request'
        )[]
      | undefined;
    expires_at?: string | undefined;
    grant_id?: string | undefined;
    consent_url?: string | undefined;
    request_id: string;
    status: string;
  }>;
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
      'application_attestation' | 'application_record' | undefined;
    evaluation_only?: boolean | undefined;
    account_id: string;
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
    account_id?: string | undefined;
    permissions?:
      | (
          | 'account:read'
          | 'operations:request'
          | 'transfers:request'
          | 'contracts:request'
        )[]
      | undefined;
    expires_at?: string | undefined;
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
        | 'transfers:request'
        | 'contracts:request'
      )[];
      state: 'revoked' | 'suspended' | 'active';
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
  format: 'moovha-onboarding-1';
  assetReservations?: Record<
    string,
    {
      budgetId: string;
      units: string;
    }
  >;
  assetBudgetMigrations?: Record<
    string,
    {
      revision: string;
      profile: 'direct-token-transfers-v1';
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
  backendAccounts?: Record<
    string,
    {
      binding: string;
      signer: RelayerBinding;
    }
  >;
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
      safeAccounts?: Record<
        string,
        import('../provisioning/safe.js').SafeDeploymentRecord
      >;
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

## Coinbase CDP adapter

Import from `@moovha/wallet-provider-kit/cdp`. [Integration guide](provider-guide.md#current-adapter-profile).

- [createCdpWalletProvider](#createcdpwalletprovider)

### createCdpWalletProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/cdp.ts).

```ts
/**
 * No SDK singleton, telemetry, ambient credentials, redirects or automatic retries.
 * Auth uses the vendor's public SDK; HTTP lifecycle belongs to this adapter.
 * Import this factory explicitly when selecting CDP. Compose business policy and
 * durable attempts through the configured service or an embedded host before activation.
 */
export declare function createCdpWalletProvider(
  environment: NodeJS.ProcessEnv,
  request?: typeof fetch,
  network?: ProviderNetwork,
): WalletSigningProvider;
```

## Open Wallet Standard adapter

Import from `@moovha/wallet-provider-kit/ows`. [Integration guide](ows-adapter.md).

- [createOwsWalletProvider](#createowswalletprovider)
- [OwsProviderOptions](#owsprovideroptions)

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

## OpenZeppelin Relayer adapter and execution

Import from `@moovha/wallet-provider-kit/openzeppelin-relayer`. [Integration guide](openzeppelin-relayer.md).

- [createOpenZeppelinRelayerExecutor](#createopenzeppelinrelayerexecutor)
- [createOpenZeppelinRelayerWalletProvider](#createopenzeppelinrelayerwalletprovider)
- [hashRelayerTransaction](#hashrelayertransaction)
- [RelayerAcceptance](#relayeracceptance)
- [RelayerAttemptJournal](#relayerattemptjournal)
- [RelayerAttemptOptions](#relayerattemptoptions)
- [RelayerBinding](#relayerbinding)
- [RelayerConnection](#relayerconnection)
- [RelayerExecutionAction](#relayerexecutionaction)
- [RelayerExecutionAuthority](#relayerexecutionauthority)
- [RelayerExecutionAuthorityRecord](#relayerexecutionauthorityrecord)
- [RelayerExecutionProvider](#relayerexecutionprovider)
- [RelayerExecutionService](#relayerexecutionservice)
- [RelayerTransaction](#relayertransaction)
- [RelayerTransactionStatus](#relayertransactionstatus)

### createOpenZeppelinRelayerExecutor

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/openzeppelin-relayer.ts).

```ts
/** Relayer allocates nonces and owns its queue/broadcast workers. Host approval stays here. */
export declare function createOpenZeppelinRelayerExecutor(
  connection: RelayerConnection,
  options: RelayerAttemptOptions,
  request?: typeof fetch,
): RelayerExecutionProvider;
```

### createOpenZeppelinRelayerWalletProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/openzeppelin-relayer.ts).

```ts
/** Binds preconfigured Relayer keys; never creates a signer or wallet through its admin API. */
export declare function createOpenZeppelinRelayerWalletProvider(
  connection: RelayerConnection,
  attempts: JournaledProviderOptions,
  request?: typeof fetch,
): WalletSigningProvider;
```

### hashRelayerTransaction

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/relayer-execution.ts).

```ts
/** Hash the approved call/initial fees, not an unsigned Ethereum transaction. */
export declare function hashRelayerTransaction(
  transaction: RelayerTransaction,
): string;
```

### RelayerAcceptance

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/relayer-execution.ts).

```ts
export interface RelayerAcceptance {
  /** A provider record ID. Never a chain transaction hash or settlement proof. */
  transactionId: string;
}
```

### RelayerAttemptJournal

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/openzeppelin-relayer.ts).

```ts
export interface RelayerAttemptJournal extends WalletAttemptJournal {
  /** No claims, reservations, state transitions or writes during read. */
  read(request: WalletAttemptRequest): Promise<WalletAttemptClaim | null>;
}
```

### RelayerAttemptOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/openzeppelin-relayer.ts).

```ts
export interface RelayerAttemptOptions extends JournaledProviderOptions {
  journal: RelayerAttemptJournal;
  /** Current read permission for the original attempt; no new spending lease required. */
  authorizeStatus(request: WalletAttemptRequest): Promise<boolean>;
}
```

### RelayerBinding

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/relayer-client.ts).

```ts
export interface RelayerBinding {
  relayerId: string;
  signerId: string;
  address: string;
  bindingRevision: string;
}
```

### RelayerConnection

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/providers/relayer-client.ts).

```ts
export interface RelayerConnection {
  network?: ProviderNetwork;
  /** Operator-configured HTTPS origin, without path, query, credentials or fragment. */
  url: string;
  apiKey: string;
  /** Server-owned binding. Never resolve from an HTTP transaction body. */
  resolveAccount(accountId: string): Promise<RelayerBinding | null>;
}
```

### RelayerExecutionAction

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/relayer-execution.ts).

```ts
export interface RelayerExecutionAction {
  actionId: string;
  operationId: string;
  kind: 'relay_transaction';
  profile: 'oz_relayer_evm_v1';
  profileRevision: '1';
  status: 'ready';
  chainId: ProviderChainId;
  chainAccountId: string;
  bindingRevision: string;
  capabilityRevision: string;
  planRevision: string;
  planHash: string;
  payloadHash: string;
  expiresAt: string;
  transaction: RelayerTransaction;
}
```

### RelayerExecutionAuthority

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/relayer-execution.ts).

```ts
export interface RelayerExecutionAuthority {
  /** Load immutable action by ID, verify current owner/grant/KYC/consent and admit its budget durably. */
  execution(
    context: AuthorityContext,
    actionId: string,
    purpose: 'submit' | 'status',
  ): Promise<RelayerExecutionAuthorityRecord | null>;
}
```

### RelayerExecutionAuthorityRecord

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/relayer-execution.ts).

```ts
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
```

### RelayerExecutionProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/relayer-execution.ts).

```ts
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
```

### RelayerExecutionService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/relayer-execution.ts).

```ts
/** Library-only stored-action service. No raw transaction HTTP endpoint is added. */
export declare class RelayerExecutionService {
  constructor(
    authority: RelayerExecutionAuthority,
    provider: RelayerExecutionProvider,
  );
  submit(
    context: AuthorityContext,
    actionId: string,
  ): Promise<RelayerAcceptance>;
  status(
    context: AuthorityContext,
    actionId: string,
    transactionId: string,
  ): Promise<RelayerTransactionStatus>;
}
```

### RelayerTransaction

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/relayer-execution.ts).

```ts
/** Relayer owns the nonce. This is NOT the draft's fully populated Transaction. */
export interface RelayerTransaction {
  to: string;
  value: string;
  data: string;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}
```

### RelayerTransactionStatus

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/domain/relayer-execution.ts).

```ts
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
```

## Supplied stored-action backend

Import from `@moovha/wallet-provider-kit/backend`. [Integration guide](stored-backend.md).

- [createDurableSigningService](#createdurablesigningservice)
- [createStoredWalletBackend](#createstoredwalletbackend)
- [StoredAccountAuthority](#storedaccountauthority)
- [StoredAccountRecord](#storedaccountrecord)
- [StoredAccountResult](#storedaccountresult)
- [StoredSigningAuthority](#storedsigningauthority)
- [StoredSigningDispatch](#storedsigningdispatch)
- [StoredSigningResult](#storedsigningresult)
- [StoredTypedDataSigner](#storedtypeddatasigner)
- [StoredWalletBackendConfiguration](#storedwalletbackendconfiguration)

### createDurableSigningService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
/** Supplied durable dispatch: admission and dispatch commits precede the only signing call. */
export declare function createDurableSigningService<Context>(
  authority: StoredSigningAuthority<Context>,
  signer: StoredTypedDataSigner,
  network?: ProviderNetwork,
): {
  sign(context: Context, actionId: string): Promise<StoredSigningResult>;
};
```

### createStoredWalletBackend

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
/** Ready-made lifecycle around a selected provider and trusted host policy/storage adapters. */
export declare function createStoredWalletBackend<
  SigningContext,
  AccountContext,
>(
  configuration: StoredWalletBackendConfiguration<
    SigningContext,
    AccountContext
  >,
): {
  sign: (
    context: SigningContext,
    actionId: string,
  ) => Promise<StoredSigningResult>;
  account(
    context: AccountContext,
    recover?: boolean,
  ): Promise<StoredAccountResult>;
};
```

### StoredAccountAuthority

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
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
```

### StoredAccountRecord

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredAccountRecord {
  accountId: string;
  attemptId: string;
  state: 'admitted' | 'dispatching' | 'bound' | 'unknown';
  leaseToken: string;
  address: string | null;
}
```

### StoredAccountResult

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredAccountResult {
  accountId: string;
  address: string | null;
  state: StoredAccountRecord['state'];
}
```

### StoredSigningAuthority

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
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
```

### StoredSigningDispatch

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredSigningDispatch {
  attemptId: string;
  leaseToken: string;
  accountId: string;
  address: string;
  action: TypedDataAction;
}
```

### StoredSigningResult

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredSigningResult {
  attemptId: string;
  state: 'admitted' | 'dispatching' | 'succeeded' | 'rejected' | 'unknown';
  signature: string | null;
}
```

### StoredTypedDataSigner

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredTypedDataSigner {
  readonly provider: string;
  signTypedData(dispatch: StoredSigningDispatch): Promise<string>;
}
```

### StoredWalletBackendConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/backend.ts).

```ts
export interface StoredWalletBackendConfiguration<
  SigningContext,
  AccountContext,
> {
  /** Explicit host opt-in; credentials never activate this backend. */
  enabled: boolean;
  network?: ProviderNetwork;
  provider: WalletSigningProvider;
  signingAuthority: StoredSigningAuthority<SigningContext>;
  accountAuthority: StoredAccountAuthority<AccountContext>;
}
```

## Built-in SQLite storage and financial authority

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
/** Preserve the deployed ERC-3009 allowance identity on the supported Base Sepolia profile. */
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
  caller: Pick<VerifiedPrincipal, 'issuer' | 'subject' | 'clientId'>;
  grantId: string;
  consentReference: string;
  policyRevision: string;
  account: EmbeddedAccount;
  action: TypedDataAction | RelayerExecutionAction;
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
    purpose: 'sign' | 'submit' | 'status',
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
  journal: import('../providers/openzeppelin-relayer.js').RelayerAttemptJournal;
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
  /** Synchronous inside the shared storage transaction; any admission retains possible signing exposure. */
  hasActionAttempts(id: string): boolean;
  revokeAction(id: string): Promise<void>;
  financialAuthority: (configuration: FinancialAuthorityOptions) => {
    authority: import('../core.js').EmbeddedWalletAuthority;
    executionAuthority: import('../domain/relayer-execution.js').RelayerExecutionAuthority;
    journal: import('../providers/openzeppelin-relayer.js').RelayerAttemptJournal;
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
- [ApprovedExecutionCoordinator](#approvedexecutioncoordinator)
- [ApprovedExecutionPlan](#approvedexecutionplan)
- [buildApprovedCallIntent](#buildapprovedcallintent)
- [BundledAuthorizationConfiguration](#bundledauthorizationconfiguration)
- [ChainObservation](#chainobservation)
- [CompiledOperationAdapter](#compiledoperationadapter)
- [compileOperationAdapter](#compileoperationadapter)
- [ConfigurationError](#configurationerror)
- [createConfiguredProvider](#createconfiguredprovider)
- [createExecutionService](#createexecutionservice)
- [createServiceIdentity](#createserviceidentity)
- [createTransferExecutionProvider](#createtransferexecutionprovider)
- [createWalletCallsProvider](#createwalletcallsprovider)
- [defaultReplacementPolicy](#defaultreplacementpolicy)
- [defaultSafeProvisioning](#defaultsafeprovisioning)
- [defaultSponsorGas](#defaultsponsorgas)
- [ExecutionAuthorityRequest](#executionauthorityrequest)
- [ExecutionCloudEvent](#executioncloudevent)
- [ExecutionConfiguration](#executionconfiguration)
- [ExecutionDispatch](#executiondispatch)
- [ExecutionDispatchContext](#executiondispatchcontext)
- [ExecutionObserver](#executionobserver)
- [ExecutionProfile](#executionprofile)
- [ExecutionProvider](#executionprovider)
- [ExecutionProviderAdapterV1](#executionprovideradapterv1)
- [ExecutionReceipt](#executionreceipt)
- [ExecutionRecovery](#executionrecovery)
- [ExecutionServiceConfiguration](#executionserviceconfiguration)
- [ExecutionSponsor](#executionsponsor)
- [ExecutorProviderConfiguration](#executorproviderconfiguration)
- [ExecutorReceipt](#executorreceipt)
- [loadExecutionServiceConfiguration](#loadexecutionserviceconfiguration)
- [loadProviderConfiguration](#loadproviderconfiguration)
- [NonceSnapshot](#noncesnapshot)
- [OperationAdapters](#operationadapters)
- [OperationAdapterTerms](#operationadapterterms)
- [OperationsConfiguration](#operationsconfiguration)
- [OperationsHealth](#operationshealth)
- [PayerEvent](#payerevent)
- [payerKey](#payerkey)
- [PinnedContract](#pinnedcontract)
- [PinnedReplacementPolicy](#pinnedreplacementpolicy)
- [ProviderConfiguration](#providerconfiguration)
- [ProviderInspection](#providerinspection)
- [QuorumExecutionObserver](#quorumexecutionobserver)
- [QuorumTransferObserver](#quorumtransferobserver)
- [RecoveryConfiguration](#recoveryconfiguration)
- [RecoveryDiagnosis](#recoverydiagnosis)
- [ReplacementAuthority](#replacementauthority)
- [ReplacementPolicy](#replacementpolicy)
- [ReplacementProposal](#replacementproposal)
- [ReplacementStatus](#replacementstatus)
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
- [SafeDeploymentDriver](#safedeploymentdriver)
- [SafeDeploymentPlan](#safedeploymentplan)
- [SafeExecutionQueue](#safeexecutionqueue)
- [SafeProvisioningConfiguration](#safeprovisioningconfiguration)
- [SafeProvisioningService](#safeprovisioningservice)
- [SafeQueueRecord](#safequeuerecord)
- [SecretReference](#secretreference)
- [ServiceIdentity](#serviceidentity)
- [ServicePeer](#servicepeer)
- [ServicePurpose](#servicepurpose)
- [ServiceSigningKey](#servicesigningkey)
- [ServiceVerificationKey](#serviceverificationkey)
- [signedServiceClient](#signedserviceclient)
- [TokenTransferAdapter](#tokentransferadapter)
- [TransactionEventInput](#transactioneventinput)
- [TransactionEventReport](#transactioneventreport)
- [TransferExecutionCoordinator](#transferexecutioncoordinator)
- [TransferExecutionPlan](#transferexecutionplan)
- [TransferInput](#transferinput)
- [TransferPolicy](#transferpolicy)
- [validateApprovedCallPolicy](#validateapprovedcallpolicy)
- [validateExecutionServiceConfiguration](#validateexecutionserviceconfiguration)
- [validateProviderConfiguration](#validateproviderconfiguration)
- [WalletBackendAdapterV1](#walletbackendadapterv1)
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

### ApprovedExecutionCoordinator

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/coordinator.ts).

```ts
/** One immutable execution per approved action; uncertain attempts are never dispatched again. */
export declare class ApprovedExecutionCoordinator {
  readonly actions: SupportedActions;
  readonly configurationHash: string;
  readonly profile: ExecutionConfiguration['profile'];
  constructor(
    actions: SupportedActions,
    database: ProviderDatabase,
    wallet: EmbeddedWalletService,
    configuration: ExecutionConfiguration,
    provider: ExecutionProvider,
    observer: ExecutionObserver,
    operations?: PayerOperations | undefined,
  );
  /** Bound every encoded wallet/executor envelope before accepting a standard batch. No signatures or attempts are issued. */
  assertWalletCallsSize(
    principal: VerifiedPrincipal,
    input: import('./approved-calls.js').ApprovedCallInput,
  ): Promise<void>;
  execute(input: AuthorityContext, id: string): Promise<ExecutionReceipt>;
  /** Authenticated executor callback: a service identity never replaces current wallet authority. */
  authorizeRemote(input: ExecutionAuthorityRequest): Promise<{
    provider_id: string;
    provider_revision: string;
    execution_id: string;
    action_id: string;
    plan_hash: string;
    request_hash: string;
    replacement?: import('./replacement.js').ReplacementAuthority;
    allowed: true;
  }>;
  read(principal: VerifiedPrincipal, id: string): Promise<ExecutionReceipt>;
  reconcile(context: AuthorityContext, id: string): Promise<ExecutionReceipt>;
  events(
    principal: VerifiedPrincipal,
    id: string,
    after?: string,
  ): Promise<{
    profile: import('./types.js').ExecutionProfile;
    profile_revision: string;
    action_id: string;
    events: import('./types.js').ExecutionCloudEvent[];
    oldest_sequence: number;
    next_sequence: number;
    history_truncated: boolean;
  }>;
  /** Trusted read-only observer entry point. It never signs, claims, submits or releases reservations. */
  refresh(id: string): Promise<void>;
  start(): void;
  close(): Promise<void>;
}
```

### ApprovedExecutionPlan

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
/** Immutable private plan. Requests may propose policy-controlled calls; execute uses only this stored envelope and server-selected sponsor. */
export interface ApprovedExecutionPlan {
  runtimePolicy?: import('../runtime-configuration/authority.js').RuntimePolicySnapshot;
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
  replacement?: import('./replacement.js').PinnedReplacementPolicy;
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

### ChainObservation

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
export interface ChainObservation {
  callsReceipt?: import('../wallet-calls/types.js').WalletCallsReceipt;
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

### createExecutionService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/service.ts).

```ts
/** Independent dispatcher. It has sponsor access, no owner signing or grant-management endpoint. */
export declare function createExecutionService(
  options?: ExecutionServiceOptions,
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

### createServiceIdentity

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/auth.ts).

```ts
/** Pinned ES256 service requests and responses. Application OAuth tokens are a different JWT type. */
export declare function createServiceIdentity(
  origin: string,
  signing: ServiceSigningKey,
  peers: ServicePeer[],
): Promise<{
  origin: string;
  sign: (
    peer: string,
    purpose: ServicePurpose,
    method: string,
    path: string,
    body: unknown,
    response?: {
      requestId: string;
      status: number;
    },
  ) => Promise<{
    proof: string;
    id: `${string}-${string}-${string}-${string}-${string}`;
  }>;
  verify: (
    authorization: string | undefined,
    purpose: ServicePurpose,
    method: string,
    path: string,
    body: unknown,
    response?: {
      peer: string;
      requestId: string;
      status: number;
    },
  ) => Promise<{
    origin: string;
    requestId: string;
  }>;
}>;
```

### createTransferExecutionProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/relayer.ts).

```ts
/** Dedicated sponsor queue. The token, zero native value and calldata come only from the stored plan. */
export declare function createTransferExecutionProvider(
  configuration: ExecutionConfiguration,
  apiKey: string,
  request?: typeof fetch,
): ExecutionProvider;
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
};
```

### defaultReplacementPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/defaults.ts).

```ts
export declare const defaultReplacementPolicy: Readonly<ReplacementPolicy>;
```

### defaultSafeProvisioning

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/defaults.ts).

```ts
/** Safe 1.4.1 canonical deployments from safe-deployments v1.37.40 and safe-contracts 1.4.1. Runtime code is checked through both RPCs before deployment. */
export declare function defaultSafeProvisioning(): SafeProvisioningConfiguration;
```

### defaultSponsorGas

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/defaults.ts).

```ts
/** Editable starting configuration for Base evaluation; deployment simulation and funding acceptance remain required. */
export declare const defaultSponsorGas: Readonly<{
  gasLimit: '500000';
  maxFeePerGas: '3000000000';
  maxPriorityFeePerGas: '1000000000';
  l1FeeReserveWei: '1000000000000';
  lifetimeBudgetWei: '10000000000000000';
}>;
```

### ExecutionAuthorityRequest

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/protocol.ts).

```ts
export interface ExecutionAuthorityRequest {
  provider_id: string;
  provider_revision: string;
  execution_id: string;
  action_id: string;
  plan_hash: string;
  request_hash: string;
  replacement?: import('../execution/replacement.js').ReplacementAuthority;
}
```

### ExecutionCloudEvent

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
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
```

### ExecutionConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
/** Optional versioned approved-action execution. Secrets and RPC addresses remain server configuration. */
export interface ExecutionConfiguration {
  network?: ProviderNetwork;
  profile: ExecutionProfile;
  local?: true;
  relayer?: {
    url: string;
    apiKey: SecretReference;
  };
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
  sponsorPool?: {
    strategy: 'round-robin';
    maxInFlightPerSponsor: number;
  };
  safeQueue?: {
    maxDepthPerSafe: number;
    maxWaitSeconds: number;
  };
  recovery?: import('./recovery.js').RecoveryConfiguration;
  replacement?: import('./replacement.js').ReplacementPolicy;
  pollIntervalSeconds: number;
  maxLogRange: number;
}
```

### ExecutionDispatch

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/protocol.ts).

```ts
export interface ExecutionDispatch {
  contract: 'execution-dispatch-v1';
  execution_id: string;
  provider_id: string;
  provider_revision: string;
  wallet_attempt: WalletAttemptRequest;
  plan: TransferExecutionPlan;
}
```

### ExecutionDispatchContext

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
export interface ExecutionDispatchContext {
  executionId: string;
  request: WalletAttemptRequest;
  authorizeEffect?: () => Promise<void>;
}
```

### ExecutionObserver

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
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
  ): Promise<
    ChainObservation & {
      scanNextBlock?: string;
    }
  >;
}
```

### ExecutionProfile

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
export type ExecutionProfile =
  | typeof executionProfile
  | typeof designatedExecutionProfile
  | 'approved-evm-executor-v1';
```

### ExecutionProvider

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
export interface ExecutionProvider {
  supportsReplacement?(): Promise<boolean>;
  replace?(
    plan: TransferExecutionPlan,
    transactionId: string,
    proposal: import('./replacement.js').ReplacementProposal,
    authorizeEffect: () => Promise<void>,
  ): Promise<string>;
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
```

### ExecutionProviderAdapterV1

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/providers.ts).

```ts
/** Trusted server-side adapter. submit must invoke context.authorizeEffect immediately before effects. */
export interface ExecutionProviderAdapterV1 {
  adapterVersion: 1;
  createExecutionProvider(context: {
    options: Record<string, unknown>;
    secret(name: string): string;
  }): Promise<ExecutionProvider> | ExecutionProvider;
}
```

### ExecutionReceipt

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
export interface ExecutionReceipt extends Omit<
  ChainObservation,
  'callsReceipt'
> {
  replacement?: import('./replacement.js').ReplacementStatus;
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
```

### ExecutionRecovery

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
export interface ExecutionRecovery {
  accepted: boolean;
  transactionId?: string;
  transactionHash?: string;
}
```

### ExecutionServiceConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/config.ts).

```ts
export interface ExecutionServiceConfiguration {
  configVersion: 1;
  profile: 'execution-service-v1';
  origin: string;
  binding: string;
  storage: {
    kind: 'sqlite';
    directory: string;
  };
  signing: ServiceSigningKey;
  callers: (ServicePeer & {
    providers: string[];
  })[];
  providers: ExecutorProviderConfiguration[];
  operations?: import('../execution/operations.js').OperationsConfiguration;
  activation: {
    enabled: boolean;
    providerAcceptance?: string;
    recoveryAcceptance?: string;
    authenticationAcceptance?: string;
  };
  http?: ProviderConfiguration['http'];
}
```

### ExecutionSponsor

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
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
```

### ExecutorProviderConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/config.ts).

```ts
export interface ExecutorProviderConfiguration {
  network?: ProviderNetwork;
  id: string;
  revision: string;
  kind: 'openzeppelin-relayer' | 'custom';
  relayer?: {
    url: string;
    apiKey: SecretReference;
  };
  module?: string;
  options?: Record<string, unknown>;
  rpc: ExecutionConfiguration['rpc'];
  token?: TransferPolicy['token'];
  contractCalls?: ApprovedCallPolicy;
  runtimeContracts?: boolean;
  sponsors: ExecutionSponsor[];
  sponsorPool?: ExecutionConfiguration['sponsorPool'];
  recovery?: ExecutionConfiguration['recovery'];
  replacement?: ExecutionConfiguration['replacement'];
}
```

### ExecutorReceipt

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/protocol.ts).

```ts
export interface ExecutorReceipt {
  replacement?: import('../execution/replacement.js').ReplacementStatus;
  provider_inspection?: import('../execution/recovery.js').ProviderInspection;
  recovery?: import('../execution/recovery.js').RecoveryDiagnosis;
  contract: 'execution-dispatch-v1';
  execution_id: string;
  plan_hash: string;
  dispatch_status:
    'not_started' | 'pending' | 'accepted' | 'unknown' | 'failed';
  transaction_hash?: string;
}
```

### loadExecutionServiceConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/config.ts).

```ts
export declare function loadExecutionServiceConfiguration(
  path: string,
): Promise<{
  config: ExecutionServiceConfiguration;
  directory: string;
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

### NonceSnapshot

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/recovery.ts).

```ts
export interface NonceSnapshot {
  confirmedNonce: string;
  finalizedNonce: string;
  pendingNonceMinimum: string;
  pendingNonceMaximum: string;
  balanceWei: string;
  baseFeePerGas: string;
  transactionNonce?: string;
  transactionHash?: string;
  transactionMaxFeePerGas?: string;
  transactionMaxPriorityFeePerGas?: string;
  transactionPending?: boolean;
  safeNonce?: string;
}
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

### OperationsConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operations.ts).

```ts
export interface OperationsConfiguration {
  pollIntervalSeconds: number;
  lowBalanceWei: string;
  webhooks: {
    id: string;
    endpoint: SecretReference;
    signingSecrets: SecretReference[];
  }[];
}
```

### OperationsHealth

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operations.ts).

```ts
export interface OperationsHealth {
  status: 'healthy' | 'degraded' | 'disabled';
  payers: number;
  affected_payers: number;
  low_balance_payers: number;
  unavailable_payers: number;
  stale_payers: number;
  webhook_pending: number;
  webhook_failed: number;
  webhook_unroutable: number;
  oldest_delivery_age_ms: number;
  last_webhook_delivery_at?: string;
  replacement_pending: number;
  replacement_unknown: number;
  replacement_blocked: number;
  replacement_exhausted: number;
}
```

### PayerEvent

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operations.ts).

```ts
export interface PayerEvent {
  specversion: '1.0';
  id: string;
  source: string;
  type: 'com.moovha.wallet-provider.payer.observed.v1';
  subject: string;
  time: string;
  datacontenttype: 'application/json';
  data: {
    balance: PayerCondition['balance'];
    affected: boolean;
    reason: string;
    balance_wei?: string;
    threshold_wei: string;
    replacement?: PayerCondition['replacement'];
  };
}
```

### payerKey

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/operations.ts).

```ts
export declare const payerKey: (address: string) => string;
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

### PinnedReplacementPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/replacement.ts).

```ts
export type PinnedReplacementPolicy = {
  [Key in keyof ReplacementPolicy]: string;
};
```

### ProviderConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/config.ts).

```ts
export interface ProviderConfiguration {
  network?: ProviderNetwork;
  safeProvisioning?: import('../provisioning/safe.js').SafeProvisioningConfiguration;
  runtimeConfiguration?: RuntimeConfigurationOptions;
  localExecution?: LocalExecutionConfiguration;
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
  backend:
    | {
        kind: 'cdp';
        binding: string;
        apiKeyId: SecretReference;
        apiKeySecret: SecretReference;
        walletSecret: SecretReference;
      }
    | {
        kind: 'ows';
        binding: string;
        vaultDirectory: string;
        passphrase: SecretReference;
      }
    | {
        kind: 'openzeppelin-relayer';
        binding: string;
        url: string;
        apiKey: SecretReference;
        signers: RelayerBinding[];
      }
    | {
        kind: 'custom';
        binding: string;
        module: string;
        options?: Record<string, unknown>;
      };
  storage: {
    kind: 'sqlite';
    directory: string;
  };
  activation: {
    enabled: boolean;
    backendAcceptance?: string;
    recoveryAcceptance?: string;
    tokenAcceptance?: string;
    executionAcceptance?: string;
    safeProvisioningAcceptance?: string;
  };
  financial?: TransferPolicy;
  approvedCalls?: import('../execution/approved-calls.js').ApprovedCallsConfiguration;
  execution?: ExecutionConfiguration;
  operations?: import('../execution/operations.js').OperationsConfiguration;
  http?: {
    host?: '127.0.0.1' | '0.0.0.0' | '::1' | '::';
    port?: number;
    documentation?: boolean;
    ingress?: 'caddy' | 'existing';
  };
}
```

### ProviderInspection

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/recovery.ts).

```ts
export interface ProviderInspection {
  status: string;
  nonce?: string;
  transactionHash?: string;
  replacement?: ReplacementStatus;
}
```

### QuorumExecutionObserver

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/chain.ts).

```ts
/** Agreement of configured RPC providers is trusted node evidence, not a light-client proof. */
export declare class QuorumExecutionObserver implements ExecutionObserver {
  constructor(
    endpoints: string[],
    genesisHash: string,
    maxLogRange: number,
    request?: typeof fetch,
    network?: ProviderNetwork | undefined,
  );
  anchor(): Promise<string>;
  preflight(plan: TransferExecutionPlan): Promise<void>;
  /** Read-only verified account binding and common nonce before constructing an approved action. */
  contractNonce(binding: SafeAccountBinding, owner: string): Promise<string>;
  /** Native balance at a common canonical block, with chain identity and block-hash agreement. */
  payerBalance(sponsor: string): Promise<string>;
  /** Read-only nonce diagnostics at common canonical block heights; pending counts are explicitly local hints. */
  nonceSnapshot(
    plan: TransferExecutionPlan,
    ownHash?: string,
  ): Promise<NonceSnapshot>;
  observe(
    plan: TransferExecutionPlan,
    candidates: string[],
    ownHash?: string,
    scanFromBlock?: string,
  ): Promise<
    ChainObservation & {
      scanNextBlock?: string;
    }
  >;
}
```

### QuorumTransferObserver

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/chain.ts).

```ts
/** Agreement of configured RPC providers is trusted node evidence, not a light-client proof. */
export declare class QuorumExecutionObserver implements ExecutionObserver {
  constructor(
    endpoints: string[],
    genesisHash: string,
    maxLogRange: number,
    request?: typeof fetch,
    network?: ProviderNetwork | undefined,
  );
  anchor(): Promise<string>;
  preflight(plan: TransferExecutionPlan): Promise<void>;
  /** Read-only verified account binding and common nonce before constructing an approved action. */
  contractNonce(binding: SafeAccountBinding, owner: string): Promise<string>;
  /** Native balance at a common canonical block, with chain identity and block-hash agreement. */
  payerBalance(sponsor: string): Promise<string>;
  /** Read-only nonce diagnostics at common canonical block heights; pending counts are explicitly local hints. */
  nonceSnapshot(
    plan: TransferExecutionPlan,
    ownHash?: string,
  ): Promise<NonceSnapshot>;
  observe(
    plan: TransferExecutionPlan,
    candidates: string[],
    ownHash?: string,
    scanFromBlock?: string,
  ): Promise<
    ChainObservation & {
      scanNextBlock?: string;
    }
  >;
}
```

### RecoveryConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/recovery.ts).

```ts
export interface RecoveryConfiguration {
  stuckAfterSeconds: number;
  quarantineOnStuck: boolean;
}
```

### RecoveryDiagnosis

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/recovery.ts).

```ts
export interface RecoveryDiagnosis {
  state:
    | 'observing'
    | 'suspected-stuck'
    | 'awaiting-finality'
    | 'finalized'
    | 'unavailable'
    | 'blocked';
  reason:
    | 'within-threshold'
    | 'pending-too-long'
    | 'nonce-gap-suspected'
    | 'nonce-consumed-without-result'
    | 'safe-nonce-advanced'
    | 'insufficient-sponsor-funds'
    | 'fee-cap-below-base-fee'
    | 'transaction-not-visible'
    | 'provider-nonce-conflict'
    | 'evidence-unavailable'
    | 'awaiting-finality'
    | 'verified-finality';
  observed_at: string;
  pending_age_ms: number;
  quarantined: boolean;
  sponsor_nonce?: string;
  confirmed_nonce?: string;
  finalized_nonce?: string;
  safe_nonce?: string;
  next_action:
    | 'wait'
    | 'restore-evidence'
    | 'fund-sponsor'
    | 'review-provider-fees'
    | 'review-provider-nonces'
    | 'reconcile'
    | 'operator-review';
}
```

### ReplacementAuthority

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/replacement.ts).

```ts
export interface ReplacementAuthority {
  proposal: ReplacementProposal;
  phase: 'prepare' | 'dispatch';
}
```

### ReplacementPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/replacement.ts).

```ts
export interface ReplacementPolicy {
  initialFeeBasisPoints: number;
  bumpBasisPoints: number;
  maxAttempts: number;
  intervalSeconds: number;
}
```

### ReplacementProposal

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/replacement.ts).

```ts
export interface ReplacementProposal {
  id: string;
  sequence: number;
  nonce: string;
  previousTransactionHash: string;
  previousMaxFeePerGas: string;
  previousMaxPriorityFeePerGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}
```

### ReplacementStatus

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/replacement.ts).

```ts
export interface ReplacementStatus {
  state: ReplacementAttempt['state'] | 'exhausted' | 'blocked' | 'settled';
  attempts: number;
  reason?:
    | 'fee-cap'
    | 'attempt-limit'
    | 'authority-or-preparation-denied'
    | 'evidence-unavailable';
  last_attempt_at?: string;
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
  authorizeContracts?: boolean;
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
  constructor(
    onboardingPolicy: ResolvedPolicy,
    store: OnboardingStore,
    options: RuntimeConfigurationOptions,
    deploymentRevision: string,
    transportRevision?: string | undefined,
    network?: ProviderNetwork | undefined,
  );
  assertOperator(principal: VerifiedPrincipal): void;
  assertOperatorState(principal: VerifiedPrincipal, state: ProviderState): void;
  propose(
    context: AuthorityContext,
    input: RuntimePolicyChange,
  ): Promise<RuntimePolicyProposal>;
  workspace(
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

### SafeDeploymentDriver

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/safe.ts).

```ts
/** Trusted narrow deployment driver. Submit must recheck authorizeEffect immediately before a provider mutation. */
export interface SafeDeploymentDriver {
  prepare(plan: SafeDeploymentPlan): Promise<void>;
  submit(
    plan: SafeDeploymentPlan,
    authorizeEffect: () => Promise<void>,
  ): Promise<string>;
}
```

### SafeDeploymentPlan

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/safe.ts).

```ts
export interface SafeDeploymentPlan {
  accountId: string;
  owner: string;
  address: string;
  saltNonce: string;
  data: string;
  chainId: string;
  factory: PinnedContract;
  singleton: PinnedContract;
  proxyCodeHash: string;
  sponsor: ExecutionSponsor;
  expiresAt: string;
}
```

### SafeExecutionQueue

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/queue.ts).

```ts
/** Durable FIFO of unsigned requests. Only its head can become an immutable nonce-bound action. */
export declare class SafeExecutionQueue {
  constructor(
    actions: SupportedActions,
    database: ProviderDatabase,
    execution: Pick<ApprovedExecutionCoordinator, 'refresh' | 'execute'>,
    nonce: (binding: SafeAccountBinding, owner: string) => Promise<string>,
    configuration: NonNullable<ExecutionConfiguration['safeQueue']>,
    pollIntervalSeconds: number,
  );
  enqueue(
    context: AuthorityContext,
    input: ApprovedCallInput,
    walletCalls?: WalletCallsMetadata,
  ): Promise<{
    next_poll_after_ms: number;
    action_id?: string | undefined;
    request_id: string;
    account_id: string;
    status:
      | 'cancelled'
      | 'expired'
      | 'blocked'
      | 'succeeded'
      | 'queued'
      | 'executing';
    expires_at: string;
  }>;
  /** Read batch evidence without renewing financial consent or permitting a new effect. */
  walletCallsRecord(
    principal: VerifiedPrincipal,
    accountId: string,
    id: string,
  ): Promise<{
    execution: import('./types.js').TransferExecutionRecord | undefined;
    walletCalls?: WalletCallsMetadata;
    id: string;
    input: ApprovedCallInput;
    principal: VerifiedPrincipal;
    grantId: string;
    owner: string;
    consentReference: string;
    safeAddress: string;
    address: string;
    revision: string;
    expiresAt: string;
    sequence: number;
    actionKey: string;
    executeKey: string;
    identityHash: string;
    actionId?: string;
    status:
      | 'queued'
      | 'executing'
      | 'succeeded'
      | 'cancelled'
      | 'expired'
      | 'blocked';
  }>;
  walletCallsList(
    principal: VerifiedPrincipal,
    authorizeOperator?: (state: ProviderState) => void,
  ): Promise<{
    records: {
      execution: import('./types.js').TransferExecutionRecord | undefined;
      walletCalls?: WalletCallsMetadata;
      id: string;
      input: ApprovedCallInput;
      principal: VerifiedPrincipal;
      grantId: string;
      owner: string;
      consentReference: string;
      safeAddress: string;
      address: string;
      revision: string;
      expiresAt: string;
      sequence: number;
      actionKey: string;
      executeKey: string;
      identityHash: string;
      actionId?: string;
      status:
        | 'queued'
        | 'executing'
        | 'succeeded'
        | 'cancelled'
        | 'expired'
        | 'blocked';
    }[];
    truncated: boolean;
  }>;
  read(
    principal: VerifiedPrincipal,
    id: string,
  ): Promise<{
    next_poll_after_ms: number;
    action_id?: string | undefined;
    request_id: string;
    account_id: string;
    status:
      | 'cancelled'
      | 'expired'
      | 'blocked'
      | 'succeeded'
      | 'queued'
      | 'executing';
    expires_at: string;
  }>;
  cancel(
    context: AuthorityContext,
    id: string,
  ): Promise<{
    next_poll_after_ms: number;
    action_id?: string | undefined;
    request_id: string;
    account_id: string;
    status:
      | 'cancelled'
      | 'expired'
      | 'blocked'
      | 'succeeded'
      | 'queued'
      | 'executing';
    expires_at: string;
  }>;
  /** Process a bounded set of independent Safe heads; duplicates join the same signing and dispatch attempts. */
  process(): Promise<void>;
  start(): void;
  close(): Promise<void>;
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

### SafeProvisioningService

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/provisioning/safe.ts).

```ts
/** Fixed Safe factory initialization; no caller-selected owner, modules, delegatecall, payment or native value. */
export declare class SafeProvisioningService {
  constructor(
    onboarding: OnboardingService,
    database: ProviderDatabase,
    config: SafeProvisioningConfiguration,
    execution: ExecutionConfiguration,
    revision: string,
    driver: SafeDeploymentDriver,
    endpoints: string[],
    network?: ProviderNetwork,
    request?: typeof fetch,
  );
  read(
    context: AuthorityContext,
    id: string,
  ): Promise<{
    profile: 'safe-1.4.1';
    chain_id: import('../networks.js').ProviderChainId;
    address: string;
    status: 'pending' | 'unknown' | 'ready' | 'prepared';
  }>;
  provision(
    input: AuthorityContext,
    id: string,
  ): Promise<{
    profile: 'safe-1.4.1';
    chain_id: import('../networks.js').ProviderChainId;
    address: string;
    status: 'pending' | 'unknown' | 'ready' | 'prepared';
  }>;
}
```

### SafeQueueRecord

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/queue.ts).

```ts
export interface SafeQueueRecord {
  walletCalls?: WalletCallsMetadata;
  id: string;
  input: ApprovedCallInput;
  principal: VerifiedPrincipal;
  grantId: string;
  owner: string;
  consentReference: string;
  safeAddress: string;
  address: string;
  revision: string;
  expiresAt: string;
  sequence: number;
  actionKey: string;
  executeKey: string;
  identityHash: string;
  actionId?: string;
  status:
    'queued' | 'executing' | 'succeeded' | 'cancelled' | 'expired' | 'blocked';
}
```

### SecretReference

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/config.ts).

```ts
export interface SecretReference {
  env: string;
}
```

### ServiceIdentity

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/auth.ts).

```ts
export type ServiceIdentity = Awaited<ReturnType<typeof createServiceIdentity>>;
```

### ServicePeer

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/auth.ts).

```ts
export interface ServicePeer {
  origin: string;
  keys: ServiceVerificationKey[];
}
```

### ServicePurpose

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/auth.ts).

```ts
export type ServicePurpose =
  'dispatch' | 'status' | 'capabilities' | 'authority';
```

### ServiceSigningKey

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/auth.ts).

```ts
export interface ServiceSigningKey {
  id: string;
  privateKey: SecretReference;
}
```

### ServiceVerificationKey

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/auth.ts).

```ts
export interface ServiceVerificationKey {
  id: string;
  publicKey: SecretReference;
}
```

### signedServiceClient

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/auth.ts).

```ts
/** Fixed-origin HTTPS transport; responses are bound to the request proof and status. No mutation retries. */
export declare function signedServiceClient(
  identity: ServiceIdentity,
  peer: string,
  request?: typeof fetch,
): (
  purpose: ServicePurpose,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) => Promise<unknown>;
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

### TransactionEventInput

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/actions.ts).

```ts
export interface TransactionEventInput {
  event: 'submitted' | 'confirmed' | 'failed';
  chain_id: ProviderChainId;
  transaction_hash: string;
  observed_at: string;
}
```

### TransactionEventReport

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/actions.ts).

```ts
export interface TransactionEventReport extends TransactionEventInput {
  report_id: string;
  recorded_at: string;
  verification: 'unverified';
}
```

### TransferExecutionCoordinator

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/coordinator.ts).

```ts
/** One immutable execution per approved action; uncertain attempts are never dispatched again. */
export declare class ApprovedExecutionCoordinator {
  readonly actions: SupportedActions;
  readonly configurationHash: string;
  readonly profile: ExecutionConfiguration['profile'];
  constructor(
    actions: SupportedActions,
    database: ProviderDatabase,
    wallet: EmbeddedWalletService,
    configuration: ExecutionConfiguration,
    provider: ExecutionProvider,
    observer: ExecutionObserver,
    operations?: PayerOperations | undefined,
  );
  /** Bound every encoded wallet/executor envelope before accepting a standard batch. No signatures or attempts are issued. */
  assertWalletCallsSize(
    principal: VerifiedPrincipal,
    input: import('./approved-calls.js').ApprovedCallInput,
  ): Promise<void>;
  execute(input: AuthorityContext, id: string): Promise<ExecutionReceipt>;
  /** Authenticated executor callback: a service identity never replaces current wallet authority. */
  authorizeRemote(input: ExecutionAuthorityRequest): Promise<{
    provider_id: string;
    provider_revision: string;
    execution_id: string;
    action_id: string;
    plan_hash: string;
    request_hash: string;
    replacement?: import('./replacement.js').ReplacementAuthority;
    allowed: true;
  }>;
  read(principal: VerifiedPrincipal, id: string): Promise<ExecutionReceipt>;
  reconcile(context: AuthorityContext, id: string): Promise<ExecutionReceipt>;
  events(
    principal: VerifiedPrincipal,
    id: string,
    after?: string,
  ): Promise<{
    profile: import('./types.js').ExecutionProfile;
    profile_revision: string;
    action_id: string;
    events: import('./types.js').ExecutionCloudEvent[];
    oldest_sequence: number;
    next_sequence: number;
    history_truncated: boolean;
  }>;
  /** Trusted read-only observer entry point. It never signs, claims, submits or releases reservations. */
  refresh(id: string): Promise<void>;
  start(): void;
  close(): Promise<void>;
}
```

### TransferExecutionPlan

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/execution/types.ts).

```ts
/** Common immutable execution envelope; transfer plans remain source compatible. */
export type TransferExecutionPlan = ApprovedExecutionPlan;
```

### TransferInput

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/actions.ts).

```ts
export interface TransferInput {
  account_id: string;
  recipient: string;
  amount: string;
}
```

### TransferPolicy

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/actions.ts).

```ts
export interface TransferPolicy {
  profile: 'provider-authorized-erc3009-v1';
  token: {
    address: string;
    name: string;
    version: string;
    symbol: string;
    decimals: number;
  };
  recipients: string[];
  maximumAmount: string;
  /** Lifetime authorized atomic units per account/token; unknown effects retain usage. */
  lifetimeAmount: string;
  maxValiditySeconds: number;
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

### validateExecutionServiceConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/executor/config.ts).

```ts
export declare function validateExecutionServiceConfiguration(
  input: unknown,
): ExecutionServiceConfiguration;
```

### validateProviderConfiguration

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/config.ts).

```ts
/** Offline and side-effect free. Diagnostics never include configuration values or credentials. */
export declare function validateProviderConfiguration(
  input: unknown,
): ProviderConfiguration;
```

### WalletBackendAdapterV1

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/deployment/backends.ts).

```ts
/** Trusted deployment extension. The returned raw backend receives toolkit-owned policy/journals. */
export interface WalletBackendAdapterV1 {
  adapterVersion: 1;
  createWalletBackend(context: {
    options: Record<string, unknown>;
    secret(name: string): string;
  }): Promise<WalletSigningProvider> | WalletSigningProvider;
}
```

### WalletCallsClientOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/client.ts).

```ts
/** Host-authorized transport. Never place an OAuth client secret in a browser. */
export interface WalletCallsClientOptions {
  network?: ProviderNetwork;
  url: string;
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
  constructor(actions: SupportedActions, driver: WalletCallsDriver);
  constructor(
    actions: SupportedActions,
    queue: SafeExecutionQueue,
    execution: ApprovedExecutionCoordinator,
    driver?: WalletCallsDriver,
  );
  list(
    principal: VerifiedPrincipal,
    authorizeOperator?: (state: ProviderState) => void,
  ): Promise<{
    truncated: boolean;
    batches: import('./types.js').WalletCallsBatchSummary[];
  }>;
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
};
```

### WalletCallsClientOptions

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/wallet-calls/client.ts).

```ts
/** Host-authorized transport. Never place an OAuth client secret in a browser. */
export interface WalletCallsClientOptions {
  network?: ProviderNetwork;
  url: string;
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
- [createPaymasterClientV07](#createpaymasterclientv07)
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
  rpcUrls: [string, string];
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
  /** Uses the common stored operation/action and idempotency identity used by the relayer. */
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
  authorizeSubmission(context: AuthorityContext, id: string): Promise<void>;
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
/** Independent chain reads at a common block. No module installation or relaxation of the SafeTx verifier. */
export declare class Safe4337Verifier {
  constructor(config: Safe4337Acceptance, request?: typeof fetch);
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
/** Encode the same ordered CALL-only intent used by the relayer's SafeTx path. */
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
  chainId: '0x14a34' | '0x2105';
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
  state: 'pending' | 'included' | 'safe' | 'finalized' | 'reorged';
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
}
```

### UserOperationWalletCallsDriver

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/wallet-calls.ts).

```ts
/** Durable, explicitly selected ERC-4337 batch lane. It never delegates an uncertain batch to a relayer. */
export declare class UserOperationWalletCallsDriver implements WalletCallsDriver {
  constructor(
    actions: SupportedActions,
    database: ProviderDatabase,
    execution: UserOperationExecutionCoordinator,
    configuration: UserOperationWalletCallsConfiguration,
  );
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
  ): Promise<WalletCallsStatus>;
  list(
    principal: VerifiedPrincipal,
    authorizeOperator?: (state: ProviderState) => void,
  ): Promise<{
    truncated: boolean;
    batches: WalletCallsBatchSummary[];
  }>;
  runOnce(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
}
```

### WalletCallsDriver

[Source declaration](https://github.com/Moovha/wallet-provider-kit/blob/main/src/sponsorship/execution-types.ts).

```ts
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
  ): Promise<{
    truncated: boolean;
    batches: WalletCallsBatchSummary[];
  }>;
}
```
