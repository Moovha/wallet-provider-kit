# Connect your application through the API

This guide is for the developer connecting an application to a running provider.
Ask the provider operator for its HTTPS address, your application ID and secure
access to its secret. They should first [add your application](runtime-workspace.md)
and agree its user-check and permission settings.

If you are unsure which request to use, start with [Find the API request you need](api-endpoints.md).
It explains each task, who performs it and why similar requests remain separate.
The explorer opens on **Wallet access**; choose **Browse requests by task** to
review administration, agreements, rules, connections or optional integrations.

## 1. Identify your application

For a standard API-managed installation, request a short-lived token from
`/oauth/token` using `grant_type=client_credentials`, your client ID and secret,
and the permitted scopes you need. Keep the secret on your trusted server.
External-issuer deployments use their configured token endpoint instead.

Send the token as `Authorization: Bearer …`. Tokens identify the application;
current user approval and provider policy determine which wallet actions it can take.

## Select a network

Read `GET /v1/networks` to discover this instance’s default and additional networks.
Use `Wallet-Network: ethereum-sepolia` (or another returned network name) when
reading access requirements, submitting access requests, listing a user’s wallets
and configuring application policies, RPC connections and fee sponsorship.
Omitting the header preserves the instance’s default network.

Account, access-request and grant IDs select their stored network automatically,
including existing provisioning and transaction URLs. An explicit selector that
conflicts with a stored ID is rejected. Transaction `chainId` must also match the
wallet. Policy revisions, proposal IDs and application IDs still require the
network selector because application registration is shared. Successful operational
responses include `Wallet-Network`; wallet listings also include `network` and
`chain_id` for each wallet.

The same application token works across configured networks under its current
permissions. Read the selected network’s access policy and collect independent
wallet consent. Existing verified identity can be reused, but a grant or consent
from another network cannot be reused as permission. See [network setup](provider-guide.md#offer-multiple-networks).

The backend client accepts the same selection:

```ts
const ethereum = createWalletsClient({
  url: 'https://wallet.example.com',
  network: 'ethereum-sepolia',
  authorization: applicationAuthorization,
});
const requirements = await ethereum.accessPolicy();
```

Import `createWalletsClient` from `@moovha/wallet-provider-kit/wallets` and supply a
function that returns short-lived application authorization. The client sends the
selection on its requests. `walletProvider(wallet)` also uses the wallet listing’s
network when constructing its transaction and status-stream transport.

## 2. Obtain the person’s permission

Read `GET /v1/access-policy`, complete the agreed user checks and capture consent
inside your application. Submit that evidence to obtain a current account grant.
The [user-access guide](application-access.md) explains this sequence and its
request example. Use stable private user IDs and retain the resulting request,
account and grant IDs.

The three steps have separate effects:

| Task                                   | Request                                   | Result                                                                                                                                 |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Learn what to collect                  | `GET /v1/access-policy`                   | Current required identity fields, check age, permission duration and consent terms. This reads requirements; it does not grant access. |
| Submit completed checks and permission | `POST /v1/access-requests`                | A decision and, when granted, account and approval IDs. This does not create a blockchain wallet.                                      |
| Create the blockchain wallet           | `POST /v1/accounts/{accountId}/provision` | Wallet creation status and address, using the approved account ID. This does not grant spending permission.                            |

The provider operator changes shared requirements under **User checks** in
administration. Your application reads them from the access-policy endpoint.
After requirements change, read the new policy revision and collect fresh consent
before requesting access again.

## 3. Create and use their wallet

Call `POST /v1/accounts/{accountId}/provision` to create the user’s Safe. Discover
its address and capabilities, then send wallet requests to
`POST /v1/accounts/{accountId}/wallet`. Use `wallet_sendCalls` for an approved
atomic batch and `wallet_getCallsStatus` to check its saved outcome. Start with
[wallet calls](wallet-calls.md) for permissions and status meanings.

The provider and application must first agree [transactions, services and network fees](application-obligations.md).
A batch ID acknowledges a retained request; it is not proof of successful execution.

## 4. Handle retries without repeating effects

For REST mutations such as access requests and provisioning, save an
`Idempotency-Key` with the original request and reuse it for identical retries.
For `wallet_sendCalls`, set and save `params[0].id` before sending: this retained
batch ID identifies the wallet request. The outer JSON-RPC ID only correlates
responses, and an HTTP idempotency header alone does not deduplicate wallet calls. A known
batch ID returns JSON-RPC error `5720`; inspect its saved status instead of
creating a fresh request. After a timeout, inspect the original
request or batch; the action may already have reached the network.

| Response       | What to check next                                                                     |
| -------------- | -------------------------------------------------------------------------------------- |
| 401            | Obtain current credentials or a fresh token.                                           |
| 403            | Check scopes, current user permission and provider policy.                             |
| 409            | Compare revisions/input and reconcile the original request.                            |
| Timeout or 503 | Read the saved outcome; do not assume dispatch failed or use a fresh key to bypass it. |

Use the [HTTP schema reference](http-reference.md) for exact request bodies,
responses and route-specific requirements. Then [test the connection](staging-walkthrough.md).

## Follow a worked example

Start with [Create a first wallet](create-wallet.md), then
[reconnect to an existing wallet](connect-wallet.md) and
[send a small transfer](send-transfer.md). The examples keep user permission,
provider acceptance and application tokens separate.

## Try deployed APIs

Your operator can enable `http.documentation` to make the explorer available at
`/docs/` on the provider’s own origin. It sends real requests. Use an isolated
test environment, a scoped application token and disposable approved test accounts.
Some static deployments offer optional [staff token controls](operator-tokens.md);
they are not required for application integration.
