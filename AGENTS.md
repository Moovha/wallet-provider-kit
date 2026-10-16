# Wallet Provider Kit contributor instructions

This directory is an independent repository. Do not depend on sibling checkouts
for installs, tests or releases. Read README.md, docs/provider-guide.md and
SECURITY.md before changing provider or financial boundaries. Keep code readable,
typed and formatted with Prettier; preserve unrelated local work.

Never infer spending authority from OAuth scopes alone. The host must verify
current owner, grant, KYC, consent, immutable action and durable attempt authority
before provider effects. Keep the default service unconfigured and fail closed.
Never add a generic signing, key-export or legacy-custody endpoint. Exchange and
Moovha deployments are outside this repository's release authority.

Use ephemeral offline fixtures. No live credentials, keys, financial mutations,
provider account creation or database DDL in routine tests. Database-backed
adapters require verified current schema evidence before implementation. Do not
log request bodies, signatures, raw URLs, authorization headers or identifiers.

Run npm run verify, npm run build, npm audit and npm pack --dry-run before delivery.
Generated contracts must match npm run generate:spec. Review generated diffs;
never label the orchestration reference as implemented or claim provider
certification from mocks. Docker/live-provider checks must be reported separately.

Use codex/toolkit for the owner's ongoing work. Fetch and merge origin/main before
starting changes; preserve unrelated work and never force-push. Push this branch
and open/update its PR to main. Follow docs/branch-workflow.md: auto-merge waits
for successful checks and an empty contribution/review queue. Other contributors'
PRs require review; do not merge them through this automation.

Stage only intended work, inspect the staged diff and run the secret scan before
a signed-off commit. The owner authorized public hosting at
https://github.com/Moovha/wallet-provider-kit. Keep npm publication disabled until separately authorized. A commit/push never authorizes
deployment, funds movement or credential rotation. Keep secrets only in ignored
local environment files or a secret store.

Before every commit and push, apply docs/public-writing.md to all new or changed
public language, including walkthroughs, examples, UI text, code comments,
generated descriptions, changelog entries, commit messages and PR titles/bodies.
Identify each artifact's audience and purpose, then read it as someone without
this chat, local workspace or development history. Rewrite session narration,
owner/agent instructions and vague change-relative wording into self-contained
tasks, contracts or concrete changes. Preserve accurate security and capability
limits; do not imply certification or readiness from fixtures. Edit generator
sources rather than generated prose alone. Review the staged diff and proposed
commit message before committing; review outgoing commits and the final PR text
before pushing or publishing. Record the audience/purpose review in the PR's
Evidence checklist. Formatting and automated checks do not replace this review.

Toolkit documentation delivery includes updating the existing GitHub Pages site.
The owner has given standing authorization for that documentation publication.
After checks pass and the changes reach main through the repository's merge
process, run the Publish documentation workflow on main and verify the updated
live pages. Report publication status alongside the commit and PR. This applies
only to the documentation site; application deployments and npm releases remain
separately authorized.
