# Security policy

## Supported versions

The source is public and experimental, with no npm release. No release is
approved for production custody or funds. Only the latest experimental minor
is planned to receive fixes; no stable release support is offered yet.

## Report a vulnerability

If you've found a vulnerability, use
[GitHub private vulnerability reporting](https://github.com/Moovha/wallet-provider-kit/security/advisories/new).
Reports are visible to the repository's security maintainers, not public issues. Share the affected version or commit, what could go
wrong, a safe offline reproduction and any suggested fix. Keep the report and
sensitive data out of public issues. Use dummy fixtures without accessing
others' accounts or moving funds.

A separate backup reporting contact is not configured yet. If you cannot use
GitHub reporting, open an issue asking for a private contact without including
vulnerability details or sensitive data.

We'll review the report, coordinate disclosure with affected vendors and publish
a fix or advisory when ready. We don't offer a guaranteed response time or bug
bounty. If a credential is exposed, its owner is responsible for rotating it.

See the [security model](docs/security-model.md) and
[release checks](docs/releases.md). Offline tests establish neither an audit nor
provider certification.
