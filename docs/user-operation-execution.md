# Follow a transaction through execution

A saved request, submission to the chain and a verified result are different
stages. Use [wallet status](wallet-calls.md) in your application. This reference
helps developers investigate how the provider prepares, signs and verifies it.

## Execution and reconciliation contract

The configured service composes `Safe4337SigningService`, `UserOperationExecutionCoordinator`, `UserOperationWalletCallsDriver` and `WalletCallsService(actions, driver)`. Together they retain and execute the exact approved operation; retries cannot substitute another payload or account.

Accepted deployments use Safe 1.4.1, Safe4337Module 0.3.0 and EntryPoint v0.7 on the configured Base, Base Sepolia or Ethereum Sepolia domain. One instance can serve multiple configured networks with shared verified identity and separate wallets, consent, execution queues, funding keys and sponsorship budgets. The default network preserves existing account URLs. See [network configuration](provider-guide.md#offer-multiple-networks); bridge orchestration belongs to the application. Verify the owner, threshold, module, handler, guard, nonce and runtime/code pins against canonical chain state. Offline fixtures do not establish deployment acceptance.

The driver persists a batch, prepares nonce/fees and exact gas estimates, reserves bounded sponsorship, signs the SafeOp and dispatches its exact bytes. Account lanes serialize conflicting nonces while separate accounts can progress concurrently. A submission timeout retains the signed identity and anchor for read-only reconciliation.

Gas estimates include execution, account validation, paymaster work and
pre-verification overhead. On rollups, pre-verification gas can include data fees
expressed in gas units, so a larger unit estimate need not imply a larger ETH fee.
The provider retains separate execution and validation ceilings. It bounds the
total by any explicit accepted gas limit and its overall ceiling, and checks the
buffered maximum cost, including the fee reserve, against the accepted sponsorship
terms before signing. Increasing
account funding does not change those limits.

Success requires the canonical bundle transaction, exact packed operation and signature, individual successful operation event and required effects. Finality is tracked independently. Expiry releases a lane only after a bounded finalized absence proof; missing evidence leaves uncertainty intact. See [signing](durable-safe-op-signing.md) and [sponsorship](account-abstraction-sponsorship.md).

When an account requires additional owners, the driver publishes an exact
[signing request](wallet-owners.md) after final sponsorship preparation and pauses
until signatures can satisfy quorum. It retains the same operation across
signature delivery and restart. Finalized expiry and an exhaustive absence proof
are required before an exposed nonce can be reused.
