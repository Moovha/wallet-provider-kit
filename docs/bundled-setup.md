# Configure the bundled wallet service

The recommended new-deployment path includes application authentication, a local
wallet engine, a running local execution engine, durable storage, container supervision and an HTTPS gateway.
Configure these in the wizard; you do not need to build an authorization server,
register clients in another administration console or install wallet and execution engines.
Existing services and custom backend adapters remain optional integration paths.

## What is included

| Component                  | Default and purpose                                                                                                                                                         | Retained state                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Application authentication | Pinned `oidc-provider` 9.12.2, configured for server-to-server OAuth client credentials and RFC 9068 JWT access tokens.                                                     | Private RSA issuer key and per-application secrets in `provider.env`. |
| Wallet engine              | Pinned Open Wallet Standard core 1.4.3, included with its native platform binding. Creates accounts and signs only admitted actions through the existing journaled adapter. | Private `.provider-vault`, owner passphrase and SQLite journals.      |
| Local execution            | OpenZeppelin Relayer 1.8.0 with Valkey 9.1.2; both official images pinned by digest. Private dispatch, nonce workers and persistent queues.                                 | `.local-execution`, `execution.env` and `.execution-data`.            |
| Authority and storage      | The supplied provider policy, grant and attempt services with single-host SQLite.                                                                                           | `.provider-data`, configuration and binding revisions.                |
| HTTPS                      | Official Caddy 2.11.7 image pinned by digest; certificate issuance and renewal for your configured hostname.                                                                | Private `.provider-tls` certificate storage.                          |
| Runtime                    | Docker Compose with restart supervision, unprivileged service processes and persistent private bind mounts.                                                                 | Saved Compose definition and operating instructions.                  |

`oidc-provider` supplies a maintained OAuth implementation with native support for
the required JWT profile. Caddy supplies automatic certificate management. OWS is
the existing local backend that makes this setup independent of vendor account
creation. These are defaults for this kit's supported single-host evaluation
profile, not a claim of superior production custody or certification. See the
[issuer project](https://github.com/panva/node-oidc-provider),
[Caddy HTTPS documentation](https://caddyserver.com/docs/automatic-https) and
[OWS control and recovery](ows-adapter.md).

## Supplied settings and explicit decisions

A new wizard draft generates unique wallet environment and bundled application
IDs. Enabling the runtime workspace generates a separate operator ID. These are
non-secret identifiers, retained in the configuration through export and import;
setup never replaces them on restart. Import the saved configuration when editing
an existing deployment. Starting a fresh draft or running `init` creates new IDs
for a new deployment. Names are display labels and do not determine identity.

The wizard prefills `.provider-vault`, `.provider-data`, host port `8080`, policy
version `1`, identity freshness of 90 days and access duration of seven days.
Bundled service credential variable names are supplied, and setup generates
missing secret values once. Advanced controls expose overrides for integration
and host requirements. Existing-issuer client IDs and external service endpoints
must match their actual registrations.

Provider identity, domain ownership, privacy notice, reviewed trust agreements,
permissions, accepted financial contracts, gas budgets, RPC independence and
acceptance evidence require your decisions. Defaults do not invent agreements,
grant financial scopes, fund accounts or activate wallet operations.

## Configure through the wizard

1. **Provider:** enter your public HTTPS origin, display name and privacy notice.
2. **Backend:** keep **Open Wallet Standard**. The wizard generates a stable
   environment binding and supplies the private vault and credential-variable
   settings. Overrides are collapsed under advanced settings.
3. **Services:** keep **Bundled token service** and **Bundled OpenZeppelin Relayer and Valkey**. Issuer, audience and public-key
   endpoint derive from your provider origin. Initially only access, account
   reading and provisioning API scopes are selected. Overrides are under
   **Advanced application API permissions**.
4. **Policies:** name each application and record its
   reviewed identity/consent trust agreement. The bundled issuer registers each
   enabled application with a generated client ID automatically. Retain that ID
   in the saved configuration and give it to the application's integration team.
   User authentication and identity checks
   remain in the connected application.
5. **Deployment:** keep the supplied private data path, port and **Bundled Caddy
   automatic HTTPS** settings and leave wallet activation disabled. Their
   overrides are under **Advanced deployment settings**. Financial signing and execution are explicit policy
   choices. Their default submission path is the bundled local engine. Set independent RPC sources, accepted chain/token hashes, application gas budgets and a funding agreement. Setup generates each sponsor binding and encrypted key; no external Relayer account or signer registration is required.
6. **Export:** validate and choose **Set up and run locally**. Review the plan and
   start setup. Missing issuer keys, client secrets and the vault passphrase are
   generated once and written to private environment files. Engine API, storage encryption and keystore credentials are generated too. Values never
   appear in plan, progress or configuration downloads.

The local API starts on loopback with wallet operations disabled. The local execution engine and Valkey start automatically and must pass readiness checks before the API starts. With no action policy configured, the engine has zero sponsors and cannot submit an action. The public
HTTPS gateway is saved but not started during local evaluation. No vendor
accounts, owner wallets or on-chain operations are created by setup. When action execution is configured, setup creates only local encrypted gas-sponsor keystores and records their public addresses in the saved configuration. Inspect those public addresses privately, arrange gas funding and complete execution acceptance before activation.

On the final deployment host, point the configured hostname's DNS to that host
and allow inbound TCP ports 80 and 443. Use the saved Compose command with
`--profile https up --detach --no-build` to start the gateway when you intend to
expose the disabled service. Caddy contacts a public certificate authority;
issued public certificates expose the hostname in certificate transparency logs.
An existing listener on either port must be resolved first. Reserved example
hostnames cannot receive public certificates. See [local setup](local-setup.md)
for the saved file locations and command prefix.

TLS certificate issuance, renewal and final-host ingress still require actual
network acceptance. The wizard cannot establish ownership of your domain or
open your host firewall. Gateway startup does not activate wallet operations.

## Local execution, persistence and recovery

The engine runs as a separate, unprivileged process using the existing checked
OpenZeppelin Relayer adapter. Its administration API and Valkey have no published
host ports. Only the wallet service joins the private execution network; Valkey
uses a separate internal network. The wallet service receives the engine API
credential, while the keystore passphrase and storage encryption key stay in
`execution.env`, mounted only into the execution container. Engine diagnostics
are suppressed to prevent upstream logs from disclosing identifiers or RPC URLs.

Valkey uses an append-only journal with `appendfsync always` and no eviction.
Restart retains nonce/queue records and encrypted sponsor keys. Retain all state
across maintenance; new-deployment setup refuses to regenerate existing sponsor
addresses. Back up SQLite, Valkey, encrypted keystores, configuration, secrets
and OWS state as one quiesced deployment. Losing or restoring only part of that
state can lose dispatch evidence. Do not submit again after an uncertain response
or run two authoritative copies of a restored deployment.

Relayer owns submission and nonce handling; the wallet service still verifies
current owner, grant, identity, consent, immutable action and durable attempt
before dispatch. Independent RPC agreement verifies chain outcomes. Engine
readiness alone supplies no spending authority, gas funding or settlement proof.
Choose Base mainnet or Base Sepolia in Provider. Existing configurations without a network keep Base Sepolia. Automatic fee replacement through
the designated-service extension remains an optional separate acceptance path.

The separate Relayer image is distributed upstream under **AGPL-3.0-only**;
Valkey uses BSD-3-Clause. Review their license obligations for your distribution
and operation. The toolkit remains Apache-2.0. Version and runtime contracts
follow the [pinned Relayer source](https://github.com/OpenZeppelin/openzeppelin-relayer/tree/b8cf360a49c5739e43491ca5d2f6bbc934b7438e)
and [Valkey project](https://github.com/valkey-io/valkey).

## Connect a server application

Privately deliver only that application's generated client secret to its server
secret store, together with its client ID, issuer and allowed scopes. Use your
approved secret-transfer channel; never paste secrets into a public report,
command argument, browser bundle or mobile app. The provider's issuer signing
key, vault passphrase and other applications' secrets stay with the provider.

Read discovery at `<provider-origin>/oauth/.well-known/openid-configuration`.
POST a URL-encoded form to `<provider-origin>/oauth/token` with
`grant_type=client_credentials`, `client_id`, `client_secret` and an explicit
space-separated `scope`. Authentication uses `client_secret_post`. An optional
RFC 8707 `resource` must equal the configured audience. Tokens expire after
300 seconds; request another token rather than a refresh token.

The issuer refuses a nonempty `DEBUG` environment setting to prevent protocol
diagnostics from exposing token-request data. Normal service logging excludes
bodies and credentials.

The bundle has static server-application clients. It exposes no public client
registration, user-password grant, browser login or refresh-token flow. Unknown
clients, wrong credentials, foreign resources and unauthorized scopes are denied.
A token identifies the application; it does not prove user ownership or authorize
spending. The existing owner, grant, current identity, consent, exact action and
durable attempt checks remain mandatory before wallet effects.

When you enable the runtime workspace in Policies, the wizard generates a
separate provider operator client ID. Its override is under **Advanced operator
identity**. The bundle registers this service client separately, generates
its secret and sets its token subject to its client ID. It can request
`wallet:configuration:read`, `wallet:configuration:write` and
`wallet:execute:read`. Keep its secret with the provider. Application registrations
cannot request the write scope; the runtime service also checks the configured
operator identity. Optional interactive staff login remains an existing-identity
service integration, separate from these service-operator credentials.

Removing a client or reducing its allowed scopes denies its stale tokens after
service restart. Rotating its secret stops new issuance using the old secret;
already issued tokens can remain valid for up to five minutes. Revoke wallet
access separately when required. Retain the issuer key across restarts. Key
replacement requires a planned authentication transition; the bundle does not
implement an overlapping issuer-key rotation interface.

## Manual and existing-service paths

`wallet-provider-kit init` produces the bundled configuration template. The
[JSON example](provider.config.bundled.example.json) contains placeholder policy
and names only. Replace those settings and keep the file in an owner-only private
deployment directory. Run `wallet-provider-kit init-secrets --config <file>` once
to create `provider.env`. It generates missing bundled secrets, preserves supplied
process-environment values and refuses to overwrite an existing file. Required
external-service variables are left empty for private completion.

Run `init-storage` once for a new deployment; it also prepares a missing private
OWS vault. Service startup never initializes storage or regenerates credentials.
Follow [manual deployment](operator-deployment.md) for environment loading and
supervision. The bundled local execution engine is supplied by container setup; for a native host, explicitly select an existing execution service reachable over HTTPS. The bundled Caddy profile is generated by container setup; native
services can use the documented existing-gateway path.

To use an existing issuer, select that option in Services and enter its exact
issuer, audience and JWKS endpoint. Existing configurations without
`authorizationServer` keep their external-issuer behavior. Imported configurations
are not automatically switched. Existing CDP and Relayer deployments remain
available in Backend. Select **Existing services or custom adapter** in Services to omit the bundled dispatcher; [custom adapters](custom-adapters.md) remain an advanced
path using reviewed server-owned modules.

Back up configuration, retained secrets, SQLite and the OWS vault together, on
encrypted private storage. Include Caddy and local execution state when used. Never delete a vault or
regenerate secrets to recover an uncertain wallet operation, and never run two
authoritative copies of a restored deployment.

The bundle cannot supply domain ownership, vendor contracts, a provider's legal
privacy policy or application gas funding. Optional hosted login/KYC vendor profiles and external execution providers retain their explicit configuration
and acceptance contracts. Experimental profile limits and production
custody acceptance gates still apply. Offline tests are not live-provider or
public TLS acceptance evidence.
