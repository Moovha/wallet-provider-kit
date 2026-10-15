# Check your integration

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
profile; include success, denial and uncertain-outcome cases. See the
[related-project lessons](related-projects.md#apply-the-lessons).

Before you enable an integration, keep evidence for these cases:

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

Offline tests cover the cases they exercise. You'll still need a persistent
production authority adapter; none is supplied here. The CLI starts unconfigured,
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
