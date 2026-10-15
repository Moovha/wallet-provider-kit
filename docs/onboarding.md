# Onboard users and connect applications

Give users one clear path to open a wallet, share identity evidence and choose
which applications can use their account. Your provider keeps acceptance,
authorization, signing and recovery under its control.

Start with [the single configuration example](provider.config.example.ts).
`createOnboardingProvider` supplies hosted consent, provider review, persistent
grants and journaled wallet creation. You configure your provider, approved
applications, existing identity service and selected wallet backend. There is
no policy scripting language, administrative CLI sequence or separate policy
server to operate.

This is an experimental single-host reference integration. It has offline
conformance evidence; real vendor accounts, identity-service setup and backend
recovery still need acceptance testing before you enable it.

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
6. Choose a private, persistent local storage directory and your wallet backend.
   Keep `ready()` false until its unfunded lifecycle and recovery checks pass.

The example uses the existing CDP Base Sepolia adapter to show a concrete backend.
You can select another supported adapter without changing the onboarding policy.
The normal `npm start` preview remains unconfigured; it does not discover or load
configuration modules from HTTP input.

## Defaults you can understand

| Rule               | Default                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Applications       | Explicit allowlist of issuer/client pairs; disabled or unknown applications are denied.                                          |
| Owner approval     | Recent provider login, then explicit consent to this application's requested permissions and identity sharing.                   |
| Identity           | Provider review is required; importing an approved vendor profile never accepts a customer automatically.                        |
| Freshness          | Identity evidence no older than 365 days; configure a shorter period for your product.                                           |
| Access duration    | At most 30 days, also bounded by the provider's identity acceptance expiry.                                                      |
| Permissions        | `account:read` and `operations:request`, separately requested and checked.                                                       |
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

Users can pause or revoke grants. To reconnect, renew, or change permissions, the
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
reserves the maximum atomically before dispatch and retains the reservation on
an uncertain result. Zero-cost reuse still needs confirmed terms and an explicit
agreement. No public vendor price is hardcoded: Didit's official pages currently
disagree on B2B import charges, and Sumsub charges recipient-configured services
under its terms. See [Didit pricing](https://didit.me/pricing/),
[Didit B2B reuse](https://didit.me/products/reusable-kyc/),
[the conflicting Didit page](https://didit.me/solutions/reusable-identity-once/)
and [Sumsub terms, section 12](https://sumsub.com/terms-and-conditions/).

This is a reservation/reimbursement ledger, not a payment processor or vendor
billing cap. Recipient credentials can cause vendor charges to the provider;
the requester's agreement covers reimbursement. Your commercial arrangement
must cover that distinction. Review vendor-side workflow and price changes
before enabling them; the kit cannot discover an undeclared vendor charge.

## Storage and recovery

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

## Why this shape

We follow [Ory's separation of login and consent](https://www.ory.com/docs/oauth2-oidc/custom-login-consent/flow)
and the explicit, versioned resource/action approach in
[Cerbos policies](https://docs.cerbos.dev/cerbos/latest/policies/resource_policies.html).
This narrow profile does not require either server or introduce a general policy
language. [`openid-client`](https://github.com/panva/openid-client) implements the
OIDC code client, including PKCE and signed-token checks; we do not build an
authorization server.

The access-detail vocabulary follows
[OAuth Rich Authorization Requests](https://www.rfc-editor.org/rfc/rfc9396.html).
These request routes and the wallet detail type are toolkit-specific; this is
not an implementation of the OAuth RAR authorization-server protocol. Login uses
[OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html) and
[current OAuth security guidance](https://www.rfc-editor.org/rfc/rfc9700.html).
Vendor behavior follows the official
[Didit import](https://docs.didit.me/sessions-api/share-session/import),
[Didit session](https://docs.didit.me/sessions-api/retrieve-session),
[Sumsub reuse](https://docs.sumsub.com/reference/reuse-applicant-for-reusable-kyc)
and [Sumsub hosted link](https://docs.sumsub.com/reference/generate-websdk-external-link)
contracts, researched 15 October 2026.

The earlier [OIDC Identity Assurance enrollment](enrollment.md) remains available
as a separate lower-level profile. Choose one profile per server; the toolkit
rejects combining them so an acceptance path cannot silently bypass the other.
