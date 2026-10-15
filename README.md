# Moovha Wallet Provider Kit

Build wallets into your product with a signing backend and authorization policy
you control. This TypeScript library and HTTP service lets your team connect
external orchestration services, including Moovha, while your application
enforces the wallet owner's consent and controls signing access.

**Experimental · 0.1.0 · not on npm.** You can explore the API locally without
credentials. Account creation and signing stay disabled until your application
supplies persistent authorization and recovery. Production acceptance is still
pending; see [verification](docs/verification.md).

## What you get

- Fastify service with generated OpenAPI and Swagger UI.
- OAuth access-token verification and owner/identity checks.
- Optional [user enrollment](docs/enrollment.md) with verified identity evidence
  and provider-controlled acceptance before wallet provisioning.
- Pluggable account provisioning and EIP-712 signing interfaces.
- A [journal-backed provider wrapper](docs/durable-attempts.md) for persistent claims, results and retry handling.
- Optional Coinbase CDP adapter for Base Sepolia typed signing.
- Experimental [OWS adapter](docs/ows-adapter.md) reusing an existing open-source wallet engine.
- Experimental [OpenZeppelin Relayer integration](docs/openzeppelin-relayer.md) for configured signers and host-approved queued transactions.
- OpenTelemetry traces and metrics over OTLP/HTTP.

## Who controls what

| Role         | Responsibility                                                                    |
| ------------ | --------------------------------------------------------------------------------- |
| Your team    | Run the service, configure signing, enforce permissions and keep attempt records. |
| Wallet owner | Approve actions through your consent policy.                                      |
| Orchestrator | Request permitted actions and coordinate execution and settlement.                |

The signing interface doesn't expose private keys or seed phrases. Who can
control or recover a wallet depends on your backend; the CDP adapter uses
app-controlled API-key wallets. You'll need to assess custody and compliance for
your deployment. See the [security model](docs/security-model.md).

## Quick start

Use Node **24.22.0** and npm **11.11.1**:

```sh
npm ci
npm run build
npm start
```

Open [Swagger UI](http://127.0.0.1:8080/docs/) or
[OpenAPI](http://127.0.0.1:8080/openapi.json). No credentials are required.
`/health/live` returns 200; `/health/ready` returns 503 until an integration is
configured. Use `npm run dev` for development and `npm run verify` for checks.

## Connect your backend

Your application supplies two interfaces:

- `EmbeddedWalletAuthority` checks the current owner, grant, consent and
  identity-verification status, and records an attempt before signing.
- `WalletSigningProvider` connects your signing backend.

Wire both into `EmbeddedWalletService` and `createServer`. Start with the
[provider guide](docs/provider-guide.md) and [acceptance requirements](docs/conformance.md).
For an orchestrator requesting a wallet for a new user, add `EnrollmentService`
and your durable `EnrollmentAuthority`. Identity evidence and user consent are
checked before your provider accepts enrollment; acceptance grants no signing rights.

[Provider OpenAPI](spec/provider-api.json) describes the implemented HTTP routes.
The separate [orchestration draft](spec/orchestration-draft.json) supplies reference
action types; full Moovha orchestration, sponsorship and settlement are not
implemented here. Mainnet, contract accounts, WalletConnect and ERC-1271/4337/7702
are unsupported.
Relayer execution is a separate library profile; the draft's nonce-bound
transaction actions and generic transaction HTTP routes remain unsupported.
Use a local build or tarball while the package is unpublished.

Prefer a maintained wallet engine that fits your custody and recovery needs.
This kit supplies the host authorization boundary around it. The
[OWS integration](docs/ows-adapter.md) demonstrates that approach with real offline
signing. The [Relayer integration](docs/openzeppelin-relayer.md) delegates queue,
nonce and broadcast work to OpenZeppelin. Both need your reviewed persistent host
integration before deployment.

## Why we're building this

Wallets should fit the people and organisations using them. That means clear
permissions, understandable approvals and integrations that work with existing
systems. Your team should be able to connect an orchestrator without handing it
your signing keys.

This follows [Moovha's](https://moovha.com) wider focus on helping people get paid,
save and spend across Southern Africa.

## Documentation

- [Architecture and standards](docs/architecture.md)
- [Related projects and lessons](docs/related-projects.md)
- [Operations and monitoring](docs/operations.md)
- [Contributing](CONTRIBUTING.md) · [Governance](GOVERNANCE.md) · [Code of conduct](CODE_OF_CONDUCT.md)
- [Branch and merge workflow](docs/branch-workflow.md)
- [Security reporting](SECURITY.md) · [Release process](docs/releases.md)
- [Changelog](CHANGELOG.md) · [Provenance](docs/extraction.json)

## License

[Apache-2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
