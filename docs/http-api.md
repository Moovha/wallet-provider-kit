# Application HTTP API

Read `GET /v1/access-policy`, establish application-led identity and consent, and obtain a current account grant. Provision the user Safe with `POST /v1/accounts/{accountId}/provision`. Discover its execution address and submit wallet JSON-RPC requests to `POST /v1/accounts/{accountId}/wallet`.

Use `wallet_sendCalls` for an atomic approved batch and `wallet_getCallsStatus` for durable status. Retain the returned batch ID. Status events report independently verified inclusion; acknowledgement alone does not establish success. See [wallet calls](wallet-calls.md) and the exact [HTTP schemas](http-reference.md).

Supply application OAuth credentials with the required scopes and an `Idempotency-Key` on mutations. A 401 requires current credentials; a 403 requires resolving current authority; a 409 requires reconciling the original request. A timeout or 503 does not prove that dispatch failed. Never retry with a fresh identity to bypass retained work.

## Try deployed APIs

Enable `http.documentation` to expose the same-origin explorer. It sends real requests to the configured service. Obtain a scoped application token and use a disposable test account with approved zero-value calls for acceptance.
