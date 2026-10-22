# Base Sepolia wallet acceptance evidence

This limited live test used Base Sepolia (chain 84532) on 21 October 2026. It
covered application sharing and multiple personal and shared Safe wallets, using
synthetic application-attested identity evidence. It did not use a real identity
verification vendor, change Safe signing thresholds, or establish production
custody readiness. Provider certification and mainnet acceptance remain separate.

## Scope and results

Ten synthetic users received distinct default Personal wallets. One user also
created Savings and Household wallets with current identity evidence reused and
separate consent. The application retained the original Personal account as its
default. Two applications had independently accepted transaction policies,
network services and fee agreements.

| Case                                   | Observed result                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Additional personal and shared wallets | Distinct Safes, reused current identity checks and wallet-specific grants.                                                                                                                                                                                    |
| Shared-wallet membership               | Invitations alone provided no access; the member accepted their own permissions. Changing permissions invalidated the old grant.                                                                                                                              |
| Member restrictions                    | Missing grant selectors, member management and member provisioning were denied. The member's Personal wallet remained available after removal.                                                                                                                |
| Application sharing                    | Exact ID number, document type and issuing-country matching connected both the source Personal wallet and an explicitly selected shared wallet. Mismatched identity and missing sharing consent were denied.                                                  |
| Independent application consent        | Revoking the requesting application's shared-wallet grant left its Personal-wallet grant and the source application's owner grant usable.                                                                                                                     |
| Nonzero test-USDC transfers            | Personal, Savings, shared-owner, shared-member and second-application transactions passed independent receipt, Transfer-log and balance checks.                                                                                                               |
| Concurrent users                       | Three runs offered ten nonzero transfers each across the same ten Personal wallets. All 30 completed, with independent log checks and aggregate balance conservation.                                                                                         |
| Duplicate requests                     | Reusing a batch ID, with identical or altered calls, returned the duplicate-ID error. Recovery used the original batch status rather than another transfer.                                                                                                   |
| Revocation after queue admission       | The removed member's request created no financial action. Before the queue fix, it retried 64 times before expiry. Repeating the case after the fix ended the request with zero retries. The owner's preceding transaction completed.                         |
| Restart and interrupted setup          | Confirmed infrastructure transactions matched their saved journal after a VM restart. Setup resumed its saved attempt; subsequent transfers and retained status reads succeeded after API restarts.                                                           |
| Administration                         | Live Applications settings showed sharing and member controls in plain language. The overview recovered after the user-check settings fix. An offline browser test also blocked admin JavaScript and verified that forms stayed inactive with POST fallbacks. |

The final workload produced 39 successful wallet operations and 43 nonzero token
Transfer events, including two owner transactions used for the removal checks.
Two queued member requests produced no financial action. The second configured RPC provider independently verified all 43 Transfer logs
and reconciled closing token balances across all 12 Safes, including the owner
transactions used for removal checks. Queue and financial journals confirmed that
neither removed-member request created a financial action.

## Latency and RPC observations

Acknowledgement measures the wallet-call response. Inclusion measures the
service's durable queue timestamp through its independently checked receipt
observation. It excludes later L1 finality. Each percentile below uses all ten
offered requests; p95 is the slowest request in that sample.

| Run                         | Completed | Acknowledgement p50 / p95 | Queue to inclusion p50 / p95 | External RPC method calls observed |
| --------------------------- | --------- | ------------------------- | ---------------------------- | ---------------------------------- |
| Initial concurrent run      | 10 / 10   | 33 / 177 ms               | 14.313 / 14.957 s            | 257                                |
| Warm run                    | 10 / 10   | 114 / 259 ms              | 16.712 / 18.314 s            | 268                                |
| After queue fix and restart | 10 / 10   | 47 / 115 ms               | 20.664 / 20.933 s            | 322                                |

RPC counts include the API and bundler's external method calls during the sampled
workload interval, including concurrent maintenance of earlier operations. They
exclude internal transport hops, faucet requests and the separate verification
harness. Batched methods count individually. The metrics were sampled once per
second; these are workload observations, not a controlled comparison of provider
billing, code revisions or production latency. The later run was slower despite
its faster acknowledgement and is not evidence of an inclusion-speed improvement.

A subsequent [controlled execution comparison](base-sepolia-execution-performance.md)
alternates fixed revisions with equal measurement windows, funding checks and
explicit historical-workload controls. Its results are reported separately from
the observations above.

A separate offline regression measured explicit grant selection against ten
stored grants: the selected-grant path read one grant instead of ten. Live queue
evidence established the removal of repeated revoked-request work; it does not
establish a general reduction in RPC calls per successful transaction.

## Funding and limits

The test allocated 0.0004 test ETH from existing test funds across the two
applications, within a 0.05 test-ETH authorization. At the receipt checkpoint,
47 confirmed infrastructure, funding and bundled execution transactions consumed
0.000087283633751520 test ETH in execution and reported L1 fees. Allocation and
gas expense are different: unspent gateway, executor and paymaster balances remain
in the isolated test environment. The canonical Base Sepolia USDC faucet supplied
one test USDC; transfers stayed between controlled test wallets. No native asset
transfer to an external recipient was part of the workload.

SQLite integrity checks passed. Every financial attempt at the checkpoint was
recorded as succeeded, and neither removed-member request had a financial action.
Receipts establish observed inclusion, with later safe/finalized observations
recorded separately. These timings do not measure completed L1 finality or promise
an inclusion service level. VM disk exhaustion and transient independent RPC read
errors interrupted earlier preparation; reconciliation and bounded read-only recovery
preceded further transactions. Failed setup and integration attempts are not
counted as successful workload requests.

Offline verification passed 704 tests, the administration browser test, TypeScript,
generated-contract and documentation checks, the secret scan, build, package dry
run and dependency audit with no reported vulnerabilities. Offline fixtures do
not replace the live evidence above. Cloud deployment, external identity vendors,
multisignature/device co-signing, mainnet funds and production disaster recovery
were outside this test's scope.
