# Architecture

The wallet service receives requests from connected applications and checks them
against the account owner's current permissions before calling its wallet backend.
The **host** is the server application running this service; **host authority** is
its permission-checking code and trusted records. Authentication produces a
**verified principal**, the checked caller identity. See [roles and terms](concepts.md)
for how these responsibilities appear in configuration and API types.

`HTTP → verified principal → host authority → EmbeddedWalletService → signing provider`

Your host supplies persistent authorization and a signing backend. The domain
service works through interfaces, so HTTP handling and
vendor-specific code stay in their adapters. The kit doesn't connect directly to
Moovha user records, databases or settlement services.

## Responsibilities

<figure class="wallet-visual">
  <img src="./public/diagrams/service-boundary.webp" alt="Diagram: host authority and the wallet backend are inside the provider service; owners and connected applications remain separate callers." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>The service boundary contains permission checks and the selected wallet backend, rather than the connected application.</figcaption>
</figure>

[View full-size diagram](public/diagrams/service-boundary.webp)

- **Onboarding/access profile:** approved applications, hosted provider login and
  owner consent, identity-vendor adapters, provider review, private persistent
  records and expiring/revocable account grants. The small reference store and
  provisioning journal are bundled; financial-action authorization stays separate.
- **HTTP service:** validate requests/tokens and dispatch account/action references.
- **Host authority:** check owner, grant, consent and KYC; supply durable attempts,
  result storage, concurrency control and recovery.
- **Signing provider:** provision/find accounts and sign authorized actions.
  The optional [journal-backed wrapper](durable-attempts.md) coordinates durable
  claims/results through a host-supplied storage port and current policy callback.
- **Enrollment:** verify nonce/subject-bound identity evidence before your host
  accepts a user; reserve account identity without creating a wallet or spend grant.
- **Connected application/orchestrator:** coordinate approval, execution,
  sponsorship and settlement. It is expected to cover eligible network fees for
  its admitted operations; Moovha is the sponsor for Moovha operations. The
  [assets and gas guide](assets-and-gas.md) explains the rail and activation boundary.

The optional [Relayer integration](openzeppelin-relayer.md) adds the library-only
path `verified host context → execution authority → journal → OpenZeppelin Relayer`.
The host commits an approved call and budget; Relayer owns nonce allocation,
queueing, broadcasting and provider status. Provider acceptance never establishes
settlement.

Knowing who made a request doesn't tell you whether they may spend. Authentication,
account ownership, spending permission and transaction submission each need their
own checks. OAuth scopes let a request reach your policy checks; your host must
still authorize the action. See the [provider guide](provider-guide.md).

## Applications and wallet control

An adopting team operates the wallet service and chooses its key controller and
recovery model. Connected applications, including Moovha, request scoped access
and receive permitted action results without receiving keys. That relationship
doesn't establish exclusive end-user self-custody: an operator or vendor may still
control the selected backend. Explain the actual model to users.

There are two different API directions:

| Surface                         | Caller and responsibility                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented provider API        | An application calls your provider for access, owner-bound provisioning and approved stored-action signing                              |
| Separate business-operation API | A provider/application coordinates account linking, operation preparation, execution, sponsorship and settlement with its business host |

This package implements the provider side. Its signing routes are not a business
operation planner or a settlement API. The orchestration snapshot below supplies
reference action schemas only. Keep service registrations, OAuth audiences,
owner grants and legacy custody systems separate; a provider token must not grant
access to another host's custody keys.

For implementation, follow [package installation](package.md), the
[provider walkthrough](integration-example.md), [backend integration](backend-guide.md)
and [host authority](provider-guide.md).

## Standards and interfaces

The [onboarding guide](onboarding.md#protocol-references) explains its OIDC, OAuth
and identity-vendor interfaces. Configuration is a fixed typed profile,
not a general policy language. Access details use RAR's structure; the toolkit
does not implement an OAuth authorization server or the full RAR protocol.

| Surface                   | Specification                                                                                                             | Implementation scope                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Provider API              | [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html)                                                                | Generated from Fastify route schemas; checked for drift.                  |
| Access tokens             | [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html)                                                                   | OAuth JWT resource server using jose; the host supplies a trusted issuer. |
| Errors                    | [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)                                                                   | Problem Details with safe code, request ID and dispatch outcome.          |
| Typed signing             | [EIP-712](https://eips.ethereum.org/EIPS/eip-712)                                                                         | CDP adapter checks the exact digest and recovered EOA; Base Sepolia only. |
| Chain/account identifiers | [CAIP-2](https://standards.chainagnostic.org/CAIPs/caip-2) / [CAIP-10](https://standards.chainagnostic.org/CAIPs/caip-10) | Action identifiers are checked against the selected account and chain.    |
| Telemetry                 | [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/exporters/)                                                 | OTLP/HTTP traces and metrics; no durable financial audit journal.         |

Resource names, scopes and authorization rules are project-specific. These
specifications establish neither certification, regulatory compliance nor an audit.
The optional [enrollment profile](enrollment.md) uses OIDC Core ID-token validation
and OpenID Connect for Identity Assurance `verified_claims`, separately from API
access tokens. It leaves issuer login/code exchange, consent and acceptance policy
with the host and provides no automatic KYC-status mapping.

## Contract ownership

[provider-api.json](../spec/provider-api.json) is the implemented service contract,
generated through [Fastify Swagger](https://github.com/fastify/fastify-swagger).
It is versioned independently from the orchestrator API.

[orchestration-draft.json](../spec/orchestration-draft.json) is an OpenAPI 3.1.1
reference for action types, owned by Moovha's API project;
[extraction.json](extraction.json) records its source revision. Its operations,
grants, sponsorship and settlement routes are not implemented here. Keep service
hosts and OAuth audiences separate.

Snapshot updates require an upstream revision record, compatibility review,
generated types and fixture/conformance checks.
