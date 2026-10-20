# Transaction queue architecture and sponsorship choices

This review is for hosts choosing an execution model for interactive applications.
New OWS deployments use the [Safe-only profile](self-hosted-sponsorship.md), with
per-user Safes and application-owned ERC-4337 infrastructure. This guide compares
that profile with the explicit Safe/relayer compatibility profiles. It does not
establish production capacity.

## Where requests wait

The relayer compatibility flow admits an unsigned request, assigns it to the user's retained
application Safe (or a retained shared-pool assignment), waits for that Safe's head, resolves the current nonce, verifies
current authority and simulates the call, signs the approved action, simulates the
signed call, and admits one durable relayer transaction. Independent chain
verification releases the Safe and sponsor capacity at inclusion. Financial
reservations and finality tracking remain separate.

Two accounts assigned to the same Safe therefore share a nonce stream. The
shared-pool profile admits one unincluded execution per sponsor. Five shared
Safes and five sponsors therefore allow five such executions at once; ten
simultaneous requests need at least two service rounds. The per-user profile
instead selects each user's own Safe and defaults to two in-flight executions
per sponsor, subject to accepted limits. Payer transactions still share their
sponsor's ordered EOA nonce stream. Different pools or a different message
broker do not remove this dependency. Safe 1.4.1 computes its transaction digest
with one account-wide nonce and increments that nonce during execution. See the
[Safe implementation](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/Safe.sol).

Serialization within an ordering domain is appropriate; serializing unrelated
users through a small number of domains limits throughput. FIFO brokers have the
same distinction: ordering applies within a message group, while separate groups
can proceed concurrently. See [SQS FIFO delivery logic](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-understanding-logic.html).
Changing Redis to SQS would change durability, distribution and operations, but
would retain the same five Safe nonce domains. The bundled native engine already
has separate request, submission and status workers; its public concurrency
settings are described in [OpenZeppelin's configuration reference](https://docs.openzeppelin.com/relayer/1.8.x/configuration).
Inspection of the pinned native v1.8.0 source and its locked Apalis Redis 0.7.4
dependency found a 100 ms default ready-job poll interval. The native queue's
two-second high-frequency setting applies to promoting scheduled jobs, not every
new request. This does not support blaming a multi-second broker poll for the
measured completion time. See the [native queue setup](https://github.com/OpenZeppelin/openzeppelin-relayer/blob/b8cf360a49c5739e43491ca5d2f6bbc934b7438e/src/queues/redis/queue.rs)
and [locked Redis implementation](https://docs.rs/crate/apalis-redis/0.7.4/source/src/storage.rs).

## Avoidable work in the implementation

- The observer now hands a persisted, verified nonce-consumption observation to
  the queue. The queue validates its immutable request/action binding and records
  inclusion without performing a second verification of the same head. A follower
  still freshly checks its predecessor's canonical inclusion before creating an
  action, and verifies current owner, grant, consent, nonce and simulation before
  signing and dispatch. A failed handoff is recoverable by the ordinary queue poll.
- A busy lane releases a newly ready follower immediately; stalled or unchanged
  lanes retain bounded retries. Reads of wallet status never submit a follower.
- Known receipt reads or cached-proof canonical-block reads overlap chain-head
  retrieval. Historical state checks overlap the canonical block read. Success is
  withheld until all required checks pass. Proof failure or a changed canonical
  hash still prevents progression.
- Shared application RPC pools prefer responsive healthy endpoints according to
  measured read time and concurrent operations, with thirty-second opportunities
  to probe idle alternatives. They retain shared capacity ceilings and backoff.
  A complete proof still uses one source. An unchanged submission source and gas
  policy reuse the installed native configuration; fresh transaction nonce,
  chain identity and offered-fee funding checks still run before admission.
- The verified immutable genesis pin can be reused for sixty seconds for an
  exact endpoint, transport and expected hash in shared single-source mode.
  Availability failures invalidate that pin. The current chain ID is still checked
  on every operation; canonical heads, ownership, nonce and simulation are not
  covered by this cache. Quorum and legacy observers retain fresh genesis reads.
- Background observation reserves up to three slots for pending inclusion and one
  for finality when both groups have work. Both groups rotate independently, so
  settlement progresses without taking all four slots from pending requests.
- The SQLite adapter reads the current durable rows in every transaction, but
  parses JSON only for records the operation accesses. It serializes accessed or
  replaced records before committing and retains untouched rows verbatim. Audit
  history is loaded lazily and remains append-only. Nested changes, deletion,
  collection replacement, rollback and updates from another connection retain
  their existing semantics. There is no cross-transaction authority cache or
  schema migration. Scanning the row index is still proportional to record count;
  a future repository API with targeted atomic reads would address that remaining
  storage scaling limit.

These changes preserve one durable financial admission per execution, immutable
signed plans, spending ceilings, caller/owner checks and canonical receipt proof.
They do not turn an admission acknowledgement or mempool hint into success.

## What bundlers and paymasters change

ERC-4337 sends a signed `UserOperation` to a bundler, which simulates it and
submits an EntryPoint transaction. A paymaster authorizes gas sponsorship and
maintains an EntryPoint deposit. This separates smart-account execution from the
application's own pool of gas-paying transaction senders. It can centralize gas
funding and allow one bundle to contain operations from independent smart accounts.
The bundler still chooses submission timing, fees and bundle contents; the
paymaster still requires funds and policy enforcement. These are capabilities,
not a latency guarantee. See the [ERC-4337 specification](https://eips.ethereum.org/EIPS/eip-4337).

ERC-4337 defines keyed nonce sequences, but a bundler's acceptance rules and the
account implementation determine usable concurrency. Canonical mempool rules
normally restrict an unstaked sender to one operation at a time; multiple nonce
keys do not guarantee that a public bundler accepts concurrent operations from
one shared Safe. Per-user accounts avoid cross-user sender contention. Independent
nonce streams also do not make spending from shared assets independent.

Safe requires an enabled Safe4337Module and matching fallback handler for this
flow. It is a different on-chain authorization profile from this service's
module-free relayer Safes. See [Safe's ERC-4337 design](https://docs.safe.global/advanced/erc-4337/4337-safe).
The accepted ERC-4337 profile uses the selected Base network domain, Safe 1.4.1,
module 0.3.0, EntryPoint v0.7 and nonce key zero. The Safe-only wizard configures
single-source verification and application-owned infrastructure. The embedded-host
adapter also retains explicit two-source quorum support. The separate relayer
compatibility profiles do not activate this account mechanism.
See [bundler execution](user-operation-execution.md). Base mainnet funded setup,
recovery and latency acceptance remain separate deployment gates.

| Approach                                        | Concurrency benefit                                                                       | Required work and tradeoff                                                                                                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current shared Safe and sponsor pools           | Independent lanes within fixed pool capacity                                              | Keeps existing addresses and authorization profile; unrelated users still share head-of-line waits.                                                                                                              |
| Per-user Safe with relayer sponsorship          | Removes cross-user Safe nonce contention without requiring ERC-4337                       | Implemented through accepted per-user provisioning and bounded payer concurrency. Account setup remains separate from warm execution; sponsor nonces still require ordering.                                     |
| Bounded pipeline of Safe transactions           | Can prepare or broadcast several ordered nonces before earlier receipts                   | Needs durable Safe and payer nonce allocation, enforced submission ordering, dependency simulation and recovery when a predecessor reverts or is reorganized. Raising sponsor concurrency alone is insufficient. |
| Per-user ERC-4337 Safe with shared paymaster    | Separates users' sender/nonce domains and delegates payer nonce management to the bundler | Needs the account/module profile, paymaster integration, Base acceptance and address/asset migration decisions. Can retain one application gas-funding interface.                                                |
| Batch multiple users into one outer transaction | Amortizes outer transaction overhead and can execute several Safe nonces together         | Changes independent failure, receipt attribution, budget and authorization handling. A failing atomic batch can delay every member.                                                                              |
| Sponsored EOA execution with EIP-7702           | Can use the user's existing EOA as a programmable account                                 | Introduces delegation authorization, code/profile validation and recovery responsibilities; it is not enabled by the current configuration.                                                                      |

For a new high-concurrency consumer-wallet product, independent per-user execution
domains are the preferred direction. A shared paymaster and bundler can supply
the gas rail; relayer sponsorship can also serve independent accounts with
appropriate payer nonce management. This recommendation is an architectural inference from the
nonce domains and account rules, not a measured comparison with a deployed
bundler. Existing user wallets and application Safes must not be silently migrated.
For shared-pool deployments, measure the remaining two-round service time before
increasing admission depth or introducing nonce pipelining. Measure per-user
execution separately so account isolation is not confused with a bundler gain.
The EOA delegation alternative is specified by [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702).

## Fast feedback and completion

Return the durable batch ID promptly and show pending state immediately. Report
verified execution separately from acknowledgement. Base offers Flashblock
streams and preconfirmed state before a full block seals; they can improve early
feedback, but require a capable application-owned RPC transport and explicit
preconfirmation/reorg handling. A mempool-received response is not execution
success. See [Base's RPC overview](https://docs.base.org/base-chain/api-reference/rpc-overview).

Measure acknowledgement, queue wait, preparation, provider acceptance, physical
inclusion and verified wallet completion separately. Compare the same users,
Safes, sponsors, calls and fee policy; record RPC availability, retained history,
funding changes and clock precision. Small live bursts are evidence for that run,
not a production p95 service objective or a bundler benchmark.

## Application-owned infrastructure

The Safe-only deployment uses per-user execution accounts, a private self-hosted
bundler and an application-owned verifying paymaster. Application setup supplies
its RPCs, accepted spending bounds and one gas-funding address. It requires no
vendor dashboard, hosted sponsorship policy or sponsorship credits.

[Alto's self-host guide](https://docs.pimlico.io/references/bundler/self-host)
documents independent executor wallets, utility funding and OP Stack settings.
The toolkit pins the private Alto runtime and retains its modified source and
license material in the separate bundler image.
Its executor keys must have separate nonce ownership from the existing relayer:
sharing a key between active engines would reintroduce contention and recovery
ambiguity. RPC rotation must apply to complete reads; a signed UserOperation
retains its execution mechanism and exact payload during receipt recovery.

An application-specific deployment of an upstream verifying paymaster can enforce
provider-issued sponsorship without a vendor policy service. The upstream
[SingletonPaymasterV7 source](https://github.com/pimlicolabs/singleton-paymaster/blob/1e2305d1102242379b582142f62bd17add12b8c2/src/SingletonPaymasterV7.sol)
has configurable owner, manager and signing keys. Verifying mode returns an empty
post-operation context and does not require token reimbursement. The toolkit includes a reproducible build, runtime pin derivation and an in-process ERC-7677 transport for this verifying mode. Local EVM tests check the upstream validator and financial tests require a current claimed sponsorship phase. These fixtures do not establish funded deployment acceptance. See [application-owned sponsorship](self-hosted-sponsorship.md). Bootstrap pins the complete
build and dependencies, journals each transaction before broadcast, verifies the
resulting code and roles, and funds both the EntryPoint deposit and the bundler's
initial transaction balance from the application funding interface.
User assets do not supply either gas reserve.

Hosted bundler sponsorship is a different optional mechanism. Alchemy's
[Bundler Sponsored Operations](https://www.alchemy.com/docs/wallets/transactions/sponsor-gas/bundler-sponsored-operations)
uses an off-chain sponsorship policy instead of an on-chain paymaster. The service
advertises lower execution latency, but that is a vendor claim rather than a
benchmark of this toolkit. Its documentation describes zero gas fields and
service-side filling. SafeOp signatures bind those fields; compatibility and
exact signed-operation recovery must be demonstrated before such a profile can
be admitted. It is not a substitute for the automatic self-hosted target.

The latency acceptance target is initially acknowledgement below one second and
verified execution below five seconds at p95 in a ten-user concurrent Base burst.
Record account provisioning separately from warm transaction execution. Measure
network pricing, preparation, sponsorship, signing, bundler acceptance, physical
inclusion and canonical verification, plus revert/timeout/restart recovery. Repeat
with retained history and stalled users to detect degradation. A small live burst
does not establish a production capacity or percentile guarantee.

## Observation scheduling and preparation

Durably known hashes are verified directly before provider recovery or inspection.
A complete canonical inclusion proof is persisted without waiting for provider
status or payer nonce diagnostics. Missing transaction identity and stalled
execution still use read-only recovery. Finalized replacement reporting retains
provider inspection; that settlement work does not gate first inclusion.

Observation workers refill independently as each slot completes, with at most
four background observations and a reserved settlement opportunity. Shared block
and tracked Flashblock hints wake these workers; bounded polling covers subscription
failure. Account-authorized SSE streams deliver saved status changes without a
client polling interval. See [wallet status streams](wallet-calls.md#stream-status-changes).

Safe preflight reads current configuration, nonce, target pins, sponsor balance and
the complete simulation concurrently against `latest`. It does not wrap each
preflight in additional block-snapshot reads. These separate responses can span
blocks; the full signed Safe simulation still executes atomically, and inclusion
requires the exact canonical transaction and Safe result. Unsigned and signed
preflight each read fresh state. The unsigned Safe simulation changes sender, signature validation
mode and gas price, so it is not reused as proof of the actual signed execution.

Stream notifications are filtered by the stored action ID, and unchanged execution
status does not notify listeners. Each stream still checks current account and
batch access on every read. Scheduler eligibility metadata can be reused for up to
one second; chain hints invalidate it without resetting per-action polling cooldowns.
That cache only selects read-only work.
Every actual observation reads the current execution record and verifies chain
proof independently. Worker completions queued during a scan trigger an immediate
refill after that scan; a slow worker cannot hold the other slots idle.

Configured network-fee preparation obtains its scan anchor and fee quote in one
operation on the selected application RPC. It checks network identity once for
that operation and overlaps fee history with the anchor read. It does not obtain
a second anchor just for quoting fees. Block hints can shorten a long polling
interval, but are limited to one signal-driven observation per action per second.
Relayer binding checks read sponsor and network metadata concurrently and share
overlapping identical GET requests within the same client. Completed metadata
responses are not cached. Status reads retain fresh canonical checks, including
contradictions to previously finalized evidence.
The configured optimized single-source reader returns provider backoffs and
transient internal errors to the endpoint pool promptly, so another healthy
accepted RPC can retry the complete read. It never combines partial proofs or
retries a financial write. Standalone bounded read retries remain available.
Once the accepted submission configuration is installed, read-only relayer
requests check that configuration and bypass the sponsor's configuration lock.
Receipt/hash lookup therefore need not wait behind another user's submission
RPC checks. Configuration changes and new submissions retain their existing lock
and current nonce, balance and authority checks.

Storage overhead also contributes to transaction latency. The synchronous SQLite
adapter enumerates current keys, then fetches record and audit JSON payloads by
primary key only on access. It does not transfer every historical signed plan
into JavaScript for each authority check. Current authority is read inside each
transaction, historical audit mutations still roll back, and returned snapshots
are detached before persistence. Key enumeration and one synchronous writer
remain capacity limits. See [storage](storage.md#use-it-for-onboarding).

The funding distributor checks retained receipt history in bounded groups of four,
sharing overlapping identical RPC reads and retaining nonce-order validation before
any broadcast. A receipt whose block is newer than the captured balance snapshot
halts further top-ups until a fresh sealed anchor includes that receipt. This
prevents a stale pre-credit balance from triggering another transfer to the same
sponsor. Funding progression uses inclusion; archival still follows finality.

A durable inclusion-proof marker binds the exact immutable plan hash and stored
full observation. A matching marker lets the configured single-source observer
restore its historical proof after restart or cache expiry. Every reuse still
checks chain identity, current heads and the canonical hash at that proof's block.
A changed plan, observation, canonical block or verification profile prevents
reuse. New execution authority, signing and simulation remain fresh. Unverified
application transaction reports never create this marker.

Finality is monotonic for matching freshly verified canonical evidence when RPC
heads lag. Explicit reconciliation of an older integrity fence requires an uncached
full proof of the original immutable execution and preserves its financial admission.
Unsigned expiry precedes predecessor observation so an unavailable lane cannot
retain an unsigned request beyond its authorization window.

## Shared RPC scheduling for Safe-only accounts

The Safe-only runtime binds each user's paymaster transport to the application
transport's shared scheduler. Independent user wrappers therefore share endpoint
capacity, overlapping identical reads, provider capability exclusions and pool
rotation. Each endpoint permits eight active reads and at most 64 waiting reads;
waiting work expires after three seconds. Complete authority proofs stay on one
eligible provider. Providers that reject state overrides or lack genesis history
are excluded from those jobs for five minutes while remaining eligible for
supported work such as fee reads.

The shared chain-head feed coalesces overlapping reads and retains latest heads
for 250 ms, chain identity for 60 seconds, and safe/finalized heads for 15 seconds.
Ownership, account nonce, spending permissions and funds remain block-bound
checks. Bundler chain and EntryPoint capability discovery is shared for 60 seconds
and invalidated by failed bundler responses. A failed final preflight leaves no
dispatch claim; the claim is persisted immediately before the transport effect.
Once a dispatch claim exists, uncertainty still prevents another submission.

A fully checked individual UserOperation receipt can be reused for two minutes in
the explicitly selected single-source profile. Its key includes the network,
verification profile, contract pins, exact signed operation, immutable intent and
gas ceiling. Each reuse fetches and checks the canonical hash at the receipt's
height. A reorg discards the proof. Quorum verification never shares this proof
between its sources.

An optional accepted `rpc-observation` service connects an encrypted Etherscan V2
credential for Base or Base Sepolia. It participates in rotation for canonical
block checks alongside the application's regular RPCs. The adapter only forwards
supported read methods and limits each API key to one request start per 350 ms,
with a bounded queue. State overrides and transaction submission remain on regular
RPC transports. See the [Etherscan proxy API](https://docs.etherscan.io/api-reference/endpoint/ethgetblockbynumber)
and [rate limits](https://docs.etherscan.io/rate-limits).
