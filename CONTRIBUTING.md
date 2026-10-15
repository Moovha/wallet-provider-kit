# Contributing

Use the pinned Node/npm versions in README.md, `npm ci`, and `npm run verify`.
Build with `npm run build`. Tests use ephemeral offline fixtures; do not add live
provider calls, credentials, real customer data or funded wallets. Run `npm audit`
and inspect `npm pack --dry-run` before proposing a release-related change.

Start a design discussion for changes to authority, public schema, custody,
account capabilities or dependencies. Describe the problem, compatibility and
cost impact. Keep focused pull requests with readable TypeScript, explicit
validation and failure paths. Use Prettier (`npm run format`). Update generated
spec/types with `npm run generate:spec` and review the generated diff. Add tests
for denied side effects, uncertain outcomes and supported behavior, not merely
implementation-shaped assertions.

Contributions are under Apache-2.0. Every commit must carry a `Signed-off-by`
trailer certifying the [Developer Certificate of Origin 1.1](https://developercertificate.org/).
Use `git commit -s`. This is a statement of contribution rights, not a
cryptographic signature or transfer of copyright. Do not sign for another person.
No separate CLA is currently required.

Maintainers review correctness, threat boundaries, compatibility, license and
cost before merging. CI is required. Financial/security boundary changes require
an independent competent reviewer before production release; if unavailable,
keep activation gated. Report security issues privately using SECURITY.md, never
in public issues. Follow CODE_OF_CONDUCT.md.

Documentation and tests are welcome. A backend adapter must include the evidence
matrix in docs/conformance.md and state what is untested. Dependency upgrades
must retain exact direct pins/lockfile, pass checks and include advisory/license
review; avoid silent vendor changes. Use `feat:`, `fix:`, `docs:` or `chore:` in
commit summaries. Maintainers record user-facing changes in CHANGELOG.md.
