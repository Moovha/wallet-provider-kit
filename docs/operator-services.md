# Prepare services, registrations and secrets

Use this checklist before completing the [setup wizard](setup-wizard.md).
The standard [application-led flow](application-access.md) accepts identity and
consent attestations from explicitly trusted applications. Provider user login,
manual review and provider-initiated vendor verification are not prerequisites.
The hosted compatibility sections below describe those optional features.

You can explore the wizard without these accounts, but placeholder values cannot run a
working provider. Examples use reserved `.example` domains and invented IDs.

The **operator** prepares accounts, registrations, policy and deployment. The
**application developer** obtains API tokens and integrates the access/signing
flow. Your identity administrator may need to configure token issuance. Supported
registrations require configuration; an incompatible token service may require an
advanced integration. The kit does not supply an identity provider or token issuer. For a fresh setup,
use the [Auth0 dashboard recipe](auth0-setup.md); it covers both registrations.

Standard application-led access needs an API token issuer, admitted applications,
reviewed identity/consent trust agreements and a wallet backend. Users authenticate
and complete checks within the application. No separate provider user login,
reviewer account or identity-vendor credential is required. See
[the application-led contract](application-access.md).

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

## What must exist

| Service or decision                 | Why it is needed                                       | Who supplies it                                                 |
| ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| Public domain and privacy notice    | Stable provider identity and application API endpoint  | Your domain/hosting administrator and privacy owner             |
| One wallet backend                  | Creates accounts and signs admitted actions            | CDP project, local OWS engine/vault, or your Relayer deployment |
| Optional staff/hosted login service | Staff token controls or hosted compatibility only      | Your OIDC identity provider administrator                       |
| Application token service           | Authenticates each connected application to the API    | Your OAuth authorization-server administrator                   |
| Didit, Sumsub or both               | Collects or imports identity evidence                  | Your identity-verification vendor account administrator         |
| Hosted identity funding agreements  | Authorizes and bounds verification/import costs        | Your team, vendor and connected application                     |
| Hosted review staff                 | Independently accepts identity evidence                | Named staff accounts in the owner login service                 |
| Persistent host and secret storage  | Runs the service and retains its authoritative records | Your infrastructure operator                                    |

**OIDC** (OpenID Connect) is the login protocol. **OAuth** supplies access tokens
for API requests. An **issuer** is the exact HTTPS identity of the service issuing
a token. A **client ID** identifies a registered application; it is not a password.
A **client secret** authenticates a confidential server application. A **JWKS URL**
publishes public verification keys, not signing secrets. An **audience** names the
API a token is intended for. A **subject**, written `sub` in a token, identifies the
signed-in person or authenticated caller at that issuer.

## Put references in the wizard, values in the deployment

A field labelled “secret variable name” expects a name such as
`PROVIDER_LOGIN_SECRET`, not the issued secret. The exported configuration contains
`{"env":"PROVIDER_LOGIN_SECRET"}`. At startup, the service reads that variable
from its process environment. You choose the names; keep the default names unless
your secret-store convention requires others. Names use uppercase letters, digits
and underscores, beginning with a letter.

| Default variable            | Actual value to store                             | Where it comes from                        |
| --------------------------- | ------------------------------------------------- | ------------------------------------------ |
| `PROVIDER_LOGIN_SECRET`     | Owner-login confidential client secret            | Login-service client registration          |
| `WALLET_CDP_API_KEY_ID`     | CDP Secret API Key ID                             | CDP project API Keys dashboard             |
| `WALLET_CDP_API_KEY_SECRET` | Matching CDP Secret API Key secret                | Same key creation/download                 |
| `WALLET_CDP_WALLET_SECRET`  | CDP project Wallet Secret                         | CDP wallet dashboard security section      |
| `OWS_OWNER_PASSPHRASE`      | Dedicated vault owner passphrase                  | Generate and retain in your secret manager |
| `RELAYER_API_KEY`           | Bearer API key accepted by your Relayer           | Your Relayer deployment administrator      |
| `DIDIT_API_KEY`             | API key for the recipient application/environment | Didit Business Console                     |
| `SUMSUB_APP_TOKEN`          | Sumsub application token                          | Sumsub Dashboard Dev space                 |
| `SUMSUB_SECRET_KEY`         | Secret paired with that app token                 | Same Sumsub token creation                 |

Only your selected backend/vendor variables are required. The application API
client's own secret belongs to the calling application's secret store; the wallet
service verifies its access tokens using public keys. If you enable
[operator token controls](operator-tokens.md), the provider also needs the
selected application's secret to request tokens through the configured issuer.
The [deployment walkthrough](operator-deployment.md#supply-the-secret-values)
shows how to fill the downloaded variable template without writing application code.

## Provider domain and privacy notice

Choose a hostname you control, for example `wallet.your-company.com`, and its
final origin `https://wallet.your-company.com`. Enter just the origin: no trailing
slash, path, username, query or fragment. It must match the externally visible
service and the login callback. This origin becomes part of the persisted binding;
changing it later needs reviewed migration planning.

Arrange DNS and HTTPS using the [ingress instructions](operator-deployment.md#publish-through-https).
Publish your own privacy notice at an accessible HTTPS URL. The kit does not host
or generate that notice. Explain the actual backend's key control, identity
vendors, information use, retention and recovery arrangements with your team.
Use your real provider display name; owners see it during consent.

## Choose one wallet backend

All three configured backends currently target **Base Sepolia**, chain ID `84532`,
with externally owned accounts (EOAs: accounts controlled by signing keys). These
are experimental profiles. Choosing a vendor does not establish production custody
acceptance. No RPC URL or gas key is required by the kit's configured signing
service. Broadcasting and gas sponsorship need the application's separate execution
rail; see [assets and gas](assets-and-gas.md).

### Coinbase CDP

CDP is a remotely operated wallet backend. Create/select a dedicated project in
the [CDP Portal](https://portal.cdp.coinbase.com/). In **API Keys → Secret API Keys**,
create a server key and save its ID and secret. In that project's wallet dashboard,
use the security section to generate and securely retain the **Wallet Secret**.
These are three separate values. Coinbase's [authentication instructions](https://docs.cdp.coinbase.com/api-reference/v2/authentication)
show the current screens and key types. Use the server wallet API configuration;
a public Client API Key or a Coinbase retail API key cannot replace these values.

Store the three values under the CDP variable names above. The bundled SDK handles
request authentication. Your team controls these server credentials and must
explain that control model to users. The kit provisions an account after accepted
onboarding; you do not create a sample wallet in the portal as a setup step.
Review the [CDP profile and acceptance limits](provider-guide.md#current-adapter-profile).

### Open Wallet Standard (OWS)

OWS runs locally. You need the pinned `@open-wallet-standard/core@1.4.3` engine,
a persistent private vault directory and an owner passphrase. The
[native deployment instructions](operator-deployment.md#prepare-the-optional-ows-vault)
install the engine and create the directory. Generate a strong random passphrase
with your secret manager, retain it securely and supply `OWS_OWNER_PASSPHRASE`.
It must be 16–4096 characters and cannot be an `ows_key_` agent token.

The toolkit creates wallets later; there is no prerequisite CLI wallet creation
or seed export. Both the OWS vault and SQLite records need coordinated recovery.
OWS is supported here on macOS or glibc Linux, arm64/x64; Windows and Alpine are
unverified. The reference Docker image omits the engine and vault. Use the native
path for OWS, or treat a custom container image as an advanced deployment. Read
[OWS control and recovery](ows-adapter.md) and [upstream documentation](https://docs.openwallet.sh/).

### OpenZeppelin Relayer

This choice connects an **existing, separately operated Relayer service**. It does
not install Relayer, Redis, RPC access or a signing-key service. Start with
[upstream deployment instructions](https://docs.openzeppelin.com/relayer/1.8.x/quickstart)
and the kit's [pinned Relayer profile](openzeppelin-relayer.md), which records the
reviewed v1.8.0 behavior and upstream license. Your Relayer administrator must
provide its HTTPS origin, API key and preconfigured signer inventory. The Relayer
API key is generated by your operator and configured as `API_KEY` in that service;
supply the same value as `RELAYER_API_KEY` to this kit. Generate it in your secret
manager and retain it privately; it is not an OpenZeppelin website login or a
blockchain private key. Upstream's quickstart explains Redis, signer creation,
keystore credentials and service startup. Those signer-store credentials and RPC
settings remain inside the separate Relayer deployment, not this wizard.

Enter the origin without `/api/v1`. For each pool row copy the actual Relayer ID,
Signer ID and EOA address from the deployment's configuration/admin inventory.
The binding revision for this profile is `1`. Have the administrator verify the
remote relayer's `base-sepolia` network, `evm` type, chain ID `84532`, active status,
signer ID and address against that inventory. Do not copy the guide's dummy addresses.

Each account permanently reserves one pool entry. Relayer ID, signer and address
must be distinct across entries. An exhausted pool blocks new provisioning;
removing an assigned signer blocks its account. Capacity and recovery therefore
require an operational plan. This option enables signing, not Relayer transaction
submission. If your team cannot operate a separate Relayer, choose another backend.

### Stable backend binding

For any backend, choose a unique, non-secret name for this environment, such as
`acme-cdp-base-sepolia-01`. It is an operator-owned identifier, not an issued API
key or wallet address. Keep it unchanged through credential rotations and restarts.
The database binds accounts to it, the provider implementation and public origin.
Never change it to work around a failed or uncertain wallet operation.

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

## Register the application API and clients

The wallet service is an OAuth **resource server**: it accepts and checks tokens;
it does not issue them. Ask your authorization-server administrator to create a
dedicated API/resource audience, for example `acme-wallet-provider`, and separate
client registrations for each admitted application. Copy the exact issuer,
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

Give application developers the issuer's own token endpoint, supported grant type,
client credentials/PKCE instructions and audience/scope request syntax. Those are
issuer-specific and are not generated by the wizard. Server applications keep
client secrets on their servers; browser/mobile clients need an appropriate public
client flow configured by the administrator. Do not distribute a confidential
client secret in a browser or mobile app.

| Application task                                 | Token scope           |
| ------------------------------------------------ | --------------------- |
| Create access request; submit an identity import | `wallet:access`       |
| Poll an access request                           | `wallet:access:read`  |
| Read a granted account                           | `wallet:account:read` |
| Provision an accepted account                    | `wallet:provision`    |
| Request provider transfer authorization          | `wallet:actions`      |
| Read transfer authorization status               | `wallet:actions:read` |
| Sign an authorized transfer                      | `wallet:sign`         |

Authorize only needed scopes. Do not give connected apps staff review authority.
The wizard's **Read wallet accounts** (`account:read`) and **Request transfers on
behalf of users** (`transfers:request`) are separate stored-consent permissions,
not OAuth scope names. Transfer delegation is explicitly consented to during
onboarding; the provider checks each exact request without asking again.
`operations:request` remains a request-only permission for advanced hosts. A permitted API scope still requires a current owner grant and policy.
See [HTTP authentication](http-api.md#authentication-and-profiles).

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

## Optional token signing policy

Leave transfer signing off if you only need onboarding/provisioning. To enable it,
your token/integration specialist must supply a verified **ERC-3009 token on Base
Sepolia**, its contract address, EIP-712 signing-domain name/version, symbol and
decimals, plus allowed recipient addresses. Obtain these from the deployed token's
verified contract and issuer documentation, then independently test the exact
contract/domain. A ticker, mainnet address or sample address is insufficient.

Decide per-action and lifetime account/token limits in integer base units. With
six decimals, `1000000` means one token. The lifetime limit must be at least the
per-action limit; uncertain attempts keep reservations. Authorization validity
is 60–3600 seconds. Already-issued signatures can remain executable until their
on-chain expiry even after application access is revoked. The kit does not cancel,
broadcast or settle them. Read the [financial profile](setup.md#supported-financial-policy)
and record token acceptance before activation.

## Ready to open the wizard

You should now have real public registration values, secret-store entries, reviewer
subjects, vendor terms and application funding decisions. Continue with the
[six-screen walkthrough](setup-wizard.md#complete-the-six-steps), then
[deployment and acceptance](operator-deployment.md).
