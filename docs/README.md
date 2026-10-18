# Set up your wallet service

Your wallet service connects applications to accounts while retaining control over
which requests reach the signing backend. The setup wizard brings those choices
into six steps: **Provider → Backend → Services → Policies → Deployment → Export**.
Follow them in order. Each section below introduces the decision and links to its
fields and supporting information.

Users sign in, complete identity checks and approve wallet access within the
connected application. Your service checks its attestations against your policy
and stores limited, revocable access. You configure that relationship in Policies
as part of the same setup.

The current service is experimental and supports one active POSIX host on Base
Sepolia. Production custody acceptance and mainnet support remain pending. You
can explore the wizard without external credentials. The recommended setup supplies
the wallet engine, application token service, private execution engine, durable
storage and HTTPS gateway. Record your provider domain, policies and application
gas funding agreements through the wizard.

<span id="install-and-open-the-local-wizard"></span>

## Open the wizard

Install Node **24.22.0**, npm **11.11.1** and Git on your workstation. Check
`node --version` and `npm --version`, then run:

```sh
git clone https://github.com/Moovha/wallet-provider-kit.git
cd wallet-provider-kit
npm ci
npm run build
npm start -- setup
```

The command opens a private local browser session or prints its complete URL.
Keep the terminal running; Ctrl+C ends the session. FormKit is bundled and needs
no Pro subscription. The kit is available from source, not npm. The
[package guide](package.md) covers installing a reviewed tarball instead.

Expand **Why do I need this? Where do I get it?** beside a setting for field help.
Keep the supplied internal IDs, storage paths and credential variable names;
advanced controls expose their overrides. Supply external-service secret values
privately during local deployment or through your deployment's secret store. Import a saved
`provider.config.json` to resume. Incomplete drafts cannot be saved, and refreshing
or closing the browser loses unsaved edits.

## 1. Provider

Applications need a stable address for your API, and users need to know who
operates their wallets. Enter your provider name, public HTTPS origin and privacy
notice. The origin becomes part of the stored account binding, so choose the
address you intend to retain.

Follow [Provider fields](setup-wizard.md#_1-provider) and
[domain preparation](operator-services.md#provider-domain-and-privacy-notice).
[Roles and terms](concepts.md) explains provider, application, account and owner.

## 2. Backend

Choose the service or engine that creates accounts and signs permitted actions.
This choice determines who controls keys, how credentials are protected and what
you must preserve to recover an account.

Keep the recommended bundled OWS engine or select an existing service in
[Backend fields](setup-wizard.md#_2-backend). See
[backend choices](operator-services.md#choose-one-wallet-backend). Each profile
has its own recovery and operating requirements. Keep its environment binding
stable across restarts and credential rotations.

## 3. Services

Your API needs to identify each calling application. Keep the bundled OAuth token
service: setup registers enabled applications and generates credentials privately.
The provider origin determines the issuer, audience and public-key URL.
Keep the bundled **OpenZeppelin Relayer and Valkey** local execution engine
selected too. Local setup starts it automatically on private networks, with
persistent queues and generated credentials. Configure approved-action policies,
RPC verification and gas budgets before enabling spending. Setup creates encrypted
local sponsor keys when those policies are configured. Existing authorization
servers and execution services are optional. See [bundled setup](bundled-setup.md).

Follow [Services fields](setup-wizard.md#_3-services) and the
[token registration requirements](operator-services.md#register-the-application-api-and-clients).
For an existing issuer, the [Auth0 recipe](auth0-setup.md) demonstrates a compatible registration. Optional
staff login is needed only if you later enable staff token controls in Deployment.

## 4. Policies

Authentication identifies an application; your policy determines what it may do
for a user. Register each application's client ID and reviewed identity/consent
trust agreement. Choose required evidence, freshness, access duration and allowed
permissions. Add delegated transfer signing only when you need it.

Follow [Policies fields](setup-wizard.md#_4-policies). The
[access contract](application-access.md) connects those settings to the application's
requests, user binding, consent and revocation. For contract registrations and
policy publication after deployment, configure the optional
[runtime workspace](runtime-workspace.md) here.

## 5. Deployment

Your service must retain ownership, grants and attempts across restarts. Choose
private persistent storage and HTTP listen settings. Decide whether to enable API
testing tools and whether transactions use a supplied execution coordinator.

Follow [Deployment fields](setup-wizard.md#_5-deployment). Its supporting guides
cover [storage and backups](storage.md), [staff token controls](operator-tokens.md),
[transfer execution](execution.md) and [approved contract calls](approved-contract-calls.md).
[Assets and gas](assets-and-gas.md) explains the connected application's funding
responsibility. Keep wallet operations disabled for the first deployment.

## 6. Export

Validation checks that the settings fit together. Choose **Set up and run locally**
for CDP or Relayer, or download the configuration, secret-name template and checklist
for manual deployment. Neither validation nor a successful startup tests your
external services or proves wallet recovery.

Follow [Export fields](setup-wizard.md#_6-export), then use
[local setup](local-setup.md) or [manual deployment](operator-deployment.md).
Complete the [staging walkthrough](staging-walkthrough.md) and relevant
[acceptance checks](conformance.md) before activation. Retain the tested settings,
recovery evidence and saved operating commands.

After deployment, your application developer follows the
[access contract](application-access.md) and [HTTP guide](http-api.md).
Use the [runtime workspace](runtime-workspace.md) for enabled contract/policy
management, and [operations](operations.md) for monitoring. When changing a
running service, import its saved configuration and follow the
[deployment maintenance process](operator-deployment.md); preserve its database,
bindings and original attempt identities.

## When you need a custom integration

The wizard configures the supplied service. If you need a different backend,
storage system or financial rule, the [developer API guide](api.md),
[custom adapters](custom-adapters.md) and [offline tutorial](integration-example.md)
explain the extension interfaces. The [configuration reference](setup.md) describes
the JSON produced by the wizard. Contributor workflows are in
[Contributing](../CONTRIBUTING.md).
