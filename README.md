# Moovha Wallet Provider Kit

**Build a wallet service your users can authorise and other applications can access.**

Wallet Provider Kit is a TypeScript foundation for teams building and operating
wallets for their users. It brings account creation, user onboarding, application
access and approved-action signing into one toolkit. You choose the wallet
backend, define who may use an account, and retain responsibility for key control
and recovery.

An application such as Moovha can then work with those wallets through scoped,
owner-approved access. The wallet provider keeps control of its signing backend;
the application receives the results of permitted actions without receiving
private keys or seed phrases.

[Get started](docs/package.md) · [Integration tutorial](docs/integration-example.md) ·
[API documentation](docs/api.md) · [All documentation](docs/README.md)

## A foundation for adopting teams

The kit is for a team that wants to provide wallets as part of its own product,
or make its wallet service available to other applications. Your users interact
with your login, consent and approval experience. Your application decides which
clients can request access, which accounts they can use and which actions they
may perform.

You can start with the bundled onboarding profile for owner login, identity
review, consent and revocable application grants. If your product already has
those systems, you can connect its existing authority and records through the
public interfaces. Both approaches leave the wallet backend and the business
rules under your team's control.

The toolkit can be embedded as a Node.js package or composed into a
provider-hosted HTTP service. Its OpenAPI contract also lets applications written
in other languages use the implemented service routes.

## How wallet access works

A user establishes an account with the wallet provider and approves an
application's access. The provider records that relationship, its permissions
and its expiry. The user can later pause or revoke access.

When an application requests an action, the host resolves the caller to the
account owner and checks current access, consent and identity-verification
status. For signing, it also loads the exact approved action and admits a durable
attempt before the backend is called. The caller references a stored action;
it doesn't submit arbitrary bytes for the service to sign.

The signing backend performs the permitted effect. The journal wrapper verifies
and records its result so an authorised retry can receive the same result without
repeating the effect. If a response is lost, the original attempt stays pending
or unknown until it can be reconciled. Current permission is checked again before
returning a stored success.

This separates the user's approval, the host's authority and the backend's signing
responsibility. OAuth scopes allow a request to reach the host's policy checks;
spending authority also requires current owner, grant, KYC, consent, immutable
action and durable-attempt checks. The [provider guide](docs/provider-guide.md)
and [security model](docs/security-model.md) explain that contract.

## Where it fits in Moovha

Within Moovha's architecture, this project supplies a portable wallet/provider
implementation for the signing foundation and independent-provider integration
work. It is intended to support access to independently controlled wallets while
keeping their keys with the wallet provider.

Moovha's DeFi project owns the business-operation API, transaction intent,
sponsorship, execution and settlement. Device wallets, backup and recovery belong
to the separate client profile. The [scope guide](docs/moovha-scope.md) explains
these responsibilities and the two API directions.

Non-custodial application access describes Moovha's relationship to the wallet's
keys. Exclusive end-user self-custody depends on who can actually control and
recover the chosen backend. Adopters must describe that model accurately to
their users.

## What is available today

The package includes a wallet service and signing interfaces, a journal-backed
provider wrapper, provider-hosted onboarding and access management, OAuth token
verification, generated OpenAPI and optional OpenTelemetry monitoring.

Experimental adapters connect [Coinbase CDP](docs/provider-guide.md#current-adapter-profile),
[Open Wallet Standard](docs/ows-adapter.md) and
[OpenZeppelin Relayer](docs/openzeppelin-relayer.md). Each has a documented account,
network, key-control and recovery profile. Relayer also offers a separate
library-only execution profile.

**Experimental · 0.1.0 · unpublished.** The default service stays unconfigured.
The bundled onboarding profile manages access and provisioning; signing requires
an exact-action authority and financial journal supplied by the host. Its reference
file storage supports one persistent POSIX host.

Production custody acceptance remains pending. Mainnet, contract accounts,
WalletConnect and ERC-1271/4337/7702 are unsupported. The separate
[orchestration draft](spec/orchestration-draft.json) is a reference for DeFi's
business API; those orchestration, sponsorship and settlement routes aren't
implemented here. See [verification](docs/verification.md) and
[acceptance requirements](docs/conformance.md) for the evidence and remaining work.

## Try the complete provider flow

Use Node **24.22.0** and npm **11.11.1**:

```sh
git clone https://github.com/Moovha/wallet-provider-kit.git
cd wallet-provider-kit
npm ci
npm run example:provider
```

The offline example walks through authentication, account provisioning, approved
signing, result replay, revocation, current-KYC denial and an uncertain outcome.
It uses ephemeral fixtures, opens no listener and requires no live credentials
or funds. Follow the [tutorial](docs/integration-example.md) to understand each
step and the production integrations you must supply.

To consume the toolkit in your own application, run `npm run pack:local` and
follow the [package installation guide](docs/package.md). npm publication remains
disabled. For a new provider, continue with [onboarding](docs/onboarding.md) and
[one typed configuration](docs/provider.config.example.ts); for an existing host,
start with the [API guide](docs/api.md) and [durable attempts](docs/durable-attempts.md).

## Build with us

The [documentation index](docs/README.md) covers APIs, architecture, backend
selection and operations. The [adoption assessment](docs/adoption-assessment.md)
records how the developer experience compares with maintained public projects
and what still needs improvement.

Contributions follow the [contributor guide](CONTRIBUTING.md),
[governance](GOVERNANCE.md) and [code of conduct](CODE_OF_CONDUCT.md).
Report vulnerabilities through [SECURITY.md](SECURITY.md). See the
[changelog](CHANGELOG.md) and [release process](docs/releases.md) for project
history and release requirements.

[Apache-2.0](LICENSE). See [NOTICE](NOTICE) and [provenance](docs/extraction.json).
