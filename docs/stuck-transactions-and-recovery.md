# Diagnose and recover stuck transactions

When a sponsored transaction stops progressing, establish what happened to its
original attempt before taking another action. Configure detection and containment
in [Deployment](setup-wizard.md#_5-deployment), then use this runbook for the wallet
and designated execution services. Work from both durable stores and independent
RPC evidence; a missing receipt or an application's report cannot authorize
replacement spending.

## Enable detection and containment

Add this optional object to `execution.recovery` in the wallet configuration and
to each matching executor provider's `recovery` configuration:

```json
{ "stuckAfterSeconds": 300, "quarantineOnStuck": true }
```

The threshold is 30–86400 seconds from the first durable execution admission.
Choose it from measured network and provider latency. Older records without an
admission timestamp start a conservative observation clock on their first refresh.
Without this configuration, the existing execution and finality checks still
apply, but stuck diagnostics and automatic payer quarantine are disabled.

The wallet uses its configured execution polling interval; the executor refreshes
up to four unresolved records every 15 seconds. Both rotate through their pending
records. Detection latency grows with the backlog and RPC response time. The
services compare nonce, balance and base fee evidence at common canonical block
heights and require agreement from all configured RPC sources. Pending nonce
counts may differ and remain local mempool hints. A native provider's bounded
inspection supplies an opaque transaction reference, status, hash and optional
nonce; it cannot establish settlement. Custom adapters may implement the optional
read-only `inspect` method.

| Diagnosis                       | Operator action                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `insufficient-sponsor-funds`    | Restore the agreed application-funded native balance.                                                              |
| `fee-cap-below-base-fee`        | Review the provider's accepted fee policy and original transaction.                                                |
| `nonce-gap-suspected`           | Inspect the lowest unresolved outer nonce and provider queue.                                                      |
| `transaction-not-visible`       | Reconcile original provider references and known hashes across independent sources. Absence does not prove a drop. |
| `pending-too-long`              | Review inclusion, fee headroom and provider recovery behavior.                                                     |
| `nonce-consumed-without-result` | Investigate the transaction that consumed the sponsor nonce; do not assume the original call succeeded.            |
| `safe-nonce-advanced`           | Investigate the Safe execution history and exact authorized effects.                                               |
| `provider-nonce-conflict`       | Fence the payer and investigate conflicting identity evidence.                                                     |
| `evidence-unavailable`          | Restore RPC/provider evidence; retain existing uncertainty and reservations.                                       |

Before the threshold, unavailable evidence is reported as unavailable; once the
threshold is exceeded it becomes a stuck suspicion. Included or safe transactions
wait for finality. A diagnosis is an operational observation, never a new
permission to submit, replace or cancel a financial transaction.

With `quarantineOnStuck: true`, a suspicion or blocked diagnosis durably excludes
that payer from new selection, signing and dispatch. Existing attempts retain
their selected payer, exact action and provider identity. Other healthy pool
members can serve new executions under their existing limits. A false value
records diagnostics without automatically quarantining. A previously persisted
quarantine remains enforced after configuration changes.

Only a fresh exact independently verified finalized receipt clears that
execution's quarantine reason. Other unresolved reasons keep the payer
quarantined. An RPC outage, temporary funding recovery or restored HTTP connection
cannot clear the latch. Contradictions to recorded finality fence execution and
require investigation. See [payer events and health](payer-events-and-health.md)
for signed alerts and aggregate status.

## Reconcile without resubmitting

Applications with current original-caller authority and `wallet:execute:read`
can call `POST /v1/actions/{actionId}/reconcile` with an empty JSON object, a UUID
`Idempotency-Key` and the matching execution profile/revision headers. See the
[HTTP contract](http-reference.md#post-v1-actions-actionid-reconcile). Current owner, grant,
identity, consent and immutable action checks still apply, including for late
observations after signing expiry. The operation performs read-only provider and
RPC reconciliation. It cannot sign, claim a new financial attempt, submit a
transaction or reset budgets. Status receipts and the existing authenticated
execution CloudEvents feed include optional `recovery` diagnostics.

## Recover the sponsor's outer nonce

1. Retain both stores and the original execution/provider references. Inspect the
   provider's transaction and all known hashes, then compare canonical receipts,
   confirmed/finalized nonce counts, payer funding and the provider's queue. Work
   on the lowest unresolved nonce first.
2. Restore provider/RPC connectivity or agreed funding when that is the cause.
   Allow the accepted provider's own serialized nonce synchronization and recovery
   worker to reconcile its state. Do not edit Redis counters or delete journals.
3. With the [automatic replacement policy](automatic-replacements.md), allow the
   bounded worker to repair a visible pending transaction under fresh wallet
   authority. It preserves fixed approved caps and never cancels or fills a gap.
   When manual replacement or cancellation is required, obtain separate
   financial authorization and use the accepted provider procedure. A replacement
   intended to execute the original operation must preserve its outer nonce,
   exact recipient, value and calldata, durable reference and accepted fee limits.
   The toolkit exposes no generic provider replacement/cancellation API.
4. Reconcile the resulting hashes against the original execution. Retain uncertain
   attempts and lifetime reservations; do not create another wallet action or
   switch payers to escape an unresolved effect. Only verified evidence establishes
   the financial result.

For an unmodified provider, the OpenZeppelin Relayer 1.8 API includes transaction-by-nonce lookup, relayer
status, replacement and cancellation. Replacement can change transaction fields,
so passing that API through without the immutable action checks would weaken the
financial boundary. Provider-managed gap filling, replacements and cancellations
can incur additional charges: deployment acceptance must account for their
behavior and costs. The admission reservation does not cap every upstream
recovery charge. The optional [fee-only provider build](fee-only-relayer.md)
disables those autonomous mutations and is required for the bounded worker.
The implementation research used Relayer v1.8.0; accept and test
the exact deployed version before enabling funded execution.

## Verify a known transaction before searching history

When the provider or retained journal supplies a transaction hash, the observer
first verifies that transaction and its receipt through every configured RPC.
Exact calldata, owner/account bindings, code pins, operation effects, canonical
blocks and finality remain required. A verified receipt does not depend on a
separate log-history query. This lookup does not advance the history-scan cursor.

If a known candidate does not establish the exact outcome, the observer searches
bounded history for matching effects. Historical RPC access remains necessary for
recovery without a usable transaction hash. Missing or conflicting evidence never
authorizes another submission. During explicit nonce cancellation, background
observation follows the cancellation; the fenced original remains available for
explicit reconciliation.

RPC reads are serialized per reader to limit bursts. HTTP 429 responses allow at
most three read attempts, honoring a server backoff of up to two seconds or using
a 500 ms fallback. Longer server backoffs return unavailable immediately and
prevent that reader from issuing requests until the backoff expires. This retry
policy applies only to the fixed read-method allowlist. Signing, provider
submission and uncertain financial attempts are never retried by this transport.

## Retain a signed Safe head

The outer payer nonce and Safe authorization nonce are separate. Service expiry
and cancelling an outer transaction do not revoke a signed Safe transaction. In
the supported zero-refund Safe profile, a reverted outer execution can also revert
the Safe nonce increment. Keep a signed queue head until exact finalized success;
never skip it based on age, an outer cancellation or an unexplained nonce change.

## Explicitly cancel an unsubmitted signed Safe action

With bundled local execution, the original application can authorize a separate
cancellation action using `POST /v1/actions/{actionId}/cancel-nonce`. This recovery
is limited to a stored signed Safe action with **no submission admission**. An
admission without a provider claim still prevents cancellation. Submitted or
uncertain provider attempts require reconciliation; this endpoint cannot replace
them. The current owner, original caller, grant, identity, consent, contracts
permission and published policy must still pass, even when the original signing
expiry has elapsed.

Retain a UUIDv4 `Idempotency-Key` and send the original action's exact nonce and
payload hash with an explicit authorization:

```json
{
  "expected_nonce": "0",
  "expected_payload_hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "authorization": "invalidate-signed-action"
}
```

The response contains `action_id` for the cancellation, `cancelled_action_id`,
`nonce`, `payload_hash` and `expires_at`. Authorizing cancellation immediately
blocks original dispatch under the same durable storage fence used by submission
admission. Execute the returned cancellation action through the normal
[execution endpoint](http-reference.md#post-v1-actions-actionid-execute), with its
own stable idempotency key, execution profile headers, signing scope and execution
scope. Authorization alone does not broadcast or release the nonce.

The service constructs exactly one zero-value, empty-data CALL to the bound Safe
itself, at the original Safe nonce. Applications cannot select a destination,
value, calldata, sponsor or different nonce. Generic contract calls continue to
reject Safe self-calls. Simulation, private owner signing, shared gas budgeting,
durable submission and independent receipt checks apply to the cancellation.
The operation consumes sponsor gas and an operation allowance; existing lifetime
reservations are retained.

Poll the cancellation's execution receipt. Only its matching successful,
RPC-quorum **finalized** receipt releases the original nonce reservation and
marks its queue entry cancelled. The original batch then reports EIP-5792 status
`400`, without a success receipt for calls that never ran. Inclusion, expiry, a
bare nonce increment, a failed cancellation or an RPC outage leaves the lane held.
Retries and restarts retain the same cancellation action and attempts. If the
cancellation itself becomes signed and expires before submission, retain the
lane for explicit recovery review; cancelling a cancellation is unsupported.
Never remove queue entries or edit nonce reservations to recover a signed lane.
Unsigned heads retain their existing cancellation and expiry procedure.

Offline fixtures test detection, quarantine, evidence outages, exact finalized
recovery, concurrent queues and restarts. They do not certify live nonce recovery,
provider replacement policy, power-loss durability or funded gas coverage.

## Primary references

- [Ethereum JSON-RPC nonce and block methods](https://ethereum.org/developers/docs/apis/json-rpc/).
- [OpenZeppelin Relayer 1.8 EVM recovery behavior](https://docs.openzeppelin.com/relayer/1.8.x/evm),
  [transaction lookup by nonce](https://docs.openzeppelin.com/relayer/1.8.x/api/gettransactionbynonce),
  [replacement](https://docs.openzeppelin.com/relayer/1.8.x/api/replacetransaction),
  [cancellation](https://docs.openzeppelin.com/relayer/1.8.x/api/canceltransaction).
- [Accepted-version research source: Relayer v1.8.0](https://github.com/OpenZeppelin/openzeppelin-relayer/tree/v1.8.0/src/domain/relayer/evm).
- [Safe 1.4.1 execution and nonce behavior](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/Safe.sol).
