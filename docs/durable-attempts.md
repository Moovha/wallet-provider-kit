# Recover a request after a lost response

If a request times out, it may already have taken effect. Keep its original
request or batch ID and idempotency key, then inspect its saved outcome. Do not
create a fresh request just to get past an uncertain result.

## Find the original result

For an application connection, inspect the application list before creating
another registration. For access requests, read
`GET /v1/access-requests/{requestId}`. For transaction batches, use
`wallet_getCallsStatus` with the saved batch ID through the account’s
[wallet endpoint](wallet-calls.md). These reads still require current permission.

Retry an identical REST mutation only with its original idempotency key. For
`wallet_sendCalls`, keep the explicit inner `params[0].id` saved before sending;
that batch ID, rather than the HTTP header, identifies its replay. If the
result remains pending or unknown, keep the original records and ask the operator
to investigate. Do not clear records, reset budgets or invent another operation
to get past the uncertainty.

## How the provider preserves attempts

Before signing or infrastructure dispatch, the provider saves an immutable
attempt identity. A durable claim prevents duplicate dispatch, and replaying a
completed result requires a fresh check of current authority. A timeout leaves
the original payload and uncertainty intact.

For wallet operations, the provider retains the signed operation, hash,
submission anchor and receipt evidence. Reconciliation checks that exact identity.
Developers can read the [execution contract](user-operation-execution.md); operators
restoring a host should follow [maintenance](provider-maintenance.md).
