# Security model

Trust boundaries are the untrusted HTTP caller, OAuth issuer/JWKS, host authority
store, signing provider, deployment operator and observability backend. Provider
and issuer compromise are separate risks; scopes never substitute for current
owner/grant/consent checks. Operators with backend signing credentials may control
keys. No self-custody or HSM attestation is implied.

| Threat                                  | Implemented control                                                                                     | Remaining host obligation                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cross-tenant account/signing access     | Verified issuer/client/subject context; core owner/KYC checks; HTTP denial tests                        | Durable client-bound grant/object lookup and revocation            |
| Forged/ID/expired tokens                | Maintained jose verifier, exact issuer/audience, access-token type, algorithm and lifetime restrictions | Secure IdP registration, keys and revocation policy                |
| Arbitrary signing/body policy injection | Only stored action ID; empty strict mutation body; digest/address/revision validation                   | Immutable reviewed plan, consent and action storage                |
| Duplicate or uncertain dispatch         | Required idempotency context, preserved vendor attempt ID, no automatic mutation retries                | Transactional admission, lease, result journal, reconciliation     |
| Stale KYC/grant                         | Recheck authority per operation; exact stored KYC match required                                        | Real read consistency, revocation and native proof checks          |
| Credential/payload disclosure           | No request logging, sanitized errors, allowlisted metrics, bounded responses, fixed vendor host         | Secret store, proxy/collector configuration, staff access controls |
| Mainnet/unsupported account use         | CDP admits only tested Sepolia EOA action profile                                                       | Independent acceptance before new chains/account types             |
| Monitor outage or compromise            | Optional bounded OTLP export; no authority in dashboard                                                 | Audit persistence separate from telemetry; monitoring RBAC         |

No live custody/account recovery test, external security audit, penetration test,
SOC2 certification or on-chain settlement proof has been completed by this repo.
Do not enable production operations until the relevant conformance gates pass.
Database DDL must be based on verified current schema and explicitly approved;
this repository contains no production schema or migration.
