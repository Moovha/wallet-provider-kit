---
outline: 2
---

# Find the API request you need

Choose a task before choosing an endpoint. Application developers normally start
with wallet access, then transactions. Service operators can use administration
at `/admin/` for connections and shared user checks. Optional identity integrations
are separate host integrations and can be skipped in the standard flow.

The explorer starts with **Wallet access**. Use **Browse requests by task** to
choose another area, or **All requests** for the complete technical reference.
Selecting a task sends no API request and grants no access. The request URLs and
permission boundaries are the same in every view.

## Understand requests that look similar

| Question                                          | Which requests to use                                                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access approval or wallet creation?               | Read the access policy, submit identity and consent, then provision the approved account. Permission and blockchain wallet creation are separate steps.                                                                                |
| Account details or transaction wallet?            | The account-details read shows access/provisioning status and the address once created. The transaction-wallet read provides the execution address and chain after transaction access is ready.                                        |
| Agreements or transaction rules?                  | Agreements record business actions, trusted network services and who pays fees. Transaction rules define the exact contract calls and limits. Both must be accepted/current before eligible transactions.                              |
| Propose, approve a proposal, or publish directly? | Applications propose rules; operators review and publish saved proposals. Direct provider publication is an alternative for provider-authored baselines or changes. Historical reads support audit rather than activating older rules. |
| Application route or provider route?              | Applications see and change their own permitted records. Provider routes let a separately authorized operator review a selected application. These routes keep review separate from application requests.                              |
| Fee funding or a person’s receiving address?      | The application funding address covers eligible network fees. Individual user wallets hold their assets. Funding and user spending permission are separate.                                                                            |
| Standard access or enrollment/vendor import?      | Standard applications submit their agreed user checks and consent with the access request. Custom login enrollment, vendor evidence import and read-only hosted evaluation are optional integrations.                                  |

## Wallet access

Connect a person, obtain permission, create their wallet and support disconnection. Start here for the standard wallet journey.

### See what to collect before connecting a wallet

Learn which identity information, check age and consent terms your application must meet before requesting wallet access.

**Who uses it:** Application developer.

**When you need it:** Use before asking someone for permission, and after shared requirements or transaction policies change.

[`GET /v1/access-policy`](http-reference.md#get-v1-access-policy) — request body, permissions, effects and response details.

### Submit a person’s checks and wallet permission

Ask the provider to accept completed identity checks and the person’s recorded permission, then obtain account access IDs.

**Who uses it:** Application developer.

**When you need it:** Use after reading the access requirements and obtaining consent inside the application. Creating or reconnecting access is separate from creating the blockchain wallet.

[`POST /v1/access-requests`](http-reference.md#post-v1-access-requests) — request body, permissions, effects and response details.

### Check whether wallet access was approved

Look up the decision for a saved access request and recover its returned account and permission details.

**Who uses it:** Application developer.

**When you need it:** Use after requesting access, after a lost response, or while a hosted review is pending. This does not submit new evidence or create a wallet.

[`GET /v1/access-requests/{requestId}`](http-reference.md#get-v1-access-requests-requestid) — request body, permissions, effects and response details.

### Create the person’s blockchain wallet

Create or locate the Safe wallet for an account that already has current approved access.

**Who uses it:** Application developer.

**When you need it:** Use after POST /v1/access-requests returns a granted account. Keep the original retry key if creation is pending or its outcome is uncertain.

[`POST /v1/accounts/{accountId}/provision`](http-reference.md#post-v1-accounts-accountid-provision) — request body, permissions, effects and response details.

### See a person’s wallet account details

Read an approved account’s status and, once provisioned, its receiving address.

**Who uses it:** Application developer.

**When you need it:** Use for the wallet overview or to check whether wallet creation completed. The transaction-wallet read provides the execution address and chain once transaction access is ready.

[`GET /v1/accounts/{accountId}`](http-reference.md#get-v1-accounts-accountid) — request body, permissions, effects and response details.

### Disconnect an application from a person’s wallet

End the application’s saved wallet permission when the person withdraws consent.

**Who uses it:** Application developer.

**When you need it:** Use when the person chooses Disconnect or withdraws wallet access in your application. Reconnecting requires new consent; existing signatures cannot be recalled.

[`POST /v1/access-grants/{grantId}/revoke`](http-reference.md#post-v1-access-grants-grantid-revoke) — request body, permissions, effects and response details.

## Transactions

Send approved transactions and track their outcomes after wallet access, transaction rules and fee funding are ready.

### See the wallet address and transaction network

Get the user’s assigned Safe address and chain for wallet transactions. This is also their receiving address.

**Who uses it:** Application developer.

**When you need it:** Use when preparing transaction calls. GET /v1/accounts/{accountId} is the general account-details read and can be used before the wallet is provisioned.

[`GET /v1/accounts/{accountId}/wallet`](http-reference.md#get-v1-accounts-accountid-wallet) — request body, permissions, effects and response details.

### Send a transaction or check its result

Request approved contract calls, discover wallet call capabilities, or check a retained transaction result through one wallet endpoint.

**Who uses it:** Application developer.

**When you need it:** Use after wallet access, transaction rules and fee funding are ready. Choose wallet_sendCalls to submit or wallet_getCallsStatus to inspect; these methods have different effects and permissions.

[`POST /v1/accounts/{accountId}/wallet`](http-reference.md#post-v1-accounts-accountid-wallet) — request body, permissions, effects and response details.

### Follow a transaction’s progress live

Receive status updates for an admitted transaction request without repeatedly polling.

**Who uses it:** Application developer.

**When you need it:** Optional: use for live progress in your interface. Poll wallet_getCallsStatus through the wallet endpoint if you do not need a stream.

[`GET /v1/accounts/{accountId}/wallet/calls/{batchId}/events`](http-reference.md#get-v1-accounts-accountid-wallet-calls-batchid-events) — request body, permissions, effects and response details.

### See recent transaction requests

List the transaction requests you may read, including their queue stages and retained verified outcomes.

**Who uses it:** Application developer or service operator.

**When you need it:** Use for history and monitoring. Read an individual transaction’s current status through the wallet endpoint when an observation is still pending.

[`GET /v1/wallet/batches`](http-reference.md#get-v1-wallet-batches) — request body, permissions, effects and response details.

## Service administration

Installers and service operators manage administrator access, application connections and shared user-check requirements. Most operators can use /admin/ instead of calling these routes directly.

### Create the first administrator account

Establish the administrator for a new, unclaimed installation using its private setup code.

**Who uses it:** Installer.

**When you need it:** Use once after installation. The First-time setup form in administration sends this request; ordinary sign-in does not use it.

[`POST /v1/provider/claim`](http-reference.md#post-v1-provider-claim) — request body, permissions, effects and response details.

### Check your service administration status

See whether administration is available, which applications are registered and whether wallet operations are enabled.

**Who uses it:** Service operator.

**When you need it:** Use on your administration dashboard or when troubleshooting service setup.

[`GET /v1/provider/status`](http-reference.md#get-v1-provider-status) — request body, permissions, effects and response details.

### See connected applications and tools

List registered connections so you can find the one to inspect or change.

**Who uses it:** Service operator.

**When you need it:** Use when managing registrations. This lists application and tool connections, not wallet owners.

[`GET /v1/provider/identities`](http-reference.md#get-v1-provider-identities) — request body, permissions, effects and response details.

### Add an application or management tool

Give an application or administration tool its own connection ID and secret.

**Who uses it:** Service operator.

**When you need it:** Use once per new connection. Most operators can use Add application or Add management tool in administration.

[`POST /v1/provider/identities`](http-reference.md#post-v1-provider-identities) — request body, permissions, effects and response details.

### See required user information

See the identity information and permission limits every connected application must follow.

**Who uses it:** Service operator.

**When you need it:** Use when reviewing your service’s user checks. The same settings are available under User checks in administration.

[`GET /v1/provider/user-checks`](http-reference.md#get-v1-provider-user-checks) — request body, permissions, effects and response details.

### Change required user information

Set required identity information, the maximum age of checks and how long wallet permission lasts.

**Who uses it:** Service operator.

**When you need it:** Use when your shared requirements change. Applications read the resulting requirements through GET /v1/access-policy.

[`POST /v1/provider/user-checks`](http-reference.md#post-v1-provider-user-checks) — request body, permissions, effects and response details.

### Change or pause an application connection

Rename a connection, pause access, or change the agreement and permissions for an application.

**Who uses it:** Service operator.

**When you need it:** Use after adding a connection. Changing trust or permissions ends its current wallet approvals; renaming alone preserves them.

[`PATCH /v1/provider/identities/{id}`](http-reference.md#patch-v1-provider-identities-id) — request body, permissions, effects and response details.

### Replace an application or tool secret

Replace lost or exposed connection details so the old secret and its tokens stop working.

**Who uses it:** Service operator.

**When you need it:** Use for an existing application or management tool. You can also choose Replace secret in administration.

[`POST /v1/provider/identities/{id}/credentials`](http-reference.md#post-v1-provider-identities-id-credentials) — request body, permissions, effects and response details.

## Application agreements

Application developers submit the transactions, network services and fee terms they need. A separate service operator accepts or declines each agreement.

### Find an application and its setup progress

List visible application setups and optionally load one application’s current rules and recent proposals.

**Who uses it:** Application developer or service operator.

**When you need it:** Use for a setup dashboard. Operators can inspect their configured applications; applications can see only their own setup.

[`GET /v1/applications/configurations`](http-reference.md#get-v1-applications-configurations) — request body, permissions, effects and response details.

### Check your application agreements

See the transactions, network services and fee terms your application submitted, and whether the provider accepted each one.

**Who uses it:** Application developer.

**When you need it:** Use before changing an agreement or investigating why wallet setup or transactions are blocked.

[`GET /v1/application/obligations`](http-reference.md#get-v1-application-obligations) — request body, permissions, effects and response details.

### Submit the transactions your application needs

Describe the business actions and supporting information your application expects to submit for provider review.

**Who uses it:** Application developer.

**When you need it:** Use during application setup or when supported business actions change. Send field definitions, not an actual person’s transaction data.

[`PUT /v1/application/obligations/actions`](http-reference.md#put-v1-application-obligations-actions) — request body, permissions, effects and response details.

### Submit the network services your application will use

Declare the network-reading and verification services the application will pay for and their saved connection references.

**Who uses it:** Application developer.

**When you need it:** Use after saving service connections, or when the selected services change. Submit references rather than secret values.

[`PUT /v1/application/obligations/services`](http-reference.md#put-v1-application-obligations-services) — request body, permissions, effects and response details.

### Submit who pays network fees and the limits

Declare the application’s agreement to pay eligible network fees, with bounded costs and account limits.

**Who uses it:** Application developer.

**When you need it:** Use before preparing fee-paying infrastructure or changing fee terms. Saving this agreement does not transfer money or fund the address.

[`PUT /v1/application/obligations/sponsorship`](http-reference.md#put-v1-application-obligations-sponsorship) — request body, permissions, effects and response details.

### Review an application’s submitted agreements

See one application’s proposed transactions, network services and fee terms before deciding whether to accept them.

**Who uses it:** Service operator.

**When you need it:** Use during application onboarding and after agreement changes. Applications read their own agreements through the separate application route.

[`GET /v1/provider/applications/{applicationId}/obligations`](http-reference.md#get-v1-provider-applications-applicationid-obligations) — request body, permissions, effects and response details.

### Accept or decline an application’s transactions

Record your decision on the current submitted business actions and information requirements.

**Who uses it:** Service operator.

**When you need it:** Use after reviewing an application’s transaction declaration. Acceptance alone does not publish transaction rules or approve anyone’s spending.

[`POST /v1/provider/applications/{applicationId}/obligations/actions/decision`](http-reference.md#post-v1-provider-applications-applicationid-obligations-actions-decision) — request body, permissions, effects and response details.

### Accept or decline an application’s network services

Record whether the declared network services and saved connection origins are acceptable.

**Who uses it:** Service operator.

**When you need it:** Use after reviewing the current service declaration and connection metadata. Acceptance permits eligible connections to be used; it does not fund them.

[`POST /v1/provider/applications/{applicationId}/obligations/services/decision`](http-reference.md#post-v1-provider-applications-applicationid-obligations-services-decision) — request body, permissions, effects and response details.

### Accept or decline an application’s fee agreement

Record your decision on who pays network fees and the proposed cost limits.

**Who uses it:** Service operator.

**When you need it:** Use before preparing application fee infrastructure, and whenever fee terms change. Actual funding remains a separate step.

[`POST /v1/provider/applications/{applicationId}/obligations/sponsorship/decision`](http-reference.md#post-v1-provider-applications-applicationid-obligations-sponsorship-decision) — request body, permissions, effects and response details.

## Transaction rules

Define the exact contract calls and limits an application may request. Proposals and provider decisions are separate so an application cannot grant itself permission.

### See your application’s current transaction rules

Read the active allowed calls, identity claims and transaction limits before requesting permission or preparing a change.

**Who uses it:** Application developer.

**When you need it:** Use during application integration and before proposing changes. This reads the published policy, not business declarations or anyone’s wallet permission.

[`GET /v1/application/policy`](http-reference.md#get-v1-application-policy) — request body, permissions, effects and response details.

### Submit transaction-rule changes for review

Propose the contract calls and limits your application needs without publishing them yourself.

**Who uses it:** Application developer.

**When you need it:** Use when initially configuring transactions or requesting changes. A provider operator reviews and publishes the proposal unless an explicitly enabled automatic-review rule applies.

[`POST /v1/application/policy/proposals`](http-reference.md#post-v1-application-policy-proposals) — request body, permissions, effects and response details.

### Check a transaction-rule proposal

Inspect a saved proposal to see its requested rules and publication outcome.

**Who uses it:** Application developer.

**When you need it:** Use after submitting a proposal or losing its response. Keep its ID so you can check the original request.

[`GET /v1/application/policy/proposals/{proposalId}`](http-reference.md#get-v1-application-policy-proposals-proposalid) — request body, permissions, effects and response details.

### Review an application’s current transaction rules

Inspect the active transaction rules for a selected application before approving or changing them.

**Who uses it:** Service operator.

**When you need it:** Use for provider review. The separate application route lets an application read only its own current rules.

[`GET /v1/provider/applications/{applicationId}/policy`](http-reference.md#get-v1-provider-applications-applicationid-policy) — request body, permissions, effects and response details.

### Approve and publish proposed transaction rules

Make a reviewed application proposal the active transaction policy.

**Who uses it:** Service operator.

**When you need it:** Use for the normal proposal-and-review workflow. This is separate from accepting business declarations; publication defines the exact calls and limits that may be requested.

[`POST /v1/provider/policy/proposals/{proposalId}/publish`](http-reference.md#post-v1-provider-policy-proposals-proposalid-publish) — request body, permissions, effects and response details.

### Set transaction rules directly as the provider

Publish a provider-authored rules version without first creating an application proposal.

**Who uses it:** Service operator.

**When you need it:** Alternative setup path: use for a baseline or provider-controlled policy change. Use proposal publication instead when reviewing an application’s saved proposal; both retain version history.

[`POST /v1/provider/applications/{applicationId}/policy/revisions`](http-reference.md#post-v1-provider-applications-applicationid-policy-revisions) — request body, permissions, effects and response details.

### Look up an earlier version of transaction rules

Read an immutable published rules version to understand which terms applied at that point.

**Who uses it:** Application developer.

**When you need it:** Optional: use for audit and troubleshooting. Reading history does not reactivate those rules or restore wallet permission.

[`GET /v1/application/policy/revisions/{revision}`](http-reference.md#get-v1-application-policy-revisions-revision) — request body, permissions, effects and response details.

### Choose how future transaction-rule changes are reviewed

Choose manual review or limited automatic publication for future application contract and method changes.

**Who uses it:** Service operator.

**When you need it:** Optional: use after publishing baseline rules. Automatic review accepts only changes whose provider-controlled terms exactly match the current policy; it does not approve existing pending proposals.

[`POST /v1/provider/applications/{applicationId}/policy/review`](http-reference.md#post-v1-provider-applications-applicationid-policy-review) — request body, permissions, effects and response details.

## Network connections and fees

Save and review application-owned network connections, prepare fee-paying infrastructure and find its funding address. These addresses and costs are separate from user assets.

### See saved network connection details

List your saved service connection references and their status without returning secret values.

**Who uses it:** Application developer.

**When you need it:** Use before adding, replacing or removing an application-owned network connection.

[`GET /v1/application/credentials`](http-reference.md#get-v1-application-credentials) — request body, permissions, effects and response details.

### Save or remove a network service connection

Securely retain an application-owned service endpoint, or revoke it, for use by approved network services.

**Who uses it:** Application developer.

**When you need it:** Use when a service connection is added, changed or removed. The provider must review affected service declarations again; metadata reads never reveal the saved value.

[`PUT /v1/application/credentials/{reference}`](http-reference.md#put-v1-application-credentials-reference) — request body, permissions, effects and response details.

### Review an application’s network connections

Inspect the service origins and saved connection references an application wants the provider to use.

**Who uses it:** Service operator.

**When you need it:** Use while reviewing its network-service agreement. The separate operator route lets you inspect the chosen application without sharing its secret values.

[`GET /v1/provider/applications/{applicationId}/credentials`](http-reference.md#get-v1-provider-applications-applicationid-credentials) — request body, permissions, effects and response details.

### Check network-fee setup for an application

See whether the application’s fee-paying infrastructure is prepared and whether it needs funding.

**Who uses it:** Service operator.

**When you need it:** Use before preparing or troubleshooting wallet creation. This concerns application fee funding, not a person’s wallet balance.

[`GET /v1/configuration/applications/{applicationId}/safe-wallet`](http-reference.md#get-v1-configuration-applications-applicationid-safe-wallet) — request body, permissions, effects and response details.

### Prepare an application to pay network fees

Prepare the private transaction submission service and fee-paying contract needed for the application’s wallets.

**Who uses it:** Service operator.

**When you need it:** Use after accepting its network services and fee agreement. This setup may deploy contracts and consume application funding; it does not create a user wallet.

[`POST /v1/configuration/applications/{applicationId}/safe-wallet`](http-reference.md#post-v1-configuration-applications-applicationid-safe-wallet) — request body, permissions, effects and response details.

### Find where to fund application network fees

Get the application’s stable funding address and setup status so its operator knows where eligible network fees are funded.

**Who uses it:** Application developer.

**When you need it:** Use after the provider accepts fee sponsorship and prepares the application infrastructure. This address is separate from users’ receiving addresses.

[`GET /v1/application/gas-funding`](http-reference.md#get-v1-application-gas-funding) — request body, permissions, effects and response details.

## Service status

Check connectivity and supported features. These public reads report capabilities; they do not create wallets or enable transactions.

### Check the service connection

Confirm that the provider responds and see whether it is configured for wallet operations.

**Who uses it:** Anyone connecting an application.

**When you need it:** Start here when connecting or troubleshooting. This public request needs no token.

[`GET /v1/capabilities`](http-reference.md#get-v1-capabilities) — request body, permissions, effects and response details.

### See supported transaction features

Learn which transaction methods, network and execution features the service supports.

**Who uses it:** Application developer.

**When you need it:** Use when implementing wallet transactions or checking integration compatibility. GET /v1/capabilities is the simpler first connectivity check.

[`GET /v1/execution-capabilities`](http-reference.md#get-v1-execution-capabilities) — request body, permissions, effects and response details.

## Optional identity integrations

Advanced host integrations only. Skip these for standard application-led identity checks and consent. Hosted evidence import, read-only evaluation and custom provider-login enrollment are separate optional flows.

### Submit identity records for a read-only evaluation

Submit a batch of application records into the optional hosted, unfunded evaluation flow.

**Who uses it:** Host integration developer.

**When you need it:** Use only when application-record evaluation is explicitly configured. The standard application-led flow submits each person’s evidence with POST /v1/access-requests instead.

[`POST /v1/access-records`](http-reference.md#post-v1-access-records) — request body, permissions, effects and response details.

### Reuse checks from an identity-verification service

Import shared verification evidence for a pending hosted identity request using a vendor sharing token.

**Who uses it:** Host integration developer.

**When you need it:** Use only for a separately configured hosted identity integration, with owner consent and agreed vendor funding. It is not used by the standard application-led flow.

[`POST /v1/access-requests/{requestId}/identity`](http-reference.md#post-v1-access-requests-requestid-identity) — request body, permissions, effects and response details.

### Start a custom provider-login identity flow

Reserve an identity-enrollment request and a login challenge for a custom host-owned identity integration.

**Who uses it:** Host integration developer.

**When you need it:** Use only when embedding the separate EnrollmentService with your own identity and authority integration. It is not available in the standard configured service.

[`POST /v1/enrollments`](http-reference.md#post-v1-enrollments) — request body, permissions, effects and response details.

### Submit identity proof from a custom provider login

Submit the completed provider-login identity proof for a reserved enrollment request.

**Who uses it:** Host integration developer.

**When you need it:** Use only in the custom EnrollmentService flow, after its nonce-bound login. This does not grant application wallet access or spending authority.

[`POST /v1/enrollments/{enrollmentId}/identity`](http-reference.md#post-v1-enrollments-enrollmentid-identity) — request body, permissions, effects and response details.

### Check a custom identity-enrollment request

Read the decision for a previously reserved custom identity enrollment without returning private identity attributes.

**Who uses it:** Host integration developer.

**When you need it:** Use only in the separate EnrollmentService integration. Standard applications check their wallet-access request instead.

[`GET /v1/enrollments/{enrollmentId}`](http-reference.md#get-v1-enrollments-enrollmentid) — request body, permissions, effects and response details.
