---
prev: { 'text': 'Connect an application', 'link': '/docs/runtime-workspace' }
next:
  {
    'text': 'Transactions and fee limits',
    'link': '/docs/application-obligations',
  }
---

# Help people connect their wallets

People sign in, complete user checks and give wallet permission inside the
connected application. They do not need a second provider login in the standard
flow. Your service checks the application’s evidence and saves a limited approval.

This page is for you and the developer implementing that experience. Start with
[adding the application](runtime-workspace.md) if it does not yet have connection details.

## Agree the user checks first

Record a reviewed agreement for the application’s identity checks and consent.
Choose its permitted owner actions in **Applications**. The application must
perform the checks it reports, retain supporting records and communicate withdrawals
promptly. The toolkit validates submitted evidence; it does not contact an identity
vendor to repeat these checks.

Open **User checks** in `/admin/` to choose required identity information, the
maximum age of checks and how long wallet permission lasts. Exact field names and
the agreed verification label are under **Developer details and additional information**. These are policy requirements, not
facts established by registering an application. The example configuration uses
`verified`, requires `country`, allows evidence up to 90 days old and caps access
at seven days. Choose requirements appropriate to your product.

<details>
<summary>Policy settings for a developer maintaining configuration</summary>

The standard flow uses `policy.access.mode: "application"`,
`policy.identity.application.verificationLevel` and `requiredFields`. API-managed installations save shared requirements through **User checks** in
administration. `GET /v1/provider/user-checks` reads the settings and their revision;
`POST /v1/provider/user-checks` saves them with `expected_revision` and an
`Idempotency-Key`, using a provider operator token. The saved settings override
installation defaults and persist across restarts. Changed settings revoke all
wallet approvals and deny pending access requests; identical saves preserve them.
Static installations use the advanced
[Applications screen](setup-wizard.md#_4-applications) or those configuration fields. Static registrations use
`policy.applications[].assertionTrust.agreement`; API-managed registrations use
the application’s identity/consent agreement instead. Do not combine registration
authorities in one deployment.

Verification levels must match the agreed value exactly. Nonempty required fields
check presence, not country eligibility or arbitrary risk rules. The built-in
age and access controls accept 1–365 days. More complex acceptance rules require
a reviewed [host integration](provider-guide.md). Changing policy invalidates old
grants; applications must read the current terms and obtain fresh consent.

</details>

## Build the permission experience

1. Read `GET /v1/access-policy` using an application token with `wallet:access:read`.
2. Show the person the requested actions, current terms and access duration.
   Record their permission before sending an access request.
3. Submit their stable private user reference, identity evidence and consent to
   `POST /v1/access-requests` with `wallet:access` and a new UUIDv4 `Idempotency-Key`.
4. Save the returned request, account and grant IDs. A granted response contains
   permissions and expiry; the standard flow returns no provider consent URL.

An application token identifies the application. It cannot establish who the
person is or grant permission to use their wallet by itself.

<details>
<summary>Request example and evidence rules</summary>

```json
{
  "mode": "create",
  "user": {
    "id": "your-stable-private-user-reference",
    "identity": {
      "reference": "your-identity-evidence-reference",
      "level": "verified",
      "verified_at": "2030-01-01T09:00:00.000Z",
      "fields": { "country": "ZA" }
    },
    "consent": {
      "reference": "your-recorded-consent-reference",
      "granted_at": "2030-01-01T10:00:00.000Z",
      "expires_at": "2030-01-02T10:00:00.000Z",
      "policy_revision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  },
  "authorization_details": [
    {
      "type": "https://moovha.com/wallet/account-access",
      "actions": ["account:read", "operations:request"]
    }
  ]
}
```

These are fictional values. Use the returned policy revision, actual UTC records
and your own evidence references. Include only required identity fields. Neither
identity verification nor consent may be dated in the future. Consent expiry must
fit `max_access_days`; identity age must fit `max_identity_age_days`. The grant
expires at the earliest identity, consent or provider limit.

The policy response also reports `verification_level`, `required_fields`,
`provider_login_required: false`, `provider_review_required: false` and
`owner_consent_required: true`. The last value means consent must already have
been captured by the application.

Malformed evidence returns 422; untrusted, stale or conflicting authority returns 403. Reusing a key with different input returns 409. Inspect the saved request
with `GET /v1/access-requests/{requestId}` and `wallet:access:read`.

</details>

## Keep each person’s account separate

Use a stable private user ID. The provider scopes it to the application’s issuer
and client ID: matching names, emails or IDs in two applications never link wallets.
Repeated create requests for the same application user resolve to one account.
Creating the on-chain wallet is a separate step.

`mode: "connect"` requires an `account_id` belonging to that same application-scoped
user. Cross-application linking requires a separately verified ownership integration.
Evidence references cannot be reassigned to another person, and a suspended account
cannot be reactivated by sending a new access request.

## Create the wallet and request transactions

With a current approval, call `POST /v1/accounts/{accountId}/provision` using
`wallet:provision`, an empty JSON body and an idempotency key. Read the result with
`GET /v1/accounts/{accountId}` and `wallet:account:read`. Keep the original key if a
response is lost; a new key must not be used to bypass an uncertain attempt.

Transaction access additionally requires `contracts:request` consent for the exact
`action_policy_revision`. Show the permitted calls and limits before obtaining
that consent, then use the [wallet API](wallet-calls.md). The provider rechecks
current owner, identity, consent, policy and grant before effects and saved results.

## Let people change their minds

Provide a clear way to withdraw access in the application. Call
`POST /v1/access-grants/{grantId}/revoke` using `wallet:access`, the same caller,
an empty body and an idempotency key. Repeating revocation is safe. It blocks
future access and signing, including superseding grants based on the same consent.
Already-issued signatures can remain usable until their on-chain expiry.

To reconnect, obtain new consent with a new reference and a grant time after the
withdrawal, then request access again. Old consent and replayed requests cannot
restore revoked access. A policy change also requires fresh consent to its terms.
Use request-status reads to investigate the earlier outcome.

Keep application/user IDs, vault bindings and recovery records across restarts.
Changing the application identity is not an account migration. Next,
[test the connection](staging-walkthrough.md), including withdrawal and retry cases.
