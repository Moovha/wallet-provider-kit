# Configure your wallet service in the wizard

Your wallet service needs a public identity, a signing backend, trusted
applications and durable records. The wizard brings those choices together in
six steps, in the order you configure them. Users authenticate and consent within
the connected application; your service evaluates its evidence under the policy
you define here.

Start from [getting started](README.md#open-the-wizard) to install and open the
wizard. Keep its terminal running and use the complete private session link.
FormKit is bundled and needs no Pro subscription. The service is experimental,
single-host and Base Sepolia only; production custody acceptance remains pending.

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

Continue to **Policies** to decide what authenticated applications may request.

## 4. Policies

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

### Delegated transfer signing

Enable **Configure delegated transfer signing** when applications should request
token transfers within user-approved limits. Enter the verified token contract,
signing-domain name/version, symbol and decimals. Choose allowed recipients,
per-transfer and lifetime amounts in integer base units, and authorization validity.
The [financial profile reference](setup.md#supported-financial-policy) explains
the exact ERC-3009 contract and budget behavior.

Allow `transfers:request` only for intended applications. They must present the
current transfer terms to the user and attest consent to that policy revision.
Signing creates a usable authorization; it does not broadcast, fund gas or confirm
a transfer. You choose optional coordinated execution in Deployment.

### Runtime contract policies

Enable **Runtime configuration** when applications should register contracts and
methods after deployment. The bundled issuer generates a separate operator client
ID, derives its issuer and subject, and registers it automatically. Inspect or
override the identity under **Advanced operator identity**. With an existing
issuer, enter the externally registered operator issuer, client ID and subject. The [runtime workspace](runtime-workspace.md) explains operator
access, contract proposals, publication and automatic registration review through
`/operator/`. The [runtime API](runtime-configuration.md) supplies the developer
contract and the additional opt-ins needed for financial use.

For approved contract calls, allow `contracts:request` for intended applications;
configure their Safe bindings and execution mechanism in Deployment. Every
financial policy revision requires current user consent before new effects.

### Existing hosted deployments

**Provider-hosted access (compatibility)** retains provider login, consent pages
and staff review for deployments that need them. Use the [hosted guide](onboarding.md)
for that configuration and its optional [application-record evaluation](application-records.md).
Its login/vendor connections are configured in Services. Do not switch an occupied
store's access mode to bypass its [ownership migration requirements](application-access.md#hosted-compatibility-and-migration).

![Application registrations and access policy](public/screenshots/policies.webp)

Continue to **Deployment** to choose storage, API tools and execution.

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

Choose coordinated execution if the service should sign internally, dispatch
through an application sponsor and verify chain results. The connected application
arranges sponsor funding; [assets and gas](assets-and-gas.md) explains that role.

Keep the bundled local engine selected in Services. For transfers, its local profile is selected automatically; setup creates encrypted sponsor keys and bindings. Configure independent RPC sources, gas budgets and funding before activation. Existing designated services and direct Relayer connections remain optional. The [transfer execution guide](execution.md) covers sponsors, independent
RPC sources, fixed gas limits, budgets and outcome meanings. The
[designated service guide](execution-service.md) explains its separate deployment,
provider ID/revision and service-key environment references. The wizard configures
the wallet side; it does not deploy that dispatcher.

For contract calls, choose **Approved EVM actions through designated service**
and enable **Approved contract-call policy**. Configure pre-existing Safe 1.4.1
account bindings, code pins and allowed functions. The existing swap/vault
fields configure optional compatibility request builders. Generic native-recipient
and operation-adapter terms currently use reviewed configuration/API fields. The
[approved-call guide](approved-contract-calls.md) explains those requirements and
how they connect to `contracts:request` consent in Policies. The wizard does not
create or fund Safe accounts.

Optional execution settings support [Safe queues and sponsor pools](safe-queue-and-sponsor-pools.md),
[stuck-transaction detection and recovery](stuck-transactions-and-recovery.md),
[bounded fee replacements](automatic-replacements.md) and
[payer events and health](payer-events-and-health.md). Configure only the features
your execution service supports. Automatic replacement is not selected for the bundled local engine. Replacement requires the
[fee-only Relayer build](fee-only-relayer.md); ordinary Relayer is insufficient.
[Standard wallet calls](wallet-calls.md) uses the runtime-authorized Safe queue.
[Account-abstraction helpers](account-abstraction-sponsorship.md) do not enable
ERC-4337 signing or submission in the configured service.

### Activation

Keep **Enable wallet operations in this configuration** off for the first
deployment. Complete backend and recovery acceptance before enabling it. Transfer
signing also needs token acceptance; coordinated execution needs execution/RPC/
submission recovery acceptance. Enter references to your actual test reports.
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
