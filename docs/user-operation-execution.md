# Follow a transaction through execution

A saved request, submission to the chain and a verified result are different
stages. Use [wallet status](wallet-calls.md) in your application. This reference
helps developers investigate how the provider prepares, signs and verifies it.

## Execution and reconciliation contract

The configured service composes `Safe4337SigningService`, `UserOperationExecutionCoordinator`, `UserOperationWalletCallsDriver` and `WalletCallsService(actions, driver)`. Together they retain and execute the exact approved operation; retries cannot substitute another payload or account.

Accepted deployments use Safe 1.4.1, Safe4337Module 0.3.0 and EntryPoint v0.7 on the configured Base, Base Sepolia or Ethereum Sepolia domain. One instance can serve multiple configured networks with shared verified identity and separate wallets, consent, execution queues, funding keys and sponsorship budgets. The default network preserves existing account URLs. See [network configuration](provider-guide.md#offer-multiple-networks); bridge orchestration belongs to the application. Verify the owner, threshold, module, handler, guard, nonce and runtime/code pins against canonical chain state. Offline fixtures do not establish deployment acceptance.

The driver persists a batch, prepares nonce/fees and exact gas estimates, reserves bounded sponsorship, signs the SafeOp and dispatches its exact bytes. Account lanes serialize conflicting nonces while separate accounts can progress concurrently. A submission timeout retains the signed identity and anchor for read-only reconciliation.

Success requires the canonical bundle transaction, exact packed operation and signature, individual successful operation event and required effects. Finality is tracked independently. Expiry releases a lane only after a bounded finalized absence proof; missing evidence leaves uncertainty intact. See [signing](durable-safe-op-signing.md) and [sponsorship](account-abstraction-sponsorship.md).
