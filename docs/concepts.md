# Meet the people and services

You do not need to learn the whole system to install it. These names will help
when you connect an application or talk with its developer.

## People and permissions

| Name                        | What it means                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet provider             | Your team: you run the service and decide which applications it accepts.                                                                        |
| Account owner               | The person whose wallet it is. They sign in and give permission inside the connected application.                                               |
| Connected application       | A product that asks to use someone’s wallet. Its API registration is also called a **client**.                                                  |
| Administrator               | A person who manages the provider. Administrator access does not give permission to spend a user’s funds.                                       |
| Management tool             | Software you authorise to manage the provider through its API, using separate credentials.                                                      |
| Wallet approval (**grant**) | A saved, limited permission for one application to access one person’s account until it expires or is revoked.                                  |
| Access token                | A short-lived way for a caller to identify itself to the API. Its named permissions are **scopes**; these do not replace the person’s approval. |

## Wallets and costs

A **Safe** is the person’s on-chain wallet and deposit address. The service keeps
its private signing identity in the **OWS vault**. Applications receive the Safe
address, never its private keys. Who controls and can recover the vault determines
the custody model you must explain to users.

Blockchain transactions incur **network fees**, often called **gas**. A connected
application covers eligible fees under its accepted **sponsorship** agreement.
A **paymaster** covers those fees from a dedicated deposit, while a private
**bundler** submits approved operations to the network. Those balances are separate
from the assets in a person’s wallet.

## When a request is still in progress

A **batch** is a saved application transaction request. Receiving its ID confirms
that the service retained the request; it does not mean the chain executed it.
A **UserOperation** is the exact set of calls, fee limits and signature prepared
for submission. The service verifies inclusion separately from finality, and
neither alone establishes your application’s business settlement.

A **journal** is the private recovery record of attempts and outcomes.
**Reconciliation** means checking what happened to the original attempt after an
uncertain response. A timeout is a reason to check status, never to invent a new
request and hope the first one failed.

Continue with [connecting an application](runtime-workspace.md), or keep this page
handy while following the [API guide](http-api.md).
