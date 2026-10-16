# Test an application-led staging deployment

Use a reviewed toolkit revision and its matching wizard. This walkthrough tests
the standard application-led flow on an isolated, unfunded Base Sepolia deployment.
Users stay in the application. Hosted compatibility deployments use the separate
[hosted guide](onboarding.md); no provider user login or staff review is part of
this standard acceptance run.

## 1. Check prerequisites and record gaps

Prepare HTTPS, a supported wallet backend and recovery process, private persistent
storage, an application token issuer and an admitted application. Review the
application's identity and consent trust agreement and its evidence retention,
withdrawal and incident processes. Use approved test identities and records only.
An operator token panel is optional; its staff login is not a user-access prerequisite.

Record any unavailable service or untested boundary as blocked. Offline fixtures
cannot certify your real application assertions, backend or recovery.

## 2. Configure and export in the GUI

Configure token issuer/audience/JWKS in Services. In Policies, choose
**Application-led access (standard)** and set identity level, required fields,
application registrations, trust-agreement references, allowed permissions,
identity age and access duration. Choose a backend
and private storage. Keep wallet operations disabled initially. Enable the deployed
API explorer if needed, then validate. Choose automated local setup for a local
container evaluation or download all three files for manual deployment.

## 3. Start the isolated deployment

For CDP or Relayer on a local machine, follow [local setup](local-setup.md) to supply
missing secrets and watch the executor prepare files, build, initialize once,
diagnose and start disabled. For manual or OWS setup, follow [deployment](operator-deployment.md).
Add HTTPS in either case. Keep the origin and backend binding stable.
Check `GET /v1/capabilities`: disabled activation should report `configured: false`.
Complete the backend's isolated lifecycle/recovery acceptance and the authority
checks below before admitting users. Record real reports and explicitly enable
operations through a reviewed export. Do not use invented report references.

## 4. Create an unfunded account and access it as application A

In the deployed explorer, obtain an application token and execute
`GET /v1/access-policy`. Expect `flow: "application"`, the current `policy_revision`,
required identity fields/level, age limits, and both `provider_login_required` and
`provider_review_required` false.

In application A, complete the test user's sign-in and identity checks and record
wallet-access consent for those policy terms. Submit `POST /v1/access-requests`
with a new UUIDv4 idempotency key and the actual assertion described in
[application-led access](application-access.md#request-access). Expect `granted`,
account/grant IDs, permissions and expiry, with no consent URL. No browser redirect
or manual review should occur. Save the receipt and key privately.

Call `POST /v1/accounts/{accountId}/provision` with `{}`, `wallet:provision` and an
idempotency key. Read the address through the account endpoint. Do not fund it.
A permitted replay must return the same account/address without another backend
creation. A fresh access request for the same application user must resolve to the
same account; it must not create another wallet.

## 5. Exercise policy denials in the deployed GUI

Verify denial before wallet effects for:

- Missing application trust agreement, disabled/unknown application or wrong scope.
- Missing user assertion, wrong identity level, missing required fields, future or
  stale verification, expired consent or the wrong policy revision.
- A second application claiming A's account ID, even with an identical user ID.
- A different user reusing A's evidence reference within the same application.
- A changed body under the original idempotency key (409).

Use the application's withdrawal control to call the grant-revocation endpoint.
Subsequent account access, provisioning and saved-result replay must be denied.
An old consent record under a fresh request key must not restore access. Renew
only with a new reference, later consent time and current accepted evidence.
Changing provider policy must invalidate previous grants.

If testing delegated transfers, obtain explicit consent for the exact transfer
policy revision inside the application. Verify missing/wrong revision is denied,
and changed terms invalidate existing transfer delegation. Signing, broadcast,
gas funding and settlement are separate acceptance exercises. Issued signatures
may remain usable after grant revocation until on-chain expiry.

## 6. Exercise durable replay and recovery

Restart against the same private database and backend binding. Verify the wallet
address, ownership and grant survive. Exercise concurrent provisioning and confirm
one durable creation attempt per account. Simulate a lost response in an isolated
fixture or vendor-approved test environment; investigate the original attempt
read-only before any retry. A new key cannot make an uncertain mutation safe.

Back up and restore the SQLite records and any OWS vault together. Ensure only one
authoritative copy runs. Verify revocations, policy fencing, signer bindings and
uncertain attempts survive restoration. Do not reset records to manufacture a
successful recovery result.

## 7. Decide acceptance and retain the deployment

Record the tested revision, configuration, application contract, backend profile,
results and remaining gaps in private deployment records. Mark untested cases
pending. Wizard validation, screenshots and offline test success do not establish
real-service acceptance. Retain the deployment and recovery records; do not use a
new empty database as recovery for existing wallets.
