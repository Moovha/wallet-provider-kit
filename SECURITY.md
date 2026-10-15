# Security policy

## Supported versions

The kit is experimental and unpublished. No release is approved for production
custody or funds. Only the latest experimental minor is planned to receive fixes;
public release support starts after publication.

## Report a vulnerability

If you've found a vulnerability, contact Brandon Musa through the existing
private project channel. Share the affected version or commit, what could go
wrong, a safe offline reproduction and any suggested fix. Keep the report and
sensitive data out of public issues. Use dummy fixtures without accessing
others' accounts or moving funds.

Before publication, the owner must enable GitHub private vulnerability reporting
and add its verified link and a backup contact here. Publication is gated on that
setup; no public reporting channel is configured yet.

We'll review the report, coordinate disclosure with affected vendors and publish
a fix or advisory when ready. We don't offer a guaranteed response time or bug
bounty. If a credential is exposed, its owner is responsible for rotating it.

See the [security model](docs/security-model.md) and
[release checks](docs/releases.md). Offline tests establish neither an audit nor
provider certification.
