# Approved calls

Applications submit exact atomic calls through the user Safe wallet endpoint. The provider validates current policy, target and method pins, value and asset limits, application action metadata and owner grant. A SafeCallIntent binds those calls before UserOperation preparation.

Preparation preserves the exact calls, estimates their packed calldata and checks current chain authority. Signing binds the resulting SafeOp to nonce, gas, fee and sponsorship bounds. Changed calldata or context cannot reuse the original operation identity. See [wallet calls](wallet-calls.md) and [Safe execution](user-operation-execution.md).

Protocol-specific bridge and DEX implementations belong to the application integration. Supply their exact approved calls through this interface; concrete router adapters and atomic vault helpers are not included in the public toolkit package.
