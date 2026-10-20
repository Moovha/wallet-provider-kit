---
prev: { 'text': 'Application rules', 'link': '/docs/runtime-configuration' }
next: { 'text': 'Paying network fees', 'link': '/docs/assets-and-gas' }
---

# Connect the services your application needs

You do not need external service accounts to finish installation. When an
application is ready, its developer supplies the network connections needed to
read blockchain state and verify transaction outcomes. Review them as part of
its [application agreements](application-obligations.md).

## Keep connection details private

Store secret values in the deployment’s secret store or protected credential API.
Configuration contains references to those values, not the secrets themselves.
Credential metadata helps you inventory a connection without revealing its password.

## Register the application API and clients

A standard API-managed provider includes its own token issuer. Add applications
in [Applications](runtime-workspace.md); an external login provider is unnecessary.
An advanced static deployment can instead trust a matching external issuer.
Follow the [Auth0 recipe](auth0-setup.md) only if you have chosen that integration.

<details>
<summary>External token compatibility checklist</summary>

Match the configured issuer, API audience, signing keys and exact registered
client IDs. The service requires signed RFC 9068 access tokens with RS256 or ES256,
`at+jwt`, `client_id` and `jti`, and a lifetime of at most 600 seconds. Request only
allowed scopes and inspect the actual issued token privately. Scope alone does
not establish a person’s identity or wallet permission.

The [HTTP reference](http-reference.md) gives each endpoint’s scope requirements;
[wallet calls](wallet-calls.md) lists the combined transaction scopes. Register
provider operators separately from application clients.

</details>

## Understand the private wallet services

The **OWS vault** holds private Safe signing identities. The **bundler** submits
approved operations, and the **paymaster** covers bounded network fees. RPC
connections provide chain state and receipt evidence. Using several RPC endpoints
can improve scheduling without changing wallet ownership or spending permission.

Staff login is optional for [API-explorer token controls](operator-tokens.md).
It is separate from the people using wallets, who continue to sign in and give
permission inside the connected application.

Next, [arrange network-fee funding](assets-and-gas.md) and [test the connection](staging-walkthrough.md).
