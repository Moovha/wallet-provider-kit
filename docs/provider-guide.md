# Understand your provider responsibilities

Running the service means looking after wallet keys, user permissions and recovery.
Use this page with the developer or security reviewer responsible for those controls.
For the installation steps, start with [the installation guide](provider-installation.md).

## Wallet control and recovery

A verified user can own personal and shared Safe wallets on each configured network. Each wallet remains bound to its original owner identity. Explicit application sharing can attach another application’s user to that same wallet under a reviewed agreement, current matching identity evidence and an independent consent grant. The provider verifies identity, consent, grant, action policy, immutable calls and current chain authority before signing. The private OWS account signs SafeOps; applications receive batch identifiers and verified outcomes through the wallet API.

The provider operates durable SQLite storage, the OWS vault, a private bundler and the application verifying paymaster. Back up the vault, retained passphrase, credential key and database together. Loss of durable attempts can cause unsafe retries. Never infer a failed dispatch from a timeout.

Safe deployment and module installation use narrowly scoped infrastructure transactions. They do not provide a user transaction submission API. See [Safe execution](user-operation-execution.md), [signing](durable-safe-op-signing.md) and [storage](storage.md).

For deposits sent on another EVM network, see [cross-chain Safe recovery](safe-cross-chain-recovery.md). The deployment recipe can reproduce an address when the target chain has compatible dependencies; this does not enable additional application transaction networks.

## Offer multiple networks

One provider instance can offer **Base mainnet**, **Base Sepolia** and **Ethereum
Sepolia**. Ethereum mainnet is not supported. Installation fixes the default network
for existing integrations and preserves its original Personal wallet.

Open **Networks** in administration to select additional networks, save, then restart
the provider. Choices are retained in the database and applied at startup. Each
network has its own Personal wallet and can also hold named personal or shared wallets.

For a release installation, set `WPK_NETWORK` to the default and, optionally,
`WPK_ADDITIONAL_NETWORKS=base-sepolia,ethereum-sepolia` before running the installer.
Do not repeat the default in the additional list.

The instance shares application registration, provider administration and verified
user profiles. Current identity checks from the same trusted application can be
reused by omitting `user.identity` on a subsequent access request. Application
sharing rules still apply when another application requests access. Each wallet
and network requires fresh consent; a grant on one network cannot authorize another.

Additional networks start disabled, with empty application transaction policies.
For each network, agree its transactions, supply its RPC connections, accept its
fee agreement and prepare its application funding infrastructure. Inspect the
network’s funding address before sending funds: balances and budgets do not carry
between networks. A funded Base wallet does not fund Ethereum Sepolia.

Configuration retains the existing `network` field as the default:

```json
{
  "network": "base-sepolia",
  "additionalNetworks": [{ "network": "ethereum-sepolia" }]
}
```

This is a fragment of the complete provider configuration. Each additional entry
may override `safeWallet`, `safeProvisioning`, `approvedCalls` and `activation`.
When omitted, chain-specific Safe defaults are supplied, transaction ceilings
start closed and `activation.enabled` is false. Override objects are complete
settings, not partial patches. The private bundler directory is shared; its
application files and routes are isolated by network. Authentication settings,
backend vault and credential-storage key remain instance settings.

After acceptance for an additional network, set that entry’s `activation` with
`enabled`, `backendAcceptance` and `recoveryAcceptance`, following the same
[launch checks](conformance.md) as the default network. Restart with the reviewed
configuration. After restart, a removed network’s provider transaction writers are fenced and preserves its records for a later restart. Keep the default
network unchanged for an existing store; changing it requires a reviewed migration.
Previously issued signatures and transactions may still execute. Back up the shared database and vault together for all networks.

Applications discover configured networks with `GET /v1/networks`. Its
`configured` flag reports execution activation and current configuration, not an
application’s readiness or funding. `/health/ready` reports whether any configured network is ready; use the selected network’s `GET /v1/execution-capabilities` for its own status. Show the network name alongside every wallet
address, balance and consent prompt. Transfers between networks require a bridge
chosen and orchestrated by the application; selecting a network does not move assets.
