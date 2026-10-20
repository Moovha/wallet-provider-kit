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
