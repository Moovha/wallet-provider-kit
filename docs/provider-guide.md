# Integrate your wallet service

For supported deployments, use [configuration-first setup](setup.md); the kit
supplies authority and journals. This guide covers advanced embedded hosts and
custom financial integrations.

After [installing the package](package.md) and running the
[provider walkthrough](integration-example.md), [choose and connect your backend](backend-guide.md).
This guide connects it to your application's permission checks, persistent records and HTTP API.

For new integrations, start with [onboarding and application access](onboarding.md)
and its [single configuration example](provider.config.example.ts). It supplies
default policy evaluation, owner consent, provider review, application-record
evaluation or optional Didit/Sumsub adapters,
durable reference storage and journaled account creation. The interfaces below
are for existing hosts and financial-action integration.

For an existing application, the [supplied stored-action backend](stored-backend.md)
provides account recovery and durable signing dispatch through one configuration.
Reuse it rather than rebuilding those mechanics in each host.

The [built-in SQLite database](storage.md) can supply onboarding persistence,
immutable financial approvals, bounded usage and signing/execution journals on
one host. Its financial authority requires your current owner/grant/KYC/consent
policy callback; database setup alone never enables signing.

You choose the signing backend and supply the application that decides who may use it.
That application is the **host**. It checks owner consent, current grants,
Know Your Customer (KYC) status and revocation, and keeps persistent attempt
records.
External orchestrators, including Moovha, request permitted actions without
receiving keys through the kit. Your integration must explain who controls the
backend and how recovery works.

Connected applications have OAuth **client registrations**: entries at your
trusted authorization server that identify requesting software. They are separate
from account owners and from your provider's own owner-login registration. In
bundled onboarding, `policy.applications[]` lists their issuer/client IDs and
the names shown to owners. See [roles and terms](concepts.md#what-does-client-mean).

Use a dedicated OAuth audience, application registrations and network boundary.
Keep these separate from any orchestrator's public API or custody service;
a provider grant must not authorize access to Moovha-held custody keys.

## Agree asset support and gas sponsorship

Record the actual network, token contract, units and action capabilities for
each integration. Moovha's DeFi use cases include USDC and ZARP; that context
does not enable those assets or mainnet operations in the kit's test-network profile.

Connected applications are expected to cover eligible gas for the operations
they request. When your users approve Moovha access, Moovha takes that sponsor
role for admitted operations. Your provider retains key control, current
authority checks and approved signing/submission; the application arranges the
funding rail. Agree submission ownership, bounded budgets and uncertain-outcome
recovery before enabling it. Access consent alone cannot trigger funding.
See [assets and gas sponsorship](assets-and-gas.md) for the coverage contract
and implementation status. The provider kit does not itself supply live Moovha
sponsorship or settlement.

## Configured transfer delegation

The supported `provider-authorized-erc3009-v1` profile accepts transfer requests
from admitted applications on behalf of the account owner. Explicitly configure
and obtain `transfers:request` consent during onboarding. The provider checks the
stored delegation and consent terms, current owner/grant/KYC, token/recipient/amount
policy, immutable exact action and durable budget/attempt authority. It authorises
signing without a second owner approval prompt. The application is trusted to
request transfers within that delegation; OAuth scopes alone are insufficient.
Changed financial terms revoke old transfer delegations and require renewed consent,
while still-current accepted KYC can be reused. See [setup and migration](setup.md#supported-financial-policy).

The advanced interfaces below retain host-owned exact-action authorization; they
do not automatically turn request-only grants into spending authority.

## Compose the service

Wire together `createServer`, `createAuthenticator`, `EmbeddedWalletService` and
your implementation of `EmbeddedWalletAuthority` in your application's startup
code. Supply `ready()` to check the persistent authorization and recovery
services your host needs. Adding CDP credentials isn't enough to enable signing:
the no-argument CLI remains unconfigured; `run --config` supplies only its
supported configured-service profiles. Supply reviewed
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

This example shows where your implementations fit. Build and review them before
production use. Install a [built tarball](package.md) in your integration project.
This repository contains the source and dependency definitions needed to build it independently.

## Authentication and policy

<figure class="wallet-visual">
  <img src="./public/diagrams/action-authority.webp" alt="Diagram: token identity is followed by owner, grant, KYC, consent, immutable-action and durable-attempt checks before backend effects." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>The host must authorize the exact action and recheck current permission immediately before dispatch or saved-result replay.</figcaption>
</figure>

[View full-size diagram](public/diagrams/action-authority.webp)

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

For new users, follow [enrollment and identity acceptance](enrollment.md). The kit
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
Your OAuth issuer issues application tokens. Optional
[operator token controls](operator-tokens.md) request them through that issuer;
the kit is not a token issuer and does not accept shared Moovha admin API keys.

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
   `WalletAttemptJournal`. Use the built-in SQLite adapter or your own accepted
   durable storage, with current authorization checks. The authority port alone only admits work. Do not
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

| Capability   | CDP adapter                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network      | Base Sepolia, chain 84532 only.                                                                                                                                                                   |
| Account type | Externally owned account (EOA), revision 1. Contract accounts are unsupported.                                                                                                                    |
| Signing      | Exact approved EIP-712 typed data; digest, domain and recovered signer checked.                                                                                                                   |
| Key control  | App-controlled CDP API-key wallets; no keys or seed phrases exposed by the kit interface.                                                                                                         |
| Recovery     | Read-only account lookup by stable opaque ID; the host supplies the durable attempt journal.                                                                                                      |
| Submission   | No broadcast, gas sponsorship or settlement implementation.                                                                                                                                       |
| Evidence     | Offline tests plus [limited live CDP staging](conformance.md#isolated-cdp-staging-exercise-16-october-2026) for provisioning and recovery. External login/KYC and live signing remain unverified. |

Use this supported profile when evaluating your integration; a backend SDK
method or vendor feature alone does not establish account compatibility.

### Implement an adapter

Implement `WalletSigningProvider` with `createAccount`, read-only `findAccount`,
and `signTypedData`. Never export keys through this interface. Stable account IDs
must resolve to the same owner-bound address, and typed signatures must recover
the expected signer for the exact approved EIP-712 digest. Provider errors must
be sanitized and distinguish not-dispatched/rejected/unknown outcomes. A rejected
signature cannot trigger subsequent gas funding.

The CDP adapter uses the vendor's public authentication helper, fixed vendor URL,
explicit credentials, ten-second HTTP timeout, bounded response bytes, no
redirects and no automatic mutation retries. Its name is `mw-<opaque UUID without hyphens>`
(35 characters, within CDP's 36-character limit); every UUID bit is retained for
deterministic read-only recovery. Never rename an existing account or reset a durable
attempt to adopt this format. Previously rejected attempts remain rejected;
uncertain attempts require reconciliation before any further provider effects.
Phone numbers and customer identifiers never go to the vendor as names. It checks
Base Sepolia chain 84532, EOA revision 1, a 32 KiB
payload, expiry, matching domain, primary type, CAIP-10 address and digest, then
verifies the returned signature.
It snapshots the input before awaits and rechecks expiry after the account read.
These are tested restrictions, not a claim of universal account compatibility.

The backend uses app-controlled CDP API-key wallets. Describe operator and vendor
key control, recovery/export rights and failure modes to your users. A login
integration does not establish end-user self-custody. Measure live usage and costs
before activation. WalletConnect supplies connectivity and is not a signing
backend included in this kit.
