---
prev: { 'text': 'Use an existing wallet', 'link': '/docs/connect-wallet' }
next:
  { 'text': 'Test the full connection', 'link': '/docs/staging-walkthrough' }
---

# Send a small transfer between wallets

Let’s move a small amount of test tokens from one person’s wallet to another.
We will call them **Wallet A** and **Wallet B**. The person using Wallet A approves
the transaction in your application; Wallet B receives the tokens at its Safe address.

This example uses a test token on **Base Sepolia**, a test network. The requests
send an actual test transfer, so use an agreed isolated environment and a small
funding limit.

## Have both wallets ready

Follow [Create a first wallet](create-wallet.md) for two distinct approved test
users. Keep their user and account IDs separate. Confirm both ready Safe addresses
on Base Sepolia, and that Wallet A holds the agreed test-token amount.

Ask your developer and provider operator to prepare a rule that permits this
particular token, recipient and amount. The application also needs accepted
services and funded fee-paying infrastructure. The person’s token balance and
the application’s network-fee balance are separate.

<details>
<summary>Developer preparation: a bounded token-transfer rule</summary>

Publish the application policy through the [policy workflow](runtime-configuration.md).
Allow the chosen token’s exact `transfer(address,uint256)` method and verified
runtime/code pins. Include `call_adapters.tokenTransfers` for the same token,
Wallet B as the permitted recipient, `maximumAmount: "10000"` and, for this
example, `lifetimeAmount: "100000"`. These are token base units: for a six-decimal
token, 10,000 units is **0.01 tokens**. Verify the token’s decimals rather than
assuming every asset uses six.

Set `maximum_calls: 1` and `maximum_native_value_wei: "0"`. The transfer call
carries zero native value; it moves tokens through the token contract. Set the
method’s `maximum_value_wei` to `"0"` too. Do not bind the recipient argument to
the sender through `user_address_parameters`: this example sends to Wallet B.
Verify proxy implementation pins too when applicable.

Register and accept an action named `send_test_token` with a meaningful description
and `fields: []`. The request below uses that exact name and an empty metadata
payload. Metadata does not replace the token, recipient or amount restrictions.
Use current revisions and the [HTTP schemas](http-reference.md) for complete
policy and obligations submissions; these settings describe a policy, not a
standalone submission body.

</details>

## 1. Show the person what they are allowing

In Wallet A’s application, show the test network, token, **0.01 tokens**, Wallet B’s
full receiving address and who pays the network fee. Let the person review and
approve the permitted transaction terms. Read the provider’s current rules and request permission to view the wallet and
request these approved transactions for that person.

<details>
<summary>Developer permission and token requirements</summary>

Use the [access-request body](create-wallet.md#_1-ask-for-permission-in-your-application)
for Wallet A’s user, requesting `["account:read", "contracts:request"]`. Include
`user.consent.action_policy_revision` from the latest `GET /v1/access-policy`,
alongside its `policy_revision`. Capture consent to the actual published call
terms and limits; add any required runtime identity fields. Do not simply copy
Wallet B’s grant or treat an administrator’s acceptance as user consent.

The application token needs `wallet:access:read`, `wallet:actions`, `wallet:sign`
and `wallet:execute` to send, plus `wallet:execute:read` to read status. Obtaining
or renewing user access also needs the access scopes described in the
[user-access guide](application-access.md). All scopes must be allowed for the
application. Scopes alone never authorize a transfer.

</details>

## 2. Send the request once

Your server submits the approved transfer through Wallet A’s wallet endpoint.
Save a unique tracking reference, called a **batch ID**, before sending, and show
the person that their request is in progress. Keep this reference through
timeouts and retries.

<details>
<summary>Developer request: encode and submit the transfer</summary>

Use your blockchain library to encode the token’s `transfer` call. For example,
with `ethers` in your application’s server project:

```js
import { Interface } from 'ethers';

const tokenInterface = new Interface([
  'function transfer(address recipient, uint256 amount)',
]);
const transferData = tokenInterface.encodeFunctionData('transfer', [
  walletBSafeAddress,
  10000n,
]);
```

`walletBSafeAddress` is Wallet B’s verified Base Sepolia Safe address. Send this
body to `POST /v1/accounts/{walletAAccountId}/wallet` with the application bearer
token and `Content-Type: application/json`:

```json
{
  "jsonrpc": "2.0",
  "id": "transfer-request-1",
  "method": "wallet_sendCalls",
  "params": [
    {
      "version": "2.0.0",
      "id": "<BATCH_ID_SAVED_BEFORE_SENDING>",
      "from": "<WALLET_A_SAFE_ADDRESS>",
      "chainId": "0x14a34",
      "atomicRequired": true,
      "calls": [
        {
          "to": "<APPROVED_TEST_TOKEN_CONTRACT>",
          "value": "0x0",
          "data": "<ENCODED_TRANSFER_DATA>"
        }
      ],
      "capabilities": {
        "applicationAction": {
          "name": "send_test_token",
          "payload": {}
        }
      }
    }
  ]
}
```

Replace each placeholder. `to` is the **token contract**, while the encoded
recipient is **Wallet B**. The endpoint account and `from` identify **Wallet A**.
`0x14a34` is Base Sepolia’s chain ID. This example does not transfer ETH or enable
another network.

The outer JSON-RPC `id` matches a response to a request. The inner `params[0].id`
is the retained **batch ID**: choose a stable unique value, such as a UUID, and
keep it with the exact original body. The wallet JSON-RPC route uses this batch
ID for replay identity; an HTTP `Idempotency-Key` alone does not deduplicate it.
Omitting the inner ID lets the service generate one, which is unsuitable for a
retry after losing the first response. Keep the same inner ID when investigating or retrying the original request. An
already admitted ID returns JSON-RPC error `5720` (Duplicate ID); read its saved
status instead of choosing a new ID. Do not change the original body to work
around an uncertain outcome.

An accepted response contains `result.id`. Inspect JSON-RPC `error` even when the
HTTP status is 200. Acceptance means the batch was retained, not that tokens moved.

</details>

## 3. Confirm the result before saying it is complete

Check the saved batch’s status. Keep “in progress” visible while the result is
pending or uncertain. A timeout does not prove the transfer failed.

<details>
<summary>Developer request: read the original batch</summary>

On Wallet A’s same endpoint, send:

```json
{
  "jsonrpc": "2.0",
  "id": "transfer-status-1",
  "method": "wallet_getCallsStatus",
  "params": ["<THE_SAME_SAVED_BATCH_ID>"]
}
```

Use a token with `wallet:access:read` and `wallet:execute:read`, and current
`account:read` authority. `result.status: 100` means pending, `200` means
independently verified success, and `400` or `500` reports a failure outcome.
These are wallet status values, distinct from the HTTP status. Preserve the
original result and receipt when investigating any failure; do not automatically
send another transfer. Verified inclusion, chain finality and the application’s
business settlement are separate outcomes.

</details>

After verified success, independently check that the exact test-token amount
reached Wallet B on the chosen network. Wait for the required network
confirmations before showing the person the application’s final confirmation.

**You are done when** the original batch has a verified successful result and the
agreed amount reached Wallet B. Next, [test retries, withdrawal and recovery](staging-walkthrough.md)
before extending this experience to real users.
