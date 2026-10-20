# OWS Safe owner signing

Open Wallet Standard stores the private owner signer for each user Safe. Configure a private persistent vault directory, binding and retained passphrase reference. The signer address is not the user’s deposit or execution address.

Signing runs in a short-lived native worker. The provider resolves the current vault account and signs the authorized immutable SafeOp. It does not cache spending permission or return private signer credentials through the wallet API. Retain vault, passphrase and database together and test recovery before activation.
