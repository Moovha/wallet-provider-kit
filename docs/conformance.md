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
and the CDP adapter has offline test evidence only. Full operation orchestration,
sponsorship, settlement and device recovery each need their own implementation
and acceptance evidence.

The [Relayer profile](openzeppelin-relayer.md) adds offline contract fixtures for
configured-account binding, typed signing, transaction admission, provider-ID
replay/status, fee-policy restrictions, cross-relayer denial and uncertain
dispatch. These fixtures are not a running Relayer/Redis/RPC system. Prove the
pinned daemon and real queue/recovery behavior before readiness. Its nonce-owning
execution profile does not claim draft `SubmitTransactionAction` conformance or
prove financial settlement.
