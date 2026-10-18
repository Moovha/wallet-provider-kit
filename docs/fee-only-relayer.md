# Build the fee-only Relayer provider

Use this optional provider build when enabling the designated executor's
[automatic replacement policy](automatic-replacements.md). It retains
OpenZeppelin Relayer's signer, nonce allocator and durable provider record while
requiring explicit EIP-1559 fees and immutable calls for replacement. It is a
separate deployment artifact; installing the toolkit does not deploy or modify a
running Relayer.

The patch targets OpenZeppelin Relayer **v1.8.0**, commit
`b8cf360a49c5739e43491ca5d2f6bbc934b7438e`. Apply it only to that exact source:

```sh
git clone --branch v1.8.0 --depth 1 https://github.com/OpenZeppelin/openzeppelin-relayer.git relayer-fee-only
cd relayer-fee-only
test "$(git rev-parse HEAD)" = b8cf360a49c5739e43491ca5d2f6bbc934b7438e
git apply --check /path/to/openzeppelin-relayer-v1.8.0-fee-only.patch.txt
git apply /path/to/openzeppelin-relayer-v1.8.0-fee-only.patch.txt
cargo +1.95.0 fmt --check
cargo +1.95.0 check --locked --all-targets
cargo +1.95.0 test --locked --lib domain::transaction::evm::
cargo +1.95.0 test --locked --lib test_evm_tx_for_replacement
WPK_FEE_ONLY_REPLACEMENTS=1 cargo +1.95.0 test --locked --lib test_wpk
cargo +1.95.0 build --locked --release
```

Download the [provider patch](public/patches/openzeppelin-relayer-v1.8.0-fee-only.patch.txt).
Retain the upstream source, patch, dependency lockfile, build provenance, image
digest and acceptance record. Use the upstream build prerequisites and reviewed
provider deployment procedure. CI compiles the patched source and runs offline
EVM regression/contract tests; no credentials, provider accounts or funded chain
transactions are used by that job.

## Configure an isolated deployment

Set `WPK_FEE_ONLY_REPLACEMENTS=1` on the provider process before startup. This
applies to **every EVM relayer in that process**. Use a dedicated process and
sponsor signers with private ingress restricted to the designated executor.
Do not share its API credential with applications or unrelated automation.
Preserve the upstream API authentication, HTTPS, signer isolation and durable
Redis/queue requirements. Configure each sponsor's policy:

```json
{
  "gas_limit_estimation": false,
  "eip1559_pricing": true,
  "gas_price_cap": 3000000000
}
```

Set `gas_price_cap` to the exact maximum fee per gas approved for that sponsor,
not a different global limit. Configure receiver restrictions and funding
thresholds appropriate to your deployment. The toolkit validates these policies
and the provider binding during preparation and replacement. The fee values
above are illustrative; accept the exact values for your network and operations.

The process advertises
`x-wpk-relayer-contract: wpk-fee-only-replacement-v1`. The executor checks this
header on authenticated sponsor metadata responses before enabling the
capability; the wallet checks the executor's signed capabilities before releasing
an owner signature for a replacement-enabled plan. Preserve the header through
your proxy. Never inject it for an unpatched upstream process. This is an explicit
compatibility contract, not remote attestation or vendor certification; deployment
integrity and credential isolation remain operator responsibilities.

## What the patch enforces

- Initial submission and replacement must provide exact type-2 fee fields and an
  explicit gas limit. If upstream pricing computes different fields, preparation
  rejects them before initial nonce allocation or signing.
- Replacement keeps the original recipient, value, calldata, gas limit and nonce.
  Requested fees survive replacement construction. The exact calculated prices
  must equal those requested before signing.
- The signed replacement is saved under the original provider record, its hash
  history is retained, and a submit job broadcasts those bytes. A lost queue
  insertion can be recovered by the Sent-state monitor using unchanged bytes.
- Automatic fee repricing, cancellation, circuit-breaker NOOP conversion and
  nonce-gap NOOP creation are disabled. Old queued resubmit jobs cannot sign at
  new prices. Read-only monitoring and existing-artifact broadcast remain.

Without the environment flag, the patch preserves upstream behavior and does
not advertise the fee-only contract. Do not turn the flag off on an active
bounded deployment: that would restore autonomous upstream mutations outside
fresh wallet authority. Fence egress and review all pending records before any
provider-mode migration. Apply the same fencing discipline during failover.

The provider does not know the wallet's current owner/grant/consent state.
The executor supplies that enforcement through signed callbacks immediately
before the provider mutation. The private ingress credential must therefore be
available only to that executor. This patch does not add a public wallet signing,
replacement, cancellation or key-export endpoint.

## Licensing and acceptance

OpenZeppelin Relayer and this provider patch are distributed under
[AGPL-3.0-only](public/patches/AGPL-3.0.txt). They are separate from the toolkit's
Apache-2.0 source. Preserve upstream notices and comply with the provider's
source-availability obligations when deploying a modified network service.
The provider is not bundled as a running service or certified by this toolkit.

Before funding, validate your actual signer, Redis durability, queue recovery,
fee-policy rejection, exact same-nonce wire transaction, RPC behavior and host
fencing. Offline tests and compilation cannot establish live operational
acceptance. Retain separate evidence for Docker/provider integration and funded
deployment checks.
