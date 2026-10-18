# Approve contract calls, swaps and vault deposits

The `approved-evm-executor-v1` profile extends the execution foundation beyond
transfers. Applications propose contract calls or supported swap/deposit inputs;
the wallet authorizes and stores an immutable action. Execution uses its stored
ID, authenticated dispatch, an independent executor journal and read-only
recovery. OAuth scopes alone never authorize a call.

The current general-call mechanism uses a pre-existing **Safe 1.4.1 account with
exactly one EOA owner, threshold one and no enabled modules**, on Base Sepolia. The toolkit's wallet
backend signs as that owner. Calls execute from the Safe, where the assets must
be held; the sponsor pays network gas. This does not convert an EOA, transfer its
assets, deploy a Safe or enable account abstraction automatically. Those are
separate, explicitly accepted operator tasks. The existing ERC-3009 EOA transfer
profiles remain available.

The package remains experimental. Offline fixtures verify internal contracts;
they do not establish live Safe/vendor acceptance, contract certification or
production custody readiness.

## Operation profiles and outcome meaning

| Operation      | Request                                                                | Authorization and verified outcome                                                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract calls | `kind: contract-call`, exact ordered `calls`                           | Every target, function selector and native value must be permitted. A matching Safe execution event proves successful execution of the approved calls. It does not prove an arbitrary business result.                                                                                      |
| Swap           | `kind: swap`, configured route, `amount_in`, `minimum_out`, `deadline` | Constructs the original Uniswap V3 `exactInputSingle` interface, with the Safe as recipient, exact input approval and allowance cleanup. Verification additionally requires exact net input and at least the minimum net output.                                                            |
| Vault deposit  | `kind: vault-deposit`, configured route, `assets`, `minimum_shares`    | Constructs Yearn4626Router-compatible `depositToVault(address,uint256,address,uint256)` with asset pulling, bounded approvals, on-chain minimum shares and cleanup. Verification requires the exact underlying asset movement, minimum minted shares and matching ERC-4626 `Deposit` event. |

The swap adapter is for the [original Uniswap V3 interface](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/ISwapRouter.sol),
including its deadline. SwapRouter02 and Universal Router have different
contracts and are not silently substituted. Vault routing follows
[Yearn4626Router](https://github.com/yearn/Yearn-ERC4626-Router/blob/master/src/Yearn4626Router.sol)
and its [minimum-share check](https://github.com/yearn/Yearn-ERC4626-Router/blob/master/src/Yearn4626RouterBase.sol).
A bare ERC-4626 `deposit(assets,receiver)` does not express a minimum share bound;
a preview is not an on-chain slippage guarantee. See [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626).

Applications choose their explicit minimum output/share amounts. The service does
not source quotes or certify a fair price. Operators must review the configured
routers, pools, vaults and token implementations. Only reviewed tokens with
reverting approval failure behavior are suitable for the built-in approval
batches; MultiSend does not interpret an ERC-20 `false` return as a revert.

## Configure the two services

Use the disabled [wallet example](provider.config.contracts.example.json) and matching [executor example](executor.contracts.config.example.json) as format references. All addresses, hashes and account IDs are fictional; replace them with independently verified bindings.

First establish the [designated execution service](execution-service.md), its
separate database and pinned service-authentication keys. Select
`approved-evm-executor-v1` on the wallet. In the wizard's **Deployment** screen,
enable the approved contract-call policy and configure:

- The provisioned owner wallet account UUID and its pre-existing Safe address,
  Safe proxy runtime hash, singleton address and singleton runtime hash.
- The reviewed MultiSendCallOnly address and runtime hash. Multiple calls use a
  delegatecall only to this pinned batching implementation; individual calls are
  ordinary calls. Applications cannot request delegatecalls, Safe self-calls,
  account administration or arbitrary batching implementations.
- Maximum native value per operation and a lifetime admitted-operation count per
  owner account across applications. A failed or unknown signing attempt retains
  its reservation. The operation count is separate from each service's sponsor
  gas budget.
- Each permitted general contract address, code hash, function selectors and
  native-value limit; each swap route's token pair, router, pool fee and maximum
  input; each vault route's router, vault, asset and maximum deposit.

These settings are exported as independent `approvedCalls` configuration. A
contract-only deployment does not require `financial`, a transfer token/domain or
`execution.rpc.tokenCodeHash`. Transfer policies and contract-call policies can
also coexist. Configure matching contract policies in the selected executor
provider's `contractCalls` field. Its provider ID/revision remains pinned; a
policy change requires a new provider revision, not reuse of the old revision.

For an ERC-1967 implementation proxy, also configure `implementation.address`
and `implementation.codeHash`. Both RPC sources check the
[ERC-1967 implementation slot](https://eips.ethereum.org/EIPS/eip-1967) and code
before dispatch and at the receipt block. Safe proxies use their separately
pinned singleton binding. Beacon proxies and other proxy architectures need a
separate reviewed mechanism; proxy bytecode alone does not identify logic.
Pins and simulation cannot prevent an upgrade between simulation and execution.

The `accounts` registry is private operator configuration. Access-policy terms
omit all account bindings; each authorized action exposes only its own execution
account. No endpoint creates, funds or discovers Safe accounts for an application.

## Obtain explicit contract delegation

Allow `contracts:request` for the calling application in **Policies**. This is
separate from `transfers:request` and `operations:request`; neither permission
confers contract authority.

Use `GET /v1/access-policy` to read `contract_call_terms` and
`action_policy_revision`. Show the complete delegated target/function and
operation limits to the owner. For application-led access, include that exact
revision in `user.consent.action_policy_revision` with current identity and
consent evidence under the application's accepted trust agreement. The legacy
`transfer_policy_revision` field remains an accepted alias; supplying conflicting
aliases is denied. Hosted compatibility shows the contract terms at consent.

For an existing owner wallet, request a `connect` grant for its account UUID with
`contracts:request`. Policy changes invalidate prior financial delegations;
obtain current consent before using the new policy. Each action still requires
current ownership, active grant, accepted KYC/identity, consent, exact policy,
immutable approval, budgets and durable attempts.

**General function delegation grants the effects of those functions.** A selector
and native-value cap do not establish a token-spending cap for unknown contract
logic or pre-existing allowances. Review and delegate only understood functions;
leave the general contract list empty when only bounded swap/deposit adapters
are intended. Arbitrary calls do not inherit the swap or vault outcome guarantees.

## Request and execute a stored action

Send `POST /v1/actions/contract-calls` with `wallet:actions` and a UUIDv4
`Idempotency-Key`. Example bodies:

```json
{
  "account_id": "10000000-0000-4000-8000-000000000001",
  "kind": "contract-call",
  "calls": [
    {
      "to": "0x1111111111111111111111111111111111111111",
      "value": "0",
      "data": "0x12345678"
    }
  ]
}
```

```json
{
  "account_id": "10000000-0000-4000-8000-000000000001",
  "kind": "swap",
  "route": "accepted-swap-route",
  "amount_in": "1000000",
  "minimum_out": "990000",
  "deadline": "1893456000"
}
```

```json
{
  "account_id": "10000000-0000-4000-8000-000000000001",
  "kind": "vault-deposit",
  "route": "accepted-vault-route",
  "assets": "1000000",
  "minimum_shares": "990000"
}
```

These are fictional formats, not accepted actions or current quotes. Use IDs,
routes and a current deadline for your deployment. Amounts and native values are
unsigned decimal strings in atomic units. The swap deadline must be in the future
and no later than the service action expiry. Requests admit at most 16 calls and
2,048 combined calldata bytes. No caller-supplied nonce, signature, owner,
provider, sponsor, typed-data domain or Safe transaction is accepted.

The wallet verifies the account's proxy, singleton, version, exact owner,
threshold and common nonce through independent RPC sources before constructing
the action. It stores the SafeTx authorization and reserves that Safe nonce for
one action. Replays preserve the same action and nonce. A different immediate action at that nonce conflicts. The optional durable queue holds unsigned requests and only assigns the current nonce to its head; it does not reserve future nonces. An expired action can release its reservation only when the shared storage transaction proves that no signing admission ever existed; the old action is permanently denied. Any signing admission retains the reservation after expiry or revocation because an authorization may remain usable. There is no public nonce-reset endpoint.

Execute the returned action ID using `{}`, `wallet:execute` plus `wallet:sign`,
a stable UUIDv4 idempotency key and:

```http
Execution-Profile: approved-evm-executor-v1
Execution-Profile-Revision: 1
```

`/sign` does not export contract-call signatures. Coordinated execution keeps
them in private durable storage and sends the exact signed plan to the designated
executor. The executor independently rebuilds the policy-approved calls and
checks the owner signature before fresh wallet authority callbacks and its
provider claim. All submission providers consume the same immutable envelope.

## Verification, expiry and recovery

Read `/v1/actions/{actionId}/execution` and `/execution-events` with
`wallet:execute:read` and the same profile headers. `outcome_scope` identifies
`contract-execution`, `swap-effects`, `vault-deposit-effects` or `token-transfer`.
`settlement: succeeded` means the required evidence for that scope reached
finality; it is not a universal claim of business settlement.

Both services independently simulate the exact Safe call and verify code pins,
account ownership/nonce and sponsor funding before dispatch. Read-only recovery
searches Safe execution events by the exact SafeTx hash, then checks full
transaction calldata, receipt, canonical block and finality. Swap/deposit evidence
also checks the required asset events and cleared allowances. Missing evidence,
RPC disagreement or a successful receipt without the required effects preserves
uncertainty. Finalized contradictions fence the execution.

Safe's [SafeTx authorization](https://docs.safe.global/reference-smart-account/transactions/getTransactionHash)
binds the calls and nonce but **has no native expiry**. Service expiry, grant
revocation and handoff leases stop new service dispatch; they cannot recall a
signature already sent upstream. A swap additionally carries its router deadline.
Generic calls and the supported vault router do not gain an on-chain deadline
from service expiry. Deployments requiring cryptographic expiry or exclusive
executor enforcement need an independently reviewed guard/account mechanism;
this profile does not claim either property.

The executor independently reserves each Safe address/nonce across its registered wallet callers and provider revisions; another execution identity cannot bypass that reservation. The two durable journals preserve the same execution ID through transport loss,
restart and read-only recovery. Unknown provider effects never authorize another
submission. Follow [single active host recovery](execution.md#single-active-host-recovery-and-failover)
and fence old hosts before restoring both stores. No automatic nonce replacement,
account migration, reset or fund movement is part of recovery.

## Extension boundary

The approved action, execution profile/revision, mechanism, ordered calls, owner
signature, selected sponsor/provider and immutable request hash are distinct
contracts. New mechanisms and operation adapters must retain those boundaries
and define their own policy and verified outcome. Current Safe support is not
ERC-4337, ERC-1271 or EIP-5792 conformance; those remain separately versioned future
adapters in the [enterprise standards record](v1-standards.md).

See [durable Safe queues and sponsor pools](safe-queue-and-sponsor-pools.md) for concurrent request admission, per-Safe ordering, pool configuration and recovery limits.
