# Admit and sign sponsored Safe operations

Advanced embedded hosts can use `Safe4337SigningService` to reserve sponsorship
and sign exact Safe operations through their protected wallet backend. The
configured CLI, setup wizard and HTTP service do not enable this adapter yet.
Bundler submission, receipt reconciliation and `paymasterService` discovery remain
separate release milestones. Existing relayer execution remains supported.

## Bind one stored operation to one mechanism

Use the same `SupportedActions` instance, toolkit SQLite database and stable
stored operation ID for both mechanisms. `requestCalls` creates the common stored
contract-call operation using the existing caller/idempotency identity; `admit`
can instead accept its existing action ID. Reusing an idempotency key through the
relayer and sponsorship interfaces resolves to that same operation. Applications
must retain that identity across retries. New keys or distinct operation IDs are
new business requests; matching calldata alone cannot identify duplicate business
intent.

A transactional mechanism binding is acquired before relayer signing/submission
admission or ERC-4337 sponsorship reservation. A relayer operation cannot later acquire a
SafeOp signature; an ERC-4337 operation cannot obtain a SafeTx signature. The key
includes the caller, owner, signing account and operation, and excludes backend
namespace/provider selection. Historical v1 signing admissions also block an
opposite mechanism, including failed or unknown attempts. Bindings have no expiry
or automatic release.

ERC-4337 admission reserves the existing contract-operation allowance and the
shared application gas allowance in the same SQLite transaction as that binding.
An insufficient counter rolls back all three. The application gas identity and
lowest configured sponsor-pool ceiling are shared with the relayer. Configure one
reviewed application allowance for both adapters; include every driver, sponsor
pool and spending term in the host's active deployment revision. Each estimate
must already include bounded nonzero account gas and fee values. The reservation
includes the configured maximum paymaster validation/post-operation gas and chain
fee reserve. Final signing does not charge another operation unit.

Do not create a separate store or budget namespace for each mechanism. The
lower-level `database.sponsorship` methods are trusted infrastructure ports, not
request handlers. Reservation and phase claims require the shared transaction
inside `SupportedActions.withAuthorizedTransfer`. They do not supply user
permission checks by themselves.

## Require current authority and separate sponsorship consent

The adapter reuses current owner/account binding, identity evidence, grants,
contract delegation, runtime claims/publication, exact calls, native-value limits
and active deployment checks from `SupportedActions`. A separate mandatory
`authorizeSponsorship` port resolves the owner's current persisted consent to the
exact `SponsorshipConsentTerms`. It must verify the operation, configuration,
accepted account driver, paymaster, gas ceilings, validity and terms hash. A
registered contract or OAuth scope cannot satisfy that port.

Keep that consent in the host's reviewed authorization store. Return its stable
reference and the accepted terms hash only when the current owner has authorized
those terms. Deny revoked, stale or unavailable records. The callback is checked
again before either paymaster RPC, signing and saved-result replay. This library
port does not add a consent screen or turn existing contract delegation into
blanket sponsorship consent.

```ts
import { Safe4337SigningService } from '@moovha/wallet-provider-kit/sponsorship';

// These are trusted, reviewed host integrations; none comes from an HTTP body.
const sponsorship = new Safe4337SigningService(
  actions,
  database,
  acceptedSponsorshipConfiguration,
  {
    backend: protectedSigningBackend,
    authorization: paymasterCredential,
    authorizeSponsorship: authorizeStoredSponsorshipConsent,
  },
);
const admission = await sponsorship.requestCalls(
  context,
  registeredContractCalls,
  estimatedUnsignedOperation,
);
await sponsorship.sponsor(context, admission.operation_id);
const signedOperation = await sponsorship.sign(context, admission.operation_id);
```

The protected backend is unwrapped: the adapter supplies its own SQLite financial
journal and exact SafeOp authorization. Do not bypass it with a generic signing
endpoint or expose its backend. Supply both `wallet:actions` and `wallet:sign`
scopes when signing, alongside current stored permission.

## Accept the account and signature profile

The first signing profile pins Safe 1.4.1, Safe4337Module 0.3.0, EntryPoint v0.7
and Base Sepolia. It supports one EOA owner, threshold one, a predeployed Safe and
EntryPoint nonce key zero. Factory deployment, signature aggregation, arbitrary
modules, EIP-7702 and other chains remain unsupported.

Two independently operated HTTPS RPC endpoints must agree at a common block.
The verifier checks chain/genesis, proxy/singleton, exact code hashes and supplied
EIP-1967 implementation pins for the accepted infrastructure and call targets.
It checks the owner, threshold, Safe version, exactly one enabled module, the
module as fallback handler, zero Safe guard, the module's EntryPoint and exact
EntryPoint nonce. Reorgs and disagreement deny before effects. The existing
SafeTx verifier retains its zero-module requirement. Accept real bytecode and
account configurations independently before enabling this profile; fixtures do
not supply trustworthy production pins.

SafeOp EIP-712 data binds every operation field, including fees, paymaster data,
validity and EntryPoint, to the module domain. Its digest is distinct from SafeTx
and EntryPoint's UserOperation hash. The backend signature must recover the bound
EOA owner; the emitted wire signature contains the two uint48 validity fields and
one canonical 65-byte EIP-712 signature. No personal-sign, prevalidated or contract
signature fallback is accepted. The encoding follows the
[versioned Safe4337Module source](https://github.com/safe-global/safe-modules/blob/4337/v0.3.0/modules/4337/contracts/Safe4337Module.sol).

## Retain uncertainty and recover safely

Stub and final requests each have a durable fenced phase. Successful results can
be replayed under current authority without contacting the paymaster again. A
final stub skips the second RPC. Dispatch, lost responses, expired leases and
unknown signing outcomes never become retry permission or a relayer fallback.
The adapter conservatively retains both reservations after failures, including
when a post-claim authority check prevents contact. It does not automatically
refund usage or retry with changed estimates. Reconciliation and evidence-based
release remain later execution/recovery work.

The adapter persists usable sponsorship data and signatures in the private
SQLite database. Protect the volume and backups as authorization material. Keep
all workers on a revision that enforces mechanism bindings; do not run old
binaries against an activated sponsorship store or restore stale snapshots into
an active signing service. Historical admission checks preserve v1 evidence;
they cannot make an old executable enforce a new lock. Quiesced upgrade,
backup/restore and rollback acceptance remain activation gates.

Offline tests exercise real SQLite transactions, runtime publications, current
claims/grants, shared budgets, independent hash vectors, accepted-account denial,
concurrent connections, result replay and restart uncertainty. No funded
operation, real provider/bundler interoperability, contract installation or
production readiness is established by those tests.
