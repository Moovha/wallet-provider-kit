# Security policy

This repository is an experimental, unpublished foundation. No release is
approved for production custody or funds. The latest experimental minor is the
only planned supported line; public release support starts after publication.

Do not disclose vulnerabilities, customer data, secrets or exploit credentials
in public issues. During local preparation, contact Brandon Musa through the
existing private project channel. Before making the repository public, the owner
must enable GitHub private vulnerability reporting and publish its verified link
and a backup reporting contact here. No public URL or email is invented yet.
**Publication is gated on that setup.**

Include affected version/commit, impact, safe reproduction and suggested
mitigation. Use dummy/offline fixtures; do not test others' accounts or move
funds. Maintainers should acknowledge and triage promptly, coordinate disclosure
with affected vendors and publish a fix/advisory when ready. No guaranteed SLA or
bug bounty is offered. Rotate any exposed credential through its owner; never
include values in the report history or a patch.

See docs/security-model.md for trust boundaries and docs/releases.md for release
checks. Do not infer an audit, certification or vendor acceptance from CI.
