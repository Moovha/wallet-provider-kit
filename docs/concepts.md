# Understand the roles and terms

Start here if you are new to the kit. The same names appear in the README,
configuration, examples and API reference. This page explains the roles first,
then maps the technical names to the code you will integrate.

These are blockchain wallets: their addresses hold on-chain assets, and approved
signatures can authorise transactions involving token contracts. USDC and ZARP
are examples of assets used across Moovha's blockchain products. **Gas** is the
network fee for executing a transaction; the connected application is expected to sponsor it for
its admitted operations. See [assets and gas sponsorship](assets-and-gas.md) for
the provider/application responsibilities and current supported scope.

## The people and systems

The **wallet provider** is the team operating the wallet service. Its **host** is
the server application where the toolkit runs. For supported deployments, use
the configured service's supplied startup, persistence and permission checks.
For an embedded integration, your application supplies those parts through the
toolkit's library interfaces.

An **account owner**, also called a wallet owner, is the user recorded as owning
an account in the provider's records. An **account** is the wallet record exposed
by the service. Its `accountId` identifies that record; its `address` is the
blockchain address bound to it. These identify different things. Being the
recorded owner doesn't establish exclusive control of the private keys: that
depends on the chosen backend and recovery arrangement.

A **connected application** requests access to an account and uses the permitted
API operations. Moovha is one possible connected application. The owner approves
its access within the application. The application attests that consent and identity evidence to the provider under an explicit trust agreement. Your own product can also be a connected
application; it still needs the host's permission to use an account.

The **wallet backend** is the engine or service that creates or locates wallet
accounts and performs signing. Examples include the toolkit's CDP, OWS and Relayer
integrations, or your own `WalletSigningProvider` implementation. The backend
doesn't replace the host's permission decisions.

**Host authority** means those permission decisions and the trusted stored
records behind them: which user owns the account, which application has access,
whether consent and identity acceptance are current, and whether this exact action
is approved. In the core integration, your code supplies `EmbeddedWalletAuthority`
and `authorizeAttempt`. Other integration profiles expose their own authority
interfaces; see [the API guide](api.md#choose-a-profile).

Code sometimes calls the backend a **signing provider**: `WalletSigningProvider`
is the account/signing interface, rather than the team operating the whole wallet
service. An **adapter** implements that interface for a particular engine or
vendor. A **profile** is one supported way to compose the kit's components, such
as bundled onboarding or an existing stored-action host. Choose the profile that
matches the systems you already have.

## What does client mean?

In access configuration and authentication, a **client** is the OAuth registration
of a connected application. It is software making API requests, rather than the
human account owner. An application may have separate registrations for different
environments. Your existing OAuth authorization server issues its access tokens.
The **issuer** identifies that trusted token-issuing system; the **audience**
identifies the wallet API the token is intended for. The kit uses the trusted
issuer and client ID together to identify an allowed registration. A client ID
identifies the registration; it isn't a password or proof of the owner's approval.

The same registration appears in several places:

| Where you see it                         | How it is represented                                                               | What you do with it                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your existing OAuth authorization server | An application registration and its client ID                                       | Register the application with your trusted issuer. The toolkit doesn't supply a client-registration service or issue access tokens.                       |
| The application's access token           | The `client_id` claim, checked by `createAuthenticator`                             | Authenticate the caller using the configured issuer, audience and trusted verification keys. A body field cannot substitute for this checked token value. |
| Host code after authentication           | `VerifiedPrincipal.clientId` alongside `issuer`, `subject` and `scopes`             | Resolve the caller's current access to the actual account owner.                                                                                          |
| Bundled onboarding configuration         | `policy.applications[]` entries with `issuer`, `clientId`, `name` and `permissions` | Allow the registered application and define its display name and permitted access.                                                                        |
| Hosted compatibility consent screen      | The configured application name, requested permissions and access duration          | Let the owner understand which application is asking and approve or decline access. They don't need to recognise an OAuth client ID.                      |

For example, the [configuration template](provider.config.example.ts) pairs
`clientId: 'your-registered-application-client'` with
`name: 'Your Connected Application'`. The first is the technical registration
identifier; the second is the display name in operator tools and hosted consent pages. The issuer/client ID
must match the authenticated application. A display name alone grants no access.

`ownerLogin.clientId`, when optional staff login or hosted compatibility is configured, is a **different registration**: your wallet
service's login integration for staff or hosted wallet owners. It
doesn't identify a connected application requesting wallet access. Keep the
owner-login registration and application API registrations separate.

In standard [application-led access](application-access.md), the user identifier
is private to the calling issuer/client. The machine token authenticates the
application, not the wallet user. A user assertion supplies stable user binding,
identity evidence and consent for the current provider policy. Another application
cannot claim an existing wallet by copying that user ID. Provider login/reviewer
terms in this guide refer to hosted compatibility or optional staff tools.

## Caller identity and permission

A **caller** is whoever is making the current request. After authentication,
the toolkit represents the caller as a **verified principal** (`VerifiedPrincipal`):
the checked issuer, token subject, client ID and scopes. The token's **subject**
(`sub`, represented as `subject` in code) identifies the user or service identity
named by that issuer. An application's service identity can differ from the
account owner. Your host must resolve their relationship; it must not equate the
token subject with the owner automatically.

An **OAuth scope** is a named access-token permission such as `wallet:sign`.
It lets a request reach the corresponding host checks. A **grant** is the host's
stored, expiring permission for a particular application to access an owner's
account. **Consent** is the owner's approval of that access. **KYC** means Know
Your Customer: the identity evidence and current acceptance decision required
by the provider's policy. A token scope, an active grant and accepted identity
each answer different questions; none alone approves a signing action.

## Actions, attempts and the journal

<figure class="wallet-visual">
  <img src="./public/diagrams/durable-attempts.webp" alt="Diagram: a journal distinguishes a new attempt, saved success and pending or unknown outcomes while preserving one attempt identity." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>Retries keep the original attempt. Saved successes are checked; uncertain effects require evidence.</figcaption>
</figure>

[View full-size diagram](public/diagrams/durable-attempts.webp)

An **approved action** is the host's stored instruction with the exact account,
signing content, limits and expiry that have been approved. The application sends
its `actionId`; the host loads the instruction. The signing route doesn't accept
arbitrary content for the backend to sign.

An **attempt** is one admitted execution of account creation or an approved action.
The host assigns its stable `attemptId` before the backend is called. Retrying an
HTTP request must preserve that attempt. The caller's **idempotency key** identifies
the request being retried; the host binds it to the account/action and attempt,
and rejects reuse for different work. The key and attempt ID have different roles.

A **journal** is the private, persistent record of these attempts, their states
and their results. A **journal wrapper** is toolkit code that coordinates a backend
through that record store. It asks the host to recheck permission, claims the
attempt, calls the backend when allowed, verifies the response and records it.
For the core integration these are `WalletAttemptJournal` and
`createJournaledWalletProvider`. The [backend guide](backend-guide.md) explains
which adapters already include this coordination so you avoid wrapping them twice.

The journal lets the service tell apart:

- **Pending:** the original attempt is recorded as in progress; another caller
  cannot dispatch it again.
- **Succeeded:** a verified result is stored. **Replay** returns that result
  after a fresh permission check, without calling the backend again.
- **Unknown:** the backend may have acted, but the result isn't established.
  **Reconciliation** means establishing what happened to that original attempt
  from reliable evidence. A timeout doesn't authorise another signing or creation.

For example, if an application loses the response to an approved signing request,
it retries with the same idempotency key. If success was recorded and access is
still allowed, it receives the original signature. If the outcome is unknown,
the service preserves that uncertainty instead of signing again.

Application logs and telemetry don't replace this journal. You supply reviewed
persistent storage for financial attempts; the offline example's in-memory journal
is only a fixture. Bundled onboarding has a separate provisioning-only journal
and doesn't enable financial signing. See [durable attempts](durable-attempts.md)
for storage, concurrency and recovery requirements.

## Continue with an integration

[Install the package](package.md), then [run the provider walkthrough](integration-example.md).
Use the [backend guide](backend-guide.md) to replace its signing engine and the
[provider guide](provider-guide.md) to connect your host's real authority and storage.
