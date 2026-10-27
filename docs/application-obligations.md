---
prev:
  { 'text': 'User checks and permission', 'link': '/docs/application-access' }
next: { 'text': 'Application rules', 'link': '/docs/runtime-configuration' }
---

# Choose transactions and network-fee limits

Before an application can request transactions, you and its developer agree what
it may request and how the costs will be covered. These settings belong to that
application, so you can complete them after connecting it.

The API calls these agreements **obligations**. Applications submit action and
service declarations for provider review. For network fees, you can offer terms
from the console for the application to accept. Keep the operator’s credentials
out of the connected application.

## Work through three decisions

| Decision         | What to agree                                                            | Who prepares it                                                      |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Transactions     | Exact permitted contract calls, amounts and other limits                 | The application developer describes the actions; you review them     |
| Network services | Trusted RPC connections used to read chain state and verify outcomes     | The developer supplies service configuration and private credentials |
| Network fees     | Who pays, the chosen network, fee ceilings and limits on active accounts | The provider offers limits; the application accepts and funds them   |

Restricted applications start with [application rules](runtime-configuration.md).
Provider-enabled [trusted applications](runtime-configuration.md#trust-an-application-without-transaction-restrictions)
do not need action declarations or contract proposals; their service connections
and network-fee agreements remain required. Then review
[network services](operator-services.md) and [paying network fees](assets-and-gas.md)
as you reach those decisions. Acceptance must match the current application policy.

## Hand the agreed settings to your developer

The developer submits actions and services, or proposes alternative fee terms, using
`/v1/application/obligations/*`. A provider operator accepts or declines each
submission through `/v1/provider/applications/{applicationId}/obligations/*/decision`.
Use the [HTTP reference](http-reference.md) for exact bodies and revision checks.
Secret values go through the protected credential API; metadata never returns them.

The funding address and wallet infrastructure remain bound to the accepted
application. Funding does not give it permission to spend user assets. Current
user approval, identity, policy and chain checks still apply to every transaction.
Changing policy cannot rewrite an operation that has already been signed.

## Accept provider fee terms

The provider can offer network-specific sponsorship terms from **Applications →
Wallet services** or with
`PUT /v1/provider/applications/{applicationId}/obligations/sponsorship`.
The request supplies `expected_revision` and the sponsorship `value`. It creates a
pending record with `proposed_by: "provider"`; the provider cannot accept its own
proposal on the application's behalf.

Read the current terms through `GET /v1/application/obligations`. To accept or
decline, call `POST /v1/application/obligations/sponsorship/decision` using the
application's authenticated `wallet:configuration:propose` access. Supply
`expected_revision`, `expected_decision_revision` and `decision` (`accepted` or
`rejected`), plus an idempotency key. Acceptance applies only to that application,
network and exact revision. Replacing the terms removes the prior acceptance.
A provider rejection withdraws its offer; the application cannot accept it again.
The provider must publish a replacement offer to reopen acceptance.

The provider can prepare a stable funding address while its offer awaits
acceptance. The application reads it through `GET /v1/application/gas-funding`, accepts
the terms, then funds it with ETH on that network. Address preparation makes no
chain requests and permits no deployment, transfer or sponsorship. Those effects
still require accepted terms and all current authority and readiness checks.

## Balance-funded sponsorship

Applications can submit `funding_mode: "balance"` with
`maximum_transaction_fee_wei` and `maximum_pending_fees_wei`. Both are required
positive limits in wei. The pending limit must cover at least one transaction’s
maximum fee. The provider reviews these terms before they apply.

`maximum_gas_budget_wei` is optional in this mode. When supplied, it remains a
cumulative ceiling; depositing more ETH does not raise it. Existing agreements
without `funding_mode` retain their required cumulative ceiling until replaced
and approved.

The provider checks the accepted paymaster deposit at a fixed blockchain block
and atomically reserves pending wallet fees before usable sponsorship. Unknown
and unfinalized operations keep their reservations. Verified finalization or
verified expiry releases pending capacity only when covered by the funding
snapshot. Infrastructure setup and refill transactions retain their separate
provider limits and funding-account balance checks.

Once the agreements and infrastructure are ready, [test the full connection](staging-walkthrough.md).
