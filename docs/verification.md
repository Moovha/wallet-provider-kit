# Verification record

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
