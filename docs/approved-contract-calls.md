# Authorize and execute wallet calls

Use ordered `{to, value, data}` calls for native transfers, token transfers,
contract interactions, swaps and vault operations. The common pipeline checks
current owner/application access, consent, permitted calls, deployment bindings
and configured budgets, then signs and submits the exact stored operation.
Protocol-specific interpretation is optional. It is enabled only by an explicit
provider policy, not inferred from compatibility route settings.

Applications normally construct their calls in their own backend or SDK and use
[EIP-5792 wallet calls](wallet-calls.md). They can also create an immediate stored
action through `POST /v1/actions/contract-calls` with `kind: "contract-call"`.
Neither interface accepts an application-provided signature, nonce, delegatecall
mode or execution-provider identity.

## Operation profiles and outcome meaning

The configured relayer profile uses Safe 1.4.1 accounts with one EOA
owner, threshold one and no enabled modules on the configured Base network.
Use [automatic Safe provisioning](safe-provisioning.md) with the bundled local
execution engine, or configure existing Safe bindings. The advanced
[ERC-4337 driver](user-operation-execution.md) uses a separately accepted module
profile. Both consume the common call intent and optional policy adapters.
An EOA's existing ERC-3009 authorization is a separate compatibility mechanism;
using generic calls does not convert that EOA into a Safe or move its assets.

Native funds can arrive during an earlier call and fund a later call in the same atomic batch, such as unwrapping wrapped ETH before sending ETH. Preflight simulates the complete signed Safe transaction; the provider still bounds the sum of outgoing native values and the sponsor gas ceiling.

A successful generic batch means the exact calls executed. It does not certify a
quote, beneficiary settlement, swap output or vault result. Optional adapters can
interpret supported calldata and require additional evidence. The provider chooses
those guarantees; a protocol name is not an authorization requirement.

## Configure the two services

Configure `approvedCalls.policy` and a matching designated executor
`contractCalls` policy for the configured Safe relayer. Bind the account,
singleton and MultiSendCallOnly bytecode, current consent, operation budget and
native-value ceiling. Calls to account administration or arbitrary delegatecall
implementations remain unavailable. Runtime deployments instead publish
application-specific [contract and method permissions](runtime-configuration.md)
under those provider infrastructure limits.

The disabled [wallet configuration](provider.config.contracts.example.json) and
[executor configuration](executor.contracts.config.example.json) show the existing
configuration format. Their addresses, hashes and account IDs are fictional.
The configured wizard supplies infrastructure and existing compatibility controls.
Configure optional adapters in the setup wizard or through the provider policy API
without editing JSON. Native-recipient fields still use reviewed host/file
configuration and the runtime policy API.

For native transfers, explicitly enable `nativeTransfers` in the provider policy:

```json
{
  "nativeTransfers": {
    "recipients": [
      {
        "address": "0x1111111111111111111111111111111111111111",
        "codeHash": "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        "maximumValueWei": "1000000000000000"
      }
    ]
  }
}
```

Merge this fragment into the full policy. The hash shown is the hash of empty
bytecode: use it only for a recipient independently accepted with empty code.
Contract recipients need their actual code hash. A recipient's code must still
match at authorization and execution checks. Native calls use `data: "0x"`, a
positive value and an explicitly allowed recipient. Per-recipient and aggregate
native-value ceilings apply. Empty zero-value calls and short nonempty calldata
are not native transfers.

With runtime authority, `nativeTransfers: {"recipients": []}` explicitly enables
provider support; the reviewed application's `native_transfers` publication
supplies recipients, code pins and limits under the provider aggregate ceiling.
Absence of the provider opt-in denies native transfers. Publishing recipients or
changing adapter terms requires provider review and fresh financial consent;
automatic contract/method registration does not delegate those policy changes.

## Obtain explicit contract delegation

Allow `contracts:request`, obtain the exact current action-policy revision through
`GET /v1/access-policy`, and present the complete terms in the application consent
flow. Submit accepted identity and consent evidence under the application's trust
agreement. OAuth scopes alone do not authorize spending. Existing owner, grant,
identity freshness, revocation and runtime-publication checks run again before
new financial effects.

Registered selectors and native-value ceilings do not bound token amounts,
approvals, internal calls or economic outcomes. Providers must choose what they
want to delegate and which additional rules they require. A token adapter for
`transfer(address,uint256)` does not protect `transferFrom`, arbitrary approvals
or every route by which assets can move.

## Select optional operation adapters

Set `policy.adapters` in a static policy, or `call_adapters` in a reviewed runtime
publication. Runtime calls must also match their published contracts and methods.
Adapters do not add a submission mechanism or another budget namespace.

| Optional adapter | Selected policy and guarantees                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenTransfers` | Pin the token, allowed recipients and maximum amount per transfer. Decode canonical ERC-20 transfer calldata and require matching transfer-event evidence. Optional `lifetimeAmount` shares the cumulative ERC-3009 allowance for that token and logical account. |
| `swaps`          | Pin a supported original Uniswap V3 route and input ceiling. Require the exact approval/swap/cleanup sequence, Safe recipient, supplied minimum output and deadline; verify net input/output and cleared allowance.                                               |
| `vaults`         | Pin a Yearn4626-compatible router, vault, asset and deposit ceiling. Require the exact approval/deposit/cleanup sequence with supplied minimum shares; verify asset binding, shares, Deposit event and cleared allowances.                                        |

These adapters support one complete recognized operation per batch. A selected
adapter cannot be bypassed by leaving out a label: its configured target/method
and calldata select it. Altered recipients, missing cleanup or a conflicting
sequence are denied. Other generic calls retain the explicitly delegated generic
policy; an unselected adapter supplies no additional guarantees.

Applications supply quotes and minimum output/share amounts. The toolkit does
not choose routes, fetch prices or certify their fairness. Minimum-output fields
must be enforced by the target contract for on-chain rollback; receipt checks
only verify observed results. Other routers, token models and vault methods can
use generic calls under their own reviewed policy without implementing a toolkit
adapter. Do not describe them as having an unselected adapter's guarantees.

## Separate call authority, allowances and sponsorship

The generic calls core checks current access, owner consent, permitted exact
calls, account/nonce bindings and execution recovery. It does not require a
cumulative asset allowance or infer one from a transfer selector. Existing
operation-count limits are provider service controls, not token-spending limits.

Cumulative asset accounting belongs to an explicitly selected policy adapter.
A token-transfer adapter without `lifetimeAmount` enforces its per-transfer
terms without a lifetime allowance. Calls without that adapter do not decode
transfer amounts or inspect asset history. An existing ERC-3009 policy alone
does not impose its allowance on a separately delegated generic call. Its endpoint
and allowance continue to apply to requests made under that compatibility profile.
Choose the adapter when the generic delegation must preserve that spending promise;
an unselected adapter supplies no such guarantee.

Gas sponsorship has a separate payer, eligibility decision and application gas
ledger. Granting call access or configuring an asset allowance does not grant gas
capacity. Generic action preparation and signing do not reserve sponsor gas;
the selected sponsorship/execution service admits that cost before its effects.
When sponsorship is requested, its gas charge, operation charge and any selected
adapter charges still commit atomically. This keeps the policies separate while
preventing partially admitted financial effects.

## Cumulative token allowances

Opt into `lifetimeAmount` on a selected `tokenTransfers` adapter when the delegation
must limit total direct token transfers. For example, the adapter entry contains
`token`, `recipients`, `maximumAmount: "1000000"` and
`lifetimeAmount: "5000000"`. Amounts are decimal token base units. Static
configuration uses `policy.adapters`; runtime publications use `call_adapters`.
The adapter supports one canonical direct transfer per batch. Its cumulative term
is part of financial consent; provider review and fresh owner consent are required
when a runtime publication changes it. Automatic contract acceptance cannot
publish these terms.

The allowance identity is the existing ERC-3009 identity: provider origin,
logical account ID and token address within one network-bound deployment.
Applications, signer namespaces and relayer/ERC-4337 mechanisms share that
allowance. Existing reserved usage is retained. Selected-adapter activation never raises
an existing ceiling. When a matching ERC-3009 policy is configured, its lifetime
ceiling also caps generic approval, including when the generic path initializes
the allowance first. Changing a policy does not refund usage or grant a new
allowance.

Generic approvals retain their operation-count charge and add the exact token
amount. Relayer signing reserves both atomically. ERC-4337 admission reserves
operations, assets and gas atomically before requesting usable sponsorship;
SafeOp signing and recovery reuse the asset reservation. Denial rolls back the
new reservations. Failure, expiry, revocation and uncertain outcomes retain
possible exposure. Receipt recovery does not automatically refund it.

### Activate with existing authorizations

1. Stop incompatible workers, fence the active deployment revision and take a
   consistent SQLite-aware backup. Preserve the provider origin, logical account
   ID and token identity. Reconcile any restore-loss window before admitting work.
2. Publish the reviewed adapter terms and obtain current owner consent. Use a
   compatible toolkit version across all workers before resuming dispatch.
3. The first generic action with the cumulative term initializes the allowance
   without resetting its existing usage or maximum. It inventories earlier generic
   signing admissions and sponsorship reservations for that account, including
   revoked, expired and uncertain authorizations. Attributable canonical direct
   transfers are added once. Later activations also inventory newly admitted
   unbudgeted authorizations. Unsigned actions without admission are not exposure.
4. Opaque earlier calls stop activation with a conflict: review their possible
   asset exposure before migrating that account. There is no automatic override
   or assumption that an unknown call spent nothing. If identified historical
   transfers exceed the ceiling, their full usage is retained and new spending
   remains denied. Do not delete migration records or create a new account ID to
   clear an allowance.

The migration records and reservations use the existing version-1 SQLite JSON
catalog; no SQL schema upgrade is required. Back up the allowance counters,
`assetReservations` and `assetBudgetMigrations` with the other authority records.
The trusted library method `ensureAssetBudget(origin, accountId, token, maximum,
revision)` performs the same activation inventory; it is not an application API
or an allowance-reset method.

This profile covers selected direct `transfer(address,uint256)` calls. It does
not measure approvals, `transferFrom`, swaps, arbitrary internal token movement,
native cumulative spending or all indirect asset exposure. Configure other
permissions to match the delegation you intend. Converting an ERC-3009 EOA flow
to a Safe account still requires explicit account, execution and consumer
acceptance; sharing an allowance does not move assets or make those accounts
interchangeable.

## Request and execute a stored action

For native transfer admission, use decimal wei in the stored-action interface:

```json
{
  "account_id": "11111111-1111-4111-8111-111111111111",
  "kind": "contract-call",
  "calls": [
    {
      "to": "0x1111111111111111111111111111111111111111",
      "value": "1000",
      "data": "0x"
    }
  ]
}
```

Replace the example account and recipient with accepted bindings. Send the body
to `POST /v1/actions/contract-calls` with `wallet:actions` and a stable UUIDv4
`Idempotency-Key`. EIP-5792 instead uses hexadecimal value quantities and retains
a batch ID. Both paths create the same kind of immutable call intent.

The common builder binds exact calls and a Safe nonce. Coordinated execution
keeps signatures private, rechecks authority and uses the selected relayer or
accepted ERC-4337 driver. Unknown effects retain their operation identity and
reservations; they never authorize an automatic alternate submission path.

### Compatibility requests

Existing `kind: "swap"` and `kind: "vault-deposit"` bodies remain accepted in their
static configured profile. They compile through adapters to the same calls and
retain their existing checks and signed payloads. Their existing `swaps`/`vaults`
configuration fields are compatibility settings, not mandatory generic-call
categories. They do not automatically enable adapters for generic batches.

Existing ERC-3009 transfer requests retain their endpoint, delegation, asset
allowance, signature format, execution and recovery behavior. No automatic account
migration, mechanism switch or reset of those allowances occurs. Move a consumer
only after its required policy, account binding and execution guarantees are
accepted on the chosen generic mechanism. Direct token-transfer cumulative
accounting is available through the optional adapter described above.

## Verification, expiry and recovery

Relayer receipts distinguish generic execution from selected token, swap or vault
effects. ERC-4337 status uses the exact UserOperation event and isolates that
operation's logs; selected adapter checks must also pass before success is
reported. Neither outer bundle success nor generic execution establishes a
business guarantee by itself.

The shared operation and sponsor-gas ledgers retain their current identities and
limits. Per-call asset caps and optional cumulative token allowances are separate
terms.
Unknown or failed exposure retains the existing conservative reservations;
automatic refunds and an automatic relayer fallback are unavailable.

SafeTx binds calls and nonce without an on-chain expiry. Service expiry and
revocation stop new service effects but cannot recall an issued authorization.
Contract-enforced deadlines and the accepted SafeOp validity profile have their
own semantics. Read-only recovery never rebuilds a dispatched operation from a
new policy publication.

## Extension boundary

Generic execution is independent of protocol adapters. New adapters must define
exact matching, any extra authorization terms and the evidence they claim to
verify. Keep application business policy, wallet authority, gas sponsorship and
business settlement distinct. Live deployment, provider and recovery acceptance
remain required; offline fixtures are not production certification.

## Simulation and signed nonce recovery

Bundled local execution simulates the exact Safe calls before requesting the
owner signature. This read-only check uses the sole owner's prevalidated Safe
signature and the configured gas limit. The service still simulates the real
signed transaction with its sponsor before submission. An unsuccessful unsigned
simulation creates no signing admission. State changes between checks can still
make a signed transaction fail its later preflight.

An expired signature remains valid on chain for its Safe nonce. A signed action
that has never entered submission can use the [explicit nonce cancellation
procedure](stuck-transactions-and-recovery.md#explicitly-cancel-an-unsubmitted-signed-safe-action).
Submitted or uncertain attempts stay held for reconciliation.

Safe contract-call sponsors may configure 21,000–5,000,000 gas per execution;
ERC-3009 transfer-only configurations retain their 1,000,000-gas ceiling. Defaults
do not increase automatically. Set the sponsor's limit from the full batch's
simulation, then fund and admit its exact gas limit × maximum fee plus L1 reserve
within the existing application lifetime budget. A designated executor with
contract-call support must configure matching sponsor bounds.
