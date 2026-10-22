# Changelog

## Unreleased

- Add protected provider user detail and cursor-paginated directory endpoints for
  stored application-attested KYC evidence and associated wallets. Records remain
  application-scoped; directory reads grant no wallet or transaction authority.

- Stop queued wallet requests after their grant loses authority and before a
  financial action is admitted. Preserve recovery of any concurrently admitted
  action instead of retrying revoked access.
- Allow an application with an approved shared wallet to queue transactions without
  first creating its own wallet. Keep queue setup bound to the selected account.
- Preserve the selected wallet grant on SDK status streams, expose wallet
  disconnection in the backend client, and carry the configured network into its
  transaction adapter. Resolve an explicitly selected grant without scanning
  unrelated grants.
- Include the required Safe authorization scope in new application registrations.
  Consent, current wallet authority and transaction policy remain required.
- Keep administrator forms inactive until their handlers load, and use POST as
  their native fallback so credentials cannot appear in a form-submission URL.
  Keep user-check settings readable after applications enable wallet sharing.
- Initialize the empty runtime registry before starting an activated installation;
  wallet access still requires accepted application configuration and consent.

- Add named personal and shared wallets under current user checks, preserving the original Personal wallet as the default. Add member invitations, read or approved-transaction permissions, and independent wallet-specific consent. The backend wallets client carries the selected wallet grant. Provider signing keys and Safe thresholds are unchanged. Back up durable storage before upgrading: older builds cannot read the verified-user JSON collection.

- Add directional wallet sharing in Applications, exact matching on selected identity fields (including ID number, document type and issuing country), and `connect_from_application` access requests. Requesting apps receive their own consent grants, transaction rules and fee authority; sharing never replaces the original wallet owner.

- Organize API explorers by task, starting with six wallet-access requests. Give
  all 48 requests a plain-language name, purpose, caller and usage guidance, with
  a generated endpoint map and explanations of overlapping setup requests.
  Existing URLs, payloads and authority checks are unchanged. Live API testing
  also supports the existing PUT and PATCH routes with normal permission checks.

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

- Add named personal and shared wallets under current user checks, preserving the original Personal wallet as the default. Add member invitations, read or approved-transaction permissions, and independent wallet-specific consent. The backend wallets client carries the selected wallet grant. Provider signing keys and Safe thresholds are unchanged. Back up durable storage before upgrading: older builds cannot read the verified-user JSON collection.

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
