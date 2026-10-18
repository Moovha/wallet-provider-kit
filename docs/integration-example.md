# End-to-end provider integration

Use this offline tutorial if you are developing a custom or embedded integration
beyond the [wizard setup](README.md). It makes authentication, permission checks,
backend signing and durable retries visible in one runnable example. A fixture
access token passes the JWT verifier and a stored approved action reaches a
signing backend. The same run exercises replay, revocation, current-identity
denial and an uncertain result. It requires no live credentials or funds.

This tutorial covers the kit's implemented provider API. It doesn't call Moovha's
planned operation API or implement prepare/commit, gas sponsorship or settlement.
Read [the architecture guide](architecture.md#applications-and-wallet-control)
for the application/provider boundary. After the walkthrough, follow
[Connect your wallet backend](backend-guide.md) to replace its signer.

The **host** is your wallet service's server application. Its **authority** decides
which account owner and connected application may perform the requested action.
The **backend** creates accounts and signs; the **journal** records attempts and
results so retries don't repeat those effects. In this tutorial, the application's
OAuth registration is its **client**, and the checked token identity is its
**principal**. The application isn't the account owner. See [roles and terms](concepts.md)
for how these names appear in configuration and API fields.

## 1. Install and run

Use Node **24.22.0** and npm **11.11.1**. From this repository:

```sh
npm ci
npm run example:provider
```

The command builds the package and runs
[examples/provider-flow/run.mjs](../examples/provider-flow/run.mjs). No `.env`,
provider account, database, network listener or funded wallet is required.

To follow it from your own application, first build/install the tarball using the
[package guide](package.md), then run:

```sh
node node_modules/@moovha/wallet-provider-kit/examples/provider-flow/run.mjs
```

Expected output after any npm build messages:

```text
PASS 1: unauthenticated request denied before backend effects
PASS 2: approved account provisioned once; retry replays the result
PASS 3: idempotency key reused for another action rejected
PASS 4: approved stored action signed once; exact signature replayed
PASS 5: revoked grant blocks even a previously successful result
PASS 6: current KYC denial blocks backend effects
PASS 7: unknown signing outcome retained; retry does not redispatch
```

Assertions make the process fail if a step behaves differently. It prints no
keys, tokens, account/action identifiers, request bodies or signatures. When it
finishes, HTTP resources close and all fixture state is discarded.

## 2. Find the four parts

| File                                                                 | Responsibility                                                                     | Replace for a real integration                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [run.mjs](../examples/provider-flow/run.mjs)                         | Composition, ephemeral JWT issuer, HTTP requests and response assertions           | Trusted issuer registration/key resolution, your application's lifecycle and authenticated requests        |
| [host.mjs](../examples/provider-flow/host.mjs)                       | Preseeded owner/grant/KYC/consent, approved action records and attempt admission   | Your reviewed durable authority, owner binding, approved-action records and current dispatch/replay checks |
| [backend.mjs](../examples/provider-flow/backend.mjs)                 | Ephemeral wallet implementing account creation, read-only lookup and typed signing | Your selected engine/service or a supported toolkit adapter                                                |
| [attempt-journal.mjs](../examples/provider-flow/attempt-journal.mjs) | In-process journal contract fixture                                                | Transactional persistent claims/results, uniqueness, fencing, audit/outbox and recovery                    |

**The host and journal here are fixtures, not deployment adapters.** They lose
state on exit and cannot coordinate processes or recover after a crash. The
runner uses `app.inject()` and never calls `listen`; fixture `ready: true` means
only that this test composition is loaded. Production readiness requires durable
authority/recovery and accepted backend behavior. Don't copy that readiness value
into a deployment or expose these fixtures as an HTTP service.

## 3. Authenticate an application

`run.mjs` generates an ephemeral ES256 issuer key pair and uses `SignJWT` to issue
a five-minute `at+jwt` token. It contains the provider audience, issuer, subject,
client ID, issued-at, expiry, token ID and `wallet:provision wallet:sign` scopes.
`createAuthenticator` verifies it through a trusted local JWKS resolver:

```js
const authenticate = createAuthenticator(
  oauth,
  createLocalJWKSet({ keys: [publicKey] }),
);
```

The HTTPS `.example.test` issuer/JWKS values are fixture identities; the supplied
local resolver means no discovery or remote JWKS request occurs. In deployment,
use your existing trusted issuer and `createAuthenticator({ issuer, audience,
jwksUrl })`. This resource server doesn't issue tokens for your customers.

The application-service subject deliberately differs from the account owner.
`host.mjs` resolves the verified issuer/client/subject tuple through its preseeded
owner grant. It never treats the token subject, a scope or a caller-written KYC
status as sufficient spending authority. PASS 1 proves a missing token reaches
no backend effect.

## 4. Load current authority and admit an attempt

<figure class="wallet-visual">
  <img src="./public/diagrams/action-authority.webp" alt="Diagram: a verified caller passes current authority and exact-action checks before durable admission, reauthorization and signing." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>The offline walkthrough exercises these authority and attempt boundaries through the public interfaces.</figcaption>
</figure>

[View full-size diagram](public/diagrams/action-authority.webp)

The fixture starts with an already accepted owner, active client-bound grant,
current KYC and consent, a reserved account ID, and two reviewed immutable proof
actions. These are private host records. No HTTP route accepts signable bytes.
For new-user identity/consent setup use the separate [onboarding guide](onboarding.md).

`authority.provision` checks the caller and owner grant, then binds an idempotency
key to this account request and reserves one provider attempt ID.
`authority.sign` additionally loads the approved action, account and revisions.
It returns a clone of the stored action, not request-supplied data. Different
request identity under the same key is rejected, as PASS 3 demonstrates.

In a real host, admission must commit the immutable owner/account/action,
consent/proof, plan and capability revisions, budgets and stable attempt identity
before effects. Missing storage, expired policy or uncertain approval must deny.
See the [authority contract](api.md#core-wallet-service) and
[durable-attempt requirements](durable-attempts.md).

## 5. Compose and call the provider

The runner uses these package entry points:

```js
const backend = createJournaledWalletProvider(host.backend, {
  namespace: 'offline-provider-example',
  journal: new FixtureJournal(),
  authorizeAttempt: host.authorizeAttempt,
});
const app = await createServer({
  authenticate,
  service: new EmbeddedWalletService(host.authority, backend),
  ready: async () => true, // Offline fixture ONLY; replace for production.
});
```

The requests are actual Fastify HTTP injections. Provisioning and signing each
send an access token, a UUIDv4 idempotency key and `{}`:

```js
const response = await app.inject({
  method: 'POST',
  url: `/v1/actions/${host.action.action_id}/sign`,
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'idempotency-key': signKey,
  },
  payload: {},
});
```

For a deployed provider these same method/path/header/body shapes travel over
HTTPS; see the [HTTP guide](http-api.md). Here, `app.inject()` exercises the HTTP
middleware in process without opening a network listener.

The separate `backend.mjs` adapter uses an ephemeral ethers wallet to sign a harmless EIP-712
challenge with Base Sepolia chain ID. It has no asset-transfer fields and no
chain connection. The journal wrapper checks the exact digest and recovered
signer. The runner verifies the response again. PASS 2 and PASS 4 assert that
an identical authorized retry returns the original account/signature and doesn't
repeat the backend effect.

## 6. Recheck permission before dispatch and replay

`authorizeAttempt` resolves the admitted attempt and checks current grant,
consent, KYC, account and immutable action. The wrapper calls it before claiming,
before dispatch and when replaying success. The fixture binds the wrapper's
fingerprint to the admitted private action on first use. A real host must derive
that exact binding from durable admitted records and transactional state.

The runner then revokes the grant and retries a successful signing request.
It receives 403 rather than a cached signature. It restores the fixture grant,
changes KYC to `REJECTED`, and proves the same denial. No backend signing count
increases. These are controlled fixture state changes, not exposed admin APIs.

Revocation blocks future access. It cannot revoke a signature already returned
to an application or invalidate an on-chain authorization by itself.

## 7. Keep a lost response unknown

The runner calls `host.loseNextSigningResponse()` before the second approved proof
action. That action signs internally, then simulates losing the
response with `WalletProviderError('wallet_provider_unavailable', 'unknown')`.
The HTTP response is 503 with `outcome: unknown`. The journal retains that state;
a retry with the same key stays unknown and doesn't sign again.

The journal preserves the original attempt and its unknown outcome. In deployment,
reconcile that attempt
using accepted backend-specific read-only evidence. `findAccount` can reconcile
account creation; the generic signing interface has no signature lookup, so
signing recovery needs your host/provider's reviewed recovery path. Unknown
signing work must remain blocked when that evidence isn't available.

## 8. Replace fixtures in your application

Keep the composition and public interfaces. Replace the fixture pieces with:

1. Your OAuth issuer and application identity/consent attestation integration (or an explicitly chosen hosted login flow), with distinct caller and user identities and a dedicated provider audience.
2. Durable current owner/grant/KYC/consent/proof authority and immutable reviewed
   actions. Resolve service principals through their actual owner grants.
3. Transactional idempotency/attempt admission and a persistent journal with
   tested concurrency, restart, fencing and read-only reconciliation.
4. An accepted backend profile with declared key controller and recovery model.
   CDP is a raw backend that needs the journal wrapper; OWS and Relayer factories
   already take journal options and must not be wrapped a second time.
5. A dependency/recovery readiness check, controlled service startup/shutdown,
   TLS/ingress and quotas appropriate to the host.

For persistent storage, use the [built-in SQLite adapter](storage.md) or implement
an adapter against your deployment's inspected schema and transaction guarantees.
The example's in-memory authority and journal are not deployment storage.
Use [conformance](conformance.md) to plan the independent security and live-provider
acceptance work. Passing this tutorial doesn't certify a provider or establish
exclusive end-user custody. Continue with [backend integration](backend-guide.md),
[host authority](provider-guide.md) and [deployment acceptance](conformance.md).

## Troubleshooting

| Observation                                | Check                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Package import cannot resolve              | Run `npm run build` in the checkout, or install its built tarball in your application                                    |
| Runtime rejects syntax/imports             | Use the pinned Node 24 ESM runtime from the package guide                                                                |
| `npm start` stays unconfigured             | Expected: the default executable doesn't load this fixture or a production authority                                     |
| Example assertion fails                    | Check Node/npm pins and package/source consistency; it exits without enabling a live service                             |
| Production request returns 401/403/409/503 | Use the [HTTP error table](http-api.md#problems-and-application-decisions); preserve the original attempt on uncertainty |
