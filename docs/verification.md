# Verification record

## API documentation and provider walkthrough — 15 October 2026

Node 24.22.0 / npm 11.11.1 checks pass: **347 existing tests**, TypeScript,
implemented OpenAPI/generated types, generated API/HTTP documentation drift,
Prettier and Secretlint. The documented provider walkthrough asserts **seven**
authentication, provisioning, signing, idempotency/replay, revocation, current-KYC
and unknown-outcome results using real JWT validation and an ephemeral offline
signer. It prints no identifiers, tokens or signatures and opens no listener.

The temporary tarball consumer executes both packaged examples and typechecks
the provider-flow JavaScript fixtures with `checkJs`, alongside public declarations
and the typed configuration example. Build, package consumer checks and
`npm pack --dry-run` pass; **158 files** are reviewed. `npm audit` reports zero
known vulnerabilities. Generated contracts remain unchanged. Built HTTP and real
ephemeral offline OWS worker smoke checks pass. Changed-document local references
resolve.

Scope interpretation uses the unmodified parent/DeFi governing briefs recorded
in [the scope guide](moovha-scope.md). Those repositories are context only; they
are not install/test dependencies and were not changed. The walkthrough journal
and authority are explicitly non-deployable single-run fixtures, not durable
financial storage or provider certification. Docker is unavailable locally;
container execution and live-provider acceptance were not run. No schema change,
financial activation, deployment or npm publication is included.

## Package adoption — 15 October 2026

Local checks use Node 24.22.0 and npm 11.11.1. All **347 existing tests** pass;
TypeScript, generated-contract drift, formatting and the secret scan pass.
`npm audit` reports zero known vulnerabilities. The build and tarball dry-run
pass; the reviewed candidate contains **148 files**, including compiled entry
points/declarations, contracts, documentation, the consumer example and licenses.
Generated contracts remain unchanged.

`npm run check:package` builds and installs a tarball into a temporary application
outside the checkout with development dependencies and the optional OWS engine
omitted. Public ESM imports, TypeScript declarations and the canonical typed
configuration example, the credential-free example, packaged contracts and the
installed CLI's liveness/default denial pass. A separate compiler-export check
confirms all **58 previous root exports**, including interfaces, remain available.
Changed-document local file links resolve. CI now runs the package consumer check.
Built-service HTTP and compiled OWS worker smoke checks also pass; the OWS smoke
uses an ephemeral offline wallet.

The public-project comparison is recorded in the
[adoption assessment](adoption-assessment.md); package usability is distinct from
financial acceptance. No live provider, identity vendor, credentials, wallet
creation or funds were used in these package checks. Docker is unavailable
locally; container execution and live-provider acceptance were not run. No npm
publication, deployment or financial authority/storage implementation is included.

## Onboarding and access — 15 October 2026

Local Node 24.22.0 / npm 11.11.1 checks pass: **347 tests** across 13 suites,
TypeScript, generated OpenAPI/types, formatting and secret scan. The 55 new cases
cover the complete HTTP consent/review path, real ephemeral signed OIDC code/PKCE
login, vendor request signing and normalization, client/owner isolation, budgets,
renewal/revocation, policy changes, provider suspension and uncertain-outcome recovery.
Delayed provider reviews cannot grant expired access, and owners can cancel
pending requests, including while a vendor result is in flight.
The tests use temporary private files and offline vendor fixtures, not customer data.

Build, built-service/OWS smoke tests and standalone configuration-example
typechecking pass. The package dry-run contains 129 files with no source tests,
credentials or provider state. `npm audit` reports no known vulnerabilities.
The consent screen was visually checked in a temporary loopback-only fixture.
`openid-client` 6.8.8 and its locked `oauth4webapi` dependency use MIT licenses.

The current-services workspace integration map refresh/check passes (156
screens/flows, 315 calls, 171 routes, 13 unresolved observations). The default
legacy-inclusive refresh/check each timed out after 15 seconds while reading the
separate external Python checkout; prior outputs were preserved. The standalone
toolkit remains outside that workspace scanner's service inventory.

No live identity service, Didit/Sumsub workspace, consent agreement, customer
database, provider wallet or funds were used. Docker is unavailable locally;
GitHub CI performs the container build. Production filesystem/recovery and vendor
acceptance remain outstanding. No deployment, schema change or npm publication
is included. Current remote check evidence is available in
[GitHub Actions](https://github.com/Moovha/wallet-provider-kit/actions).

## Initial extraction — 15 October 2026

This records the initial extraction checkpoint, before public GitHub hosting.
For the current branch workflow and CI, see the
[branch guide](branch-workflow.md) and
[GitHub Actions](https://github.com/Moovha/wallet-provider-kit/actions).

The final source was checked locally on Node 24.22.0 / npm 11.11.1. A separate
checkout of the staged files installed from its own lockfile with `npm ci`, with
no sibling modules, local environment files or live provider credentials.

- TypeScript checks include application and tests; all **84 tests** pass across
  signer/authority, HTTP/OAuth, configuration failures and actual OTLP transport.
- OpenAPI route/schema and generated TypeScript drift checks, Prettier and
  Secretlint pass. The implemented OpenAPI responses identify RFC 9457 media
  types. Local Markdown file references resolve.
- The built service is exercised over loopback HTTP: liveness, default unavailable
  readiness, Swagger HTML/CSP, OpenAPI and unconfigured signing denial pass.
- After removing development dependencies, the same HTTP smoke test passes and
  the compiled CDP public export loads and refuses exchange initialization.
- `npm audit` reports **zero known vulnerabilities** in the selected tree at the
  time of verification. The extracted ethers 5 tree had advisories; this repo
  independently moved to ethers 6.17.0 and reran the signing tests. DeFi's existing
  ethers version was not changed. Audit success is not a security certification.
- CycloneDX SBOM and a local package tarball were generated under ignored
  `artifacts/`; the reviewed package includes compiled exports, specs, docs,
  licenses and notice, with no credentials, environment files or test fixtures.
- Compose YAML parses, uses a required private Grafana password, disables
  anonymous access and binds exposed ports to loopback. OCI references were
  resolved to pinned digests. No Docker engine was available; actual container
  build/start, Grafana rendering and restart/volume behavior remain unverified.

CI is configured but has not run remotely because this repository is unpublished.
No live issuer integration, vendor account lifecycle/recovery, database authority,
mainnet transaction, external security review or financial readiness is claimed.
The default service stays unconfigured. Public reporting contacts/maintainer
handles/branch protection remain publication gates, documented in SECURITY.md
and docs/releases.md.
