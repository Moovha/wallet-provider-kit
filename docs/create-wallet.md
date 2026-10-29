---
prev: { 'text': 'Connect an application', 'link': '/docs/runtime-workspace' }
next: { 'text': 'Use an existing wallet', 'link': '/docs/connect-wallet' }
---

# Create someone’s first wallet

You have added your application. Now let’s give one person a wallet and show them
where they can receive assets. They stay in your application throughout; your
server talks to the provider on their behalf.

This walkthrough is for the application team and its developer. Use an isolated
test environment and an approved test identity for your first run.

## Have these ready

- The application’s connection details and the provider’s address.
- An accepted [agreement for user checks and consent](application-access.md).
- Published application transaction rules, or provider-enabled
  [trusted-app transaction permissions](runtime-configuration.md#trust-an-application-without-transaction-restrictions),
  on the selected network.
- Accepted [application rules, services and fee funding](application-obligations.md),
  with the wallet infrastructure provisioned and the service approved for a
  controlled test. Creating a Safe requires network infrastructure even if the
  person has no assets yet.

The person does not need to supply a private key. The service creates a Safe,
their on-chain wallet, and keeps its private signing identity in the provider’s vault.

## Create an address before collecting KYC

A trusted application can create a wallet before collecting identity information.
The provider still needs configured wallet services, accepted fee terms and funded
setup infrastructure. This creates the wallet address without issuing permission
to sign or send transactions. Setup uses the application's accepted network-fee
allowance.

From your application backend, call `POST /v1/accounts` with `wallet:access`, a
saved UUIDv4 `Idempotency-Key` and this body:

```json
{ "user_id": "<YOUR_STABLE_USER_REFERENCE>" }
```

Save the returned `account_id`. Then call
`POST /v1/accounts/{accountId}/provision` with `wallet:provision`, another saved
idempotency key and `{}`. Omit `Wallet-Grant-Id`; this account has no access grant.
The creating application receives the Safe address after setup succeeds. Use that
address with the selected network. Retrying the same provisioning request recovers
the original attempt; an uncertain result does not authorize a second deployment.

The account stays bound to the creating application's issuer, client ID and stable
user reference. A different application cannot provision an unverified account or
read or update its KYC, even if it later obtains a shared-wallet grant. Accounts
without a recorded creating application cannot use the KYC update API.

### Add or correct KYC in stages

Read `GET /v1/accounts/{accountId}/kyc` with `wallet:access` to obtain the current
`revision`, draft `fields` and `missing_fields`. Send
`PATCH /v1/accounts/{accountId}/kyc` with the same application identity,
`wallet:access`, a saved idempotency key and the revision you read:

```json
{
  "expected_revision": 0,
  "fields": { "country": "ZA" }
}
```

Use the identity fields configured by the provider. Only configured required
fields are accepted. Omitted fields remain unchanged; a `null` value removes a
field. Each accepted patch advances the revision. A stale revision or a reused
key with a different body returns a conflict. Retry an uncertain patch with its
original body and key; read the current revision before making another edit.

Draft fields are not verified evidence, even when `missing_fields` is empty.
Every accepted patch invalidates the owner's previous identity acceptance and
revokes existing grants across their wallets, including shared access. Previously
issued signatures and submitted transactions may still execute. Saving new facts
cannot renew old permissions.

When verification is complete, use the access request in step 1 below with the
same stable user reference, complete current verified identity evidence and fresh
consent. `mode: "create"` resolves to the reserved default account; named wallets
must use their original wallet description and consent binding. The access request
must supply a complete identity assertion; draft fields are not silently promoted.
The existing Safe address is retained. The TypeScript client provides
`createAccount`, `accountKyc` and `updateAccountKyc`; call
`provision(accountId, undefined, idempotencyKey)` for initial setup without a grant.

## 1. Ask for permission in your application

Sign the person in and complete the agreed identity checks. Use your stable,
private user reference to identify them; a display name or email is not an account
lookup. Read the provider’s current access policy, explain the requested access
and record the person’s permission.

For creation through a verified access grant, request permission to view the
account and request transactions within the application's approved rules. Show the person the network,
permitted calls, amounts, limits and who pays the fees before collecting consent.
Read-only permission can open an existing wallet, but cannot create a new Safe.
If the person has not approved the transaction terms, stop before provisioning.

<details>
<summary>Developer requests: identify the application and obtain access</summary>

Obtain an application access token as described in the [API guide](http-api.md#_1-identify-your-application).
Read `GET /v1/access-policy` with `wallet:access:read`. Present its
`contract_call_terms` and `runtime_contract_terms`, when supplied, and present the current transaction terms. Supply the exact
`action_policy_revision` when you need to reject changes since the person reviewed
them; omitted policy revisions bind to the current terms at acceptance. Do not request transaction
permission when the current terms or revision are unavailable. Submit
`POST /v1/access-requests` with `wallet:access` and a saved UUIDv4 `Idempotency-Key`.
For a policy requiring `country`, the body has this shape:

```json
{
  "mode": "create",
  "user": {
    "id": "<YOUR_STABLE_USER_REFERENCE>",
    "identity": {
      "reference": "<YOUR_IDENTITY_CHECK_RECORD>",
      "level": "<REQUIRED_VERIFICATION_LEVEL>",
      "verified_at": "<ACTUAL_UTC_VERIFICATION_TIME>",
      "fields": { "country": "<VERIFIED_COUNTRY>" }
    },
    "consent": {
      "reference": "<YOUR_CONSENT_RECORD>",
      "granted_at": "<ACTUAL_UTC_CONSENT_TIME>",
      "expires_at": "<PERMITTED_UTC_EXPIRY>",
      "policy_revision": "<CURRENT_POLICY_REVISION>",
      "action_policy_revision": "<APPROVED_ACTION_POLICY_REVISION>"
    }
  },
  "authorization_details": [
    {
      "type": "https://moovha.com/wallet/account-access",
      "actions": ["account:read", "contracts:request"]
    }
  ]
}
```

Replace every supplied angle-bracket value with a real record or current policy
value. You may omit `consent.reference`, both consent policy revisions and
`identity.level`; the provider saves their effective values and returns consent
metadata in the access receipt. Consent times and identity evidence remain required.
Adapt identity fields to the service’s requirements. This template does not
perform verification or capture consent. Times must satisfy the
[evidence rules](application-access.md#build-the-permission-experience).

A granted response supplies `account_id`, `grant_id`, `request_id`, permissions
and expiry. Save these against the person’s private user reference. A grant is
saved permission; it does not mean the on-chain wallet has been created yet.

</details>

## 2. Create the wallet

With access granted, ask the service to create the wallet. Keep the saved request details until you have its result. If a response is lost,
reuse those details to check or retry the original request; do not start another
wallet-creation attempt.

<details>
<summary>Developer request: provision the account</summary>

Using the same application identity with `wallet:provision`, send:

```http
POST /v1/accounts/<ACCOUNT_ID>/provision
Authorization: Bearer <APPLICATION_ACCESS_TOKEN>
Wallet-Grant-Id: <GRANT_ID>
Idempotency-Key: <SAVED_UUIDV4_FOR_THIS_PROVISION_REQUEST>
Content-Type: application/json

{}
```

Use the account and grant IDs from the granted access request. The grant must
include current `contracts:request` permission for the approved action-policy
revision; `wallet:provision` alone is insufficient. This is a distinct mutation,
so its key differs from the access-request key. Read the saved outcome after an
uncertain response. Current permission and provider readiness remain required.
Read `GET /v1/access-requests/{requestId}` to recover the access decision, or use
`client.accessRequest(savedRequestId)` with the TypeScript wallets client. This
reads the access grant, not the provisioning transaction's outcome. Read the
account and reconcile its original provisioning attempt separately.

</details>

## 3. Show the person their receiving address

Read the account after provisioning. Show the returned Safe address with its
network, for example **Base Sepolia · test network**. This is the address the
person shares to receive assets on that network. Their account ID is your API
reference; it is not their deposit address. The private OWS signer address is
also not their deposit address.

<details>
<summary>Developer request: get the wallet details</summary>

Call `GET /v1/accounts/{accountId}` with `wallet:account:read` and current
`account:read` permission. Only display the returned address once the Safe is
ready. Save the account binding and network in your application’s private records;
do not log identity evidence, tokens or complete responses.

</details>

**You are done when** the same signed-in person can see their ready Safe address
and the correct network. No transfer has happened. Next, learn how to
[reopen an existing wallet](connect-wallet.md), or prepare a
[small test transfer](send-transfer.md).
