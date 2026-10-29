# Changelog

## Unreleased

- Schedule application funding checks from confirmed gas usage, with a
  fifteen-minute recovery interval and a 50% refill low-water mark. Keep fresh
  balance snapshots and durable reservations authoritative for admission.
- Buffer estimated operation gas within the accepted total-gas and transaction
  cost limits instead of treating initial preparation values as per-field limits.

- Allow trusted applications to create and provision a Safe address before KYC,
  without transaction or signing permissions. Add creator-only draft KYC reads
  and incremental updates with revision checks and idempotent retries. KYC edits
  invalidate prior identity acceptance and grants; verified evidence and fresh
  consent remain required before transactions.

- Upgrade the OpenTelemetry API to 1.10.0 and align the SDK, resources and OTLP
  exporters on the compatible 3.0.0/0.300.0 release family. Group future
  OpenTelemetry dependency proposals so API peer requirements stay aligned.
- Upgrade Solidity to 0.8.38, update exact compiler requirements and regenerate
  the Safe state reader and local paymaster artifacts with the pinned settings.
  Update the offline viem test dependency to 2.57.11.
- Add persistent per-network execution controls to administration. Enabling
  requires setup and recovery references plus a mainnet acknowledgement;
  setting changes invalidate prior transaction consent and pending authority.
  Issued signatures and submitted transactions may still execute.
- Let provider operators grant trusted applications unrestricted external calls
  on one network. Restricted mode remains the default. Identity, owner consent,
  Safe control, immutable execution and accepted fee limits still apply;
  returning to restricted mode clears the contract list.
- Organize administration around a selected application with separate wallet
  setup, permission, connection and sharing panels and keyboard-accessible tabs.
- Return saved consent metadata in application access receipts. Omitted consent
  references and revisions bind to current terms; omitted identity levels use
  the application agreement. Explicit mismatches remain rejected.
- Bound rollup pre-verification gas by accepted total gas and monetary fee
  limits. Allow status reads up to three seconds for canonical receipt refresh
  while retaining pending status when fresh evidence is unavailable.
- Require Node.js 26.12.1 through the Node 26 release line for source use and
  align CI, container builds and Node type definitions. Node 26 is Current;
  the OIDC dependency's LTS-only support warning remains visible.
- Use a digest-pinned minimal glibc API runtime without a shell, package manager
  or filesystem administration tools. Preserve native wallet-engine support,
  include the atomic runtime library's package metadata, and verify restricted
  container execution and readable public assets in CI.
- Add age-encrypted stopped-service backups, authenticated archive verification
  and restoration into a new private directory with every network and container
  disabled. Include the vault, retained secrets, SQLite records, configuration
  and bundler state in one versioned recovery set. Legacy `.tgz.enc` archives
  require their original recovery procedure.
- Add opt-in scheduled S3 backups with configurable storage, Region, owner,
  calendar and local retention. Resume only the unchanged original containers,
  verify uploaded SHA-256 checksums and require conditional object creation.
  Keep the recovery identity off the provider host; retain remote backups until
  an operator changes their retention. Scheduled captures briefly interrupt
  service, and interrupted capture or failed source resumption requires review.
- Estimate composed calls within accepted sponsorship gas limits and the
  provider's hard ceiling. Refresh wallet drivers after accepted fee terms
  change, serialize replacement, retain bounded gas-estimation failure origins
  and make bundled helper scripts readable under private build file permissions.

- Add on-chain Safe owner-address management and configurable thresholds with
  separate owner-administration consent. Collect strict EIP-712 owner signatures
  for exact admitted SafeOps through authenticated signing-request APIs and the
  wallet client. Preserve original deployment recipes, pause incomplete quorums
  and reject stale chain ownership. Co-owned cross-network recovery and
  contract-owner signature collection remain unsupported.

- Add offline ERC-4337 integration coverage using pinned Safe and EntryPoint
  contracts, the Alto bundler and persistent Valkey storage. Check recovery after
  a lost submission response and service restarts without repeated execution
  of an atomic contract call and native transfer.
  Require targeted security mutations to fail behavioral tests; remove authorization
  call-count assertions already covered by revocation checks, and consolidate
  duplicate network-domain coverage.

- Add saved access-request lookup and complete access-policy response types to
  the application client, including cross-application sharing requirements.
  Retain bounded problem details and retry delays in client errors; distinguish
  authentication, permission, rate-limit, service and transport failures.

- Correct first-wallet consent instructions to require current transaction
  permission and its action-policy revision before Safe provisioning. Preserve
  read-only consent for opening an existing wallet.

- Update transitive `fast-uri` dependencies to the patched 3.1.9 and 4.2.3 releases.

- Reconcile dispatched historical operations after fee terms change. Release
  pending funding reservations only after verified finality, without signing or
  submitting another operation.

- Support explicit EIP-1967 and legacy ZeppelinOS proxy implementation layouts
  during policy validation, signing checks and receipt verification.

- Resume completed signing-account lookup under fresh owner permission while
  retaining the original creation attempt and checking backend account identity.

- Estimate refill fee reserves from current network gas and fee quotes. Pause
  before signing when the quoted priority fee exceeds accepted terms.

- Add optional per-network percentage funding targets for paymaster deposits,
  bundler balances, wallet provisioning and protected reserves. Apply new funding
  automatically with a fee buffer, minimum refill amount and existing authority
  and spending checks.

- Move provider infrastructure APIs to `/v1/provider/applications/{applicationId}/wallet-services`.
  GET reports status; POST deploys and funds the paymaster and configures bundler services.
  Move funding-address preparation beneath that resource and update the console.

- Extend provider administrator sessions to 30 minutes. Keep application and
  automation tokens at five minutes and recheck current permissions on every request.

- Add provider-managed encrypted blockchain connections and wallet-service
  preparation with progress in administration. Keep user execution disabled during
  operator-authorized preparation; retain setup transactions across uncertain
  outcomes and enforce a per-preparation cost ceiling and current approvals.

- Let providers offer fee limits and prepare funding addresses from administration.
  Require the connected application to accept each exact provider-offered revision
  before sponsorship or infrastructure spending; preserve application-submitted
  agreements and provider review.

- Make public browser assets readable by restricted deployment users, including
  builds prepared under a private file-creation mask.

- Add application network-fee review and funding-address setup to administration.
  Show plain-language fee limits and network-specific addresses; address preparation
  retains encrypted infrastructure identities without chain access, transfers or
  wallet activation. Application fee terms still require separate provider approval.
- Add explicitly approved balance-funded sponsorship with per-operation and pending
  fee ceilings and an optional cumulative budget. Keep unknown outcomes reserved,
  recheck current funding before sponsorship and retain existing agreement limits
  until replacement terms are approved.

- Accept Cognito token responses without optional scope metadata so invited
  administrators can reach email verification after signing in. Preserve signed
  identity, group approval and verification checks; log only fixed failure stages.

- Add optional Amazon Cognito administrator sign-in with code/PKCE login,
  explicit approval-group checks and 30-minute administrator sessions. Approved
  directory members can complete host-authorized first-time setup without copying
  a setup code. Include an AWS template with required authenticator-app MFA.

- Add stable AWS Elastic IP association, keyless Systems Manager administration,
  staged host preparation and instance choices for the new AWS Free plan.
- Restrict acceptance HTTPS to approved backend networks; end-user devices
  continue to use the connected application backend.
- Apply available OS security updates when building runtime images, and keep
  release identity scratch files outside the checkout so formatting checks can pass.

- Support multiple configured networks in one instance with shared verified identity
  and application registration, wallet-specific consent, and independent execution,
  credentials, funding keys and gas ledgers. Preserve default-network account URLs.
  Add network discovery, SDK selection and restart-applied choices in administration.
- Remove the browser configuration editor, its local HTTP server, frontend assets,
  dependencies and documentation. Use `/admin/` for Networks, Applications and User
  checks; source installation uses `init` and `local-setup` terminal commands.

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
