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

Work on main unless the owner requests another branch. Stage only intended work,
inspect the staged diff and run the secret scan before a signed-off commit.
Keep this repository local/unpublished until the owner authorizes a remote or
release. A commit/push never authorizes deployment, funds movement or credential
rotation. Keep secrets only in ignored local environment files or a secret store.
