# Submit sponsored wallet batches through a bundler

Advanced embedded hosts can connect EIP-5792 wallet calls to the durable
ERC-4337 SafeOp adapter. Applications submit registered contract calls, retain
the batch ID and poll the existing account-scoped wallet endpoint. The host
selects the execution driver and sponsor. The configured Safe-only CLI and wizard profile compose these components with
application-owned infrastructure; see [self-hosted sponsorship](self-hosted-sponsorship.md).

## Compose the host

First configure [durable SafeOp signing](durable-safe-op-signing.md): accepted
Safe 1.4.1 accounts, Safe4337Module 0.3.0, EntryPoint v0.7, one EOA owner,
nonce key zero, explicitly selected RPC verification, current runtime publications,
shared SQLite storage and explicit persisted sponsorship consent. The supported configuration domains are Base and Base Sepolia. Use independently reviewed code pins and infrastructure;
offline fixtures do not establish real deployment acceptance.

Bind the bundler configuration into the signing configuration **before** creating
the signing service. The resulting configuration hash is part of sponsorship
consent. Changing the bundler or its scan limits cannot silently reroute an
existing signed operation.

```ts
import {
  Safe4337SigningService,
  UserOperationExecutionCoordinator,
  UserOperationWalletCallsDriver,
  userOperationExecutionBinding,
} from '@moovha/wallet-provider-kit/sponsorship';
import { WalletCallsService } from '@moovha/wallet-provider-kit/http';

const bundlerConfiguration = {
  profile: 'safe4337-bundler-v07' as const,
  url: 'https://bundler.example.test/rpc',
  maxLogRange: 1000,
};
const signing = new Safe4337SigningService(
  actions,
  database,
  {
    ...acceptedSponsorshipConfiguration,
    submissionBinding: userOperationExecutionBinding(bundlerConfiguration),
  },
  {
    backend: protectedSigningBackend,
    authorization: paymasterCredential,
    authorizeSponsorship: authorizeStoredSponsorshipConsent,
  },
);
const execution = new UserOperationExecutionCoordinator(
  actions,
  database,
  signing,
  bundlerConfiguration,
  bundlerCredential,
);
const driver = new UserOperationWalletCallsDriver(
  actions,
  database,
  execution,
  {
    gas: acceptedGasBounds,
    maxDepthPerSafe: 10,
    maxWaitSeconds: 120,
    pollIntervalSeconds: 1,
    maxConcurrentAccounts: 10,
    maxDepthTotal: 512,
  },
);
const walletCalls = new WalletCallsService(actions, driver);
```

These variables represent trusted host integrations. `acceptedGasBounds` contains
nonzero canonical hex `callGasLimit`, `verificationGasLimit`, `preVerificationGas`,
`maxFeePerGas` and a bounded `maxPriorityFeePerGas`. Review them for your actual
calls and fee conditions; the batch driver does not fetch estimates or increase
fees automatically. The paymaster gas ceilings and rollup reserve come from the
accepted signing configuration. Use one shared application gas allowance and
operation ledger for both execution paths, and include their settings in the
host's active deployment revision.

Pass `walletCalls` to `createServer` from `@moovha/wallet-provider-kit/http`, with
the existing authentication, readiness and runtime services. The wallet-calls
client entry point exports the request adapter; the server class is exported
from `@moovha/wallet-provider-kit/http` as well. Start `driver.start()` only after
host acceptance and readiness checks, and await `driver.stop()` during shutdown.
For externally scheduled workers, call `driver.runOnce()` instead. Only the
accounts in the accepted signing configuration use this driver. An unsupported
account fails closed. A host serving both account profiles can use the existing
`WalletCallsService(actions, safeQueue, relayerExecution, driver)` constructor;
applications cannot choose the mechanism through RPC parameters.

## Discover sponsorship and submit

Use the same [wallet-calls endpoint, request shape and scopes](wallet-calls.md).
For an accepted sponsored account, `wallet_getCapabilities` includes:

```json
{
  "0x14a34": {
    "atomic": { "status": "supported" },
    "paymasterService": { "supported": true }
  }
}
```

Discovery checks the current account, grant, sponsor allowance and accepted
on-chain profile. It does not prove sponsor deposits or future inclusion.
A top-level `paymasterService` capability can name only the exact server-bound
paymaster URL and an absent or empty `context`. Arbitrary application URLs,
credentials, routing instructions and raw identity data are rejected. The host
uses its own credential supplier and bounded policy-derived paymaster context.
Unknown required capabilities, including per-call sponsorship overrides, remain
unsupported. ERC-7677 defines the capability; this profile deliberately supports
only a provider-bound service.

`wallet_sendCalls` durably reserves the caller's batch ID and FIFO position,
without signing or contacting a paymaster or bundler. The worker checks current
runtime authority, obtains the EntryPoint nonce, admits the common operation,
reserves shared budgets, obtains sponsorship and signs the exact SafeOp. It then
persists the complete signed operation, local EntryPoint hash and scan anchor
before acquiring a single durable dispatch claim. Authority is checked again
immediately before `eth_sendUserOperation`. The next batch for that Safe waits
until the preceding operation has verified canonical inclusion. Before preparing a follower, the worker freshly verifies its predecessor again. Independent accounts use bounded concurrent lanes; stalled preparation on one account does not hold every other account. Included operations retain settlement tracking and their full financial reservations. A blocked or
uncertain head retains its lane; it is not skipped on a timer.

## Recover the original operation

The trusted HTTPS bundler must report the configured chain and EntryPoint. Its
reply must equal the locally computed UserOperation hash. Lost, rejected,
malformed or mismatched replies retain uncertainty. An expired dispatch lease
cannot be reclaimed. Workers and status reads never resend the operation,
switch to a relayer, change the sponsor or debit the account to cover a refusal.
New batch IDs represent new business requests, so retain the original ID when a
response is lost.

Recovery uses `eth_getUserOperationReceipt` only as a transaction-hash hint.
Independent RPCs also scan bounded EntryPoint log ranges using the local hash,
so a missing bundler reply does not prevent recovery. The configured verification mode checks the canonical transaction, receipt, block and exact packed operation,
including its SafeOp signature. `handleOps` and zero-aggregator
`handleAggregatedOps` bundles are supported. Receipt validation checks pinned
EntryPoint bytecode, chain, sender, nonce, paymaster, operation event, gas bounds
and actual cost against the reserved ceiling. Outer transaction success alone
cannot confirm the batch.

The operation's `UserOperationEvent.success` determines `200` or `500`. Its
`actualGasUsed` supplies the receipt gas usage. Logs are isolated between the
preceding operation boundary (or `BeforeExecution`) and that operation's event;
EntryPoint, account, module and paymaster bookkeeping emitters are omitted.
Other UserOperations' logs and gas are excluded. This is execution evidence,
not proof of a particular DeFi business result.

Omitting `acceptance.rpcVerification` retains the two-operator quorum profile.
An explicit `single` profile accepts one to three application-owned RPCs and
selects one healthy source for each complete proof, with bounded availability
failover. It does not combine partial evidence from different sources. Verification
mode and endpoints are included in the signing configuration and consent identity.

Inclusion, safe and finalized observations are retained internally. Reorgs,
missing receipts or fresh RPC disagreement return `100` without additional
financial effects. Status requires the original caller and current account-read
grant, even after financial consent expires or is withdrawn. Revoking account
access denies that read. The operator list includes bounded summaries through
the existing batch workspace; fresh status reads supply chain evidence.

## Storage and operating limits

The SQLite onboarding record store holds the batch, immutable execution plan,
dispatch fence, scan cursor and observations. Its existing collection/id primary
key and transaction boundary provide persistence; this adapter adds JSON
collections without SQL DDL. Schema compatibility is validated when the toolkit
opens the store. Protect signed operations, sponsorship data and backups as
usable authorization material.

Both shared reservations retain the full admitted worst-case amount, including
after a revert. Verified actual cost is recorded for reconciliation; automatic
refunds, expiry release and fee replacement are not implemented. Use a reviewed
operational reconciliation procedure before adjusting allowances. Keep workers
on compatible revisions, quiesce before restoring backups, and do not restore a
stale dispatch journal into an active sender.

Configured operator controls, deposit monitoring, unfunded real-service
interoperability, separately authorized funded acceptance, and backup/rollback
acceptance remain rollout gates. This adapter does not install modules, fund
accounts or certify a bundler/paymaster. See [the sponsorship overview](account-abstraction-sponsorship.md)
for the configured service boundary.
