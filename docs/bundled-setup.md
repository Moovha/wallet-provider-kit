# Configure the bundled wallet service

The recommended new-deployment path includes application authentication, a local
wallet engine, durable SQLite records, container supervision and an HTTPS gateway.
Configure these in the wizard; you do not need to build an authorization server,
register clients in another administration console or install a wallet engine.
Existing services and custom backend adapters remain optional integration paths.

## What is included

| Component                  | Default and purpose                                                                                                                                                         | Retained state                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Application authentication | Pinned `oidc-provider` 9.12.2, configured for server-to-server OAuth client credentials and RFC 9068 JWT access tokens.                                                     | Private RSA issuer key and per-application secrets in `provider.env`. |
| Wallet engine              | Pinned Open Wallet Standard core 1.4.3, included with its native platform binding. Creates accounts and signs only admitted actions through the existing journaled adapter. | Private `.provider-vault`, owner passphrase and SQLite journals.      |
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

## Configure through the wizard

1. **Provider:** enter your public HTTPS origin, display name and privacy notice.
2. **Backend:** keep **Open Wallet Standard**, choose a stable environment binding
   and retain the supplied vault and secret-variable names.
3. **Services:** keep **Bundled token service**. Issuer, audience and public-key
   endpoint derive from your provider origin. Initially only access, account
   reading and provisioning API scopes are selected.
4. **Policies:** choose each application's client ID and name and record its
   reviewed identity/consent trust agreement. The bundled issuer registers each
   enabled application automatically. User authentication and identity checks
   remain in the connected application.
5. **Deployment:** keep **Bundled Caddy automatic HTTPS** and leave wallet
   activation disabled. Financial signing and execution are explicit policy
   choices with their existing sponsor and acceptance requirements.
6. **Export:** validate and choose **Set up and run locally**. Review the plan and
   start setup. Missing issuer keys, client secrets and the vault passphrase are
   generated once and written to the private environment file. Values never
   appear in plan, progress or configuration downloads.

The local API starts on loopback with wallet operations disabled. The public
HTTPS gateway is saved but not started during local evaluation. No vendor
accounts, wallet accounts or on-chain operations are created by setup.

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

When you enable the runtime workspace in Policies, configure a separate provider
operator client ID. The bundle registers this service client separately, generates
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
supervision. The bundled Caddy profile is generated by container setup; native
services can use the documented existing-gateway path.

To use an existing issuer, select that option in Services and enter its exact
issuer, audience and JWKS endpoint. Existing configurations without
`authorizationServer` keep their external-issuer behavior. Imported configurations
are not automatically switched. Existing CDP and Relayer deployments remain
available in Backend; [custom adapters](custom-adapters.md) remain an advanced
path using reviewed server-owned modules.

Back up configuration, retained secrets, SQLite and the OWS vault together, on
encrypted private storage. Include Caddy state when used. Never delete a vault or
regenerate secrets to recover an uncertain wallet operation, and never run two
authoritative copies of a restored deployment.

The bundle cannot supply domain ownership, vendor contracts, a provider's legal
privacy policy or application gas funding. Optional hosted login/KYC vendor profiles and external execution providers retain their explicit configuration
and acceptance contracts. Experimental Base Sepolia limits and production
custody acceptance gates still apply. Offline tests are not live-provider or
public TLS acceptance evidence.
