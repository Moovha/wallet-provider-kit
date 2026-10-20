# Register application obligations

Connected applications can declare their expected actions, application-paid
services and gas sponsorship agreement after deployment. The provider reviews
these resources separately for each application through authenticated APIs.

Accepted action declarations constrain the off-chain payload accompanying contract
calls. Provider policy publications can further restrict those fields. Application
credentials supply the RPC pool used for chain verification and Safe
provisioning. Neither configuration acceptance nor an OAuth scope authorizes
spending: current user authority and durable attempt admission remain required.

New OWS wizard deployments use one Safe per user with a private signer, an
application-owned paymaster and a private bundler. Follow
[Safe-only sponsorship](self-hosted-sponsorship.md) for its funding and provisioning
sequence. No funded accounts or application RPC credentials are needed to export
the initial deployment.

The explicit compatibility profile `runtimeConfiguration.sharedApplicationSafes`
uses a configurable pool, defaulting to five provider-controlled Safes and five
gas sponsors per application. Its application operator can configure counts before
provisioning through the execution-pool endpoints. The provider retains signing
authority while users retain assets in their individual wallets. The shared-Safe
provisioning instructions below describe that compatibility profile.

A complete [application profile example](provider.config.application.example.json)
shows the prebundled infrastructure and empty application resources.

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

Shared application Safe deployments default to `runtimeConfiguration.rpcVerification:
"single"`. One accepted RPC performs each complete verification, including chain
identity, canonical receipt, transaction and expected effects. Shared deployments
prefer responsive healthy endpoints using an exponentially weighted moving average
of successful RPC read times and concurrent operation count. Idle alternatives
receive a probe opportunity after thirty seconds. Throttling, timeouts and transient server errors
temporarily exclude an endpoint and restart the complete read on another endpoint.
Malformed proofs and policy failures do not authorize fallback. One endpoint is
sufficient; supply up to three to share load and recover from outages. Verification
evidence reports `rpc-single` and the public origin used, without the credential.

Submission traffic selects from the accepted endpoints between transactions.
Each transaction uses one healthy endpoint through nonce selection and broadcast.
If that endpoint enters availability backoff, reconciliation installs another
healthy source while retaining the transaction's signed bytes and nonce.
An endpoint reporting a nonce below verified consumption or insufficient payer
funds is skipped before admission. The Relayer retains the transaction nonce and
retry lifecycle. Raw transaction retries retain the signed bytes. Funding retries broadcast the same
retained signed bytes on another endpoint; they never create a replacement payment.
If every endpoint is unavailable, bounded queues apply backpressure.
An unchanged source and gas policy do not trigger another native relayer
reconfiguration. Every new transaction still freshly checks that source's chain,
payer nonce and quoted funding requirements before admission.

Set `rpcVerification: "quorum"` to require agreement from two or three configured
sources. Existing deployments without shared application Safes retain this default.
Single-source verification trusts the selected RPC operator; it does not establish
agreement between independent operators.

Shared application execution, new shared Safe deployments and gas-routing transfers
price new transactions from `eth_feeHistory`: the next block's base fee and the
median of the last five blocks' 75th-percentile priority fees. The offered maximum
is twice that base fee plus the quoted tip. Safe simulations and payer balance
checks use those quoted transaction prices plus the configured L1 reserve.
Accepted gas limits are spending
safeguards, rather than fixed offered prices; optional headroom can be reduced to
fit them, but the service never clips below the current base fee plus the tip.
Insufficient fee allowances pause unsigned work. Quotes are retained in immutable
plans. Network-priced signing requires the fee-only Relayer capability before
releasing a signature. The bundled provider disables autonomous fee changes;
funding retries preserve the original signed transaction. The Base L1 data-fee
reserve remains a separate configured allowance.

Update fee safeguards through the sponsorship declaration and provider decision
endpoints, then publish the policy and refresh affected user consent. Retained
Safe and sponsor identities stay unchanged. A Relayer policy change waits until
its older signed transactions have verified inclusion, preventing a new ceiling
from repricing an uncertain transaction. Existing per-user and designated-executor
profiles retain their configured pricing and replacement contracts.

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
RPCs use one to three accepted `rpc-submission` services. The private local
Relayer receives that application's endpoints before submission or simulation;
missing or revoked credentials deny the request. Other service kinds can be
registered for review, but require a supported adapter before use.

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

You can include optional `gas_limits` in sponsorship declarations to bound the
transaction gas, EIP-1559 fee caps and Base L1 data-fee reserve. For example:

```json
{
  "gas_limit": "1000000",
  "max_fee_per_gas": "10000000",
  "max_priority_fee_per_gas": "1000000",
  "l1_fee_reserve_wei": "1000000000000"
}
```

These decimal values use gas units for `gas_limit` and wei for fee fields. They
are example ceilings, not current network fee quotes. The lifetime budget must
cover at least `gas_limit × max_fee_per_gas + l1_fee_reserve_wei`. Review the
actual deployment and call simulation before accepting limits. If omitted, the
service uses its documented default sponsor gas settings. Small agreement records
remain readable, but sponsor creation denies a budget below that minimum before
creating a key or calling the Relayer. Accepted gas settings become part of the
retained sponsor identity; changing them requires an infrastructure migration.

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

## Prepare gas sponsorship and the shared Safe

Complete these steps after the application connects:

1. The application stores its verification and submission RPC credentials and
   declares its services, expected actions and sponsorship agreement.
2. The provider reviews each resource and publishes the application policy. Shared
   Safe policies require manual publication; automatic contract acceptance is disabled. For
   every shared-Safe method, set `user_address_parameters` to the zero-based ABI
   indices of the individual wallet addresses that control whose assets or
   authority the method uses. Each designated parameter must be a direct `address`
   and match the currently authorized user's wallet. Review the actual contract
   semantics and code pins; the toolkit cannot infer business meaning from a name.
3. The provider calls
   `POST /v1/provider/applications/{applicationId}/sponsorship/provision` with an
   empty object and UUIDv4 `Idempotency-Key`. This prepares an application-specific
   gas signer and relayer, returning `funding_address`. It does not transfer funds.
4. The application reads `GET /v1/application/safe` and arranges funding of the
   returned `funding_addresses` on the returned `chain_id`. The response's
   `funding_requirements` gives each sponsor's `minimum_balance_wei`, accepted
   `gas_limits` and `maximum_gas_budget_wei`. The minimum is one transaction's
   admission reserve; allow for deployment gas already spent before submitting
   later operations. A lifetime budget is an authorization ceiling, not a balance.
   The provider can inspect the same state with `GET /v1/provider/applications/{applicationId}/safe`.
5. With wallet operations activated, the provider calls
   `POST /v1/provider/applications/{applicationId}/safe` with an empty object and
   UUIDv4 key. Independent application RPCs must agree that the sponsor has enough
   gas before the backend creates the retained Safe owner key. Deployment uses the
   accepted application sponsor. Repeat the request to reconcile retained
   provisioning until the status is `ready`. Authenticated provider and wallet APIs
   allow up to sixty seconds for response work and retained reconciliation; a transport timeout still
   requires reading retained state and retrying the original request. Uncertain
   attempts keep their original identities and transaction plans.
6. Users obtain individual wallet grants and consent to the current application
   terms. Submit user-bound contract calls with the required `application_action`.
   The provider rechecks user authority, current policy and immutable attempts
   before signing and dispatch. Users receive stable assignments across the Safe pool, with one nonce queue per
   Safe. Grants, accounts and consent remain individual.

Shared calls require zero native value and explicit user-address mappings. The
Safe does not acquire authority over an individual wallet merely by being deployed.
A reviewed target contract must enforce the intended user authorization or existing
asset approval. Safe-funded token, swap and vault request builders are not enabled
by this shared profile. Do not pool user assets in the application Safe.

Sponsor identities, gas limits and funding agreement are retained across restarts.
Provisioning does not overwrite a signer or replace an uncertain resource. Changing
an established funding agreement or budget requires an explicit infrastructure
migration; rejecting the declaration immediately stops new authorized effects.
Previously signed or broadcast transactions cannot be recalled by policy changes.

The local engine uses the pinned OpenZeppelin Relayer 1.8.0
[signer and relayer API](https://github.com/OpenZeppelin/openzeppelin-relayer/blob/v1.8.0/openapi.json).
Per-relayer [custom RPC configuration](https://docs.openzeppelin.com/relayer/1.8.x/configuration)
keeps submission billing with the application. The deployment's default RPC is an
unconfigured placeholder, not a provider-paid fallback. Keep encrypted sponsor
keys, application credentials and the retained database together in protected backups.

## Parallel execution

Configure and provision [Safe and sponsor pool members](safe-queue-and-sponsor-pools.md#configure-shared-application-pools-and-overload-limits)
for applications serving concurrent users. User assignments remain stable, and
all sponsors share the same accepted application gas allowance. Read the user’s
assigned sender from `GET /v1/accounts/{accountId}/wallet`; the application-wide
Safe read lists infrastructure and does not select the sender for every user.

## Fund the sponsor pool through one address

`GET /v1/application/gas-funding` returns the stable application funding address,
configured sponsor count and initial native-gas funding estimate. Every indexed
sponsor provisioning response returns that same address. The internal funding
worker distributes gas only to the application's retained sponsors, using a
separate EOA nonce lane. Routing fees share the accepted lifetime gas allowance.
Fund this address on the declared chain; pool members do not require individual
funding operations. The application still supplies and pays for its accepted
verification and submission RPC services through encrypted credential registration.

Choose pool counts with `PUT /v1/application/execution-pool` before provisioning.
Counts cannot be changed after a sponsor or Safe has been retained. Existing pool
addresses and signed actions require a reviewed migration when capacity changes.

### Explorer observation services

The optional service kind `rpc-observation` supplies an auxiliary Etherscan V2
read endpoint for the Safe-only execution profile. Store its complete URL through
the encrypted application credential endpoint, then reference that credential in
the accepted services obligation. The permitted URL is
`https://api.etherscan.io/v2/api?chainid=84532&apikey=YOUR_KEY` for Base Sepolia
or chain ID `8453` for Base. Credential responses expose only the origin and
revision. The auxiliary chain must match the application's execution chain, and
regular RPCs plus auxiliary endpoints may total at most three. This service
participates in compatible canonical block reads; it cannot replace a simulation
or submission RPC. Changing services requires provider acceptance and renewed
policy/consent bindings through the normal configuration flow.
