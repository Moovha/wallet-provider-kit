# Send transactions and check their progress

This page is for the application developer. First obtain the person’s
[current permission](application-access.md) and have the provider accept your
[transaction rules and fee agreement](application-obligations.md). Keep the request
and batch IDs so you can check progress after a lost response.

## Send an approved batch

The account-scoped `POST /v1/accounts/{accountId}/wallet` endpoint implements EIP-5792 version `2.0.0`: `wallet_sendCalls`, `wallet_getCallsStatus` and `wallet_getCapabilities`. The headless service returns `4200` for `wallet_showCallsStatus`; a client adapter may display status locally.

Every request requires `wallet:access:read`. Sending also requires `wallet:actions`, `wallet:sign`, `wallet:execute` and current `contracts:request` owner consent. Status/discovery require `wallet:execute:read`; retained status also checks current `account:read` authority.

The sender is the current user Safe. An explicit `from` must match it. Submit an atomic batch using the configured chain ID, exact calls and registered `applicationAction` capability. Unknown required capabilities, changed calldata and unregistered actions fail closed. The initial response retains a batch ID before chain execution.

## Show progress honestly

Poll using the same batch ID or consume account-scoped events. A `200` wallet status indicates independently verified success, while finality and business settlement remain separate. Keep the original mutation idempotency key on retries. See [HTTP schemas](http-reference.md) for transport details and [Safe execution](user-operation-execution.md) for reconciliation.

Next, [test the connection](staging-walkthrough.md), including retries and revoked access.
