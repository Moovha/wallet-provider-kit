# How your wallet service fits together

The application handles the person’s experience. Your provider service checks
permission, keeps the private signing identities and verifies transaction results.
This page gives developers and security reviewers a closer look at that boundary.

## From request to verified result

The application authenticates to the provider, establishes a current owner grant and submits approved calls to the user Safe. The provider durably acknowledges each batch before background preparation. Preparation obtains the EntryPoint nonce and fee quote, estimates the exact calls, checks canonical Safe/module/handler/guard and contract pins, and reserves sponsorship.

The provider signs the immutable SafeOp and submits it through the private bundler. It verifies the exact operation, bundle transaction, canonical receipt and individual execution event before reporting success. Finality and business settlement are separate states.

An OWS owner signer is private infrastructure. The public account address is the user Safe. The application paymaster pays gas from its retained deposit; the bundler transaction signer needs only submission gas. See [gas funding](assets-and-gas.md) and [execution recovery](user-operation-execution.md).

## Keep application policy outside the toolkit

The application backend owns product routing, token-to-fiat mappings, reference
feeds, commercial pricing and customer workflows. The toolkit owns reusable
protocol validation, current owner/grant/KYC/consent checks, private signing,
immutable attempts, single dispatch and canonical recovery. A supported protocol
adapter may decode UniswapX orders without selecting a product's trading policy.

Application-owned price adapters run as reviewed provider host code. The operator
installs and pins them; a caller cannot select a module, submit a trusted price or
supply an approval that bypasses provider checks. Keep application implementations
and their builds in their own repository, independent of toolkit installations.
See [order policy adapters](uniswapx-v3-orders.md#application-owned-price-policies)
for the contract and upgrade sequence. Contributor reviews must enforce this
boundary for future integrations.
