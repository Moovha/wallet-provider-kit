# How network-fee sponsorship is bounded

Use this reference when implementing the application’s network-fee infrastructure.
For the funding decision and balances to maintain, start with
[Paying network fees](assets-and-gas.md).

## Sponsorship preparation contract

ERC-4337 v0.7 and ERC-7677 helpers prepare sponsorship for the user Safe. A prepared immutable intent contains exact calls and the accepted account proof. The provider checks the active application policy and reserves its bounded gas allowance before releasing usable sponsorship.

The stub phase uses non-authorizing signatures of the expected size for estimation. After exact gas bounds are fixed, the local verifying paymaster may return `isFinal` with final sponsorship. Safe owner signing then binds the complete operation. Paymaster refusal does not change the account or raise fee limits.

Accepted sponsorship binds chain, EntryPoint, paymaster, bundler configuration, gas/fee ceilings, expiry and current authority. Receipt reconciliation must verify the exact packed operation and individual execution event. See [self-hosted infrastructure](self-hosted-sponsorship.md) and [Safe signing](durable-safe-op-signing.md).
