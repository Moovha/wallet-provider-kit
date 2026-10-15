# Build your wallet service

Wallet Provider Kit helps your team operate wallets for users and make approved
wallet actions available to connected applications. You choose the backend and
key-control model; the toolkit connects onboarding, application access and signing
under your host's authority.

New to these terms? Start with [roles and concepts](concepts.md): account owner,
host authority, wallet backend, connected application/client, approved action and
journal. It also shows how application registrations appear in configuration,
tokens and the owner's consent screen.

## Follow the integration path

1. **[Install the package](package.md).** Build a reviewed tarball, install it in
   your application and inspect the unconfigured API.
2. **[Run the provider walkthrough](integration-example.md).** Follow an authenticated
   request through account creation, signing, replay, revocation and recovery limits.
   The [examples index](../examples/README.md) distinguishes runnable fixtures from
   configuration templates.
3. **[Connect your wallet backend](backend-guide.md).** Choose an existing adapter
   or implement the signing interface. Identify which component owns the journal.
4. **[Integrate your host](provider-guide.md).** Existing stored-action hosts can use
   the [supplied backend lifecycle](stored-backend.md). Connect current owner, grant,
   consent and KYC policy, approved actions, durable storage and recovery.
   If you need a new-user access flow, use [onboarding](onboarding.md) and its
   [typed configuration](provider.config.example.ts).
5. **[Check your integration](conformance.md).** Exercise denial, concurrency,
   restart and uncertain-result behavior before enabling a backend.
6. **[Run and monitor the service](operations.md).** Configure HTTP lifecycle,
   ingress, readiness, telemetry and operational recovery.

## API reference

- [API guide](api.md): choose interfaces and understand authority and errors.
- [TypeScript reference](api-reference.md): public declarations by import path.
- [HTTP guide](http-api.md) and [schema reference](http-reference.md): authentication,
  scopes, request/response shapes and retry decisions.
- [Implemented OpenAPI](../spec/provider-api.json): the service contract.

## Integration guides

- [Coinbase CDP](backend-guide.md#coinbase-cdp): app-controlled test-network backend.
- [Open Wallet Standard](ows-adapter.md): local wallet engine and operator-held vault.
- [OpenZeppelin Relayer](openzeppelin-relayer.md): configured signers and separate execution profile.
- [Stored-action host backend](stored-backend.md): supplied account/recovery/signing lifecycle for existing authority ports.
- [Durable attempts](durable-attempts.md): claims, results, replay and reconciliation.
- [OIDC Identity Assurance enrollment](enrollment.md): an alternative for hosts
  with their own identity acceptance flow; choose this or bundled onboarding.
- [Architecture](architecture.md) and [security model](security-model.md): wallet
  control, application access and the implemented provider boundary.

## Contribute and maintain

Use [Contributing](../CONTRIBUTING.md), [security reporting](../SECURITY.md),
[governance](../GOVERNANCE.md), [branch workflow](branch-workflow.md) and
[release preparation](releases.md). [NOTICE](../NOTICE) and
[extraction.json](extraction.json) retain the source attribution and licensing provenance.

## Repository map

| Location                                     | Purpose                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `src/index.ts`, `src/core.ts`, `src/http.ts` | Public package entry points                                            |
| `src/backend.ts`                             | Supplied lifecycle for stored-action host integrations                 |
| `src/domain/`                                | Wallet authority, signing, enrollment and execution contracts          |
| `src/service/`                               | HTTP composition, authentication, schemas and telemetry                |
| `src/onboarding/`, `src/identity/`           | Owner access, consent, review and identity verification                |
| `src/providers/`                             | Backend adapters and attempt handling                                  |
| `src/protocol/`, `spec/`                     | Generated types, implemented API and separate reference action schemas |
| `examples/`                                  | Runnable offline examples with replaceable backend/host fixtures       |
| `docs/provider.config.example.ts`            | Typed onboarding configuration template                                |
| `ops/`                                       | Local monitoring configuration                                         |
| `test/`, `scripts/`, `.github/`              | Tests, generated-reference checks and contributor tooling              |
| `dist/`                                      | Generated JavaScript/declarations included in the package              |
