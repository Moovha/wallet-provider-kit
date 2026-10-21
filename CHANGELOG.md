# Changelog

## Unreleased

- Configure shared user-check requirements from administration with labelled
  identity information and access duration controls. Saved settings take effect
  without restart; changed requirements end current wallet approvals and require
  fresh consent. Identical saves preserve approvals.
- Explain reading access requirements, submitting completed checks and permission,
  and creating the blockchain wallet as separate API tasks.

- Deploy a provider with zero applications, claim its administrator privately and
  manage application registrations, identity trust, suspension and credentials
  through a persistent console and protected APIs.
- Separate management availability from wallet execution readiness. Retain
  installation identity and secrets across repeat and interrupted setup.
- Add prebuilt-container release packaging, a Linux server installer, AWS template,
  encrypted stopped-service backup tooling and explicit recovery/upgrade guidance.
  Release publication, cloud acceptance and production custody remain separate.

## Unreleased

- Remove application-specific atomic vault/DEX helpers, concrete router adapters and generated deployment artifacts from the public package and exports. Generic approved Safe calls remain available.
- Support Ethereum Sepolia domains in the low-level ERC-4337 helpers without enabling another supplied-service network.

- Retain atomic Safe deployment recipes, predict addresses locally and inspect cross-chain recovery against pinned dependencies, original ownership and a canonical block snapshot. Reconstruct earlier atomic recipes only from retained deployment evidence.

- Pipeline concurrent Safe provisioning through durable funding nonces after broadcast acknowledgement, with bounded preparation, aggregate reservations and recovery for lost acknowledgements.
- Preserve structured EVM revert responses and terminate correlated pre-admission bundler execution failures without reserving a Safe nonce.

- Keep one execution path: a user Safe, private ERC-4337 v0.7 bundler and verifying paymaster.
- Remove alternate account implementations, execution services, profile configuration, adapter exports, tests and operator guides.
- Require the Safe configuration and initialize SQLite schema version 2. Unsupported configurations and database formats fail closed; no compatibility conversion is provided.
- Rebuild package output from a clean directory so removed modules cannot remain in distribution artifacts.

- Initialize new user Safes with their ERC-4337 module and fallback handler in one transaction, preserving existing account addresses and prepared setup recovery.
- Reduce repeated preparation, typed-data encoding and storage reads while retaining fresh authorization before effects.
- Distribute bundler reads across eligible application RPCs with bounded queues, coalesced requests, capability tracking and provider cooldowns; raw transaction broadcasts remain single-dispatch.
- Reconcile included setup transactions after RPC failures so queued provisioning can progress without duplicate signing or broadcasts.
- Remove the execution latency documentation page and its navigation entries.
