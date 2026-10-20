---
prev: { 'text': 'Test the connection', 'link': '/docs/staging-walkthrough' }
next: { 'text': 'Monitor your service', 'link': '/docs/operations' }
---

# Check your service before welcoming users

A working console is the start. Before allowing real wallet use, your provider
team needs evidence that permissions, transactions and recovery behave correctly
in its own deployment. Keep wallet operations disabled until that review passes.

The toolkit is experimental. Offline tests, a container build and a testnet
transaction answer different questions; none is provider certification or proof
of production custody readiness.

## Review with your team

| Area                   | What you need to establish                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| User access            | Identity checks and consent are current; expired or revoked approvals deny access.                          |
| Application separation | One application cannot use another application’s accounts or become a provider operator.                    |
| Transaction limits     | Only approved immutable calls can execute, within accepted value and fee ceilings.                          |
| Network authority      | Safe owner, threshold, modules, handler, guard and pinned contracts match canonical chain state.            |
| Retrying requests      | Identical retries preserve identities; changed input conflicts; uncertain dispatch is reconciled.           |
| Recovery               | Vault, credentials and database restore together, with one active writer and unresolved attempts preserved. |
| Operations             | Monitoring, access control, funding responsibility and incident ownership are assigned.                     |

Use [Test your application connection](staging-walkthrough.md) for the shared
operator/developer rehearsal and [maintenance](provider-maintenance.md) for backups.
Record both passing evidence and unresolved limits before enabling operations.

<details>
<summary>Source and package checks for maintainers</summary>

Run `npm run verify`, `npm run build`, `npm run check:package`, `npm audit` and
`npm pack --dry-run`. These check offline contracts and fixtures. Record Docker
startup/restart/storage evidence separately from image builds, and cloud or
live-provider acceptance separately from both. See the [release process](releases.md).

For performance comparisons, retain the same ten users and workload, include all
offered requests and independently verify every operation. Testnet evidence is
not a production service objective.

</details>
