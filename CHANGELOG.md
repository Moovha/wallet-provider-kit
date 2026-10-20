# Changelog

## Unreleased Safe-only wallets and self-hosted sponsorship

- Give each user one Safe address for deposits, balances and transactions, with a
  private OWS signer, an application-owned verifying paymaster and a private Alto
  bundler. Applications fund one retained gas address. Existing explicitly
  configured relayer and pool profiles remain supported.
- Progress independent account queues at verified canonical inclusion. Preserve
  signed payloads, durable attempt authority, shared gas reservations and
  independent per-operation execution proofs through uncertainty and restart.
- Share RPC capacity, provider capability selection, chain-head reads and exact
  receipt proofs across user transports. Add bounded Etherscan observation reads,
  network-derived fees, overload limits and SSE delivery of verified status.
- Generate application execution scopes for Safe-only clients and keep legacy
  access, transfer and sponsor controls out of that setup flow.
- Keep dispatch unclaimed when final preflight fails before transport. Cache
  bundler capability discovery separately from current spending authority.
- Treat the profile as experimental: the latest ten-user Base Sepolia run verified
  eight operations, with two uncertain records retained and latency acceptance
  still open. Funded crash recovery and production capacity remain unverified.

## Application provisioning and funding recovery

- Create dynamic gas signers with the pinned Relayer API’s `plain` request type
  and unprefixed hexadecimal key format, retaining `local` response verification.
- Accept provider-reviewed per-transaction gas limits and reject underfunded
  sponsor budgets before infrastructure creation. Safe reads expose the network
  and exact configured admission reserve alongside the sponsor funding address.
- Keep retained Safe reconciliation available after sponsor funds are spent, and
  allow authenticated wallet and application responses up to sixty seconds for
  provider and RPC reconciliation.
- Create service-owned storage and vault subdirectories in new local deployments
  so bind-mount root ownership does not prevent first startup. Existing stores
  keep their configured paths.

## Application-scoped setup and shared Safes

- New wizard deployments prebundle execution and defer application RPC credentials,
  action policy, gas sponsorship and Safe provisioning until after connection.
- Protected provider APIs prepare one sponsor and one provider-controlled Safe per
  application. User wallets and consent remain separate; shared calls require
  explicit user-address bindings and zero native value.
- Accepted application RPC credentials drive verification and submission without
  a provider-paid fallback. Revocation blocks new effects; uncertain creation
  retries retain the original identities.
- Application off-chain action fields and enums are enforced alongside published
  provider restrictions. The standalone operator workspace and legacy runtime
  configuration routes are replaced by application and provider APIs.

## Unreleased application configuration APIs

- Remove the standalone operator workspace. Move application configuration listing to `/v1/applications/configurations` and batch listing to `/v1/wallet/batches`; existing clients must update the two former runtime-configuration URLs.
- Add application-scoped action, service-account and gas sponsorship declarations with separate provider decisions, revision checks and durable idempotent retries. Accepted action declarations constrain off-chain payloads. Application-owned verifier credentials support encrypted storage, rotation, revocation and scoped RPC selection. Shared Safe provisioning and execution activation remain outside declaration authority.

## Unreleased RPC throttling recovery

- Serialize fixed read-only RPC methods and allow at most three read attempts for HTTP 429 responses with bounded server backoff. Reject financial RPC methods before transport and preserve all quorum checks and financial no-redispatch rules.

## Unreleased Safe batch gas limits

- Allow explicitly configured Safe contract-call sponsors to use up to 5,000,000 gas per execution. Keep transfer-only configurations capped at 1,000,000, defaults unchanged, and exact sponsor fee/lifetime-budget admission in both wallet and designated executor validation.

## Unreleased receipt lookup recovery

- Verify known transaction hashes through the full RPC quorum before searching log history. Preserve the scan cursor until history is actually searched, and keep discovery as a fallback when known receipts cannot establish the exact result.
- Observe explicit nonce cancellation instead of repeatedly scanning the unsubmitted original. Keep direct reconciliation and all receipt/finality checks.

## Unreleased signed Safe recovery

- Decode Safe 1.4.1 execution events with their indexed transaction hash so independent receipt verification recognizes successful and failed executions.

- Authorize a separate zero-value Safe nonce cancellation for an original caller's signed action that has no provider submission admission. Fence original dispatch atomically and release its queue only after independently verified finalized cancellation.
- Restore persisted automatic Safe bindings before runtime execution reads after restart. Allow a held unsubmitted head to use its own cancellation slot in a bounded sponsor pool.
- Simulate bundled Safe calls before signing, while retaining signed-transaction simulation and current authority checks before submission. Keep uncertain provider attempts and lifetime reservations held.

## Unreleased bundled wallet-call admission

- Admit EIP-5792 Safe batches through the bundled local engine with the same wallet-attempt size limit. Apply designated-service envelope checks only to designated execution.

## Unreleased atomic native funding

- Accept native funds received by earlier calls when simulating an atomic Safe batch, including unwrap-and-send operations. Keep configured native-value ceilings, sponsor funding checks and full transaction simulation.

## Unreleased automatic Safe provisioning

- Deploy a deterministic Safe 1.4.1 account for a provisioned signing wallet through the bundled execution engine. Verify pinned deployment code, sole ownership and finalized RPC agreement before enabling its approved calls.
- Share the application gas ledger with transaction execution, retain uncertain attempts across retries and restarts, and expose read-only deployment status.
- Configure automatic deployment and acceptance evidence in the setup wizard. Existing Safe bindings remain supported.

## Unreleased Base network and local preview

- Select Base mainnet across wallet signing, runtime policies, execution verification and operator configuration; keep omitted network selections on Base Sepolia. Reject network changes to occupied stores and wrong-network actions.
- Run a private native OWS preview with application authentication, operator policy approval and idempotent wallet provisioning. Financial submission and mainnet certification remain separate acceptance steps.
- Allow the terminal local setup path to use bundled OWS and generated deployment credentials.

## Unreleased operator policy and gas forms

- Configure optional token-transfer, swap and vault adapters through setup and
  provider runtime forms. Keep adapters unselected by default and cumulative
  accounting a separate opt-in. Applications see published terms without provider
  editing controls.
- Prefill from registered pins, configured ERC-3009 policy and explicitly copied
  compatibility routes while preserving imports and existing compatibility rules.
- Edit gas budgets in ETH/gwei with exact wei conversion, cost summaries and
  explicit test-network defaults. Prefill additional sponsors from known
  application settings without resetting budgets or funding accounts.

## Unreleased optional allowance adapter boundaries

- Move cumulative token interpretation, terms and activation into optional policy
  adapters. Generic calls do not inherit ERC-3009 allowances or inspect asset
  history without a selected cumulative term.
- Keep the shared journal's additional budget charges numeric and optional;
  separate sponsor gas eligibility and capacity from asset policies while
  preserving atomic admission when both are selected.
- Preserve ERC-3009 endpoints, payloads, allowance usage and durable reservation
  identities. Existing intent fields and the `AssetBudgetCharge` type remain
  compatible; `PolicyBudgetCharge` describes the shared optional charge contract.

## Unreleased cumulative direct-token allowances

- Add optional `lifetimeAmount` to selected token-transfer adapters and runtime
  policy terms. Generic calls reuse ERC-3009 allowance identities, recorded usage
  and compatible ceilings while preserving legacy signatures and endpoints.
- Reserve assets with operation and gas budgets before effects; deduplicate asset
  charges across signing namespaces, SafeOp phases and restart recovery.
- Inventory earlier admitted direct transfers once during activation, retaining
  uncertain exposure and overdrawn usage. Opaque historical calls stop activation
  for review. Indirect asset flows and automatic account migration remain outside
  this profile.

## Unreleased generic calls and optional adapters

- Authorize native transfers through the common stored-call and wallet-calls
  pipeline using explicit recipient/code pins, provider opt-in and value limits.
- Extract protocol construction and receipt checks into optional policy adapters;
  share their verification across relayer and ERC-4337 execution.
- Keep generic calls independent of compatibility route settings. Explicitly
  selected adapters recognize exact supported calldata without caller labels.
- Preserve static swap/vault requests, their signing payloads and ERC-3009 transfer
  compatibility. Keep dedicated form controls and consumer account/execution migration
  as separate acceptance gates.

## Unreleased bundled setup

- Generate stable wallet environment, application and operator IDs for new
  configurations. Keep storage paths, credential variable names, API scope
  overrides and deployment details under advanced wizard controls; preserve
  imported identities and overrides.

- Start a private OpenZeppelin Relayer and persistent Valkey by default in bundled setup; generate encrypted local gas-sponsor keys and bindings for configured approved actions. Existing execution services remain optional.

- Default new wizard and CLI configurations to a bundled oidc-provider application
  token service, pinned OWS engine, private vault and SQLite authority records.
- Register configured server applications, generate missing deployment credentials
  once and preserve issuer keys, client secrets and vault passphrases across restarts.
- Register dedicated provider service operators separately for runtime workspace
  administration; application clients cannot obtain operator write scopes.
- Supply a digest-pinned Caddy automatic-HTTPS profile with private certificate
  storage; local evaluation leaves public ingress off and wallet operations disabled.
- Retain existing issuers, CDP, Relayer and custom adapters as optional paths;
  imported configurations preserve their selected integrations.
- Keep Base Sepolia, current wallet authority, durable attempts and deployment
  acceptance boundaries unchanged. Bundling does not establish production custody
  or live provider/TLS acceptance.

## Unreleased bundled wallet execution

- Connect an explicitly selected ERC-4337 driver to EIP-5792 batch admission,
  status, operator summaries and provider-bound ERC-7677 capability discovery.
- Persist exact signed UserOperations and local hashes before a single fenced
  bundler dispatch; retain uncertain outcomes without retries or relayer fallback.
- Recover receipts through independent chain reads, exact EntryPoint payload and
  event checks, per-operation logs/gas, finality observations and reorg handling.
- Retain shared runtime authority, operation/gas reservations and mechanism locks.
  Keep configured wizard activation and real-service acceptance gated.

## Unreleased durable SafeOp admission and signing

- Bind each stored operation to one mechanism before relayer signing/submission or ERC-4337
  sponsorship, preserving historical signing admissions across backend namespaces.
- Reserve shared operation and application gas allowances atomically, journal
  both paymaster phases and retain unknown outcomes through process restart.
- Add the advanced Safe4337Module 0.3.0/v0.7 signing adapter with current runtime
  authority, explicit sponsorship consent, accepted-account quorum checks and
  exact SafeOp signatures through protected backends.
- Keep configured-service activation, bundler submission and receipt recovery
  gated; existing relayer support remains available.

## Unreleased account abstraction sponsorship foundation

- Add a pinned EntryPoint v0.7 unsigned UserOperation profile, exact runtime-policy
  Safe call encoding, operation hashes and conservative paymaster gas-cost bounds.
- Preserve one application gas-budget identity and the lowest sponsor-pool ceiling
  across relayer and user-operation preparations; keep the existing relayer path.
- Add a bounded ERC-7677 client with explicit trusted-host authority/reservation
  gates before either RPC, strict response checks and no automatic retries.
- Record staged signing, admission, bundler, receipt and operator acceptance gates.
  The configured service does not yet activate ERC-4337 or advertise paymasterService.

## Unreleased contract method discovery

- Load verified Base Sepolia contract methods and bytecode pins from Sourcify in
  the runtime workspace, including a single EIP-1967 proxy implementation.
- Select discovered methods through checkboxes, with all methods selected by
  default within the existing 32-method limit; support ABI upload/paste and
  manual pin entry when verification is unavailable.
- Keep public metadata lookup separate from provider credentials, publication,
  current owner consent and independent execution-time code checks.

## Unreleased runtime operator workspace

- Add a deployed `/operator/` workspace with structured contract/method forms,
  policy previews, provider publication and bounded proposal/publication history.
  The setup wizard configures separate runtime operator identities.
- Default the provider's application approval form to automatic contract/method
  acceptance. Publish valid registrations only within unchanged enabled provider
  terms; retain provider-controlled claims, limits, consent and execution gates.
- Add scoped batch lists with provider ledger access, current owner-bound
  application access, retained finalized receipts and individual standard status
  refreshes. List/status reads never sign, submit or retry batches.
- Retain immutable publications, auditable review decisions, idempotent retries
  and separate policy/review concurrency checks in the existing SQLite JSON
  records. No SQL migration or application deployment is performed.

## Unreleased standard wallet calls

- Add the optional EIP-5792 2.0.0 account-scoped JSON-RPC interface for runtime-authorized Safe batch submission, capability discovery and status.
- Reserve unpredictable or caller-supplied batch IDs atomically with queue admission; reject duplicates across concurrency and restart. Current consent, method/claim rules, sponsor and shared budgets still govern effects.
- Retain quorum-verified receipt metadata, atomic Safe failure status and reorg/uncertainty handling. Polling never resubmits an unknown effect.
- Export the dependency-free wallet-calls request adapter with an explicit host UI callback for wallet_showCallsStatus. Document method, capability, chain, authentication and size limits. Offline evidence does not establish live wallet/provider acceptance.

## Unreleased runtime contract authority

- Bind published application policies to application-led owner consent, prepared
  Safe actions, current signing authority and immutable execution plans.
- Add explicit wallet/executor opt-ins for runtime contract targets and canonical
  methods while retaining provider-owned infrastructure, shared budgets and code
  checks. Enforce method/batch native values, call counts, validity and current
  application-attested claim values/ages.
- Require fresh consent after publication changes, deny stale new dispatches and
  retain original execution evidence for status/reconciliation under account-read
  authority. Static configurations keep their existing behavior.
- Document the application flow and unsupported policy semantics, business-effect
  verification and EIP-5792 adapter. Offline fixtures do not establish live-provider
  or production acceptance.

## Unreleased runtime configuration control plane

- Add application-scoped contract/method proposals and separate provider operator
  publication through the optional runtime configuration API. Durable current
  revisions become readable immediately without restarting the service.
- Retain immutable policy history, canonical method/hash validation, idempotent
  receipts, compare-and-set concurrency and deployment/transport fencing in the
  existing SQLite v1 JSON deployment record, with no SQL migration.
- Publish generated API contracts and operator/developer guidance. Registration
  alone grants no financial authority; runtime financial use requires the separate
  wallet/executor opt-ins and current owner consent.

## Unreleased bounded replacements

- Add the default designated-executor replacement worker for explicitly pinned
  policies. Initial fee headroom, fixed approved gas/fee caps, fresh wallet
  authority and durable claims bound each same-nonce, unchanged-call replacement.
- Preserve uncertainty across concurrent workers, restarts and lost responses;
  retain original reservations and report replacement conditions through execution
  receipts, signed payer events and aggregate health.
- Supply editable gas and replacement defaults for new wizard configurations.
  Existing configurations and approved plans retain their pinned behavior.
- Distribute a separate AGPL-3.0-only fee-only patch for OpenZeppelin Relayer
  v1.8.0 with native source contract tests and deployment instructions. Automatic
  replacement rejects providers without that contract. Offline evidence does not
  establish funded provider acceptance or production readiness.

## Unreleased approved execution foundation

- Add optional durable per-Safe unsigned request queues, authenticated delayed execution, unsigned cancellation and round-robin sponsor pools with independent executor capacity limits. Concurrent offline SQLite/HTTP fixtures cover duplicate admission, signing races and restart recovery; live throughput and provider acceptance remain pending.
- Add optional stuck execution/nonce diagnostics, durable payer quarantine, authenticated read-only reconciliation, signed payer webhooks and aggregate operational health. Provider repair mutations and signed Safe invalidation remain separately reviewed operator procedures.

- Generalize designated dispatch to immutable approved EVM actions, retaining current owner, grant, identity, consent, budget, attempt and recovery checks.
- Add separate contract delegation and configuration for approved calls, original Uniswap V3 exact-input swaps and bounded ERC-4626 router deposits through explicitly bound single-owner Safe 1.4.1 accounts on Base Sepolia.
- Reserve exact Safe nonces, retain contract-call signatures for coordinated execution, validate code/proxy pins and verify operation-specific outcomes independently of provider acceptance.
- Add graphical policy controls, generated API contracts and operator guidance. Safe signatures have no native expiry; live mechanism/vendor acceptance and production custody remain pending.

## Unreleased designated execution service

- Add a separate execution-service process with an operator-configured provider
  registry, OpenZeppelin adapter and versioned custom adapter contract.
- Authenticate exact dispatch and authority callbacks with pinned, short-lived
  ES256 request/response proofs while preserving current wallet owner, grant, KYC,
  consent, approval and attempt checks.
- Preserve stable handoffs and independent provider attempts through response loss,
  concurrent requests, restart, key rotation and backup recovery. Unknown provider
  effects never dispatch again.
- Add the explicitly selected `erc3009-executor-v1` profile, operator configuration,
  separate generated executor OpenAPI and deployment/recovery instructions.
  Base Sepolia EOA scope and experimental acceptance limits remain in effect.

## Unreleased execution foundation

- Add optional, explicitly versioned ERC-3009 execution through dedicated
  application gas sponsors, retaining current financial authority checks and one
  durable dispatch identity across retries and restarts.
- Verify exact token effects, canonical receipt blocks and safe/finalized status
  across configured RPC sources; recover lost submission responses without
  another dispatch.
- Expose execution capability discovery, authenticated status and a retained
  CloudEvents observation feed in the API and setup wizard.
- Reject sender-bound OAuth tokens until their proof mechanism is supported.
  Document single-active-host recovery and enterprise v1 standards/release gates.
- Execution evidence remains offline; Base Sepolia EOA scope and experimental
  release status remain in effect.

## Unreleased — API visibility and transaction reports

- List all documented provider API operations in local and deployed Swagger,
  labeling unavailable profiles with their configuration prerequisites.
- Explain that signing returns an authorization signature and that transaction
  submission, gas and settlement verification belong to the connected application.
- Add authenticated, idempotent transaction event reporting and reads for stored
  transfers. Persist at most 32 unverified application observations per action,
  recheck current access and keep reports separate from financial authority,
  budget reservations, settlement and exported request metrics/traces.

## Unreleased — local runtime installation

- Detect Docker, Compose, the image builder and local engine availability before
  deployment. Offer an explicit installation action with progress, then continue
  to the deployment plan automatically; preserve existing runtimes and stores.
- Install missing tools through Homebrew and start a dedicated Colima VM on macOS
  or Linux, or start installed Docker Desktop. Keep OS permission prompts in a
  terminal and preserve the selected Docker context and existing CLI settings.
- Add CLI runtime checks, installation and `local-setup --install-runtime` using
  the same executors. Keep wallet operations disabled after service startup.

## Unreleased — wallet service illustrations

- Add an architecture illustration to the README and documentation landing page
  showing the HTTP API, current policy checks, storage and wallet signing layers.
- Use matching navy-and-cyan vector diagrams for application relationships and
  approved signing, including durable attempts, permission rechecks and recovery.

## Unreleased — automated local container setup

- Add an explicit wizard executor for new local CDP/Relayer deployments with
  prerequisite checks, private secret entry, file preparation, image build,
  one-time storage initialization, diagnosis, startup and visible health progress.
- Use the repository Dockerfile, private persistent bind mounts, container security
  settings, loopback publishing and an unless-stopped restart policy. Retain data
  on failure or stop and provide saved operation/recovery commands.
- Keep wallet operations disabled and distinguish local startup from HTTPS and
  application/backend/recovery acceptance. Retain manual downloads and native OWS.

## Unreleased — first-time setup guidance

- Add identity and trust-agreement field explanations, immediate required-field
  name validation, and direct routes to dependent connection settings and back.
- Explain validation-only downloads and expected disabled activation, show
  application permissions in review, and give an ordered deployment handoff.
- Make the downloaded checklist use explicit source paths and private environment
  loading, with host/file preparation, acceptance and restart instructions.

## Unreleased — consolidated policy setup

- Keep access flow, identity requirements, application trust and permissions,
  expiry limits and transfer rules together in Policies. Hosted record
  requirements and verification price limits also live there.
- Focus Services on token, login and identity-vendor connections. Update field
  error destinations, operator guides and screenshots to match the layout.

## Unreleased — setup purpose and policy guidance

- Explain the wizard's configuration, export and deployment stages before the
  first field, and identify each exported file and its next use.
- Show how identity, application trust, permission and expiry settings affect
  access requests. Document the GUI's built-in policy controls and customization
  limits, including how reviewed changes reach a running service.

## Unreleased — application-led access

- Make the wizard, CLI template and standard guides use application-led access:
  users stay in their application, which attests identity and consent under an
  explicit provider trust agreement. Policy acceptance creates a revocable grant
  without a provider user-login redirect or routine manual review.
- Bind users and evidence to the authenticated application, enforce current
  identity/consent dates and policy revisions, and expose grant revocation and
  exact transfer terms through the API. Wallet effects retain current authority,
  immutable action and durable attempt checks.
- Retain hosted login/review and unfunded record evaluation as explicit compatibility
  options. Existing configurations without an access mode remain hosted; changing
  an occupied deployment's mode requires a reviewed migration. No automatic
  cross-application wallet linking or ownership migration is provided.
- Align the README, operator/developer guides, wizard help, API examples and public
  screenshots with the standard flow. Configuration and HTTP changes are additive;
  the toolkit-owned SQLite schema and backend interfaces are unchanged.

## Unreleased — configured staging evidence

- Record a live hosted consent/review rehearsal with application records, Auth0,
  unfunded CDP provisioning, policy denials and encrypted restore. Keep natural
  expiry and lost-provider-response acceptance explicitly incomplete.
- Explain Auth0 M2M issued-scope checks and purpose-specific client grants.

## Unreleased — application-record evaluation

- Default new wizard drafts and CLI templates to application-supplied records
  with provider-defined required fields, owner consent and explicit provider review.
- Add admitted-client policy discovery and bounded batch submission with indexed
  validation results, retained-field projection and durable item replay.
- Keep this source limited to unfunded account provisioning and reads. It requires
  no KYC vendor credentials or verification budget and does not establish
  externally verified KYC or permit financial signing.

## Unreleased — operator interface language

- Clarify setup labels, field guidance, validation messages and export steps for
  operators, including secret variable names and deployment test report references.
- Explain application token scopes and API examples in plain language, with
  actionable token errors and a clear boundary between preview and live requests.
- Keep documentation labels and offline UI screenshots aligned with the interface.

## Unreleased — identity verification handoff

- Open a prepared identity verification session through an explicit navigation
  link, so strict browser form-action policies do not block the vendor handoff.
- Preserve same-origin form submission restrictions, withheld external referrers
  and reuse of an existing verification session when the owner resumes.

## Unreleased — public documentation language

- Rewrite operator walkthroughs, integration guides and project policies for their
  public readers, replacing development-session narration with tasks, current
  behavior and explicit requirements.
- Clarify configured-service and embedded-host responsibilities, SQLite storage
  options, token exchange and onboarding transfer delegation in existing guidance.
- Move screenshot upkeep to the contributor guide, summarize live CDP evidence
  with its limits and regenerate public references from corrected source comments.

## Unreleased — guided operator settings

- Explain every wizard setting with a plain-language purpose, its source or
  decision, examples and a relevant setup link. Add page orientation for first-time hosts.
- Label the public service address and wallet environment name by their purpose;
  distinguish chosen values, issued registrations, secret variable names and
  optional features. Explain defaults, identity budgets, token units and evidence.
- Keep detailed login/token compatibility requirements available in expandable
  checklists. Explain the three export files and the deployment work that follows.
- Preserve configuration contracts, validation, disabled initial activation and
  offline setup behavior. Configuration guidance does not certify integrations.

## Unreleased — public writing review

- Require an audience and purpose review before commits and pushes, covering
  documentation, walkthroughs, examples, UI text, comments, generated descriptions
  and commit/PR wording.
- Add artifact-specific writing guidance and a PR evidence checkpoint; clarify
  operator instructions and integration limits without development-session context.

## Unreleased — provider-authorized delegated transfers

- Replace the bundled owner-approval transfer flow with application requests on
  behalf of users and provider authorization under configured financial policy.
- Require explicit `transfers:request` consent at onboarding, bound to the token,
  recipients and limits; retain current owner/grant/KYC/consent checks, immutable
  actions, durable budgets, dispatch fencing, replay and unknown-outcome handling.
- Use `provider-authorized-erc3009-v1`, return `authorized` without `approval_url`,
  and remove per-transfer browser approval routes. Existing request-only grants
  are not upgraded; changed financial terms require renewed delegation consent.
- Update generated contracts, operator setup/API guidance and offline denial,
  recovery, concurrency and policy-change coverage. No database schema change.

## Unreleased — documentation publication

- Include GitHub Pages publication and live-page verification in the documentation
  delivery workflow after changes merge to main.

## Unreleased — FormKit operator setup

- Add a local, bundled FormKit wizard for supported wallet backends, login,
  identity services, policies, activation settings and configuration export.
- Include provider logos, official setup references and deployment/variable
  templates without collecting credentials or implementing custom adapters.
- Reuse service validation and show identity-funding, permission and deployment
  prerequisites separately from external acceptance.
- Add browser walkthroughs, local API isolation checks and package verification.

## Unreleased — visual documentation guides

- Add labelled vector-style diagrams for service boundaries, owner access,
  signing authority, durable attempts, backend selection, service setup,
  gas sponsorship and operations.
- Pair diagrams with descriptive alternatives, captions and full-size links
  across the integration guides; retain editable Mermaid request flows.
- Bundle optimized local assets and their generation prompts with the docs.

## Unreleased — blockchain assets and application-sponsored gas

- Distinguish decentralised finance (DeFi) from ownership of Moovha's API and
  smart-contract implementation; use service names for implementation responsibilities.
- Make the toolkit's blockchain and DeFi foundations visible in its introduction,
  with USDC and ZARP as wider-project asset examples and explicit test-profile limits.
- Document gas sponsorship as a project-supported integration rail and connected
  application obligation, with Moovha sponsoring admitted Moovha operations.
- Explain provider responsibilities, coverage and activation checks while keeping
  the sponsorship implementation in the application's business-operation API.

## Unreleased — configuration-first provider service

- Add validated versioned JSON configuration, environment-backed secret references,
  explicit storage initialization, offline diagnosis and configured CLI startup.
- Supply API-requested, owner-approved Base Sepolia ERC-3009 transfer authorizations
  with recipient/amount policy, lifetime reservations and durable signing/replay.
- Wire CDP, OWS and Relayer signer pools from configuration with toolkit-owned
  authority and journals; retain stable backend/account bindings across restarts.
- Add trusted versioned custom backend modules, deployment compose and setup guides.
  Existing no-argument preview and advanced embedded APIs remain available.

## Unreleased — built-in SQLite persistence

- Add opt-in, explicitly initialized SQLite storage for onboarding, login,
  identity decisions, grants, financial approvals and optional enrollment.
- Supply immutable exact-action authority, stable idempotent admissions, exact
  integer budgets and a fenced signing/Relayer journal with atomic audit events.
- Preserve unknown effects through restart, support evidence-based reconciliation
  and read-only status lookup, and document private storage and backup/restore.
- Keep file-store compatibility, required current host-policy checks and the
  unconfigured CLI; no production database, backend or deployment is activated.

## Unreleased — Moovha documentation branding

- Add the existing Moovha symbols to the README, documentation navigation and
  favicon, with navy/cyan styling and light/dark theme support.
- Link directly to installation, tutorial, backend and API sections, plus the
  Moovha website, source repository and issue tracker.

## Unreleased — published documentation

- Publish the documentation site on GitHub Pages and make it the primary README
  documentation link, with direct installation, tutorial and API links.
- Keep later documentation deployments in the separate manual publication workflow.

## Unreleased — roles and terminology

- Introduce account owners, connected applications, hosts, authority and wallet
  backends before the README diagrams; explain attempts, journals and recovery.
- Add a shared concepts guide mapping client registrations, token/API fields,
  configuration and consent-screen names, with an example of a signing retry.
- Add local explanations and concepts links to API, onboarding, backend and
  example entry points; keep technical API names intact.

## Unreleased — documentation site and diagrams

- Add README diagrams for the wallet owner/application/provider relationship and
  the approved signing path, with the same rendering in the documentation site.
- Supply a searchable VitePress site with grouped navigation and an ordered
  integration path, built from the repository's existing Markdown.
- Check the site build in CI, exclude site tooling/output from the package, and
  provide a separate manual GitHub Pages publication workflow.

## Unreleased — adopter documentation

- Remove internal assessments, workspace handoffs and historical verification
  logs from the public documentation and package.
- Organize installation, examples, backend selection, host authority and operations
  into a linked integration path; keep contributor and licensing material.
- Separate the walkthrough's wallet backend from host policy and journal fixtures
  so adopters can see exactly where their engine or service connects.

## Unreleased — project introduction

- Rewrite the README around wallet adoption, the provider/user/application
  relationship and the toolkit's role in Moovha, followed by supported scope and
  a runnable first integration. Keep technical setup details in the linked guides.

## Unreleased — API documentation and provider tutorial

- Add task-oriented API and HTTP guides, generated public declaration/schema
  references and a verification gate that rejects documentation drift.
- Add a complete offline authenticated provider flow with readable host/backend/
  journal fixtures and seven asserted admission, signing, replay, denial and
  uncertain-outcome steps; run/typecheck it from the installed tarball in CI.
- Clarify application access, backend key control and device self-custody.
- Document experimental compatibility and production fixture replacement; retain
  default denial, unchanged financial boundaries and disabled npm publication.

## Unreleased — package adoption

- Add explicit typed package entry points for core, HTTP, onboarding, identity and
  telemetry while preserving root and backend imports; expose packaged contracts
  and an unconfigured inspection executable.
- Add a fresh-build tarball command, a credential-free consumer example and CI
  installation/type/runtime checks outside the source checkout.
- Organize adopter documentation by task and configuration ownership.
- Keep npm publication disabled and production authority/provider acceptance pending.

## Unreleased — onboarding and application access

- Preserve delayed identity acceptance without granting expired access; owners can
  cancel pending reviews and reuse accepted identity through a fresh access request.
- Add one provider configuration with hosted OIDC login, owner consent, provider
  review, expiring access grants, revocation and account suspension.
- Add recipient Didit and Sumsub Reusable KYC Share adapters, optional hosted fresh
  verification, explicit requester funding reservations and uncertain-outcome recovery.
- Add private single-host file persistence and a provisioning-only journal with
  read-only wallet recovery; financial signing remains a separate host integration.
- Publish the access-request OpenAPI and a compact configuration example. Existing
  lower-level enrollment and signing integrations remain separate profiles.

## 0.1.0 — unreleased

- Add optional user enrollment with provider-bound OIDC Identity Assurance proof
  validation, durable host acceptance/receipt ports and acceptance-gated provisioning.
  Keep identity evidence, provider KYC decisions and wallet/spending authority separate.

- Review dependency updates against the full toolkit; adopt Vitest 5 and Prettier
  3.9 with formatting fixes. Keep Node/types on major 24 and defer TypeScript 7
  until the contract generator supports its compiler/API migration.

- Add an optional OpenZeppelin Relayer HTTP integration for configured EIP-712
  signers and a separate host-approved execution profile. Delegate nonce/queue/
  broadcast work to Relayer; reuse the host journal for acceptance, replay and status.
- Document the pinned API/source, signer/network bindings, recovery/fee limits,
  separate service license and offline evidence.

- Add an optional OWS 1.4.3 adapter for Base Sepolia EOA typed signing, with a
  required host journal and bounded child-process calls.
- Prove provisioning, exact large/nested integer signing, replay, denial and
  uncertain-result handling against the real native engine using ephemeral wallets.
- Share the existing EIP-712 profile validation with CDP and document the
  reuse-first integration, operator control and deployment acceptance limits.

- Added an optional journal-backed provider wrapper with immutable request
  fingerprints, fresh host-policy checks, stored-result replay, fenced completion
  and explicit pending/conflict/unknown outcomes. Durable storage stays host-owned;
  no database adapter, migration or production activation is included.

- Document the explicit CDP capability and evidence profile.
- Added public GitHub hosting, a persistent `codex/toolkit` branch and a tested
  merge workflow that waits for CI and outstanding contributions/reviews.
- Added a contributor writing guide and a friendlier documentation voice, with
  a short project philosophy and a link to the Moovha platform.
- Reworked project and contributor documentation around integration, entity
  control and supported behavior; clarified external orchestration boundaries.
- Extracted the wallet authority/signing interfaces and CDP adapter into an
  independent Apache-2.0 repository with recorded provenance.
- Added Fastify HTTP service, generated OpenAPI, Swagger UI, RFC 9068 access-token
  validation, strict request validation and RFC 9457 error responses.
- Added allowlisted OpenTelemetry traces/metrics and an optional Grafana LGTM
  development profile, with no paid infrastructure or custom dashboard.
- Updated the standalone adapter to ethers 6; added offline HTTP/security and
  actual local OTLP export tests.
- Added contribution/DCO, governance, security, release and dependency maintenance
  policies plus CI. Production authority, live provider acceptance and publication
  remain gated.

### Supplied stored-action backend

- Add `/backend` and core exports for configured account recovery and durable
  signing dispatch, preserving trusted host policy/storage authority.
- Keep unknown effects fenced to original identities, verify exact signatures
  and expose no arbitrary signing, key-export or transaction endpoint.
