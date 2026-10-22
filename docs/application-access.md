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
[Applications screen](setup.md) or those configuration fields. Static registrations use
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
and client ID. Matching identity fields in two applications only links wallets through the explicitly configured sharing flow below.
Create requests without a wallet selection resolve to the same default Personal account.
You can also create [additional personal and shared wallets](multiple-wallets.md)
under the person’s current identity checks, with separate consent for each wallet.
Creating the on-chain wallet is a separate step.

`mode: "connect"` requires an `account_id` owned by that application-scoped
user or a current invitation to join that shared wallet. Additional wallets need
`user.consent.account_id`; invited members also need the invitation’s
`membership_revision`. Use the sharing flow below to request a wallet from another application under a reviewed identity-and-consent agreement.
Evidence references cannot be reassigned to another person, and a suspended account
cannot be reactivated by sending a new access request.

## Allow another application to request existing wallets

Sharing is off by default and works within one provider installation and issuer.
In **User checks**, require **ID number**, **Document type** and **Document issuing country**.
Existing users must submit those fields through their application; changing shared
requirements ends previous approvals as described above. The provider does not
perform identity verification itself.

In **Applications**, open the source application (App A), enable **Allow wallet
sharing**, select the requesting application (App B), choose any additional
matching fields, and save your **Sharing agreement reference**. Both applications
must be active with reviewed user-check and consent agreements. The sharing
agreement explicitly trusts B to verify the same person and record permission for
the wallet connection. Enabling A → B does not enable B → A or onward sharing.

ID number, document type and issuing country are mandatory matching fields.
Values are compared exactly as text: preserve leading zeros and agree country
codes, document-type labels, dates and other formats between applications. No
fuzzy matching or case conversion is applied. Choose additional fields carefully:
names can change, and residence country is different from document issuing country.

For the developer integrating App B:

1. Authenticate as B. Read `GET /v1/access-policy?source_application_id=APP_A_CONNECTION_ID`.
   Use A’s connection ID (`client_id`) from Applications, not the hashed transaction-policy application ID.
2. Show the person that B will connect to their existing wallet, the requested
   permissions, the source application and the current terms. Record B’s own
   consent; A’s earlier consent cannot authorize B.
3. Submit `POST /v1/access-requests` using B’s stable user reference, verified
   identity evidence and normal authorization details. Set `mode` to
   `connect_from_application`, add `source_application_id`, and omit `account_id`.
   Include `source_application_id` and `sharing_revision` in `user.consent` using
   the returned `wallet_sharing.revision`. Transaction consent also needs B’s own
   `action_policy_revision`.
4. Save B’s returned grant and account IDs. A unique current identity match reuses
   A’s default Personal account and wallet. To select another wallet, supply
   `source_account_id` and record that ID in `user.consent.account_id`. Missing, mismatching or ambiguous evidence denies access
   without revealing another application’s identity records. The default Personal connection cannot be rebound to a different account.
   Additional wallet connections need explicit wallet selection and consent.
   A wallet received from A cannot be shared onward through B.

```json
{
  "mode": "connect_from_application",
  "source_application_id": "APP_A_CONNECTION_ID",
  "user": {
    "id": "APP_B_PRIVATE_USER_REFERENCE",
    "identity": {
      "reference": "APP_B_VERIFIED_EVIDENCE_REFERENCE",
      "level": "verified",
      "verified_at": "2030-01-01T09:00:00.000Z",
      "fields": {
        "identity_number": "0000000000001",
        "document_type": "national_id",
        "issuing_country": "ZA"
      }
    },
    "consent": {
      "reference": "APP_B_FRESH_CONSENT_REFERENCE",
      "granted_at": "2030-01-01T10:00:00.000Z",
      "expires_at": "2030-01-02T10:00:00.000Z",
      "policy_revision": "CURRENT_POLICY_REVISION",
      "source_application_id": "APP_A_CONNECTION_ID",
      "sharing_revision": "CURRENT_SHARING_REVISION"
    }
  },
  "authorization_details": [
    {
      "type": "https://moovha.com/wallet/account-access",
      "actions": ["account:read"]
    }
  ]
}
```

These are illustrative placeholders and a fictional document number. Use current
UTC evidence, returned revision hashes and every required identity field. B receives
its own limited, expiring grant, not A’s permissions or KYC response. B must publish
its own transaction rules and have accepted services, sponsorship and prepared fee
infrastructure before requesting transactions. Its transactions use the existing
Safe and B’s fee funding; B cannot provision a second wallet over the shared account.
If A has not created the wallet yet, A must provision it first.

Withdrawing either application’s wallet consent leaves the other application’s
approval in place. Pausing an application, removing its identity trust, or changing
or disabling A’s sharing settings blocks dependent B access. Re-enabling sharing
requires fresh consent to its new revision. Sharing does not replace wallet
ownership. Source evidence updates, expiry or changed requirements can also require
B to reconnect; permissions and matching evidence are rechecked before account use
and financial effects. Already-issued signatures remain subject to their on-chain expiry.

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
