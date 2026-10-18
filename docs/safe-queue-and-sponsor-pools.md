# Queue Safe operations and distribute sponsored execution

Applications can request several operations while a Safe is still executing its
current transaction. Enable the optional queue in
[Deployment](setup-wizard.md#_5-deployment) to retain unsigned requests and execute
one head per Safe. The wallet checks the current nonce and creates the immutable
action only when a request reaches the head. Sponsor pools can distribute
execution across separately funded payers. This guide explains both settings,
the application's queue requests and recovery behavior.

Use one authoritative wallet-service queue for each Safe. Independent wallet
services must not compete to sign that Safe at the same nonce; the executor
rejects conflicting nonce reservations rather than merging their queues.

This is a bounded wallet execution queue on one active host. It does not implement
the separate Moovha business orchestration draft, cross-chain workflows, distributed
workers or production provider acceptance. The supported chain and account
mechanism remain Base Sepolia and the explicitly bound Safe 1.4.1 profile.

## Configure the wallet service

In the setup wizard's execution settings, select **Approved EVM actions through
designated service** and enable **durable per-Safe request queues**. The equivalent
optional fields in `execution` are:

```json
{
  "safeQueue": { "maxDepthPerSafe": 20, "maxWaitSeconds": 300 },
  "sponsorPool": { "strategy": "round-robin", "maxInFlightPerSponsor": 4 }
}
```

`safeQueue` requires the approved contract-call policy and
`approved-evm-executor-v1`. Its depth includes queued, executing and blocked heads.
Validity starts at enqueue and is the smaller of `maxWaitSeconds` and the contract
policy's `maxValiditySeconds`; waiting does not extend signing or dispatch
validity. A swap must also retain its original router deadline. A signed SafeTx
still has no native on-chain expiry; service expiry cannot recall that signature.

Pool settings are optional and independent of the queue. With a pool enabled,
register multiple distinct funded sponsor addresses under the same authenticated
`clientId` in `execution.sponsors`. Account IDs and addresses remain unique, and
separate applications cannot share a payer. Without an explicit pool, the existing
one-sponsor-per-client rule remains. Each member has its own binding, fees and
funding agreement. Configure corresponding members and the optional
`sponsorPool` on the designated executor's provider entry; advance its explicit
provider revision when changing that policy. Wallet configuration contains
neutral address bindings; Relayer credentials and IDs belong to the executor.

Round-robin selection and occupied capacity are stored transactionally. Selection
skips members at their unfinished-execution limit, records the chosen payer before
signing, and preserves it through retries and recovery. Full pools return a
pending response; an unsigned queue head waits. This does not probe provider
health or automatically switch away from an unfunded or failed selected member.
Fund every configured payer and monitor availability before admitting work.

Uncertain, accepted and signed unfinished attempts hold capacity. Verified
finalized receipts release capacity, including reverted outer transactions;
lifetime gas reservations are never refunded. Each application's lifetime gas
budget remains shared across members, using the smallest configured member
budget. The executor also retains its shared provider/client budget across wallet
origins and registered provider revisions. Adding a member does not multiply or
reset that budget. The executor independently limits each payer's unfinished
admissions across wallet origins and provider revisions.

The configured provider continues to own each payer's outer transaction nonce and
broadcast workers. A single payer can have several pending transactions, but a
missing earlier nonce can hold up later ones. Do not use its signing key through
an independent sender. Sponsor pools distribute that dependency across addresses;
they are not a claim of measured throughput or automatic fee replacement.

## Enqueue from the application

1. Obtain current owner-bound access with explicit `contracts:request` delegation
   to the contract policy. The application token needs `wallet:actions`,
   `wallet:sign` and `wallet:execute` for enqueue, plus `wallet:execute:read` for
   status.
2. Send the exact contract-call, swap or vault-deposit input to
   `POST /v1/contract-call-requests`, with a stable UUIDv4 `Idempotency-Key`.
   The body has the same operation schema as `/v1/actions/contract-calls`.
3. Persist the `request_id` from the `202` response. Acceptance authorizes delayed
   execution of that exact request under its original caller, owner, grant,
   consent, policy and deadline. The queue stores no bearer token or signing key.
   It does not infer spending authority from those scopes. Token expiry does not
   withdraw an accepted request: cancel an unsigned request or revoke its grant
   when the application withdraws that instruction.
4. Poll `GET /v1/contract-call-requests/{requestId}`. When `action_id` appears,
   use the existing action execution/status and CloudEvents APIs with the exact
   execution profile headers. Status reads never advance or dispatch the queue.
   The queue worker executes automatically; the application does not broadcast.
5. Use `POST /v1/contract-call-requests/{requestId}/cancel` with `{}` and an
   idempotency key to cancel an unsigned request. Current original-caller access
   remains required. A signing admission makes cancellation conflict, even when
   the signature response is missing.

The worker checks current owner, original grant, identity acceptance, consent,
policy and exact input again before materialization. Existing immutable action,
operation budget, signing attempt and provider-effect checks remain in force.
Revocation or changed authority cancels a provably unsigned head; a signed head
retains its position. New consent or another caller cannot take over an existing
queued request. Enqueue replay returns the original identity, never a renewed
expiry or a new execution.

The immediate `/v1/actions/contract-calls` path remains available. It cannot take
a nonce ahead of an active queue for that Safe. A prior immediate action at the
current nonce can hold a queued head until the nonce advances or that prior
unsigned reservation expires under the existing evidence checks.

## Status and failure handling

| Request status | Meaning                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queued`       | Accepted and waiting; no Safe nonce or signature has been assigned yet.                                                                              |
| `executing`    | An immutable action exists and its original signing/dispatch attempt is being processed or observed. Pool saturation can leave this action unsigned. |
| `succeeded`    | Independent RPC agreement established finalized successful execution. The next head may now read the advanced nonce.                                 |
| `cancelled`    | Explicit cancellation or loss of current authority, with durable proof that no signing admission existed.                                            |
| `expired`      | Validity ended before any signing admission.                                                                                                         |
| `blocked`      | Possible signing exposure or failed/uncertain execution prevents safely skipping the head. Read-only reconciliation continues.                       |

There is no public skip, nonce-reset, payer-reassignment or redispatch endpoint.
A provider acceptance or application-reported hash cannot advance the queue.
Included and safe blocks also retain the head. Finalized contradictions fence
execution. In this zero-refund Safe profile, a reverted outer transaction does
not establish consumption of the Safe authorization: it keeps the lane blocked.
A signed head can become `succeeded` after its service deadline when independent
read-only recovery establishes the exact finalized effects. Followers never
receive speculative future nonces.

Queue status is a durable snapshot. Its transitions are audited; it is not a
separate queue CloudEvents stream. Action events retain their existing bounded
feed and replay rules. Current original-caller access is required for queue
reads, including after expiry; revoked access does not become a status bypass.

## Recovery and acceptance

Queue entries, per-Safe ordering, request/action idempotency bindings and sponsor
selection counters use JSON records in the existing verified SQLite version-1
catalog. There is no database DDL, schema reinitialization or automatic pruning.
A crash between action insertion and recording its ID on the queue entry recovers
through the same internal idempotency key. Cancellation resolves that same key
before deciding whether signing exposure exists. Separate processes serialize
admission through SQLite transactions; duplicate workers join the existing
signing and execution attempts.

Back up the wallet and executor stores together with their existing recovery
procedures. Fence old dispatchers and their provider network access before
restoring a replacement. Reconcile both backup-loss windows before resuming;
absent records in a stale backup do not prove absence of effects. Changing an
active financial configuration fences previous requests/actions. Old active queue
heads require reviewed migration and cannot silently adopt new terms; unrelated
Safe lanes can continue under current configuration.

Offline fixtures exercise concurrent HTTP admission, independent-process SQLite
enqueue, overlapping workers, per-Safe independence, sponsor saturation, selected
payer replay, revocation, cancellation/signing races and two-service restart after
transport loss. They do not establish live provider nonce behavior, power-loss
recovery, funded gas coverage or enterprise throughput. Before activation, test
those properties against the accepted provider version, ingress and storage,
including queue latency, sponsor exhaustion, stuck outer nonces and failed Safe
execution. See the [execution-service guide](execution-service.md),
[single-host recovery runbook](execution.md#single-active-host-recovery-and-failover)
and [enterprise v1 gates](v1-standards.md).

## Investigate a stuck nonce

Enable optional [stuck-transaction detection and payer quarantine](stuck-transactions-and-recovery.md)
on both services. Follow that runbook to distinguish the sponsor's outer nonce
from the Safe authorization nonce, reconcile evidence and carry out separately
reviewed provider recovery. [Payer events and health](payer-events-and-health.md)
cover low gas balances, operational incidents and durable signed alerts. Neither
a timeout nor cancelling an outer transaction revokes a signed Safe authorization.
