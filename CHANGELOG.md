# Changelog

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
