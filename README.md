<a href="https://moovha.com/"><img src="./docs/public/brand/moovha-logo.svg" alt="Moovha home" width="80" height="80"></a>

# Moovha Wallet Provider Kit

**Build a blockchain wallet service that lets applications request transactions on behalf of your users.**

Wallet Provider Kit is a configurable wallet service and TypeScript toolkit for
teams building and operating blockchain wallets for their users. Rooted in Moovha's
work with blockchain payments and decentralised finance (DeFi), it makes access
to on-chain assets such as USDC and ZARP easier to integrate into everyday products.
It brings account creation,
application-led access, account provisioning and approved-action signing into one toolkit. OWS stores the private owner signer for each user Safe. You define who may use an account
and retain responsibility for key control and recovery.

<figure class="wallet-visual">
  <img src="./docs/public/diagrams/service-composition.svg" alt="Wallet service architecture: the HTTP API authenticates requests, the policy layer checks current authority against durable storage, and the wallet backend signs only admitted actions after a recorded attempt and permission recheck." width="1200" height="820" decoding="async">
  <figcaption>The HTTP API, policy, storage and signing layers work together to protect wallet operations. OAuth scopes alone never authorize spending.</figcaption>
</figure>

[View full-size architecture](docs/public/diagrams/service-composition.svg)

In the standard application-led flow, users remain in the connected application.
That application authenticates them, completes the required identity checks and
records their wallet-access consent. It requests access on their behalf using
its authenticated API client and a user assertion. Under an explicit trust agreement,
the provider checks identity evidence, consent, current policy and permission limits,
then stores a revocable grant. It does not require a second user login or routine
staff review. Applications never receive private keys or seed phrases.

Read the [application-led access contract](docs/application-access.md) for user
binding, evidence, permissions, revocation and limits. Required fields or an OAuth
scope alone do not establish identity or spending authority.

Connected applications are expected to cover the blockchain network fees, often
called **gas**, for the supported actions they request. When a provider connects
its wallets to Moovha with user approval, Moovha takes that sponsorship role for
admitted operations. Providers should be able to integrate without building their
own gas-funding rail or asking users to keep a separate gas-token balance.
The [assets and gas guide](docs/assets-and-gas.md) explains this project-supported
rail, the application's obligations and the current implementation boundary.

[Documentation](https://moovha.github.io/wallet-provider-kit/) ·
[Get started](docs/README.md) ·
[Operator wizard](docs/setup-wizard.md) ·
[Application management](docs/runtime-workspace.md) ·
[Services and credentials](docs/operator-services.md) ·
[Run locally](docs/local-setup.md) · [Deploy the export](docs/operator-deployment.md)

## Deploy first, connect applications afterward

Install a wallet provider with **zero connected applications**. Establish
administrator access, then register applications and configure their trust,
action policies, services and sponsorship through the console or protected APIs.
Installation needs no application RPC credentials, gas funding or external login
provider. Wallet operations start disabled.

The [installation guide](docs/provider-installation.md) describes local, Linux
server and AWS template paths. Reviewed release bundles use prebuilt containers
and Docker Compose; operators do not need Node, npm, Git or a source build.
Check [available releases](https://github.com/Moovha/wallet-provider-kit/releases)
for published artifacts. The package remains experimental and unpublished to npm.

For contributor evaluation from source, use Node **24.22.0**, npm **11.11.1** and Git:

```sh
git clone https://github.com/Moovha/wallet-provider-kit.git
cd wallet-provider-kit
npm ci
npm run build
npm start -- setup
```

The bundled graphical setup follows three stages:

1. **Choose where to run:** this computer, an existing Linux server or the AWS template.
2. **Review your setup:** provider identity, retained storage, network exposure and
   defaults. Application configuration waits until connection.
3. **Start and sign in:** source setup can build an isolated local
   container service; release installers use pinned prebuilt images. Read the
   private installation claim file to establish the administrator.

Claiming is protected, expires after 30 minutes and succeeds once. Restart does
not reopen registration. The persistent `/admin/` console and provider API manage
application registrations, identity trust, suspension, credential rotation and
automation identities. Management availability is separate from wallet execution
readiness. See [installation and administration](docs/provider-installation.md),
[application obligations](docs/application-obligations.md) and
[maintenance and recovery](docs/provider-maintenance.md).

The bundle includes the OWS owner-signer engine, SQLite, the private Alto bundler,
durable Valkey queues and Caddy HTTPS configuration. Each user receives a Safe;
accepted application sponsorship funds its execution. Registration does not grant
identity trust or spending authority. Provider acceptance and current owner,
grant, KYC, consent, immutable action and durable attempt checks remain required.

The **Advanced configuration** editor retains the explicit static configuration
path. Its [six configuration screens](docs/setup-wizard.md) and bundled API
reference are available for reviewed source integrations. The default installation
flow does not require registering a first application. Container/cloud acceptance
and production custody acceptance remain separate from offline checks.

## Who takes part

Your team is the **wallet provider**: it operates the wallet service for its users.
The server application in which you run the toolkit is called the **host**.

| Term                      | What it means here                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Account owner**         | The user your service records as owning a wallet account. They sign in and approve wallet access within the connected application. Also called the wallet owner; this doesn't by itself say who holds the private keys. |
| **Connected application** | Software, such as Moovha, that requests access to an owner's account through your wallet service. In OAuth configuration and API authentication, its registration is called a **[client](docs/concepts.md)**.           |
| **Host authority**        | Your host's permission-checking code and stored records. Together they decide which owner and application may use an account, and which exact action is approved now.                                                   |
| **Wallet backend**        | The wallet engine or signing service your host connects to. It creates or locates accounts and signs approved actions; its key-control and recovery model determines custody.                                           |

Your product may contain both a wallet service and an application that calls it;
the responsibilities still remain distinct. The [concepts guide](docs/concepts.md)
maps these names to configuration, API fields and the user's consent screen.

For your next step, follow the [operator getting-started guide](docs/README.md).
For provider integration details, use the [provider guide](docs/provider-guide.md).

The [approved contract-call guide](docs/approved-contract-calls.md) explains per-user Safe accounts, explicit call consent, operation limits and verified outcome scopes.

## A foundation for adopting teams

Operators can run `wallet-provider-kit setup` to configure supported deployments
through the [FormKit setup wizard](docs/setup-wizard.md), then run automated local
container setup or export configuration and a deployment checklist. No application
code is needed for this setup path.

The standard path is **configure, deploy and consume the API**. Use validated installation settings for OWS owner signing and SQLite storage,
then manage application trust and policy through durable runtime APIs.
The kit supplies consent, grants, account recovery, approved Safe calls
and durable signing coordination. Start with [service setup](docs/setup.md).
Embedded host composition uses the same Safe execution contract.

The kit is for a team that wants to provide wallets as part of its own product,
or make its wallet service available to other applications. Your users interact
with the connected application’s login, identity and consent experience. Your host decides which
connected applications can request access, which accounts they can use and which
actions they may perform.

The supplied service uses application-led access with personal and shared Safe wallets per verified user.
The original Personal wallet remains the default. See [multiple wallets and members](docs/multiple-wallets.md)
for wallet selection, member permissions and independent application consent.
Application trust, spending policy and recovery remain under your team's control.

Deploy the configured provider service and connect your product through its API.
The toolkit can also be embedded as a Node.js package for advanced integrations.
Its OpenAPI contract also lets applications written in other languages use the implemented service routes.

<figure class="wallet-visual">
  <img src="./docs/public/diagrams/application-relationship.svg" alt="The account owner approves access within the connected application. The application sends authenticated requests and user evidence to provider policy checks; the chosen backend creates accounts and signs approved actions without sharing keys." width="1200" height="830" loading="lazy" decoding="async">
  <figcaption>The application handles the user experience; the provider service enforces access and keeps durable authority records.</figcaption>
</figure>

[View full-size relationship diagram](docs/public/diagrams/application-relationship.svg)

Your team configures the authority and backend shown inside the service boundary.
For the supported service, the kit supplies the permission checks and durable records.
The backend's control and recovery model determines custody; connecting an
application doesn't transfer the wallet's keys to it.

## How wallet access works

The application reads the provider's access policy and submits its stable user ID,
accepted identity evidence and recorded consent for the current policy revision.
The provider grants access only to an explicitly trusted application when those
checks pass. Grants have specific permissions and an expiry. User IDs are scoped
to the application: matching names or IDs in different applications do not link
wallets. The application implements withdrawal and calls the grant-revocation API.
See [application-led access](docs/application-access.md).

When an application requests an action, the host resolves the caller to the
account owner and checks current access, consent and identity-verification
status against stored records. These are provider checks, not fresh consent prompts.
For signing, it also loads the exact **approved action**: an instruction
stored by the host after authorising its exact content and limits. It records an
**attempt**, the identity of this execution that retries must preserve, before
the backend is called. The application references a stored action;
it doesn't submit arbitrary bytes for the service to sign.

The user grants `contracts:request` consent in the application for the exact
`action_policy_revision`. The application shows the permitted calls and limits,
then submits approved atomic batches through the wallet-call API. The provider
checks current authority, reserves bounded paymaster sponsorship and signs the
immutable SafeOp before private bundler submission. See [wallet calls](docs/wallet-calls.md).

The **journal** is the private, persistent record of attempts, their state and
their results. The toolkit's journal wrapper coordinates the backend call,
verifies its result and saves it through that journal. An authorised retry can
then receive the saved result without repeating account creation or signing.
If a response is lost, the original attempt stays pending or unknown until the
host can establish what happened; this is called **reconciliation**. Current
permission is checked again before returning a stored success. Ordinary application
logs don't replace the journal. See [attempts and recovery](docs/durable-attempts.md).

This separates the user's access consent, the host's authority and the backend's signing
responsibility. **OAuth scopes** are named permissions on an application's access
token. They allow a request to reach the host's policy checks. Spending authority
also requires the current account owner, the application's **grant** (its stored,
expiring access permission), Know Your Customer (**KYC**) status, user consent,
the unchanged approved action and the recorded attempt. The [provider guide](docs/provider-guide.md)
and [security model](docs/security-model.md) explain that contract.

The signing path below shows a new successful attempt. An authorised retry uses
the stored result; a pending or unknown attempt requires reconciliation.

<figure class="wallet-visual">
  <img src="./docs/public/diagrams/approved-signing.svg" alt="Successful signing: authenticate the caller, authorize the exact stored action, claim a durable attempt, recheck permission, sign and verify, then persist and return the permitted result. Pending or unknown attempts require reconciliation." width="1200" height="962" loading="lazy" decoding="async">
  <figcaption>Current authority and a durable dispatch claim protect signing. Retries preserve the original attempt and recheck permission.</figcaption>
</figure>

[View full-size signing diagram](docs/public/diagrams/approved-signing.svg)

## Where it fits in Moovha

Moovha's foundations are on-chain transfers, swaps and access to DeFi through
assets such as USDC and ZARP. These wallets hold blockchain assets and authorise
transactions involving token and vault contracts. A simple product experience
still needs to make the asset, network, approval and fees clear.

Wallet Provider Kit lets independent wallet providers connect their services to
applications such as Moovha. The provider checks access and signs approved actions
while keeping Safe owner keys within its private OWS vault.

Learn about [Moovha](https://moovha.com/) and explore the
[Moovha GitHub organization](https://github.com/Moovha).

Moovha's business-operation API coordinates transaction intent,
sponsorship, execution and settlement. Device-wallet backup and recovery are separate application responsibilities. The [architecture guide](docs/architecture.md)
explains the provider boundary and application access.

Gas sponsorship is part of that integration design: the connected application
funds eligible network fees while the provider retains wallet control and checks
the user's authority. It does not require sharing keys with the application.

Non-custodial application access describes Moovha's relationship to the wallet's
keys. Exclusive end-user self-custody depends on who can actually control and
recover the chosen backend. Explain that control and recovery model to your users.

## What is available today

The package includes a wallet service and signing interfaces, a journal-backed
provider wrapper, application-led access management and optional hosted compatibility onboarding, OAuth token
verification, generated OpenAPI and optional OpenTelemetry monitoring.

[Open Wallet Standard](docs/ows-adapter.md) stores the private Safe owner signers.
The private Alto bundler and application verifying paymaster supply the only user
execution flow. Each user receives their own Safe address for deposits and calls.

The current version, **0.1.0**, is experimental and available from source rather
than npm. You can configure account access and provisioning, and execute approved
Safe contract calls, swaps and vault deposits on **Base mainnet or Base Sepolia**.
Start with the [setup guide](docs/README.md); application connection follows deployment.

Your first deployment stays disabled while you test your backend, application
permissions and recovery. The supported runtime uses one active POSIX host with
persistent [SQLite storage](docs/storage.md). Production custody acceptance and
funded mainnet acceptance remain pending. USDC and ZARP illustrate the wider project's
asset use cases; verify the exact network-specific token contract and signing domain before
configuring transfers.

## Configure your wallet service

Separate installation settings from application runtime policy. Choose the
provider's final HTTPS identity and retained storage during deployment. Claim
administration, then register applications when they connect. Use the console or
API to accept identity/consent trust and configure permitted owner actions.

Applications register action payloads, service credentials and bounded gas
sponsorship through protected APIs. Provider operators accept the resources and
prepare funding and bundler/paymaster infrastructure separately. User assets stay
in individual Safes. Follow the [application setup sequence](docs/application-obligations.md).

The [getting-started guide](docs/README.md) covers installation. The [advanced
configuration reference](docs/setup-wizard.md) documents static source setup.

## Connect and operate

After deployment, give your application developer the provider origin, token
registration and [HTTP contract](docs/http-api.md). Applications read your current
policy, submit identity and consent evidence, receive a revocable grant and
provision the wallet. Optional signing and execution need their own explicit
permissions and accepted policies. The [access guide](docs/application-access.md)
describes this sequence; the [staging walkthrough](docs/staging-walkthrough.md)
helps you test it with your own services.

An authorization signature, transaction submission, verified chain result and
business settlement describe different outcomes. Applications fund the verifying
paymaster and private bundler for the [Safe execution flow](docs/user-operation-execution.md).
Select Base mainnet or Base Sepolia and complete acceptance for the selected chain.
Applications use the account wallet endpoint; no raw-signature endpoint is exposed.

## Extend the service

Use the [developer API guide](docs/api.md) for reviewed host composition and the
[TypeScript declarations](docs/api-reference.md) for exact interfaces. Embedded
hosts use the same Safe/bundler/paymaster flow. These interfaces are optional;
they are not prerequisites for wizard setup.

## Contribute

Use [GitHub issues](https://github.com/Moovha/wallet-provider-kit/issues) for bugs
and integration questions. Contributions follow the [contributor guide](CONTRIBUTING.md),
[governance](GOVERNANCE.md) and [code of conduct](CODE_OF_CONDUCT.md).
Report vulnerabilities through [SECURITY.md](SECURITY.md). See the
[changelog](CHANGELOG.md) and [release process](docs/releases.md) for version history.

[Apache-2.0](LICENSE). See [NOTICE](NOTICE) and [source provenance](NOTICE).
