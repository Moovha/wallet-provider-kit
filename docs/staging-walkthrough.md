# Rehearse a deployment through the supported operator path

Use **the FormKit GUI to configure**, **the supplied CLI to deploy**, and **the
deployed Swagger and owner/reviewer pages to test the service**. This walkthrough
checks onboarding, unfunded wallet creation, application access and recovery on
your staging deployment. Use registered login and application clients, a vendor
test identity workflow and the supported configured service.

Use a reviewed toolkit revision and the matching walkthrough for your staging
deployment. Record the source revision, exported configuration revision and
runbook version privately with the results. Local previews and offline tests do
not validate the deployed service or its external integrations.

## 1. Check prerequisites and record gaps

Use a separate staging origin, application registrations, approved test identities
and private persistent storage. Keep all accounts unfunded and leave the financial
profile absent for this walkthrough. Do not request signatures or submit transactions.

| Prerequisite    | Evidence required before the corresponding step                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host and HTTPS  | A persistent supported POSIX host, adequate free disk, supervision, private storage and a stable HTTPS origin trusted by the browser and service.                   |
| Wallet backend  | A verified CDP project/key set, supported OWS vault, or existing Relayer signer pool; independently reviewed backend/recovery prerequisites.                        |
| Owner login     | A real OIDC registration, exact provider callback, code flow, S256 PKCE, compatible ID tokens and test owner/reviewer accounts.                                     |
| Application API | Two distinct registered application clients, issuer/audience/JWKS and RFC 9068 tokens with the required scopes and at most ten-minute lifetime.                     |
| Identity        | An actual Didit test workflow or Sumsub test level/sharing setup, approved test evidence and confirmed cost limits/funding agreements. A key alone is insufficient. |
| Recovery        | A protected backup destination, retained backend credentials or OWS vault, and a reviewed restore/lost-response procedure.                                          |

If a required service is unavailable, mark its step **blocked** and record what
is missing. You can continue preparation for other steps. A fixture-based result
does not establish that the unavailable service works. Record whether each gap
requires configuration or functionality the toolkit does not support.
The [credential guide](operator-services.md) and [Auth0 recipe](auth0-setup.md)
explain the required registrations. Account creation at external services and paid
identity checks need the applicable account authority and agreed budget.

## 2. Configure and export in the GUI

From a reviewed source checkout, use the documented versions and commands:

```sh
npm ci
npm run build
npm start -- setup
```

Complete the [six wizard screens](setup-wizard.md#complete-the-six-steps):

1. Set the real staging origin and privacy notice under **Provider**.
2. Select the actual backend under **Backend**, using secret variable names only
   and a stable staging binding. CDP does not require a local vault.
3. Configure the real owner login, application token issuer and identity test
   workflow under **Services**. Supply reviewer subjects from that login issuer.
4. Register applications **A** and **B** under **Policies**, both allowed
   `account:read`. Start with a one-day access limit. Configure confirmed identity
   price bounds and the corresponding application funding agreement.
5. Under **Deployment**, keep activation disabled and enable the deployed API
   explorer. Optionally enable [operator token controls](operator-tokens.md) for
   the two applications, with explicit operator subjects and minimum scopes.
6. Under **Export**, validate and download configuration, variable template and
   checklist. Validation is not deployment acceptance. Keep all three private.

The GUI's **Run the staging walkthrough** link and exported checklist point here.
The local **API reference** is a preview; HTTP execution happens on the deployed
provider after the next step.

## 3. Deploy that export with the supplied CLI

Follow [Deploy the wizard export](operator-deployment.md) for private directories,
environment-file syntax, storage ownership, HTTPS ingress and supervision.
With `PROVIDER_STATE` set to the prepared private deployment directory, run from
the built source checkout:

```sh
node dist/main.js validate --config "$PROVIDER_STATE/provider.config.json"
node --env-file="$PROVIDER_STATE/provider.env" dist/main.js init-storage --config "$PROVIDER_STATE/provider.config.json"
node --env-file="$PROVIDER_STATE/provider.env" dist/main.js doctor --config "$PROVIDER_STATE/provider.config.json"
node --env-file="$PROVIDER_STATE/provider.env" dist/main.js run --config "$PROVIDER_STATE/provider.config.json"
```

Initialize **new storage once**. Never rerun initialization to repair a failed
attempt, replace an existing database or make an old database compatible.
The service does not load `.env` automatically. An installed tarball can use
the equivalent installed CLI commands from the [package guide](package.md).

Check the final HTTPS origin: liveness must return 200, readiness 503 while
disabled, and mutations must deny without backend effects. Resolve diagnosis,
login discovery and TLS failures before proceeding. Record actual backend and
recovery evidence before enabling isolated staging activation through the GUI;
export again, stop the old process, replace configuration, diagnose and restart.
Use the same origin, binding and storage. Enter acceptance references only after
the corresponding checks pass. Readiness 200 alone is not full service acceptance.

## 4. Create an unfunded account and access it as application A

Open **API reference → Open deployed Try it out**, or the provider origin plus
`/docs/`. Use **Application tokens** to sign in as an allowed token operator,
select application A and get scopes `wallet:access`, `wallet:access:read`,
`wallet:provision` and `wallet:account:read`. If the broker is not configured,
use the documented [manual token path](http-api.md#try-deployed-apis) with the
same registered client. Do not change the token profile to bypass authentication.

In Swagger, execute `POST /v1/access-requests` with a new UUIDv4 idempotency key:

```json
{
  "mode": "create",
  "authorization_details": [
    {
      "type": "https://moovha.com/wallet/account-access",
      "actions": ["account:read"]
    }
  ]
}
```

Open the returned consent URL as a top-level browser navigation. Sign in as the
approved test owner and select **Allow requested access**. For a new vendor check,
choose **Continue verification**, then **Continue to identity verification** on
the handoff page. Resuming the request uses its existing vendor session. Complete
the configured vendor test verification, or import authorized test evidence through
`POST /v1/access-requests/{requestId}/identity`. In a separate reviewer browser
session, open `/onboarding/review`, inspect the actual evidence, establish its
owner binding and original verification date, and accept only if it meets policy.
Vendor approval alone must leave the request awaiting provider review.

Poll `GET /v1/access-requests/{requestId}` as A until granted. Retain the request,
grant and account IDs privately. Execute `POST /v1/accounts/{accountId}/provision`
with `{}` and a new UUIDv4 idempotency key; retain this exact key. Then execute
`GET /v1/accounts/{accountId}` as A. The result must be provisioned and contain
the original address. Confirm the account has no native test-network funds using
a read-only explorer/RPC lookup. Do not fund it or request signing.

These requests validate the registered application's API access through Swagger.
To validate your product integration, also call the same HTTP routes from the
product using its own server-held credentials.

## 5. Exercise policy denials in the deployed GUI

| Action                                                                                | Expected result                                                                        |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Clear authorization and read the account                                              | Authentication denial; no provider effect.                                             |
| Obtain A's token without `wallet:account:read` and read                               | Scope denial.                                                                          |
| Select application B and read/provision A's account without B consent                 | Current-grant/object denial, despite a valid token and scopes.                         |
| Sign in as another owner and attempt to manage the first owner's grant                | Owner isolation; no grant changes.                                                     |
| Sign in as an owner at `/onboarding/review`                                           | Review denied unless that subject is independently a configured reviewer.              |
| Pause access at `/onboarding/access`, then read or replay provisioning as A           | Both denied, including replay of a prior success.                                      |
| Reconnect as A with `mode: connect` and the original account ID                       | Fresh owner consent required; the existing wallet is retained.                         |
| Revoke that new grant, then read as A                                                 | Denied. Reconnection requires another request/consent.                                 |
| Change the policy in the wizard, export, stop/replace/restart, then use the old grant | Stale-policy denial; follow current consent/identity requirements before new access.   |
| Let the grant expire naturally, then read/replay                                      | Denied; reading must not extend its expiry. Mark pending until the real expiry occurs. |

Retain status codes and sanitized outcome summaries. Keep request bodies, tokens,
signatures, full consent URLs, account/identity identifiers and vendor evidence
out of logs and public reports. Stop on an unexpected authorization success.

## 6. Exercise durable replay and recovery

Replay the original provisioning request with its original key. Submit concurrent
identical requests. They must resolve to the same account/address without another
creation; an in-flight conflict/pending response is not permission to use a new key.
Restart the supplied service normally with its original configuration/storage and
repeat the read/replay. Retain evidence that the provider did not create again.

Stop the service and take a protected, consistent backup of its private SQLite
directory and required backend access material; OWS additionally needs its vault.
Use the [storage backup guidance](storage.md). Restore on the same staging binding
with the original service stopped. Start exactly one authoritative service and
verify the same account/address and replay result. Never run a restored second
authority beside the original.

For a lost-response exercise, use a reviewed ingress/network fault procedure
for this staging deployment that discards a response **after dispatch**. Retain
the original request/key. A timeout alone does not prove dispatch or recovery.
Remove the fault before recovery. If the provider outcome is unknown, it must
remain pending/unknown across restart without another creation. As reviewer, use
**Check wallet creation** on the original account at `/onboarding/review`; this
performs read-only lookup. A confirmed original wallet may restore its receipt.
A lookup miss does not authorize a replacement account or fresh attempt.

If the host has no reviewed fault mechanism, mark lost-provider-response testing
blocked. Client-side replay and inserted fixture state do not test a lost provider
response. Power-loss and crash-during-commit recovery require separate host-level
tests and evidence.

## 7. Decide acceptance and retain the deployment

Record each step as **passed**, **failed**, **blocked** or **pending**, with the
actual GUI/CLI path and dependency used. A full configured-service rehearsal
passes only after its required real dependencies and recovery cases pass. Keep
the staging deployment and its records private, supervised and recoverable;
record whether it remains running or has been stopped. Do not delete a wallet,
rotate credentials or remove authority records as routine cleanup.

The published [CDP evidence summary](conformance.md#isolated-cdp-staging-exercise-16-october-2026)
covers provisioning and recovery with a custom host and synthetic login/identity
services. It does not validate this configured-service walkthrough or your deployment.
