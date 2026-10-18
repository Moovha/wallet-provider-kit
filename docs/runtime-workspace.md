# Operate contracts and policies through forms

After enabling runtime configuration in [Policies](setup-wizard.md#_4-policies)
and deploying the export, open `/operator/` on your provider host. This workspace
lets applications register contract methods and lets your operators review and
publish policies through forms. It also shows enabled wallet batches. Use it when
contracts change after initial setup; adding a proposal alone grants no wallet
access or spending authority.

## Set up access

In the local setup wizard's **Policies** step, enable **Runtime configuration**,
then choose a separate provider operator client ID. With bundled authentication,
the issuer and token subject are filled automatically, and setup registers the
operator and generates its missing secret privately. With an existing issuer,
register the separate operator client there and enter its issuer and token subject;
the issuer must match Services. Deploy the exported
configuration using the normal deployment process. The runtime workspace becomes
available on that provider host after installation; it is separate from the
local setup session.

For bundled authentication, the operator's service requests a five-minute
client-credentials token from `/oauth/token` using its separate retained secret.
Application credentials cannot obtain operator write scopes. See
[bundled operator access](bundled-setup.md#connect-a-server-application).

Give the operator a short-lived provider API access token with
`wallet:configuration:write`, the configured audience and the exact configured
issuer/client/subject. Applications need `wallet:configuration:read` and
`wallet:configuration:propose`. Both the application registration and the
operator identity must already be trusted in the provider configuration.

Paste an access token into **Connect**. Use the provider's authorization server;
the API explorer's application token controls are also available for applications.
Those controls cannot issue operator write authority. The workspace accepts API
access tokens, not OAuth client secrets, private keys or owner identity tokens.
Credentials stay in browser memory, clear on disconnect/reload and are never
saved in browser storage or sent through cookies. Use HTTPS outside localhost.

This workspace is a provider API client, not a new OAuth authorization server.
Adding trust roots, operators, chains, wallet drivers or executor capabilities
still requires reviewed deployment configuration. The financial profile requires
the [wallet and executor runtime opt-ins](runtime-configuration.md#use-registered-contracts-for-consent-and-execution)
and current owner consent.

## Register and review methods

1. Connect as an application. Select **Add contract**, paste the deployed Base
   Sepolia address and choose **Load verified methods**. The form loads verified
   methods and bytecode pins from Sourcify. All discovered methods are selected
   by default when there are at most 32; uncheck any methods you do not need.
   For more than 32, explicitly select up to the policy limit. Native-value
   fields use decimal wei and new methods default to zero.
2. Check **Policy changes** and submit the registration. Until the provider has
   published a baseline policy and allowed automatic registration, proposals wait
   for provider review. Registration alone grants no spending authority.
3. Connect as a provider operator. Select the application and **Review proposal**.
   Inspect changes, bytecode pins, methods, total/per-method native-value ceilings,
   call count, validity and required application claims. Expand **Current published
   requirements and pins** to compare the proposal with the active policy.
4. Select **Publish policy**. Publishing is immediate and preserves immutable
   revision history. Applications must obtain renewed financial consent to the
   published revision before new signing or execution effects.

### Verified lookup and ABI fallback

Verified lookup sends the public Base Sepolia address directly from your browser
to [Sourcify's contract lookup API](https://docs.sourcify.dev/blog/apiv2-lookup-endpoints/).
It sends no provider token, cookies or referrer and follows no redirects. The
provider's browser policy permits that fixed verification origin for this feature.
Lookup is an explicit action; entering an address alone makes no external request.

For a single EIP-1967 proxy implementation, lookup fills both bytecode pins and
combines the verified proxy and implementation methods. Nested proxies, diamonds
and other implementation layouts are not automatically imported. Overloaded
functions retain their full canonical signatures; events, constructors and
fallback/receive handlers are excluded. Read-only methods are labelled by ABI
mutability and may be selected too. Selector collisions are rejected.

If verification is unavailable, expand **Upload or paste an ABI**. Upload a JSON
ABI/compiler artifact, or paste its ABI JSON and choose **Import ABI**. Supply
reviewed bytecode and implementation pins manually when lookup could not provide
them. Imports accept at most 512 KiB; lookup has the same response limit and a
12-second timeout. Changing an address clears pins supplied by its prior lookup.
Manual signature and pin entry remains available.

Sourcify's verified bytecode is registration metadata, not a fresh independent
chain observation. An uploaded ABI is also a declaration; it does not prove that
its functions match deployed code. Actual execution retains current code/proxy
checks, policy publication and owner consent. Loading or selecting methods never
publishes a policy, signs or submits a transaction.

The initial registration form suggests four calls, zero native value and a
300-second validity window. These are proposed terms until provider publication;
they do not replace provider startup limits or identity requirements. Required
runtime claims are checked against the trusted application's attested values and
verified evidence time, not arbitrary user-supplied form fields.

The experimental registry retains up to 256 proposals and 1,024 publications
per application. The workspace shows the latest 20 proposals for the selected application.
Published proposals display their publication revision. Expand **Published policy
history** for the latest 20 immutable publications, including direct provider
updates, their publisher references and requirements. Stale proposals cannot
publish over a newer revision. Older proposal/revision records remain readable
through their authenticated APIs. Rollback means publishing a new revision with
reviewed earlier terms; it never rewinds an old revision.

## Allow automatic contract registration

After publishing an application's baseline policy, select **Allow contract
registrations**. **Automatic acceptance** is the default choice in this approval
form. The provider can choose **Manual provider review** instead or switch back
later. Applications cannot change this decision.

Automatic mode accepts subsequent valid contract and method changes for that
application when every other policy field exactly matches its enabled current
publication. Contract addresses, code/implementation pins, methods and their
native-value ceilings can change within that published total native-value limit.
Required claims, total value, maximum call count, validity, chain and enabled state
remain provider controlled. Proposals changing those terms wait for review.
Existing pending proposals are not accepted retroactively. Disabled policies stay
disabled.

Each accepted registration creates a new immutable policy revision and an audit
event linked to the provider's review decision. It still requires current owner
consent, grant/claim checks, actual code verification, durable attempt authority,
provider budgets and the accepted execution mechanism. Automatic contract
acceptance does not establish protocol-specific swap, bridge or payout outcomes.

The review API is
`POST /v1/runtime-configuration/applications/{applicationId}/review`. Supply the
mode, current `expected_revision`, current `expected_review_revision` (initially
`"0"`) and a UUID idempotency key. Concurrent stale changes return 409. Exact
retries return the original decision even after subsequent decisions, without
reactivating it. Up to 1,024 review decisions per application are retained in this
bounded experimental profile.

## Track wallet batches

Select **Load batches** and filter by batch ID, account ID or queue stage. The
view returns up to 100 readable batches and indicates omissions. Providers see
the active deployment's ledger using their exact operator identity. Applications see
only batches for their own issuer/client/subject and current owner account-read
grant; revoked access removes those batches from application lists. Provider
ledger access never impersonates the application or grants spending authority.

Queue stages describe scheduling. The list displays retained finalized
RPC-quorum receipts; unfinalized observations remain pending in the list.
Applications can select **Refresh status** to call `wallet_getCallsStatus` for
fresh inclusion evidence using `wallet:access:read` and `wallet:execute:read`.
Successful inclusion is distinct from finality. Providers inspect stored worker
observations and can reload the ledger without initiating execution. No list or
status read signs, dispatches, retries or advances a batch.

The UI uses `GET /v1/runtime-configuration/workspace`, with `application_id` to
load selected policy/proposal details, and
`GET /v1/runtime-configuration/batches` for batch summaries. The batch view needs
the configured [EIP-5792 Safe profile](wallet-calls.md). Applications can query a
retained batch outside the bounded list using its original ID and account's
standard wallet API. A missing or unknown result is not evidence that submission
failed; retain original IDs and inspect the outcome before retrying.

## Resolve errors

For denied access, check token expiry, scopes, audience and configured identity.
A write scope alone cannot make an application an operator. For a 409, refresh
and review current policy and review revisions before submitting a new change.
The workspace retains the same mutation key for an identical retry after a
failed response while the page remains open. Refreshing the workspace reads
recorded outcomes; reloading the page clears credentials and in-memory retry
state. For 503 or a lost connection, inspect the original outcome before making
a different submission. Unconfigured batch execution does not prevent contract
registration and policy review.
