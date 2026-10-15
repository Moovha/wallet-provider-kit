# Provider conformance and adoption

The automated suite is a reference test foundation, not certification. It runs
without live credentials and uses unfunded ephemeral keys. `test/embedded-wallet.test.ts`
exercises the CDP adapter through a mocked HTTP boundary with real JWT/EIP-712
cryptography; `test/service.test.ts` exercises RFC 9068 verification, current KYC,
two client/owner isolation, body/idempotency validation and sanitized outcomes.
`test/telemetry.test.ts` captures actual OTLP exports locally;
`test/startup.test.ts` verifies unsafe/incomplete configuration fails without
credential disclosure. No test creates a
vendor account or moves funds.

For each new backend, add equivalent fixtures against its public adapter seam.
Record adapter/version, environment, account/key-control profile, supported chains,
action kinds, signature encoding, payload limits, recovery method and submission
ownership. Do not advertise a profile based only on a vendor SDK method name.

Before enabling an integration, retain evidence for:

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

A passed offline suite establishes only the behavior it exercises. The default
CLI remains unconfigured, CDP is not yet vendor-certified, and no durable
production authority adapter is supplied. Moovha's full operation, sponsorship,
settlement and device acceptance remain in their owning rollout scopes.
