# Recover deposits on another EVM chain

Use this guide with your developer and recovery operator if assets were sent on
the wrong network. Begin with read-only inspection; recovery may require a
separately authorised transaction and is not guaranteed.

USDC sent to a Safe address remains on the network where the transfer occurred.
A matching hexadecimal address does not establish ownership on another chain.
The toolkit provides deployment recipes and read-only recovery inspection for
operators. The supplied application transaction runtime remains limited to Base
and Base Sepolia; these utilities do not enable application execution on other
networks or automatically bridge assets.

## Preserve the original deployment

New atomic Safe provisioning retains a `SafeRecoveryManifest` before submitting
the deployment. It contains the original owner, initializer, salt nonce, factory,
singleton, proxy creation code, expected proxy runtime hash, module and EntryPoint
code pins. Back up the provider database and owner recovery material together.
The manifest contains no private key, but identifies the account and its owner;
handle it as private operational data.

`SafeWalletRuntime.recoveryManifest(context, accountId)` requires current account
access. For earlier atomic accounts without a manifest, it reconstructs the
recipe from the retained deployment transaction and checks that it reproduces
the recorded Safe address. Missing original evidence or a legacy two-step
initializer requires separate operator investigation; the method fails closed.
Do not substitute a new owner or current configuration for missing historical data.

<details>
<summary>Why the deployment recipe matters</summary>

Safe uses CREATE2 for `createProxyWithNonce`. Its address depends on the factory,
singleton, proxy creation code, initializer and salt, without a chain ID. Matching
addresses require the same inputs and compatible dependencies at the same
addresses on each network. Creating a new signer on another network produces a
different initializer and generally a different Safe address.

</details>

## Inspect before deploying

The `@moovha/wallet-provider-kit/deployment` export provides:

- `createSafeRecoveryManifest` to capture an atomic deployment recipe.
- `predictSafeAddress` to calculate its address locally.
- `inspectSafeRecovery` to check the target network and account without signing
  or broadcasting a transaction.

Pass `inspectSafeRecovery` a trusted manifest from the original deployment,
a read-only RPC reader, and an independently configured target chain ID and
genesis hash. A manifest is not a signature or spending authorization. Never
accept its owner or code pins from an untrusted recovery request.

Inspection checks dependency code hashes, the factory's proxy creation code,
the module's EntryPoint and the expected address at one block snapshot. For an
empty address it simulates the exact deployment and returns its transaction
fields. For an occupied address it verifies the proxy, singleton, original owner,
threshold, sole enabled module, fallback handler and absence of a guard. A
matching deployed Safe returns no deployment transaction. Changed ownership or
configuration requires separate review rather than an automatic overwrite.
Inspection also rejects a snapshot whose block hash changes during the check.

The host must independently authorize recovery, confirm that the original owner
is still trusted and available, and recheck current chain state before spending.
Owner rotations on one network do not update other networks or the original
initializer. Never replay an initializer whose original owners are compromised.

## Recover and verify the assets

After deployment, inspect the deployed account again before authorizing its
transfer. Use the exact token contract on that network, a bounded amount and an
explicit recovery recipient. Deployment alone does not move or bridge USDC.
Provide gas on the target network through an approved payer; sponsorship on
Base does not fund another chain.

Persist deployment and recovery transaction identities before broadcast. Resume
observation after a timeout and reuse an exact signed payload when appropriate.
Do not infer failure from missing RPC visibility. Verify both the Safe execution
result and the token transfer to the intended recipient; a successful outer
transaction or an unrelated balance increase is insufficient.

Safes can receive ERC-20 deposits before deployment. This makes recovery possible,
but does not guarantee recovery on every EVM chain. Missing canonical dependencies,
incompatible execution environments or an occupied address can prevent it.

References: [Safe multichain deployment](https://docs.safe.global/advanced/smart-account-multi-chain-deployment),
[Safe recovery deployment](https://docs.safe.global/advanced/cli-guides/recovery-safe-deployment),
[Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses).
