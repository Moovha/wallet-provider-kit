# Safe UserOperation execution

The configured service composes `Safe4337SigningService`, `UserOperationExecutionCoordinator`, `UserOperationWalletCallsDriver` and `WalletCallsService(actions, driver)`. There is one mandatory driver and one immutable execution mechanism.

Accepted deployments use Safe 1.4.1, Safe4337Module 0.3.0 and EntryPoint v0.7 on the configured Base or Base Sepolia domain. Verify the owner, threshold, module, handler, guard, nonce and runtime/code pins against canonical chain state. Offline fixtures do not establish deployment acceptance.

The driver persists a batch, prepares nonce/fees and exact gas estimates, reserves bounded sponsorship, signs the SafeOp and dispatches its exact bytes. Account lanes serialize conflicting nonces while separate accounts can progress concurrently. A submission timeout retains the signed identity and anchor for read-only reconciliation.

Success requires the canonical bundle transaction, exact packed operation and signature, individual successful operation event and required effects. Finality is tracked independently. Expiry releases a lane only after a bounded finalized absence proof; missing evidence leaves uncertainty intact. See [latency](execution-latency.md), [signing](durable-safe-op-signing.md) and [sponsorship](account-abstraction-sponsorship.md).
