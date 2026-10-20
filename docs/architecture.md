# Service architecture

The application authenticates to the provider, establishes a current owner grant and submits approved calls to the user Safe. The provider durably acknowledges each batch before background preparation. Preparation obtains the EntryPoint nonce and fee quote, estimates the exact calls, checks canonical Safe/module/handler/guard and contract pins, and reserves sponsorship.

The provider signs the immutable SafeOp and submits it through the private bundler. It verifies the exact operation, bundle transaction, canonical receipt and individual execution event before reporting success. Finality and business settlement are separate states.

An OWS owner signer is private infrastructure. The public account address is the user Safe. The application paymaster pays gas from its retained deposit; the bundler transaction signer needs only submission gas. See [gas funding](assets-and-gas.md) and [latency](execution-latency.md).
