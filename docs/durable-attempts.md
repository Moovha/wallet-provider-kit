# Keep provider attempts across retries and restarts

A **journal** is a private, persistent record of attempts and their results.
An **attempt** is one admitted execution of account creation or an approved signing
action. Retrying the same request keeps that attempt's identity. Your **host**,
the wallet service's server application, supplies the journal storage and current
permission checks. The **backend** is the account/signing engine being called.
See [roles and terms](concepts.md#actions-attempts-and-the-journal) for a worked
retry example and the difference between an action, attempt and idempotency key.

Wrap your signing backend with `createJournaledWalletProvider` when you compose
`EmbeddedWalletService`. The wrapper commits a dispatch claim before calling the
backend, verifies and stores the result, and returns that stored result on an
identical retry. A lost response stays tied to the original attempt.

Use the [built-in SQLite database](storage.md) for a supplied journal, immutable
approvals and financial authority on one host, or supply your own accepted
persistent journal. Current host authorization and recovery evidence remain
required. The kit does not connect to Moovha's API database; the CLI remains
unconfigured. The [walkthrough](integration-example.md) uses single-run offline fixtures.

## Compose it in your host

<figure class="wallet-visual">
  <img src="./public/diagrams/durable-attempts.webp" alt="Diagram: check current authority and journal state; dispatch a new claimed attempt once, replay saved success, or reconcile an uncertain original attempt." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>This shows the main decision paths. Safe failure handling and the full journal contract are described below.</figcaption>
</figure>

[View full-size diagram](public/diagrams/durable-attempts.webp)

```ts
import {
  createJournaledWalletProvider,
  EmbeddedWalletService,
} from '@moovha/wallet-provider-kit';

// backend, authority, journal and authorizeAttempt are reviewed host integrations.
const signer = createJournaledWalletProvider(backend, {
  namespace: 'your-product-test',
  journal,
  authorizeAttempt,
});
const service = new EmbeddedWalletService(authority, signer);
```

Keep `namespace` stable across deployments and process restarts. It identifies
one backend and environment. Give independent environments/backends distinct
names; changing it to escape a stuck attempt can duplicate effects. Provider and
namespace names use lowercase letters, digits, dots, underscores and hyphens,
start with a letter, and have at most 64 characters. Never use a URL, credential
or customer identifier as a namespace.

The host authority still maps the verified issuer/client/subject and HTTP
idempotency key to one owner-bound, durably admitted `attemptId`. It must reject
key reuse for different requests. Do not allocate a fresh attempt ID on every
retry. OAuth scope alone cannot create an admission.

`authorizeAttempt(request)` resolves that server-owned attempt and checks current
owner, grant, stored KYC, consent/proof, immutable action, revisions, expiry and
bounded usage. The request carries references and fingerprints, not a token or
raw action. Check them against trusted stored records. The wrapper calls this
callback before journal access and again before dispatch or returning a cached
success. False denies; a thrown policy-store error prevents provider effects.
A callback that always returns true is not a deployment implementation.

## Implement the transactional journal

**Dispatch** means calling the backend to perform the effect. A **claim** is an
exclusive, persisted permission for one worker to dispatch an attempt. Its
**lease** has a token and deadline; **fencing** means checking that token when a
worker records completion so a stale worker cannot overwrite the result. An
expired lease after dispatch doesn't authorise another backend call.

The SQLite implementation follows the contract below. For another database,
implement `WalletAttemptJournal` through your selected durable store. Before a
database-backed implementation, inspect that deployment's actual schema, roles
and isolation; this repository has no production database or verified schema.
Do not assume it shares Moovha's Supabase project.

The storage adapter must enforce these rules with transactions and constraints:

1. Uniquely bind `(namespace, provider, attemptId)` to the exact `resourceKey` and
   `requestHash`. Also uniquely bind the resource within that namespace/backend,
   so a new attempt ID cannot redispatch the same account creation or action.
   Different input for either identity returns `conflict`. Preserve immutable
   identity and usage reservations beyond HTTP/vendor idempotency cache lifetimes.
2. `claim` atomically reserves bounded usage and commits dispatch, a new UUIDv4
   lease token and `leaseExpiresAt` deadline before returning `state: 'dispatch'`. Exactly one caller
   may receive dispatch. It echoes the requested attempt/resource/hash in every
   response. A duplicate while the original is running returns `pending`.
3. A claimed dispatch that loses its process or expires becomes `unknown` and
   cannot be claimed again. A new process must not reset state or a quota. This
   wrapper has no automatic retry, replacement attempt or lease renewal path.
4. `complete` validates the lease token and immutable request, then atomically
   stores the terminal result and its audit/outbox event. It must reject stale
   tokens and terminal-state rewrites. `fail` does the same for a safe error code
   and dispatch outcome. Unknown outcomes keep their reserved usage.
5. An identical completed request returns `succeeded` with the stored result.
   A known failure returns `failed` with its safe code/outcome; an uncertain one
   returns `unknown`. Only a separately reviewed, evidence-based recovery process
   can reconcile an unknown outcome. A timeout or account lookup miss is not
   permission to repeat creation or signing.

`resourceKey` is a SHA-256 fingerprint of namespace, provider, action kind and
resource ID. `requestHash` fingerprints the exact account/action snapshot with
sorted object keys; it includes plan, binding and capability revisions, expiry,
chain, address and payload. These are private request identity fingerprints,
not an implementation of JSON Canonicalization Scheme or a replacement for the
EIP-712 digest. Numeric values in signable inputs must remain decimal strings.

Persist results under a deliberate access, encryption, retention and backup
policy. Signatures can authorize spending: do not log them or put them in telemetry,
task payloads, public events or diagnostics. The journal metadata is an identifier,
not anonymous data. Keep credentials, raw tokens and request bodies out of it.

## What callers receive

| Situation                                               | HTTP result                                         | Provider effect                  |
| ------------------------------------------------------- | --------------------------------------------------- | -------------------------------- |
| First valid claim                                       | 200 after verified result is stored                 | One backend call                 |
| Identical completed retry                               | 200 with stored result                              | No new backend call              |
| Changed request or reused resource with another attempt | 409 `wallet_attempt_conflict`                       | No new backend call              |
| Original dispatch is still running                      | 409 `wallet_attempt_pending`, outcome `unknown`     | No new backend call              |
| Original outcome is unknown                             | 503, outcome `unknown`                              | No new backend call              |
| Journal write/response is uncertain                     | 503 `wallet_attempt_unavailable`, outcome `unknown` | No automatic retry               |
| Current authorization denies                            | 403 `wallet_authorization_denied`                   | No provider call by that request |

If the claim commit response is lost, this caller does not invoke the provider.
If the result commit response is lost, the provider may already have completed;
a later identical request can recover a committed result. If persistence failed
before storing the result, the claim stays pending/unknown and requires recovery.
These outcomes never establish transaction broadcast or financial completion.

For typed signing, the wrapper checks the existing EOA revision-1 profile,
chain/account/domain, primary type, digest, revisions and expiry, snapshots inputs
before asynchronous work, and independently verifies both fresh and cached
signatures. It repeats action and lease expiry validation after admission and action expiry
validation before returning a cached signature. Each backend remains
responsible for rechecking expiry across its own asynchronous work; the CDP
adapter already does this after account lookup. Wrapping a backend does not add
new chain, contract-account, broadcast or sponsorship capabilities.

`findAccount` remains read-only. It validates identity/address, never creates an
account or changes an attempt, and cannot by itself prove how an uncertain
creation happened. The host must use its original reserved ID and reconciled
binding before enabling later signing.

## Verification and acceptance

The offline contract fixtures exercise concurrent identical callers, changed
requests/resources, stored replay after wrapper restart, current authorization,
lost claim/result commits, failed persistence, stale leases, unknown/rejected
outcomes, corrupt signatures/accounts, integer precision and action mutation.
Their ephemeral journal is test-only. The separately packaged walkthrough journal
is also an example fixture, not deployment storage.
It proves wrapper behavior, not PostgreSQL concurrency, disk durability, backup
restoration, live provider idempotency or deployment authorization.

Run the same scenarios against your real adapter, including two processes,
network/storage outages and restore/reconciliation, before returning readiness.
The default CLI, raw backend interface and existing host compositions are
unchanged. Existing hosts can continue supplying their own reviewed provider
decorator; the new wrapper is an additive integration option. Its new 409 errors
are recorded in the generated provider OpenAPI contract. No package is published
and no production service is activated by this change.

The optional [Relayer execution profile](openzeppelin-relayer.md) uses the same
lifecycle with `kind: relay_transaction` and stores its verified provider
`transactionId` as the acceptance result. Hosts enabling it must support that
journal variant and a strictly read-only `read` method for status checks.
Existing signing integrations need no execution capability.
