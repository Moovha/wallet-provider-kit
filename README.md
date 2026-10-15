# Moovha Wallet Provider Kit

TypeScript library and HTTP service for entities embedding wallets with their own
signing backend and authorization policy. External orchestration services, such
as Moovha, can request permitted actions while the deploying entity controls
signing access and enforces the wallet owner's consent.

**Experimental · 0.1.0 · unpublished.** The default service cannot provision
accounts or sign. Integration requires host-supplied durable authorization and
recovery. Production acceptance is pending; see [verification](docs/verification.md).

## Features

- Fastify service with generated OpenAPI and Swagger UI.
- OAuth JWT access-token verification and owner/KYC checks.
- Pluggable account provisioning and EIP-712 signing interfaces.
- Optional Coinbase CDP adapter for Base Sepolia EOAs.
- OpenTelemetry traces and metrics over OTLP/HTTP.

## Control model

| Role             | Responsibility                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Deploying entity | Operate the service, configure the signer, enforce authorization and retain attempt records. |
| Wallet owner     | Authorize the actions allowed by the host's consent policy.                                  |
| Orchestrator     | Request authorized actions; manage its own execution and settlement workflow.                |

The signing interface exposes no private-key or seed export. Actual custody and
recovery depend on the chosen backend; the CDP adapter uses app-controlled API-key
wallets. Deployment alone establishes neither end-user self-custody nor regulatory
compliance. See the [security model](docs/security-model.md).

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

## Integrate

Implement `EmbeddedWalletAuthority` for current owner, grant, consent, KYC and
durable attempt admission. Implement `WalletSigningProvider` for your backend,
then compose both with `EmbeddedWalletService` and `createServer`. Start with the
[provider guide](docs/provider-guide.md) and [acceptance requirements](docs/conformance.md).

[Provider OpenAPI](spec/provider-api.json) describes the implemented HTTP routes.
The separate [orchestration draft](spec/orchestration-draft.json) supplies reference
action types; full Moovha orchestration, sponsorship and settlement are not
implemented here. Mainnet, WalletConnect and ERC-1271/4337/7702 are unsupported.
Use a local build or tarball while the package is unpublished.

## Documentation

- [Architecture and standards](docs/architecture.md)
- [Operations and monitoring](docs/operations.md)
- [Contributing](CONTRIBUTING.md) · [Governance](GOVERNANCE.md) · [Code of conduct](CODE_OF_CONDUCT.md)
- [Security reporting](SECURITY.md) · [Release process](docs/releases.md)
- [Changelog](CHANGELOG.md) · [Provenance](docs/extraction.json)

## License

[Apache-2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
