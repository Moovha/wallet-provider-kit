# Contributing

You can help with docs, fixes, tests or signing adapters. If you're new to the
project, a small documentation improvement is a good place to start. Follow the
[code of conduct](CODE_OF_CONDUCT.md); report vulnerabilities through
[SECURITY.md](SECURITY.md).

## Propose a change

For bugs, include the version, expected behavior and an offline reproduction.
If your change affects authorization, custody, public schemas, capabilities or
dependencies, start a design discussion so we can review compatibility, security
and cost together.

Use GitHub issues for proposals and pull requests for changes. The owner's ongoing
work uses the [toolkit branch workflow](docs/branch-workflow.md). Other
contributions use separate branches and receive review before merging.
See [SECURITY.md](SECURITY.md) for private vulnerability reports.

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

For docs and user-facing explanations, follow our
[writing guide](docs/writing-guide.md). Keep the reader's next step clear and
separate working features from proposals.

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
