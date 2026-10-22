# Register application API tokens with Auth0

Use this recipe only when your developer has chosen Auth0 as the token issuer
for an advanced static deployment. A standard API-managed installation includes
its own issuer; [adding an application](runtime-workspace.md) does not require Auth0.

For this integration, you will register the wallet API, register each calling
application, then enter the values in [advanced setup](setup.md). Users
continue to sign in and give permission inside the connected application.
The recipe uses RFC 9068 access tokens and server-to-server client credentials.
Check actual issued tokens before activation. Staff token controls need a separate
optional login registration, described at the end.

An Auth0 **tenant** is your isolated login configuration and user directory. Create
a dedicated development tenant through the [Auth0 Dashboard](https://manage.auth0.com/)
using its [tenant setup guide](https://auth0.com/docs/get-started/auth0-overview/create-tenants).
Choose the region, account access and plan suitable for your organization. Record
its domain and use it consistently. A custom domain needs its own issuer review.

<span id="_3-register-the-wallet-http-api"></span>

## 1. Register the wallet HTTP API

In **Applications → APIs**, create a dedicated API. Name it for your wallet service
and choose a unique **Identifier**, for example `https://wallet.your-company.com/api`.
That identifier is the **audience**, not an endpoint the kit adds to its routes.
Choose **RS256**. Configure access-token lifetime to **600 seconds**; if a separate
browser-flow lifetime is displayed, set it to 600 as well. Leave JSON Web Encryption
(JWE) off: the kit accepts signed JWTs, not encrypted access tokens. See
[API settings](https://auth0.com/docs/get-started/apis/api-settings).

In that API's Settings, select the **RFC 9068** JWT/access-token profile and save.
Use the per-API setting, preserving other APIs' profiles. See
[Configure Access Token Profile](https://auth0.com/docs/get-started/apis/configure-access-token-profile).
The profile supplies `at+jwt`, `client_id` and `jti`; the default Auth0 profile uses
a different format and will fail the kit's validator. See
[profile differences](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles).

In the API's **Permissions** tab, add the exact scope names required by your selected endpoints in the
[HTTP reference](http-reference.md).
Use descriptions meaningful to your administrators. These Auth0 API permissions
become token scopes; the kit checks the space-separated `scope` claim, not a
`permissions` array. See [Add API Permissions](https://auth0.com/docs/get-started/apis/add-api-permissions).

<span id="_4-register-each-calling-application"></span>

## 2. Register each calling application

For a product with a trusted backend, create a separate **Machine to Machine
Application** for each connected application, authorize it for this wallet API and
select only its needed scopes. Set its Client ID in `policy.applications[].clientId` in the static configuration. Give its Client ID and secret securely to that product's backend operator;
do not put its secret value in provider JSON or browser code. Repeat for each app.
For optional [GUI token controls](operator-tokens.md), an authorized operator can
configure an environment reference to an approved M2M application secret held by
the provider server. That feature has separate operator and scope allowlists.
Follow [machine-to-machine registration](https://auth0.com/docs/get-started/auth0-overview/create-applications/machine-to-machine-apps).

This reference uses server-to-server client credentials. The API caller's subject
represents the application. The user ID and identity/consent evidence arrive in the application-led user assertion; provider-hosted sign-in is only a compatibility option. For a browser/mobile application that calls directly,
its developer must instead configure an appropriate public client and Authorization
Code with PKCE through [Auth0's PKCE guide](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce).
Never embed the machine-to-machine secret in a public application.

Give the product developer the tenant domain, `/oauth/token` endpoint, API audience,
allowed scopes, registered Client ID and secure secret-store access. They request
an access token with `grant_type=client_credentials`, that audience and the needed
scope string, then send it as `Authorization: Bearer …` to the wallet API. Auth0's
[client credentials guide](https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow/call-your-api-using-the-client-credentials-flow)
provides the exact request and error handling. The API's dashboard Test tab can
help inspect the request; do not paste secrets or resulting tokens into shared
screenshots, logs, issues or online JWT decoders.

### Check issued scopes, not just the requested scope string

Auth0 M2M tokens can include every permission in the application's client grant,
even when the request asks for fewer. Inspect the issued `scope` claim privately;
a requested subset does not prove that a token lacks a permission. See
[Auth0’s M2M scope limitation](https://support.auth0.com/center/s/article/Not-possible-to-remove-the-scopes-in-the-token-for-Machine-To-Machine-applications-inside-an-credentials-exchange-Action).

The toolkit’s GUI token broker requires the issued scopes to match the operator’s
selection and fails closed if the issuer returns extras. Use purpose-specific
client grants and matching GUI scope selections. Tenant-supported scope
customization requires its own verification; Auth0 documents newer transaction
scope controls as [Early Access](https://auth0.com/docs/actions/reference/credentials-exchange/credentials-exchange-api-object#api-transaction).

For a missing-scope staging test, obtain a genuinely reduced grant/token and
expect `403 insufficient_scope`. A cross-application isolation test instead needs
a different client with the required API scope, so its denial tests wallet
authority rather than only token scope. You can narrow an isolated test client's
grant after its isolation test; update its GUI token settings to match.

## 3. Enter the connection settings

For a tenant domain `your-tenant.us.auth0.com`, the mapping is:

| Configuration field              | Value                                                                |
| -------------------------------- | -------------------------------------------------------------------- |
| `oauth.issuer`                   | Exact discovery issuer, normally `https://your-tenant.us.auth0.com/` |
| `oauth.audience`                 | API **Identifier** from step 1, not Auth0's internal API ID          |
| `oauth.jwksUrl`                  | `https://your-tenant.us.auth0.com/.well-known/jwks.json`             |
| `policy.applications[].clientId` | Calling application's ID from step 2                                 |

If you enable staff token controls or hosted compatibility, also copy these
values from the optional registrations below:

| Optional configuration field               | Value                                                     |
| ------------------------------------------ | --------------------------------------------------------- |
| Login service issuer URL                   | The same exact discovery issuer                           |
| Wallet login client ID                     | Optional Regular Web Application Client ID                |
| Wallet login client secret (variable name) | `PROVIDER_LOGIN_SECRET`                                   |
| Login token signing algorithm              | `RS256`                                                   |
| Hosted reviewer account ID (sub)           | Staff user `sub`/user_id; required only for hosted review |

Open `https://your-tenant.us.auth0.com/.well-known/openid-configuration` to confirm
`issuer` and `jwks_uri`; these public metadata contain no client secrets. Auth0's
[JWKS documentation](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets)
explains the tenant public-key URL. Preserve exact issuer spelling, including the
trailing slash; the provider's own origin field has a different no-trailing-slash rule.

<span id="_6-confirm-the-tenant-works-before-admitting-traffic"></span>

## 4. Confirm the tenant works before admitting traffic

On your isolated staging deployment, have the application developer obtain a
short-lived token and confirm its header/claims against the
[kit token checklist](operator-services.md#register-the-application-api-and-clients).
Use an approved local tool that does not upload or log tokens. Confirm the service
accepts an authorized request and denies a missing/wrong scope and unlisted client.

After backend/recovery acceptance permits an isolated activated test, follow the
[application-led staging walkthrough](staging-walkthrough.md): discover policy,
submit approved test identity and consent evidence, obtain a grant, provision an
unfunded wallet, revoke access and test denials/restart. No provider user-login
redirect or reviewer account is needed. If optional staff controls or hosted access
are configured, test their Auth0 callback and session boundaries separately.
`doctor` does not remotely test Auth0. Token issuance alone does not establish user
permission or production readiness.

Return to [Services](setup.md), then add the clients and their
user-check agreements in [Applications](setup.md).
<span id="_1-optional-staff-or-hosted-owner-login"></span>

## Optional staff or hosted owner login

<details>
<summary>Register the optional browser login and reviewer accounts</summary>

In **Applications → Applications → Create Application**, create a **Regular Web
Application**, named for example “Acme wallet owner login”. This is the wallet
service's server login client, not the application that will consume its API.
[Auth0's registration guide](https://auth0.com/docs/get-started/auth0-overview/create-applications/regular-web-apps)
explains that application type.

In its settings, copy the **Domain** and **Client ID**. Set **Allowed Callback URLs**
to your exact deployed callback, for example
`https://wallet.your-company.com/onboarding/callback`, and save. Do not use the
a temporary local address. See
[application settings](https://auth0.com/docs/get-started/applications/application-settings).

In the application's **Credentials** settings, select **Client Secret (Post)**.
Securely store the client secret as `PROVIDER_LOGIN_SECRET`. This corresponds to
`client_secret_post`, which the kit uses during code exchange. Do not select None,
Basic or Private Key JWT for this login client. See
[credential settings](https://auth0.com/docs/get-started/applications/credentials).

Set **ID Token Expiration** to **600 seconds**, save, and use **RS256** signing.
Auth0's default ID-token lifetime is too long for this kit. The
[lifetime guide](https://auth0.com/docs/secure/tokens/id-tokens/update-id-token-lifetime)
shows the setting. Enable Authorization Code under the application's grant types
if it is not already enabled; retain PKCE S256 support. The kit supplies PKCE,
state, nonce and `max_age=300` itself. Auth0 documents the corresponding fresh
`auth_time` behavior in [reauthentication](https://auth0.com/docs/authenticate/login/max-age-reauthentication).

Enable an appropriate user **connection** for this application: a connection is
the user directory or upstream login source Auth0 authenticates against. For an
initial tenant, use a database connection through **Authentication → Database**
and enable it for this application. Follow the
[database connection guide](https://auth0.com/docs/authenticate/database-connections).
Configure registration, MFA, recovery and staff access according to your operating
policy before accepting users; those functions belong to Auth0, not the kit.

<span id="_2-hosted-compatibility-reviewer-accounts"></span>

## Hosted compatibility reviewer accounts

In **User Management → Users**, create or locate each staff reviewer in the enabled
connection. Auth0's [user creation guide](https://auth0.com/docs/manage-users/user-accounts/create-users)
explains the dashboard flow. Copy the exact **user_id** from the user's profile
(for example, `auth0|…`) as the reviewer login subject. Confirm it equals the `sub`
from a verified login using this same tenant. Enter it in the hosted-access reviewer allowlist in **Applications**. An Auth0 Dashboard administrator is not automatically a wallet
reviewer; this explicit subject allowlist grants that role.

</details>

Continue with [application access](application-access.md) and test your selected
issuer in isolation before enabling wallet use.
