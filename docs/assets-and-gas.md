---
prev: { 'text': 'Service connections', 'link': '/docs/operator-services' }
next: { 'text': 'Test the connection', 'link': '/docs/staging-walkthrough' }
---

# Arrange who pays network fees

People should not need a separate gas-token balance to use supported application
transactions. The connected application covers eligible blockchain network fees,
often called **gas**, under limits you accept. This is called **sponsorship**.

User assets remain in each person’s Safe. Network-fee funding is kept separately;
it does not give the payer permission to spend those assets.

## Before funding anything

Agree the [application’s sponsorship terms](application-obligations.md) and read
its gas-funding endpoint. Verify the returned network, addresses and limits with
your developer. A provider operator provisions the accepted infrastructure; the
application funds its returned gas address within the agreed limits. Use an
isolated testnet deployment for the [first test](staging-walkthrough.md).

## Review fee funding in administration

Open **Applications → choose an application → Wallet setup** and select a network.

1. Open **Set fee limits**. Enter an agreement reference, the per-transaction and
   pending-fee limits in ETH, the maximum wallets covered and pending transactions.
   Leave **Total budget** blank to use available funding without a cumulative cap.
2. Choose **Save fee terms**, then **Prepare funding address**. Preparing it sends
   no funds and leaves wallet operations disabled.
3. Share the terms, revision, network and funding address with the application team.
   The application accepts that exact revision through its protected API, then
   supplies ETH on the displayed network. User deposits use separate addresses.

**Change fee limits** replaces the current terms and requires fresh application
acceptance. Sponsorship remains blocked until the replacement is accepted.
Pending or unknown operations retain their existing reservations; changing terms
cannot cancel a signed operation.

Applications can also submit their own terms for your review. For those terms,
choose **Approve fee terms** before preparing the address. **Developer details**
shows the complete agreement. Service API keys provide blockchain connectivity,
not fee funding. Infrastructure preparation and readiness checks remain required
before wallet execution; use a testnet for initial acceptance.

## Configure connections and prepare wallet services

Open **Applications → choose an application → Wallet setup** and select the network. Open **Connections**, add your provider API keys:

- **Alchemy:** the primary connection for blockchain reads and transaction submission.
- **dRPC:** an independent check and a backup connection.
- **Etherscan:** optional receipt and contract checks. It does not replace either
  full connection in independent verification mode.

The console builds the correct connection address for the selected network. You
only enter each provider's API key. Choose **Add custom provider** to supply
another service's HTTPS URL and choose its purpose. Independent verification
requires two different full providers; single-provider installations require one.

Keys are encrypted and never displayed again. When replacing connections, enter
the complete set of replacement keys or custom URLs.

Choose **Save and approve connections**. This approves the connections for the
selected application and network; it neither sends a transaction nor enables
user wallets. Accepted fee terms and ETH in the application funding address are
also required before preparing services.

Choose **Prepare wallet services** and review the displayed maximum ETH cost.
The action checks pinned contracts, deploys the fee-paying contract when needed,
funds its fee deposit and transaction submitter, and writes private submission
configuration. The ceiling includes ETH moved into those services as well as
transaction fees. Preparation is separate from enabling user-wallet execution.

The console shows the current stage and recent recorded transaction outcomes.
Success appears only after every preparation stage completes. If the request is
interrupted or an outcome is uncertain, refresh status before retrying. Retried
preparation retains transaction identities and does not treat a timeout as proof
that nothing happened. Changed connection approvals or fee terms invalidate the
prepared status and require another preparation check.

### Provision services through the API

Provider operators use these routes for the selected application and network:

| Method | Route                                                                       | Effect                                                                                                        |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/provider/applications/{applicationId}/wallet-services`                 | Read funding, paymaster and preparation status.                                                               |
| POST   | `/v1/provider/applications/{applicationId}/wallet-services`                 | Deploy the paymaster when needed, fund its deposit and transaction submitter, and configure bundler services. |
| POST   | `/v1/provider/applications/{applicationId}/wallet-services/funding-address` | Retain a funding address without chain access or funds movement.                                              |

Every route requires a current provider operator with `wallet:configuration:write`.
Send `Wallet-Network` to select the network. Both POST routes require a UUID
`Idempotency-Key`. The services POST accepts `maximum_cost_wei`, a positive decimal
string that can lower the server's preparation ceiling. It requires current accepted
service and sponsorship terms and sufficient application funding.

```sh
curl --fail-with-body --request POST \
  "$PROVIDER/v1/provider/applications/$APPLICATION_ID/wallet-services" \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header "Wallet-Network: $NETWORK" \
  --header "Idempotency-Key: $PREPARATION_KEY" \
  --header "Content-Type: application/json" \
  --data "{\"maximum_cost_wei\":\"$SETUP_CEILING_WEI\"}"
```

Set the variables to your provider origin, runtime application ID, operator token,
network and a new UUID. Set `SETUP_CEILING_WEI` to a positive integer in wei at or
below the GET response's `setup.maximum_cost_wei`. Include funds moved into
services as well as estimated transaction fees. Poll GET while the POST runs; `setup.phase: "ready"` and
`setup.running: false` indicate completion. After an interruption, inspect recorded
transaction outcomes before retrying. Preparation does not create a user wallet or
enable user-wallet execution.

The former `/v1/configuration/applications/{applicationId}/safe-wallet` routes are
replaced by this provider resource. Applications continue to read their own funding
status through `GET /v1/application/gas-funding`.

Prepared services do not establish live transaction acceptance or recovery
readiness. Complete the [launch checks](conformance.md) before enabling user
wallets. Application policy publication and user consent remain separate.

## Know which balance needs attention

| Balance                     | Purpose                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| Person’s Safe               | Holds their assets.                                                        |
| Application funding account | Funds the application’s accepted infrastructure. It is not a user account. |
| Paymaster deposit           | Covers eligible wallet-operation fees.                                     |
| Bundler gas balance         | Pays for submitting operations to the network.                             |

Keep infrastructure keys and funding credentials out of application clients.
Sponsorship is bounded by saved reservations and current application authority;
a funded balance alone never authorizes spending. Your developer can find the
[private infrastructure details](self-hosted-sponsorship.md) when provisioning it.

## Estimate transaction costs

Infrastructure transactions use RPC gas estimates with a margin. Wallet batches
use the bundler's UserOperation gas estimate. Fee bids use recent network base
fees and priority fees; configured limits are spending safeguards, not estimates.
If the network quote exceeds an accepted limit, preparation pauses before signing
instead of lowering the bid to that limit. Review the quote and agreed terms
before retrying. The final charge comes from the confirmed transaction receipt.

The refill plan also estimates deposit transfers, bundler funding and pending
Safe deployments before allocating ETH. It retains their network-derived fees, with the configured fee
buffer as a minimum. Fee headroom remains available outside the protected
percentage reserve.

## Allocate funding automatically

A provider can configure `safeWallet.fundingAllocation` for each network. For an
allocation of 60% paymaster, 10% bundler, 20% wallet provisioning and 10% reserve,
set `paymasterBasisPoints: 6000`, `bundlerBasisPoints: 1000`,
`provisioningBasisPoints: 2000` and `reserveBasisPoints: 1000`. The four values
must total 10000. Omitted `provisioningBasisPoints` means zero, preserving
existing three-part policies.
`feeReserveWei` sets a minimum transaction-fee buffer before calculating the targets.
`minimumRefillWei` skips transfers below the provider's configured minimum.

Provisioning funds stay in the application funding address alongside the
protected reserve. Wallet deployment fees can use the provisioning portion; the
reserve remains protected. The bundler uses its ETH balance to pay transaction
gas upfront and receives collected operation fees through the EntryPoint. Its
allocation supplies working capital for submission.

Targets use the combined application funding balance, paymaster deposit and
bundler balance. New funds increase the targets automatically. Refills add funds
to services below target; they do not withdraw excess balances from either
service. Each refill is bounded by the infrastructure spending ceiling and
rechecks that the protected reserve remains available after maximum fees.
Large top-ups may need several refill cycles. The console reports the configured
percentages under **Wallet services**.

Accepted fee and connection terms remain required. Background allocation starts
only when that network's wallet execution is enabled; an authorized provider can
run the wallet-services POST before activation. Allocation does not replace
backend, recovery, application-policy or user-consent checks.

## Funding checks and refill timing

Funding balances are reconciled once at startup and every fifteen minutes while
idle. Confirmed operation receipts provide conservative estimates of gas consumed;
when an estimate falls below half its target, the provider schedules an
application-scoped refill check. Duplicate receipt observations are ignored and
concurrent requests share a check. Reorgs invalidate the estimate and request a
fresh check. Activity-triggered checks are debounced and limited to one per thirty
seconds; an admission that needs funds can request an immediate check.

The background refill low-water mark is 50% of the configured target. A refill
restores the target rather than transferring a small amount after every operation.
Percentage allocations use the same low-water rule and retain their fee buffer,
provisioning allowance and protected reserve. Estimates are process-local hints,
not balances used to approve spending. Balance-funded admission retains its fresh
fixed-block snapshot, pending-operation reservations, current authority and fee
limits. If an admission-triggered refill fails, the request fails closed.

After sending ETH to an application's funding address, an authorized operator can
run the existing `POST /v1/provider/applications/:applicationId/wallet-services`
setup action to reconcile immediately. It verifies the current agreements and
funding identity and reuses the existing paymaster. It does not deploy another
paymaster or grant user-wallet authority. Otherwise, an external deposit is picked
up by the next recovery check. No webhook service is required for this mode.

The funding status shown by read endpoints is advisory. Reading it does not start
RPC polling or transfer funds, and a cached status is never financial authority.
Pending transaction receipt/reorg tracking continues independently of the funding
recovery interval.
