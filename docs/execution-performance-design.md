# Execution scheduling and performance design

This design record is for developers reviewing wallet execution, resource limits
and performance experiments. It describes the baseline at `3d6bb2f` and the
source-pinned Alto v1.2.8 runtime. Performance acceptance of the scheduling
candidate in [PR #83](https://github.com/Moovha/wallet-provider-kit/pull/83) remains pending. Successful offline tests do not establish a
live latency or RPC improvement.

## Follow the four paths

The service has four cooperating paths. Treating them as one transaction queue
hides where time and external calls are spent.

| Path                   | Components and sequence                                                                                                                                                            | Durable state                                                                                                              | External work                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Request admission      | HTTP authentication → wallet-specific permission and policy checks → batch admission                                                                                               | Wallet-call batch and immutable caller input                                                                               | No transaction broadcast; acknowledgement means the batch was saved                      |
| Execution              | Account lane → predecessor check → nonce and fee preparation → gas estimate → action and sponsorship reservation → owner signature → private bundler acceptance → bundle execution | Approved action, sponsorship phases, signing attempt, exact signed operation, dispatch claim; separate Redis mempool state | Chain reads, read-only simulations, OWS worker, bundler request and executor transaction |
| Observation            | Bundler hint → independent chain evidence → receipt and operation validation → inclusion → safe/finalized checks                                                                   | Observation revision and verified receipt; expiry requires finalized absence evidence                                      | Block, log, receipt, transaction and code/effect checks                                  |
| Infrastructure funding | Recover saved infrastructure attempts → inspect deposit and executor balance → prepare a bounded refill → dispatch and reconcile                                                   | Infrastructure transaction journal and gas/value reservations                                                              | Balance and fee reads, estimates, funding transactions and receipt checks                |

The main implementation boundaries are
[wallet-call admission](https://github.com/Moovha/wallet-provider-kit/blob/3d6bb2f/src/wallet-calls/service.ts),
[account scheduling](https://github.com/Moovha/wallet-provider-kit/blob/3d6bb2f/src/sponsorship/wallet-calls.ts),
[signing and sponsorship](https://github.com/Moovha/wallet-provider-kit/blob/3d6bb2f/src/sponsorship/signing.ts),
[dispatch and observation coordination](https://github.com/Moovha/wallet-provider-kit/blob/3d6bb2f/src/sponsorship/execution.ts),
[independent receipt verification](https://github.com/Moovha/wallet-provider-kit/blob/3d6bb2f/src/sponsorship/receipts.ts)
and [runtime funding and worker composition](https://github.com/Moovha/wallet-provider-kit/blob/3d6bb2f/src/sponsorship/safe-wallet.ts).

Current owner, grant, identity, consent, published policy and immutable action
checks remain required at financial boundaries. An optimization must preserve
those checks and the original durable dispatch identity.

## Distinguish authority from available gas

Four limits have different meanings:

1. The application's lifetime gas allowance authorizes a bounded amount of
   sponsorship. Reserving that allowance does not deposit ETH on chain.
2. The infrastructure setup limit bounds retained funding transactions, including
   their transferred value and maximum fee reservations. It is not a report of
   actual gas expense. A funding balance alone cannot override it.
3. The EntryPoint paymaster deposit must cover the upfront requirement of every
   operation in a bundle. For v0.7, each requirement is the sum of call,
   verification, pre-verification, paymaster verification and paymaster post-op
   gas limits, multiplied by the operation's maximum fee per gas.
4. The executor needs its own ETH balance to submit the bundle transaction.
   Sufficient paymaster collateral does not supply executor liquidity.

The provider reserves the application allowance before usable sponsorship. Its
independent funding loop attempts to restore configured deposit and executor
balances every ten seconds. That loop can fail because either the funding
balance or the remaining infrastructure allowance cannot support a refill.
Those failures must be distinguishable from slow chain inclusion.

## Locate the waits and retry owners

In the baseline, the runtime wakes account workers about once per second. The
provider preparation semaphore allows ten active jobs, but its job includes the
whole account processing path through observation. Each wallet driver also
performs a historical inclusion check on a fifteen-second schedule.
`SafeWalletRuntime` waits for a driver's `runOnce` before running that driver
again. A historical read can therefore hold the same worker that a newly queued
request needs.

API chain reads share a maximum of eight active reads per endpoint and transport.
Capacity waits and ordinary RPC requests have three-second bounds. The bundler
runs in a different process with its own read scheduler and capacity limits.
Background reads can compete with nonce preparation, authority proofs and receipt
verification. Counting external methods across a variable-length interval mixes
this activity with the offered workload.

There are also separate retry owners: the account worker, read transport,
private bundler executor and infrastructure funding loop. A host dispatch claim
prevents a second `eth_sendUserOperation` from the provider; it does not mean the
bundler makes only one upstream transaction submission attempt.

The baseline launcher leaves Alto's `max-resubmits` setting unset. The pinned
[configuration schema](https://github.com/pimlicolabs/alto/blob/37cade5d2804a60ab30362ea27054514e1d7a7c8/src/cli/config/bundler.ts)
and [mempool implementation](https://github.com/pimlicolabs/alto/blob/37cade5d2804a60ab30362ea27054514e1d7a7c8/src/mempool/mempool.ts)
allow repeated resubmission cycles without a configured maximum. The executor
also has an inner submission retry loop. Retry limits, waiting for funds and
read-only reconciliation need separate policies.

## Explain the simulation mismatch

The pinned
[Pimlico filter](https://github.com/pimlicolabs/alto/blob/37cade5d2804a60ab30362ea27054514e1d7a7c8/contracts/src/PimlicoSimulations.sol)
simulates each operation using a separate `handleOps` call. Unused upfront
collateral returns after each call. A real combined `handleOps` call validates
and reserves collateral for all operations before executing them. Individual
simulation success therefore does not prove that their combined upfront
requirement fits the deposit.

The launcher uses Alto's private trusted-pool mode. In that mode the mempool
returns before the cumulative paymaster-deposit check used by its safe-mode
selection path. The later per-operation filter does not replace that check.
Enabling a different validation mode has additional semantics and costs; it
requires separate evaluation rather than a performance tuning guess.

A read-only historical replay on 22 October 2026 reproduced the mismatch using
eight retained Base Sepolia operations at one fixed canonical block. Both
configured RPC sources agreed on the block hash, and the operations were still
within their signed validity at that block:

| Replay                                                                          | Result                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| One bundle containing all eight operations                                      | `AA31`, insufficient paymaster deposit, at operation index four |
| Each operation individually                                                     | All eight succeeded                                             |
| Two sequential bundles of four within one simulation, sharing its state changes | Both bundles succeeded                                          |
| Four sequential bundles of two within one simulation                            | All four bundles succeeded                                      |

The sequential experiment used a temporary code override to call the unchanged
EntryPoint. It broadcast no transaction and changed no retained or chain state.
It establishes a bundle-feasibility defect; it does not establish end-to-end
latency, executor transaction affordability or production readiness.

At the stopped test checkpoint, the configured deposit target exceeded the
observed deposit by approximately 0.000045 test ETH. The funding account held
approximately 0.0000274 test ETH, and the infrastructure allowance had about
0.0000028 test ETH of headroom. Replenishment could not restore the target under
either constraint. That run cannot serve as a healthy comparison of scheduling
revisions. Eight dispatched operations remained without verified inclusion;
their original identities and reservations were retained for reconciliation. Subsequent read-only observation obtained finalized absence evidence for all eight under the configured single-source verification profile.

The patched, pinned mempool was also exercised with the original eight operations and the deposit balance from that block. It selected four, deferred four with their original identities and made one deposit read. A read-only call to the unchanged EntryPoint succeeded for the selected four; the full group still failed with `AA31`. This tests the proposed selection boundary against the reproduced defect.

## Executor acquisition and restart safety

The pinned [Redis sender manager](https://github.com/pimlicolabs/alto/blob/37cade5d2804a60ab30362ea27054514e1d7a7c8/src/executor/senderManager/createRedisSenderManager.ts) removes an executor from its available set with
`SPOP`. Its registered set survives a restart and prevents registration from
adding that executor again. The original manager waits 100 milliseconds after
both successful and unsuccessful pops, then records successful acquisition in
an in-memory active set. Graceful shutdown releases only that active set.
Stopping during the successful-pop delay can therefore leave a registered
executor unavailable after restart. The Redis pool keeps availability and registration sets without an ownership token or expiry.

Acquiring an executor on every empty scheduling cycle increases exposure to
that race. The private scheduler must first inspect the shared queue without
removing operations, acquire an executor only when work exists, and then select
against current funding. An acquired executor must enter the active set without
a timer delay; unavailable executors retain their polling backoff.

An offline test executes the pinned sender manager with an ephemeral Redis
substitute and checks active ownership immediately after the pop resolves.
The pinned scheduler test also checks that empty and unavailable queues do not
acquire an executor. These tests cover the observed acquisition window; they do
not establish recovery from an arbitrary process kill or Redis outage. An
orphaned retained lease must not be reset without reconciling original operations
and pending executor transactions.

## Implementation thesis

A viable execution design makes resource feasibility explicit at the component
that assembles and submits the bundle:

- Select operations whose cumulative upfront requirement fits the current
  paymaster deposit. Keep deferred operations' immutable identities; deferral is
  not permission to sign or submit a replacement user operation.
- Recheck bundle feasibility after acquiring the executor, where submission is
  serialized. Account for the difference between a simulation of individual
  operations and the complete bundle.
- Distinguish unavailable funding, exhausted authorized infrastructure allowance,
  RPC availability, bundler acceptance and verified inclusion in diagnostics.
- Bound submission retries and slow down unchanged infeasible work. Dropping an
  operation from a bundler queue never proves that it was absent from the chain;
  the provider's finalized absence proof remains required.
- Give historical finality and funding maintenance explicit scheduling budgets
  independent of admission. Share immutable chain evidence only with its
  canonicality and configuration checks intact.

The primary hypothesis is that resource-aware bundle selection removes repeated
infeasible submissions and their receipt polling. Historical-observer isolation
addresses a separate queue wait. Read aggregation is secondary and must be
justified by attributed call counts.

## Preserve read sharing while separating admission

A completed 80-offer crossover compared `3d6bb2f` with the admission-isolation
candidate at `0aa3031`. All transfers were independently verified and the
candidate reduced observed inclusion latency, but its four workload windows
used 1,825 external RPC method calls against the baseline’s 1,641. That 11.2%
increase fails performance acceptance. Each window lasted 60 seconds; the
separate idle windows also remained part of the evidence.

The serialized observer separated related checks by about one scheduling tick.
The latest-head feed lasts 250 milliseconds, and canonical block checks share
only overlapping requests. Serial observation therefore loses sharing that a
concurrent group can retain. An offline counterexample uses the actual RPC
reader: ten observations spaced one second apart make twenty latest-head and
canonical-block reads; ten overlapping observations make two. Neither experiment
caches completed canonical-block checks.

The correction groups up to ten due historical observers into one rotating
batch. Historical reads carry a background scheduling priority through the
existing endpoint capacity gate. At most two background reads can be active per
endpoint, within the unchanged shared ceiling of eight; queued current reads
receive available slots first. Read sharing occurs before capacity admission,
so matching requests still share their work. Waiting requests retain their
three-second bound and the queue remains bounded at 64, with at most 32 waiting historical reads to preserve room for current work.

This changes scheduling rather than receipt validity. Canonicality checks,
current authority checks, per-wallet observation cadence and existing feed
lifetimes remain required. A new controlled comparison is needed to establish
whether the correction improves both latency and total RPC usage.

## Make the execution visible before benchmarking

HTTP response timing primarily measures acknowledgement. Existing durable phase
timestamps are useful, but they combine some preparation work and omit the
bundler's internal state transitions. Aggregate method counters also discard the
reason for an RPC error.

Instrumentation should use fixed phase and outcome names for queue wait,
predecessor observation, nonce preparation, fees, estimation, admission,
sponsorship, chain verification, vault signing, bundler acceptance, broadcast,
receipt observation, finality and replenishment. Record wait and active time
separately, with RPC methods and sanitized failure categories attributed to their
owning path. Export no request bodies, signatures, raw URLs, headers, keys or
account/application identifiers.

## Required experiments

First test the funding arithmetic and deferral rules with ephemeral offline
fixtures, including a shared paymaster, concurrent operations, insufficient
executor funds, exhausted infrastructure allowance, expired operations and
unchanged retry failures. Exercise the pinned bundler integration rather than
only a helper that mirrors the intended implementation. Repeat the fixed-block
replay through the proposed selection boundary before live mutation tests.

For a healthy live comparison, establish sufficient balances and authorized
headroom for the entire preregistered workload. Retain identical wallets,
consents, policies, endpoints, fee limits, concurrency, instrumentation and
measurement windows across revisions. Alternate revisions and compare restarted
and warm runs separately. Keep local builds and test suites outside measurement
windows. Record background-only windows independently.

Every offered request belongs in the result. Record failures and incomplete
requests rather than calculating latency percentiles from only successes. Stop
when funding feasibility, endpoint health or retained state no longer meets the
starting conditions; reconcile original operations before another offer.
Independently check receipts, token events and balances, and report inclusion
separately from L1 finality. A latency or RPC improvement is accepted only after
these comparisons pass.
