---
prev: { 'text': 'Create a first wallet', 'link': '/docs/create-wallet' }
next: { 'text': 'Send a small transfer', 'link': '/docs/send-transfer' }
---

# Help someone return to their wallet

Someone who already has a wallet should be able to return to it without receiving
a new address. Use the account you saved for that same person and application.
If their permission has expired or been withdrawn, ask them to approve access again.

This guide covers wallets created for the **same user in the same application**.
To connect a wallet from another application on this provider, use
[application sharing](application-access.md#allow-another-application-to-request-existing-wallets):
the source application must allow yours, verified identity information must match,
and the person gives your application separate consent. An external wallet still
requires a separately verified ownership integration.

## 1. Find the person’s saved account

Sign them in to your application and use your private user reference to retrieve
their saved account reference. If their wallet approval is current, read the account and
show its Safe address and network. Reading it does not create another wallet.

<details>
<summary>Developer request: read the existing account</summary>

Call `GET /v1/accounts/{accountId}` with an application token containing
`wallet:account:read`. The caller must still hold current `account:read` authority
for that account. A token or known account ID alone is insufficient.

If the token expired, obtain a fresh token. If the person’s wallet approval expired
or was revoked, complete the permission step below rather than repeatedly retrying
the read. See [API response handling](http-api.md#_4-handle-retries-without-repeating-effects).

</details>

## 2. Renew permission when needed

Read the current access policy. Show the person which application wants access,
what it will be allowed to do and for how long. Obtain new consent and send a
**connect** request with their saved account ID and current identity evidence.

<details>
<summary>Developer request: connect to the saved account</summary>

Use the complete access-request body from [Create a first wallet](create-wallet.md#_1-ask-for-permission-in-your-application),
with current evidence and a new consent record. Change `mode` to `"connect"` and
add `account_id` at the top level. Keep `user.id` bound to the same application user.
For example, when constructing that complete body on your server:

```js
const connectRequest = {
  ...currentAccessRequest,
  mode: 'connect',
  account_id: savedAccountId,
};
```

Here `currentAccessRequest` is the full body with freshly captured permission,
not a replay of withdrawn consent. Submit to `POST /v1/access-requests` with
`wallet:access` and a new UUIDv4 idempotency key. Keep that key for identical retries.
After withdrawal, the consent reference must be new and its grant time later than
the withdrawal. Transaction permission also needs the current action-policy revision.

Save the new receipt and grant. It should refer to the original account. The
provider checks that it belongs to the asserted application-scoped person.

</details>

## 3. Open the original wallet

Read the account again and show its original Safe address. A ready wallet does
not need to be created again. If its earlier creation is still pending or
uncertain, inspect the original provisioning attempt before doing anything else.

<details>
<summary>Developer recovery: the application lost its account reference</summary>

If your application lost its saved account ID, a `mode: "create"` access request
with the **same stable user ID and application identity** resolves to the existing
account. It still requires valid evidence and consent. It is not an address
search or a way to adopt another person’s wallet. Keep the returned binding so
future visits do not depend on recovery.

</details>

**You are done when** the returning person sees the same account and Safe address,
with a current approval. Next, [send a small transfer](send-transfer.md) or add
[access withdrawal](application-access.md#let-people-change-their-minds) to their settings.

For additional wallets, member invitations and wallet selection, follow
[Personal and shared wallets](multiple-wallets.md).
