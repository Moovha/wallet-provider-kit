# Submit and track standard wallet calls

Applications can submit and track atomic wallet batches through a standard API
while retaining your existing contract permissions. Configure the
[runtime policy](setup-wizard.md#_4-policies) and
[Safe queue execution](setup-wizard.md#_5-deployment) first. The EIP-5792 version
`2.0.0` transport exposes `wallet_sendCalls`, `wallet_getCallsStatus` and
`wallet_getCapabilities`; the optional request adapter supplies
`wallet_showCallsStatus` through your application's UI callback. The headless
server returns `4200` for that display method.

This is a Base Sepolia (`0x14a34`) profile of the existing Safe 1.4.1 mechanism.
The configured service uses the Safe relayer queue. Advanced embedded hosts can
select the [ERC-4337 bundler driver](user-operation-execution.md) for accepted accounts
behind the same endpoint. Current owner identity,
contract delegation, runtime revision, claim freshness, registered methods,
shared budgets, code pins and independent executor checks still apply.

Use the [runtime workspace](runtime-workspace.md#track-wallet-batches) to inspect
batches through forms. Its bounded list distinguishes queue stage from verified
execution and keeps provider ledger access separate from application owner access.

## Configure and connect an account

Complete the [runtime policy and consent flow](runtime-configuration.md#use-registered-contracts-for-consent-and-execution).
Configure `runtimeConfiguration.authorizeContracts: true`, the designated
`approved-evm-executor-v1` profile and `execution.safeQueue`. The matching executor
must opt into runtime contracts. No additional trust roots or deployment changes
are needed for subsequent accepted contract/method publications.

The authenticated JSON-RPC endpoint is:

```http
POST /v1/accounts/{accountId}/wallet
Authorization: Bearer <application-access-token>
Content-Type: application/json
```

The path selects an existing provider account and owner grant. The transaction
sender is its **configured Safe address**, not the EOA address of the signing
backend. Use the Safe address supplied during account binding. A provided `from`
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
means empty bytes, which cannot match a registered method. Contract creation,
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
encoded Safe plan and both journal envelopes, using the largest nonce and block
quantities and every eligible configured sponsor. Oversized supported-envelope
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

| Status | Meaning in this profile                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `100`  | Queued, processing, accepted by a provider, or uncertain/unverified. No chain success is implied.                                                                           |
| `200`  | RPC operators agree on inclusion and successful Safe execution, with the complete receipt subset. This is inclusion, not finality or a verified arbitrary business outcome. |
| `400`  | The unsigned batch was cancelled or expired with proof that signing was never admitted; the wallet will not execute it.                                                     |
| `500`  | The exact transaction or Safe batch reverted completely according to quorum evidence.                                                                                       |

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
contract execution still requires separately implemented business-effect verification
for claims such as swap minimums, vault shares or beneficiary settlement.
