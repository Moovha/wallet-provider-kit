# Moovha Wallet Provider Kit

Apache-2.0 reference library and HTTP service for wallet providers implementing a
reviewed signing backend. Fastify serves the API, Swagger UI presents its contract,
and OpenTelemetry exports operational signals to existing monitoring systems.
No custom dashboard, wallet GUI, login system or cryptography protocol is required.

**Experimental, unpublished 0.1.0 foundation.** This is not production custody
software or a provider certification. The standalone CLI exposes documentation
and health/discovery endpoints; signing stays unavailable until a host supplies
reviewed durable authority. The optional CDP adapter admits only Base Sepolia
EIP-712 actions. No exchange deployment, customer account or funds are changed.

## Quick start

Use Node **24.22.0** and npm **11.11.1**, then:

```sh
npm ci
npm run verify
npm run build
npm start
```

Open [Swagger UI](http://127.0.0.1:8080/docs/) or retrieve
[OpenAPI](http://127.0.0.1:8080/openapi.json). Health is at `/health/live`;
`/health/ready` intentionally returns 503 without a reviewed integration.
Use `npm run dev` while editing. No credentials are needed for these commands.

| Surface                                                           | Implemented here                           | Activation requirement                                                   |
| ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Fastify HTTP, Swagger UI, strict request schemas, Problem Details | Yes                                        | Local startup                                                            |
| OAuth JWT access-token verification                               | Yes, using jose                            | Existing trusted issuer/audience/JWKS; no token issuer included          |
| Provision/sign handlers and current owner/KYC guards              | Yes, dependency injected                   | Durable authority, consent and attempt recovery supplied by host         |
| CDP named EVM accounts and exact EIP-712 signing                  | Offline tests pass                         | Isolated credentials and unfunded live recovery drill; Base Sepolia only |
| OpenTelemetry traces/metrics → Grafana                            | OTLP export tested; Docker recipe included | Existing collector or local Docker; container smoke test pending         |
| Moovha operation orchestration, sponsorship, settlement           | Draft reference only                       | Remains in Moovha DeFi Scope 1–3                                         |
| WalletConnect, key export, mainnet, ERC-1271/4337/7702            | Not implemented                            | Separate reviewed profiles and acceptance evidence                       |

## Provider integration

Read [the adapter and authority contract](docs/provider-guide.md),
[architecture and standards](docs/architecture.md), and
[conformance requirements](docs/conformance.md). Providers can use their own
HSM/MPC/vendor signer behind `WalletSigningProvider`; no seed or private-key
interface is required. The CDP factory has its own package export (`./cdp`) and is
not imported by the CLI. An external hosting arrangement is not proof of user
self-custody; key control and recovery must be disclosed separately.

The implemented service contract is [spec/provider-api.json](spec/provider-api.json),
generated from actual Fastify route schemas. It uses OpenAPI 3.0.3, a maintained
Fastify plugin path. The separate OpenAPI 3.1.1
[orchestration snapshot](spec/orchestration-draft.json) is a versioned **reference**
from Moovha's business API design, not a list of implemented routes. This service
must not replace or be mounted over the Moovha public operation API.

## Operations and contribution

- [OpenTelemetry and Grafana setup](docs/operations.md)
- [Threat model and security boundaries](docs/security-model.md)
- [Contributing and DCO](CONTRIBUTING.md), [governance](GOVERNANCE.md), [conduct](CODE_OF_CONDUCT.md)
- [Security reporting](SECURITY.md), [release and publication gates](docs/releases.md)
- [Local verification evidence](docs/verification.md)
- [Change log](CHANGELOG.md), [extraction provenance](docs/extraction.json)

The local repository has no public remote. `private: true` prevents accidental
npm publication. Public hosting, maintainer handles, private security reporting
and release permissions must be configured before publication. Existing capacity
and open-source tooling are the default; nothing here creates a paid subscription.

Licensed under [Apache-2.0](LICENSE). See [NOTICE](NOTICE) for provenance and the
rights-holder's authorization. Dependencies retain their own licenses.
