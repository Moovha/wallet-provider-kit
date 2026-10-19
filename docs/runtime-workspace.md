# Manage applications through protected APIs

Application configuration is available through the provider API and its deployed
Swagger explorer at `/docs/`. There is no separate operator workspace.

Configure `runtimeConfiguration` with the exact provider operator issuer, client
ID and subject. Applications use their own registered identities with
`wallet:configuration:read` and `wallet:configuration:propose`. Providers use a
separate identity with `wallet:configuration:write`. Scopes alone never confer
provider authority. Keep provider credentials separate from application credentials.

## Inspect application configuration

Use `GET /v1/applications/configurations` to list enabled application
configurations. Application callers see only their own namespace; provider
operators see enabled registrations. Supply `application_id` to include that
application's active policy, latest 20 proposals and latest 20 publications.
An application cannot select another application's namespace.

Use the [policy API](runtime-configuration.md) to propose contracts and methods,
inspect immutable revisions, publish a reviewed policy and select automatic or
manual contract review. Publication requires current user consent before new
financial effects. Automatic review accepts only contract changes within unchanged
provider terms; it does not delegate provider policy or spending authority.

The [application obligations API](application-obligations.md) separately stores
expected off-chain action fields, application-paid service declarations and gas
sponsorship agreements. Those records do not currently activate execution or
provision the shared application Safe.

## Configure optional policy adapters

Provider operators publish reviewed `call_adapters` through the policy API.
Application proposals cannot silently change provider-controlled adapter terms.
See [approved contract calls](approved-contract-calls.md) for token, swap and vault
adapter limits, cumulative budgets and the effects each supported adapter verifies.
Contract registration alone does not establish a business outcome.

## Track wallet batches

Use `GET /v1/wallet/batches` to inspect up to 100 readable batches. The response
indicates truncation and distinguishes queue state from retained finalized
RPC-quorum receipts. Refresh individual `wallet_getCallsStatus` results for current
observations. Listing does not sign, submit, retry or cancel an operation.

Applications need `wallet:execute:read` and current owner account-read access.
Provider operators may inspect the ledger with configuration-write scope and their
exact configured identity. Provider ledger access does not impersonate a user or
authorize spending. See [wallet calls](wallet-calls.md).

## Migrate existing clients

The standalone `/operator/` shell and its assets are removed. Replace
`GET /v1/runtime-configuration/workspace` with
`GET /v1/applications/configurations`, and
`GET /v1/runtime-configuration/batches` with `GET /v1/wallet/batches`.
The old routes return 404. Existing policy proposal, revision, publication and
review endpoints retain their contracts. The former workspace's browser-only
ABI discovery forms are no longer bundled; applications must supply reviewed
method signatures and code pins through the policy API.

This API reorganization does not migrate user-owned Safes into shared application
Safes. Existing account identities and durable financial attempts retain their
original meaning. No wallet or service credential is moved by reading or updating
configuration records.
