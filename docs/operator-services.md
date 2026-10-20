# Prepare the values for each wizard step

The wizard supplies a recommended [bundled setup](bundled-setup.md): application
token issuance, OWS private signing, a private Alto bundler with durable Valkey queues, SQLite and a saved Caddy HTTPS configuration.
Use this reference for domain ownership, policy agreements or optional existing
services and vendor credentials. Prepare each value as you
reach its step; you can explore the forms without external accounts.

Users authenticate, complete identity checks and consent in the connected
application. Your service needs that application's API registration and a reviewed
agreement to trust its attestations. Provider user login and identity-vendor
accounts are only needed for the optional features described at the end.

The wizard supplies credential variable names and derives bundled service
settings automatically. Advanced controls expose overrides. Local setup generates
missing bundled secrets privately; supply external-service credentials during
deployment. Examples use invented IDs and reserved domains. Return to the
[step-by-step wizard](setup-wizard.md) to enter the prepared values.

## Provider domain and privacy notice

Choose a hostname you control, for example `wallet.your-company.com`, and its
final origin `https://wallet.your-company.com`. Enter just the origin: no trailing
slash, path, username, query or fragment. It must match the externally visible
service and the login callback. This origin becomes part of the persisted binding;
changing it later needs reviewed migration planning.

Point DNS to the deployment host. The bundled Caddy profile supplies automatic
HTTPS when started on that host; an existing gateway is optional. See
[bundled HTTPS setup](bundled-setup.md#configure-through-the-wizard).
Publish your own privacy notice at an accessible HTTPS URL. The kit does not host
or generate that notice. Explain the actual backend's key control, identity
vendors, information use, retention and recovery arrangements with your team.
Use your real provider display name so applications and users can identify your service.

## Choose one wallet backend

The configured service uses bundled OWS behind per-user Safes. The stable wallet
environment ID and private vault directory are supplied in Backend. Setup generates
missing owner credentials privately; back up the vault, environment and database
together. No CDP asset-wallet, Relayer pool or custom execution selection is available.
See [Safe wallets](self-hosted-sponsorship.md).

### Stable backend binding

Retain the generated wallet environment ID across restarts and credential rotation.
Changing it on an occupied store requires a reviewed migration. Loading an old
export cannot reinterpret an EOA address as a Safe or recover an uncertain attempt.

## Register the application API and clients

The default bundled service registers enabled applications from Policies and
issues five-minute RFC 9068 tokens. Services derives the issuer, audience and
JWKS URL from your provider origin. Setup generates and retains credentials; no
separate administrator registration is needed. Review **Advanced application API permissions** in
Services when enabling additional API routes and record application trust and wallet permissions in Policies.
See [application connection](bundled-setup.md#connect-a-server-application).

**Existing authorization server only:** create a dedicated API/resource audience,
for example `acme-wallet-provider`, and separate client registrations for each
admitted application. Copy the exact issuer,
audience and HTTPS JWKS URL into **Services**. Copy each registered client ID into
**Policies**, alongside a human-readable application name shown during consent.
Application issuer fields inherit the Services issuer.

Your issuer must produce the [RFC 9068 JWT access-token profile](https://www.rfc-editor.org/rfc/rfc9068.html)
with the following kit requirements:

| Token element | Required content                                                                             |
| ------------- | -------------------------------------------------------------------------------------------- |
| Header        | `typ: at+jwt`, signature algorithm RS256 or ES256, resolvable public key                     |
| `iss`, `aud`  | Exact configured issuer and intended wallet API audience                                     |
| `sub`         | Nonempty authenticated caller subject; not proof of wallet ownership                         |
| `client_id`   | Exact registered application ID allowed by the provider policy                               |
| `iat`, `exp`  | Issued/expiry times, positive lifetime of at most 600 seconds; token at most ten minutes old |
| `jti`         | Nonempty token identifier                                                                    |
| `scope`       | Space-separated string containing the scope for the requested route                          |

An ordinary JWT with `typ: JWT`, an ID token, an opaque access token, `azp` alone
without `client_id`, or a vendor API key will fail. There is no wizard switch to
relax this. Confirm that your issuer produces the required profile before
deployment; this guide does not certify a third-party authorization server.
Resolve incompatible token formats with your identity administrator.

For an existing issuer, give application developers its token endpoint, supported grant type,
client credentials/PKCE instructions and audience/scope request syntax. Those are
issuer-specific and are not generated by the wizard. Server applications keep
client secrets on their servers; browser/mobile clients need an appropriate public
client flow configured by the administrator. Do not distribute a confidential
client secret in a browser or mobile app.

| Application task                                 | Token scope                    |
| ------------------------------------------------ | ------------------------------ |
| Create access request; submit an identity import | `wallet:access`                |
| Poll an access request                           | `wallet:access:read`           |
| Read a granted account                           | `wallet:account:read`          |
| Provision an accepted account                    | `wallet:provision`             |
| Request provider transfer authorization          | `wallet:actions`               |
| Read transfer authorization status               | `wallet:actions:read`          |
| Sign an authorized transfer                      | `wallet:sign`                  |
| Report transaction observations                  | `wallet:events`                |
| Read transaction event reports                   | `wallet:events:read`           |
| Execute an approved action                       | `wallet:execute`               |
| Read verified execution status                   | `wallet:execute:read`          |
| Read application runtime configuration           | `wallet:configuration:read`    |
| Propose application contract policies            | `wallet:configuration:propose` |

Authorize only needed scopes. Do not give connected apps staff review authority.
The wizard's **Read wallet accounts** (`account:read`) and **Request transfers on
behalf of users** (`transfers:request`) are separate stored-consent permissions,
not OAuth scope names. Transfer delegation is explicitly consented to during
onboarding; the provider checks each exact request without asking again.
`operations:request` remains a request-only permission for advanced hosts. A permitted API scope still requires a current owner grant and policy.
See [HTTP authentication](http-api.md#authentication-and-profiles).

## Put references in the wizard, values in the deployment

A field labelled “secret variable name” expects a name such as
`PROVIDER_LOGIN_SECRET`, not the issued secret. The exported configuration contains
`{"env":"PROVIDER_LOGIN_SECRET"}`. At startup, the service reads that variable
from its process environment. You choose the names; keep the default names unless
your secret-store convention requires others. Names use uppercase letters, digits
and underscores, beginning with a letter.

| Default variable        | Actual value to store                             | Where it comes from                                                 |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `PROVIDER_LOGIN_SECRET` | Owner-login confidential client secret            | Login-service client registration                                   |
| `OWS_OWNER_PASSPHRASE`  | Dedicated vault owner passphrase                  | Generated once by bundled setup, or supplied by your secret manager |
| `DIDIT_API_KEY`         | API key for the recipient application/environment | Didit Business Console                                              |
| `SUMSUB_APP_TOKEN`      | Sumsub application token                          | Sumsub Dashboard Dev space                                          |
| `SUMSUB_SECRET_KEY`     | Secret paired with that app token                 | Same Sumsub token creation                                          |

Bundled setup also creates `WALLET_OAUTH_SIGNING_KEY` and separate application
client-secret variables. Retain them privately; give each application only its
own client secret. Only your selected backend/vendor variables are required. The application API
client's own secret belongs to the calling application's secret store; the wallet
service verifies its access tokens using public keys. The bundled issuer retains
its own separate copy of each registered client secret for token issuance. If you enable
[operator token controls](operator-tokens.md), the provider also needs the
selected application's secret to request tokens through the configured issuer.
The [deployment walkthrough](operator-deployment.md#supply-the-secret-values)
shows how to fill the downloaded variable template without writing application code.
For [automated local setup](local-setup.md), the executor offers a separate private
secret-entry screen after validation. It saves values in an owner-only file outside
the checkout and mounts that file read-only. The service-setting fields and downloads
still contain names only.

## Application identity and consent trust

Agree each application's authority to attest its users, verification level,
required fields, evidence freshness, consent terms and withdrawal process.
Record `policy.applications[].assertionTrust.agreement` in Policies. Choose stable
user IDs scoped to that application; names and email addresses cannot link wallets
across applications. Configure `policy.identity.application` in Policies. An API
scope or a set of populated fields cannot replace this trust agreement.

The application records consent for the provider's current policy revision, obtained
from `GET /v1/access-policy`. Financial delegation also binds the exact transfer
policy revision. Applications must communicate withdrawals through the grant
revocation endpoint. The provider checks its current local grant before effects.

## Optional token signing policy

Use the deployed application's optional policy adapters for asset-specific limits.
The configured service submits every approved call through the same Safe/bundler/
paymaster flow. Legacy ERC-3009 EOA transfer exports are rejected before startup.

## Optional designated execution service

The separate designated executor and its CLI are retired configured-service
choices. [Safe sponsorship](self-hosted-sponsorship.md) describes the supported
private bundler and application-owned paymaster. Retain old journals for recovery;
changing configuration does not migrate their assets or attempts.

## Optional staff and hosted services

Operator login for API testing remains separate from wallet ownership. Hosted
owner-login and identity-vendor examples below are historical host references;
the Safe configured service uses application-led user identity and consent.

Configure the following only when you enable staff token controls in
[Deployment](setup-wizard.md#_5-deployment), or maintain an explicit
[hosted compatibility deployment](onboarding.md). They do not add a login or
review step to the application's wallet-user journey.

## Register owner login

**Optional staff login or hosted compatibility only.** Standard wallet users do not sign in to the provider. Configure this registration only for staff token controls or the explicit hosted flow.

Ask your identity administrator to register a **confidential web application** for
the wallet service. This client logs in owners and staff; it is separate from the
application API clients below. An existing issuer can serve both purposes if it
supports both required profiles.

Give the administrator this configuration checklist:

1. Enable OpenID Connect authorization-code flow, `openid` scope and PKCE with S256.
2. Register the exact callback shown by the wizard:
   `https://wallet.your-company.com/onboarding/callback`. No wildcard callback.
3. Enable `client_secret_post` authentication at the token endpoint. Issue a client
   ID and client secret; store the latter as `PROVIDER_LOGIN_SECRET`.
4. Sign ID tokens with RS256 (the wizard default) or ES256. Select the matching
   algorithm in the wizard. Set lifetime to at most **600 seconds**.
5. Honor `max_age=300` and include `auth_time`; authentication must be no older than
   **five minutes**. The kit also validates state, nonce, issuer and audience.
6. Supply the exact HTTPS issuer from discovery. Discovery, authorization, token
   and public-key endpoints must use HTTPS. Do not substitute the login page URL
   or append `/.well-known/openid-configuration` to the wizard's issuer field.
7. Configure user registration, MFA and account recovery in the identity service.
   The kit does not implement those account-management functions.

These requirements follow the kit's implemented OIDC client; the
[OIDC specification](https://openid.net/specs/openid-connect-core-1_0.html) explains
the protocol. Ask the administrator to demonstrate a fresh login on your staging
provider before accepting the integration. A vendor's “OIDC supported” label
alone does not confirm these settings.

### Identify reviewers

**Hosted compatibility only.** Application-led access is decided by configured policy and does not require reviewer accounts.

Create staff accounts at that same issuer and obtain each account's exact OIDC
`sub` from the identity administrator's user record or a verified test login.
Enter those subjects in **Policies → Provider identity reviewers**. Do not enter
email addresses, names, application client IDs or a subject from another issuer.
Keep at least one working reviewer. Reviewers use
`https://wallet.your-company.com/onboarding/review`; owners use
`https://wallet.your-company.com/onboarding/access`.

Train reviewers to check the evidence, actual verification date and correspondence
to the signed-in owner. A vendor's approved status alone is not provider acceptance.
The [onboarding guide](onboarding.md) describes review and uncertain provisioning.

## Prepare identity verification

**Hosted compatibility only.** In standard application-led access, the application performs identity checks and submits accepted attestations; this provider does not start a vendor session.

Choose Didit, Sumsub or both. These are vendor accounts/contracts, not login
providers. Configure the recipient workflow/level that represents **your**
acceptance requirements. Confirm vendor availability, sharing permissions and
prices for the intended environment before promising onboarding to users.
The kit uses server API polling; a webhook signing secret is not a substitute
for the API credentials listed here.

### Didit

Create/join your organization in the [Didit Business Console](https://business.didit.me/),
select the intended application/environment, then use **Workflows → Create New**
to build and publish a verification workflow with the checks your team requires. Obtain its **workflow ID** from the
workflow configuration/API: the kit expects a lowercase UUIDv4, not the display
name or a session ID. Follow [Didit's account/workflow introduction](https://help.didit.me/getting-started/create-your-account).

In the same application, open **API & Webhooks** and obtain its API key. Store the
value as `DIDIT_API_KEY`; enter the workflow ID in the wizard. Use a separate sandbox
application for testing. A key for another application does not authorize this
workflow. Didit's [API key guide](https://help.didit.me/account-organization/api-keys)
explains application scoping and key handling. The [workflow guide](https://help.didit.me/workflows/build-a-verification-workflow)
explains building and publishing the selected checks. Confirm the account's ability to
create verification sessions and receive shared identity before enabling either
route. The application supplies any shared-identity token; it is not a static
operator secret to paste into setup.

### Sumsub

Create the recipient verification level in your [Sumsub Dashboard](https://cockpit.sumsub.com/)
and copy its exact level name. A level defines the required verification steps.
Use **Individuals → Create level**, select a Standard level and configure its steps;
see [level configuration](https://docs.sumsub.com/docs/configure-verification-levels).
Levels are shared across Sandbox and Production, so use a dedicated test level
rather than editing a live one to experiment. The kit supplies the hosted
verification link; you do not build a separate identity SDK interface for this flow.
In **Dev space → App Tokens → Generate app token**, create the credential pair
for the appropriate environment and securely retain both app token and secret key.
Store them as `SUMSUB_APP_TOKEN` and `SUMSUB_SECRET_KEY`. Sandbox and production
credentials are separate; see [Sumsub app tokens](https://docs.sumsub.com/docs/app-tokens).

Have Sumsub enable/confirm **Reusable KYC Share** and the required sender/recipient
sharing relationship and permissions. The configured adapter declares that this
is enabled; ticking a form does not enable a vendor product. Use
[partner management](https://docs.sumsub.com/docs/manage-sharing-partners) and your
Sumsub account contact to establish the sharing arrangement. Confirm API permissions
for hosted verification/applicant status and the selected reuse operation. If
those capabilities are unavailable, do not select this integration as ready.

### Prices, terms and application funding

These settings cover provider-initiated vendor work in hosted mode. They are not required for application-led assertions.

Obtain confirmed maximum charges from the vendor/your contract for **new
verification** and **shared identity import** separately, for each selected
workflow/level. In Policies, enable each route's agreed price limit, enter its
maximum in **USD cents**, and enter an internal contract/ticket reference for the
terms. `250` means USD 2.50; it is not a token amount or gas budget.

Then agree who pays with each connected application. In Policies, enable its
funding agreement, enter your agreement reference and monthly limit in USD cents.
For example, an agreed USD 100 cap is `10000`. These references point to your actual
agreements; they are your own record references, not vendor-issued identifiers. The kit reserves
budget before vendor work; it does not pay invoices or establish a contract.

**Even free routes need an explicit zero price bound and an application funding
agreement.** Missing price/funding returns `funding_approval_required` and prevents
new vendor work. Configure both routes if you offer both. Unknown vendor outcomes
retain reservations. Do not clear records or create new requests to bypass a cap.

## Return to your setup

Continue at the [wizard step](setup-wizard.md#complete-the-six-steps) that requested
these values. Provider identity belongs in Provider, wallet credentials in Backend,
token connections in Services, trust agreements and transfer limits in Policies,
and execution/storage choices in Deployment. Export validates those settings
together before local or manual deployment.
