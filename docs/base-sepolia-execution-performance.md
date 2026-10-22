# Base Sepolia execution performance

This evidence summary is for developers evaluating wallet-call scheduling and
RPC usage. It compares `3d6bb2f` with `30641f3` on Base Sepolia, chain 84532,
on 22 October 2026. It establishes observations for one retained test deployment
and workload, not production capacity, another network's performance or provider
certification. The [execution design](execution-performance-design.md) explains
the component boundaries and the defects reproduced before implementation.

## Controlled transfer comparison

The complete comparison offered 80 operations: ten concurrent, nonzero USDC
transfers in each of eight runs. Each transfer moved 1,000 base units to the next
wallet in a ten-wallet ring. Each successful ring restored every wallet's token
balance. All 80 operations completed inside their respective 60-second windows
and passed independent receipt, canonical block, exact transfer-event and closing
balance checks.

The order was baseline, candidate, candidate, baseline. Each process restart was
followed by one restarted run, one warm run and a separate 60-second idle window.
Both revisions retained the same wallets, consents, action policy, RPC endpoints,
single-source verification profile, fee limits, funding targets, request limit,
instrumentation and workload. Compiled code, container images, configuration,
profilers and harnesses were fingerprinted before offers. Builds and test suites
ran outside measurement windows.

Historical work was controlled as well. Earlier operations in the measured
wallet cohort were finalized before a ten-operation seed ring established a
common included predecessor. Included-record counts were checked before and
after every workload and idle window. They increased only by the ten offered
operations. Both RPC sources agreed that the earliest seed block remained
unfinalized after the complete series. Two unrelated application records remained
constant outside this cohort.

Inclusion below means the durable queue timestamp through the service's verified
receipt observation. It excludes subsequent L1 finality. Percentiles use nearest
rank over **every offered operation** in the stated sample. A run's p95 is its
slowest operation; pooled samples use their own percentiles rather than averaging
run percentiles.

| Order | Revision  | Process state | Verified / offered | Inclusion p50 / p95 | External RPC methods |
| ----- | --------- | ------------- | ------------------ | ------------------- | -------------------- |
| 1     | Baseline  | Restarted     | 10 / 10            | 18.053 / 19.432 s   | 353                  |
| 1     | Baseline  | Warm          | 10 / 10            | 20.854 / 21.293 s   | 378                  |
| 2     | Candidate | Restarted     | 10 / 10            | 16.752 / 18.438 s   | 496                  |
| 2     | Candidate | Warm          | 10 / 10            | 13.917 / 16.861 s   | 391                  |
| 3     | Candidate | Restarted     | 10 / 10            | 16.860 / 17.591 s   | 401                  |
| 3     | Candidate | Warm          | 10 / 10            | 13.259 / 13.604 s   | 317                  |
| 4     | Baseline  | Restarted     | 10 / 10            | 18.587 / 19.997 s   | 561                  |
| 4     | Baseline  | Warm          | 10 / 10            | 16.023 / 17.701 s   | 406                  |

| Sample per revision | Baseline inclusion p50 / p95 | Candidate inclusion p50 / p95 | Baseline / candidate RPC methods |
| ------------------- | ---------------------------- | ----------------------------- | -------------------------------- |
| 20 restarted offers | 18.133 / 19.901 s            | 16.860 / 17.879 s             | 914 / 897                        |
| 20 warm offers      | 17.521 / 21.226 s            | 13.573 / 16.714 s             | 784 / 708                        |
| All 40 offers       | 17.907 / 21.147 s            | 15.902 / 17.745 s             | 1,698 / 1,605                    |

The pooled inclusion median fell 11.2% and p95 fell 16.1%. Workload RPC usage
fell 5.5%, with substantial variation between runs; the restarted subtotal fell
only 1.9%. These are observed reductions, not confidence bounds or a guarantee
for every run. The first candidate pair used more calls than the first baseline
pair. Reversing the order makes that variation visible instead of selecting only
the favorable pair.

Counters include upstream JSON-RPC **method calls** from both the provider API
and private bundler, including failed methods, maintenance and historical
observation during each fixed window. Internal API-to-bundler methods and the
independent verification harness's reads are excluded. Counter snapshots were
sampled every 250 milliseconds; each role's measured interval stayed within
59–61 seconds and within the same process instance. No API capacity admission
was rejected before work. The baseline recorded five account-processing retries;
the candidate recorded none. Those retries and calls remain in the totals.

The initial acknowledgement timer included serialized measurement-journal writes
before the SDK request. Its figures are excluded from the service response-time
comparison. This instrumentation limitation does not affect durable inclusion
timestamps or fixed-window method counters.

## Repeat with corrected acknowledgement timing

A second complete comparison offered forty transfers in four restarted runs,
again ordered baseline, candidate, candidate, baseline. The timer started after
the harness's durable journal write and measured the SDK request through its
response. All forty offers completed inside their 60-second windows and passed
the same independent checks. Earlier measured history was finalized, and a fresh
ten-operation seed established the common predecessor before this comparison.

The application's accepted lifetime allowance was raised from 0.002 to 0.003
test ETH and its ten synthetic wallet consents renewed before the fresh seed.
The retained ledger preserved prior reservations. Both revisions used the same
allowance within this comparison. Per-operation fee limits, funding targets and
service code remained unchanged; these results are kept separate from the
80-offer comparison.

| Order | Revision  | Verified / offered | Acknowledgement p50 / p95 | Inclusion p50 / p95 | External RPC methods |
| ----- | --------- | ------------------ | ------------------------- | ------------------- | -------------------- |
| 1     | Baseline  | 10 / 10            | 492 / 959 ms              | 17.261 / 18.893 s   | 382                  |
| 2     | Candidate | 10 / 10            | 409 / 882 ms              | 14.870 / 15.599 s   | 413                  |
| 3     | Candidate | 10 / 10            | 455 / 1,006 ms            | 14.712 / 15.680 s   | 462                  |
| 4     | Baseline  | 10 / 10            | 469 / 956 ms              | 17.221 / 19.392 s   | 513                  |

Across all twenty offers per revision, acknowledgement p50/p95 was 492/956 ms
for baseline and 455/914 ms for candidate. Inclusion p50/p95 was
17.261/18.953 s versus 14.840/15.599 s. Workload RPC methods fell from 895 to
875, or 2.2%. One candidate account-processing retry and all its calls remain
included; baseline recorded none. API capacity rejected no work.

The four separate idle windows used 181, 181, 186 and 182 methods in order.
Candidate idle usage was slightly higher: 367 versus 363 methods. Including
workload and idle gives 1,242 candidate versus 1,258 baseline methods, a 1.3%
observed reduction. RPC savings repeated, but remained small and variable.

Historical counts passed before and after every window. At the final read-only
check, both RPC sources still reported finalized heights below the earliest seed
block. Their finalized heights differed; they agreed on the canonical block at
the common finalized height. These checks do not measure later L1 finality.

## Attribute the RPC change

The 80-offer comparison's method totals break down as follows:

| Owning process or path        | Baseline methods | Candidate methods |
| ----------------------------- | ---------------- | ----------------- |
| Provider API, total           | 831              | 819               |
| API active execution          | 367              | 267               |
| API predecessor verification  | 56               | 55                |
| API historical reconciliation | 263              | 360               |
| API infrastructure funding    | 145              | 137               |
| Private bundler, total        | 867              | 786               |

Historical reconciliation made more calls while active execution made fewer.
Total API usage changed only slightly. The bundler submitted seven independently confirmed bundle
transactions for the candidate's 40 operations, compared with eleven for the
baseline. Its log scans fell from 91 to 64. Fewer bundles and scans account for
much of the observed RPC reduction; the result does not mean every path became
cheaper.

The independent idle windows contained no offered wallet calls:

| Order | Revision  | Window | External RPC methods |
| ----- | --------- | ------ | -------------------- |
| 1     | Baseline  | 60 s   | 161                  |
| 2     | Candidate | 60 s   | 196                  |
| 3     | Candidate | 60 s   | 193                  |
| 4     | Baseline  | 60 s   | 301                  |

The idle subtotals were 462 baseline and 389 candidate methods. Including both
workload and idle windows gives 2,160 versus 1,994 methods, a 7.7% observed
reduction. Idle results remain separate because historical work changes as
operations accumulate.

## Preserve unsuccessful experiments

An earlier complete 80-offer comparison of `0aa3031` reduced inclusion latency
but increased workload RPC usage from 1,641 to 1,825 calls, or 11.2%. It failed
performance acceptance. Serial historical observation had lost overlapping read
sharing. An offline experiment using the actual reader reproduced twenty reads
for ten separated observations versus two for overlapping observations, with
unchanged canonicality freshness. The subsequent implementation batches due
historical observers and applies background priority at both endpoint routing
and capacity admission.

An intermediate series at `88ef6fc` stopped during independent post-window
verification after an RPC server error. All sixty offered transfers were later
verified using their original identities and windows, but the missing final
baseline pair prevents treating it as a complete comparison. Earlier funding
shortfalls and an orphaned executor also stopped trials; original signed
identities were retained and finalized absence was established before recovery.
They are not improvement evidence.

A restarted acknowledgement follow-up offered ten baseline transfers before its
historical seed finalized. It stopped before candidate offers. That partial run
is excluded from matched results.

The [earlier wallet acceptance report](base-sepolia-wallet-acceptance.md) retains
its original latency/RPC table. Its later, slower run is not evidence of a
performance improvement.

## Retained test environment

The test allocated 0.0018 test ETH across its two applications, including earlier
funding, within the 0.05 test-ETH limit. Allocation is different from gas expense;
unspent funding, executor and paymaster-deposit balances remain in the isolated
environment. Native value in the controlled transfer calls was zero.

Final reconciliation matched 395 nonzero token events across the retained
experiments with closing balances in all twelve controlled Safes. Only the 120
offers in the two complete comparisons above support their performance tables.
SQLite integrity passed, no wallet-call batch awaited execution, infrastructure
transactions had no pending outcome, and executor nonces matched between latest
and pending reads. The two unrelated historical receipts were independently
verified finalized without changing their retained bookkeeping.

The isolated services were stopped with activation disabled. An encrypted backup
of their persistent volumes, current test configuration and funding journals
passed decryption and round-trip verification. No application deployment, npm
release or production custody certification is established by these tests.
