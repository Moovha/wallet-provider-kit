# Register application obligations

Connected applications can declare their expected actions, application-paid
services and gas sponsorship agreement after deployment. The provider reviews
these resources separately for each application through authenticated APIs.

This API currently stores declarations and provider decisions. It does **not**
activate execution, resolve service credentials, generate sponsor addresses or
provision a shared Safe. Accepted declarations are not enforced action policies.
Use the [runtime policy API](runtime-configuration.md) for the existing supported
policy enforcement. The shared application Safe execution path is not implemented.

## Authenticate each role

Enable `runtimeConfiguration` with an exact provider operator identity and connect
the application through the provider's existing application registration. Give
applications `wallet:configuration:read` and `wallet:configuration:propose` scopes.
Provider decisions require `wallet:configuration:write` and a separately configured
issuer, client ID and subject. A scope alone cannot confer provider authority.

Application endpoints derive the application from the authenticated issuer and
client ID; there is no caller-selected application ID. Provider endpoints use the
application ID returned by the existing runtime configuration API. Disabled or
unregistered applications are denied. The default unconfigured service returns
503 without storing declarations.

## Declare three resources

| Resource    | Application endpoint                          | Purpose                                                                                                                                             |
| ----------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions     | `PUT /v1/application/obligations/actions`     | Expected action names and descriptions, with required or optional off-chain fields and their permitted string enum values.                          |
| Services    | `PUT /v1/application/obligations/services`    | Application-paid RPC verification, submission or other service accounts, identified by vendor and an opaque application-local credential reference. |
| Sponsorship | `PUT /v1/application/obligations/sponsorship` | Network, funding agreement and proposed gas budget for a provider-controlled application Safe while user assets remain in individual wallets.       |

Each write requires an `Idempotency-Key` UUIDv4 and a body containing
`expected_revision` and `value`. Start at revision `"0"`. A successful write
increments that resource's revision and sets its decision to `pending`.
Concurrent writes against an old revision return 409.

For example, an action declaration describes the expected payload fields, not an
actual user's request:

```json
{
  "expected_revision": "0",
  "value": [
    {
      "name": "pay_invoice",
      "description": "Pay an invoice under the accepted application policy.",
      "fields": [
        {
          "name": "invoice_status",
          "required": true,
          "allowed_values": ["issued", "approved"]
        }
      ]
    }
  ]
}
```

Do not send real user payloads, credentials, RPC URLs or environment variable
references. A service's `credential_reference` is only an application-local name
for a secret-store entry. Registration neither reads that entry nor gives the
application access to provider secrets. Vendor names do not prove independent
RPC verification. CDP wallet backend credentials remain provider deployment
settings; these declarations do not transfer their billing responsibility.

Empty action or service arrays withdraw those declarations for review. Sponsorship
budgets must be positive unsigned 256-bit decimal values on the provider's network.
No balance check, gas transfer or blockchain transaction occurs during registration.

## Inspect and decide

Applications read their resources with `GET /v1/application/obligations`.
Providers use
`GET /v1/provider/applications/{applicationId}/obligations`.

Providers accept or reject each resource with
`POST /v1/provider/applications/{applicationId}/obligations/{resource}/decision`,
where `resource` is `actions`, `services` or `sponsorship`. Supply a UUIDv4
idempotency key and the current resource and decision revisions:

```json
{
  "expected_revision": "1",
  "expected_decision_revision": "0",
  "decision": "accepted"
}
```

A changed declaration requires a new decision. An exact retry returns its original
result, including after a later change; it never restores an earlier decision.
Reusing an idempotency key with different contents returns 409. Declarations and
retry receipts survive restart in the toolkit's existing private store.

Reads return `authorizes_spending: false` and `activates_execution: false` to
identify the authority of these records. These fields do not report the running
service's existing execution configuration. Provider acceptance is an agreement
record, not evidence that services work or that gas is available.

The bounded experimental registry permits 256 revisions per resource and 16
provider decisions per resource revision. Bodies are limited to 32 KiB, with
normalized declaration values limited to 24 KiB. Review the generated
[HTTP reference](http-reference.md) for field and collection limits.
