# Architecture

`HTTP → verified principal → host authority → EmbeddedWalletService → signing provider`

Your application supplies persistent authorization and a signing backend. We call
it the host. The domain service works through interfaces, so HTTP handling and
vendor-specific code stay in their adapters. The kit doesn't connect directly to
Moovha user records, databases or settlement services.

## Responsibilities

- **HTTP service:** validate requests/tokens and dispatch account/action references.
- **Host authority:** check owner, grant, consent and KYC; supply durable attempts,
  result storage, concurrency control and recovery.
- **Signing provider:** provision/find accounts and sign authorized actions.
  The optional [journal-backed wrapper](durable-attempts.md) coordinates durable
  claims/results through a host-supplied storage port and current policy callback.
- **Orchestrator:** coordinate approval, execution, sponsorship and settlement.

Knowing who made a request doesn't tell you whether they may spend. Authentication,
account ownership, spending permission and transaction submission each need their
own checks. OAuth scopes let a request reach your policy checks; your host must
still authorize the action. See the [provider guide](provider-guide.md).

## Standards and interfaces

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
