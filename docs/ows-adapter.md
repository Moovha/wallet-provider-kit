# Look after private signing keys

Each person receives a Safe address for deposits. Its private signing identity
stays in the Open Wallet Standard (OWS) vault. Keep the vault and its recovery
material private; connecting an application never shares those keys.

## Vault configuration for developers

Open Wallet Standard stores the private owner signer for each user Safe. Configure a private persistent vault directory, binding and retained passphrase reference. The signer address is not the user’s deposit or execution address.

Signing runs in a short-lived native worker. The provider resolves the current vault account and signs the authorized immutable SafeOp. It does not cache spending permission or return private signer credentials through the wallet API. Retain vault, passphrase and database together and test recovery before activation.
