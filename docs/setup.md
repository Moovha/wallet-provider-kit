# Configure, deploy and integrate

The standard adoption path is a configured wallet service. Supported setups need
configuration, deployment and HTTP API consumption; they do not require a Node.js
host application, authority callbacks, database adapters or journal implementations.
Custom adapters and embedded library composition are advanced integrations.

The service remains experimental and test-network-only. Configuration selects an
implemented profile; it does not establish production custody or vendor acceptance.

## Initialize and validate

<figure class="wallet-visual">
  <img src="./public/diagrams/service-setup.webp" alt="Diagram: installation and offline validation precede operator-controlled storage setup, explicit activation and HTTP API use." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>Offline validation, storage initialization and activation are distinct steps. Existing stores require a reviewed migration.</figcaption>
</figure>

[View full-size diagram](public/diagrams/service-setup.webp)

[Install a reviewed package](package.md), then run its executable:

```sh
npx --no-install wallet-provider-kit init provider.config.json
npx --no-install wallet-provider-kit validate --config provider.config.json
```

`init` writes the [JSON template](provider.config.example.json) without overwriting
an existing file. Editors can use the packaged
[JSON Schema](../spec/provider-config.schema.json). Version 1 rejects unknown fields,
unsupported profiles, plaintext credentials, invalid policies and incomplete
activation settings. `validate` is offline: it does not read secrets, load adapter
modules, create storage or call identity/wallet services. Diagnostics contain paths
and validation rules rather than input values.

Set your provider's HTTPS origin/privacy notice, allowed application issuer/client
IDs and permissions, provider reviewers, existing login and identity vendor. Keep
credentials in environment variables supplied by your secret store; configuration
contains only references such as `{"env":"PROVIDER_LOGIN_SECRET"}`. The command does
not automatically read `.env` files. Set `backend.binding` to a stable public identifier for this wallet-backend
environment; retain it across credential rotations. The service binds its database
to this identifier, provider implementation and HTTPS origin. Changing them, or
adopting an existing embedded-host database, requires a reviewed migration rather
than automatic replacement wallets. Config and backend selection are deployment
inputs, never request inputs. Relative storage and custom-module paths resolve
against the configuration file's directory.

## Register external integrations

| Setting               | External setup                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ownerLogin`          | Register a confidential OIDC client with exact callback `<provider-origin>/onboarding/callback`; enable code flow, PKCE S256, RS256/ES256 ID tokens and `auth_time`. Your IdP owns registration, MFA and recovery. |
| `oauth`               | Configure the application API issuer, dedicated audience and HTTPS JWKS; issue RFC 9068 `at+jwt` access tokens with `client_id`, at most ten minutes old.                                                          |
| `policy.applications` | Register connected application clients separately from the owner's login client. Match each checked issuer/client pair.                                                                                            |
| `reviewers`           | Configure provider staff's login subject IDs. Provider review establishes identity acceptance; a vendor approval alone cannot accept a user.                                                                       |
| `identity`            | Supply Didit recipient workflow or Sumsub recipient level/Share setup and credentials. Add confirmed price bounds and application funding agreements before paid/import work.                                      |
| `backend`             | Select a bundled CDP, OWS or OpenZeppelin Relayer backend using the configurations below. Prove its Base Sepolia EOA lifecycle and recovery independently.                                                         |

The [onboarding guide](onboarding.md) explains acceptance, identity sharing, cost
reservations and access management. Login clients, vendor accounts and commercial
agreements must exist at the selected external services; the kit does not create
those accounts from credentials.

## Select a built-in backend

The template selects CDP with environment-backed credentials. All built-in backends
use toolkit-owned authority and journals; no adapter code is required.

For **OWS**, install the pinned optional engine in the deployment application:

```sh
npm install --save-exact @open-wallet-standard/core@1.4.3
```

Create a private persistent vault directory, then configure:

```json
{
  "kind": "ows",
  "binding": "your-stable-ows-environment",
  "vaultDirectory": ".provider-vault",
  "passphrase": { "env": "OWS_OWNER_PASSPHRASE" }
}
```

The engine and vault are separate from SQLite. The owner passphrase must have
16–4096 characters and cannot be an agent token. Preserve both vault and database
backups. The kit creates wallets through the existing OWS adapter and never exports
keys. See [OWS custody and recovery](ows-adapter.md). Use a supported glibc Linux or
macOS deployment; the reference Docker image omits this optional engine. An OWS
container deployment must install it and separately mount its persistent vault.

For **OpenZeppelin Relayer**, configure an existing signer pool:

```json
{
  "kind": "openzeppelin-relayer",
  "binding": "your-stable-relayer-environment",
  "url": "https://relayer.example.com",
  "apiKey": { "env": "RELAYER_API_KEY" },
  "signers": [
    {
      "relayerId": "your-preconfigured-relayer",
      "signerId": "your-preconfigured-signer",
      "address": "0x1111111111111111111111111111111111111111",
      "bindingRevision": "1"
    }
  ]
}
```

Create and configure those signers at your Relayer deployment first. The kit
atomically reserves one unused signer per accepted account before provisioning;
assignments survive restart and are never replaced to recover from uncertainty.
A signer/address cannot be allocated twice. An exhausted pool denies provisioning;
add capacity through configuration. Lookup/reconciliation only reads existing
assignments and never allocates a signer. Removing/changing an assigned signer
blocks that account until a reviewed migration; it does not select a replacement.
The existing adapter verifies remote network, signer/address and policy metadata.
This configuration enables signing only, not the separate Relayer execution API.
See [Relayer acceptance](openzeppelin-relayer.md).

## Initialize storage and inspect setup

Choose one persistent local POSIX host and private data directory. Initialize the
kit's own SQLite database explicitly, then inspect setup:

```sh
npx --no-install wallet-provider-kit init-storage --config provider.config.json
npx --no-install wallet-provider-kit doctor --config provider.config.json
```

`init-storage` creates only an empty toolkit database after inspecting its catalog;
it refuses foreign or incompatible schemas and never upgrades an existing schema.
`run` never initializes storage. `doctor` checks secret availability without printing
values and inspects the actual SQLite catalog/integrity through a read-only
connection, including the stored provider binding. OWS diagnosis also checks engine
availability and private vault/owner-credential requirements. It reports missing
acceptance and custom-adapter conformance separately.
It does not perform network checks, redeem identity tokens, create wallets or sign.
A successful diagnosis is not provider certification.

Use a dedicated 0700 directory owned by the service UID, with private database and
sidecar files. Network/shared storage, ephemeral disks, Windows and multi-host
replicas are unsupported. Back up and restore the [SQLite database](storage.md)
and preserve its approved actions and attempts; never replace uncertain work with
fresh IDs. Database loss is not permission to create replacement wallets or sign again.

## Activate and run

The template has `activation.enabled: false`; readiness remains 503 and API
mutations cannot dispatch. After independent backend lifecycle/recovery acceptance,
record your evidence references explicitly:

```json
{
  "enabled": true,
  "backendAcceptance": "your-reviewed-backend-lifecycle-evidence",
  "recoveryAcceptance": "your-reviewed-recovery-evidence"
}
```

These references are operator attestations, not an automated certification. For
the financial profile below, also provide `tokenAcceptance` after verifying the
configured token contract/domain and authorization behavior on the test network.
Secrets alone never activate the service. Start it with:

```sh
npx --no-install wallet-provider-kit run --config provider.config.json
```

Deploy behind HTTPS ingress, keep the database private/persistent and use
`/health/ready` for traffic admission. Documentation is off by default for configured
services; enable `http.documentation` deliberately. `/health/live` checks process
liveness only. SIGTERM closes HTTP work and the database. Existing no-argument
execution still exposes an unconfigured inspection service.

Docker deployment uses a reviewed source checkout rather than the installed npm
tarball. [provider.compose.yaml](../ops/provider.compose.yaml) supplies the
configured command, a read-only configuration mount and a persistent data mount.
Set `PROVIDER_CONFIG`, `PROVIDER_DATA`, `PROVIDER_SECRETS_FILE`, `PROVIDER_UID` and
`PROVIDER_GID` in your deployment environment. Create the private host data directory
first. Set `http.host` to `0.0.0.0` in the config, use `.provider-data` as its storage
directory, and keep the published port behind HTTPS ingress. Initialize once using:

```sh
docker compose -f ops/provider.compose.yaml run --rm api node dist/main.js init-storage --config /config/provider.json
docker compose -f ops/provider.compose.yaml up -d api
```

The existing monitoring compose remains an unconfigured inspection environment.
No Docker or live-provider acceptance is implied by offline package tests.

## Consume the API

An application written in any language uses the
[implemented OpenAPI](../spec/provider-api.json) with its scoped access token. `GET /v1/capabilities` reports readiness and the
configured action profiles.
POST requests require a UUIDv4 `Idempotency-Key`; keep it when retrying the same
request. Application credentials do not represent the account owner's approval.

1. `POST /v1/access-requests` to create/connect; open its provider consent URL in
   the user's browser. The provider owns login, consent and identity-review pages.
2. Poll `GET /v1/access-requests/{id}` for the approved account/grant and expiry.
3. `POST /v1/accounts/{id}/provision` with `{}`; the kit creates the account once
   and stores its result. `GET /v1/accounts/{id}` reads the current account.
4. When the configured financial profile is present, request a transfer, send the
   user to exact-action approval, then sign the stored action as described below.

Users pause/revoke access at `/onboarding/access`; staff review identity and
reconcile uncertain account creation at `/onboarding/review`. These hosted pages
can be linked from your product. Frame embedding is blocked; use browser navigation
and server-side API consumption. Callback state and the approval URLs contain no
private keys. Your product may return users through its own navigation after polling;
there is no arbitrary caller-supplied return URL.

## Supported financial policy

The optional `owner-approved-erc3009-v1` profile builds an exact
[ERC-3009 TransferWithAuthorization](https://eips.ethereum.org/EIPS/eip-3009) EIP-712
message on **Base Sepolia, chain 84532**. Clients supply only account, recipient and
integer atomic-unit amount. They cannot supply a digest, nonce, domain, arbitrary
typed data, expiry or authority record. The server fixes these from configuration
and generates a cryptographically random nonce.

Add `financial` to the configuration, replacing the example addresses/domain with
your independently verified test-token configuration:

```json
{
  "profile": "owner-approved-erc3009-v1",
  "token": {
    "address": "0x1111111111111111111111111111111111111111",
    "name": "Your verified token domain name",
    "version": "Your verified token domain version",
    "symbol": "TEST",
    "decimals": 6
  },
  "recipients": ["0x2222222222222222222222222222222222222222"],
  "maximumAmount": "1000000",
  "lifetimeAmount": "10000000",
  "maxValiditySeconds": 300
}
```

`maximumAmount` bounds each authorization. `lifetimeAmount` is the durable maximum
reserved atomic units per account/token across all applications, including dispatched pending,
failed and unknown dispatches. It does not reset on policy revisions or restart;
it is not an on-chain balance, daily spending counter or settlement ledger. The
validity window must be 60–3600 seconds and begins when requested, so approval must
finish before expiry. A fresh request needs fresh owner approval.

Request with `wallet:actions` scope and a current `operations:request` grant:

```http
POST /v1/transfer-authorizations
Authorization: Bearer <application-access-token>
Idempotency-Key: <uuid-v4>
Content-Type: application/json

{"account_id":"<approved-account-uuid>","recipient":"<allowed-address>","amount":"1000000"}
```

The receipt contains `action_id`, `approval_url`, approval `status`, expiry,
`payload_hash` and the generated `payload`. Open `approval_url`; only the current
account owner with a recent provider login can approve. The screen displays the
application, amount, recipient, source, token/domain, network and expiry. Staff or
application tokens cannot approve it. Owner form submissions require session CSRF
and exact origin checks.

Poll `GET /v1/transfer-authorizations/{actionId}` with `wallet:actions:read`. Once
approved, call `POST /v1/actions/{actionId}/sign` with `wallet:sign`, a UUIDv4
idempotency key and `{}`. The response contains the verified signature. Approval
status is not a dispatch or settlement status. Current owner/grant/KYC/consent,
account binding, exact stored approval and policy revision are checked before
admission, dispatch and successful-result replay. Retries use the original attempt
and stored signature; concurrent requests cannot dispatch twice. Changed financial
policy invalidates earlier action approvals; onboarding policy/vendor workflow
changes also invalidate affected grants. Credential rotation does not. Policy activation is recorded in the database:
older running instances fail readiness, and superseded action approvals remain
denied even if an earlier configuration is restored. Stop old instances before
activating a new configuration; no configuration file is hot-reloaded.

Signing can authorize movement when submitted to the token contract. Revoking
application access or declining later work cannot invalidate an already-issued
signature; it can remain executable until its on-chain expiry. The kit does not
broadcast, sponsor gas, cancel on-chain authorizations or implement settlement.
The connected application is expected to arrange gas sponsorship through its
execution rail; Moovha takes that role for admitted Moovha operations. See
[assets and gas sponsorship](assets-and-gas.md) for coverage and activation status.
Unknown signing outcomes remain blocked and retain usage after restart. There is
no configuration switch to retry an uncertain effect; reconciliation needs
independently verified evidence through the advanced storage interface.

Without `financial`, the service supports onboarding/provisioning and denies
signing. Other chains, arbitrary messages, contract wallets and generic transactions
are not silently enabled by this profile.

## Advanced custom adapters

Choose custom code only for an integration outside the supported configuration.
The [adapter contract](custom-adapters.md) describes a trusted, versioned startup
module. Existing embedded APIs and host-owned policy/storage ports remain available
for products needing custom action types, storage or approval behavior. They are
advanced paths, rather than prerequisites for the configured service.
