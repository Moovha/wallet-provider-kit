# Architecture and standard interfaces

`HTTP → verified principal → durable host authority → EmbeddedWalletService → signing provider`

HTTP uses Fastify and its maintained schema/Swagger/security plugins. The domain
has no HTTP or vendor dependency. Only the CDP module imports the vendor SDK.
Provider-specific keys are confined to the adapter. The service has no direct
connection to Moovha users, exchange, Supabase or on-chain settlement.

| Layer               | Standard or package                                        | Authority and compatibility                                                            |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| HTTP service        | Fastify 5; OpenAPI 3.0.3                                   | Route schemas generate the implemented contract; checked for drift                     |
| Error responses     | RFC 9457 Problem Details                                   | Stable safe code/request ID/outcome; HTTP success does not imply settlement            |
| Access tokens       | OAuth 2.0, RFC 9068; jose                                  | Trusted issuer/audience/keys; current object authorization remains host responsibility |
| Action reference    | OpenAPI 3.1.1 orchestration snapshot                       | Frozen upstream schema; not implemented orchestration routes                           |
| EVM signing         | EIP-712; ethers 6                                          | Exact digest and recovered EOA verified; Base Sepolia restriction                      |
| Chain/account names | CAIP-2 / CAIP-10 in action schema                          | Checked against the selected action/account; no generic multi-chain promise            |
| Monitoring          | OpenTelemetry API/SDK, OTLP/HTTP                           | Traces/metrics only; existing collector/Grafana UI                                     |
| Supply chain        | npm lockfile, CycloneDX SBOM, pinned OCI/action references | Local reproducibility; signing/provenance only when actually emitted                   |

The Moovha resource names, scopes, authority requirements and revisions are a
project-specific business profile built on standards. They are not an industry
wallet standard, formal certification, OpenID conformance result or audited
financial control. Do not brand them as one.

The extracted orchestration schema remains owned by the Moovha API project at
the commit in `extraction.json`. Changes here are reviewed compatibility proposals
until upstream accepts them. The generated TypeScript file derives from that
snapshot. Do not maintain two silently divergent business authorities. Updating
it requires an upstream revision record, diff review and fixture/conformance runs.

The new provider HTTP profile is independently versioned. It does not publish
Moovha's `/operations`, grants, sponsorship or settlement APIs. Integrations must
keep the two service audiences/hosts distinct. The existing Moovha login, API-only
database gate and financial policy stay with the Moovha API scope.

Sources checked 15 October 2026: [Fastify Swagger](https://github.com/fastify/fastify-swagger),
[Swagger UI plugin](https://github.com/fastify/fastify-swagger-ui),
[RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html),
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html),
[OpenTelemetry JS exporters](https://opentelemetry.io/docs/languages/js/exporters/),
[EIP-712](https://eips.ethereum.org/EIPS/eip-712).
