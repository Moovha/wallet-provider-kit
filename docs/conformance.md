# Check your integration

Before enabling wallet operations, establish that your own backend, application
permissions and recovery process work together. Plan these checks while choosing
activation in [Deployment](setup-wizard.md#_5-deployment), then perform them after
[Export](setup-wizard.md#_6-export) in an isolated deployment. Start with the
[staging walkthrough](staging-walkthrough.md). Custom integrations also need the
host-authority and adapter checks below. Keep evidence with your private
deployment records; an offline test pass does not certify your provider.

<figure class="wallet-visual">
  <img src="./public/diagrams/operations-and-evidence.webp" alt="Diagram: telemetry is separate from private approvals, attempt results and recovery evidence; monitoring has no signing authority." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>Collect deployment evidence separately from observability. Offline checks do not certify a live backend.</figcaption>
</figure>

[View full-size diagram](public/diagrams/operations-and-evidence.webp)

Before you enable an integration, keep evidence for these cases:

- [Application-led access](application-access.md): explicit application trust,
  accepted verification level/fields, current identity and consent dates, policy
  revisions, application-scoped ownership, evidence reuse denial, grant withdrawal,
  stale-consent replay denial and unchanged wallet identity across retries. Prove
  real application attestation and recovery processes separately from fixtures.
- Optional [hosted compatibility](onboarding.md): real provider login, browser-bound PKCE and
  consent, reviewer isolation, evidence-to-owner binding, approved client/permission
  checks, current grants, superseding renewal, expiry/revocation and provider suspension.
  Prove actual vendor sharing/hosted flows, confirmed cost bounds, concurrent budget
  reservations and read-only recovery after lost import or creation responses.
- [Enrollment](enrollment.md): real provider-bound OIDC flow and consent, requested
  subject/nonce/client isolation, provider-owned acceptance, atomic nonce/identity
  persistence, lost-response recovery and current acceptance before provisioning.
- Two independent client/owner tenants, denied cross-object access and current
  consent/revocation/KYC before effects, including native proof where required.
- Exact approved action and account/domain/digest validation, expiry during awaits,
  stale revision denial, and actual signature verification; unsupported profiles
  must fail explicitly.
- Concurrent identical requests, key reuse across different resources, process
  crash before/after dispatch, provider lost response, restart/recovery and replay
  after the HTTP cache expires. Durable attempt identity must survive all cases.
- Read-only account recovery with stable opaque IDs, provider timeout/malformed
  responses, credential outage/rotation and no logging of credential values.
- Unfunded live test-network lifecycle and recovery/export drill, where the product
  supports export, with safe evidence and no secrets committed.
- Production network/TLS/pool tests, monitored operating limits, bounded budgets,
  release rollback and recovery ownership. Load tests must not use funded wallets.
- For a sponsored application integration, evidence of the application's funding
  rail, economic sponsor and actual on-chain payer, supported assets/networks and
  submission ownership. Prove full admitted step coverage with zero and existing
  personal gas balances, required approvals, eligible failures/replacements,
  bounded grants, deduplicated funding and shortfall reconciliation. Unsupported
  paths/budgets must fail explicitly before execution; sponsor exhaustion must
  not silently charge a compliant mined operation to the owner. See
  [assets and gas sponsorship](assets-and-gas.md). The toolkit's signing tests
  do not establish this application-level coverage.

Use SQLite or the private single-host file store for onboarding, and verify
filesystem, backup and crash behavior on your deployment. Financial integrations
need current authority and a persistent financial journal. The configured transfer
service supplies these for its supported profile; embedded hosts must compose
them explicitly. The default CLI starts unconfigured. Live CDP evidence is
limited to the exercise below. Business orchestration and device recovery require separate implementations.
Configured sponsorship and chain verification require their own acceptance
evidence; they do not establish downstream business settlement.

## What the offline suite establishes

Use automated checks to evaluate the toolkit’s internal contracts before collecting
evidence for your actual deployment.
The suite runs offline with temporary, unfunded keys; passing it doesn't certify
a provider. `test/embedded-wallet.test.ts`
exercises the CDP adapter through a mocked HTTP boundary with real JWT/EIP-712
cryptography; `test/service.test.ts` exercises RFC 9068 verification, current KYC,
two client/owner isolation, body/idempotency validation and sanitized outcomes.
`test/telemetry.test.ts` captures actual OTLP exports locally;
`test/startup.test.ts` verifies unsafe/incomplete configuration fails without
credential disclosure. No test creates a vendor account or moves funds.

For each new backend, add equivalent fixtures through its public adapter interface.
Record adapter/version, environment, account/key-control profile, supported chains,
action kinds, signature encoding, payload limits, recovery method and submission
ownership. Do not advertise a profile based only on a vendor SDK method name.
Use shared payload/digest/signature vectors when two adapters claim the same
profile; include success, denial and uncertain-outcome cases.

## Isolated CDP staging exercise 16 October 2026

This published evidence covers a local macOS HTTPS test using custom host
composition, the live CDP API and toolkit SQLite storage. It supports limited
conclusions about provisioning and recovery, **not provider certification** or
acceptance of the [configured-service workflow](staging-walkthrough.md).

| Area                   | Observed result                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provisioning           | Two accounts created with zero Base Sepolia native balances; concurrent calls and replay retained the original accounts without additional creation calls.                    |
| Access controls        | Missing tokens/scopes, cross-client/object access, owner/reviewer isolation and CSRF were denied; pause, revocation, reconnection and changed-policy checks were exercised.   |
| Persistence            | Process restart and stopped-database backup/restore retained account bindings and durable replay.                                                                             |
| Lost creation response | A discarded successful CDP response left the original attempt unknown across restart; authenticated read-only lookup recovered the original account without another creation. |

Login used a synthetic local OIDC issuer with code/PKCE/JWKS/token verification,
and identity evidence used a synthetic adapter. The test did not establish
external login/application registrations, live Didit/Sumsub identity acceptance,
wizard-export deployment, public TLS/hosting, natural grant expiry or live signing.
It performed no funding, broadcast, gas sponsorship or settlement. Those checks
must pass separately on your deployment before enabling the corresponding behavior.

[Download the sanitized acceptance record](./public/acceptance/cdp-staging-2026-10-16.json).

## Relayer evidence

The [Relayer profile](openzeppelin-relayer.md) has offline contract fixtures for
configured-account binding, typed signing, transaction admission, provider-ID
replay/status, fee-policy restrictions, cross-relayer denial and uncertain
dispatch. These fixtures are not a running Relayer/Redis/RPC system. Prove the
pinned daemon and real queue/recovery behavior before readiness. Its nonce-owning
execution profile does not claim draft `SubmitTransactionAction` conformance or
prove financial settlement.

## Configured-service record rehearsal 16 October 2026

A separate deployment exercised the hosted consent/review profile integrated in
[revision `1da430e`](https://github.com/Moovha/wallet-provider-kit/commit/1da430e94f3d2e8d0962bc23c70d66b0af063a71).
Configuration came from the FormKit GUI; the supplied CLI ran the service on one
HTTPS host with persistent SQLite storage. Real Auth0 owner/staff logins and
application tokens, application-supplied fictional records, explicit provider
review and live CDP provisioning produced one unfunded wallet.

Application reads, concurrent/restart replay, incomplete-record handling,
caller/scope/owner isolation, pause, fresh consent/review on reconnect, revocation
and policy-version denial passed. A consistent encrypted backup was restored
with dispatchers stopped and one authority retained; the CLI checked the store,
and the reviewer’s read-only CDP lookup found the original wallet. Its native
Base Sepolia balance remained zero. No funds moved, no financial signatures were
issued and no transactions were broadcast.

Full deployment acceptance remains **incomplete**: natural one-day expiry needs
real elapsed time, and a lost provider response after dispatch needs a reviewed
host fault mechanism. Planned restore and known-result lookup do not establish
that uncertain-outcome case or abrupt power-loss recovery. External KYC and later
application-led profiles were not accepted by this rehearsal. The deployment is
stopped with private state and encrypted backup retained.

[Download the sanitized case-by-case record](./public/acceptance/configured-records-staging-2026-10-16.json).
