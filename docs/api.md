# API guide

Use this guide to choose the public API and understand the responsibilities you
must supply. Then follow the [end-to-end provider tutorial](integration-example.md).
For exact declarations, use the [generated TypeScript reference](api-reference.md);
for requests and responses, use the [HTTP guide](http-api.md) and
[generated HTTP schemas](http-reference.md).

The kit is a wallet/provider implementation that an adopter can host or embed.
It supports controlled wallet access for applications including Moovha. Key
control, recovery, business authorization and transaction execution are distinct
choices. Read [the Moovha scope boundary](moovha-scope.md) before treating this
provider's HTTP routes as Moovha's orchestration API.

## Choose a profile

| Your application already has…                                                | Compose                                                                            | You still supply                                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Current owner/consent/KYC records and approved financial actions             | `EmbeddedWalletService`, a journaled signing backend and optionally `createServer` | Durable authority, attempts, current dispatch/replay authorization and recovery                                      |
| A wallet backend but needs provider-hosted onboarding and application access | `createOnboardingProvider`                                                         | Existing OIDC login, approved clients, identity vendors/reviewers, private persistent storage and backend acceptance |
| Existing login and a custom identity-acceptance workflow                     | `EnrollmentService` plus the wallet service                                        | Durable enrollment/identity authority and current financial authority                                                |
| A configured OpenZeppelin Relayer and approved stored calls                  | The separate `RelayerExecutionService` profile                                     | Execution authority, durable attempt/status journal and accepted signer/network/budget bindings                      |

Choose onboarding **or** lower-level enrollment per server. The toolkit rejects
combining them. Onboarding manages access and account provisioning; its bundled
journal denies signing. Relayer execution is library-only. The default executable
configures none of these financial profiles.

## Core wallet service

Import from `@moovha/wallet-provider-kit/core`.

```ts
const provider = createJournaledWalletProvider(backend, {
  namespace: 'your-provider-test',
  journal,
  authorizeAttempt,
});
const service = new EmbeddedWalletService(authority, provider);
```

This is a composition excerpt; the [tutorial](integration-example.md) supplies a
complete runnable offline host. Your production application implements `authority`,
`journal` and `authorizeAttempt`, and selects an accepted `backend`.

| API                                               | Input                                                   | Resolves to              | Behavior                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `service.provision(context, accountId)`           | Verified caller context and reserved account UUIDv4     | `{ accountId, address }` | Loads current host authority; verifies owner/status/account; calls provider with the host's stable attempt ID           |
| `service.sign(context, actionId)`                 | Verified context and stored action UUIDv4               | Signature hex string     | Loads the host's exact action/account/revisions; checks current owner/status/action binding; signs through the provider |
| `provider.findAccount(accountId)`                 | Reserved account UUIDv4                                 | Account or `null`        | Read-only backend lookup for recovery; does not create a replacement account                                            |
| `createJournaledWalletProvider(backend, options)` | Signing backend and journal/current-authority callbacks | `WalletSigningProvider`  | Validates fingerprints/results, claims dispatch, stores terminal outcomes and replays only with current authorization   |

`context` contains a `VerifiedPrincipal` and an `idempotencyKey`. A principal is
constructed by trusted authentication middleware and contains issuer, subject,
client ID and scopes. An OAuth service-account subject need not be the wallet
owner: your authority resolves its current client-bound grant to the actual owner.

Your `EmbeddedWalletAuthority` implements two methods:

- `provision(context, accountId)` returns the resolved owner record or `null`.
  The record has `sessionSubject`, `ownerSubject`, `currentUserStatus`, `accountId`
  and `attemptId` (the declaration's internal `OwnerAuthority` shape).
- `sign(context, actionId)` returns `SigningAuthority` or `null`. It adds the
  stored account, canonical chain-account ID, binding/capability revisions and
  exact `TypedDataAction`. It must also validate the immutable committed plan,
  current consent, dependencies, budget and required proof/lease.

Return `null` for a definite policy denial. Throw if storage or policy state is
uncertain; never manufacture an approval to keep the service available. The core
requires `sessionSubject === ownerSubject` and current status exactly
`ID VERIFIED`, but those checks do not implement your whole authority policy.
They cannot authenticate fabricated host records.

The optional `enrollmentGuard` and `accessGuard` service arguments are hooks used
by HTTP/profile composition. They supplement host authority. They don't replace
dispatch-time or result-replay checks in `authorizeAttempt`.

### Backend and journal contracts

`WalletSigningProvider` supplies `provider`, `createAccount`, `findAccount` and
`signTypedData`. Backends receive approved host records, not arbitrary HTTP signing
payloads. No key-export or generic signing method exists.

The journal must atomically bind namespace/provider/attempt/resource/fingerprint,
serialize dispatch, reserve bounded usage and fence completion. `claim` returns
`dispatch`, `pending`, `unknown`, `conflict`, `succeeded` or `failed`.
`complete`/`fail` persist the terminal result and the host's audit/outbox event.
Lease expiry after dispatch is an unknown outcome, never a fresh dispatch grant.
See [durable attempts](durable-attempts.md) for the full contract.

`authorizeAttempt(request)` is called before a journal claim, again before
provider dispatch, and when replaying a stored success. Resolve the admitted
attempt to current owner/grant/KYC/consent/proof and immutable request. A journal
row or OAuth scope alone cannot return `true`. Keep the same provider attempt
identity across retries and process restarts.

## HTTP and authentication

Import from `@moovha/wallet-provider-kit/http`.

```ts
const authenticate = createAuthenticator({ issuer, audience, jwksUrl });
const app = await createServer({
  authenticate,
  service,
  ready: async () => authorityAndRecoveryAreAvailable(),
});
await app.listen({ host: '127.0.0.1', port: 8080 });
```

`issuer` and `jwksUrl` must be trusted HTTPS configuration without credentials,
query or fragment; the audience must be nonempty. The resource server validates
RS256/ES256 `at+jwt` access tokens with mandatory issuer, subject, audience, expiry,
issued-at, token ID and client ID. Token lifetime is at most ten minutes. ID tokens
aren't API access tokens. A second `keys` argument accepts a trusted jose key
resolver for testing or host-managed resolution; never select it from token input.

`createServer(options)` resolves to a ready Fastify application. It doesn't
listen until you call `listen`. `app.close()` releases HTTP resources; the host
owns telemetry shutdown. `app.inject()` exercises the actual middleware/routes
in-process, which the tutorial uses without opening a port.

`ServerOptions` accepts `authenticate`, `service`, optional `onboarding` or
`enrollment`, `ready`, and `documentation`. `documentation: false` disables
Swagger UI; `/openapi.json` still exposes the contract. Readiness requires both
service and authentication and a successful host `ready()` check. Without them,
protected work is unavailable. Do not report financial readiness based only on
credentials, liveness or fixture tests.

## Onboarding, identity and telemetry

| Entry point                             | Starting API                                                                                 | Detailed guide                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/onboarding`                           | `createOnboardingProvider(config)` resolves to Fastify, using one typed configuration        | [Onboarding](onboarding.md), [configuration example](provider.config.example.ts)                            |
| `/identity`                             | `EnrollmentService(identityVerifier, authority)` and `createIdentityVerifier(config)`        | [Enrollment and acceptance](enrollment.md)                                                                  |
| `/telemetry`                            | `startTelemetry(endpoint?, allowInsecureDevelopment?)` returns a lifecycle with `shutdown()` | [Operations](operations.md)                                                                                 |
| `/cdp`, `/ows`, `/openzeppelin-relayer` | Explicit backend factories with different key-control/recovery contracts                     | [CDP](provider-guide.md#current-adapter-profile), [OWS](ows-adapter.md), [Relayer](openzeppelin-relayer.md) |

The generated reference lists every public interface, factory and public class
method for these paths. Identity acceptance is separate from a financial action
approval. Telemetry is separate from the durable financial journal.

## Errors and retry decisions

Library methods reject with `WalletProviderError` for known boundary failures.
Its `code` and `outcome` are safe fields; raw provider exceptions are sanitized.
Unexpected host exceptions can still reject library calls; HTTP converts them to
a generic 500. Avoid logging raw exceptions, identifiers, signatures or tokens.

| Outcome          | Meaning                                              | Required response                                                                                             |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `not_dispatched` | This layer reports no provider effect was dispatched | Correct the cause through host policy/journal handling; this is not blanket permission to start a new attempt |
| `rejected`       | Provider explicitly rejected the effect              | Preserve rejection and attempt identity; don't automatically fund or retry                                    |
| `unknown`        | The effect or its recording may have happened        | Stop mutation retries and reconcile the original attempt read-only                                            |

A successful signature is an authorization artifact, not settlement or a revoked
artifact when a grant is later revoked. The [HTTP guide](http-api.md) maps status
codes and explains how clients should respond.

## Compatibility and support

The supported integration surface is the package export map and implemented
provider OpenAPI. Internal `src`/`dist` imports, fixture modules and the orchestration
draft are not stable extension APIs. Root convenience exports remain supported;
backend imports remain explicit. Runtime support is Node 24 ESM as recorded in
[package installation](package.md).

The package is experimental 0.1.x, unpublished and has no stable compatibility
promise. Review changelog, schemas, profiles and migration notes when changing a
pin; use a reviewed artifact/commit rather than a moving branch. Changes to public
signatures, route semantics or supported account profiles require compatibility
review, regenerated references/contracts and a changelog entry. A future stable
release/support policy remains a release gate; see [releases](releases.md).
