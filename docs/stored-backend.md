# Supplied stored-action wallet backend

Start with [package installation](package.md) and [backend selection](backend-guide.md).
This guide covers the existing-host lifecycle profile; use the
[provider guide](provider-guide.md) for the separate `EmbeddedWalletService` profile.

The **host** is your wallet service's server application. Its **authority** supplies
trusted records and permission checks. Here, authority **ports** mean typed interfaces
your host implements over its own storage and policy. The **raw provider** is the
account/signing engine before toolkit attempt coordination is added. See
[roles and terms](concepts.md) for owners, application clients, actions and attempts.

Use `createStoredWalletBackend` when an existing application already owns trusted
identity, current grants/KYC, approved stored actions and transactional authority.
The toolkit supplies account creation, read-only account recovery, durable signing
dispatch and result verification. The application configures this implementation;
it does not implement another wallet-provider lifecycle.

```ts
import { createStoredWalletBackend } from '@moovha/wallet-provider-kit/backend';
import { createCdpWalletProvider } from '@moovha/wallet-provider-kit/cdp';

const backend = createStoredWalletBackend({
  enabled: true, // A separately reviewed host activation, never inferred from secrets.
  provider: createCdpWalletProvider(privateEnvironment),
  signingAuthority,
  accountAuthority,
});
```

`privateEnvironment`, `signingAuthority` and `accountAuthority` are trusted startup
configuration, not HTTP inputs. Existing host integrations supply these adapters.
For new users without existing identity or storage, start with the
[onboarding profile](onboarding.md). That profile supplies reference persistence
and consent but deliberately cannot sign financial actions. Neither profile
turns vendor credentials or OAuth scopes into spending authority.

## Authority configuration

`signingAuthority.admit` must atomically check current owner/grant/KYC/consent,
reserve bounded usage and persist the exact attempt. Replays must reauthorize
before returning a stored result. `dispatch` must recheck that authority and
commit a unique fenced dispatch before returning its immutable action, account,
address and lease. It must deny a second dispatch, including after restart.
`finish` must verify the exact stored action/lease and atomically record the
terminal result and audit/outbox event. Storage uncertainty must throw; do not
retry writes or release usage reserved for unknown effects.

`accountAuthority.reserve` checks current owner/proof/policy, reserves the original
opaque account and attempt IDs, and budgets creation or recovery. `claim` rechecks
current authority and commits a single fenced dispatch. `finish` binds a verified
address or records an unknown outcome with the same identity and lease. An
expired lease never authorizes replacement creation. The toolkit is a lifecycle
implementation over this trusted storage/policy contract, not another database.

The supplied backend snapshots request context, captures configured adapters,
validates account identity/address and verifies returned signatures. It admits
only the current Base Sepolia EOA typed-data profile. It never accepts raw signing
payloads, creates replacement wallets during recovery, retries ambiguous effects,
funds wallets, exports keys or broadcasts transactions. Unknown outcomes retain
the original attempt and durable usage. Host-side exact action/expiry/current
policy checks remain mandatory independently of the vendor adapter.

Use `backend.account(trustedContext)` to provision and
`backend.account(trustedContext, true)` for read-only recovery. Use
`backend.sign(trustedContext, storedActionId)` for an admitted stored action.
Only the host constructs these contexts. The returned fields are internal
references/results; expose them through the host's authenticated contract, not a
generic public signing endpoint.

`createDurableSigningService` exposes the same signing lifecycle separately for
hosts that already have account provisioning. Do not compose it with a second
attempt journal around the same dispatch; that would introduce two authorities.
The older raw-provider journal decorator remains appropriate when an existing
host implements the distinct `WalletAttemptJournal` contract.

## Acceptance and deployment

This is an experimental supplied implementation. Offline tests establish ordering,
identity/result validation, current-authority replay, recovery and no redispatch
after unknown effects. They do not establish real database concurrency, vendor
recovery or production acceptance. No new infrastructure or billing dependency
is introduced. Select a reviewed checksum-pinned package, prove host adapter
compatibility, and keep its default host unconfigured until activation is reviewed.
