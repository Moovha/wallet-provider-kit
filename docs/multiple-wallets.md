# Personal and shared wallets

Give a verified person a Personal wallet, additional wallets such as savings,
and shared wallets such as household expenses. Their current identity checks can
cover these wallets; every wallet still needs its own permission. Start with a
connected application and the [user checks and consent agreement](application-access.md).

The original **Personal** wallet remains the default. Existing applications that
send `mode: "create"` without a `wallet` field keep using that account and address.
Creating another wallet never moves assets or changes the default. An instance can offer [multiple networks](provider-guide.md#offer-multiple-networks). Each network has separate wallets and consent; the same verified profile can cover them.

## Keep the application experience simple

Show a wallet switcher with **Personal** selected initially. List the person’s
currently connected wallets, their names and whether the person owns or has joined
each one. Offer **Add personal wallet** and **Create shared wallet**. Ask for a
name and show the requested permissions before recording consent.

For shared wallets, offer two member permissions: **View wallet** and **Make
approved transactions**. Only the owner can manage members, and only when both
the application and that owner have approved member management. An invitation
alone gives no access. Ask the invited person to accept the selected wallet and
its permissions inside the application.

The toolkit supplies the API and backend client for these controls. The connected
application supplies the wallet switcher, consent screens and invitation delivery.
Administrative Applications settings control which actions an application may
request; they do not replace the person’s permission.

## Add a wallet without repeating current user checks

Read the current access policy and obtain wallet-specific consent. Send
`POST /v1/access-requests` with `mode: "create"` and:

```json
{
  "wallet": {
    "reference": "household",
    "name": "Household expenses",
    "kind": "shared"
  }
}
```

Include the normal `user` and `authorization_details` objects described in the
[access guide](application-access.md#build-the-permission-experience). Set
`user.consent.wallet_reference` to `household`. Use `kind: "personal"` for a
separate privately owned wallet. Keep `reference` stable: the same application,
user and reference resolve to the same account. Changing that reference creates
a different wallet; reusing it with another name or kind returns a conflict.
The reference `personal` is reserved for the original default wallet.

You can omit `user.identity` when the provider has current checks for the exact
application and private `user.id`. The provider reuses the saved evidence and its
original verification date. Expired checks, changed requirements or changed trust
require new evidence. Identity reuse cannot cross applications or user references.
Each request still needs fresh consent to the current terms, with a different
consent reference for each wallet. Refreshing identity evidence does not renew
existing wallet permissions.

Save `account_id` and `grant_id`. The creating application provisions each wallet
separately through the existing provisioning flow. Members and applications
connecting an existing wallet cannot provision over it. Creation uses the current
provider signing backend and fee requirements; it does not transfer existing funds.

## List and select a person’s wallets

`POST /v1/accounts/query` accepts `{ "user_id": "YOUR_PRIVATE_USER_REFERENCE" }`
with an application token carrying `wallet:account:read` and a UUIDv4
`Idempotency-Key`. It returns only that application user’s currently consented
wallets, including `account_id`, `wallet`, `role`, `is_default`, `grant_id`,
`permissions` and `expires_at`. It does not reveal unaccepted invitations or other
people’s wallets. Keep saved account references so the application can offer
renewal when a wallet’s permission expires.

Pass the selected `grant_id` as **Wallet-Grant-Id** on account, membership and
transaction requests. Shared wallets require this header so two people in the
same application cannot accidentally use each other’s permission. The header is
a selector: the provider still verifies its caller, wallet, user, consent and
permissions. Existing single-owner personal wallet calls can omit it.

For renewal, use `mode: "connect"`, `account_id` and
`user.consent.account_id`. Revoking one wallet grant leaves other wallets and
other members’ grants in place.

### Backend client

Use the `./wallets` client in the trusted application backend. Never embed an
application secret or backend bearer token in a browser. Authenticate the person
in your application before choosing their private user reference or grant.

```ts
import { createWalletsClient } from '@moovha/wallet-provider-kit/wallets';

const client = createWalletsClient({
  url: 'https://wallet.example.test',
  network: 'base-sepolia',
  authorization: getApplicationBearerAuthorization,
});
const { accounts } = await client.listWallets(authenticatedPrivateUserId);
const selected = accounts.find((wallet) => wallet.is_default);
if (selected) {
  const details = await client.account(selected.account_id, selected.grant_id);
  const transactions = client.walletProvider(selected);
  // Forward only authenticated, user-approved wallet calls to this adapter.
}
```

Select an enabled network (`base`, `base-sepolia`, `ethereum` or `ethereum-sepolia`) and supply your token
callback and authenticated user ID. `walletProvider(selected)`
implements the existing [wallet calls adapter](wallet-calls.md) and automatically
carries the selected account and grant. `requestAccess`, `provision`, `members`
and `saveMember` cover access and membership. Use `revokeAccess(grantId, key)`
when the person disconnects a wallet; retain the same key for a retry. Mutation methods require you to
retain a UUIDv4 idempotency key for retries; the client does not retry mutations
automatically. See the [TypeScript reference](api-reference.md#personal-and-shared-wallets)
for signatures.

## Invite and manage members

In **Applications**, allow **Let wallet owners manage shared-wallet members**.
Capture the owner’s `members:manage` consent for the shared wallet. This action
is separate from viewing or requesting transactions.

1. Read `GET /v1/accounts/{accountId}/members` using the owner’s
   `Wallet-Grant-Id` and `wallet:access` scope.
2. Save an invitation with `POST` to the same URL, a new `Idempotency-Key`, and:

   ```json
   {
     "expected_revision": 0,
     "user_id": "INVITED_PRIVATE_USER_REFERENCE",
     "name": "Alex",
     "enabled": true,
     "permissions": ["account:read"]
   }
   ```

3. Use the returned settings `revision` on the next save. Keep the invited
   member’s `membership_revision`. Deliver the invitation through your application.
4. When the member accepts, submit their own access request with `mode: "connect"`,
   `account_id`, their own identity evidence or reusable current checks, and fresh
   consent containing `account_id` and `membership_revision`. Request only the
   invited permissions. An approval returns that member’s own `grant_id`.

Add `contracts:request` to allow approved transactions. It also requires the
member’s consent to the current transaction policy and all normal transaction,
fee and durable-attempt checks. Members cannot provision wallets, manage other
members or become the wallet owner through this API.

Update an existing member using `member_id` instead of `user_id`. Changing their
settings invalidates previous grants and requires fresh acceptance. To remove a
member, save `enabled: false` with the current settings revision. Removal blocks
future access and provider signing, including signing for admitted attempts.
Already-issued signatures can remain usable until their on-chain expiry.
The creator cannot be removed or transferred through member management.

## Connect wallets across applications

The existing [application-sharing agreement](application-access.md#allow-another-application-to-request-existing-wallets)
is still required. `connect_from_application` without `source_account_id` selects
the source user’s default Personal wallet. To select another wallet, include its
`source_account_id` and record that ID in `user.consent.account_id`, together with
the source application and current sharing revision. The requesting application
gets its own wallet-specific permissions; identity matching does not copy consent.
Changes to source identity evidence can require the source owner and requesting
application to renew their connection.

An owner connected through an approved second application can invite that
application’s users to a shared wallet. These members need their own checks and
consent. Their access continues to depend on the current source-sharing agreement.
The service does not discover arbitrary third-party wallets or enable onward
sharing through an intermediary application.

## Storage and signing boundaries

Verified-user evidence is stored once per application-scoped user in the durable
onboarding store’s `verifiedUsers` collection. Existing request records retain
their evidence and consent for authority and audit. Wallet records retain the
canonical owner, wallet description and member revisions. Grants are separate
for each application, person and wallet. Existing accepted accounts are recognized
lazily; no database tables or schema DDL are added.

Back up durable storage before upgrading. Older toolkit builds do not recognize
the new JSON collection; roll back code and its matching storage backup together.
The default limits are 100 owned wallet records per user and 100 member records
per wallet, including removed members. Administrative suspension and current
owner checks still apply to a shared wallet, alongside each member’s checks.

Membership is enforced by the provider. This feature keeps the existing Safe
owner signer and threshold. It does not add on-chain owners, device co-signers,
threshold signatures, key export, ownership transfer or recovery keys.

## On-chain signers

Shared-wallet members describe application access. They are separate from Safe
owners and the on-chain approval threshold. Use [on-chain owners and additional
signatures](wallet-owners.md) to add signer addresses, change thresholds and
collect signatures without granting provider API access to those addresses.
