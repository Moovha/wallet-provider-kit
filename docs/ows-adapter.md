# Use OWS as the wallet engine

Choose OWS in [Backend](setup-wizard.md#_2-backend) when your team will operate a
local encrypted wallet vault. You retain its passphrase and must recover the vault
and provider database together. This guide explains that control model and the
supported profile before showing optional library composition. The experimental
`./ows` adapter uses Open Wallet Standard core **1.4.3** for key generation,
derivation and EIP-712 signing, with toolkit authorization and attempt coordination.

## What fits today

| Capability   | Supported profile                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Engine       | Pinned `@open-wallet-standard/core` 1.4.3, MIT licensed.                                                 |
| Network      | Base Sepolia, `eip155:84532`, EOA revision 1.                                                            |
| Provisioning | One OWS wallet per opaque host account UUID; 24-word generation stays inside OWS.                        |
| Signing      | Approved stored EIP-712 action; exact digest and recovered signer checked.                               |
| Credentials  | Host-controlled owner passphrase, supplied by a secret-store callback.                                   |
| Recovery     | Read-only name lookup plus the host's persistent attempt journal.                                        |
| Platforms    | OWS prebuilt bindings for macOS and glibc Linux, arm64/x64. Windows and Alpine are unverified.           |
| Evidence     | Real native-engine offline tests with ephemeral wallets; production storage/recovery remains unverified. |

Use this adapter when your provider will operate a dedicated local OWS vault.
For a separately operated signer or queue, compare the supported capabilities
in [backend integration](backend-guide.md), then use that adapter's guide.

## Compose it

For supported deployments, use [OWS configuration](setup.md#select-a-built-in-backend);
the kit supplies authority and journals. The code below is the advanced embedded path.

Install the optional engine explicitly in your host. The default service and CDP
entry point do not import its native binding.

```sh
npm install --save-exact @open-wallet-standard/core@1.4.3
```

```ts
import { EmbeddedWalletService } from '@moovha/wallet-provider-kit';
import { createOwsWalletProvider } from '@moovha/wallet-provider-kit/ows';

// All four integrations below are supplied and reviewed by the adopting host.
const signer = createOwsWalletProvider(
  { vaultPath: dedicatedVaultPath, passphrase: readOwnerPassphrase },
  { namespace: 'your-product-ows-test', journal, authorizeAttempt },
);
const service = new EmbeddedWalletService(authority, signer);
```

Use an existing absolute vault directory owned by the service user, with mode
`0700`. Its final path must not be a symlink. Protect its parent directories and
contents too. Keep this vault dedicated to this integration and reserve the
`moovha-<UUID>` names; other tools must not create, rename or replace those wallets
while the service runs. The host journal serializes account creation across
processes. OWS names alone aren't a distributed lock.

The credential callback must return the configured owner passphrase (16–4096
characters), from a bounded, trusted secret-store operation. It receives no HTTP
payload. Agent tokens beginning `ows_key_` are rejected in this profile. OWS's
owner path does **not** enforce its agent policy engine: the host's current owner,
grant, KYC, consent and immutable-action checks remain mandatory. Never provide a
callback that always approves requests.

This is operator-controlled signing. The operator has access to the encrypted
vault and credential and can use OWS outside this service, including its export
functions. The kit does not expose export endpoints. This arrangement does not
establish end-user self-custody or prevent a compromised operator from signing.
Assess your deployment's custody and recovery model before using it.

## Keep the boundary small

The adapter runs fixed create/list/sign commands in short-lived Node child
processes. Credentials pass through a private pipe, not command arguments or
inherited environment variables. Native diagnostics are discarded, outputs are
bounded to 64 KiB and each command has a ten-second limit. This keeps synchronous
native work and its diagnostic output away from the HTTP event loop and logger;
it is not an OS sandbox or a claim of hardware key isolation.

Only exact approved typed data reaches signing. Numeric values remain decimal
strings in the stored action. Before passing them to OWS 1.4.3, the adapter
encodes typed integers as full-width hex: its decimal parser has a u128 limit and
its hex parser rejects odd-length values. Ethers validates the original payload
and independently recovers the signer from the returned signature. Offline
vectors cover nested arrays, maximum uint256 and minimum int256 values.

No raw-hash, arbitrary-message, transaction-broadcast, import/export, policy
management or agent-token endpoint is exposed. Other chains and account types
remain unsupported even though OWS supports more operations.

## Before deployment

For the configured service, use its [SQLite journal](storage.md) and verify
recovery on your host. Embedded integrations must supply and verify their
[durable journal](durable-attempts.md); test fixtures are not runtime storage. Preserve the original account and attempt IDs on retries. A timeout,
failed child or missing/corrupt vault record cannot authorize another mutation.
OWS can skip malformed wallet metadata during listing, so a lookup miss is not
proof that creation never occurred. Reconcile uncertain outcomes with the
original journal and reviewed backups before permitting later signing.

Test restore, credential loss/rotation, filesystem permissions, two-process
concurrency, corrupted metadata, capacity and result-commit failures on your
deployment. Reserve usage and retain pending/unknown attempts until reconciled.
Use the [built-in SQLite journal](storage.md) or an accepted persistent host
journal. Prepare vault backups and restoration separately; the default CLI
stays unconfigured.

Engine references: [Node API](https://github.com/open-wallet-standard/core/blob/main/docs/sdk-node.md),
[policy model](https://github.com/open-wallet-standard/core/blob/main/docs/03-policy-engine.md),
[EIP-712 implementation](https://github.com/open-wallet-standard/core/blob/main/ows/crates/ows-signer/src/eip712.rs).
The installed 1.4.3 types and real offline tests are the evidence for this adapter;
upstream `main` documentation may describe later behavior. Re-run these acceptance
checks before upgrading the pinned engine.
