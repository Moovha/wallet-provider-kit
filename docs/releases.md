# Prepare a release

The repository is locally initialized on main and deliberately has no remote.
The rights holder authorized Apache-2.0 for the extracted foundation on 15 October 2026. NOTICE and extraction.json identify its origin; the old license is retained
only as historical evidence in docs/LICENSE.source. Do not extend that permission
to unrelated source or third-party dependencies.

Before initial public hosting, verify contributor rights, package namespace,
maintainer/backup handles, security reporting contacts and applicable dependency
licenses; configure protected main, CODEOWNERS and required CI/reviews. Obtain the
owner's explicit public-hosting authorization. `private: true` remains until a
separately authorized npm release. A local commit is not publication.

When you're preparing a release candidate, work through these checks:

1. Use a clean checkout with pinned Node/npm and `npm ci`. Run `npm run verify`,
   `npm run build`, `npm audit`, `npm pack --dry-run` and review package contents.
   All runtime dependencies must install without sibling modules or local secrets.
2. Review protocol/schema compatibility, generated diffs, provider acceptance,
   threat changes and licensing. Run the Docker smoke test on a Docker host;
   live provider evidence requires a separate unfunded authorized pilot.
3. Generate `npm run sbom --silent > artifacts/sbom.cdx.json` after creating the
   ignored artifacts directory. Review the CycloneDX inventory and advisory
   results. CI uploads the SBOM and package candidate as build evidence.
4. Update CHANGELOG/version/support notes, require maintainer review and tag the
   exact tested commit. An independent security reviewer is required before
   financial activation. Never invent code-signing, SLSA or vendor certification.
5. Once publishing is authorized, configure an approved registry/repository and
   short-lived OIDC trusted publishing with a protected environment; verify the
   actual provenance/signatures and checksums. There is intentionally no automatic
   publish workflow or stored registry token in this initial repository.

## Rollback and records

Before rolling back to a verified immutable image, check that its schema and
authorization rules are compatible. Keep admitted attempts and check uncertain
outcomes; rollback can't revoke a signature or erase financial history.
The kit has no deployed database migration to reverse. Pin/review dependency and
OCI/action updates rather than using floating `latest` tags. CI artifacts are
retained for 14 days as candidate evidence, not a long-term audit archive.
