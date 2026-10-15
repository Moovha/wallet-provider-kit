# Moovha Wallet Provider Kit

Embed provider-hosted wallets into your product while your application controls
who can use them and which actions they may take. This TypeScript package and
HTTP service connects onboarding, owner consent and approved stored actions to
a signing backend you choose.

Adopters choose their wallet backend, key control and recovery model. Applications
including Moovha can request scoped wallet access without receiving the provider's
keys. See [wallet access and Moovha scope](docs/moovha-scope.md) for the distinction
between non-custodial application access and exclusive end-user self-custody.

**Experimental · 0.1.0 · unpublished.** Explore locally without credentials.
Production custody acceptance is pending; see [verification](docs/verification.md).

[Getting started](docs/package.md) · [Integration tutorial](docs/integration-example.md) ·
[API guide](docs/api.md) · [Documentation](docs/README.md) ·
[Adoption assessment](docs/adoption-assessment.md) · [Security](SECURITY.md)

## Install as a package

Use Node **24.22.0** and npm **11.11.1**. Build a tarball from a reviewed checkout:

```sh
git clone https://github.com/Moovha/wallet-provider-kit.git
cd wallet-provider-kit
npm ci
npm run pack:local
```

In your own application directory:

```sh
npm install /absolute/path/to/moovha-wallet-provider-kit-0.1.0.tgz
node node_modules/@moovha/wallet-provider-kit/examples/inspect-api.mjs
```

Expected output: `{ live: 200, ready: 503, openapi: '3.0.3' }`. The example runs
in-process without a provider or financial effects. Readiness stays unavailable
until your host supplies reviewed authorization and recovery.

Use focused imports in an ESM application:

```js
import { createServer } from '@moovha/wallet-provider-kit/http';

const app = await createServer();
await app.listen({ host: '127.0.0.1', port: 8080 });
```

Open [Swagger UI](http://127.0.0.1:8080/docs/). You can also run
`npx --no-install wallet-provider-kit` after installation, or `npm run build`
then `npm start` in this checkout. These start the unconfigured inspection server.
For the complete offline authenticated provider flow, run `npm run example:provider`
in this checkout or follow the [step-by-step tutorial](docs/integration-example.md).

The [package guide](docs/package.md) covers TypeScript, exports, installation
constraints and configuration ownership. npm publication remains disabled.

## Choose your integration

| You want to…                                                   | Start here                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Add new-user login, consent, identity review and wallet access | [Onboarding guide](docs/onboarding.md) and [one typed configuration](docs/provider.config.example.ts)                                           |
| Connect an existing financial host and signing backend         | [Provider guide](docs/provider-guide.md) and [durable attempts](docs/durable-attempts.md)                                                       |
| Select a backend                                               | [CDP profile](docs/provider-guide.md#current-adapter-profile), [OWS](docs/ows-adapter.md), [OpenZeppelin Relayer](docs/openzeppelin-relayer.md) |
| Consume the HTTP contract from another language                | [Implemented OpenAPI](spec/provider-api.json), served at `/openapi.json`                                                                        |
| Run the service and local monitoring with Docker               | [Operations](docs/operations.md) and [Dockerfile](Dockerfile)                                                                                   |
| Understand the code and standards                              | [Architecture](docs/architecture.md) and [repository map](docs/README.md#repository-map)                                                        |

Public package paths include `/core`, `/http`, `/onboarding`, `/identity`,
`/telemetry` and the three backend adapters. Root convenience imports remain
available. No application needs to import internal source files.

## Who controls what

| Role                                    | Responsibility                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Your team (the host)                    | Choose key control/recovery, run the provider, verify current permissions and keep durable attempt records |
| Wallet owner                            | Approve access and actions through your consent policy                                                     |
| External orchestrator, including Moovha | Request permitted actions and coordinate execution/settlement                                              |

OAuth scopes alone never grant spending authority. Your host verifies current
owner, grant, KYC, consent, immutable action and durable attempt authority before
provider effects. The interface exposes no private keys or seed phrases. Custody
and recovery depend on the selected backend and operator; login doesn't establish
end-user self-custody. See the [security model](docs/security-model.md).

The onboarding profile creates accounts and manages access; its bundled journal
denies signing. Financial hosts supply their own reviewed authority and durable
journal. The reference file store supports one persistent POSIX host.

## Supported scope

The kit includes Fastify HTTP/OpenAPI, OAuth verification, onboarding and separate
OIDC enrollment, signing/authority interfaces, a durable-journal wrapper and
optional OTLP telemetry. Backend adapters are experimental and have explicit
supported profiles and acceptance limits in their guides.

The [orchestration draft](spec/orchestration-draft.json) is a reference contract;
full Moovha orchestration, sponsorship and settlement aren't implemented here.
Mainnet, contract accounts, WalletConnect and ERC-1271/4337/7702 are unsupported.
Relayer execution is a separate library profile; generic transaction HTTP routes
remain unsupported. Prefer a maintained wallet engine that meets your custody
needs and use this kit for the host authorization boundary around it.

## Contribute

See [contributing](CONTRIBUTING.md), [governance](GOVERNANCE.md),
[code of conduct](CODE_OF_CONDUCT.md), [branch workflow](docs/branch-workflow.md)
and [release process](docs/releases.md). Run `npm run verify` and
`npm run check:package` before proposing a package change.

[Related projects](docs/related-projects.md) explain reuse choices;
[the adoption assessment](docs/adoption-assessment.md) compares the human-facing
setup with Viem, ethers and OpenZeppelin Relayer and records remaining gaps.

This follows [Moovha's](https://moovha.com) wider focus on helping people get paid,
save and spend across Southern Africa. [Apache-2.0](LICENSE); see [NOTICE](NOTICE)
and [provenance](docs/extraction.json). [Changelog](CHANGELOG.md).
