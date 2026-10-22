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

Open **Applications → Network fees** and select a network.

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
