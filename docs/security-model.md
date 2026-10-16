# Security model

## Local setup authority

The [local setup executor](local-setup.md) is an operator tool, separate from the
wallet service API. Keep its one-hour private session link private and its listener
on loopback. Exact Host/Origin checks, a fragment-delivered bearer token and a
restrictive browser policy protect its API; do not expose or proxy it publicly.

Configuration validation and runtime detection have no deployment effects.
**Install local runtime and continue** separately authorizes package installation,
Docker plugin configuration and local engine startup. Setup reuses a healthy
Unix-socket Docker engine, starts installed Docker Desktop when applicable, or
installs missing Homebrew packages and starts a dedicated Colima VM. It does not
change the selected Docker context, enable a system Docker service or add users
to the Docker group. Existing Colima profile resources and mounts are retained.
Concurrent installers are blocked by a private host lock.

If Homebrew is missing, setup verifies a revision-pinned installer against its
recorded SHA-256 digest before running it. Browser setup opens that installer in
a local terminal for OS permissions; the CLI uses its terminal. Never enter an
administrator password in the browser. Package downloads are verified by Homebrew;
installer output is not returned through the setup API. Installation requires
trust in Homebrew, Colima and their distribution infrastructure. Runtime tools and
VM images are installed separately from the toolkit and are not bundled in its
package. They may remain installed after failed setup.

Explicitly starting a reviewed plan authorizes local Docker builds, private file creation, initialization of a new
store and container startup. The executor pins a local Unix-socket daemon, refuses
custom modules and active configurations, accepts only referenced secrets and runs
fixed commands without a shell. A wizard session can initialize only one new
deployment and cannot replace existing records. Containers have a read-only root,
no capabilities and read-only secret/config mounts; data persists on the host.

The operator account and Docker daemon remain trusted. Secret values are plaintext
in an owner-only host file, available to the container and Docker administrators.
Progress and errors omit raw command output and secret values. Startup health is
distinct from application, backend and recovery acceptance; wallet operations
remain disabled. A failed setup retains records and attempts project-container
cleanup without deleting data. Unconfirmed cleanup requires operator investigation.

## Hosted compatibility authority

The optional [hosted compatibility profile](onboarding.md) keeps application authentication, provider
owner login, identity evidence, customer acceptance and account access as distinct
records. Share tokens never authenticate an owner. Provider reviewers explicitly
match evidence to the authenticated owner; no vendor result automatically grants
access or changes an existing host's KYC status. Browser decisions require a
short-lived provider session, a CSRF token and an exact Origin check.

The bundled private file store contains authentication state, identity references
and audit records. Protect its directory and backups; do not use shared/ephemeral
filesystems. It never steals a stale lock or retries an uncertain vendor mutation.
The ready-made profile journals provisioning only and denies financial signing.

Optional [enrollment](enrollment.md) accepts only provider-nonce-bound, signed
identity evidence. It never treats caller-written KYC fields or an API scope as
user verification/consent. Provider policy decides acceptance, and current wallet
authority still decides provisioning/signing. Identity data stays out of responses,
telemetry and errors; real storage, issuer integration and consent capture remain
host responsibilities.

<figure class="wallet-visual">
  <img src="./public/diagrams/action-authority.webp" alt="Diagram: authenticated identity must pass current authority, exact-action and durable-attempt checks before a backend can sign." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>Fail before backend effects when authority is missing or stale; preserve the original attempt when effects are uncertain.</figcaption>
</figure>

[View full-size diagram](public/diagrams/action-authority.webp)

Your deployment connects an untrusted HTTP caller, a token issuer and its public
JSON Web Key Set (JWKS), your authorization store, a signing provider, an operator
and a monitoring backend. Each has a different trust role. A compromised token issuer and a
compromised signing provider create separate risks; OAuth scopes never replace
current owner, grant and consent checks.

The configured `provider-authorized-erc3009-v1` transfer profile requires a separate
`transfers:request` delegation recorded at onboarding. The provider trusts the
registered application to request transfers within that delegation; the API does
not independently attest that the user clicked a transaction button. A compromised
application credential can request transfers within the active delegation and
provider limits, so admit applications accordingly. Ordinary OAuth scopes and
`operations:request` grants do not establish delegated spending authority.
The provider verifies the source consent record, current owner/grant/KYC, financial
terms, exact immutable action and lifetime budget, then uses durable admission,
exclusive dispatch and current-policy checks before signing or replay. Financial
policy changes revoke affected delegation grants without changing accepted KYC.
No per-transfer owner approval endpoint is exposed.

Anyone with backend signing credentials may control the wallet. Explain that
control and recovery model to your users. The kit doesn't establish end-user
self-custody or hardware security module (HSM) attestation.

| Threat                                  | Implemented control                                                                                                                    | Remaining host obligation                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cross-tenant account/signing access     | Verified issuer/client/subject context; core owner/KYC checks; HTTP denial tests                                                       | Durable client-bound grant/object lookup and revocation            |
| Forged/ID/expired tokens                | Maintained jose verifier, exact issuer/audience, access-token type, algorithm and lifetime restrictions                                | Secure IdP registration, keys and revocation policy                |
| Arbitrary signing/body policy injection | Only stored action ID; empty strict mutation body; digest/address/revision validation                                                  | Immutable reviewed plan, consent and action storage                |
| Duplicate or uncertain dispatch         | Required idempotency context, preserved vendor attempt ID, optional journal-backed claim/result wrapper, no automatic mutation retries | Transactional admission, lease, result journal, reconciliation     |
| Stale KYC/grant                         | Recheck authority per operation; exact stored KYC match required                                                                       | Real read consistency, revocation and native proof checks          |
| Credential/payload disclosure           | No request logging, sanitized errors, allowlisted metrics, bounded responses, fixed vendor host                                        | Secret store, proxy/collector configuration, staff access controls |
| Mainnet/unsupported account use         | CDP admits only tested Sepolia EOA action profile                                                                                      | Independent acceptance before new chains/account types             |
| Monitor outage or compromise            | Optional bounded OTLP export; no authority in dashboard                                                                                | Audit persistence separate from telemetry; monitoring RBAC         |

Live custody/account recovery, an external security audit, penetration testing,
SOC2 certification and on-chain settlement remain unverified. Before enabling
production operations, complete the relevant [acceptance checks](conformance.md).
Any database schema change must use verified current schema evidence and receive
explicit approval for the target deployment. The built-in SQLite schema is toolkit-owned;
the kit supplies no migration for an external application database.

The [journal-backed provider wrapper](durable-attempts.md) coordinates backend
effects. It rechecks current host policy, validates immutable request identity
and stored signatures, and prevents automatic replay of pending/unknown outcomes
through the host journal contract. Use the [SQLite journal](storage.md) or a host
adapter with transactional uniqueness, fencing and audit/result persistence.
Your deployment must protect stored data and verify recovery. Offline fixtures
are not deployment storage, and readiness remains the host's responsibility.

## Application-led access trust boundary

The standard service authenticates an explicitly registered application, then
checks its user assertion under a recorded trust agreement. Required fields alone
are not KYC. The application attests the agreed verification level, verification
time and recorded user consent; the provider checks freshness, current policy and
exact transfer terms before storing authority. No provider user login or staff
review is required in this flow. The provider relies on the application's truthful
performance and retention of those checks; it does not independently fetch vendor
evidence in application-led mode.

User IDs are namespaced by issuer/client and cannot link accounts across applications.
The machine subject remains the API caller, not the user. Current grants, account
status, expiry and policy are checked again before dispatch and replay. Applications
must communicate withdrawals through grant revocation. Old consent cannot restore
revoked grants; new consent and current identity evidence are required. Hosted
compatibility retains its separate login, consent and staff acceptance boundary.
Changing an occupied deployment's access mode requires a reviewed migration.

## Optional operator application tokens

The deployed explorer can use an explicitly configured server-side
client-credentials broker. It is disabled by default. Fresh staff-login sessions
must match a separate exact-issuer/subject operator allowlist, and each client
must be an enabled provider registration with explicit scope limits. Client
secrets are environment references; only the server exchanges them with the
configured issuer. Issued JWTs pass the normal RFC 9068 authenticator and exact
client/scope checks before being returned to the browser.

Token endpoints require exact Host, Origin and CSRF checks, have a low issuance
rate limit, and fence superseded configured instances. The browser keeps tokens
only in page memory, clears authorization on caller/scope changes and page state
on reload, renews before
Execute when needed, and never retries provider API effects automatically. An
expired operator session blocks renewal. These controls grant application token
issuance, not wallet owner consent, identity acceptance or spending authority.
[Operator instructions](operator-tokens.md) cover setup, scope limits and the
lifetime of already-issued tokens after sign-out.

## Application-record evaluation

The hosted compatibility evaluation profile accepts assertions from admitted applications solely for
unfunded account evaluation. It retains provider-required fields and requires
separate owner consent and provider review. Application claims of KYC approval,
roles or spending permission confer no authority. The profile rejects external
vendor adapters, operational/transfer permissions and financial signing. Existing
vendor profiles retain their evidence checks; record acceptance cannot satisfy
a later external-verification policy. See [application records](application-records.md).

## Optional execution trust boundary

The [transfer coordinator](execution.md) preserves current owner, grant, KYC,
consent, exact action and durable attempt checks before provider effects. It
accepts no arbitrary transaction bytes. Sponsor funding is explicit and separate
from owner keys; an uncertain dispatch never creates another attempt. RPC quorum
requires independently operated trusted sources and verifies exact receipt
effects and finality; it is not cryptographic consensus proof. Proxy upgrades
and actual L1/vendor recovery costs require operator controls.

The bounded CloudEvents feed is an authorized observation history, not an
exhaustive accounting ledger. Single-active-host failover requires external
fencing and reconciliation of effects missing from a backup. Sender-constrained
OAuth proofs are not implemented: access tokens containing `cnf` are rejected.
See the [enterprise v1 release gates](v1-standards.md).
