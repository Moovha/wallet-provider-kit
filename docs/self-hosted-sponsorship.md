# Safe-only wallets and application-owned sponsorship

The Safe-only profile gives each user one Safe address for deposits, balances,
approvals and execution. OWS retains its private signing identity. The signer
address is not returned as a second asset wallet and requires no user gas balance.
Recovery and custody remain the provider's responsibility.

The configured service uses Safe 1.4.1, Safe4337Module 0.3.0, EntryPoint v0.7,
a private Alto bundler and an application-specific verifying paymaster. It uses
application-owned RPCs and requires no vendor dashboard, sponsorship policy or
credits. Base and Base Sepolia have distinct genesis bindings. Passing offline
checks does not establish funded network acceptance or a latency guarantee.

## Configure and start

The setup wizard selects this profile for a new OWS application-led deployment.
The export includes `safeWallet`, `safeProvisioning`, approved calls and encrypted
application credential storage. Relayer execution, EOA transfers, shared Safe
pools and sponsor pools are incompatible with this profile. Existing explicitly
configured profiles retain their contracts and historical journals.

Local setup starts the API, private bundler and a separate Valkey journal. The
bundler gateway publishes no host port. It requires a private credential, accepts
only configured account/paymaster pairs, bounds concurrent requests and keeps
executor nonce ownership separate from the infrastructure funding account.
Valkey uses AOF persistence with synchronous fsync. Retain its data together with
SQLite, the OWS vault and the provider environment file.

The pinned Alto runtime is v1.2.8, source
`37cade5d2804a60ab30362ea27054514e1d7a7c8`, container digest
`sha256:f2661042aadefc6a4fc9c5826a14404f574c7ef2de76bdf83fe6a0829137b3c5`.
It is a separate GPL runtime with source and license material retained
in the image. A source-pinned scheduler patch waits for executor submission before
draining more operations from the mempool. This bounds queued bundles and lets
waiting operations form a shared bundle; it does not add an executor nonce pipeline.
The modified source and reproducible patch script remain in the image. The private profile disables public mempool reputation tracing;
account validation, gas estimation and execution checks remain enabled. It must
not be exposed as a public bundler.

Simulation helpers are supplied as temporary bytecode through read-only RPC
state overrides. Their templates and constructor immutables are pinned against
the bundled artifacts. They are not deployed or funded, and simulation results
cannot establish canonical chain execution. Application verification connects
directly to accepted RPCs and never uses the simulation transport. An RPC must
support these state overrides; the bundler probes that capability at startup.

## Prepare sponsorship

After accepting the application's RPC, action and sponsorship declarations, a
configured provider operator calls:

```http
POST /v1/configuration/applications/{applicationId}/safe-wallet
Authorization: Bearer <operator-token>
Idempotency-Key: <uuid-v4>
Content-Type: application/json

{}
```

The service retains infrastructure identities before requesting funding. Read
`GET /v1/configuration/applications/{applicationId}/safe-wallet` as the operator,
or `GET /v1/application/gas-funding` as the application, to obtain its constant
funding address. An occupied application retains its existing funding address.
Fund that address with native ETH on the configured network, then repeat setup.
An insufficiently funded attempt remains unavailable and retains its identities.

Setup deploys and verifies the pinned SingletonPaymasterV7, its EntryPoint,
admin and manager roles, and signer. It funds the EntryPoint deposit and the bundler's working
balance. Private infrastructure keys are encrypted in SQLite; private bundler
configuration is written with owner-only permissions. Signed transaction
journals retain usable authorization material and must be protected.

Unsigned setup plans and shared gas reservations precede signing and broadcast.
Lost replies retain the original nonce, payload and transaction hash. Retries
inspect canonical receipts and cannot create a replacement deployment. Setup
network fees consume the same application allowance as UserOperations. Deposits
and working balances remain infrastructure capital; `maximumSetupCostWei`
separately bounds setup funding and fees. Unknown reservations are not refunded.

## Provision and use the wallet

The application renews user access consent for the configured action policy and
calls the existing account provisioning endpoint. The backend creates or recovers
a signing identity, then the service provisions its Safe and installs the exact
accepted module and fallback handler. Existing per-user Safes can retain their
addresses and owners. Other modules, guards, owners or handlers are rejected.

Only a ready Safe is returned by account reads and provisioning. A partially
configured account exposes no signer deposit address. New accounts use their
own signing identity; migration can retain an existing private Safe signer.
Historical records and assets at older EOA addresses are not deleted or moved.
Moving assets from an existing EOA requires a separately reviewed migration.

Applications use the existing EIP-5792 wallet endpoint. The service estimates gas
with non-authorizing dummy signatures, obtains network-derived fees, reserves the
shared allowance, signs final paymaster authorization and signs the Safe operation.
The application cannot choose an arbitrary paymaster, bundler, signer or fallback
execution mechanism. An uncertain operation remains on its original account lane.

Independent user lanes progress after verified canonical inclusion. Verification
checks the exact packed operation, signature, sender, paymaster and individual
`UserOperationEvent` result. Outer transaction success alone is insufficient.
Canonical settlement continues separately. Recent worker verification is pushed
through SSE without another full proof on that delivery path; stale status remains
pending until refreshed.

The API journals admitted operations before bundler dispatch. Alto's Redis-backed
outstanding queue and graceful restoration support recovery, but a hard crash
while an operation is being processed can still require reconciliation from the
API's retained operation and independent chain evidence. An absent bundler reply
is never permission for an alternative transaction or a second financial admission.
Funded restart and overload acceptance remain required before a production claim.

## Acceptance

Use ten distinct users and their retained Safes, the same registered zero-value
calls, client-side acknowledgement and verified receipt delivery timestamps.
Measure queueing, preparation, sponsorship, signing, submission and inclusion
separately. Protect raw captures and report the actual network, source revision,
funding, failed requests and sample size. Unfunded discovery and offline fixtures
are separate evidence and do not replace this Base test.
