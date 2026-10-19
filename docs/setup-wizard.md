# Configure your wallet service in the wizard

Your wallet service needs a public identity, a signing backend, trusted
applications and durable records. The wizard brings those choices together in
six steps, in the order you configure them. Users authenticate and consent within
the connected application; your service evaluates its evidence under the policy
you define here.

Start from [getting started](README.md#open-the-wizard) to install and open the
wizard. Keep its terminal running and use the complete private session link.
FormKit is bundled and needs no Pro subscription. The service is experimental,
single-host, with selectable Base mainnet or Base Sepolia; production custody acceptance remains pending.

## Complete the six steps

You are editing a local draft. Changes reach a service only after you export and
deploy them. Expand **Why do I need this? Where do I get it?** beside a setting for
its purpose and source. Setup generates stable wallet environment and bundled
client IDs, supplies private storage paths and standard credential variable names,
and derives token endpoints from your public origin. These settings are collapsed
under **Advanced** controls; keep their defaults for a first deployment. Secret
values are generated privately for bundled services or supplied during deployment
for external services.
Incomplete drafts cannot be saved. Import a previously exported configuration to
resume, and keep the page open until you validate and export.

![Provider setting instructions](public/screenshots/provider-guidance.webp)

## 1. Provider

Applications need a stable address to call, and users need to identify the team
responsible for their wallet. Enter your service name, public HTTPS origin and
privacy notice. The wizard configures these details; arrange the domain, HTTPS
and published notice yourself.

Use an origin such as `https://wallet.your-company.com`, without a path or trailing
slash. It becomes part of the persisted service binding. Keep it stable for an
existing deployment and plan any change as a migration. Your privacy notice should
explain actual key control, information use and recovery arrangements.
[Domain preparation](operator-services.md#provider-domain-and-privacy-notice)
explains the values and infrastructure you need.

![Provider settings](public/screenshots/provider.webp)

Continue to **Backend** to choose the account and signing system.

## 2. Backend

Your backend creates wallet accounts and signs approved actions. Choosing it also
chooses a control and recovery model: who holds credentials or a vault, how an
account is found after a lost response, and what must survive a host failure.

Keep the recommended bundled **Open Wallet Standard** backend, or choose
**Coinbase CDP** or an existing **OpenZeppelin Relayer** service.
Prepare the selected backend using [backend services and credentials](operator-services.md#choose-one-wallet-backend):

- **CDP:** supply its Secret API Key ID, matching key secret and project Wallet
  Secret privately during deployment. Standard variable names are prefilled under
  **Advanced CDP credential variables**. Accounts are created later through the API.
- **OWS:** keep the supplied vault settings. Setup includes the pinned native
  engine, creates the private vault and generates a missing owner passphrase. Keep coordinated vault/database/secret backups;
  use the [OWS guide](ows-adapter.md) for supported platforms and recovery.
- **Relayer:** connect an existing service and enter verified, distinct signer-pool
  entries. Each accepted account reserves one signer. The
  [Relayer guide](openzeppelin-relayer.md) explains capacity and acceptance.

The wizard generates a stable, non-secret **backend binding** for this environment.
Its override is under **Advanced wallet environment settings**. Retain the saved
value across credential rotations and restarts. Never replace a binding or assigned signer to
retry an uncertain operation. These configured account backends target Base
Sepolia EOAs; choosing one does not activate transaction submission or sponsorship.

![Wallet backend configuration](public/screenshots/backend.webp)

Continue to **Services** to configure application authentication.

## 3. Services

The provider must identify which application is calling before evaluating access
to a user's wallet. An OAuth token issuer supplies that application identity;
your service verifies its tokens with public keys.

Keep **Bundled token service** for automatic application registrations and
five-minute tokens. The issuer, audience and JWKS URL derive from Provider.
Keep the default access, account-reading and provisioning API scopes. Additional
scopes are under **Advanced application API permissions**; setup generates each
application's missing secret privately.
Name the application and record its trust agreement in Policies; its client ID
is generated automatically.
See [bundled setup](bundled-setup.md).

For **Connect an existing authorization server**, configure **Application token
issuer**, **Wallet API audience** and **Token verification keys URL (JWKS)**. Copy the exact values from your authorization
server. Register a separate API client for each application you will admit in
Policies. Tokens must follow RFC 9068, including `typ: at+jwt`, `client_id`, the
required scopes and a lifetime of at most 600 seconds. The
[token registration guide](operator-services.md#register-the-application-api-and-clients)
explains every required claim; the [Auth0 recipe](auth0-setup.md) demonstrates
registration and the mapping back to these fields.

The token authenticates the application. Its user assertion, checked under your
trust agreement in Policies, binds the user and attests identity and consent.
Wallet users stay within the application throughout this process.

If you later enable staff token controls in Deployment, return here to configure
**Optional staff login**, then choose **Continue in Deployment**. The
[staff login registration](operator-services.md#register-owner-login) is separate
from application API clients and applies only to those staff tools.

![Application token service connections](public/screenshots/services.webp)

Continue to **Applications** to decide what authenticated applications may request.

<span id="_4-policies"></span>

## 4. Applications

An authenticated application needs your explicit trust before it can attest a
user's identity or request wallet access. Policy defines that relationship and
the limits that apply to every request. The wizard configures the supplied rules;
you do not write policy code.

Keep **Access flow → Application-led access (standard)**. Set **Required identity
level** and **Required identity fields (one per line)** using the names and level
agreed with your applications. Lowercase names such as `country` identify fields.
Presence alone does not prove KYC or restrict acceptable countries: the agreement
defines which checks the application must perform.

Review **Maximum age of identity checks** (initially 90 days) and **Maximum access
duration** (initially seven days). **Policy version** starts at `1` under
**Advanced policy metadata**. Grants end sooner when submitted identity evidence or consent expires.
The [access-policy controls](application-access.md#configure-the-trust-policy)
explain how these settings constrain requests and which rules require custom code.

Under **Connected applications**, enter each application's name. Bundled client
IDs are generated once and displayed for integration; their overrides are under
**Advanced application identity**. With an existing issuer, enter the client ID
registered there. The issuer comes from Services. Select its permitted actions, enter
the **Application identity and consent trust agreement** reference and review
**Application access enabled**. Applications' user IDs are isolated by issuer and
client; matching names or email addresses do not link wallets across applications.

For example, a policy requiring `verified` identity and `country`, with evidence
at most 30 days old and access at most three days, can allow an application to
read accounts. It must supply current consent and the required verified evidence.
It cannot request transfers merely because account reading is permitted. The
[access contract](application-access.md) shows the resulting requests, grants,
renewal and withdrawal process for your application developer.

### Application configuration after connection

The default profile prebundles a shared application Safe engine. Application action
policies, off-chain fields and enums, gas sponsorship and RPC credentials are
registered through protected APIs after deployment. The provider reviews and
manages each application's resources with its separate operator credential.
The bundled issuer generates that operator identity; an existing issuer needs an
exact operator issuer, client ID and subject binding.

Follow [application obligations](application-obligations.md) to accept resources,
prepare the sponsor, expose its funding address and provision the Safe after gas
is available. User assets remain in individual wallets. No Safe or sponsor is
created by the wizard. Identity baseline controls are under **Provider identity
baseline and access duration**; these establish provider trust requirements,
while runtime policies constrain each application's requested actions.

Imported deployments without shared application Safes retain their optional
transfer, per-user Safe and separate-executor configuration controls. See the
[financial profile reference](setup.md#supported-financial-policy) for those
compatibility profiles.

## 5. Deployment

Your service needs to preserve accounts, grants and attempts through restarts.
Keep the supplied `.provider-data` directory, host port `8080` and Caddy gateway
for one persistent POSIX host. Local setup prepares storage and uses
`0.0.0.0:8080` inside the container automatically. **Advanced deployment settings**
contains directory, listen-address, port and gateway overrides; change the host
port if it is already occupied. The native service defaults to `127.0.0.1`. Keep the service's
public origin from Provider behind HTTPS ingress. The
[storage guide](storage.md) explains backup and single-active-host recovery.

### API explorer and staff token controls

Enable **Enable deployed API explorer and Try it out** if you want Swagger on your
provider's HTTPS origin. The local **API reference** previews schemas without
sending requests; deployed Try it out makes actual API calls. Follow
[API exploration](#explore-the-provider-api) and [live testing](http-api.md#try-deployed-apis)
when connecting your application.

Optionally enable **Enable application token controls for staff**. Configure
staff login through the Services shortcut and return to Deployment. Enter an
explicit operator subject allowlist, select applications, secret variable names
and scope limits. [Staff token controls](operator-tokens.md) explains how authorized
operators obtain and renew application tokens. This login serves staff tools;
wallet-user identity and consent still come from the connected application.

### Execution and sponsorship

The default deployment includes the private local execution engine, reviewed Safe
1.4.1 infrastructure pins and an empty application execution configuration. There
are no sponsor addresses, RPC subscriptions or contract allowlists to enter here.
Applications supply these resources after connecting; follow the
[post-deployment sequence](application-obligations.md#prepare-gas-sponsorship-and-the-shared-safe).

The provider controls the application Safe signer and enforces user authority.
Application-specific RPCs verify chain state and submit transactions. The shared
Safe queues calls by nonce, with separate user grants and consent. Imported
compatibility configurations continue to expose their existing execution controls.

### Activation

Keep **Enable wallet operations in this configuration** off for the first
deployment. Complete backend and recovery acceptance before enabling it. Transfer
signing in compatibility profiles also needs token acceptance. Shared application
execution additionally requires reviewed resource declarations, accepted application
policy, working application RPCs and a funded sponsor after connection. Enter references to your actual test reports.
The wizard does not run those tests or verify report contents. Use the
[staging walkthrough](staging-walkthrough.md) and [acceptance checklist](conformance.md)
to plan isolated tests before admitting users.

![Deployment settings](public/screenshots/deployment.webp)

Continue to **Export** to validate and prepare the deployment.

## 6. Export

Review the backend, application permissions, identity requirements, financial
terms and activation state together. **Validate configuration** checks completeness
and consistency. Resolve errors in the named step and field, then validate again.
Validation does not test external credentials, identity checks or recovery.

### Set up and run locally

For OWS, CDP or an existing Relayer, choose **Check local setup prerequisites**. If tools are
missing or stopped, review the proposed machine changes and choose **Install
local runtime and continue**. Follow its progress and complete any Homebrew or
Docker prompts outside the browser. Once the deployment plan opens, review the
private directory and local port. Bundled credentials are generated privately;
supply any missing external-service secrets and choose
**Start local setup**.

Setup saves private files, the OWS vault mount and the selected Caddy HTTPS profile,
builds the image, validates, initializes new storage,
runs diagnostics and starts the container. **Local service running · wallet
operations disabled** is the expected initial result. The
[local setup guide](local-setup.md) explains runtime installation, progress,
interruption recovery and saved operating commands. Starting setup locks this
session's configuration; subsequent changes use reviewed maintenance.

### Download for manual deployment

Download all three files:

| File                   | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `provider.config.json` | Settings and policy loaded by the service; import it to edit later. |
| `provider.env.example` | Secret variable names; supply values privately on the host.         |
| `provider-setup.md`    | Deployment checklist and commands for the selected configuration.   |

Follow [manual deployment](operator-deployment.md) for native OWS, a final host or
your own deployment process. Build the same toolkit revision and keep private
configuration outside the source checkout. The service does not automatically
load `.env`; use the checklist's explicit environment loading or your secret manager.
Editing settings after validation requires another validation before export.

![Validated configuration and exports](public/screenshots/export.webp)

### Test, activate and connect

Add HTTPS, supervision and encrypted backups in either deployment path. A disabled
service returns liveness 200 and readiness 503. Complete the
[staging walkthrough](staging-walkthrough.md), record backend/recovery evidence,
then import, review and export explicit activation in Deployment. Isolated activated
tests may be required before wider admission. Local startup health is not external
acceptance.

Give your application developer the origin, token registration and
[HTTP contract](http-api.md). Their integration reads policy, submits user evidence
and consent, obtains a grant, provisions accounts and communicates withdrawals.
For later changes, import the saved configuration and follow
[maintenance and backups](operator-deployment.md#backups-and-configuration-changes).
Policy changes can invalidate grants and financial consent. Preserve stored
accounts and attempts; never reinitialize to retry uncertain work.

## Explore the provider API

Choose **API reference**. The local preview uses your settings and sends no API
calls. All documented JSON provider API endpoints are visible by default, including
transfer signing, transaction event reports, hosted compatibility and advanced OIDC
enrollment. **Not enabled** marks missing configuration and explains the prerequisite;
showing an endpoint does not enable it. Search by path, action or scope to narrow
the view and its OpenAPI download. The configured setup service does not enable
the separate advanced OIDC enrollment profile.

Begin with **Read access policy and evidence requirements**. The application obtains
the current policy revision and required evidence, records the user's consent in
its own platform, submits a user assertion, receives a grant when policy passes,
then creates or accesses the wallet. See the complete
[application-led contract](application-access.md), including fictional JSON examples.

Example revisions, timestamps, IDs and evidence are placeholders. Replace them
with current records before testing. Schemas and example responses are not live
service results or approvals. Signing returns an authorization signature; the
connected application arranges sponsor funding and selects its execution rail. The
optional [execution coordinator](execution.md), configured in Deployment, signs
internally, submits once and independently verifies chain status.
Transaction event reports remain unverified observations. See
[signing, submission and event reporting](http-api.md#signing-and-transaction-submission).

![Local API preview](public/screenshots/api-reference.webp)

The **Open deployed Try it out** link opens the actual service's `/docs/` page.
Enable documentation, export and deploy before using it. Execute sends a real request:
POSTs may create records, create wallets or issue usable signatures. Start with
public discovery, then read policy with an application token. Preserve the original
idempotency key for retries and investigate unknown outcomes before repeating work.
See [HTTP testing](http-api.md#try-deployed-apis).

![Actual discovery response from an offline fixture](public/screenshots/api-live.webp)

### Optional application token controls

Deployment offers **Enable application token controls for staff**. Configure optional
staff login in Services, allowed staff account IDs, applications, secret variable
names and scopes. The deployed **Application tokens** panel can get or renew tokens
without exposing client secrets. These controls still enforce ordinary application
trust and current wallet authority. See [operator tokens](operator-tokens.md).

## Resume and privacy

Import the saved configuration to resume. An existing hosted export remains hosted;
import does not migrate its user ownership or grants. Do not change an occupied
deployment's access mode or reinitialize it to bypass the migration fence. Refer to
[compatibility and migration](application-access.md#hosted-compatibility-and-migration).

Keep exports private. They contain policy and variable names, not secret values.
Do not share API explorer screenshots containing tokens, personal data or signatures.

## Optional adapters and gas starting values

In **Deployment**, select the approved EVM execution profile and enable the
contract-call policy when using existing accepted Safe accounts. **Optional policy
adapters** offers token-transfer, swap and vault forms. Leave them empty for
generic calls. Native-recipient configuration remains an advanced configuration
option.

Token rules accept a registered pin, recipient list and per-transfer amount in
base units. If an ERC-3009 policy is configured, **Prefill from ERC-3009 policy**
copies its known token, recipients and maximum; cumulative accounting stays off
until you select it. Its starting cumulative amount uses the matching ERC-3009
limit when known, otherwise the per-transfer amount. Verify and edit it before
export. Unknown token amounts, addresses and hashes remain blank.

**Use compatibility routes as optional adapters** copies configured swap/vault
routes with distinct adapter IDs while retaining the compatibility routes. It
does not run automatically. Imported adapter terms, implementation pins and
amounts remain intact until edited. Removing the last adapter removes that
optional setting without changing generic contract permissions or gas budgets.

Gas sponsorship has separate forms. Starting values are 500,000 gas, a 3 gwei
maximum fee, 1 gwei priority fee, 0.000001 ETH L1 reserve and 0.01 ETH lifetime
budget. These editable test-network values are not live fee estimates or funded
balances. Review current network conditions and the application funding agreement
before activation. **Use suggested test-network gas limits** explicitly restores
these amounts; importing a configuration never applies them over saved values.

New sponsors select the first eligible application without a sponsor, when one
exists. Another sponsor for the same application prefills its existing gas limits
and funding-agreement reference; its account ID and binding remain distinct.
Sponsors in a pool share the application gas ledger and the lowest configured
ceiling. Review pool selection and bindings before validation/export. Unknown
funding agreements and externally managed addresses require operator input.

Use ETH/gwei fields for ordinary editing or expand **Advanced gas values in wei**.
Conversions retain integer precision; invalid precision blocks a valid export
instead of retaining an earlier amount. The cost summary describes admission
limits, not a remaining balance. Changing configuration never refunds recorded
usage, resets an asset allowance or transfers funds.
