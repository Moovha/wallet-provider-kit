# Enterprise v1 standards and compatibility decisions

This decision record defines the implemented foundation, extension boundaries and
release gates for an enterprise v1. It is not a production release declaration.
The package remains experimental. Standards status was checked against the linked
primary specifications on 16 October 2026; a final standard does not establish
implementation support or security certification.

The deployment baseline is one active host with local SQLite and a tested passive
recovery target. Applications use provider-authorized immutable actions, one
durable execution identity and separately verified chain evidence. The
[execution guide](execution.md) defines the supported transfer flow.

## Support decisions

| Standard or contract                                                                                                                                                                                | Decision and current support                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [ERC-3009](https://eips.ethereum.org/EIPS/eip-3009)                                                                                              | Implemented for exact Base Sepolia EOA `TransferWithAuthorization` token transfers. Domain, digest and recovered owner are checked. Nonce and validity are token authorization semantics, not OAuth authority. No arbitrary signing.                                                                              |
| [CAIP-2](https://chainagnostic.org/CAIPs/caip-2), [CAIP-10](https://chainagnostic.org/CAIPs/caip-10)                                                                                                | Chain/account identifiers are explicit in stored approved actions. Current service execution remains fixed to `eip155:84532`; identifiers do not imply multi-chain support.                                                                                                                                       |
| [OpenAPI 3.0](https://spec.openapis.org/oas/v3.0.3.html)                                                                                                                                            | Implemented service contract generated from route schemas. Swagger shows every implemented route and its availability. The orchestration draft remains a separate unimplemented contract.                                                                                                                         |
| [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html) and [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)                                                                                 | JWT access-token validation and short-lived bearer tokens are implemented. The OAuth security BCP is the security baseline for deployment review, not a claim of full issuer/client conformance. Current owner, KYC, consent, grant and attempt checks remain mandatory beyond scopes.                            |
| [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)                                                                                                              | Implemented execution-observation envelope and authenticated bounded pull feed. Event type and data revision are explicit. The envelope alone provides neither authenticity nor finality.                                                                                                                         |
| Ethereum [execution JSON-RPC](https://github.com/ethereum/execution-apis), EIP-1559 transactions and Base [finality stages](https://docs.base.org/specifications/transactions/transaction-finality) | Read-only verification checks exact transaction, receipt, token effects, canonical block and safe/finalized progress across independently operated RPC sources. Trusted-node agreement is not light-client proof. Relayer acceptance is separate from settlement.                                                 |
| [EIP-5792](https://eips.ethereum.org/EIPS/eip-5792) — Final                                                                                                                                         | Preferred future wallet-facing batching, capability and status interface. Not implemented. A dedicated adapter must map batch semantics, ordering, atomicity and errors without weakening provider approval. The REST execution API does not claim EIP-5792 conformance.                                          |
| [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) — Final; [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) — Final                                                                            | Future smart-account and sponsorship profiles, not a transparent upgrade of EOA transfers. Require explicit EntryPoint/delegate versions, account implementation, bundler/paymaster trust and cost limits, account-bound signatures, simulation, per-user-operation receipts and recovery tests. Not implemented. |
| [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) — Final                                                                                                                                         | Future contract-signature validation when the consuming token/protocol supports it. Current EOA recovery is not ERC-1271 support; a smart account cannot be substituted silently.                                                                                                                                 |
| [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) — Final                                                                                                                                         | Future vault interface profile. Requires exact asset/vault binding, share/minimum-output bounds, deadlines, simulation and verified deposit/withdraw effects. Token-transfer finality alone cannot prove a vault operation. Not implemented.                                                                      |
| [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612) — Final                                                                                                                                         | Separate allowance/permit profile if a product needs it. A permit is approval to spend, not proof of transfer; do not replace the direct ERC-3009 flow with broad allowances by default. Not implemented.                                                                                                         |
| [ERC-7710](https://eips.ethereum.org/EIPS/eip-7710), [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715), [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579) — Draft                               | Track for delegated permission and modular-account adapters. Do not freeze draft payloads into enterprise spending authority or advertise support before exact versions and revocation/replay behavior are accepted. Not implemented.                                                                             |

For contract-mediated deposits, ERC-3009 describes `receiveWithAuthorization`
which binds the recipient to the caller and avoids a wrapper front-running
hazard. The current profile implements `transferWithAuthorization` for direct
transfers only. A future deposit adapter must select the appropriate contract
entrypoint and verify the resulting business effect separately.

## Freeze contracts before enterprise deployment

The implemented execution profile is selected with both `Execution-Profile` and
`Execution-Profile-Revision` headers. Unsupported selections are rejected;
requests cannot silently fall back to another execution or finality policy.
Discovery lists profile IDs and revisions as strings so clients can ignore
unknown future profiles. A client must explicitly select a supported profile and
understand all its status values before enabling spending.

Revision 1 fixes the request shape, status meanings, chain, EOA signature format,
receipt verification and CloudEvents data. A change to those semantics requires
a separately selectable revision/profile and a migration plan. Stored attempts
keep their original plan and revisions; upgrades must never rebuild a dispatched
plan or reinterpret an unknown attempt as undispatched. Configuration changes
fence superseded service instances on the same database and may invalidate access
or pending work. Plan drained maintenance windows rather than assuming live
mixed-version operation is supported.

The service version and profile revision are different contracts. Freeze and
retain released OpenAPI/configuration schemas, event schemas, compatibility
fixtures and changelogs with each accepted release. Test an older client against
an upgraded server, and test backup/restore of every supported stored version.
Schema compatibility tests must reject breaking changes before publication.
No long-term support interval or migration support is promised by the current
experimental package; establish those obligations before an enterprise v1 release.

## Authentication work required for enterprise v1

RFC 9700 recommends preventing token replay with sender-constrained access tokens.
For controlled enterprise server clients, prioritize
[RFC 8705 mTLS-bound tokens](https://www.rfc-editor.org/rfc/rfc8705.html); add
[RFC 9449 DPoP](https://www.rfc-editor.org/rfc/rfc9449.html) where certificate
provisioning is unsuitable. Select the required deployment profile before
enterprise acceptance rather than treating ordinary bearer tokens as equivalent.

Neither proof mechanism is implemented by this resource server. It rejects tokens
containing `cnf` instead of accepting a bound token without verifying possession.
A future implementation must verify the certificate/key binding end to end,
handle trusted TLS termination, key rotation and replay state, and test method/URL
binding, clock skew, nonces and proof reuse as applicable. An arbitrary forwarded
certificate header or the presence of a DPoP header is insufficient.

[RFC 9396 authorization details](https://www.rfc-editor.org/rfc/rfc9396.html)
can provide an interoperable issuer-facing description of fine-grained consent.
They must map to current server-owned immutable action and grant records; token
claims alone cannot become spending authority. This mapping is not implemented.
Likewise, adopting [RFC 9457 problem details](https://www.rfc-editor.org/rfc/rfc9457.html)
would need a versioned error contract; the current sanitized error envelope and
`outcome` retry semantics remain authoritative for existing clients.

## Release gates beyond offline conformance

Before declaring enterprise v1, record evidence for all of these gates:

- Real staging acceptance of each pinned wallet backend, token, Relayer API
  version and RPC operator pair, including fee policy and proxy-upgrade behavior.
  Mocks cannot certify a vendor or establish production custody suitability.
- A sender-constrained authentication profile, threat-model review and independent
  security assessment covering signer control, credential rotation, replay,
  delegated limits and loss/revocation of already-issued authorizations.
- Tested external fencing and passive-host failover with defined recovery-time
  and recovery-point targets. Reconcile effects absent from a stale backup before
  reactivation; preserve attempts, nonces, reservations and event cursors.
- Capacity/latency measurements for local SQLite, RPC polling and retention, plus
  encrypted backups, monitoring, on-call procedures and protected audit export.
  The bounded event feed cannot replace the enterprise accounting ledger.
- A released compatibility policy, support period, reproducible build/SBOM,
  dependency patch process, verified migration/rollback procedure and a staging
  rehearsal using real customer integration contracts.

Limited maintenance windows increase the need for a supported patch and recovery
process. No selection of blockchain standards removes the need to rotate
credentials, patch dependencies or respond to protocol and token changes.
Application deployment, mainnet enablement and package publication require their
own acceptance and authorization.
