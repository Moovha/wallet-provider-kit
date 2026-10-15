# Related projects and what we can learn

Open-source wallet infrastructure already has strong precedents. We don't claim
this kit is the first wallet framework, remote signer or policy-gated signing
service. Its focus is a provider-hosted HTTP boundary: your application checks
the current owner, grant, consent and identity status before an approved stored
action reaches a signing backend.

The projects below overlap with parts of that work. OWS and OpenZeppelin Relayer
have experimental [wallet](ows-adapter.md) and [relaying](openzeppelin-relayer.md)
integrations; the others are design references.
This comparison does not claim protocol compatibility.
Sources reviewed on **15 October 2026**.

| Project                                                                    | Relevant overlap                                                                    | Lesson for this kit                                                                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [Open Wallet Standard (OWS)](https://github.com/open-wallet-standard/core) | Local wallet storage, signing interfaces and policy-gated agent access.             | State which access path enforces policy, and separate specification requirements from reference implementation behavior.          |
| [Web3Signer](https://docs.web3signer.consensys.com/)                       | Remote signing with external vaults or encrypted key files.                         | Document each key backend's configuration, trust boundary and recovery needs separately from the HTTP API.                        |
| [OpenZeppelin Relayer](https://docs.openzeppelin.com/relayer/1.8.x)        | Configurable signers, transaction submission, nonce handling and status monitoring. | Keep signing, submission and settlement separate; provide focused examples for each supported backend.                            |
| [Tether WDK](https://docs.wdk.tether.io/sdk/core-module/)                  | Modular wallet managers, middleware and transaction policies.                       | Publish a capability matrix and explain module/key lifecycle responsibilities instead of promising universal wallet support.      |
| [Safe SDK](https://docs.safe.global/sdk/overview)                          | Separate kits for smart-account interaction, sharing transactions and relaying.     | Describe account execution and signature verification per account type; a contract account needs more than an EOA signer adapter. |

## A useful distinction from OWS

OWS is a close reference for policy before signing, but its
[policy model](https://github.com/open-wallet-standard/core/blob/main/docs/03-policy-engine.md)
distinguishes owner passphrase access from agent API-key access. Its agent tokens
also participate in decrypting separately encrypted wallet secrets. That is a
different authority model from this kit's OAuth resource server and host-owned
owner/grant/consent checks. Don't treat those credentials as interchangeable.

OWS also [separates normative requirements, optional profiles and implementation guides](https://github.com/open-wallet-standard/core/blob/main/docs/00-specification.md).
We follow that useful discipline here: [provider OpenAPI](../spec/provider-api.json)
describes implemented routes, while the orchestration snapshot is a draft
reference. Neither is evidence of a complete production wallet system.

## Apply the lessons

### Prefer reuse over another wallet engine

Adopt an existing wallet/signing engine when it fits the required key-control,
recovery and account profile. Use its extension points before building a parallel
key vault, transaction broadcaster or nonce manager. The projects above are
places to evaluate, not interchangeable production selections.

This kit has a useful role if an integration needs its host-owned authorization
and stored-action boundary as a separate service. It currently provides interfaces,
guards, a journal wrapper and optional CDP/OWS/Relayer adapters. The OWS flow is proved
offline against the actual native engine; a durable production host integration
hasn't been demonstrated. Prove that deployment before expanding the framework.
If an existing project's adapter can meet the same requirements, prefer a
companion integration or an upstream contribution over duplicating it here.

### Make the boundary testable

- **Show the supported profile.** The [provider guide](provider-guide.md#current-adapter-profile)
  records CDP's chain, account type, signing, recovery and evidence limits.
- **Make examples earn their place.** New adapters need a successful action,
  denied action and uncertain-outcome/recovery cases through their public interface.
  See the [acceptance checks](conformance.md).
- **Reuse test vectors.** Compare exact payloads, digests and recovered signatures
  across adapters that claim the same profile. Treat new account types as new
  acceptance work; Safe/ERC-1271 support isn't implemented here.
- **Keep responsibilities visible.** An authenticated caller still needs current
  spending permission. A signature still needs a separate execution and
  settlement workflow. See the [architecture](architecture.md).

Referencing a project doesn't import its code or license. OpenZeppelin Relayer's
stable documentation identifies its license as AGPL-3.0; this kit remains
Apache-2.0. Review the relevant license before copying code or adding a dependency.
The optional OWS dependency is MIT licensed; it is pinned separately and tested
through its public Node API. No code is copied from the compared projects and
no compatibility certification is claimed.
Relayer runs separately through HTTP, with its own license and deployment
acceptance. The kit delegates nonce, queue and broadcast work rather than copying
those implementations.
