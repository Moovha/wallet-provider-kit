# Implementing a provider

For installation, supported imports and your first credential-free example, see
the [package guide](package.md). The [API guide](api.md) and
[end-to-end tutorial](integration-example.md) show complete offline composition
before you replace fixtures with durable host integrations.

For new integrations, start with [onboarding and application access](onboarding.md)
and its [single configuration example](provider.config.example.ts). It supplies
default policy evaluation, owner consent, provider review, Didit/Sumsub adapters,
durable reference storage and journaled account creation. The interfaces below
are for existing hosts and financial-action integration.

For an existing application, the [supplied stored-action backend](stored-backend.md)
provides account recovery and durable signing dispatch through one configuration.
Reuse it rather than rebuilding those mechanics in each host.

You choose the signing backend and supply the application that decides who may use it.
We call that application the **host**. It checks owner consent, current grants,
Know Your Customer (KYC) status and revocation, and keeps persistent attempt
records.
External orchestrators, including Moovha, request permitted actions without
receiving keys through the kit. Your integration must explain who controls the
backend and how recovery works.

Use a dedicated OAuth audience, client registrations and network boundary.
Keep these separate from any orchestrator's public API or custody service;
a provider grant must not authorize access to Moovha-held custody keys.

## Compose the service

Wire together `createServer`, `createAuthenticator`, `EmbeddedWalletService` and
your implementation of `EmbeddedWalletAuthority` in your application's startup
code. Supply `ready()` to check the persistent authorization and recovery
services your host needs. Adding CDP credentials isn't enough to enable signing:
the CLI has no authority module loader or sample database. Supply reviewed
authority and recovery implementations in your startup code; never load module
names from a request.

```ts
import {
  createServer,
  createAuthenticator,
  EmbeddedWalletService,
  createJournaledWalletProvider,
} from '@moovha/wallet-provider-kit';

// authority, backend, journal, authorizeAttempt and authorityIsReady are reviewed host integrations.
const signer = createJournaledWalletProvider(backend, {
  namespace: 'your-product-test',
  journal,
  authorizeAttempt,
});
const app = await createServer({
  authenticate: createAuthenticator({ issuer, audience, jwksUrl }),
  service: new EmbeddedWalletService(authority, signer),
  ready: authorityIsReady,
});
await app.listen({ host: '127.0.0.1', port: 8080 });
```

This example shows where your implementations fit. You'll still need to build
and review them before production use. While the package is unpublished, use a
local build or tarball in your integration project. You don't need any sibling
Moovha repository to install or run this kit.

## Authentication and policy

When `createServer` has `onboarding`, provision/sign HTTP routes also check current
access and the account owner. In a financial host, use
`onboarding.bindWalletAuthority(authority)` and recheck
`onboarding.authorize(principal, accountId, 'operations:request')` **inside your
existing journal's `authorizeAttempt`**, alongside exact approved action, limits,
current owner, KYC and consent. An HTTP admission check alone cannot protect
against revocation between admission and dispatch or during result replay.
The bundled onboarding journal is provisioning-only; it denies signing.
Its canonical owner key is `ownerKey({ issuer, subject })` from the verified
provider login. Existing hosts must resolve that trusted login tuple to their
customer record and use the same owner binding in their authority integration.
Do not derive it from an application's service-account subject or supplied name.

For new users, follow [enrollment and identity handoff](enrollment.md). The kit
verifies provider-bound OIDC Identity Assurance evidence; your host decides
acceptance and keeps current local KYC and wallet authorization separate. The
existing empty-body provisioning endpoint assumes a pre-enrolled owner unless
you enable `EnrollmentService`, which adds a current-acceptance gate.

Use an existing OAuth authorization server (for example the deployment's managed
IdP or maintained `oidc-provider`). Configure exact HTTPS issuer and JWKS URL and
an audience dedicated to this service. The resource server validates RFC 9068
JSON Web Tokens (JWTs) with type `at+jwt`, using RS256/ES256, trusted keys and
mandatory issuer, subject, audience, expiry, issue time, token ID and client ID.
Tokens may live at most ten minutes. It rejects ID tokens, expired tokens and
tokens with the wrong scope.
No endpoint issues tokens or accepts shared Moovha admin API keys.

`wallet:provision` and `wallet:sign` let a request reach your policy checks;
they don't grant permission to spend. Your authority adapter must validate
**current** client/grant state, map the trusted issuer/subject/client tuple to
the owner and object, enforce first-party step-up/device proof where applicable,
and read current stored KYC
as exactly `ID VERIFIED`. Missing or uncertain policy must deny before provider
calls. Provider scope cannot confer admin, source-wallet migration or custody
access. Do not trust body status, caller-selected addresses or cached approvals.

## Durable authority and attempt contract

`AuthorityContext` carries the verified principal and required UUIDv4
`Idempotency-Key`. Authority methods load server-owned records by the path ID.
They never accept a transaction payload from HTTP. The host must:

1. Namespace admission by environment, issuer/client, owner, method and resource;
   reject a key reused for another request and enforce quotas before dispatch.
2. Commit immutable account/action identity, consent, expected binding/capability/
   plan revisions, lease and provider attempt ID before effects. Across retries,
   preserve the same attempt and account identity; never generate fresh financial
   identity to handle a timeout.
3. Serialize concurrent work and prevent duplicate dispatch. For signing, require
   current unexpired approved action and dependencies, exact chain/account/hash,
   and the provider's tested profile. Current status is checked on every attempt.
4. Persist results and uncertain outcomes through a transactional dispatch journal.
   The [journal-backed provider wrapper](durable-attempts.md) implements claim,
   completion, exact-result replay and safe error handling through your
   `WalletAttemptJournal`. You supply the actual durable storage and current
   authorization callback. The authority port alone only admits work. Do not
   mark readiness true until real storage, concurrency and recovery are demonstrated.
5. Reconcile lost responses read-only before considering a retry. A 503 with
   `outcome: unknown` does not establish that no account/signature exists. Never
   repeat a mutation blindly or treat cancellation as signature revocation.

`sessionSubject` in the returned authority is the host's resolved owner identity,
not a claim that every OAuth subject is a user ID. `ownerSubject`, current stored
status, account identity and immutable action revisions are checked again by the
core service. The host is trusted code; returning fabricated records bypasses its
own policy. No sample in-memory authority is shipped as a deployment option.

## Signing backend contract

The experimental [OWS adapter](ows-adapter.md) reuses local OWS wallet storage
and signing behind the same approved-action boundary. Its profile requires the
host journal wrapper and owner credential; read its control and recovery limits
before choosing it. The [OpenZeppelin Relayer adapter](openzeppelin-relayer.md)
binds preconfigured signers and adds a separate stored-action execution service.
Relayer owns its nonce and broadcast workers; the host keeps spending authority
and durable attempt identity. The default CLI does not activate any adapter.

### Current adapter profile

| Capability   | CDP adapter                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------- |
| Network      | Base Sepolia, chain 84532 only.                                                              |
| Account type | Externally owned account (EOA), revision 1. Contract accounts are unsupported.               |
| Signing      | Exact approved EIP-712 typed data; digest, domain and recovered signer checked.              |
| Key control  | App-controlled CDP API-key wallets; no keys or seed phrases exposed by the kit interface.    |
| Recovery     | Read-only account lookup by stable opaque ID; the host supplies the durable attempt journal. |
| Submission   | No broadcast, gas sponsorship or settlement implementation.                                  |
| Evidence     | Offline adapter/service tests; live lifecycle and recovery remain unverified.                |

This follows the explicit capability approach described in
[related projects](related-projects.md). It doesn't imply compatibility with those
projects.

### Implement an adapter

Implement `WalletSigningProvider` with `createAccount`, read-only `findAccount`,
and `signTypedData`. Never export keys through this interface. Stable account IDs
must resolve to the same owner-bound address, and typed signatures must recover
the expected signer for the exact approved EIP-712 digest. Provider errors must
be sanitized and distinguish not-dispatched/rejected/unknown outcomes. A rejected
signature cannot trigger subsequent gas funding.

The CDP adapter uses the vendor's public authentication helper, fixed vendor URL,
explicit credentials, ten-second HTTP timeout, bounded response bytes, no
redirects and no automatic mutation retries. Its name is `moovha-<opaque UUID>`;
phone numbers and customer identifiers never go to the vendor as names. It checks
Base Sepolia chain 84532, EOA revision 1, a 32 KiB
payload, expiry, matching domain, primary type, CAIP-10 address and digest, then
verifies the returned signature.
It snapshots the input before awaits and rechecks expiry after the account read.
These are tested restrictions, not a claim of universal account compatibility.

The backend uses app-controlled CDP API-key wallets. Describe operator and vendor
key control, recovery/export rights and failure modes to adopters. A login
integration does not establish end-user self-custody. Measure live usage and costs
before activation. WalletConnect supplies connectivity and is not a signing
backend included in this kit.
