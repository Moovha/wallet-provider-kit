# Configure your wallet service in the wizard

Use the wizard to prepare the settings your wallet service will load when you
deploy it. Each field becomes part of that configuration: which backend creates
wallets, how applications authenticate, what evidence permits access and where
the service stores its records. You are configuring a local draft throughout
the six steps.

At the end, **Validate configuration** checks that draft for completeness and
consistency. Then choose **Set up and run locally** for an automated CDP/Relayer
container deployment, or download all three files for manual deployment:

| File                   | What you use it for                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `provider.config.json` | The service settings and policy your server loads. Import this file into the wizard to edit it later.                         |
| `provider.env.example` | A template listing secret variable names. Supply their values privately on the deployment host or through its secret manager. |
| `provider-setup.md`    | A deployment checklist with preparation tasks and CLI commands for your selected settings.                                    |

The [local executor](local-setup.md) saves private files, builds the Docker image,
initializes new storage once, diagnoses and starts the service with progress and
health results. It detects missing runtime components and offers installation with
progress before continuing to the deployment plan. Manual downloads are
ready for the [deployment steps](operator-deployment.md). Validation alone does not
check credentials, test external integrations or deploy a service. Wallet operations start only
after you deploy, complete acceptance tests and explicitly enable them. Editing
or downloading a draft does not change an existing deployment.

Application-led access is the standard flow: users sign in, complete identity
checks and approve access inside the connected application. The provider accepts
its attestations under the trust agreement and policy you configure.

## Open the wizard

Use Node 24.22.0 and npm 11.11.1. From the repository:

```sh
npm ci
npm run build
npm start -- setup
```

Keep the terminal running and open its complete local session link. The wizard is
bundled and needs no FormKit Pro subscription. The service remains experimental,
single-host and Base Sepolia EOA only, with production custody acceptance pending.

## Before you begin

Prepare a provider hostname and privacy notice, a wallet backend and application
token issuer. Agree which applications may attest identity and consent, what checks
they must perform and which fields your policy needs. See
[services and credentials](operator-services.md). No provider user login, reviewer
account or identity-vendor credential is needed for application-led access.

## Understand a setting before entering it

Fields explain the expected value and its source. Expand **Why do I need this?
Where do I get it?** for more detail. Secret fields take deployment variable names,
not secret values. The separate local setup plan collects missing values privately
when you start a deployment. Keep the session open until configuration is complete:
downloads become available only after validation in Export. Incomplete drafts
cannot be saved; refreshing or closing the page loses unsaved edits. Import a
previously exported file to resume.

![Provider setting instructions](public/screenshots/provider-guidance.webp)

## Complete the six steps

| Step       | Decision you are making                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Provider   | How applications identify and reach your service.                                                        |
| Backend    | Which existing service or engine creates wallets and signs approved actions.                             |
| Services   | How the provider connects to token, login and identity-vendor services.                                  |
| Policies   | Which access flow and identity requirements apply, which applications are trusted and what limits apply. |
| Deployment | Where the server listens and stores private records, and which features it enables.                      |
| Export     | Validate, review and start a local container deployment, or download files for manual setup.             |

### 1. Provider

Enter your service name, stable public HTTPS origin and privacy notice. Users
remain in the application; the provider origin is the address that application
calls. A hostname is not created or hosted by the wizard.

![Provider settings](public/screenshots/provider.webp)

### 2. Backend

Choose Coinbase CDP, Open Wallet Standard or OpenZeppelin Relayer. Supply the stable
environment binding and secret variable names. OWS requires a separately installed
native engine and private vault. Relayer requires verified, distinct signer entries.
Follow the corresponding [backend preparation](operator-services.md#choose-one-wallet-backend).
Never replace an assigned signer or binding to retry an uncertain operation.

![Wallet backend configuration](public/screenshots/backend.webp)

### 3. Services

Configure **Application token issuer**, **Wallet API audience** and **Token verification
keys URL (JWKS)**. Use separate registered application clients and short-lived
RFC 9068 API tokens. An application token authenticates the caller; the user assertion
establishes the application-scoped user and attests their identity and consent.

The standard application-led flow needs no wallet-user login or identity-vendor
connection. Choose its access flow and identity requirements in Policies.
If optional staff token controls are enabled in Deployment, return to Services to
configure **Optional staff login**. That login is only for token operators.

![Application token service connections](public/screenshots/services.webp)

### 4. Policies

Keep **Access flow → Application-led access (standard)**. Set **Required identity
level** and **Required identity fields (one per line)**. Use the exact level agreed
with applications and lowercase field names such as `country`. Field presence is
not proof of KYC; the trust agreement defines the application's verification duties.
Expand the identity and trust-agreement field guidance for examples and where to
get each value. Invalid field names and duplicate requirements are flagged beside
the input before you continue.

For a legacy deployment, explicitly select **Provider-hosted access (compatibility)**.
Configure hosted login and identity-vendor connections in Services. Keep record
evaluation, required fields, vendor route price limits and reviewer settings in
Policies. It is a separate flow; see [hosted access](onboarding.md). Changing flow
clears incompatible identity settings. Use **Configure hosted connections in
Services** to fill login/vendor settings, then **Continue in Policies** to return.
Review your export before deployment.

Register the exact issuer/client ID and name of each application. Set its permitted
actions and **Application identity and consent trust agreement** reference. Review
that agreement before enabling the application: it grants permission to attest
facts about users, not unrestricted wallet or spending access.

Set maximum identity age and access duration. Grants are also bounded by submitted
consent expiry. Different applications' user IDs cannot claim the same wallet;
cross-application linking needs a separately verified integration.

The GUI customizes the supplied rules directly; no policy code is needed for
these controls. Identity requirements and age limits apply to all registered
applications. Each application has its own trust agreement, permissions and
enabled switch. The [policy controls table](application-access.md#configure-the-trust-policy)
maps these settings to their effects and describes the customization limits.

For example, in Policies keep `verified` and `country`, set identity age to 30
days and access duration to three days, then allow one trusted
application to **Read wallet accounts**. It must attest a `verified` check less
than 30 days old, a nonempty `country` value and current user consent. Access ends
within three days, sooner if identity evidence or consent expires. A request
for transfer permission is denied. The `country` requirement checks presence;
it does not restrict which countries are accepted.

**Configure delegated transfer signing** is optional. Supply the verified token,
recipients, limits and validity. The application must present those exact terms to
the user and attest consent to the returned transfer-policy revision. Signing does
not broadcast, pay network fees or confirm completion.

![Application registrations and access policy](public/screenshots/policies.webp)

### 5. Deployment

Choose private persistent storage and HTTP listen settings. Keep **Enable wallet
operations in this configuration** off until real backend, authority and recovery
tests pass. References to completed test reports do not cause the wizard to run or
verify those tests.

**Enable deployed API explorer and Try it out** is optional. Optional staff token
controls use a separately configured staff login and explicit operator allowlist.
They do not create a wallet-user onboarding step. When enabled, choose
**Configure staff login in Services**, complete the login settings and choose
**Continue in Deployment** to finish the operator allowlist and token controls.

![Deployment settings](public/screenshots/deployment.webp)

### 6. Export

Review the access flow, identity requirements, application permissions, backend
and activation state. **Validate configuration** checks the draft you have been
building across the earlier steps. Resolve any errors beside the named step and
field. Check the per-application permission summary and deployment reminders,
then choose **Check local setup prerequisites**. If tools are missing or stopped,
review the proposed machine changes and choose **Install local runtime and continue**.
Follow runtime progress; complete any Homebrew or Docker Desktop prompts outside
the browser. Setup then opens the deployment plan automatically. Review it,
supply missing secrets and choose **Start local setup**. Follow progress through private
file creation, image build, configuration validation, new storage initialization,
diagnostics, startup and health checks. **Local service running · wallet operations
disabled** is the expected first result. Follow [local setup](local-setup.md) for
operation, recovery and the final-host handoff.

Alternatively, download all three files listed at the start of this guide. Editing
a setting afterward requires validation again. Starting local setup locks this
session's configuration; existing-service changes use reviewed maintenance.

![Validated configuration and exports](public/screenshots/export.webp)

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

## Use manual exports or finish local acceptance

Automated local setup performs the file preparation, build, initialization,
diagnosis and startup tasks below. Use its saved `provider-setup.md` for status,
stop and restart commands. It retains private records after stopping. Add HTTPS
and complete acceptance before enabling wallet operations; see [local setup](local-setup.md).

Choose **Open the deployment guide** from Export. Build the same toolkit revision
on the deployment host and copy all three files to a private directory outside
the source checkout. Rename `provider.env.example` to `provider.env`, then fill
its secret values privately or inject them through your secret manager. The
service does not load an environment file automatically: the downloaded checklist
uses explicit `--env-file` arguments for native commands.

A disabled first deployment is expected. Liveness returns HTTP 200 and readiness
HTTP 503 until activation. Some end-to-end acceptance checks require explicit
activation in an isolated test deployment with reviewed evidence; follow the
staging walkthrough before wider admission. The local executor checks startup
health; it does not perform those external acceptance checks.

Follow [deployment](operator-deployment.md) for private storage, local checks,
HTTPS and backups, and the [staging walkthrough](staging-walkthrough.md) for
isolated acceptance testing. Exporting configuration does not deploy an
application or publish a package.

To change policies later, import your saved `provider.config.json`, edit the
rules and review the effect on existing users. Validate and download the updated
files, deploy them and restart the service. Policy changes invalidate previous
grants; applications must read the new policy and obtain consent to its current
terms before requesting fresh access. Optional transfer-term changes also require
consent to the new transfer-policy revision.

## Resume and privacy

Import the saved configuration to resume. An existing hosted export remains hosted;
import does not migrate its user ownership or grants. Do not change an occupied
deployment's access mode or reinitialize it to bypass the migration fence. Refer to
[compatibility and migration](application-access.md#hosted-compatibility-and-migration).

Keep exports private. They contain policy and variable names, not secret values.
Do not share API explorer screenshots containing tokens, personal data or signatures.

## Verification and limits

Offline unit and browser tests cover the wizard, contracts and authority boundaries.
They do not establish acceptance of a real application, its identity checks, wallet
backend or deployment recovery. The current standard isolates users by application;
it does not automatically link wallets across applications.

## Screenshot maintenance

The screenshots use fictional settings and offline fixtures. Follow the
[contributor screenshot instructions](../CONTRIBUTING.md#maintain-wizard-screenshots)
to recreate them after UI changes.
