# Changelog

## Unreleased — package adoption

- Add explicit typed package entry points for core, HTTP, onboarding, identity and
  telemetry while preserving root and backend imports; expose packaged contracts
  and an unconfigured inspection executable.
- Add a fresh-build tarball command, a credential-free consumer example and CI
  installation/type/runtime checks outside the source checkout.
- Organize adopter documentation by task and configuration ownership, and record
  a sourced comparison with maintained public projects and remaining maturity gaps.
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

- Added a sourced comparison with related open-source projects and an explicit
  CDP capability/evidence profile.
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
