# Governance

Moovha is the project steward. Brandon Musa
([BossBuusMuus](https://github.com/BossBuusMuus)) is the initial maintainer.
GitHub private vulnerability reporting is available. A backup maintainer and
out-of-band reporting contact remain open maintenance tasks; see the
[release process](docs/releases.md).

## How we make decisions

We review proposals and pull requests for compatibility, security, licensing and
operating cost. For significant decisions, we record the reasoning and
alternatives and seek agreement with affected implementers. The steward resolves
release decisions when agreement isn't possible, recording dissent and safeguards.

Signing adapters implement the host's authorization policy. Vendor behavior must
not redefine who may authorize an action. Production changes to financial or
security boundaries require independent competent review.

New maintainers are nominated based on sustained reviewed contributions and
appointed through a public governance change. Maintainers review weekly dependency
update proposals, triage advisories and record unresolved exceptions with an
owner and expiry. No response-time SLA or enterprise support is offered.

## Versioning and support

The 0.x API is experimental. Breaking changes increment the minor version and
require migration notes and compatibility review; patches preserve public
behavior. At 1.0, follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and define a tested deprecation window.

Only the latest experimental minor is planned to receive fixes. Public support
begins after publication. See [SECURITY.md](SECURITY.md) for vulnerability reporting
and [CONTRIBUTING.md](CONTRIBUTING.md) for review requirements.
