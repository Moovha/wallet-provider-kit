# Governance and maintenance

Moovha is the initial project steward. Brandon Musa is the initial owner/contact
for the local unpublished repository. Public GitHub handles, security contacts
and backup maintainers must be verified before publication; none are fabricated
in CODEOWNERS. This is not a foundation or multi-vendor standards body.

Decisions should be recorded in reviewed issues/design proposals with rationale,
alternatives, compatibility, security and operating cost. Maintainers seek
consensus with affected providers; unresolved release decisions belong to the
steward and must record dissent and safeguards. A vendor cannot silently redefine
business authorization through its adapter. New maintainers are nominated based
on sustained reviewed contributions and added through a public governance change.

Before public hosting, configure CODEOWNERS with verified maintainers, protected
main, required CI/review, least-privilege Actions, private vulnerability reporting
and recovery access for a backup maintainer. Weekly dependency update proposals
are configured; maintainers triage advisories promptly and document unresolved
exceptions with owner/expiry. No response-time SLA or enterprise support is
promised at this experimental stage.

The 0.x API is experimental. Breaking changes require a minor version, migration
notes and an explicit compatibility review. Patches preserve public behavior.
At 1.0, apply Semantic Versioning, publish supported profiles and define a tested
deprecation window. Only the latest experimental minor receives fixes for now.
No public release or support commitment exists until publication gates are met.
