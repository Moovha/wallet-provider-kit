# Changelog

## Unreleased

- Keep one execution path: a user Safe, private ERC-4337 v0.7 bundler and verifying paymaster.
- Remove alternate account implementations, execution services, profile configuration, adapter exports, tests and operator guides.
- Require the Safe configuration and initialize SQLite schema version 2. Unsupported configurations and database formats fail closed; no compatibility conversion is provided.
- Rebuild package output from a clean directory so removed modules cannot remain in distribution artifacts.

The [latency evidence](docs/execution-latency.md) records earlier ten-user testnet bursts. It does not measure the implementation purge.
