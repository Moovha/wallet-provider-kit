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

1. Review the application’s fee agreement, per-transaction limit and pending-fee limit. **Developer details** shows
   the complete submitted terms.
2. Choose **Approve fee terms** if they match your agreement.
3. Choose **Prepare funding address**, then share it with the application team.
   Preparing it sends no funds and leaves wallet operations disabled.

The application funds this address with ETH on the displayed network, separately
from user deposits. In balance-funded mode, available funding and pending fee
reservations govern ongoing use. A total budget is optional; it is a cumulative
limit rather than a deposit requirement. Complete infrastructure checks before
requesting funding; use a testnet first.

If no terms appear, the application team must submit them through its protected
API. Service API keys provide blockchain connectivity, not fee funding.

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
