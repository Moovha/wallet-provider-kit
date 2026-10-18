# Use OpenZeppelin Relayer

Choose Relayer in [Backend](setup-wizard.md#_2-backend) when your team already
operates a signer service and can assign distinct signers to wallet accounts.
Configure its [signer pool](operator-services.md#openzeppelin-relayer) through the
wizard. Separately, Deployment can use Relayer to submit transactions from
application sponsor accounts. This guide distinguishes signing from execution,
then describes their supported profiles, library interfaces and recovery needs.

The compatibility target is **v1.8.0**, source commit
[`b8cf360a49c5739e43491ca5d2f6bbc934b7438e`](https://github.com/OpenZeppelin/openzeppelin-relayer/tree/b8cf360a49c5739e43491ca5d2f6bbc934b7438e).
The adapter uses HTTP directly; no Relayer runtime, SDK or source code is bundled.
Relayer is AGPL-3.0 licensed and this kit remains Apache-2.0. Review the
[upstream license](https://github.com/OpenZeppelin/openzeppelin-relayer/blob/b8cf360a49c5739e43491ca5d2f6bbc934b7438e/LICENSE)
for the service you operate or modify.

For the configured signing service, select a [Relayer signer pool](setup.md#select-a-built-in-backend)
without startup code. The library profiles below remain available for advanced
hosts and the separate transaction-execution integration.

## Supported profile

| Capability      | Scope                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Network/account | Base Sepolia, chain 84532, EOA only.                                                                                             |
| Provisioning    | Bind an existing relayer/signer to a host account UUID. No key, signer or relayer creation.                                      |
| Typed signing   | Existing `evm_eoa_v1` revision 1; exact EIP-712 hashes and recovered signer checked.                                             |
| Submission      | Library-only `oz_relayer_evm_v1` revision 1; approved target, value, calldata, initial fees, gas limit and deadline.             |
| Nonces/workers  | Relayer owns nonce allocation, queueing, broadcasting and its replacement lifecycle.                                             |
| Recovery        | Host journal stores the provider record ID; authorized status reads check that exact record and call.                            |
| Evidence        | Offline HTTP fixtures with real signature cryptography. A real Relayer daemon, Redis, RPC and chain lifecycle remain unverified. |

The execution profile differs from the orchestration draft's nonce-bound
`SubmitTransactionAction`. Never silently drop that draft action's nonce to use
Relayer. Execution is available through the library interfaces below, not a
generic transaction HTTP endpoint. This profile does not establish conformance
with the draft execution contract.

## Connect your host

Configure Relayer through its [deployment guide](https://docs.openzeppelin.com/relayer/1.8.x).
Keep its administration API and credentials on the host's private service
boundary. External orchestrators receive scoped host access tokens, not Relayer
bearer keys. Direct Relayer access can bypass the host's consent/KYC checks.
Relayer policies supplement those checks; they cannot replace them.

```ts
import { EmbeddedWalletService } from '@moovha/wallet-provider-kit';
import {
  createOpenZeppelinRelayerWalletProvider,
  createOpenZeppelinRelayerExecutor,
  RelayerExecutionService,
  hashRelayerTransaction,
} from '@moovha/wallet-provider-kit/openzeppelin-relayer';

// Trusted host configuration and implementations; none come from HTTP bodies.
const connection = {
  url: relayerOrigin,
  apiKey: relayerBearerKey,
  resolveAccount,
};
const attempts = {
  namespace: 'your-product-relayer-test',
  journal,
  authorizeAttempt,
  authorizeStatus,
};
const signer = createOpenZeppelinRelayerWalletProvider(connection, attempts);
const wallets = new EmbeddedWalletService(walletAuthority, signer);
const execution = new RelayerExecutionService(
  executionAuthority,
  createOpenZeppelinRelayerExecutor(connection, attempts),
);

// During the host's preparation/consent flow, store the full approved action:
const payloadHash = hashRelayerTransaction(approvedTransaction);
// Later, dispatch by stored ID through the authenticated host application:
const accepted = await execution.submit(verifiedContext, storedActionId);
const observed = await execution.status(
  verifiedContext,
  storedActionId,
  accepted.transactionId,
);
```

`resolveAccount(accountId)` returns a server-owned `RelayerBinding`: `relayerId`,
`signerId`, expected checksummed `address` and `bindingRevision`, or null. IDs use
1–64 ASCII letters, digits, underscores or hyphens. Bind each relayer to its
intended owner/account. Metadata must confirm the expected signer, active
relayer, EVM `base-sepolia` network and chain 84532. Mapping changes during an
asynchronous lookup deny the request.

The execution authority loads the immutable action by ID and checks current
owner, grant, KYC as `ID VERIFIED`, consent/proof, target/calldata policy,
dependencies, revisions, expiry and budget. Its `purpose` distinguishes `submit`
from read-only `status`; status loads the original attempt without allocating a
new attempt or spending reservation. A principal or `wallet:sign` scope alone
does not grant execution permission.

Use the exported `RelayerExecutionAction` shape with `kind: relay_transaction`,
`profile: oz_relayer_evm_v1` and revision 1. Its transaction contains only `to`,
`value`, `data`, `gasLimit`, `maxFeePerGas` and `maxPriorityFeePerGas`. Amounts are
canonical decimal strings. Value supports uint256; gas/fee fields must be exact
JavaScript-safe integers for the upstream JSON API. Calldata is lowercase
even-length hex, at most 8 KiB. Contract creation, caller nonces, legacy gas
pricing, speed selection and other networks are unsupported. `payloadHash` is
keccak256 of the ABI tuple `(address,uint256,bytes,uint256,uint256,uint256)` in
that field order, not an Ethereum transaction hash. The journal fingerprints the
whole action, including chain/account, plan, revisions and deadline.

## Authorization and recovery

Both adapters require the [host journal and current-policy callback](durable-attempts.md).
Execution additionally requires `RelayerAttemptJournal.read`, a strictly
read-only lookup of the original bound claim/result or null, and `authorizeStatus`
for current read permission without a new spending lease. Dispatch authority is checked
again after remote metadata reads. The callback must validate the current lease,
owner/grant/consent and exact stored request; an unconditional true bypasses your
own policy.

Requests use a fixed HTTPS origin, ten-second timeouts, 64 KiB response limits,
no redirects, no ambient cookies and no mutation retry. Typed signing sends
validated `domain_separator` and `hash_struct_message`; no raw-hash HTTP endpoint
is exposed. Submission sends the approved fields and `valid_until`, encoding
value as a lossless Alloy U256 hex string. Returned signatures are verified.

This upstream endpoint supplies neither a caller-selected transaction ID nor an
idempotency contract. Any failed/lost POST response remains **unknown**, including
HTTP errors. Never create a fresh attempt or POST again to resolve uncertainty.
A known provider ID can be read without writes; a lost ID needs reviewed
reconciliation. A lookup miss cannot prove a mutation never happened. The adapter
checks record/relayer IDs, sender, target, calldata, value and gas limit, including
cross-relayer data returned under a valid URL.

Acceptance is a **provider record ID**, not a chain hash or financial success.
Status is the provider's observation. Verify finality, receipt success and intended
asset effects separately before settlement. Expiry/revocation stops new dispatch
and replay, but cannot revoke signatures or guarantee cancellation of queued
work. Authorized status reads remain possible after the original deadline.

## Before deployment

Submission requires `gas_limit_estimation: false` and a positive Relayer
`gas_price_cap` no higher than the action's approved maximum fee per gas. These
constrain normal processing, **not every recovery cost**: upstream NOOP
cancellation can force fee bumps past that cap, and Base incurs additional L1
fees. Account for operator-funded recovery exposure before enabling this profile;
don't promise bounded total sponsorship or charge unapproved costs to users.
Replacement/cancellation that changes the original call requires reconciliation.
No generic cancel, replace or funding API is exposed here. The designated
executor can perform [bounded fee-only replacements](automatic-replacements.md)
using a separately accepted [patched provider build](fee-only-relayer.md), which
disables autonomous repricing, cancellation and gap filling.

Prove the deployed service/RPC chain, signer isolation, private ingress, credential
scope, durable Redis/queue configuration, two-process journal concurrency, lost
results and restore. Configure Relayer's own logs/metrics for your privacy policy.
Test replacement/cancellation costs and on-chain effects.
The kit does not start Relayer, provision infrastructure, migrate a database or
move funds. OWS, direct CDP and Relayer are alternative backend compositions.
The Relayer integration requires its own configured signer; the kit does not
supply an OWS signer plugin for Relayer.

Sources: [API](https://github.com/OpenZeppelin/openzeppelin-relayer/blob/b8cf360a49c5739e43491ca5d2f6bbc934b7438e/openapi.json),
[request types](https://github.com/OpenZeppelin/openzeppelin-relayer/blob/b8cf360a49c5739e43491ca5d2f6bbc934b7438e/src/models/transaction/request/evm.rs),
[controllers](https://github.com/OpenZeppelin/openzeppelin-relayer/blob/b8cf360a49c5739e43491ca5d2f6bbc934b7438e/src/api/controllers/relayer.rs),
[typed signer](https://github.com/OpenZeppelin/openzeppelin-relayer/blob/b8cf360a49c5739e43491ca5d2f6bbc934b7438e/src/services/signer/evm/local_signer.rs),
[fee recovery](https://github.com/OpenZeppelin/openzeppelin-relayer/blob/b8cf360a49c5739e43491ca5d2f6bbc934b7438e/src/domain/transaction/evm/price_calculator.rs).
The v1.8.0 tag's OpenAPI reports `info.version: 1.5.0`; use the pinned source
revision above to identify this compatibility target. Pin a tested service
artifact and repeat acceptance on upgrades.
