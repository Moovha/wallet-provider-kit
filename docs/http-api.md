# Use the provider HTTP API

This is the toolkit's **provider-hosted** API. Use a base URL chosen by the
adopting wallet provider. It is distinct from Moovha's planned business-operation
API; see [the application/provider boundary](architecture.md#applications-and-wallet-control). The
[generated schema reference](http-reference.md) records all implemented request
and response schemas. Swagger UI is available at `/docs/` by default.

For a complete runnable request sequence without credentials, use the
[integration example](integration-example.md). The snippets below show a real
integration's request shape; their tokens and IDs are placeholders.

## Authentication and profiles

Send `Authorization: Bearer <access-token>` for protected routes. Use a dedicated
provider audience and the configured trusted issuer. Scopes admit the request to
host policy; current owner/grant/consent/KYC and exact-action authority still apply.

| Method and path                                 | Required scope        | Required configured profile                                                            |
| ----------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `GET /v1/capabilities`                          | None                  | None; `configured` reflects readiness                                                  |
| `POST /v1/accounts/{accountId}/provision`       | `wallet:provision`    | Financial host or accepted onboarding/enrollment host                                  |
| `POST /v1/actions/{actionId}/sign`              | `wallet:sign`         | Financial host with stored-action authority/journal; bundled onboarding denies signing |
| `POST /v1/access-requests`                      | `wallet:access`       | Onboarding                                                                             |
| `GET /v1/access-requests/{requestId}`           | `wallet:access:read`  | Onboarding                                                                             |
| `POST /v1/access-requests/{requestId}/identity` | `wallet:access`       | Onboarding, owner consent and agreed vendor policy                                     |
| `GET /v1/accounts/{accountId}`                  | `wallet:account:read` | Onboarding with current `account:read` grant                                           |
| `POST /v1/enrollments`                          | `wallet:enroll`       | Lower-level enrollment                                                                 |
| `POST /v1/enrollments/{enrollmentId}/identity`  | `wallet:enroll`       | Lower-level enrollment                                                                 |
| `GET /v1/enrollments/{enrollmentId}`            | `wallet:enroll:read`  | Lower-level enrollment                                                                 |

Optional routes appear in OpenAPI even when unavailable. Choose onboarding or
enrollment, not both. Hosted `/onboarding/*` login/consent/review pages are
browser interactions described in the [onboarding guide](onboarding.md), not
service-token signing shortcuts.

## Provision an account

The account ID must already be reserved and bound to the owner by your host.
Send an empty JSON object, not an address, user status or key material:

```http
POST /v1/accounts/10000000-0000-4000-8000-000000000001/provision HTTP/1.1
Authorization: Bearer <provider-audience-access-token>
Content-Type: application/json
Idempotency-Key: 10000000-0000-4000-8000-000000000002

{}
```

A successful response is 200 with `account_id` and `address`. Both first success
and authorized replay use 200. It doesn't grant permission to sign or spend.
For uncertain creation, look up the same reserved account through the host's
read-only backend recovery; this HTTP profile has no generic recovery endpoint.
An absent lookup result isn't proof that the first effect never happened.

## Sign an approved stored action

The host must already have stored and approved the immutable action, exact
account/payload/revisions, current consent and durable attempt. The caller supplies
only its action ID:

```http
POST /v1/actions/10000000-0000-4000-8000-000000000003/sign HTTP/1.1
Authorization: Bearer <provider-audience-access-token>
Content-Type: application/json
Idempotency-Key: 10000000-0000-4000-8000-000000000004

{}
```

A successful 200 response contains `signature`, a 65-byte EOA hex signature
including its `0x` prefix. The journal wrapper verifies the returned signature
against the exact digest/account before completing. The HTTP route itself doesn't
create or approve actions, broadcast transactions, fund gas or settle an operation.
Do not put returned signatures into application logs.

## Idempotency and validation

All documented POSTs require a lowercase UUIDv4 `Idempotency-Key`; path IDs use
the same UUIDv4 syntax. Keep the same key for the same request. Your host binds it
to environment, issuer/client, owner, method and resource, then preserves the
provider attempt ID across retries. Reusing a key for different work conflicts.
A new key cannot override a pending/unknown action or bypass resource uniqueness.

Provision/sign bodies must be `{}`; additional fields are rejected. Other route
bodies are defined in the generated reference. JSON validation doesn't coerce
types, fill defaults or discard unrecognized fields. The default body limit is
1 KiB; enrollment identity submission has its own bounded limit.

## Problems and client decisions

Errors use `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Service Unavailable",
  "status": 503,
  "code": "wallet_provider_unavailable",
  "request_id": "<server-generated-correlation-id>",
  "outcome": "unknown"
}
```

`outcome` is optional. HTTP/auth/schema failures may omit it. It describes dispatch
certainty, not settlement. `request_id` is a troubleshooting correlation field,
not an attempt ID or permission. Keep it in controlled diagnostics rather than
logging request bodies, authorization headers or raw URLs.

| Status          | Typical code                                               | What to do                                                                                                  |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 400 / 413 / 415 | `invalid_request`                                          | Fix schema, body size or content type                                                                       |
| 401             | `invalid_token`                                            | Obtain an appropriate access token from the trusted issuer                                                  |
| 403             | `insufficient_scope`, `wallet_authorization_denied`        | Obtain required access or owner approval; don't retry a denied spend automatically                          |
| 409             | `wallet_attempt_conflict`, `wallet_attempt_pending`        | Correct request identity or inspect the original pending attempt; don't generate a fresh financial identity |
| 422             | `wallet_provider_input`, `wallet_identity_invalid`         | Correct host action/evidence/profile compatibility                                                          |
| 429             | `rate_limited`                                             | Respect service quotas; financial budget/admission remains separate                                         |
| 500             | `internal_error`                                           | Investigate host/storage failure; don't infer that no effect occurred                                       |
| 503             | `service_unavailable` or a provider/attempt/identity error | Inspect readiness and `outcome`; reconcile unknown work read-only                                           |

The server maps even an explicit `wallet_provider_rejected` failure to 503 with
`outcome: rejected`. Don't treat every 503 as a transient error eligible for an
automatic mutation retry. Error middleware preserves no raw upstream error text.

## Health and discovery

- `/health/live`: 200 means the process is running.
- `/health/ready`: 200 means the supplied dependency check passed; otherwise 503
  with `status: unconfigured`. Fixture readiness is not production acceptance.
- `/v1/capabilities`: public `profile: provider-signing-preview`,
  `status: experimental` and `configured`. It isn't a per-account capability matrix.
- `/openapi.json`: the implemented OpenAPI 3.0.3 contract, including optional-profile
  routes. The separate orchestration draft isn't served as implemented routes.

Health/docs routes are hidden from the generated application OpenAPI. Disabling
Swagger UI doesn't disable `/openapi.json`. Application API responses use `cache-control: no-store`. The service doesn't trust arbitrary forwarded client-IP headers; place
it behind a reviewed TLS and ingress boundary for a real deployment.
