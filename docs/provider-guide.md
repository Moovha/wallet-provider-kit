# Provider responsibilities

Each user owns a distinct Safe account bound to their current application and owner identity. The provider verifies identity, consent, grant, action policy, immutable calls and current chain authority before signing. The private OWS account signs SafeOps; applications receive batch identifiers and verified outcomes through the wallet API.

The provider operates durable SQLite storage, the OWS vault, a private bundler and the application verifying paymaster. Back up the vault, retained passphrase, credential key and database together. Loss of durable attempts can cause unsafe retries. Never infer a failed dispatch from a timeout.

Safe deployment and module installation use narrowly scoped infrastructure transactions. They do not provide a user transaction submission API. See [Safe execution](user-operation-execution.md), [signing](durable-safe-op-signing.md) and [storage](storage.md).

For deposits sent on another EVM network, see [cross-chain Safe recovery](safe-cross-chain-recovery.md). The deployment recipe can reproduce an address when the target chain has compatible dependencies; this does not enable additional application transaction networks.
