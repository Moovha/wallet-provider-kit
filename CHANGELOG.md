# Changelog

## Unreleased

- Keep one execution path: a user Safe, private ERC-4337 v0.7 bundler and verifying paymaster.
- Remove alternate account implementations, execution services, profile configuration, adapter exports, tests and operator guides.
- Require the Safe configuration and initialize SQLite schema version 2. Unsupported configurations and database formats fail closed; no compatibility conversion is provided.
- Rebuild package output from a clean directory so removed modules cannot remain in distribution artifacts.

- Initialize new user Safes with their ERC-4337 module and fallback handler in one transaction, preserving existing account addresses and prepared setup recovery.
- Reduce repeated preparation, typed-data encoding and storage reads while retaining fresh authorization before effects.
- Distribute bundler reads across eligible application RPCs with bounded queues, coalesced requests, capability tracking and provider cooldowns; raw transaction broadcasts remain single-dispatch.
- Reconcile included setup transactions after RPC failures so queued provisioning can progress without duplicate signing or broadcasts.
- Remove the execution latency documentation page and its navigation entries.
