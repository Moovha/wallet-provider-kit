# Replace stuck transactions within approved fees

The designated execution service can raise fees for the same pending transaction
without changing its sponsor, outer nonce, recipient, value, calldata or gas limit.
This applies to ERC-3009 transfers and approved Safe contract calls, swaps and
vault deposits. The original owner signature and full gas reservation remain in
place. The application funds the sponsor and reads status; it does not submit a
second wallet action to recover an uncertain execution.

Automatic replacement requires the [pinned fee-only Relayer build](fee-only-relayer.md).
An ordinary OpenZeppelin Relayer deployment or custom provider adapter cannot
advertise this toolkit capability. The direct compatibility submission profile
has no replacement worker. The default wallet service remains unconfigured.

## Configure new executions

The setup wizard enables replacement for newly configured designated execution
services and supplies editable starter limits. Imported configurations remain
unchanged. Add the same policy to `execution.replacement` in the wallet and
`providers[].replacement` in the executor:

```json
{
  "initialFeeBasisPoints": 5000,
  "bumpBasisPoints": 1250,
  "maxAttempts": 3,
  "intervalSeconds": 30
}
```

Both sides also require `recovery`, for example:

```json
{ "stuckAfterSeconds": 30, "quarantineOnStuck": true }
```

A basis point is 0.01 percent. These defaults send the initial transaction with
50 percent of each approved EIP-1559 fee cap. Each replacement increases both
current fee fields by 12.5 percent, rounding upward to an integer wei. The worker
allows three durable proposal slots, at least 30 seconds apart. Preparation
failures and interrupted preparations consume slots too. It never clips a bump
to a ceiling or increases a ceiling to obtain inclusion. The interval is a minimum;
the executor scans up to four unresolved records every 15 seconds, so backlog and
RPC latency affect timing.

The wizard supplies these editable **Base Sepolia evaluation** values:

| Setting                           | Starter value              |
| --------------------------------- | -------------------------- |
| Outer gas limit                   | 500,000                    |
| Maximum fee per gas               | 3,000,000,000 wei          |
| Maximum priority fee per gas      | 1,000,000,000 wei          |
| L1 fee reserve                    | 1,000,000,000,000 wei      |
| Lifetime sponsor admission budget | 10,000,000,000,000,000 wei |

These are configuration defaults, not gas estimates, live network quotes or
funded coverage guarantees. Simulate each accepted operation, measure network
costs, and set the application funding agreement before activation. A complex
contract call may require a different gas limit. The reservation always uses the
full approved gas limit times the full maximum fee, plus the L1 reserve; initial
headroom does not reduce that reservation. Replacement does not create another
admission, reserve another action budget or reset a lifetime budget.

Fee policies and sponsor limits are pinned into the immutable execution plan.
Changes apply to future plans through the configuration/revision migration
procedure. They cannot relax a previously approved execution. Existing plans
without a replacement policy retain their original initial fee behavior and do
not acquire background automation. Retain prior provider revisions and both
stores for reconciliation when changing configuration.

## Authority before every replacement

The worker requires an accepted original provider journal entry and a native
transaction reference. All configured independent RPC sources must agree on the
exact pending type-2 transaction, sender, chain, original call, gas limit, fees and
nonce. The transaction must occupy the lowest unresolved confirmed payer nonce;
a pending nonce count alone is insufficient. A Safe authorization nonce must
still equal the approved Safe nonce. Included transactions wait for finality.

The proposed fees must satisfy the fixed caps, the current base fee plus proposed
tip, and the full original sponsor funding reservation. Missing transaction
visibility, disagreeing sources, advanced nonces or insufficient funding stop
replacement. A `pending-too-long` quarantine permits repair of that same pending
nonce. Later transactions quarantined solely for a higher nonce gap do not block
that repair. Other quarantine causes and integrity failures continue to deny it.
The payer remains excluded from new work until exact verified finality clears
its unresolved quarantine reasons.

The executor persists a proposal before asking the wallet for a new, signed,
short-lived authorization. The wallet binds the proposal to the original action,
execution, plan, provider revision and succeeded handoff. It rechecks current
owner, original application grant, KYC, consent, immutable approval and action
expiry. A lost original handoff response can be reconciled read-only before this
check. An expired original handoff lease does not authorize replacement: each
proposal obtains its own 30-second wallet lease.

Immediately before the native replacement request, the executor checks chain
and quarantine evidence again and obtains a second signed wallet callback for
that proposal. The wallet durably consumes its dispatch authorization once.
Revocation at either callback denies the mutation. Service authentication and an
existing owner signature never substitute for these current checks. No
distributed check can recall a request that has already reached the provider.

## Crashes, uncertainty and finality

| Durable state           | Recovery behavior                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepared`              | No native replacement dispatch has been claimed. After lease expiry the proposal is abandoned; a later bounded slot requires fresh authority.                           |
| `dispatch`              | A single worker owns the mutation. An expired claim becomes `unknown`; it is never dispatched again.                                                                    |
| `accepted`              | The provider returned a matching replacement hash. This is acceptance, not financial success.                                                                           |
| `unknown`               | Acceptance could have occurred. Inspect the original native reference and independently verify the exact proposed fees, nonce and call. Absence never proves rejection. |
| `observed`              | Independent sources found the exact replacement. A later bump may use another slot after the interval and fresh authorization.                                          |
| `blocked` / `exhausted` | Restore evidence/authority when possible, or follow the operator runbook when fee ceilings or slots are exhausted. Approved caps remain fixed.                          |
| `settled`               | Independently finalized evidence consumed the payer nonce. Read the separate financial settlement result to determine success or failure.                               |

The provider persists exact signed bytes and can rebroadcast them after a lost
queue insertion or network response. Such a retry does not sign at new fees or
allocate another nonce. The toolkit never repeats a claimed replacement PUT,
including when a response was lost before acceptance. This conservative case can
require operator investigation even when no replacement actually occurred.

Receipt/status reads and `/reconcile` remain read-only. The default background
worker owns replacement effects. Wallet and executor SQLite journals fence
concurrent workers and retain every bounded proposal. Host failover still needs
external process and egress fencing, intact stores, and the provider's durable
Redis/queue recovery. A stale backup cannot prove that a later dispatch did not
occur; never clear journals, payer reservations or Safe queue heads to retry.

Execution receipts and the authenticated execution event feed expose an optional
`replacement` summary. [Payer health and signed webhooks](payer-events-and-health.md)
aggregate pending, unknown, blocked and exhausted replacements without exposing
execution IDs. Operational replacement state cannot establish token settlement.
Only independently verified exact finalized effects establish the financial
outcome. An original transaction can win the race against its replacement.

## Deployment acceptance and limits

Run authorization-denial, concurrent worker, restart, lost response, fee ceiling,
RPC disagreement, receiver and failover drills against your exact deployed
provider build before enabling funded execution. The source patch and offline
fixtures do not certify a provider or establish production readiness. Sponsor
signers remain in the configured provider's custody boundary.

The bounded mode disables automatic repricing, cancellation and nonce-gap NOOP
transactions in the provider. It cannot fill an unrelated missing nonce. See the
[stuck transaction runbook](stuck-transactions-and-recovery.md) for manual
investigation and separately authorized recovery. Outer cancellation does not
revoke a signed Safe authorization. The toolkit does not automate owner nonce
invalidation or queue migration after that recovery.

EIP-1559 bounds the transaction's execution fee through its signed gas and fee
fields. Base L1 data charges and provider service charges require separate
funding/acceptance controls; the toolkit does not promise an absolute cap on all
upstream costs.

Primary sources:
[EIP-1559 fee fields](https://eips.ethereum.org/EIPS/eip-1559),
[OpenZeppelin EVM policies](https://docs.openzeppelin.com/relayer/1.8.x/evm), and
[pinned upstream replacement processing](https://github.com/OpenZeppelin/openzeppelin-relayer/blob/b8cf360a49c5739e43491ca5d2f6bbc934b7438e/src/domain/transaction/evm/evm_transaction.rs).
