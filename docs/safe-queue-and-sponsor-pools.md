# Queue Safe operations and distribute sponsored execution

New Safe-only deployments use independent user Safes, a private bundler and an
application-owned paymaster. See [self-hosted sponsorship](self-hosted-sponsorship.md)
for that profile. This guide describes queue and sponsor-pool settings for the
explicit relayer compatibility profiles.

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
mechanism are the configured Base or Base Sepolia network and the explicitly bound Safe 1.4.1 profile.

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

Uncertain, accepted and signed unfinished attempts hold capacity. For the Safe
profile, independently verified inclusion releases sponsor capacity, including
reverted outer transactions. Other execution profiles retain their finality gate;
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

## Configure shared application pools and overload limits

For application-owned configuration, enable parallel pools in the wizard’s
Deployment step. The equivalent provider settings are:

```json
{
  "runtimeConfiguration": {
    "executionPool": { "safeCount": 5, "sponsorCount": 5 }
  }
}
```

Merge these fields into the complete runtime configuration, retaining its
operators and shared-application-Safe setting. New wizard deployments default to five Safes and five sponsors. Existing deployments
retain their configured sizes. Retained legacy single-member applications stay
single-member; new shared applications default to five when pool settings are omitted.
Counts range from 1 to 16. Read `GET /v1/application/execution-pool` and use
`PUT /v1/application/execution-pool` with `safe_count`, `sponsor_count`,
`expected_safe_count` and `expected_sponsor_count` to choose capacity before any
member is provisioned. Application identity comes from the token and write access
requires `wallet:configuration:propose`. A stale update or resizing a provisioned
pool returns 409. Live pool resizing requires an infrastructure migration. Provision sponsor members through
`POST /v1/provider/applications/{applicationId}/sponsorship/provision` and Safe
members through `POST /v1/provider/applications/{applicationId}/safe`, supplying
`{"pool_index": 0}`, then each remaining zero-based index. An omitted index
selects member zero. Each member retains its own signer and retry identity.
Fund the single address returned by `GET /v1/application/gas-funding` before
deploying the Safes. The address is stable across members and restarts. A separate
funding EOA distributes native gas to retained sponsor addresses; its nonce queue
is independent of execution sponsors. Initial funding estimates include one
execution reserve with 10% balance headroom and one routing fee reserve per
sponsor. This is infrastructure
gas, and user assets remain in individual wallets. Shared Safe readiness requires
canonical inclusion with matching code and current account authority, rechecked
before execution. Final settlement is reported separately.

`GET /v1/application/safe` lists public Safe members and funding requirements.
The pool becomes ready after every configured Safe is ready. Each user receives
a durable assignment to one Safe; existing recorded assignments and prior
execution senders are preserved. Read the user’s sender through
`GET /v1/accounts/{accountId}/wallet`, or omit `from` in `wallet_sendCalls` to use
it. Do not use member zero’s address for every user. Pool growth, shrinkage and
contracts tied to a particular sender require migration review; accepted or
signed work is never reassigned to escape a stalled lane.

Application sponsor pools allow one unfinished submission per sponsor until verified
inclusion. Every member shares the original application gas ledger; pool size
never multiplies the spending allowance. Adding Safes does not pool user assets
or change the target contract’s responsibility for user authorization.

The funding worker checks accepted application sponsorship, application-owned RPCs,
chain identity, balances and the retained sponsor addresses before routing. Shared
application deployments use one healthy application RPC per complete check and
rotate supplied endpoints as described in [application obligations](application-obligations.md#store-application-rpc-credentials).
It tops up the lowest balance first, retains signed bytes before broadcast and
retries the same bytes after an uncertain response. Routing fees reserve capacity
in the same application gas ledger as deployment and execution. Reverted transfers,
nonce disagreement, reorg disagreement or revoked terms pause further routing.
The funding read exposes `funding_state` and `checked_at` so an application can
distinguish routing, insufficient gas and a paused worker.
Unsettled funding history is bounded to 256 transfers. Finalized prefixes compact
while retaining the nonce counter, cumulative routed value and a canonical
checkpoint. Reaching the bound pauses routing until settlement permits compaction. No arbitrary destination or withdrawal API is exposed.

The queue also enforces optional `maxDepthPerUser`, `maxDepthPerApplication` and
`maxDepthTotal` limits under `execution.safeQueue`, defaulting to 8, 128 and 512.
These count queued, executing and blocked requests. The first limit to fill
rejects new work atomically before signing or gas admission. Retrying an already
admitted idempotency key remains possible. HTTP queue admission reports
`wallet_attempt_pending`; wallet calls report JSON-RPC `5740`. Preserve the
request identity and back off rather than creating new batches automatically.

`http.requestsPerMinute` configures the HTTP peer limit, default 60 and maximum
6,000. Size it for the application backend’s shared connection and status-poll
traffic. HTTP throttling returns 429 and its retry guidance. This limit complements
the durable per-user, application and service queue caps.

Workers process at most five independent Safe lanes concurrently; completed lanes
can wake followers while another lane remains busy. RPC reads share a ceiling of
eight in flight and 64 waiting requests per exact endpoint and transport across
application observers. Waiting RPC requests expire after three seconds; 429
backoff is shared. These controls bound overload rather than promising throughput.
After verified inclusion, background finality observations run at most once per
30 seconds per action to leave RPC capacity for pending inclusion. Explicit
status reads and queue progression still perform verification. When both groups
have work, the observer selects up to three pending inclusions and one finality
observation, rotating each group independently.
Active lanes retry at most once per second, independently of stalled lanes;
newly verified nonce consumption hands its persisted observation to the queue,
releasing that head without a duplicate verification. A newly ready follower can
start immediately; it still checks its predecessor's canonical inclusion. Idle queues retain
the configured polling interval. Preparation checks the selected sponsor, runs
independent reads concurrently and verifies current Safe authority before signing
and dispatch. Reading a nonce to construct an unsigned intent is not authority.
The shared-application observer coalesces overlapping identical RPC reads without
retaining completed responses. After full inclusion verification, it can reuse
the immutable proof for up to 60 seconds while freshly checking its canonical
block hash, chain ID and chain heads. The immutable genesis pin can be reused
for sixty seconds per exact endpoint, transport and expected hash; availability
failures invalidate it. Live ownership, nonce and simulation checks are excluded
from that cache. A changed block hash discards the inclusion proof and pauses
progression; the shared cache retains at most 256 proofs per transport. No live
ownership or simulation result is cached across execution attempts.
The shared observer validates the Safe's pinned code, singleton, sole owner,
threshold, version, modules, guard, fallback handler and nonce in one `eth_call`.
It supplies the reproducibly compiled `contracts/SafeStateReader.sol` as a
temporary code override at a random reader address; the Safe's code, storage and
balance remain unchanged. This read creates no transaction or deployment.
Explicit RPC errors for unsupported overrides select the individual read checks
for five minutes. Reverts, malformed responses and authority mismatches fail
closed. `npm run check:read-helper` verifies the bundled bytecode against the
pinned compiler and source; local EVM tests exercise both valid and rejected Safe
states. See Geth's [state override documentation](https://geth.ethereum.org/docs/interacting-with-geth/rpc/objects#state-override-set).
Measure admission, queue wait, preparation, signing, provider acceptance and
verified inclusion separately, including stalled providers and concurrent users.
See [queue architecture and sponsorship choices](transaction-queue-architecture.md)
for the shared nonce bottleneck, bundler/paymaster tradeoffs and remaining scaling limits.

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
   execution profile headers. Queue-request reads do not sign or dispatch. Action
   and wallet-status observations can record verified inclusion; only the worker
   creates and dispatches a follower.
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

| Request status | Meaning                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queued`       | Accepted and waiting; no Safe nonce or signature has been assigned yet.                                                                                   |
| `executing`    | An immutable action exists and its original signing/dispatch attempt is being processed or observed. Pool saturation can leave this action unsigned.      |
| `included`     | The configured RPC verification mode established inclusion and consumption of the Safe nonce. The next head can execute while settlement remains pending. |
| `failed`       | Finalized inner-call failure after verified Safe nonce consumption; its financial reservations remain retained.                                           |
| `succeeded`    | The configured RPC verification mode established finalized successful execution.                                                                          |
| `cancelled`    | Explicit cancellation or loss of current authority, with durable proof that no signing admission existed.                                                 |
| `expired`      | Validity ended before any signing admission.                                                                                                              |
| `blocked`      | Possible signing exposure or failed/uncertain execution prevents safely skipping the head. Read-only reconciliation continues.                            |

There is no public skip, nonce-reset, payer-reassignment or redispatch endpoint.
A provider acceptance or application-reported hash cannot advance the queue.
Included and safe blocks release the head only with independent proof that the
Safe nonce was consumed. The service checks the released predecessor before
materializing its follower; a reorg or integrity failure pauses that lane.
Finality observation continues independently, and finalized contradictions fence
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

## Provision independent execution accounts

An application can propose sponsorship with `account_model` set to
`provider-controlled-user-safe` and an explicit `maximum_execution_accounts`
(from 1 to 100000). Provider acceptance is required. The optional
`maximum_in_flight_per_sponsor` is bounded from 1 to 16 and defaults to 2 for this
model. The shared Safe model retains one unincluded execution per sponsor.

After connecting and provisioning the user's asset wallet and recording a current
contract-request grant, the provider operator calls
`POST /v1/provider/applications/{applicationId}/safe` with
`{"user_account_id":"<account UUID>"}`. Repeating the request reconciles the same
retained signer and deployment. A failed or uncertain attempt never allocates a
replacement account. `pool_index` must be omitted or zero for a user account.
The response identifies the user account and execution address. A user whose
account has not been provisioned cannot borrow another user's Safe.

The provider checks the current application grant, owner and accepted terms before
creating infrastructure or deploying. Each application's user-account limit is
checked atomically before reserving another signer. User execution records are
separate from the fixed shared Safe pool. Existing asset wallet addresses,
shared-pool assignments, signed plans and historical execution records are retained.
Changing the accepted model requires current policy publication and consent;
it does not reroute already signed operations. The application gas-funding address
and shared lifetime gas ledger remain the same.

This configured account model currently uses module-free Safe/relayer execution.
The ERC-4337 account/module deployment and self-hosted bundler/paymaster bootstrap
remain separate integration work. See the [architecture review](transaction-queue-architecture.md).
