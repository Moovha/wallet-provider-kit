# Contributing

Documentation, fixes, tests and signing adapters are welcome. Follow the
[code of conduct](CODE_OF_CONDUCT.md); report vulnerabilities through
[SECURITY.md](SECURITY.md).

## Propose a change

For bugs, include the version, expected behavior and an offline reproduction.
Discuss authorization, custody, public schema, capability or dependency changes
first, covering compatibility, security and cost.

While the repository is unpublished, use the existing project channel for
proposals and patches. After public hosting, use issues and pull requests.
Public contacts are a [publication prerequisite](docs/releases.md).

## Development

Use the Node/npm versions in [README.md](README.md):

```sh
npm ci
npm run verify
npm run build
npm audit
npm pack --dry-run
```

Write readable TypeScript with explicit validation and failure paths. Run
`npm run format`; after schema changes, run `npm run generate:spec` and review
the diff. Dependency changes require exact pins, lockfile and advisory/license review.

Use ephemeral offline fixtures. Test supported behavior, denied effects and
uncertain outcomes without live providers, credentials, customer data or funds.
Adapters must include [conformance evidence](docs/conformance.md) and untested cases.

Keep docs task-focused, distinguish implementation from proposals and cite primary
specifications. Follow [GitHub's README guidance](https://opensource.guide/starting-a-project/#writing-a-readme)
and [OpenSSF's documentation criteria](https://www.bestpractices.dev/en/criteria/0).

## Submit and review

Use `feat:`, `fix:`, `docs:` or `chore:` commit summaries. Include checks,
limitations and a [changelog](CHANGELOG.md) entry. Review covers correctness,
compatibility, security, licensing and cost; CI must pass. Financial/security
boundary changes require independent competent review before production release.

Contributions use Apache-2.0 and the
[Developer Certificate of Origin 1.1](https://developercertificate.org/).
Sign off every commit with `git commit -s`, only for yourself. This certifies
contribution rights, not a cryptographic signature or copyright transfer.
No separate CLA is required.
