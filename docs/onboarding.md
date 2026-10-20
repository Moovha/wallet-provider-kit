# Provider-hosted access (compatibility)

Use this guide for an existing deployment that explicitly needs provider-hosted
login, consent pages and staff identity review. Select that compatibility mode in
[Policies](setup-wizard.md#_4-policies); omitted mode in legacy configurations also
retains it. The usual wallet setup keeps identity and consent in the connected
application, as described in the [access contract](application-access.md).
Do not switch an occupied store between these ownership models without a reviewed migration.

For this compatibility deployment, [configure the service](setup.md) with hosted access explicitly selected.
The programmatic onboarding-only profile below remains available for advanced
composition and deliberately denies signing; the configured service can add the
provider-authorized transfer profile with explicit onboarding delegation.

Give users one clear path to open a wallet, share identity evidence and choose
which applications can use their account. Your provider keeps acceptance,
authorization, signing and recovery under its control.

This is an experimental single-host reference integration. It has offline
conformance evidence; real vendor accounts, identity-service setup and backend
recovery still need acceptance testing before you enable it.

## Applications, clients and owner login

A **connected application** is software asking to access a user's wallet account.
Its OAuth registration is called a **client**. The **account owner** is the user
who signs in and approves access; it isn't the application client. Your **host**
is the wallet service's server application, where the toolkit runs.

In the configuration template, `policy.applications[]` lists allowed connected
applications. Each entry has a trusted `issuer`, a matching `clientId`, a display
`name` for the consent screen and permitted access. The application's checked
access token supplies `client_id`; the host receives it as
`VerifiedPrincipal.clientId`.

`ownerLogin.clientId` is a separate registration for the wallet provider's login
with its existing identity service. It signs the owner in to the consent screen.
Registering an application client doesn't register or approve a user. See
[roles and terms](concepts.md) for grants, authority, backends and journals.

## Set it up

1. Copy the example into your application and set your provider's HTTPS origin
   and privacy notice. Choose the application clients you permit.
2. Register a confidential OIDC login client with your existing identity service.
   Its exact callback is `https://your-provider/onboarding/callback`. Enable
   authorization code, PKCE S256 and signed RS256 or ES256 ID tokens with
   `auth_time`. The toolkit handles state, nonce, code exchange and sessions.
   Your identity service handles registration, login, MFA and recovery.
3. Configure the OAuth issuer, audience and JWKS for application API access.
   Register applications separately from the provider's owner-login client.
   An application client credential cannot approve a user's consent.
4. Add your provider reviewers' OIDC subject IDs. Reviewers use
   `/onboarding/review`; users manage access at `/onboarding/access`.
5. Choose Didit, Sumsub or both, using recipient credentials and a recipient
   workflow/level. Confirm sharing is enabled and agree the funding terms.
6. Initialize the [built-in SQLite database](storage.md), or choose the reference
   file store's private persistent directory, and configure your wallet backend.
   Keep `ready()` false until its unfunded lifecycle and recovery checks pass.

## Defaults you can understand

| Rule               | Default                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Applications       | Explicit allowlist of issuer/client pairs; disabled or unknown applications are denied.                                          |
| Owner approval     | Recent provider login, then explicit consent to this application's requested permissions and identity sharing.                   |
| Identity           | Provider review is required; importing an approved vendor profile never accepts a customer automatically.                        |
| Freshness          | Identity evidence no older than 365 days; configure a shorter period for your product.                                           |
| Access duration    | At most 30 days, also bounded by the provider's identity acceptance expiry.                                                      |
| Permissions        | `account:read`, `operations:request` and explicit `contracts:request`, separately requested and checked.                         |
| Verification costs | Requester-funded under an agreed contract and monthly cap. Missing prices or agreements pause paid work.                         |
| Wallet creation    | Separate authorized request after acceptance and consent, with one durable attempt per account.                                  |
| Signing            | No signing in the ready-made onboarding profile. An exact-action authority and its financial journal are a separate integration. |

These are technical defaults, not a universal compliance policy. Your team sets
the workflow/level, evidence requirements and review process for its product.
Changing the policy, enabled applications or built-in vendor workflow/level
invalidates earlier decisions and grants. Credential rotation does not. Keep a
readable `version` for your audit history; the kit also fingerprints configuration.

## What a user experiences

The requesting application starts a **create** or **connect** request and opens
the returned provider consent URL. The user signs in with the provider and sees
the application, permissions, duration, privacy notice and identity-sharing
purpose. They can allow or decline.

For a new customer, the application can share existing KYC evidence. Alternatively,
the user can open a Didit or Sumsub hosted verification from the provider screen
when an agreed budget covers it. Documents stay in the vendor's verification
flow; the toolkit stores references and decisions.

A provider reviewer checks the recipient evidence and its correspondence with
the authenticated provider user. Vendor approval, token possession and a matching
name alone are insufficient. The reviewer records the actual verification date
and accepts or declines. Acceptance creates a local customer/account binding and
a restricted grant for the permissions the user approved. A separate provisioning
request creates the wallet; acceptance itself never calls the signing backend.

For an existing toolkit account, owner authentication and current provider
acceptance let the user approve another application without repeating KYC.
Concurrent create requests for the same provider user converge on one account.
External legacy account imports require a reviewed ownership/migration adapter;
an arbitrary account ID is never adopted automatically.

Users can pause or revoke grants. They can also cancel a pending request from the access page, even if its access
link has expired. Cancellation blocks further acceptance/access; an already
dispatched verification may still finish and incur its agreed cost.

Request links last 24 hours. Your provider can finish an already-consented identity
review after that without granting expired application access. A fresh request
and owner approval then reuse the accepted identity without another import/check.

To reconnect, renew, or change permissions, the
application starts a new connect request and obtains consent again. The provider
stores the new grant and revokes the superseded grant for that application/account.
This prevents an older permission set remaining active after renewal. The provider
can suspend an account and revoke its grants from the review page. Reacceptance
requires a new review and consent; old revoked grants remain revoked.

## Application API

Use a dedicated RFC 9068 API token and a UUIDv4 `Idempotency-Key` on POSTs.

```json
{
  "mode": "create",
  "authorization_details": [
    {
      "type": "https://moovha.com/wallet/account-access",
      "actions": ["account:read", "operations:request"]
    }
  ]
}
```

For **connect**, supply `"mode": "connect"` and `account_id`. The initial response
has the same shape for known and unknown accounts; ownership is checked after
provider login. Account IDs are returned to the application only after access
is granted. No name, document, evidence reference or login subject is returned.

| Request                                  | API scope             | Purpose                                                                                       |
| ---------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `POST /v1/access-requests`               | `wallet:access`       | Start create/connect; get request ID, status and consent URL.                                 |
| `GET /v1/access-requests/{id}`           | `wallet:access:read`  | Poll the authorized request; obtain grant/account IDs, permissions and expiry after approval. |
| `POST /v1/access-requests/{id}/identity` | `wallet:access`       | Submit `vendor` (`didit`/`sumsub`) and opaque `share_token`, after owner consent.             |
| `GET /v1/accounts/{id}`                  | `wallet:account:read` | Read address/status through a current `account:read` grant.                                   |
| `POST /v1/accounts/{id}/provision`       | `wallet:provision`    | Create the accepted account's wallet through current access and a durable journal.            |

Safe calls require current `contracts:request` consent bound to `action_policy_revision`. Use the [wallet API](wallet-calls.md) for approved batches.

`operations:request` means an application may ask the financial host to prepare
an operation. It is never unrestricted signing permission. The ready-made
profile denies `/v1/actions/{id}/sign`. A financial integration must supply the
exact stored action, approvals, limits and dispatch-time checks described in the
[provider guide](provider-guide.md).

Request states explain the next step: `consent_required`, `verification_required`,
`funding_approval_required`, `identity_pending`, `provider_review_required`,
`reconciliation_required`, `granted`, `denied`, `expired`, `suspended`, `revoked`
or `policy_changed`. Policy changes and expiry require a new request. Receipts
are identifiers and decisions, not bearer credentials or OAuth tokens.

## Identity reuse and cost

**Didit:** recipient-bound Share Session import uses `trust_review:false` and your
configured workflow. Provider review reads the recipient session with its own
credentials. The common session timestamp does not prove the original identity
verification date; the reviewer establishes freshness from the source evidence.

**Sumsub:** Reusable KYC Share uses your recipient level, signed API requests and
`preservedVerificationStatus:false`. Configure the newer Share feature explicitly;
the legacy service ignores the newer body controls. Matching steps are reused;
recipient checks can run according to your level. Share tokens remain opaque.
The adapter also supports hosted WebSDK verification and lookup by the toolkit's
opaque correlation ID. Gateway/Sumsub ID and cross-vendor data conversion are
separate integrations and are not activated by this adapter.

Provide `importPrice` and optionally `verificationPrice` only after confirming
an upper bound covering **all** checks your configured workflow/level can run:

```ts
importPrice: {
  maximumMinor: agreedMaximumUsdCents,
  termsReference: 'your-confirmed-vendor-terms',
}
```

The application also needs `funding: { agreement, monthlyLimitMinor }`. The kit
reserves the configured maximum atomically before dispatch and retains the
reservation on an uncertain result. Confirm recipient-vendor charges for the
configured workflow/level and record your agreed terms. Zero-cost reuse still
requires confirmed terms and an explicit agreement; no vendor price is assumed
by the toolkit.

This is a reservation/reimbursement ledger, not a payment processor or vendor
billing cap. Recipient credentials can cause vendor charges to the provider;
the requester's agreement covers reimbursement. Your commercial arrangement
must cover that distinction. Review vendor-side workflow and price changes
before enabling them; the kit cannot discover an undeclared vendor charge.

## Storage and recovery

For SQLite, pass `database.onboardingStore` as `storage` instead of
`storageDirectory`. It persists the same onboarding records and can also store
financial approvals and journals through an explicit financial integration. See
[SQLite setup and recovery](storage.md). Existing file-store data is not imported
automatically; arrange a reviewed migration before switching an active provider.

The bundled file store gives this experimental profile a working durable path
without requiring a customer database schema or migration. It serializes across
processes with an exclusive directory lock and commits via atomic rename,
file fsync and directory fsync. Data and journals are private (0700 directory,
0600 state file); no share token, API access token, ID token, name or document
is persisted. Short-lived PKCE verifiers, owner subject references and vendor
hosted links are private authentication material; protect the directory and backups.

Use a persistent local POSIX filesystem on one host, with a dedicated directory
per provider environment. Network filesystems, shared container replicas,
ephemeral container disks and Windows are unsupported. The 16 MiB state limit
fails closed; this small reference store is not a high-volume database. A scalable
`OnboardingStore` can replace it after schema inspection and equivalent transaction,
concurrency and crash tests. There is no automatic audit-record pruning.

If an import response is lost, the kit never redeems another token automatically.
A pending attempt older than 30 seconds is shown as requiring reconciliation.
Reviewers find the original recipient session/applicant by correlation and supply
its reference in the review screen. They still verify ownership and freshness.
Fresh Sumsub checks can be read by correlation without an applicant ID.

For uncertain wallet creation, reviewers use **Check wallet creation**. The kit
calls the backend's read-only lookup and restores the original receipt when found;
it never creates another wallet as a probe. A missing lookup result does not prove
that creation failed or release a reservation.

A crash during the file transaction can leave `transaction.lock`. It is never
stolen by a timeout. Stop all processes using this directory, preserve the state,
check for incomplete attempts, and remove only that lock directory before restart.
Never edit the state to make an uncertain attempt dispatchable. Host/database
failure, missing evidence and unknown policy all deny effects.

## Protocol references

The configuration uses a fixed typed policy profile. Your existing OIDC service
owns user login and recovery; the toolkit uses `openid-client` for authorization
code exchange, PKCE and signed-token checks. Application API access uses a
separately configured OAuth resource-server audience.

The access-detail vocabulary follows
[OAuth Rich Authorization Requests](https://www.rfc-editor.org/rfc/rfc9396.html).
The request routes and wallet detail type are toolkit-specific; this package does
not implement an OAuth authorization server or the complete RAR protocol.
Identity reuse and hosted flows use the supported recipient-vendor interfaces:
[Didit import](https://docs.didit.me/sessions-api/share-session/import),
[Didit session](https://docs.didit.me/sessions-api/retrieve-session),
[Sumsub reuse](https://docs.sumsub.com/reference/reuse-applicant-for-reusable-kyc)
and [Sumsub hosted link](https://docs.sumsub.com/reference/generate-websdk-external-link).
Check vendor compatibility and agreed terms before activation.

The [OIDC Identity Assurance enrollment](enrollment.md) guide covers the alternative
lower-level profile. Choose one profile per server; neither identity evidence nor
access consent replaces financial-action authority.
