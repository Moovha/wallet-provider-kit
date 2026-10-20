# Atomic swaps through approved DEX adapters

`AtomicVaultSwap` executes exact-input swaps with optional ERC-4626 redemption and deposit. A user's Safe submits one atomic batch through the application bundler and paymaster. The helper uses actual redemption proceeds, passes each step's full actual output into the next step, and deposits or returns the final output to that Safe. Any failed step reverts the operation.

## Supported routes

A request selects one of these encodings:

| `protocol` | `path` encoding           | Execution                                                                       |
| ---------- | ------------------------- | ------------------------------------------------------------------------------- |
| `3`        | Packed token/fee sequence | The deployment's fixed Uniswap v3 SwapRouter02                                  |
| `4`        | ABI-encoded `PoolKey[]`   | The deployment's fixed Uniswap v4 Universal Router and Permit2                  |
| `5`        | ABI-encoded `DexStep[]`   | Ordered calls through approved adapters; different steps may use different DEXs |

There is no fixed hop-count limit in the helper or SDK. Routes must be nonempty and cannot revisit a currency. Gas, calldata and application budgets still bound practical requests. The provider currently accepts at most 4,096 calldata bytes per wallet call, limits the complete request and batch sizes, and enforces the application's accepted sponsorship ceiling. Removing a hop cap does not increase those ceilings. The bundled bundler also caps each UserOperation at 1,000,000 gas. Changing an application agreement alone does not override that bundler cap. Larger gas budgets require a matching reviewed bundler configuration and accepted application agreement. Oversized calldata requires a shorter or more compact route, or a separately reviewed provider change. A route is never truncated or split automatically. Splitting into separate transactions loses whole-route rollback.

The supplied adapters support:

| Adapter                         | Immutable dependencies                   | Per-step data                              |
| ------------------------------- | ---------------------------------------- | ------------------------------------------ |
| `UniswapV3DexAdapter`           | SwapRouter02                             | `abi.encode(uint24 fee)`                   |
| `UniswapV4DexAdapter`           | Original v4 Universal Router and Permit2 | `abi.encode(PoolKey)`                      |
| `AerodromeSlipstreamDexAdapter` | Slipstream SwapRouter                    | `abi.encode(int24 tickSpacing)`            |
| `AerodromeClassicDexAdapter`    | Aerodrome stable/volatile Router         | `abi.encode(bool stable, address factory)` |

Each adapter step traverses one pool. The Uniswap v4 adapter supports fixed fees, zero hooks and the original `ExactInputSingleParams` layout without `minHopPriceX36`. Aerodrome Slipstream uses tick spacing directly rather than interpreting it as a Uniswap fee. The classic adapter supplies an explicit stable/volatile flag and factory to the router, whose factory restrictions still apply.

Assets must be compatible ERC-20 tokens with usable liquidity. Native ETH requires WETH. Fee-on-transfer and rebasing assets, v4 dynamic fees and hooks are unsupported. Adding a new adapter does not discover liquidity, construct routes or attest quote prices; the application supplies those inputs.

## Deploy and approve adapters

The helper constructor accepts fixed v3/v4 routers, Permit2, maximum slippage in basis points and maximum quote lifetime in seconds. Those dependencies preserve the single-DEX interfaces. The constructor ceilings are 1,000 basis points and 300 seconds. Choose tighter trading limits as appropriate.

The account that deploys the helper becomes its immutable `adapterAdministrator`. Deploy from the intended application operator account, such as an operator Safe. The helper has no administrator-transfer function. A factory deployment makes the factory the administrator, so that factory must support the required administration calls.

Deploy the reviewed adapters with their router dependencies, inspect the resulting code, then call `configureAdapter(adapter, expectedRuntimeCodeHash)` from the administrator. A zero hash revokes an adapter for protocol `5`. The fixed routers used by legacy protocols `3` and `4` remain approved through deployment configuration; revoking an adapter does not disable those separate routes. The helper verifies the approved code hash before funding and before each adapter call; changes during execution are forbidden. The supplied adapters also verify their immutable router runtime code hash and, for v4, Permit2's runtime code hash. These checks do not freeze a proxy's implementation or a router's external configuration. Review and monitor those dependencies separately.

Approving adapter code delegates its constrained execution to that adapter. It is a financial permission, not a safety assessment performed by the helper. Review adapter code, dependencies and token behavior before approval. Adapter administration remains mutable even when the helper's own runtime code is pinned.

Publish provider policy allowing the input token or source vault's `approve(address,uint256)` and the helper's `execute((address,address,address,address,uint256,uint8,bytes,(uint256,uint256,uint256,uint48,uint48,uint16)))`. Obtain current user consent. Provider policy checks direct targets and selectors; it does not recursively allowlist tokens, vaults, pools or factories embedded in helper calldata. The application must enforce its intended asset and quote policy.

The package exports helper source, ABI and creation bytecode, plus `dexAdapterArtifacts` containing the four adapter ABIs and creation bytecodes. `npm run check:vault-swap` verifies all five reproducible builds and the pinned OpenZeppelin math dependency. Adapters and the mixed-route helper require matching deployments; earlier helpers without protocol `5` reject mixed routes.

## Quote protection and amount accounting

Build all quote anchors from one consistent block snapshot:

- `assetsIn`: expected underlying received for the requested source shares, or the exact direct-token input.
- `assetsOut`: quoted final underlying output across the complete route, after swap fees.
- `amountOut`: expected destination shares, or `assetsOut` for direct-token output.
- `quotedAt` and `deadline`: a bounded quote window.
- `slippageBps`: the selected tolerance, no greater than the helper's immutable ceiling.

The helper enforces these floors, rounding upward with full-precision integer arithmetic:

```text
minimum redemption = ceil(quoted assetsIn × (10000 − bps) / 10000)
minimum final swap output = ceil(quoted assetsOut × actual assetsIn × (10000 − bps) / (quoted assetsIn × 10000))
minimum received = ceil(quoted amountOut × actual assetsOut × (10000 − bps) / (quoted assetsOut × 10000))
```

The swap floor applies to the whole route. Intermediate steps require positive output, and the last step enforces the proportional final-output floor. It is not a separate tolerance applied to every pool. Redemption, the complete swap route and destination deposit each have their own tolerance; the tolerance is not one aggregate end-to-end loss cap.

All quote anchors, input amounts and actual underlying amounts must be positive and fit `uint128`. Use integer asset units without converting token decimals implicitly. Favorable redemption increases the swap floor, and favorable swap output increases the required destination shares. Supplied quotes must be trustworthy: these checks do not establish fair market value or prevent all MEV.

The helper and supplied adapters exclude pre-existing balances, require exact input consumption, measure actual output instead of trusting returned amounts, and clear token, router and Permit2 allowances on success. Adapters return output only to their calling helper; the helper returns output only to its calling Safe. No delegatecall or arbitrary router commands are accepted. Failure rolls back intermediate transfers and approvals, though a mined failed transaction still consumes gas.

## Build a mixed route

```ts
import {
  atomicSwapQuote,
  atomicVaultSwapCalls,
  encodeDexSwapRoute,
  encodeV3AdapterData,
  encodeSlipstreamAdapterData,
} from '@moovha/wallet-provider-kit/wallet-calls';

const calls = atomicVaultSwapCalls({
  helper: approvedHelper,
  tokenIn: underlyingInput,
  tokenOut: underlyingOutput,
  sourceVault: approvedSourceVault, // Omit for direct ERC-20 input.
  destinationVault: approvedDestinationVault, // Omit for direct ERC-20 output.
  amount: sharesToRedeem,
  protocol: 5,
  path: encodeDexSwapRoute([
    {
      adapter: approvedUniswapV3Adapter,
      tokenOut: intermediateToken,
      data: encodeV3AdapterData(3000),
    },
    {
      adapter: approvedSlipstreamAdapter,
      tokenOut: underlyingOutput,
      data: encodeSlipstreamAdapterData(10),
    },
  ]),
  quote: atomicSwapQuote({
    assetsIn: quotedRedemption,
    assetsOut: quotedWholeRouteOutput,
    amountOut: quotedDestinationShares,
    quotedAt: quoteBlockTimestamp,
    slippageBps: 100,
    ttlSeconds: 60,
  }),
});
```

Use `encodeV4AdapterData` for a v4 pool key and `encodeAerodromeAdapterData(stable, factory)` for a classic Aerodrome pool. Use `encodeV3SwapPath` or `encodeV4SwapPath` for single-DEX protocols `3` and `4`.

The builder returns four wallet calls: clear the input allowance, approve exactly `amount`, execute the helper and clear the allowance. Submit with `wallet_sendCalls`, the Safe as `from`, `atomicRequired: true` and the registered application action. Current ownership, consent, grants, action authority and durable signing checks still apply.

Preparation buffers gas estimates by 20%. Buffered call, verification and pre-verification gas plus the paymaster reserve must fit the accepted application gas budget. No budget increases automatically for long routes.

Track the original batch through wallet status or reconnecting account events. A correlated pre-admission bundler execution-revert response is terminal; transport errors and uncertain dispatch remain recoverable. Verify individual UserOperation success and the `AtomicSwap` event, rather than relying on outer bundle success. See [wallet calls](wallet-calls.md) and [execution verification](user-operation-execution.md).

Local EVM fixtures exercise longer mixed routes, protocol interfaces and rollback. They do not certify Aerodrome deployments or production liquidity on a live network.
