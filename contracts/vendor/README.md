# Pinned local paymaster sources

`paymaster-sources.json` contains the unmodified Solidity import closure of
Pimlico `SingletonPaymasterV7` at `1e2305d1102242379b582142f62bd17add12b8c2`.
Every Solidity source retains its SPDX license and upstream comments.

| Dependency                   | Source revision                            |
| ---------------------------- | ------------------------------------------ |
| account-abstraction v6       | `abff2aca61a8f0934e533d0d352978055fddbd96` |
| account-abstraction v7       | `7af70c8993a6f42973f520ae0752386a5032abe7` |
| OpenZeppelin Contracts 5.0.2 | `dbb6104ce834628e473d2173bbc9d47f81a9eec3` |
| Solady                       | `1f43cc8005cc3b3c8361dd7dbdd2cdeaf0f99e66` |

Upstream source: <https://github.com/pimlicolabs/singleton-paymaster>.
The imported files are MIT-licensed. Dependency license texts are retained under
`docs/licenses/paymaster-*-MIT.txt`. The parent toolkit's Apache license does not
replace these upstream licenses.

`npm run generate:paymaster` builds the complete local manifest without network
access, using solc 0.8.37, 200 optimizer runs, London EVM and disabled metadata.
These are the toolkit's reproducible build settings; they do not claim bytecode
identity with Pimlico's deployed instances. `npm run check:paymaster` checks the
source-derived ABI, creation bytecode and runtime immutable references. The local
EVM test checks deployed runtime pins and verifying-mode signatures against the
compiled upstream contract. This does not establish Base deployment acceptance.
