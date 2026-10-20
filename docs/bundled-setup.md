# Configure the bundled Safe wallet service

The bundle supplies one configured execution flow: per-user Safe wallets,
ERC-4337 v0.7 submission and application-owned gas sponsorship. OWS keeps each
Safe's private signer. The signer is not a second user asset account.

## What is included

| Component           | Purpose                                                     | Persistent state                           |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| OWS                 | Private owner-bound signing                                 | Vault and retained owner passphrase        |
| SQLite              | Current authority, exact actions, attempts and reservations | Private provider database                  |
| Alto                | Private ERC-4337 validation and bundling                    | Bundler configuration and Valkey queue     |
| Verifying paymaster | Application-funded gas sponsorship                          | Canonical contract and EntryPoint deposit  |
| OAuth issuer        | Application token authentication                            | Signing key and client secret references   |
| Caddy               | Optional automatic HTTPS                                    | Gateway configuration and certificate data |

The pinned Alto runtime and its modified source remain a separate GPL component.
See [the exact runtime and simulation pins](self-hosted-sponsorship.md). The bundle
does not require hosted sponsorship credits or a vendor gas-policy dashboard.

## Supplied settings and explicit decisions

The wizard supplies private storage, stable IDs, secret variable names and the
Safe/EntryPoint/module pins. You choose the provider domain, application trust
agreements, current identity requirements and operator identities. Applications
supply their RPC services, action schema, method policies and bounded sponsorship
agreement after connection. Published methods alone do not authorize spending.

## Configure through the wizard

1. **Provider:** enter the HTTPS service origin and privacy notice.
2. **Backend:** review OWS vault storage and retain the wallet environment ID.
3. **Services:** configure application authentication. The private bundler and
   Valkey start automatically; their administration ports are not published.
4. **Applications:** register caller IDs, trust agreements, permissions and provider
   operators. Identity and consent belong to the connected application's user flow.
5. **Deployment:** review storage, gateway and optional API explorer controls. Keep
   activation disabled until acceptance.
6. **Export:** validate and prepare the local runtime or download configuration.

Setup starts the disabled API and its private dependencies. Starting public HTTPS
is a separate operator action after DNS and ports are ready:
`--profile https up --detach --no-build` on the saved Compose command. Certificate
issuance contacts a public authority and makes the hostname public.

## Local execution, persistence and recovery

Each user has an independent execution lane. Current owner, KYC, consent, policy,
immutable calls and durable attempt authority are checked before effects.
The application funds one gas address; the service maintains the paymaster deposit
and bundler working balance within accepted budgets. Users need no gas-token balance.

Keep SQLite, the OWS vault, environment file, bundler configuration and Valkey data
together. Unknown outcomes retain their original attempt and signed operation.
Never reset a queue, regenerate a key or select another submission rail to recover
a timeout. See [latency and expiry recovery](execution-latency.md).

## Connect a server application

Use the registered application token service, submit current user identity and
consent evidence, receive a grant and provision its Safe. Use
`wallet_getCapabilities`, `wallet_sendCalls` and `wallet_getCallsStatus` through
[the account wallet endpoint](wallet-calls.md). Register application methods and
review their policy through [application management](runtime-workspace.md).
Verified wallet inclusion remains separate from business settlement.

## Manual and existing-service paths

Use `provider.config.safe.example.json` for a manual configured deployment and
follow [the deployment guide](operator-deployment.md). Existing trusted OAuth
infrastructure remains optional. The separate executor CLI, EOA transfers,
relayer execution, shared application Safes and sponsor pools are retired.
Old exports can be parsed for inspection; starting or exporting them fails before
effects. Preserve historical accounts and journals until a reviewed migration
establishes their recovery and asset treatment. Configuration never moves assets.
