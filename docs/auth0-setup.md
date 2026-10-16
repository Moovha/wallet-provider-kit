# Reference login and API setup with Auth0

Use this recipe if you do not already have compatible login/token services.
Auth0 is the reference choice because its managed dashboard exposes confidential
web-client authentication and the RFC 9068 API token profile required by the kit.
No Auth0 Action or custom token-mapping code is required by this recipe.
This is a configuration guide checked against official documentation, **not a
claim of completed live tenant acceptance**. Verify your tenant before activation.

An Auth0 **tenant** is your isolated login configuration and user directory. Create
a dedicated development tenant through the [Auth0 Dashboard](https://manage.auth0.com/),
following [tenant setup](https://auth0.com/docs/get-started/auth0-overview/create-tenants).
Choose the region, account access and plan suitable for your organization; confirm
current service limits and charges with Auth0. Record the tenant domain shown in
application settings. Use that domain consistently throughout this initial setup.
Custom domains need their own Auth0 configuration and issuer review.

## 1. Register the wallet service's owner login

In **Applications → Applications → Create Application**, create a **Regular Web
Application**, named for example “Acme wallet owner login”. This is the wallet
service's server login client, not the application that will consume its API.
[Auth0's registration guide](https://auth0.com/docs/get-started/auth0-overview/create-applications/regular-web-apps)
explains that application type.

In its settings, copy the **Domain** and **Client ID**. Set **Allowed Callback URLs**
to your exact deployed callback, for example
`https://wallet.your-company.com/onboarding/callback`, and save. Do not use the
wizard's `127.0.0.1` address: that is a temporary configuration tool. See
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

## 2. Create reviewer accounts

In **User Management → Users**, create or locate each staff reviewer in the enabled
connection. Auth0's [user creation guide](https://auth0.com/docs/manage-users/user-accounts/create-users)
explains the dashboard flow. Copy the exact **user_id** from the user's profile
(for example, `auth0|…`) as the reviewer login subject. Confirm it equals the `sub`
from a verified login using this same tenant. Enter it under **Policies → Reviewer
1 login subject**. An Auth0 Dashboard administrator is not automatically a wallet
reviewer; this explicit subject allowlist grants that role.

## 3. Register the wallet HTTP API

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

In the API's **Permissions** tab, add the exact scope names in the
[application scope table](operator-services.md#register-the-application-api-and-clients).
Use descriptions meaningful to your administrators. These Auth0 API permissions
become token scopes; the kit checks the space-separated `scope` claim, not a
`permissions` array. See [Add API Permissions](https://auth0.com/docs/get-started/apis/add-api-permissions).

## 4. Register each calling application

For a product with a trusted backend, create a separate **Machine to Machine
Application** for each connected application, authorize it for this wallet API and
select only its needed scopes. Copy its Client ID into the wizard's application
policy. Give its Client ID and secret securely to that product's backend operator;
do not put its secret value in provider JSON or browser code. Repeat for each app.
For optional [GUI token controls](operator-tokens.md), an authorized operator can
configure an environment reference to an approved M2M application secret held by
the provider server. That feature has separate operator and scope allowlists.
Follow [machine-to-machine registration](https://auth0.com/docs/get-started/auth0-overview/create-applications/machine-to-machine-apps).

This reference uses server-to-server client credentials. The API caller's subject
represents the application, while the wallet owner separately signs in through
the provider's hosted flow. For a browser/mobile application that calls directly,
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

## 5. Copy the values into FormKit

For a tenant domain `your-tenant.us.auth0.com`, the mapping is:

| Wizard field                            | Value                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Owner login issuer                      | Exact discovery `issuer`, normally `https://your-tenant.us.auth0.com/` |
| Owner login client ID                   | Regular Web Application Client ID from step 1                          |
| Owner login client secret variable name | `PROVIDER_LOGIN_SECRET`                                                |
| ID token algorithm                      | `RS256`                                                                |
| Application token issuer                | Same exact discovery issuer, including its trailing slash              |
| Dedicated API audience                  | API **Identifier** from step 3, not Auth0's internal API ID            |
| Application JWKS URL                    | `https://your-tenant.us.auth0.com/.well-known/jwks.json`               |
| Application client ID in Policies       | Calling application's ID from step 4                                   |
| Reviewer login subject                  | Staff user `sub`/user_id from step 2                                   |

Open `https://your-tenant.us.auth0.com/.well-known/openid-configuration` to confirm
`issuer` and `jwks_uri`; these public metadata contain no client secrets. Auth0's
[JWKS documentation](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets)
explains the tenant public-key URL. Preserve exact issuer spelling, including the
trailing slash; the provider's own origin field has a different no-trailing-slash rule.

## 6. Confirm the tenant works before admitting traffic

On your isolated staging deployment, have the application developer obtain a
short-lived token and confirm its header/claims against the
[kit token checklist](operator-services.md#register-the-application-api-and-clients).
Use an approved local tool that does not upload or log tokens. Confirm the service
accepts an authorized request and denies a missing/wrong scope and unlisted client.

After your team's backend/recovery acceptance permits an isolated activated test
configuration, start a test access request and open its returned consent URL in a
top-level browser. Confirm fresh Auth0 login returns to the exact provider callback,
then confirm the reviewer can reach `/onboarding/review`. Exercise KYC, consent,
review, revocation and restart with vendor-approved test identities; do not send
real customer evidence as a setup probe. Record these results with your acceptance
evidence. `doctor` does not remotely test Auth0, and successful token issuance does
not establish owner permission or production readiness.

Continue with [identity/backend preparation](operator-services.md), the
[wizard walkthrough](setup-wizard.md) and [deployment](operator-deployment.md).
