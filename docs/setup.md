# Configuration and financial profile reference

Use this reference to understand the configuration exported by the
[six-step wizard](setup-wizard.md), or when your deployment process needs to
validate JSON directly. The settings connect your provider identity, backend,
application token service, policies and runtime. Start with [getting started](README.md)
for the guided setup; the field names, commands and financial details below
explain how that configuration is implemented.

For graphical setup, run `wallet-provider-kit setup` and follow the
[FormKit operator wizard](setup-wizard.md). It exports this same validated
configuration through forms, with supported backend logos and setup references.

The standard adoption path is a configured wallet service. Supported setups need
configuration, deployment and HTTP API consumption; they do not require a Node.js
host application, authority callbacks, database adapters or journal implementations.
Custom adapters and embedded library composition are advanced integrations.

The service remains experimental; Base mainnet configuration does not establish funded acceptance. Configuration selects an
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

`init` writes the [bundled application-led template](provider.config.bundled.example.json)
with generated wallet environment and application client IDs, without overwriting
an existing file. Retain those IDs when editing the saved configuration. Editors can use the packaged
[JSON Schema](../spec/provider-config.schema.json). Version 1 rejects unknown fields,
unsupported profiles, plaintext credentials, invalid policies and incomplete
activation settings. `validate` is offline: it does not read secrets, load adapter
modules, create storage or call identity/wallet services. Diagnostics contain paths
and validation rules rather than input values.

Set your provider's HTTPS origin/privacy notice, allowed application issuer/client
IDs, trust agreements and permissions. Standard users remain in the connected
application, which supplies accepted identity and consent attestations. Optional
hosted compatibility adds provider reviewers, existing login and configured
identity vendors or unfunded record evaluation. Keep
credentials in environment variables supplied by your secret store; configuration
contains only references such as `{"env":"PROVIDER_LOGIN_SECRET"}`. The command does
not automatically read `.env` files. `init` supplies `backend.binding`, a stable
non-secret identifier for this wallet-backend environment; retain it across
credential rotations. The service binds its database
to this identifier, provider implementation and HTTPS origin. Changing them, or
adopting an existing embedded-host database, requires a reviewed migration rather
than automatic replacement wallets. Config and backend selection are deployment
inputs, never request inputs. Relative storage and custom-module paths resolve
against the configuration file's directory.

## Configure application authentication

The wizard defaults to the bundled token service and OWS wallet engine.
`wallet-provider-kit init` uses the [bundled template](provider.config.bundled.example.json).
Run `init-secrets` once in a private deployment directory to generate missing
issuer keys, client secrets and the OWS passphrase. Existing-issuer settings remain
available through Services; see [bundled setup](bundled-setup.md).

For an existing issuer, Services configures `oauth`: the application token issuer,
dedicated audience and HTTPS JWKS URL. Issue RFC 9068 `at+jwt` access tokens with
`client_id` and a maximum 600-second lifetime. In Policies, register the exact
issuer/client pair in `policy.applications`, together with permissions and
`assertionTrust.agreement`. The [registration reference](operator-services.md#register-the-application-api-and-clients)
explains the token claims and where each value comes from.

The standard configuration selects `policy.access.mode: "application"`.
Set `policy.identity.application.verificationLevel` and `requiredFields` to the
checks agreed with applications. Applications authenticate users, perform those
checks and record consent before requesting access. The
[access contract](application-access.md) defines current revisions, user binding,
expiry and withdrawal. API tokens alone cannot establish this user authority.

Optional staff token controls need a separate `ownerLogin` registration. Hosted
compatibility additionally uses reviewer subjects and, when selected, identity
vendors and funding agreements. Use [hosted setup](onboarding.md) for those
settings. Existing configurations without `access.mode` retain hosted behavior;
changing an occupied store's ownership mode requires a reviewed migration.

## Select a built-in backend

The template selects CDP with environment-backed credentials. All built-in backends
use toolkit-owned authority and journals; no adapter code is required.

For **OWS**, the package and standard image include the pinned engine. Keep its
native platform dependency installed. Confirm the version in the deployment application:

```sh
npm ls @open-wallet-standard/core
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
macOS deployment; the standard image includes the native engine. An OWS
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
configured token contract/domain and authorization behavior on the selected network.
Secrets alone never activate the service. Start it with:

```sh
npx --no-install wallet-provider-kit run --config provider.config.json
```

Deploy behind HTTPS ingress, keep the database private/persistent and use
`/health/ready` for traffic admission. Documentation is off by default for configured
services; enable `http.documentation` deliberately. `/health/live` checks process
liveness only. SIGTERM closes HTTP work and the database. Existing no-argument
execution still exposes an unconfigured inspection service.

For a new local CDP or Relayer deployment, the wizard or
`wallet-provider-kit local-setup --config provider.config.json --install-runtime`
can install missing runtime tools, initialize a fresh store and start the disabled
service with progress. See [local setup](local-setup.md) for private secrets,
installation prompts and recovery. The commands below are the manual container path.

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

For the standard flow, read `GET /v1/access-policy`, then send the application's
stable user ID, current identity evidence and recorded consent to
`POST /v1/access-requests`. Policy acceptance returns `granted` and account/grant
IDs without a consent URL. Provision separately, read account details, and call
`POST /v1/access-grants/{grantId}/revoke` when the user withdraws. Follow
[application-led access](application-access.md) for the full payload and limits.
The [HTTP guide](http-api.md) documents token scopes, account reads, signing and
retry outcomes. Protected requests need current grants as well as API scopes.
Keep the original UUIDv4 `Idempotency-Key` when retrying a POST with the same
content. Provider-hosted login and review are covered in the optional
[hosted compatibility guide](onboarding.md).

## Supported financial policy

The optional `provider-authorized-erc3009-v1` profile builds an exact
[ERC-3009 TransferWithAuthorization](https://eips.ethereum.org/EIPS/eip-3009) EIP-712
message on the configured **Base mainnet (8453) or Base Sepolia (84532)** network. Clients supply only account, recipient and
integer atomic-unit amount. They cannot supply a digest, nonce, domain, arbitrary
typed data, expiry or authority record. The server fixes these from configuration
and generates a cryptographically random nonce.

Add `financial` to the configuration, replacing the example addresses/domain with
your independently verified test-token configuration:

```json
{
  "profile": "provider-authorized-erc3009-v1",
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
validity window must be 60–3600 seconds and begins when requested. Signing and
submission must finish before expiry.

Explicitly allow `transfers:request` in the application's configured `permissions`
and request it in `authorization_details[0].actions`. Read the exact `transfer_terms` and `transfer_policy_revision` from the access policy. Present the token/domain, network, recipients, limits and validity in the application, record the user’s consent and include that revision in the assertion. Hosted compatibility instead presents its own consent screen. Accepted KYC and
provider acceptance are also required. `operations:request`, an access token or
an account-read grant alone cannot authorise this transfer profile.

Request with `wallet:actions` scope and a current `transfers:request` grant:

```http
POST /v1/transfer-authorizations
Authorization: Bearer <application-access-token>
Idempotency-Key: <uuid-v4>
Content-Type: application/json

{"account_id":"<approved-account-uuid>","recipient":"<allowed-address>","amount":"1000000"}
```

The provider resolves the application/caller and account to the stored owner-bound
transfer delegation, checks its consent and policy revision, current KYC, account
binding, recipient and amount, then persists the exact immutable action and its
financial authorization. The receipt contains `action_id`, `status: authorized`,
expiry, `payload_hash` and generated `payload`. There is no `approval_url` or
per-transfer owner login/approval. The application is trusted to request transfers
on behalf of the user within this explicit delegation; the provider does not
independently prove the user's interaction with the application's UI.

Call `POST /v1/actions/{actionId}/sign` with `wallet:sign`, a UUIDv4 idempotency
key and `{}`. The response contains the verified signature. The financial journal
atomically reserves the lifetime budget at signing admission; an authorized receipt
alone does not reserve budget, dispatch, submit or settle a transfer.
`GET /v1/transfer-authorizations/{actionId}` with `wallet:actions:read` reads the
stored status (`authorizing`, `authorized` or `denied`). A persistence interruption
can leave `authorizing`; retry the original request with its original idempotency
key and content to resume the same action and nonce. Such an action cannot sign
until provider authorization is durably complete. Current owner/grant/KYC/consent,
account binding, exact stored approval and policy revision are checked before
admission, dispatch and successful-result replay. Retries use the original attempt
and stored signature; concurrent requests cannot dispatch twice. Changed financial
policy invalidates earlier action authorizations and revokes transfer-delegation
grants tied to the old terms. Reconnect and obtain new delegation consent; current
accepted KYC can be reused when only financial terms changed. Onboarding
policy/vendor workflow changes also invalidate affected grants. Credential rotation does not. Policy activation is recorded in the database:
older running instances fail readiness and their budget writes are fenced inside
the database transaction. Superseded action approvals remain
denied even if an earlier configuration is restored. Stop old instances before
activating a new configuration; no configuration file is hot-reloaded.

**Migration:** the former `owner-approved-erc3009-v1` configuration is rejected.
Select `provider-authorized-erc3009-v1`, explicitly allow `transfers:request`, and
establish a new owner-consented delegation. Old request-only grants and stored
owner-approved actions are not upgraded into delegated spending authority. The
old `/onboarding/actions/{actionId}` approval endpoints have been removed. The
SQLite schema is unchanged; do not reinitialize existing storage.

Signing can authorize movement when submitted to the token contract. Revoking
application access or declining later work cannot invalidate an already-issued
signature; it can remain executable until its on-chain expiry. The optional [execution profile](execution.md) coordinates a dedicated application
sponsor and independently verifies chain status. It does not fund gas or cancel
on-chain authorizations. The connected application arranges sponsor funding through its
accepted execution rail; Moovha takes that role for admitted Moovha operations. See
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
