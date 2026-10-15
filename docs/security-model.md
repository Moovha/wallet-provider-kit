# Security model

Your deployment connects an untrusted HTTP caller, a token issuer and its public
JSON Web Key Set (JWKS), your authorization store, a signing provider, an operator
and a monitoring backend. Each has a different trust role. A compromised token issuer and a
compromised signing provider create separate risks; OAuth scopes never replace
current owner, grant and consent checks.

Anyone with backend signing credentials may control the wallet. Explain that
control and recovery model to your users. The kit doesn't establish end-user
self-custody or hardware security module (HSM) attestation.

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

Live custody/account recovery, an external security audit, penetration testing,
SOC2 certification and on-chain settlement remain unverified. Before enabling
production operations, complete the relevant [acceptance checks](conformance.md).
Any database schema change must use verified current schema evidence and receive
explicit approval; this repository has no production schema or migration.
