# Adoption assessment

Reviewed on **15 October 2026**. This assesses whether a human developer can
understand and consume the toolkit, separately from production financial
acceptance. It compares repository interfaces and documentation, not audits,
certification, market share or identical feature coverage.

## Verdict

The toolkit has a recognizable ports-and-adapters design and useful security
boundaries. It is comparable in architectural approach to established projects,
but **has not reached their adoption or operational maturity**. Before this
change, a newcomer had to infer tarball installation, configuration ownership and
which documentation to read. The source tree itself did not need a wholesale
reorganization; its public entrance needed a concrete consumer workflow.

The purpose is a portable wallet implementation and controlled provider access,
including Moovha's access to independently controlled wallets. Key control and
recovery depend on the selected profile. The [scope guide](moovha-scope.md)
records its relationship to DeFi's four delivery scopes and distinguishes
non-custodial application access from exclusive end-user custody.

## Public benchmarks

The following are primary-source references, with public release histories used
as maintenance evidence. Popularity is a selection signal, not proof of quality.
GitHub displayed roughly 8.7k stars for ethers and 3.6k for Viem at review time;
these are volatile snapshots. Relayer is the closer service reference, with a
smaller audience; it isn't presented as equally popular.

| Reference                                                                                                                                                                                        | Why compare it                                                                                        | Observable adoption pattern                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Viem](https://github.com/wevm/viem), [releases](https://github.com/wevm/viem/releases), [package manifest](https://github.com/wevm/viem/blob/main/src/package.json)                             | Widely used TypeScript Ethereum library; a package experience benchmark rather than a custody service | README shows imports and client setup; focused export paths and environment/build checks make consumption explicit        |
| [ethers](https://github.com/ethers-io/ethers.js), [releases](https://github.com/ethers-io/ethers.js/releases), [package manifest](https://github.com/ethers-io/ethers.js/blob/main/package.json) | Established wallet/Ethereum library and an existing toolkit dependency                                | Registry installation, documentation and explicit runtime/type exports give consumers a defined package contract          |
| [OpenZeppelin Relayer](https://github.com/OpenZeppelin/openzeppelin-relayer), [releases](https://github.com/OpenZeppelin/openzeppelin-relayer/releases)                                          | Closest operational comparison: configurable signing and external transaction execution               | User installation/quickstart, named configuration examples, operator docs and a separate SDK expose distinct entry points |

These projects have different responsibilities. Viem and ethers don't replace
this host's current owner/grant/KYC/consent and durable-action authority. Relayer
owns queue, nonce and broadcast behavior that this kit delegates through an
experimental adapter. A similar folder tree does not establish equivalent
financial behavior or custody guarantees.

## Findings and changes

| Adoption criterion    | Before this change                                                                         | Delivered here                                                                                                   | Remaining gap                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Installation          | Package exports existed, but README primarily described building the checkout              | Explicit tarball build/install, package metadata and executable                                                  | Authorized versioned registry release and immutable long-term artifacts                       |
| Public API            | Root barrel and three adapter paths; declarations inferred from neighboring files          | Typed focused paths, preserved root imports, generated API/HTTP references and experimental compatibility policy | Stable release/support commitments and versioned migration evidence                           |
| First result          | Clone, build and start the HTTP service                                                    | Packaged inspection example and complete offline provider tutorial with exact expected output                    | Persistent production-host tutorial after durable acceptance and independent adopter feedback |
| Distribution evidence | Source tests and built-service smoke                                                       | Temporary consumer checks runtime/types, both examples, contracts and CLI; verification rejects API-doc drift    | Wider supported environment evidence if runtime support expands                               |
| Navigation            | Many individual guides linked from a long README                                           | Task-based documentation index, short entry point and repository map                                             | Usability feedback from independent adopters                                                  |
| Configuration         | Typed onboarding example plus environment/operations files with different roles            | One configuration ownership guide explaining each role                                                           | Production configuration validation in each adopter's reviewed application                    |
| Custody/recovery      | Explicit host ports, testnet profiles, offline fixtures and single-host onboarding storage | Existing controls preserved and boundaries made prominent                                                        | Reviewed persistent financial authority/journal and actual recovery/concurrency evidence      |
| Operations            | Docker definition, monitoring instructions and release gates                               | Existing service/HTTP/Docker choices documented alongside package consumption                                    | Container runtime/recovery, live vendor lifecycle evidence and production acceptance          |

The focused imports improve discoverability and module loading. They don't split
runtime dependencies into independent packages. Introducing a monorepo or a
configuration framework now would create more concepts without demonstrated
consumer demand. Keep one package until measured deployment or dependency needs
justify a split.

## API documentation and tutorial checkpoint

The next adoption increment adds a [human API guide](api.md), a generated
[TypeScript declaration reference](api-reference.md), an [HTTP usage guide](http-api.md)
and [schema reference](http-reference.md). `npm run check:docs` rejects drift from
public exports and the implemented OpenAPI. The API guide states the current
experimental compatibility/support policy; stable release commitments remain open.

The [end-to-end tutorial](integration-example.md) supplies complete readable
source and seven asserted request outcomes using real JWT validation, an ephemeral
offline signer, current authority checks and the journal wrapper. The tarball
consumer check runs and typechecks those packaged fixtures. This addresses the
API-reference and complete offline-integration gaps above. Independent usability
feedback, persistent production-host tutorials and live acceptance remain open.

## What reaching the mark means

A human adopter should be able to install a reviewed artifact, run the first
example, choose a supported profile and find its configuration and limits without
an AI agent explaining the repository. The package check proves the installation
and first-example mechanics. It cannot prove that the documentation is clear to
an independent reader; that needs actual adopter feedback.

Before claiming parity in production use, demonstrate a reviewed host integration
with durable authority, concurrency and uncertain-outcome recovery, obtain the
required independent security review, record live-provider acceptance separately,
and establish supported releases and maintainership. Keep those gaps visible in
[verification](verification.md), [security](../SECURITY.md) and
[release requirements](releases.md).

No new wallet engine, key export, generic signing endpoint, database schema,
deployment or npm publication is part of this adoption work.
