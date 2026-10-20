# Safe execution latency

The configured service has one execution flow: a user Safe submits an ERC-4337
v0.7 UserOperation through the private bundler, sponsored by the application's
verifying paymaster. The OWS account is its private signer. EOA transfers,
shared application Safes, sponsor pools and the separate executor are retired
configured-service choices. Old configuration can be parsed for inspection;
starting or exporting it requires a reviewed migration. Existing records do not
change account meaning when configuration is loaded.

## Request and execution sequence

1. Authenticate the application and check current owner, KYC, grant, consent,
   published action policy and queue capacity. Persist the batch and acknowledge
   it before chain execution. Use the batch ID for retries and status.
2. Prepare the EntryPoint nonce and network fee quote concurrently. The nonce is
   advisory until the full account proof passes admission. Estimate the exact
   calls with the private bundler using non-authorizing signatures of the
   expected encoded size.
3. Verify account ownership, module, handler, guard, runtime pins, contract pins
   and nonce against canonical chain state. Reserve the application's bounded
   gas allowance durably before usable sponsorship.
4. Obtain final sponsorship, then sign the immutable SafeOp. The local paymaster
   can return `isFinal` from its stub phase because the gas values are already
   fixed. Recheck current financial authority at every signing boundary.
5. Recheck current chain and application authority before claiming dispatch.
   Submit the exact signed operation once. A timeout preserves its identity and
   triggers read-only reconciliation; it never selects another execution rail.
6. Verify the canonical bundle transaction, exact packed operation and signature,
   individual operation event and required effects. Push verified inclusion to
   the application through SSE; track finality independently.

The OWS signing worker resolves the current vault account and signs in one
short-lived process. It does not retain a decrypted key or cache spending
permission. Independent bundler discovery and observation-anchor reads overlap.
One scheduler shares the retained batch snapshot across independent account workers,
so adding users does not add another full queue scan per polling interval. Read-only
authority checks defer audit-history hydration until that history is actually used.
Append-only validation still applies whenever a transaction touches the audit log.
Endpoint scheduling coalesces matching reads and bounds concurrency; complete
account proofs can be reused only at their matching canonical block. Fresh Safe
inspections at the same endpoint and fixed block can share one read-only EVM
call, with at most ten independently checked accounts. Each result remains bound
to its original caller; one failed account proof does not authorize another.
The helper uses a temporary code override and is never deployed.

The network tip recommendation is capped at the application's accepted priority
fee ceiling. A recommendation is an estimate, not a protocol minimum. If the
current base fee plus that bounded tip exceeds the total fee ceiling, preparation
records `network_fee_limit`; subsequent retries check
fees before repeating nonce and preparation reads. The raw public fee sample is
shared for 500 ms, while each caller applies its current limits independently.
No fee ceiling is raised automatically. Existing signed operations are never
repriced by this calculation. A bounded tip can still delay bundler acceptance or
inclusion under congestion; a successful quote is not an inclusion guarantee.
[EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) defines the base fee and the
separate maximum total and priority fees.

## Expired uncertain operations

A missing bundler reply is insufficient to release an account lane. After signed
validity expires, the observer checks a finalized block whose timestamp exceeds
that validity. It scans every block from the retained submission anchor through
that block for the exact operation event, then rechecks the anchor's canonical
hash. Quorum configurations require agreement. Missing data, a changed block,
an event or an oversized scan leaves the operation unresolved. A successful
absence proof marks the batch expired so a new request can use the current nonce.
It does not delete attempts, reuse an idempotency identity or refund reservations.

The scan is bounded to 32 configured log pages. Older unresolved work beyond that
bound needs an operator investigation. The regular request path does not perform
this recovery scan.

## Measure the offered workload

Use ten concurrent distinct users, their ten retained Safes and the same
registered zero-value calls on Base Sepolia. Record offered, admitted, verified,
failed and unresolved counts. Measure acknowledgement and total verified delivery
from the client, alongside queue, preparation, sponsorship, signing, submission
and inclusion phases. Capture RPC method counts and errors separately from those
timings. Include bundler-side work when counting chain requests.

Require all ten outcomes for a successful latency comparison. A percentile from
only the completed subset is diagnostic evidence. Verify exact signed operations
and individual canonical success events independently after each burst. Preserve
funding limits, fee policy and failed records between comparisons; report cold
startup and policy renewal separately. Testnet measurements do not establish a
mainnet or production service objective.

## Base Sepolia burst evidence — 20 October 2026

Nine bursts each offered ten concurrent requests from the same ten retained user
Safes, using USDC `balanceOf(Safe)` and `transfer(Safe, 0)` in one atomic operation.
All nine reached ten verified successes. Calls transferred no user assets; the
retained test-network sponsors paid gas. Accepted limits remained 1,000,000 gas,
1 gwei total fee and 0.01 gwei priority fee per gas. Identity assertions were local
test fixtures. These results do not certify identity providers, production capacity,
mainnet operation or downstream settlement.

| Configuration / condition                       | Acknowledgement p95 | Verified SSE p95 |
| ----------------------------------------------- | ------------------: | ---------------: |
| Lean preparation and signing                    |              765 ms |         27.176 s |
| Diagnostic CPU capture; fee-policy waiting      |              642 ms |        113.814 s |
| Lean repeat                                     |              672 ms |         32.127 s |
| Shared worker; concurrent verification workload |              825 ms |         42.605 s |
| Shared worker; controlled repeat                |              643 ms |         27.647 s |
| Batched Safe inspections; after restart         |              729 ms |         34.291 s |
| Batched inspection repeat; fee-policy waiting   |              809 ms |         92.540 s |
| Bounded recommended tip; after restart          |              909 ms |         36.471 s |
| Bounded recommended tip; warm repeat            |              859 ms |         34.791 s |

The last two bursts used the bounded-tip selector described above; previous
bursts rejected recommendations above the priority ceiling. Neither changes the
accepted spending ceilings. The two bounded-tip runs avoided the long fee wait,
but more varied network conditions are needed to assess inclusion tradeoffs.

In the warm final burst, phase p95 values were queue 2.673 s, preparation 6.211 s,
sponsorship 4.650 s, signing 3.613 s, submission 6.661 s and inclusion 11.538 s.
Phase percentiles describe different requests and do not add up to total p95.
All ten exact signed operations, individual success events, canonical bundle
blocks, expected zero-value calls, fee ceilings and reserved cost bounds passed
an independent chain audit. Four canonical bundles included that burst.

Method counters include external chain requests from both API and bundler within
the offered-to-last-verified window, including failed requests and polling. The
controlled worker burst made 383 requests (API 211; bundler 172). Batched
inspections made 383 (207; 176): API `eth_call` decreased from 42 to 22, while
longer observation offset that saving. The final cold/warm bounded-tip bursts
made 345/357 requests; the warm run had API 178 and bundler 179, with no recorded
RPC errors. These small sequential samples are not a controlled estimate of the
fee selector's RPC savings. They establish neither a consistent end-to-end
speedup nor the under-five-second verified-delivery goal.

The earlier ten-user baseline completed only eight requests; its completed-subset
p95 cannot establish an offered-workload improvement. Its two uncertain operations
were resolved by finalized expiry/absence proofs, retaining attempts and financial
reservations. The new isolated bursts required no reset or resubmission of those
operations. Read-only catalog inspection verified the isolated SQLite schema;
this revision requires no schema migration. Private captures remain with the test
operator, outside the package and public repository.

The latency gate remains open. Prioritize repeated signing/submission proof work
and bundle-to-observation delay with phase and method evidence; preserve current
authority, canonical validation, immutable dispatch and sponsor budgets. The UI can
show durable acknowledgement immediately and distinguish it from verified success.

## Protocol references

[Safe's ERC-4337 design](https://docs.safe.global/advanced/erc-4337/4337-safe)
separates the Safe account from its EntryPoint-bound validation module.
[Safe's detailed submission guide](https://docs.safe.global/advanced/erc-4337/guides/permissionless-detailed)
uses bundler gas estimation before submission.
[ERC-7677](https://eips.ethereum.org/EIPS/eip-7677) defines paymaster stub/final
responses, the `isFinal` shortcut and the requirement for estimation stubs to
follow the final validation path.
[ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) requires bundler validation;
removing duplicate application reads does not authorize skipping that validation.
The [Alto documentation](https://docs.pimlico.io/references/bundler) describes the
private bundler implementation. The service pins its deployed version separately
from these evolving specifications.
