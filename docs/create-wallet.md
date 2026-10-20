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
- Accepted [application rules, services and fee funding](application-obligations.md),
  with the wallet infrastructure provisioned and the service approved for a
  controlled test. Creating a Safe requires network infrastructure even if the
  person has no assets yet.

The person does not need to supply a private key. The service creates a Safe,
their on-chain wallet, and keeps its private signing identity in the provider’s vault.

## 1. Ask for permission in your application

Sign the person in and complete the agreed identity checks. Use your stable,
private user reference to identify them; a display name or email is not an account
lookup. Read the provider’s current access policy, explain the requested access
and record the person’s permission.

For a first wallet, start with permission to view the account. Request transaction
permission separately when you can show the person the actual permitted calls
and limits.

<details>
<summary>Developer requests: identify the application and obtain access</summary>

Obtain an application access token as described in the [API guide](http-api.md#_1-identify-your-application).
Read `GET /v1/access-policy` with `wallet:access:read`. Submit
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
      "policy_revision": "<CURRENT_POLICY_REVISION>"
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

Replace every angle-bracket value with a real record or current policy value.
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
Idempotency-Key: <SAVED_UUIDV4_FOR_THIS_PROVISION_REQUEST>
Content-Type: application/json

{}
```

Use the account ID from the granted access request. This is a distinct mutation,
so its key differs from the access-request key. Read the saved outcome after an
uncertain response. Current permission and provider readiness remain required.

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
