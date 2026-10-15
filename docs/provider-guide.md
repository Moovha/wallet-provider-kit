# Implementing a provider

You bring the signing backend and the application that decides who may use it.
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
} from '@moovha/wallet-provider-kit';

// authority, signer and authorityIsReady are your reviewed implementations.
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
4. Persist results and uncertain outcomes through the host's provider decorator /
   dispatch journal. This kit's authority port only admits work; it does not
   implement completion storage, distributed leases, a replay cache or recovery.
   Do not mark readiness true until those mechanisms are demonstrated.
5. Reconcile lost responses read-only before considering a retry. A 503 with
   `outcome: unknown` does not establish that no account/signature exists. Never
   repeat a mutation blindly or treat cancellation as signature revocation.

`sessionSubject` in the returned authority is the host's resolved owner identity,
not a claim that every OAuth subject is a user ID. `ownerSubject`, current stored
status, account identity and immutable action revisions are checked again by the
core service. The host is trusted code; returning fabricated records bypasses its
own policy. No sample in-memory authority is shipped as a deployment option.

## Signing backend contract

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
Base Sepolia chain 84532, externally owned account (EOA) revision 1, a 32 KiB
payload, expiry, matching domain, primary type, CAIP-10 address and digest, then
verifies the returned signature.
It snapshots the input before awaits and rechecks expiry after the account read.
These are tested restrictions, not a claim of universal account compatibility.

The backend uses app-controlled CDP API-key wallets. Describe operator and vendor
key control, recovery/export rights and failure modes to adopters. A login
integration does not establish end-user self-custody. Measure live usage and costs
before activation. WalletConnect supplies connectivity and is not a signing
backend included in this kit.
