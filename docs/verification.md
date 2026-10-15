# Extraction verification — 15 October 2026

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
