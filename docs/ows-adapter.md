# Look after private signing keys

Each person receives a Safe address for deposits. Its private signing identity
stays in the Open Wallet Standard (OWS) vault. Keep the vault and its recovery
material private; connecting an application never shares those keys.

## Vault configuration for developers

Open Wallet Standard stores the private owner signer for each user Safe. Configure a private persistent vault directory, binding and retained passphrase reference. The signer address is not the user’s deposit or execution address.

Signing runs in a short-lived native worker. The provider resolves the current vault account and signs the authorized immutable SafeOp. It does not cache spending permission or return private signer credentials through the wallet API. Retain vault, passphrase and database together and test recovery before activation.

## Account-scoped vault storage

Each toolkit account stores its encrypted OWS wallet beneath
`accounts-v1/<account UUID>/wallets/` inside the configured vault. Lookup,
creation and signing open only that account’s directory. The pinned native OWS
library enumerates its wallet directory even when given an exact wallet ID;
limiting each native vault to one wallet keeps that work independent of the total
number of accounts.

Before accepting operations, the deployment prepares older wallets from the
vault’s top-level `wallets/` directory. Embedded hosts can await
`prepareOwsVault(vaultPath)` from the `/ows` entry point before serving requests;
the provider also prepares on first use, before acquiring a dispatch lease.
Preparation runs once per process and vault directory, copies encrypted bytes,
and retains the original files. It rejects duplicate toolkit names, conflicting
copies, invalid files and unsafe filesystem permissions. Interrupted copies can
be retried without replacing an existing encrypted wallet. Preparation has a
five-minute worker limit; failure keeps the provider unavailable.

The service must be the sole writer of this managed vault. Stop it before
out-of-band repairs or imports and restart it afterwards. Retain a consistent
pre-upgrade backup. Back up the **entire vault root**, including both layouts,
together with the database and retained passphrase. Older builds cannot find
wallets created in the account-scoped layout; do not downgrade an active vault.
The offline recovery fixture covers signing with restored wallets in both layouts.
