# Register application obligations

Connected applications can declare their expected actions, application-paid
services and gas sponsorship agreement after deployment. The provider reviews
these resources separately for each application through authenticated APIs.

Accepted action declarations constrain the off-chain payload accompanying contract
calls. Provider policy publications can further restrict those fields. Application
credentials can supply the RPC quorum used for chain verification and Safe
provisioning. Neither configuration acceptance nor an OAuth scope authorizes
spending: current user authority and durable attempt admission remain required.

Shared application Safe signing, application-managed submission services and
post-deployment sponsor provisioning are not implemented. Existing execution
infrastructure still requires deployment configuration.

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

Send action schemas to the declaration endpoints, not real user payloads or
credentials. A service's `credential_reference` names a credential belonging to
that application. It cannot name a provider environment variable. Vendor names
do not prove independent RPC verification. CDP wallet credentials remain provider
deployment settings and retain their provider billing responsibility.

## Store application RPC credentials

Configure `runtimeConfiguration.credentialKey` with an environment reference to a
retained 32-byte base64 encryption key. New-deployment setup generates this key
when the reference is present. Retain it with the private database containing encrypted credential records;
changing it without re-encrypting the records makes existing credentials unusable.

Applications use `PUT /v1/application/credentials/{reference}` with an
`Idempotency-Key`, `expected_revision` and `endpoint`. Endpoints must use HTTPS,
with no user information, query or fragment. A vendor key may appear in the path.
Use `endpoint: null` to revoke a credential. Metadata reads are available at
`GET /v1/application/credentials` and
`GET /v1/provider/applications/{applicationId}/credentials`; neither returns the
secret path. The provider must review each disclosed origin before accepting the
service declaration, including its network reachability and billing agreement.

Register two or three `rpc-verification` services with distinct endpoint origins.
The provider accepts the service declaration after reviewing the credential
metadata. Rotation or revocation resets the associated declaration to pending
review. With credential storage configured, verification and Safe provisioning
use these application endpoints and fail closed when they are missing, revoked
or unaccepted. They do not fall back to deployment RPC credentials. Submission
RPCs and other service types remain declarations only.

## Supply action payloads

Contract-call requests include `application_action` with `name` and `payload`.
For `wallet_sendCalls`, supply the same object through the top-level
`capabilities.applicationAction`. The payload contains only declared string
fields. Required fields must be present; every value must be a permitted enum.
Unknown actions, undeclared fields and out-of-enum values are denied. The
capability applies to the entire batch, not individual calls.

Once an action declaration exists, it must be accepted before contract calls can
proceed. An accepted empty action array disables action admission. Deployments
without an action declaration retain their existing published-policy behavior.
Provider `action_requirements` can narrow the accepted declaration's actions and
enums; they cannot widen it. Resource revisions bind to the consent snapshot, so
changed resources require fresh authority. Off-chain values remain application
attestations; the provider does not independently verify their factual truth.

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
