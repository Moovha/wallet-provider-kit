# Register application contracts and publish policies

Applications may need to register additional contracts without a service restart.
Enable runtime configuration in [Policies](setup-wizard.md#_4-policies) to let
registered applications propose methods and separately authorized provider
operators publish versioned policies. The [runtime workspace](runtime-workspace.md)
offers forms for this task. This guide describes its API, revision rules and
optional financial authority so your application developer can implement the same flow.

Application-led providers can opt into runtime contract authority for the existing
Base Sepolia Safe 1.4.1 execution mechanism. Published targets, methods, native-value
limits and application-attested claim requirements then govern consent, action
preparation, signing and designated execution. Registration alone grants no wallet
access or spending authority. Without the explicit financial opt-in, the registry
remains a configuration-only service and existing startup policies keep their behavior.

Use the [runtime workspace](runtime-workspace.md) for contract registration,
policy review/publication and batch tracking through forms. Providers explicitly
allow automatic contract/method acceptance per application; provider requirements
remain controlled by the published policy. The setup wizard can configure the
operator boundary without editing JSON.

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
document. In runtime financial mode, publication immediately invalidates financial
consent for earlier revisions; a disabled document stops new financial effects.
It cannot revoke issued signatures. Applications can propose changes but cannot
publish them.

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

## Use registered contracts for consent and execution

Configure both services once before enabling runtime financial use:

- On the wallet, use application-led access, a reviewed `assertionTrust` agreement,
  `approvedCalls`, `execution.profile: "approved-evm-executor-v1"` and
  `runtimeConfiguration.authorizeContracts: true`. Register `contracts:request`
  in the application's permitted owner delegations.
- On the designated executor's selected provider, set `runtimeContracts: true`
  alongside `contractCalls`. Changing this immutable provider configuration needs
  a new provider revision and a matching wallet service binding.
- Keep the Safe accounts/singletons, MultiSendCallOnly, native-value ceiling,
  lifetime operation budget and sponsors in reviewed bootstrap configuration on
  both services. Applications cannot replace this infrastructure through registry
  publication. An opted-in executor accepts runtime snapshots only through its
  authenticated, configured wallet-service callers and fresh authority callback.

After this initial setup, publish application policies through the API without
restarting either service. Applications use this sequence:

1. Read `GET /v1/access-policy` using `wallet:access:read`. The response includes
   `runtime_contract_terms` with application ID, publication revision, policy hash
   and exact policy, plus the opaque `action_policy_revision` to consent to.
   `contract_call_terms` shows the effective targets and provider ceilings without
   exposing other account bindings. Review these terms with the account owner.
2. Submit the usual application-led `POST /v1/access-requests` assertion with
   `contracts:request`, `account:read` and any required provisioning permissions.
   Set `user.consent.action_policy_revision` to the discovery value and
   `policy_revision` to the base access-policy value. Supply required claims in
   `user.identity.fields`. An OAuth scope or transfer-only grant cannot
   authorize contract calls.
3. Submit `POST /v1/actions/contract-calls` with `kind: "contract-call"`, the granted
   account ID and ordered `{to, value, data}` calls. Calldata must be canonical ABI
   encoding for a registered method. Only direct calls are admitted; a reviewed
   MultiSendCallOnly batch supplies atomic ordering. The service prepares the
   exact nonce-bound SafeTx and stores the publication snapshot with it.
4. Call `POST /v1/actions/{actionId}/execute` with an empty body, a new idempotency
   key, `Execution-Profile: approved-evm-executor-v1` and
   `Execution-Profile-Revision: 1`. Normal wallet action, sign and execute scopes
   remain required. The wallet signs internally; contract signatures are not
   exported. The executor independently checks the snapshot, methods, limits,
   Safe/account state, code pins, exact signed plan, sponsor and current wallet
   authority before submitting.
5. Poll `GET /v1/actions/{actionId}/execution` or its execution-event feed with
   read scope. Use the existing reconciliation endpoint after uncertainty.
   Status reads of retained runtime executions require current `account:read`
   access from the same authenticated application subject and owner. They preserve
   the original snapshot even after a new publication, without authorizing dispatch.

Every publication creates a new financial consent revision, including a rollback
to earlier terms. Existing grants do not acquire broader authority. Obtain fresh
owner consent before preparing or dispatching work under the new publication.
When a transfer policy coexists in runtime mode, its financial grants also bind
this combined revision; the static transfer terms still constrain transfers.
Nonfinancial account access remains available under its normal grant rules.

Runtime claim rules accept exact string values and a maximum age. Values come
from the authenticated application's user assertion under its trust agreement;
they are not independently verified KYC facts or arbitrary per-action flags.
All these claims share `identity.verified_at`. The service checks their presence,
allowed values and age at consent and again before new financial effects. Refresh
identity evidence and consent when claims expire. Separate claim issuers,
per-claim timestamps, signed external attestations and numeric/range rules are not
implemented.

Per-method and batch native-value limits, call count and validity are enforced.
The effective native-value limit is the lower of the publication and provider
ceiling. The lifetime operation budget, sponsor budget and nonce reservations
remain shared across publications; a policy update does not reset usage. Runtime
queue requests use the shorter publication lifetime and require current consent
again when they become actions. Native transfers use optional `native_transfers`
recipient/code/value permissions and a provider `nativeTransfers` opt-in. Optional
`call_adapters` supply explicitly reviewed protocol checks for generic calls.
Changes to either are provider terms; automatic contract registration cannot
publish them. See [call authorization](approved-contract-calls.md).

Unknown and already signed/submitted effects retain their original plans,
signatures, nonces and reservations. Publishing narrower terms cannot recall a
Safe signature or stop a transaction already broadcast. Status and reconciliation
never rebuild a dispatched plan from the new registry head. The existing 32 KiB
service/journal envelope bounds still apply to complete execution requests; a
registration's 24 KiB storage allowance is not a promise that every combination
of document and calldata fits an execution envelope.

<span id="remaining-release-gates"></span>

## Outcome and support limits

Runtime registration does not infer a method's business meaning. Generic calls
prove execution; explicitly selected adapters can verify supported token, swap
or vault effects. They do not certify beneficiary settlement. Native-value limits do not bound token approvals or downstream calls;
review permitted methods and their argument semantics accordingly. New execution
mechanisms, business-effect verifiers and policy rule types require implementation.
The [EIP-5792 adapter](wallet-calls.md) supplies standard batch submission and
status for this Safe profile. Use the [runtime workspace](runtime-workspace.md) for operator forms. Real
test-network, provider and recovery acceptance remain required for your deployment;
see the [support and acceptance reference](v1-standards.md).

### Cumulative direct-transfer terms

These terms are optional adapter policy. Registering a token contract or
`transfer` method does not enable them; neither does an existing ERC-3009
configuration. Calls without cumulative adapter terms do not run allowance
migration. Sponsor gas eligibility and capacity remain separate from both
contract publication and asset-policy terms.

A reviewed `call_adapters.tokenTransfers` entry may include `lifetimeAmount`
alongside its token pin, recipients and `maximumAmount`. This cumulative term
uses the same provider/account/token allowance as ERC-3009. Publication requires
fresh financial consent and retains existing usage; automatic contract acceptance
does not approve changes to these terms. See [cumulative token allowances](approved-contract-calls.md#cumulative-token-allowances)
for activation inventory, uncertainty, account compatibility and unsupported
indirect asset exposure. Provider operators can edit these terms in the
[runtime workspace](runtime-workspace.md#configure-optional-policy-adapters),
review the change summary and publish through the existing configuration API.
Applications can view the published terms but cannot edit provider adapter rules.
