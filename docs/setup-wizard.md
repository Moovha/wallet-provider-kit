# Configure your wallet service in the wizard

The wizard prepares configuration for the supplied service. Application-led access
is the standard flow: users sign in, complete identity checks and approve access
inside the connected application. The provider accepts its attestations only under
an explicit trust agreement and current policy. The wizard does not deploy the
service or test external integrations.

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
not secret values. Download your configuration to save progress; page refresh
loses unsaved edits.

![Provider setting instructions](public/screenshots/provider-guidance.webp)

## Complete the six steps

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

Keep **Access flow → Application-led access (standard)**. Set **Required identity
level** and **Required identity fields (one per line)**. Use the exact level agreed
with applications and lowercase field names such as `country`. Field presence is
not proof of KYC; the trust agreement defines the application's verification duties.

Configure **Application token issuer**, **Wallet API audience** and **Token verification
keys URL (JWKS)**. Use separate registered application clients and short-lived
RFC 9068 API tokens. An application token authenticates the caller; the user assertion
establishes the application-scoped user and attests their identity and consent.

There are no mandatory wallet-user login fields, vendor accounts or review steps.
If optional staff token controls are enabled in Deployment, return to Services to
configure **Optional staff login**. That login is only for token operators.

![Application-led services and identity policy](public/screenshots/services.webp)

For a legacy deployment, explicitly select **Provider-hosted access (compatibility)**.
This reveals owner login, hosted identity-vendor/evaluation settings and reviewer
requirements. It is a separate flow; see [hosted access](onboarding.md). Changing
flow clears incompatible identity settings. Review your export before deployment.

### 4. Policies

Register the exact issuer/client ID and name of each application. Set its permitted
actions and **Application identity and consent trust agreement** reference. Review
that agreement before enabling the application: it grants permission to attest
facts about users, not unrestricted wallet or spending access.

Set maximum identity age and access duration. Grants are also bounded by submitted
consent expiry. Different applications' user IDs cannot claim the same wallet;
cross-application linking needs a separately verified integration.

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
They do not create a wallet-user onboarding step.

![Deployment settings](public/screenshots/deployment.webp)

### 6. Export

Validate the settings and resolve any errors shown beside the named step and field.
Review the access flow, application trust policy, backend and activation state.
Download `provider.config.json`, `provider.env.example` and `provider-setup.md`.
Configuration validation makes no wallet or identity-vendor call.

![Validated configuration and exports](public/screenshots/export.webp)

## Explore the provider API

Choose **API reference**. The local preview uses your settings and sends no API
calls. Application-led deployments show policy discovery, access requests, grant
revocation, account reads, provisioning and optional transfer endpoints. Hosted
batch-record and vendor-import endpoints are not part of the standard preview.

Begin with **Read access policy and evidence requirements**. The application obtains
the current policy revision and required evidence, records the user's consent in
its own platform, submits a user assertion, receives a grant when policy passes,
then creates or accesses the wallet. See the complete
[application-led contract](application-access.md), including fictional JSON examples.

Example revisions, timestamps, IDs and evidence are placeholders. Replace them
with current records before testing. Schemas and example responses are not live
service results or approvals.

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

## Use the exported files

Supply secret values privately on your deployment host. Initialize new storage
once, diagnose local prerequisites, publish through HTTPS and perform acceptance
tests before activation. Follow [deployment](operator-deployment.md) and the
[staging walkthrough](staging-walkthrough.md). No application deployment or package
publication occurs when you export configuration.

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
