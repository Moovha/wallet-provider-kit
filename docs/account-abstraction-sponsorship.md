# ERC-4337 and ERC-7677 sponsorship

Account abstraction can let a sponsor pay for compatible smart-account operations.
The library provides unsigned preparation and paymaster-client helpers for teams
building that integration. When choosing execution in
[Deployment](setup-wizard.md#_5-deployment), use the supplied
[relayer execution](execution.md) for the configured service: these helpers do not
enable ERC-4337 signing or submission. A custom integration must keep one
application gas-budget identity, runtime policy and immutable execution choice.

The `@moovha/wallet-provider-kit/sponsorship` entry point supplies unsigned UserOperation preparation, EntryPoint v0.7
hashing and gas-cost bounds, shared budget helpers and a trusted-host ERC-7677
client. **The configured service does not yet sign or submit ERC-4337 operations
or advertise `paymasterService`.** The helpers do not enable a new HTTP route,
account module or funding rail. The supported relayer paths retain their current
behavior.

## Responsibilities

The wallet provider verifies current owner, grant, identity evidence, consent,
exact calls and runtime policy. The connected application funds eligible gas;
Moovha takes that responsibility for Moovha operations. A sponsorship service
admits the budget and issues bounded sponsorship authorization. A paymaster
validates its authorization on-chain; a bundler submits UserOperations through
the pinned EntryPoint. None of these roles replaces the wallet's spending checks.

[ERC-4337](https://ercs.ethereum.org/ERCS/erc-4337) defines the account/paymaster
execution model. [ERC-7677](https://eips.ethereum.org/EIPS/eip-7677), currently in
Review, defines paymaster web-service methods and the EIP-5792 `paymasterService`
capability. The initial implementation deliberately pins EntryPoint v0.7 rather
than assuming that every EntryPoint version has the same hashing and gas rules.

## Prepare an operation using runtime policy

`prepareRuntimeUserOperationV07` accepts trusted provider infrastructure policy,
an application publication snapshot, the application's issuer/client identity,
exact contract calls, an unsigned operation and the configured sponsor pool.
It reuses the existing runtime policy and approved-call intent builder to check:

- application namespace, enabled canonical publication and policy hash;
- registered methods, canonical argument encoding, call count and per-method
  native values, plus the lower provider/publication aggregate native ceiling;
- the Safe sender and exact ordered single-call or CALL-only MultiSend encoding;
- a bounded expiry and the application's lowest configured sponsor-pool ceiling.

The result contains the exact unsigned operation and its EntryPoint hash, runtime
snapshot, intent fingerprint and gas budget terms. It explicitly returns
`authorizes_spending: false` and `authorizes_sponsorship: false`. Preparation
neither checks a live owner grant nor evaluates fresh user claims, reserves funds,
signs, installs modules or submits. Those checks remain mandatory at admission
and again before each external effect. A prepared intent is not a SafeTx action
and must not be passed to the existing relayer as a fallback.

The operation's calldata invokes Safe4337Module's `executeUserOp`. Batches use
the configured MultiSendCallOnly target. Actual Safe/module/fallback-handler,
EntryPoint, paymaster, proxy and bytecode checks remain activation gates. The
current SafeTx verifier still rejects enabled modules; this foundation does not
relax it or automatically upgrade accounts. See [Safe's ERC-4337 model](https://docs.safe.global/advanced/erc-4337/4337-safe).

The initial wire profile supports predeployed accounts on Base Sepolia only.
Factory deployment, EIP-7702, other chains and other EntryPoint versions are
rejected. Gas/fee fields use canonical hex quantities bounded by v0.7 validation
limits; the nonce is uint256. Calldata is bounded to 16 KiB and paymaster data to
4 KiB. User signatures are excluded from the unsigned preparation interface.
Hash vectors are checked independently against viem 2.57.7 and the
[v0.7 EntryPoint interface](https://github.com/eth-infinitism/account-abstraction/blob/v0.7.0/contracts/interfaces/IEntryPoint.sol).

## Keep one application gas ledger

`applicationGasBudgetId(providerOrigin, issuer, clientId)` preserves the existing
relayer budget identity exactly. The mechanism, payer and paymaster do not create
new application allowances. `applicationGasBudgetLimit` takes the lowest limit
among that application's configured pool members. The relayer coordinator
uses these shared helpers.

`maximumUserOperationCostV07` includes call gas, account verification gas,
pre-verification gas, paymaster verification gas and paymaster post-operation gas,
multiplied by the maximum fee, plus the configured rollup-fee reserve. Native call
value remains principal held by the account, separate from sponsored gas. A
paymaster may incur gas cost when execution reverts.

Existing SQLite admission and journal claims enforce the shared cap. Offline
cross-mechanism fixtures prove that combined claims cannot exceed it and that a
dispatched reservation survives reopening storage. This is accounting evidence,
not an activated ERC-4337 execution path. The future driver must also bind one
business operation to one mechanism: a shared budget alone does not prevent the
same operation from being dispatched twice through different adapters.

## Use the trusted-host paymaster client

`createPaymasterClientV07` implements `pm_getPaymasterStubData` and
`pm_getPaymasterData` against one server-configured HTTPS service and one expected
paymaster. Configure the EntryPoint/version, gas ceilings, maximum cost, rollup
reserve, credential supplier and `authorizeRequest` callback.

**Both methods can return usable sponsorship authorization**, including a stub
with `isFinal: true`. Before either request, the callback must establish fresh
owner/grant/consent/claim authority and a durable reservation for the supplied
worst-case liability. A scope, policy snapshot or prepared operation alone is
insufficient. This callback is an advanced trusted-host port; the configured
service does not supply durable ERC-4337 admission.

The client sends only a bounded context with application ID, policy revision/hash,
action ID and optional vendor policy ID. It does not send raw KYC data. Context
comes from trusted admission records; application assertions cannot select a
provider role, payer or budget. The client never follows redirects, sends cookies,
accepts credential-bearing URLs or retries. It bounds streamed responses, checks
JSON-RPC correlation, expected paymaster and gas limits, and sanitizes errors.
Optional sponsor icons must be bounded base64 image data URIs and are discarded.

Final requests require populated nonzero account gas estimates. A final response
can retain the validated paymaster gas fields from the stub. Any estimate or quote
change must be revalidated and covered by the durable reservation before a new
request. Unknown responses retain uncertainty; the caller must reconcile the
original sponsorship attempt rather than switch mechanisms or release its budget.

<span id="release-milestones"></span>

## Support and integration limits

Unsigned preparation, v0.7 hashing and cost bounds, shared gas-budget helpers and
the ERC-7677 transport are available as library interfaces. Their offline fixtures
exercise those contracts; they do not establish an accepted smart-account deployment.

The configured service does not provide ERC-4337 durable admission, owner signing,
bundler submission, receipt reconciliation or a `paymasterService` capability.
A complete integration would need accepted account/module/EntryPoint/paymaster
code bindings, current consent and claims, durable shared reservations before
paymaster requests, exact operation hashes, independent finality and recovery.
There is no wizard setting that activates those missing components.

Keep any custom integration explicit about its mechanism, sponsor and supported
contracts. Never switch an uncertain operation from ERC-4337 to the relayer or
silently charge the user's balance after paymaster refusal. Installing account
modules, deploying contracts and funding sponsors need their own reviewed
operating procedures. Return to [Deployment](setup-wizard.md#_5-deployment) for the
configured service's supported execution choices.
