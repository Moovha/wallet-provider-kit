# Submit and track standard wallet calls

Applications can submit and track atomic wallet batches through a standard API
while retaining your existing contract permissions. Configure the
[runtime policy](setup-wizard.md#_4-policies) and
[Safe queue execution](setup-wizard.md#_5-deployment) first. The EIP-5792 version
`2.0.0` transport exposes `wallet_sendCalls`, `wallet_getCallsStatus` and
`wallet_getCapabilities`; the optional request adapter supplies
`wallet_showCallsStatus` through your application's UI callback. The headless
server returns `4200` for that display method.

Select Base mainnet (`0x2105`) or Base Sepolia (`0x14a34`) for the Safe 1.4.1
mechanism. The examples below use Sepolia; use your selected chain ID and verified
deployments for mainnet. The configured service uses the Safe relayer queue. Advanced embedded hosts can
select the [ERC-4337 bundler driver](user-operation-execution.md) for accepted accounts
behind the same endpoint. Current owner identity,
contract delegation, runtime revision, claim freshness, registered methods,
shared budgets, code pins and independent executor checks still apply.

Use the [batch listing API](runtime-workspace.md#track-wallet-batches) to inspect
batches. Its bounded list distinguishes queue stage from verified
execution and keeps provider ledger access separate from application owner access.

## Configure and connect an account

Complete the [runtime policy and consent flow](runtime-configuration.md#use-registered-contracts-for-consent-and-execution).
Configure `runtimeConfiguration.authorizeContracts: true`, the
`approved-evm-executor-v1` profile and `execution.safeQueue`. Use the bundled local
execution engine or a separately configured designated executor. A designated
executor must opt into runtime contracts. No additional trust roots or deployment changes
are needed for subsequent accepted contract/method publications.

The authenticated JSON-RPC endpoint is:

```http
POST /v1/accounts/{accountId}/wallet
Authorization: Bearer <application-access-token>
Content-Type: application/json
```

The path selects an existing provider account and owner grant. The transaction
sender is its **configured Safe address**, not the EOA address of the signing
backend. Use the Safe address supplied during account binding or [automatic provisioning](safe-provisioning.md). A provided `from`
must match it. Omitting `from` selects that one configured Safe; this headless
profile does not open an account-selection window or change an account binding.

Every request needs `wallet:access:read`. Sending also requires `wallet:actions`,
`wallet:sign`, `wallet:execute` and current `contracts:request` owner consent.
Status and discovery require `wallet:execute:read`; retained status additionally
checks current `account:read` access for the same application subject and owner.
OAuth scopes alone cannot authorize a batch. An unconfigured or inactive service
returns HTTP 503; missing/invalid bearer credentials return HTTP 401/403.

## Discover atomic execution

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "wallet_getCapabilities",
  "params": ["0x1111111111111111111111111111111111111111", ["0x14a34"]]
}
```

Replace the fictional address with the connected account's Safe. The result is:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "0x14a34": { "atomic": { "status": "supported" } } }
}
```

Unsupported queried chains are omitted. This profile executes batches atomically
and contiguously even when `atomicRequired` is false. Discovery describes the
supported mechanism, not proof of code deployment, live funding or settlement;
preflight still checks the actual Safe and targets before dispatch.

## Submit a batch and retain its ID

Use registered contract targets and canonical ABI calldata, with hexadecimal
chain/value quantities and ordered calls:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "wallet_sendCalls",
  "params": [
    {
      "version": "2.0.0",
      "id": "0x1234567890abcdef",
      "chainId": "0x14a34",
      "atomicRequired": true,
      "calls": [
        {
          "to": "0x2222222222222222222222222222222222222222",
          "data": "0xa9059cbb00000000000000000000000033333333333333333333333333333333333333330000000000000000000000000000000000000000000000000000000000000001",
          "value": "0x0"
        }
      ]
    }
  ]
}
```

These addresses are fictional. The example encodes `transfer(address,uint256)`;
your provider must publish that actual contract/method and accept the resulting
authority before it can be used. A missing `value` means zero. A missing `data`
means empty bytes. Empty calldata with a positive value is supported for an
explicitly accepted native recipient, with matching provider/runtime permissions
and code pins. Otherwise it cannot match a registered method. Contract creation,
other chains and non-Safe senders are unsupported.

The result is `{"id":"0x1234567890abcdef"}` inside the JSON-RPC `result` field.
It confirms durable queue admission, not signing, broadcast or chain success.
The worker later prepares the exact nonce-bound Safe transaction or UserOperation and executes it under
fresh authority without waiting for an application status request. The service
never waits for a call to reach finality before admitting the remaining calls
within that atomic batch.

Prefer supplying your own unpredictable, unique batch ID before sending. It is
reserved atomically with the queue entry, separately from the JSON-RPC correlation
`id`. IDs are unique per application and sender, including across application
subjects, concurrent requests and process restarts. Duplicate submissions return
`5720`; retrieve the original status instead of creating another ID to retry an
uncertain effect. Without a supplied ID, the service generates 32 random bytes.
There is no automatic client retry and no HTTP `Idempotency-Key` requirement for
this interface. Losing a response with a generated ID can prevent the caller
from locating that batch; do not assume it was undispatched.

Opaque caller IDs are preserved exactly. Hex-encoded IDs may contain up to 4,096
bytes; other strings have a 4,096-byte UTF-8 limit. No ID grants status access.
The profile accepts up to 16 calls or the lower published limit, with at most
2 KiB of aggregate calldata from the existing Safe mechanism. Normalized calls
plus the publication snapshot must fit 8 KiB; the HTTP body is bounded to 64 KiB.
The service additionally constructs a side-effect-free size preview of the
encoded Safe plan and wallet-attempt envelope, using the largest nonce and block
quantities and every eligible configured sponsor. Designated execution also checks
its service handoff envelope. Oversized supported-envelope
requests return `5740` before admission, signing or nonce reservation. Larger transport bodies can receive HTTP 413.

The `atomicRequired` flag is supported directly. The embedded ERC-4337 driver
also accepts a top-level `paymasterService` capability bound to its exact configured
URL and an empty context; see its [integration guide](user-operation-execution.md).
The configured relayer profile implements no other request capabilities. Unknown top-level or per-call capabilities are rejected with
`5700` unless explicitly marked `optional: true`; optional ones are discarded.
Application-supplied paymaster or callback URLs are never fetched. Sponsorship
uses the server-selected, configured sponsor and its existing limits.

## Poll status and receipts

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "wallet_getCallsStatus",
  "params": ["0x1234567890abcdef"]
}
```

Results contain `version`, the original `id`, `chainId`, numeric `status` and
`atomic: true`:

| Status | Meaning in this profile                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `100`  | Queued, processing, accepted by a provider, or uncertain/unverified. No chain success is implied.                                                                                                     |
| `200`  | The configured RPC verification mode established inclusion and successful Safe execution, with the complete receipt subset. This is inclusion, not finality or a verified arbitrary business outcome. |
| `400`  | The unsigned batch was cancelled or expired with proof that signing was never admitted; the wallet will not execute it.                                                                               |
| `500`  | The exact transaction or Safe batch reverted completely according to the configured RPC verification mode.                                                                                            |

The atomic profile never reports partial execution status `600`. Receipts include
transaction/block hashes, hexadecimal block number and gas used, the actual outer
transaction status and ordered relevant logs. Safe bookkeeping logs are omitted;
logs from the target call tree are retained. A Safe `ExecutionFailure` can produce
batch status `500` with an outer receipt `status: "0x1"`: the outer transaction
succeeded while the inner Safe calls rolled back. The service preserves that
receipt distinction rather than inventing a transaction status.

Provider acceptance alone remains `100`. Missing receipt fields or disputed RPC
metadata do not produce `200`. Unfinalized inclusion can return to `100` after a
reorg or fresh-evidence failure; finalized records retain their final evidence
through temporary RPC unavailability on the relayer profile. The ERC-4337 driver
requires fresh independent evidence for status confirmation, uses the exact
UserOperation event outcome and gas usage, and isolates that operation’s logs
inside a bundle. It returns `100` on fresh-evidence failure, including for a
previously finalized observation. Polling and recovery never resubmit a batch.

## Design the application's wait states

Return control to the user when `wallet_sendCalls` returns its batch ID. Show
**Queued** until submission is observed, then **Submitted**, and **Included** when
`wallet_getCallsStatus` supplies a verified receipt. Status `200` means verified
execution at inclusion; it does not promise final settlement. Show **Finalized**
only when the execution or batch-listing API reports `chain_status: finalized`
with `verification: rpc-single` or `rpc-quorum`, according to the configured mode.
Choose a separate confirmation policy for irreversible fulfillment based on its
value and reversibility; wallet status alone is not a business settlement contract.
Base's [payment verification guide](https://docs.base.org/build-on-base/accept-payments/verify-a-payment)
uses two L2 confirmations in its example.

For the Safe relayer profile, status reads wait at most 250 ms for the RPC
observation task before reading retained evidence under current account access.
This bounds the observation wait, not authentication, storage or total network
latency. Concurrent reads and the worker share one observation task per action
in each coordinator. An unfinished observation continues in the background.
When the refresh exceeds that budget, verified inclusion observed within the
last five seconds can still supply its retained receipt. Older unfinalized
evidence or a detected refresh failure returns `100` without receipts. Finalized
evidence retains its recorded finality through temporary RPC failure.
Execution reads expose the retained `observed_at` timestamp. A contradiction
found by observation still fences the execution. A timeout never admits another
signing or submission attempt.

Shared-application observers can reuse a fully verified inclusion proof for up to
60 seconds after a fresh canonical block-hash check. This avoids repeating all
historical Safe reads during status polling. A reorg invalidates the proof;
current owner and simulation checks still run before every signing and dispatch.

Poll while the transaction screen is visible, with one request in flight and
a two-second initial interval. Back off to five seconds after 30 seconds and
offer the user a way to leave and reopen the transaction. Respect
`next_poll_after_ms` when using execution receipts. A slow RPC or finality delay
should leave the transaction pending and preserve the batch ID; do not create
a replacement batch automatically.

For ordinary Base calls, this profile requires one successful L2 inclusion and
no additional block confirmations. Safe queue progression uses the same inclusion
boundary; L1 finality is observed separately. Base documents approximately 200 ms
for Flashblock preconfirmation, 2 seconds for L2 inclusion and 20 minutes for L1
batch finality. These are [network stages](https://docs.base.org/specifications/transactions/transaction-finality),
not application latency guarantees. Flashblock feedback would require a separate
preconfirmation integration; the toolkit currently confirms canonical L2 inclusion.

The queue wakes after admission and at startup, so the configured observation
interval does not add an initial 5–300 second delay. Verification uses up to four
concurrent read requests per RPC source, with bounded throttling recovery.
Preflight, signing, submission, inclusion and finality still depend on the actual
providers. Measure their separate durations on your deployment before setting
an application service objective.

The Safe queue advances after independently verified inclusion and proof of Safe
nonce consumption. Financial settlement and reservation accounting continue
separately through finality. A reorg pauses the affected lane for reconciliation.
Use [shared Safe and sponsor pools](safe-queue-and-sponsor-pools.md#configure-shared-application-pools-and-overload-limits)
for independent users, stable sender discovery and bounded overload admission.

Publication changes require fresh consent for new effects and can cancel unsigned
queued work. Already signed or submitted work keeps its original policy, plan,
nonce reservation and batch identity. Authorized account-read status continues
after financial policy/claim changes. A signed authorization cannot be recalled
by changing registry data. Establish supported backup/retention operations for the
existing single-host SQLite store; no new table or schema migration is installed.

## Use the request adapter

The optional dependency-free client entry point works in Node.js and browser
bundles. Keep application OAuth client secrets on your backend. Browser callers
need an authorized short-lived token and compatible same-origin proxy or ingress
CORS policy; the adapter does not create a login session or change provider CORS.

```ts
import { createWalletCallsProvider } from '@moovha/wallet-provider-kit/wallet-calls';

const wallet = createWalletCallsProvider({
  url: `https://wallet.example.com/v1/accounts/${accountId}/wallet`,
  authorization: async () => `Bearer ${await applicationAccessToken()}`,
  showCallsStatus: async (status) => {
    renderBatchStatus(status);
  },
});

const sent = await wallet.request({
  method: 'wallet_sendCalls',
  params: [
    {
      version: '2.0.0',
      id: batchId,
      chainId: '0x14a34',
      atomicRequired: true,
      calls,
    },
  ],
});
await wallet.request({ method: 'wallet_getCallsStatus', params: [batchId] });
await wallet.request({ method: 'wallet_showCallsStatus', params: [batchId] });
```

`applicationAccessToken` and `renderBatchStatus` are application-owned functions.
The display callback runs only after an authenticated status read succeeds.
Without it, display requests return `4200`. The adapter exposes the EIP-1193
`request` shape for these four wallet methods; it does not implement injected
wallet discovery, `eth_accounts`, transaction signing or provider event APIs.
It uses HTTPS without redirects, forwards explicit authorization, validates
correlation/errors and never automatically retries a possibly admitted batch.

The server accepts single JSON-RPC requests with a bounded string/integer/null
correlation ID. JSON-RPC batch envelopes and notifications are unsupported.
Malformed envelopes/params return `-32600`/`-32602`, unsupported methods `-32601`,
unknown bundle IDs `5730`, authorization failures `4100`, unsupported chains `5710`
and temporary service failures `4900`. Reconcile an uncertain send using its
original batch ID rather than treating a transport failure as permission to resend.

Offline tests cover these wire contracts and financial fences. They do not prove
live-provider acceptance or certify general wallet interoperability. Arbitrary
contract execution alone does not prove business outcomes. Explicitly selected
[operation adapters](approved-contract-calls.md#select-optional-operation-adapters)
verify their supported token, swap and vault effects. Other business claims
require their own accepted verification.

## Stream status changes

Use an authenticated fetch stream at
`GET /v1/accounts/{accountId}/wallet/calls/{batchId}/events` to receive `status`
SSE events. The request adapter exposes `watchCallsStatus(batchId, signal)` as an
async iterator. Keep the bearer token in the authorization header. Each event
contains the same account-authorized EIP-5792 status as an ordinary status read.
Reconnect when the bounded stream ends, or fall back to `wallet_getCallsStatus`.
The stream lasts at most 55 seconds and permits two connections per account,
16 per application and 64 per service. Slow clients have bounded buffering;
a closed stream does not cancel or resubmit its transaction.

The configured single-RPC observer attempts one shared WebSocket connection using
the accepted HTTPS RPC endpoint's host and path with the `wss` scheme. It checks
chain identity, subscribes to new heads and, where supported, Flashblock transaction
hashes. Unsupported or disconnected streams retain bounded polling and rotate
accepted endpoints on reconnect. Endpoint support must be checked during deployment;
an HTTP credential does not establish WebSocket availability.

A matching Flashblock hint can appear under `capabilities.preconfirmation`, with
`stage`, `transactionHash` and `observedAt`. Status remains `100` until canonical
receipt verification proves the exact inner execution result. Preconfirmation
never releases execution capacity or financial reservations. Shared subscriptions
only wake bounded read-only observation workers; they do not submit transactions.
