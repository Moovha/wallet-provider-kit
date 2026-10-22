---
prev: false
next: { 'text': 'Install and sign in', 'link': '/docs/provider-installation' }
---

# Welcome to your wallet service

Wallet Provider Kit helps your team offer wallets inside the applications your
customers already use. You run the service; each person receives a Safe, their
wallet address on the blockchain. Connected applications request access with
that person’s permission.

You can install the service before choosing an application. There is no need to
arrange user checks, transaction rules or network-fee funding during installation.

## Start with a place to run it

Follow [Install your wallet service](provider-installation.md) to choose your
computer, a Linux server or the AWS template. Then create your administrator
account and sign in. If you are evaluating the source code, use
[Run from source](local-setup.md).

At the end, you should have an administration console and an empty application
list. **Wallet operations disabled** is expected at this point.

## When an application is ready to connect

Follow [Connect your first application](runtime-workspace.md). You will add the
application, save its connection details and agree how it handles user checks
and permission. Your developer can then use the [application API guide](http-api.md)
to complete the connection.

Transaction rules and who pays network fees come next, when you know what the
application needs. The connection guide introduces those decisions in order.

## Build the experience people will use

Once the application is connected, walk through [creating a first wallet](create-wallet.md),
[returning to an existing wallet](connect-wallet.md) and
[sending a small transfer](send-transfer.md). Each guide starts with the person’s
experience and keeps developer requests available in expandable sections.

## Before welcoming users

[Test the connection](staging-walkthrough.md), arrange [backups](provider-maintenance.md)
and complete the [launch checks](conformance.md). The toolkit is experimental:
it supports one active host per deployment on Base, Base Sepolia or Ethereum Sepolia. Production custody and
funded mainnet acceptance remain pending.

## Find help for your task

| I want to…                           | Start here                                                             |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Understand who does what             | [Meet the people and services](concepts.md)                            |
| Connect an application               | [Connection guide](runtime-workspace.md)                               |
| Change permitted transactions        | [Application rules](runtime-configuration.md)                          |
| Keep the service running             | [Monitoring](operations.md) and [maintenance](provider-maintenance.md) |
| Use an existing static configuration | [Advanced setup](setup-wizard.md)                                      |
| Embed the toolkit in my own server   | [TypeScript integration](api.md)                                       |

You only need the advanced references when your task calls for them. The standard
journey is **install → sign in → connect an application → test → welcome users**.
