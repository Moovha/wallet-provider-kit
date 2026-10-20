# Prepare the application’s fee-paying infrastructure

Your developer and infrastructure operator use this page after agreeing
[who pays network fees](assets-and-gas.md). The bundler submits operations; the
paymaster covers their fees. These private services do not need public ports.

## Prepare and fund the application

Each accepted application has retained funding infrastructure, a verifying paymaster and a private bundler. Each user has their own Safe. The provider’s encrypted credential registry retains infrastructure secrets; credential metadata never exposes values.

Provision application infrastructure with a dedicated operator token after accepting services and sponsorship terms. Fund the returned gas address within explicit limits. Infrastructure deployment and module setup have durable transaction journals and reconcile their exact signed transactions after uncertainty.

## Wallet setup and recovery

New user Safes deploy with their owner, ERC-4337 module and fallback handler in
one factory transaction. The service checks the pinned Safe 0.3.0
`SafeModuleSetup` helper before its initialization delegate call, then verifies
the exact owner, threshold, singleton, module, handler, guard and EntryPoint
configuration before returning the Safe as ready. Each new account retains its
initializer. Existing addresses and prepared accounts keep their original setup
path; a retry never replaces an account with a differently initialized Safe.

<details>
<summary>Concurrency, reservations and exact retry behaviour</summary>

Repeated provisioning of a ready Safe still checks current access and chain
configuration, but skips installation reads and setup signatures. Independent
fee, estimate, balance and nonce reads run concurrently before the bounded gas
reservation and durable admission.

Application infrastructure shares a funding address. A short per-application
lock assigns durable, consecutive nonces and dispatches the exact signed payload;
it does not wait for inclusion. Once a transaction is acknowledged, the next
Safe can dispatch while earlier receipts are observed independently. Preparation
runs concurrently across accounts, with at most ten active preparation jobs and
one hundred waiting jobs per service process. Requests for the same account
remain ordered.
Bundler configuration publication has a separate short application lock so concurrent
readiness updates cannot collide or replace a newer account snapshot with an older one.

The accepted sponsorship field `maximum_in_flight_per_sponsor` bounds pending
infrastructure transactions per application (default ten, maximum sixteen).
Admission checks the combined pending gas/value reservations against the observed
funding balance and the accepted gas budget. Pending balance reads may already
include queued costs; the additional reservation check is conservative. The
application must keep enough gas available for its configured concurrency.

An unacknowledged transaction blocks later nonce allocation until its exact hash
is observed pending or included. Recovery never signs or rebroadcasts another
user's transaction. Verified inclusion settles expired or unknown journal
attempts through reconciliation. Active dispatch leases retain their fencing;
unknown outcomes retain their reservations. The service never declares a Safe
ready from broadcast acknowledgement alone.

</details>

## Component versions and licences

The bundler uses source-pinned Pimlico Alto v1.2.8 at `37cade5d2804a60ab30362ea27054514e1d7a7c8`. Its scheduler waits for executor submission before releasing the next bundle; retained waiting operations can share a bundle. The external process and scheduler patch are GPL-3.0, with source and license material in the image. See [NOTICE](../NOTICE).

The local verifying paymaster includes pinned MIT-licensed contract sources listed in [contract provenance](../contracts/vendor/README.md). Keep the paymaster deposit and bundler submission-gas balance funded separately. A funded paymaster does not authorize user spending.

See [deployment](operator-deployment.md), [gas](assets-and-gas.md), [wallet calls](wallet-calls.md) and [execution recovery](user-operation-execution.md).
