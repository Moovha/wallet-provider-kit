# Enroll a user before creating their wallet

For a ready-made flow with hosted consent, provider review, Didit/Sumsub evidence
and access grants, use [onboarding and application access](onboarding.md). This
guide describes the separate OIDC Identity Assurance profile for existing hosts.
Start with [installation](package.md) and [backend integration](backend-guide.md)
before composing it with your wallet service.
Do not submit vendor share tokens as OIDC ID tokens. A server chooses one profile.

An orchestrator can request a wallet for a named user without deciding whether
your provider should accept that user. Enrollment lets you check identity
evidence, collect consent and apply your policy before provisioning. Your team
keeps the acceptance decision, customer records, signing access and recovery.

The implementation uses a narrow profile of
[OIDC Core ID tokens](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
and [OpenID Connect for Identity Assurance `verified_claims`](https://openid.net/specs/openid-connect-4-identity-assurance-1_0.html#verified_claims).
The enrollment routes, statuses and storage contract are toolkit-specific.
This is not an OIDC provider, KYC vendor or certified identity-assurance product.

## The flow

1. An authenticated, permitted application starts enrollment with the intended
   user's **issuer/provider-scoped opaque subject** (1–255 printable ASCII characters).
   This is a claim until proof
   arrives; it is not a phone number or an OAuth service-account subject.
2. Your host authorizes the request and durably reserves the enrollment ID,
   account ID and unique nonce. It returns the original challenge on an exact
   idempotent retry. No wallet or spend grant exists at this point.
3. Your provider conducts its registered OIDC authorization-code flow with the
   configured identity issuer. Reuse that issuer's existing user login where
   supported. Request the nonce, fresh authentication (`max_age=300`) and the
   required verified claims. The provider owns the redirect, state/CSRF checks,
   PKCE S256, code exchange and RP credentials; never give its client secret to
   the orchestrator. This surrounding OIDC interaction is a host integration.
4. Submit the resulting ID token to the enrollment service. The kit checks its
   signature, issuer, provider audience, nonce, requested subject, lifetime,
   fresh authentication and verified-claim profile. An ID token minted for the
   orchestrator's own OIDC client cannot be forwarded as provider evidence.
5. Your host checks independently established consent for this user, provider,
   wallet product and data sharing. It applies its trust-framework, KYC and risk
   policy and stores **accepted**, **needs_verification** or **rejected**. A valid
   signature proves provenance; it does not compel acceptance.
6. A separate authorized provisioning request uses the reserved account ID.
   With enrollment enabled, the HTTP route requires current accepted enrollment
   for the same caller/account and the same host-resolved owner. Existing owner,
   current local KYC, grant, quota and durable wallet-attempt checks still apply.

Creation does not activate a spending account or authorize signatures. External
wallet linking, migration and operation approval remain separate. CDP and OWS
can create EOAs; the Relayer adapter binds an already configured signer.

## HTTP contract

Use a dedicated RFC 9068 API access token, not the identity ID token, in
`Authorization: Bearer …`. POSTs require a UUIDv4 `Idempotency-Key`.

| Request                                                        | Body                                                    | Result                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /v1/enrollments` (`wallet:enroll`)                       | `{"identity_subject":"opaque-provider-scoped-subject"}` | 201, `Location`, reserved IDs, nonce, expiry and configured issuer/RP/required claims |
| `POST /v1/enrollments/{id}/identity` (`wallet:enroll`)         | `{"id_token":"<provider-audience OIDC ID token>"}`      | 200, enrollment/account IDs and provider decision                                     |
| `GET /v1/enrollments/{id}` (`wallet:enroll:read`)              | None                                                    | Authorized receipt; no idempotency header required                                    |
| `POST /v1/accounts/{accountId}/provision` (`wallet:provision`) | `{}`                                                    | Existing account/address response, gated on current acceptance                        |

An identity proof can carry verified names, birth date or phone number, but only
the attributes explicitly requested in the provider configuration are admitted.
Responses never echo identity attributes, evidence references or the token.
All routes use `Cache-Control: no-store`. The identity POST has a 34 KiB body
limit and a 32 KiB compact-token limit; other mutations keep their 1 KiB limit.

`accepted` is an enrollment receipt, not a KYC API override or a spend grant.
`needs_verification` and `rejected` consume that challenge too. Additional checks
use a new provider-authorized enrollment, resolving the same customer/account
where appropriate. No automatic background retries or issuer callbacks are added.

## Compose it

```ts
import {
  createIdentityVerifier,
  EnrollmentService,
  EmbeddedWalletService,
  createServer,
} from '@moovha/wallet-provider-kit';

const identity = createIdentityVerifier({
  issuer: trustedIdentityIssuer,
  clientId: providerOidcClientId,
  jwksUrl: trustedIdentityJwks,
  requiredClaims: ['given_name', 'family_name', 'birthdate'],
  maxVerificationAgeSeconds: providerSelectedFreshness,
});
const enrollment = new EnrollmentService(identity, enrollmentAuthority);
const wallets = new EmbeddedWalletService(walletAuthority, journaledProvider);
const app = await createServer({
  authenticate,
  service: wallets,
  enrollment,
  ready: persistentDependenciesAreReady,
});
```

Both authorities and the wallet journal are reviewed host implementations. No
runtime memory store or database adapter is supplied. When calling the library
directly for newly enrolled users, use
`enrollment.provision(wallets, context, accountId)` so acceptance is checked.
Direct `wallets.provision` remains the existing trusted/pre-enrolled integration
path. Servers without `enrollment` keep that behavior and return 503 for enrollment
requests. The default CLI supplies neither authority and stays disabled.

Enrollment never copies an upstream claim into `currentUserStatus`. Your wallet
authority continues to resolve the owner and require current local `ID VERIFIED`.
Your provider decides how accepted evidence informs its own KYC records. The wallet
journal's `authorizeAttempt` must recheck enrollment/consent alongside other
current policy immediately before effects and on replay; an earlier check is not
a durable permission to dispatch.

## Identity profile and limits

- Explicit HTTPS issuer/JWKS and RP client configuration; no token-controlled
  discovery, key URLs, document URLs or evidence fetching.
- RS256/ES256 signed, unencrypted ID tokens; absent `typ` or `JWT` only. OAuth
  `at+jwt` and aggregated `provided-claims+jwt` assertions are different inputs
  and are rejected here. Audience must be the single configured RP client string;
  an optional `azp` must match it.
- Required `iss`, `sub`, `aud`, `iat`, `exp`, `nonce`, `auth_time` and
  `verified_claims`. Token lifetime/age is at most ten minutes. Authentication is
  at most five minutes old; token issuance must follow challenge creation, with
  five seconds of clock tolerance. A recent existing login can be reused. The
  verified authentication time is passed to host policy for any stricter step-up
  requirement. Challenges expire after ten minutes.
- One inline `verified_claims` object with `verification` and `claims`.
  Verification requires `trust_framework`, RFC 3339 `time` with seconds (no leap
  seconds) and an
  opaque `verification_process`; optional `assurance_level` is a string. Your
  policy assesses these values. Verification freshness is an explicit provider
  setting, rechecked before provisioning.
- Supported requested string attributes: `name`, `given_name`, `family_name`,
  `middle_name`, `birthdate`, `phone_number`. The set must be nonempty and exact;
  missing/extra attributes fail. Birth dates must be complete, valid past calendar
  dates. Unverified top-level ID-token attributes are not passed to acceptance.
- Multi-set, aggregated/distributed claims, raw documents, attachments, addresses,
  partial birth dates and other verification fields are unsupported in this first
  profile. Negotiate a compatible claim set or add a reviewed profile; don't strip
  material or reinterpret a different assertion as this one.

The upstream standard supports more shapes; these restrictions are intentional.
It specifies technical identity evidence, not permission to rely on another
entity's KYC. Your provider must establish its applicable reliance and consent
arrangements and remain able to request additional verification.

## Durable host contract

`EnrollmentAuthority` is the only enrollment persistence/policy port:

- `begin`: current client authorization and quotas; atomic reservation of stable
  IDs and a globally unique nonce; idempotency scoped by environment, API issuer,
  subject, client and exact request (including the requested identity subject).
- `load`: current client/grant/object authorization for proof submission and
  receipt reads. Never expose another client's record or include identity data
  in a public error. Reject a previously consumed submission idempotency key
  bound to another enrollment. A GET's generated key is not a mutation identity.
- `decide`: reassess current caller, consent, challenge expiry and provider policy
  in the transaction that consumes the nonce. Compare the immutable challenge,
  atomically bind the submission idempotency key to the caller/resource/proof,
  bind the verified issuer/subject to the local owner/account, enforce
  customer/account uniqueness, and persist the proof hash and decision together.
  An identical proof replay returns its original receipt; a different proof
  conflicts. Never create wallets, grants or signatures inside this callback.
- `forAccount`: authorize current provisioning against an accepted, unrevoked
  binding, independently current consent/policy and acceptance expiry. Return
  null on denial. The kit also compares the local owner with wallet authority.

Use narrowly privileged, transactional storage. Schema design requires inspection
of your actual database; this kit proposes no migration. Keep nonce/proof hashes,
identity references, consent, policy revisions and audit records private. Retain
only the identity data your provider needs, with access/retention controls; don't
log tokens, names, birth dates, evidence or raw request bodies.

A lost storage response returns a sanitized 503 with `outcome: unknown`. Recover
an enrollment through its original idempotency key or authorized receipt read.
After a decision, an identical proof returns its durable receipt even if the
token/challenge later expires; this does not bypass current provisioning policy.
Once accepted, wallet creation uses the existing durable wallet journal, with
read-only reconciliation for an uncertain provider response.

## Evidence before enabling it

Offline tests use real ephemeral JWT signatures and a test-only transactional
model. They cover subject/caller/nonce isolation, invalid proofs and claim sets,
all provider decisions, current KYC/consent, expired/revoked acceptance, concurrent
proofs, changed-proof conflicts, restart/lost responses, dispatch-time revocation,
HTTP scopes/body bounds and sanitized receipts. They do not establish a deployed
issuer connection, real consent capture, a database adapter or KYC certification.
Prove your registered code flow, key rotation, two-client isolation, real storage
crash/concurrency recovery and unfunded wallet lifecycle before readiness.
