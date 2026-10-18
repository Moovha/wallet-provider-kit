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

The configured relayer profile uses pre-existing Safe 1.4.1 accounts with one EOA
owner, threshold one and no enabled modules on Base Sepolia. The advanced
[ERC-4337 driver](user-operation-execution.md) uses a separately accepted module
profile. Both consume the common call intent and optional policy adapters.
An EOA's existing ERC-3009 authorization is a separate compatibility mechanism;
using generic calls does not convert that EOA into a Safe or move its assets.

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
The native-recipient and adapter fields below currently use reviewed host/file
configuration and the runtime policy API; dedicated form controls are not supplied.

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

| Optional adapter | Selected policy and guarantees                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenTransfers` | Pin the token, allowed recipients and maximum amount per transfer. Decode canonical ERC-20 transfer calldata and require matching transfer-event evidence. This is not a cumulative asset-spending allowance.              |
| `swaps`          | Pin a supported original Uniswap V3 route and input ceiling. Require the exact approval/swap/cleanup sequence, Safe recipient, supplied minimum output and deadline; verify net input/output and cleared allowance.        |
| `vaults`         | Pin a Yearn4626-compatible router, vault, asset and deposit ceiling. Require the exact approval/deposit/cleanup sequence with supplied minimum shares; verify asset binding, shares, Deposit event and cleared allowances. |

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
only after its required policy and asset-accounting guarantees are implemented
and accepted on the chosen generic mechanism.

## Verification, expiry and recovery

Relayer receipts distinguish generic execution from selected token, swap or vault
effects. ERC-4337 status uses the exact UserOperation event and isolates that
operation's logs; selected adapter checks must also pass before success is
reported. Neither outer bundle success nor generic execution establishes a
business guarantee by itself.

The shared operation and sponsor-gas ledgers retain their current identities and
limits. Optional per-call asset caps do not replace cumulative asset budgets.
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
