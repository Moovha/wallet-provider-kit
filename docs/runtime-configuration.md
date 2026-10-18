# Register application contracts and publish policies

The optional runtime configuration API stores application contract registrations
and provider policy revisions while the service remains running. Registered
applications submit proposals. A separately configured provider operator publishes
an accepted proposal or a replacement policy. Applications can read current and
historical revisions immediately, without rebuilding or restarting the service.

**Published policies are not yet consumed by signing or execution.** Registration
does not grant wallet access, broaden consent or enable financial operations.
Existing transfer and Safe policies retain their current enforcement and restart
behavior. Runtime claim requirements and value bounds are validated and stored;
they are not spending controls until financial integration is implemented.

## Configure the operator boundary

Add this optional section to your provider configuration before starting the
service. These are fictional identifiers:

```json
{
  "runtimeConfiguration": {
    "operators": [
      {
        "issuer": "https://issuer.example.test",
        "clientId": "provider-configuration-operator",
        "subject": "provider-configuration-service"
      }
    ]
  }
}
```

Use your configured OAuth issuer and a dedicated confidential operator client.
Its access token needs the provider API audience, exact issuer/client/subject
binding above and `wallet:configuration:write`. A connected application cannot
also be an operator client. Write scope alone does not confer operator authority.
The application-token GUI does not issue the operator write scope.

Applications must already be registered in `policy.applications`. Give them
`wallet:configuration:read` and `wallet:configuration:propose` API scopes through
your issuer. These configuration permissions are independent of owner grants.
The provider uses its existing RFC 9068 access-token validation. Never send
owner identity tokens, client secrets or wallet keys to these endpoints.

Enabling the control plane or changing trust roots, operator identities, backends,
chains or drivers remains startup/deployment configuration. Subsequent policy
publications need no restart. Wallet operations can remain disabled while using
the registry. Unconfigured optional endpoints return 503.

## Propose contracts and policy

Read `GET /v1/runtime-configuration` with `wallet:configuration:read`. It returns
your opaque `application_id`, `active_revision` and `authorizes_spending: false`.
Revision `"0"` means nothing has been published. The namespace is derived from
the authenticated issuer/client; applications cannot select another namespace.

Submit `POST /v1/runtime-configuration/proposals` with
`wallet:configuration:propose`, a new UUIDv4 `Idempotency-Key` and:

```json
{
  "expected_revision": "0",
  "policy": {
    "version": "1",
    "enabled": true,
    "chain_id": "eip155:84532",
    "contracts": [
      {
        "address": "0x1111111111111111111111111111111111111111",
        "code_hash": "0x1111111111111111111111111111111111111111111111111111111111111111",
        "methods": [
          {
            "signature": "customMethod(uint256,address)",
            "maximum_value_wei": "0"
          }
        ]
      }
    ],
    "maximum_calls": 4,
    "maximum_native_value_wei": "0",
    "max_validity_seconds": 120,
    "claim_requirements": [
      {
        "name": "country",
        "allowed_values": ["ZA"],
        "max_age_seconds": 3600
      }
    ]
  }
}
```

The address/hash are fictional. Register independently reviewed actual contracts.
Only Base Sepolia is accepted. The registry checks format; it does not call RPC
to certify code or business semantics. Optional `implementation` contains an
address and `code_hash` for a reviewed implementation pin; recording that pin is
not an upgrade-race guarantee.

Use canonical ABI signatures without `function`, argument names, return types or
whitespace: `transfer(address,uint256)`. The service derives selectors and rejects
duplicates/collisions within a contract. Addresses and array ordering are
normalized before canonical JSON hashing. Duplicate/zero addresses, unsupported
fields/versions and values outside uint256 fail. Per-method native value cannot
exceed the document limit; neither field bounds token allowances or unknown effects.

The response contains stable `proposal_id`, `application_id`, predecessor revision
and normalized policy/hash. Creation does not publish the proposal. An application
can read only its own proposal through
`GET /v1/runtime-configuration/proposals/{proposalId}`. A configured operator can
read it with write scope. Do not put personal evidence or beneficiary details in
registration documents.

## Publish and update without restart

After reviewing the exact proposal, the operator calls:

```http
POST /v1/runtime-configuration/proposals/{proposalId}/publish
Authorization: Bearer <operator-access-token>
Idempotency-Key: <new-uuid-v4>
Content-Type: application/json

{"expected_revision":"0"}
```

The publication stores immutable revision `"1"`, its predecessor, canonical policy
hash, publication time and a pseudonymous authenticated operator reference.
Current-policy reads immediately return it. For provider-authored changes, send
the complete policy-change shape above to:

```http
POST /v1/runtime-configuration/applications/{applicationId}/revisions
```

Read the current application document as an operator through
`GET /v1/runtime-configuration/applications/{applicationId}` before updating it.
Use the current `expected_revision`. `policy.enabled: false` publishes a disabled
document; registry state does not itself suspend a wallet/grant or revoke issued
signatures. Applications can propose changes but cannot publish them.

Stale proposals/updates return 409. Read the latest policy, review changes and
submit a new proposal against that revision. Do not refresh a stale predecessor
automatically without reviewing its terms.

## History, retries and storage

Read `GET /v1/runtime-configuration/revisions/{revision}` for your application's
immutable snapshot and the current active revision. Rollback publishes a new
revision containing reviewed earlier terms. There is no history deletion, head
rewind or automatic modification of stored financial actions.

Reuse the original idempotency key and unchanged request after transport loss.
Keys are scoped by authenticated issuer/client/subject, command and resource.
Changed content conflicts. A retry after later publications returns the original
receipt and does not reactivate its old revision.

The single-host SQLite v1 store retains registry data in its existing JSON
deployment binding and audit records; no SQL migration is installed. Transactions
check active deployment and service-authentication revisions, fencing superseded
processes. Include this state in protected backups and single-active-host recovery.
Offline tests are not production database/provider acceptance.

Documents are limited to 24 KiB, 32 contracts, 32 methods per contract, 16 claim
requirements and 16 calls. The experimental registry retains at most 256 proposals
and 1,024 publications per application; reaching a limit returns conflict. There
is no automatic pruning or retention migration. Establish supported capacity and
retention before enterprise adoption.

## Financial integration release gates

The next milestones must bind revisions to owner consent, exact prepared actions
and current dispatch checks; enforce evidence provenance/freshness and shared
exposure limits; and carry immutable snapshots into the independently verifying
executor. Operator GUI controls, wallet-call adapters and actual test-network/
recovery acceptance remain pending. Registration/publication alone passes none
of these financial gates. See the [enterprise standards record](v1-standards.md).
