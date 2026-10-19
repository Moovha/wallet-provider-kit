# Architecture

Your wallet service receives application requests, checks current user permission
and calls a selected wallet backend. Understanding those responsibilities helps
you choose the service identity in [Provider](setup-wizard.md#_1-provider), key
control in Backend and application trust in Policies. This guide explains how the
layers fit together and where the provider's responsibilities meet the connected
application's. The **host** is the server application running the service;
**host authority** is its permission-checking code and trusted records.

`HTTP → verified principal → host authority → EmbeddedWalletService → signing provider`

For supported deployments, the configured service supplies authorization and
persistence; you select the wallet backend and connect external services.
Embedded integrations supply their own host composition. The domain service
uses interfaces to keep HTTP handling and vendor-specific code in their adapters.
Moovha user records, databases and settlement services are separate integrations.

The standard user experience remains inside the connected application. The provider accepts its assertions only under a reviewed trust agreement; an API token or matching fields alone do not establish authority. See [application-led access](application-access.md) for the implemented contract and migration limits.

## Responsibilities

- **Standard access profile:** explicitly trusted applications attest their users’ identity and consent. The provider checks current policy, evidence freshness and application-scoped ownership, then stores expiring, revocable grants without a user redirect or staff review.
- **Hosted compatibility profile:** provider login, consent pages, identity-vendor adapters and staff review remain explicitly selectable. The profile supports SQLite or
  the bundled file store and a provisioning-only journal. The configured transfer
  profile adds financial-action authorization separately.
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

The optional [configured execution coordinator](execution.md) supplies transfer
submission and independently verified token status over HTTP. The
[designated executor](execution-service.md) runs separately, authenticates immutable
handoffs and owns its provider dispatch journal. It calls back for fresh wallet
authority before effects; the wallet independently verifies chain evidence. The advanced
[Relayer integration](openzeppelin-relayer.md) also supplies the library path `verified host context → execution authority → journal → OpenZeppelin Relayer`.
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
| Implemented provider API        | An application calls your provider for access, owner-bound provisioning, approved signing and optional transfer execution/status        |
| Separate business-operation API | A provider/application coordinates account linking, operation preparation, execution, sponsorship and settlement with its business host |

This package implements the provider side. Its signing routes are not a business
operation planner or a settlement API. The orchestration snapshot below supplies
reference action schemas only. Keep service registrations, OAuth audiences,
owner grants and other custody systems separate; a provider token must not grant
access to another host's custody keys.

For implementation, follow [package installation](package.md), the
[provider walkthrough](integration-example.md), [backend integration](backend-guide.md)
and [host authority](provider-guide.md).

## Standards and interfaces

The [onboarding guide](onboarding.md#protocol-references) explains its OIDC, OAuth
and identity-vendor interfaces. Configuration is a fixed typed profile,
not a general policy language. Access details use RAR's structure; the toolkit
does not implement an OAuth authorization server or the full RAR protocol.

| Surface                   | Specification                                                                                                             | Implementation scope                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Provider API              | [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html)                                                                | Generated from Fastify route schemas; checked for drift.                                         |
| Access tokens             | [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html)                                                                   | OAuth JWT verification using jose; bundled oidc-provider issuance or an existing trusted issuer. |
| Errors                    | [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)                                                                   | Problem Details with safe code, request ID and dispatch outcome.                                 |
| Typed signing             | [EIP-712](https://eips.ethereum.org/EIPS/eip-712)                                                                         | CDP adapter checks the exact digest and recovered EOA; configured Base network (8453 or 84532).  |
| Chain/account identifiers | [CAIP-2](https://standards.chainagnostic.org/CAIPs/caip-2) / [CAIP-10](https://standards.chainagnostic.org/CAIPs/caip-10) | Action identifiers are checked against the selected account and chain.                           |
| Telemetry                 | [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/exporters/)                                                 | OTLP/HTTP traces and metrics; no durable financial audit journal.                                |

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

## General approved execution

The [approved-action envelope](approved-contract-calls.md) separates operation policy, account execution mechanism, authenticated submission and outcome verification. The Safe mechanism executes approved calls from the bound account; configured providers submit the immutable outer transaction. Generic calls retain current host authority and both durable journals. Protocol interpretation is explicitly selected policy: optional adapters add supported asset checks, while generic success establishes execution. Compatibility ERC-3009 transfers retain their existing account, authorization and budget contracts.
