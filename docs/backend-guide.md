# Connect your wallet backend

A wallet backend creates or resolves accounts and signs permitted actions. Your
host decides who may use each account, records the approved action and supplies
durable attempt authority. The toolkit brings those parts together as a wallet
service that connected applications can use without receiving keys.

Start after [installing the package](package.md) and running the
[provider walkthrough](integration-example.md). Keep its authentication, authority
and journal responsibilities in place when you replace the offline backend.

## Choose the host lifecycle

If your application already owns approved stored actions and transactional
policy/storage ports, configure the [supplied stored-action backend](stored-backend.md).
It provides account creation/recovery and signing dispatch over those ports:

```ts
import { createStoredWalletBackend } from '@moovha/wallet-provider-kit/backend';
import { createCdpWalletProvider } from '@moovha/wallet-provider-kit/cdp';

const backend = createStoredWalletBackend({
  enabled: false, // Enable only after the host/backend acceptance checks.
  provider: createCdpWalletProvider(privateEnvironment),
  signingAuthority,
  accountAuthority,
});
```

`privateEnvironment`, `signingAuthority` and `accountAuthority` are trusted host
configuration, not HTTP inputs. This profile owns the dispatch lifecycle; give
it a raw provider and don't add another attempt wrapper around the same effects.
Its host-specific contexts and results belong behind your authenticated application
contract; it isn't a generic signing HTTP endpoint.

If you use the `EmbeddedWalletService` profile shown by the walkthrough, compose
its `EmbeddedWalletAuthority` with a journaled provider as described below.
The two profiles use different authority ports. Choose the one your host implements;
don't stack both admission systems around one signing operation.

## Choose an integration

The table below shows journal ownership for `EmbeddedWalletService`. For the
stored-action lifecycle, use a raw backend such as CDP or your own raw adapter.
The OWS and Relayer factories already journal effects; don't stack them inside
another dispatch lifecycle.

| Backend                              | How to connect                                                  | Journal ownership                                                                              | Read first                                |
| ------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Coinbase CDP                         | `createCdpWalletProvider(configuration)`                        | Wrap the raw provider with `createJournaledWalletProvider`                                     | [CDP below](#coinbase-cdp)                |
| Open Wallet Standard                 | `createOwsWalletProvider(vault, attempts)`                      | The factory already applies the host journal                                                   | [OWS guide](ows-adapter.md)               |
| OpenZeppelin Relayer                 | `createOpenZeppelinRelayerWalletProvider(connection, attempts)` | The factory already applies the host journal                                                   | [Relayer guide](openzeppelin-relayer.md)  |
| Your wallet engine or signer service | Implement `WalletSigningProvider`                               | Wrap the raw provider once, unless your reviewed integration already implements this lifecycle | [Custom backend below](#your-own-backend) |

The bundled adapters currently use Base Sepolia EOA profiles. Each guide describes
its exact limits, key controller and recovery needs. Select a backend based on
those properties; application access without key transfer doesn't establish
exclusive end-user custody.

## Coinbase CDP

CDP's adapter is a raw `WalletSigningProvider`. For `EmbeddedWalletService`,
connect it to the host journal before composing the service:

```ts
import {
  createJournaledWalletProvider,
  EmbeddedWalletService,
} from '@moovha/wallet-provider-kit/core';
import { createCdpWalletProvider } from '@moovha/wallet-provider-kit/cdp';

const rawBackend = createCdpWalletProvider(privateEnvironment);
const provider = createJournaledWalletProvider(rawBackend, {
  namespace: 'your-wallet-test',
  journal,
  authorizeAttempt,
});
const service = new EmbeddedWalletService(authority, provider);
```

This composition excerpt names your host integrations explicitly:
`privateEnvironment` supplies dedicated CDP credentials from trusted startup
configuration; `authority`, `journal` and `authorizeAttempt` supply current policy
and durable attempts. The [provider guide](provider-guide.md#compose-the-service)
continues with HTTP composition. The [supported CDP profile](provider-guide.md#current-adapter-profile)
records its configuration and account/signature restrictions. Never supply vendor
credentials from a requesting application or use a shared fallback credential.

For a new onboarding service, set `walletBackend` to the raw CDP provider in the
[onboarding configuration](provider.config.example.ts). That profile supplies its
own provisioning journal and denies signing. Do not insert a second journal around
it. Financial signing remains a separate exact-action host integration.

## Your own backend

Import the interface from `@moovha/wallet-provider-kit/core`. It contains four
members:

| Member                                      | Input and result                                                       | Required behavior                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `provider`                                  | Stable lowercase backend name                                          | Distinguish backend/environment identities without credentials or customer IDs          |
| `createAccount(accountId, attemptId)`       | Reserved account and provider-attempt UUIDs → `{ accountId, address }` | Create/bind the original account once; preserve attempt identity on uncertain outcomes  |
| `findAccount(accountId)`                    | Reserved account UUID → account or `null`                              | Read-only lookup; never create a replacement during recovery                            |
| `signTypedData(account, action, attemptId)` | Bound account, approved stored action and attempt UUID → signature     | Sign the exact supported EIP-712 action, respecting expiry, profile and account binding |

The [offline backend](../examples/provider-flow/backend.mjs) is a complete small
implementation of this interface using an ephemeral signer. Its scope is explicit:
it demonstrates the adapter contract and has no vendor service, persistent key
vault or production recovery. In the walkthrough, [host.mjs](../examples/provider-flow/host.mjs)
owns policy and [run.mjs](../examples/provider-flow/run.mjs) composes the wrapper.
You can read or replace the backend without searching through the authority code.

For your adapter:

1. Map the host's opaque account ID to one stable backend account/address.
   Keep owner identity and private-key handling inside their respective trusted systems.
2. Accept only the account/action profiles you can verify. Recheck expiry across
   asynchronous backend work and preserve decimal-string numeric values.
3. Return the exact account or signature shape. The journal wrapper independently
   validates account identity, the EIP-712 digest and the recovered signer.
4. Translate backend failures into `WalletProviderError` with a safe code and
   `not_dispatched`, `rejected` or `unknown` outcome. An ambiguous response is
   unknown; never hide it behind an automatic mutation retry.
5. Wrap the raw implementation once and compose it with `EmbeddedWalletService`.
   Preserve current owner/grant/KYC/consent, immutable-action and durable-attempt
   checks before effects and on result replay.

A backend implements signing mechanics; it doesn't grant permission to spend.
The [API guide](api.md#core-wallet-service) describes the authority port, and
[durable attempts](durable-attempts.md) describes the storage contract.

## Complete the host integration

Use [provider-guide.md](provider-guide.md) to connect the selected backend to your
existing authority and HTTP application. Use [onboarding](onboarding.md) if you
need hosted owner login, identity review, consent and application access. Keep
public configuration in one typed startup module and credentials in your secret
store or ignored local environment files.

Before enabling readiness, complete [integration acceptance](conformance.md) for
your actual backend and storage: denied effects, exact signatures, concurrency,
restart, revocation, lost responses and read-only recovery. Record who controls
and recovers the wallet. Configure [operations](operations.md) for that host;
credentials, a successful mock or liveness alone don't establish readiness.
