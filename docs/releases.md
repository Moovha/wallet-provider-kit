# Prepare a release

Maintain the package and provider API as explicit integration contracts. Review
compatibility, supported backend profiles and recovery behavior for each candidate.
The package is experimental and `private: true` keeps registry publication disabled;
publication requires separate maintainer authorization.

## Verify the candidate

Access-mode changes require explicit compatibility review. Standard templates select application-led access; omitted mode in existing configurations remains hosted. An occupied deployment cannot switch modes without a reviewed ownership migration. Preserve backend bindings, accounts, grants and uncertain attempts. No automatic cross-application account linking or ownership migration is supplied.

1. Start from a clean checkout with the pinned Node/npm versions and `npm ci`.
   Run `npm run verify`, `npm run build`, `npm run check:package`, `npm audit`
   and `npm pack --dry-run`. Review the package contents and confirm the standalone
   install requires no sibling modules or local secrets.
2. Review generated contract/reference diffs, API compatibility, dependencies and
   licensing. Apply the [public writing review](public-writing.md#review-before-publication)
   to release notes and other candidate text before publication.
   [NOTICE](../NOTICE), [extraction.json](extraction.json) and
   [LICENSE.source](LICENSE.source) preserve source attribution; third-party
   dependencies retain their own licenses.
3. Run Docker runtime checks on a suitable host. Record container build evidence
   separately from startup/restart/storage checks. Live-provider acceptance needs
   a separately authorized, unfunded pilot and the [integration checks](conformance.md).
4. Create the ignored `artifacts` directory and generate an inventory:
   `npm run sbom --silent > artifacts/sbom.cdx.json`. Review the CycloneDX inventory
   and advisory results. CI uploads an SBOM and package candidate for the exact run.
5. Update changelog/version/support notes, obtain required review and tag the
   exact tested commit. Financial activation requires independent security review.
   Retain results and unresolved limitations in the PR/release records.

Use the [branch workflow](branch-workflow.md) and required checks for integration.
A candidate, commit, tag or passing mock is not provider certification or deployment
authorization. See [SECURITY.md](../SECURITY.md) for support and vulnerability reporting.

## Publish only when authorized

Configure the approved registry and short-lived OIDC trusted publishing through
a protected environment. Verify actual provenance/signatures and checksums.
There is no automatic npm publication workflow or stored registry token.

CI candidates are retained for 14 days. Store approved release artifacts and
acceptance evidence in a durable release archive; temporary CI artifacts are not
a long-term audit record.

## Rollback and recovery

Before rollback, check schema and authorization compatibility with the candidate.
Preserve admitted attempts and reconcile uncertain effects. A rollback cannot
revoke a signature or erase financial history. The kit does not supply automatic
schema upgrades or downgrades; do not reinitialize storage to roll back. Pin and
review package/image/action updates rather than
using floating `latest` references.
