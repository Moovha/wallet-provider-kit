# Check your integration

Use these checks after [connecting your backend](backend-guide.md) and
[integrating host authority](provider-guide.md). Keep acceptance evidence with your
deployment/release records. This guide describes what to prove, not a historical
record of a particular development checkout.

<figure class="wallet-visual">
  <img src="./public/diagrams/operations-and-evidence.webp" alt="Diagram: telemetry is separate from private approvals, attempt results and recovery evidence; monitoring has no signing authority." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>Collect deployment evidence separately from observability. Offline checks do not certify a live backend.</figcaption>
</figure>

[View full-size diagram](public/diagrams/operations-and-evidence.webp)

Start with the automated tests, then collect evidence for your actual deployment.
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

Before you enable an integration, keep evidence for these cases:

- [Onboarding/access](onboarding.md): real provider login, browser-bound PKCE and
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

Offline tests cover the cases they exercise. The onboarding profile supplies a
private single-host file store and provisioning journal; verify its filesystem,
backup and crash behavior in your deployment. Existing financial hosts still
supply their production authority and financial journal. The CLI starts unconfigured,
and live CDP evidence is limited to the isolated exercise below. Full operation orchestration,
sponsorship, settlement and device recovery each need their own implementation
and acceptance evidence.

## Isolated CDP staging exercise 16 October 2026

This was an engineering harness, not the [supported staging operator workflow](staging-walkthrough.md).
It has been stopped; its wallets and recovery records are retained. Full configured
deployment acceptance remains incomplete. Do not use the results below to bypass
the GUI export, supplied CLI or real dependency checks in that workflow.

A local macOS HTTPS deployment using advanced host composition exercised the real
CDP API and persistent toolkit SQLite storage. It created two unfunded accounts,
confirmed zero Base Sepolia native balances, and tested application access,
cross-client/object denial, missing tokens/scopes, owner/reviewer isolation, CSRF,
pause/revocation, reconnection and changed-policy denial. Concurrent provisioning,
durable replay, process restart and a stopped database backup/restore retained the
original account without additional creation calls.

For the second account, the acceptance transport deliberately discarded a successful
CDP creation response. The unknown attempt stayed blocked across restart. A reviewer
then recovered the original account through authenticated read-only CDP lookup;
replaying the original attempt returned that account without another creation.

The exercise found and fixed two defects: browser form submissions lost their
`Origin` under `Referrer-Policy: no-referrer`, and CDP account names exceeded its
36-character maximum. Browser regression coverage now exercises consent, provider
review and revocation, while the CDP fixture checks the documented naming constraint.

This is limited live provisioning/recovery evidence, **not provider certification**.
Login used a synthetic local OIDC issuer with real code/PKCE/JWKS/token verification;
identity evidence used an explicitly synthetic adapter. The exercise did not
establish a configured Didit test workflow or real identity acceptance.
External owner login/application registrations, live identity sharing/review,
wizard-export deployment, public TLS/hosting, grant-expiry timing and live signing
remain acceptance gaps. No signing, funding, broadcast, gas sponsorship or settlement
was performed. Keep those checks separate from this result.

[Download the sanitized acceptance record](./public/acceptance/cdp-staging-2026-10-16.json).

The [Relayer profile](openzeppelin-relayer.md) adds offline contract fixtures for
configured-account binding, typed signing, transaction admission, provider-ID
replay/status, fee-policy restrictions, cross-relayer denial and uncertain
dispatch. These fixtures are not a running Relayer/Redis/RPC system. Prove the
pinned daemon and real queue/recovery behavior before readiness. Its nonce-owning
execution profile does not claim draft `SubmitTransactionAction` conformance or
prove financial settlement.
