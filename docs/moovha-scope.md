# Wallet access and Moovha scope

This toolkit implements a portable wallet/provider boundary for adopting teams.
Its purpose is broad wallet integration, including Moovha's access to independently
controlled user wallets. The adopter chooses the product use case, signing
backend, account-control model and recovery policy.

## Non-custodial access and key control

For independently hosted accounts, Moovha can request permitted actions and
receive their exact results without taking the provider's private keys. The
provider owns its wallet implementation, approval policy and declared recovery
model. OAuth consent authorizes scoped access; it doesn't transfer key custody.

That access boundary is distinct from **exclusive end-user self-custody**. A
provider using an app-controlled CDP wallet or an operator-held OWS passphrase may
control the key. The adopter must describe that accurately. Moovha device custody,
device backup and replacement-device recovery are a separate client profile;
this Node package doesn't implement that client or its recovery promise.

## Two API directions

| Surface                           | Caller and host                                                       | Responsibility                                                                         | Status in this repository                                                                                    |
| --------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Provider-hosted toolkit API       | An authorized application calls the adopting wallet provider          | Provider login/access, owner-bound provisioning and exact stored-action signing        | Implemented experimental profiles documented in [HTTP API](http-api.md)                                      |
| Moovha business orchestration API | A registered independent provider or Moovha client calls the DeFi API | Account linking, prepare/review/commit, action fulfillment, sponsorship and settlement | Separate DeFi scope; this repository carries only an [orchestration draft](../spec/orchestration-draft.json) |
| Embedded library integration      | DeFi or another reviewed host calls the kit's public package API      | Reuse a backend under that host's authority/journal                                    | Supported composition; no deployment or host adapter is activated by importing it                            |

The toolkit's inbound `wallet:provision` / `wallet:sign` scopes aren't Moovha's
outbound provider grants such as `operations:create` / `actions:write`.
Use separate registrations, audiences and authorization checks. Matching route
names across hosts don't imply shared ownership or protocol compatibility.

An independent provider can integrate the planned Moovha operation protocol with
raw HTTP and maintained wallet libraries. It doesn't have to expose this toolkit's
HTTP service to Moovha, use WalletConnect, or use a particular backend vendor.
A Moovha provider grant must never invoke Moovha's legacy custody adapter or
weaken first-party owner/device-proof gates.

## Relationship to the four delivery scopes

The parent workspace treats each checkout as independent. DeFi owns its business
API and contracts; this repository owns the portable kit and its package lifecycle.

| DeFi delivery scope                   | Kit contribution                                                                                                     | Still outside this kit                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1. Signing and sponsorship foundation | Backend/service interfaces, tested adapter profiles, current-authority/journal seams and provider reference examples | DeFi's operation API, production owner/grant/proof authority, sponsorship and deployment acceptance                 |
| 2. Enforced transaction intent        | Can sign an exact supported host-approved action                                                                     | Atomic executor, token intake, permit/allowance enforcement and payout escrow                                       |
| 3. Transactions and settlement        | Returns a signature or supported Relayer acceptance/status artifact                                                  | Business transaction flows, bridge finality, payout and verified settlement                                         |
| 4. App wallets and controlled rollout | Portable package, provider documentation and offline integration walkthrough                                         | Flutter/device custody/recovery, active-account migration, live independent-provider conformance and cohort rollout |

The embedded backend is a Scope 1 priority behind Moovha's login/approval
experience; general external-wallet connection UI is a later Scope 4 concern.
Vendor invisibility doesn't establish custody. The runnable tutorial proves only
this kit's implemented provider flow; it doesn't mark any DeFi scope complete.

## Source of this interpretation

Reviewed against the parent workspace `AGENTS.md` and DeFi's wallet-rollout
README, Scope 1, Scope 4 and provider-orchestration briefs on 15 October 2026.
The inspected DeFi commit is `c867cdfef3c581ca1ce7c0998dd6a7fc7918d20c`;
those four governing files had no local modifications. Their source locations in
that independent repository are:

- `node-relay/docs/wallet-rollout/README.md`
- `node-relay/docs/wallet-rollout/01-signing-and-sponsorship.md`
- `node-relay/docs/wallet-rollout/04-app-wallets-and-rollout.md`
- `node-relay/docs/wallet-rollout/provider-orchestration.md`

This summary carries the relevant boundaries so a package adopter doesn't need
access to a sibling checkout. It doesn't copy the DeFi implementation, depend on
its install/test environment, or change its release status. New Moovha backend
work targets the parallel `api` service; legacy `exchange` remains outside this
repository's release authority.
