# Changelog

## 0.1.0 — unreleased

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
