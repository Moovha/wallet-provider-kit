export interface paths {
    "/v1/execution-capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * See supported transaction features
         * @description **Why this exists:** Learn which transaction methods, network and execution features the service supports.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use when implementing wallet transactions or checking integration compatibility. GET /v1/capabilities is the simpler first connectivity check.
         *
         *     **Before you start:** No authentication required.
         *
         *     **Result and next step:** 200: the Safe ERC-4337 contract and configuration availability.
         */
        get: operations["getExecutionCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check the service connection
         * @description **Why this exists:** Confirm that the provider responds and see whether it is configured for wallet operations.
         *
         *     **Who uses it:** Anyone connecting an application.
         *
         *     **When you need it:** Start here when connecting or troubleshooting. This public request needs no token.
         *
         *     **Before you start:** No token is needed. The configured field says whether the service is ready for wallet operations.
         *
         *     **Result and next step:** 200: the service profile and configured status. A 200 response confirms that discovery works; check configured before trying wallet operations.
         */
        get: operations["getCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/enrollments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start a custom provider-login identity flow
         * @description **Why this exists:** Reserve an identity-enrollment request and a login challenge for a custom host-owned identity integration.
         *
         *     **Who uses it:** Host integration developer.
         *
         *     **When you need it:** Use only when embedding the separate EnrollmentService with your own identity and authority integration. It is not available in the standard configured service.
         *
         *     **Before you start:** Compose the separate EnrollmentService with host-owned durable authority and OIDC identity verification. This profile is unavailable in the configured setup service and cannot be combined with application access onboarding.
         *
         *     **Result and next step:** 201: reserved enrollment/account IDs and a nonce-bound identity challenge. No wallet or spending grant is created.
         *
         *     **Request details:** Reserve an owner-enrollment challenge through current host policy and durable storage. No wallet is created.
         */
        post: operations["beginEnrollment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/enrollments/{enrollmentId}/identity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit identity proof from a custom provider login
         * @description **Why this exists:** Submit the completed provider-login identity proof for a reserved enrollment request.
         *
         *     **Who uses it:** Host integration developer.
         *
         *     **When you need it:** Use only in the custom EnrollmentService flow, after its nonce-bound login. This does not grant application wallet access or spending authority.
         *
         *     **Before you start:** Complete the provider-owned OIDC flow using the reserved nonce. Submit a provider-audience OIDC Identity Assurance ID token only to this identity endpoint; the HTTP Authorization header still requires an application access token.
         *
         *     **Result and next step:** 200: the provider enrollment decision. A verified identity token does not grant wallet access or spending authority.
         *
         *     **Request details:** Submit a provider-nonce-bound OIDC Identity Assurance ID token. Provider policy decides acceptance; this never creates a wallet or spend grant.
         */
        post: operations["submitEnrollmentIdentity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/enrollments/{enrollmentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check a custom identity-enrollment request
         * @description **Why this exists:** Read the decision for a previously reserved custom identity enrollment without returning private identity attributes.
         *
         *     **Who uses it:** Host integration developer.
         *
         *     **When you need it:** Use only in the separate EnrollmentService integration. Standard applications check their wallet-access request instead.
         *
         *     **Before you start:** Use the reserved enrollment ID with the original authorized caller and current host permission.
         *
         *     **Result and next step:** 200: the current enrollment receipt without identity attributes or proof tokens.
         *
         *     **Request details:** Read the current authorized enrollment receipt without identity attributes or the proof token.
         */
        get: operations["getEnrollment"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/accounts/{accountId}/provision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create the person’s blockchain wallet
         * @description **Why this exists:** Create or locate the Safe wallet for an account that already has current approved access.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use after POST /v1/access-requests returns a granted account. Keep the original retry key if creation is pending or its outcome is uncertain.
         *
         *     **Before you start:** Use the accepted account_id with current owner-granted access and an empty JSON body: {}. Keep the original idempotency key when retrying. Investigate an unknown outcome before trying again.
         *
         *     **Result and next step:** 200: the user Safe account address and provisioning status. Deployment uses accepted application infrastructure. Pending deployment retains its original attempt; retry with the same identity. Wallet creation does not grant spending permission.
         *
         *     **Request details:** Provision a host-authorized account by stored ID with an empty body and durable attempt. When enrollment is configured, current provider acceptance for the same caller/account/owner is also required. Acceptance does not grant signing rights.
         */
        post: operations["provisionAccount"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/configuration/applications/{applicationId}/safe-wallet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check network-fee setup for an application
         * @description **Why this exists:** See whether the application’s fee-paying infrastructure is prepared and whether it needs funding.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use before preparing or troubleshooting wallet creation. This concerns application fee funding, not a person’s wallet balance.
         *
         *     **Before you start:** Use a configured provider operator and an accepted application ID.
         *
         *     **Result and next step:** 200: the retained funding address, paymaster and setup status. Private signer credentials are never returned.
         */
        get: operations["readSafeWalletInfrastructure"];
        put?: never;
        /**
         * Prepare an application to pay network fees
         * @description **Why this exists:** Prepare the private transaction submission service and fee-paying contract needed for the application’s wallets.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use after accepting its network services and fee agreement. This setup may deploy contracts and consume application funding; it does not create a user wallet.
         *
         *     **Before you start:** Accept the application RPC and sponsorship terms. Fund the returned application address and retry with the original application identity.
         *
         *     **Result and next step:** 200: journaled paymaster deployment and gas funding. Uncertain transactions retain their original signed payload and hash.
         */
        post: operations["provisionSafeWalletInfrastructure"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/access-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit a person’s checks and wallet permission
         * @description **Why this exists:** Ask the provider to accept completed identity checks and the person’s recorded permission, then obtain account access IDs.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use after reading the access requirements and obtaining consent inside the application. Creating or reconnecting access is separate from creating the blockchain wallet.
         *
         *     **Before you start:** After the person completes the agreed identity checks and approves wallet access in your application, submit those records here. First read GET /v1/access-policy for the required fields and current terms. Use mode=create without wallet to preserve the default Personal account. To add a wallet, supply wallet.reference, name and kind (personal or shared), and consent.wallet_reference. A verified user can omit identity while their saved checks remain current. Each wallet needs its own consent. Use mode=connect with account_id and consent.account_id to renew a selected wallet; invited members also supply consent.membership_revision. To request a wallet from a selected source application, read GET /v1/access-policy?source_application_id=SOURCE_CONNECTION_ID, then use mode=connect_from_application and source_application_id without account_id. Omit source_account_id to connect the source Personal wallet, or select another source_account_id and include consent.account_id. Include the returned sharing revision and source application in fresh consent for the requesting application. All configured identity fields must match exactly; ambiguous matches are denied. The provider must trust your application’s checks. Hosted compatibility mode uses a separate provider login and review.
         *
         *     **Result and next step:** 200: the access decision. A granted response includes account_id, grant_id, allowed actions and expiry. Save those IDs, then let the creating application provision the blockchain wallet. Shared-wallet account requests require Wallet-Grant-Id; use the selected person’s grant_id. List consented wallets with POST /v1/accounts/query. Reconnecting preserves the existing account. This request does not create an on-chain wallet or send money. Missing, stale or unauthorized evidence is rejected; consent_url is only for hosted compatibility mode.
         */
        post: operations["requestAccountAccess"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/access-policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * See what to collect before connecting a wallet
         * @description **Why this exists:** Learn which identity information, check age and consent terms your application must meet before requesting wallet access.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use before asking someone for permission, and after shared requirements or transaction policies change.
         *
         *     **Before you start:** Call this before asking a person for wallet permission. Use your application token to learn which identity information to send, how recent the checks must be and how long permission can last. The provider operator sets these shared requirements under User checks in administration; this endpoint reads them and does not change settings or return customer records.
         *
         *     **Result and next step:** 200: required_fields lists the identity field names; verification_level is the agreed check label. max_identity_age_days limits check age and max_access_days limits permission duration. Show the requested actions and terms, record the person’s consent to policy_revision (and action_policy_revision for transactions), then submit POST /v1/access-requests. For cross-application access, supply source_application_id as a query parameter to receive wallet_sharing.matching_fields and wallet_sharing.revision. Record consent to that revision and source application. Reading these requirements does not grant wallet access.
         */
        get: operations["getAccountAccessPolicy"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/accounts/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Find a person’s approved wallets
         * @description **Why this exists:** Build a wallet switcher from the wallets this person has currently approved for your application.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use after access is granted and when switching wallets. The existing Personal wallet is listed first.
         *
         *     **Before you start:** Send your private user_id in the JSON body and an application token. Only current grants for that exact application user are returned; keep stored account references for later renewal.
         *
         *     **Result and next step:** 200: accounts with wallet names, kind, roles, grant IDs, permissions and expiry. Send Wallet-Grant-Id with the selected grant on shared-wallet requests. No KYC records or other users’ wallets are returned.
         */
        post: operations["listUserWallets"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/accounts/{accountId}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Review a shared wallet’s members
         * @description **Why this exists:** Show the owner who has been invited and the permissions available to each member.
         *
         *     **Who uses it:** Application developer acting for the wallet owner.
         *
         *     **When you need it:** Use before inviting someone, changing their permissions or removing them.
         *
         *     **Before you start:** Use the owner’s current Wallet-Grant-Id for this shared wallet. The application and the owner must explicitly allow members:manage. Being a member or knowing a wallet ID cannot grant administration.
         *
         *     **Result and next step:** 200: current settings revision and invited, active or removed members. Use the revision when saving. Another application’s private user reference is omitted.
         */
        get: operations["readWalletMembers"];
        put?: never;
        /**
         * Invite someone or change their wallet access
         * @description **Why this exists:** Invite a verified application user to a shared wallet, limit their permissions or remove their future access.
         *
         *     **Who uses it:** Application developer acting for the wallet owner.
         *
         *     **When you need it:** Use after the owner chooses View wallet or View and request approved transactions for a member.
         *
         *     **Before you start:** Send Wallet-Grant-Id for the owner, a UUIDv4 Idempotency-Key, expected_revision, enabled and permissions. Use user_id to invite someone from your application or member_id to update a saved member. New or changed permissions need the member’s fresh consent to account_id and membership_revision through mode=connect.
         *
         *     **Result and next step:** 200: member settings and their revisions. Invitations do not grant account or spending access. Removing or changing a member invalidates their previous grants. The provider signer and on-chain owner threshold are unchanged; issued signatures remain subject to their on-chain validity.
         */
        post: operations["saveWalletMember"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/access-grants/{grantId}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Disconnect an application from a person’s wallet
         * @description **Why this exists:** End the application’s saved wallet permission when the person withdraws consent.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use when the person chooses Disconnect or withdraws wallet access in your application. Reconnecting requires new consent; existing signatures cannot be recalled.
         *
         *     **Before you start:** Use the grant_id returned to this application and the same caller. Send an empty JSON body. Your application must provide the user’s access-revocation control and call this endpoint when consent is withdrawn.
         *
         *     **Result and next step:** 200: revoked. Current wallet access and subsequent signing are denied. Already issued signatures are not cancelled. A renewed grant requires fresh consent evidence and a new request.
         */
        post: operations["revokeAccountAccess"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/access-records": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit identity records for a read-only evaluation
         * @description **Why this exists:** Submit a batch of application records into the optional hosted, unfunded evaluation flow.
         *
         *     **Who uses it:** Host integration developer.
         *
         *     **When you need it:** Use only when application-record evaluation is explicitly configured. The standard application-led flow submits each person’s evidence with POST /v1/access-requests instead.
         *
         *     **Before you start:** Select application-record evaluation in provider policy. Read GET /v1/access-policy, then submit up to 50 records in a body no larger than 512 KiB. Each reference must be unique within the batch and fields must contain every required policy field. Only required fields are retained. Keep the batch idempotency key; a changed batch requires a new key.
         *
         *     **Result and next step:** 200: an indexed result for each record. Complete records receive their own access request and consent URL; incomplete or duplicate records are marked invalid. Replaying the original batch resumes its requests without duplicate creation. Submission makes no wallet or vendor call. Owner consent and explicit provider review are still required.
         */
        post: operations["submitAccountAccessRecords"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/access-requests/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check whether wallet access was approved
         * @description **Why this exists:** Look up the decision for a saved access request and recover its returned account and permission details.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use after requesting access, after a lost response, or while a hosted review is pending. This does not submit new evidence or create a wallet.
         *
         *     **Before you start:** Use the returned request_id and a token for the same application and caller. Application-led access is decided from the trusted application’s submitted identity and consent evidence. Hosted compatibility mode requires its separate browser steps.
         *
         *     **Result and next step:** 200: the current request status. granted includes account and access-grant details. For funding_approval_required, arrange identity funding; for provider_review_required, wait for staff review; for reconciliation_required, ask the operator to investigate the original attempt.
         */
        get: operations["getAccountAccessRequest"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/access-requests/{requestId}/identity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reuse checks from an identity-verification service
         * @description **Why this exists:** Import shared verification evidence for a pending hosted identity request using a vendor sharing token.
         *
         *     **Who uses it:** Host integration developer.
         *
         *     **When you need it:** Use only for a separately configured hosted identity integration, with owner consent and agreed vendor funding. It is not used by the standard application-led flow.
         *
         *     **Before you start:** Obtain owner consent and a valid share token from the selected identity vendor. Configure the recipient workflow, agreed import price and application funding first. Provider staff still review the imported evidence.
         *
         *     **Result and next step:** 200: the updated access request status. Vendor approval does not grant wallet access. If the import outcome is unknown, investigate that attempt before requesting another import.
         */
        post: operations["importAccessIdentity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/accounts/{accountId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * See a person’s wallet account details
         * @description **Why this exists:** Read an approved account’s status and, once provisioned, its receiving address.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use for the wallet overview or to check whether wallet creation completed. The transaction-wallet read provides the execution address and chain once transaction access is ready.
         *
         *     **Before you start:** The same application and caller need current account:read permission for this owner’s account, with accepted identity evidence.
         *
         *     **Result and next step:** 200: accepted or provisioned account status. An address is present after provisioning.
         */
        get: operations["readGrantedAccount"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/accounts/{accountId}/wallet/calls/{batchId}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Follow a transaction’s progress live
         * @description **Why this exists:** Receive status updates for an admitted transaction request without repeatedly polling.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Optional: use for live progress in your interface. Poll wallet_getCallsStatus through the wallet endpoint if you do not need a stream.
         *
         *     **Before you start:** Retain the admitted batch ID and use an authenticated fetch stream. Account ownership and batch access are checked before opening; authorization is checked before each update. Reconnect after 55 seconds or use wallet_getCallsStatus.
         *
         *     **Result and next step:** 200: text/event-stream status events after durable observations. Preconfirmation remains pending; verified inner execution determines success. Connections are bounded to two per account, 16 per application and 64 per service.
         *
         *     **Request details:** Authenticated bounded SSE status stream. Sends current account-authorized EIP-5792 status after durable observation changes. Reconnect after 55 seconds; ordinary status reads remain available.
         */
        get: operations["streamWalletCallsStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/accounts/{accountId}/wallet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * See the wallet address and transaction network
         * @description **Why this exists:** Get the user’s assigned Safe address and chain for wallet transactions. This is also their receiving address.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use when preparing transaction calls. GET /v1/accounts/{accountId} is the general account-details read and can be used before the wallet is provisioned.
         *
         *     **Before you start:** Use current account access and contract delegation after the application bundler and paymaster are ready.
         *
         *     **Result and next step:** 200: the Safe address and chain ID. This is the user’s deposit, balance and execution address.
         */
        get: operations["readWalletExecutionAccount"];
        put?: never;
        /**
         * Send a transaction or check its result
         * @description **Why this exists:** Request approved contract calls, discover wallet call capabilities, or check a retained transaction result through one wallet endpoint.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use after wallet access, transaction rules and fee funding are ready. Choose wallet_sendCalls to submit or wallet_getCallsStatus to inspect; these methods have different effects and permissions.
         *
         *     **Before you start:** Enable Safe wallet calls. The account endpoint binds the authenticated application and current owner. Send requires wallet:actions, wallet:sign and wallet:execute plus contracts:request consent; status/discovery require wallet:execute:read.
         *
         *     **Result and next step:** 200: a JSON-RPC result or sanitized RPC error. Use EIP-5792 version 2.0.0, retain the batch ID and poll wallet_getCallsStatus. Inclusion is distinct from finality. HTTP authentication/readiness failures use the normal problem envelope.
         *
         *     **Request details:** Optional account-scoped EIP-5792 2.0.0 JSON-RPC transport. Runtime financial authority, the Safe ERC-4337 driver, current owner consent and method-specific scopes remain required. wallet_sendCalls admits a durable atomic batch without waiting for chain inclusion. Headless wallet_showCallsStatus returns unsupported method; the client adapter can present status through an explicit host callback.
         */
        post: operations["walletCallsRpc"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/gas-funding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Find where to fund application network fees
         * @description **Why this exists:** Get the application’s stable funding address and setup status so its operator knows where eligible network fees are funded.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use after the provider accepts fee sponsorship and prepares the application infrastructure. This address is separate from users’ receiving addresses.
         *
         *     **Before you start:** Have the provider accept sponsorship and prepare the application infrastructure.
         *
         *     **Result and next step:** 200: one stable application gas-funding address and infrastructure status for the application.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        get: operations["readApplicationGasFunding"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/credentials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * See saved network connection details
         * @description **Why this exists:** List your saved service connection references and their status without returning secret values.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use before adding, replacing or removing an application-owned network connection.
         *
         *     **Before you start:** Use the registered application identity. Credential values are never returned.
         *
         *     **Result and next step:** 200: application-local references, revisions, origins and active or revoked status.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        get: operations["readApplicationCredentials"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/applications/{applicationId}/credentials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Review an application’s network connections
         * @description **Why this exists:** Inspect the service origins and saved connection references an application wants the provider to use.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use while reviewing its network-service agreement. The separate operator route lets you inspect the chosen application without sharing its secret values.
         *
         *     **Before you start:** Use an exact configured provider identity and the application ID. Review each origin before accepting the service declaration.
         *
         *     **Result and next step:** 200: credential metadata without secret paths. Reject service declarations to prevent their use.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        get: operations["readProviderApplicationCredentials"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/credentials/{reference}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Save or remove a network service connection
         * @description **Why this exists:** Securely retain an application-owned service endpoint, or revoke it, for use by approved network services.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use when a service connection is added, changed or removed. The provider must review affected service declarations again; metadata reads never reveal the saved value.
         *
         *     **Before you start:** Configure a retained runtimeConfiguration.credentialKey. Use the application identity, an original idempotency key and the current credential revision. Supply a vendor HTTPS endpoint or null to revoke it.
         *
         *     **Result and next step:** 200: encrypted credential retained and metadata returned. Referencing service declarations return to pending review. No provider secrets can be selected.
         *
         *     **Request details:** Store or rotate an application-owned HTTPS service endpoint in encrypted storage. Send null to revoke it. Secret paths are never returned. Associated service declarations require provider review after every change.
         */
        put: operations["writeApplicationCredential"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/obligations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check your application agreements
         * @description **Why this exists:** See the transactions, network services and fee terms your application submitted, and whether the provider accepted each one.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use before changing an agreement or investigating why wallet setup or transactions are blocked.
         *
         *     **Before you start:** Use your application token. Read the saved revisions before preparing an agreement update.
         *
         *     **Result and next step:** 200: your action, service and fee declarations with their review decisions. Submit changed terms through the matching agreement endpoint, then wait for provider acceptance.
         *
         *     **Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.
         */
        get: operations["readApplicationObligations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/applications/{applicationId}/obligations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Review an application’s submitted agreements
         * @description **Why this exists:** See one application’s proposed transactions, network services and fee terms before deciding whether to accept them.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use during application onboarding and after agreement changes. Applications read their own agreements through the separate application route.
         *
         *     **Before you start:** Use a provider operator token and the selected application ID.
         *
         *     **Result and next step:** 200: the selected application’s declarations, revisions and decisions. Review the matching connection metadata and policy before accepting each declaration.
         *
         *     **Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.
         */
        get: operations["readProviderApplicationObligations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/obligations/actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Submit the transactions your application needs
         * @description **Why this exists:** Describe the business actions and supporting information your application expects to submit for provider review.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use during application setup or when supported business actions change. Send field definitions, not an actual person’s transaction data.
         *
         *     **Before you start:** Use your application token, the current action-declaration revision and a UUIDv4 idempotency key. Submit action definitions and required fields, never actual user payloads.
         *
         *     **Result and next step:** 200: a saved action declaration awaiting provider review. Send its current revisions to the provider operator for a decision. This does not publish call policy or authorize a transaction.
         *
         *     **Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.
         */
        put: operations["submitApplicationActions"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/applications/{applicationId}/obligations/actions/decision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Accept or decline an application’s transactions
         * @description **Why this exists:** Record your decision on the current submitted business actions and information requirements.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use after reviewing an application’s transaction declaration. Acceptance alone does not publish transaction rules or approve anyone’s spending.
         *
         *     **Before you start:** Use a provider operator token, the application ID, current declaration and decision revisions, and a UUIDv4 idempotency key.
         *
         *     **Result and next step:** 200: accepted or rejected action definitions. Acceptance constrains supporting transaction data; the active call policy, owner consent and every transaction check remain required.
         *
         *     **Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.
         */
        post: operations["decideApplicationActions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/obligations/services": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Submit the network services your application will use
         * @description **Why this exists:** Declare the network-reading and verification services the application will pay for and their saved connection references.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use after saving service connections, or when the selected services change. Submit references rather than secret values.
         *
         *     **Before you start:** Save application-owned service connections first. Use your application token, the current service-declaration revision and a UUIDv4 idempotency key. Submit opaque saved references rather than secrets.
         *
         *     **Result and next step:** 200: saved service declarations awaiting provider review. Changes require a new provider decision before eligible connections can be used.
         *
         *     **Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.
         */
        put: operations["submitApplicationServices"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/applications/{applicationId}/obligations/services/decision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Accept or decline an application’s network services
         * @description **Why this exists:** Record whether the declared network services and saved connection origins are acceptable.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use after reviewing the current service declaration and connection metadata. Acceptance permits eligible connections to be used; it does not fund them.
         *
         *     **Before you start:** Review the declared services and credential origins. Use a provider operator token, both current revisions and a UUIDv4 idempotency key.
         *
         *     **Result and next step:** 200: accepted or rejected service declarations. Accepted references can resolve only application-owned credentials when credential storage is configured.
         *
         *     **Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.
         */
        post: operations["decideApplicationServices"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/obligations/sponsorship": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Submit who pays network fees and the limits
         * @description **Why this exists:** Declare the application’s agreement to pay eligible network fees, with bounded costs and account limits.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use before preparing fee-paying infrastructure or changing fee terms. Saving this agreement does not transfer money or fund the address.
         *
         *     **Before you start:** Use your application token, the current fee-agreement revision and a UUIDv4 idempotency key. Include bounded funding and account limits for the configured network.
         *
         *     **Result and next step:** 200: a saved fee agreement awaiting provider review. After acceptance, the provider can prepare the application’s fee infrastructure and the application can fund its returned address.
         *
         *     **Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.
         */
        put: operations["submitApplicationSponsorship"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/applications/{applicationId}/obligations/sponsorship/decision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Accept or decline an application’s fee agreement
         * @description **Why this exists:** Record your decision on who pays network fees and the proposed cost limits.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use before preparing application fee infrastructure, and whenever fee terms change. Actual funding remains a separate step.
         *
         *     **Before you start:** Review the network, funding agreement and limits. Use a provider operator token, both current revisions and a UUIDv4 idempotency key.
         *
         *     **Result and next step:** 200: accepted or rejected fee terms. Acceptance permits eligible infrastructure setup; it does not fund gas or approve user transactions.
         *
         *     **Request details:** Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.
         */
        post: operations["decideApplicationSponsorship"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/applications/configurations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Find an application and its setup progress
         * @description **Why this exists:** List visible application setups and optionally load one application’s current rules and recent proposals.
         *
         *     **Who uses it:** Application developer or service operator.
         *
         *     **When you need it:** Use for a setup dashboard. Operators can inspect their configured applications; applications can see only their own setup.
         *
         *     **Before you start:** Use application configuration read scope or an exact configured provider operator with configuration write scope. Supply application_id to load one application’s policy and latest 20 proposals. Application callers cannot select another namespace.
         *
         *     **Result and next step:** 200: enabled application summaries and selected policy/proposal details. The provider sees its configured applications; applications see only their own registration. No spending authority is granted.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        get: operations["listApplicationConfigurations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/wallet/batches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * See recent transaction requests
         * @description **Why this exists:** List the transaction requests you may read, including their queue stages and retained verified outcomes.
         *
         *     **Who uses it:** Application developer or service operator.
         *
         *     **When you need it:** Use for history and monitoring. Read an individual transaction’s current status through the wallet endpoint when an observation is still pending.
         *
         *     **Before you start:** Applications need current owner account-read access and execute read scope. Exact configured provider operators can inspect the provider ledger using configuration write scope. No application token can become an operator through scopes alone.
         *
         *     **Result and next step:** 200: up to 100 readable batch summaries, queue stages and retained finalized RPC-quorum receipts. Unfinalized observations remain pending in this list; applications can refresh individual wallet_getCallsStatus results. Listing never signs, submits or retries.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        get: operations["listWalletBatches"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/applications/{applicationId}/policy/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Choose how future transaction-rule changes are reviewed
         * @description **Why this exists:** Choose manual review or limited automatic publication for future application contract and method changes.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Optional: use after publishing baseline rules. Automatic review accepts only changes whose provider-controlled terms exactly match the current policy; it does not approve existing pending proposals.
         *
         *     **Before you start:** Publish a baseline policy first. An exact configured provider operator chooses automatic or manual review using both expected_revision and expected_review_revision with a UUID idempotency key. Choose the review mode explicitly.
         *
         *     **Result and next step:** 200: a durable review decision. Automatic mode publishes subsequent contract/method changes only when provider terms exactly match the enabled current policy. Claims, value/call limits, validity, enablement and chain remain provider controlled. Existing pending proposals are not retroactively accepted.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        post: operations["setRuntimeReviewMode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * See your application’s current transaction rules
         * @description **Why this exists:** Read the active allowed calls, identity claims and transaction limits before requesting permission or preparing a change.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use during application integration and before proposing changes. This reads the published policy, not business declarations or anyone’s wallet permission.
         *
         *     **Before you start:** Use your registered application token with configuration-read permission.
         *
         *     **Result and next step:** 200: the current published transaction policy and its revision, or the unpublished state. Retain the revision before proposing changes and show current terms before collecting transaction consent.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        get: operations["readRuntimeConfiguration"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/applications/{applicationId}/policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Review an application’s current transaction rules
         * @description **Why this exists:** Inspect the active transaction rules for a selected application before approving or changing them.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use for provider review. The separate application route lets an application read only its own current rules.
         *
         *     **Before you start:** Use a separately configured provider operator token. Application tokens cannot read another application’s registry or publish changes.
         *
         *     **Result and next step:** 200: the current durable publication and predecessor information. Read it before preparing a compare-and-set policy update. Configuration does not authorize spending.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        get: operations["readRuntimeApplicationConfiguration"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/policy/revisions/{revision}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Look up an earlier version of transaction rules
         * @description **Why this exists:** Read an immutable published rules version to understand which terms applied at that point.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Optional: use for audit and troubleshooting. Reading history does not reactivate those rules or restore wallet permission.
         *
         *     **Before you start:** Use your application token and the exact saved policy revision. Historical versions remain immutable.
         *
         *     **Result and next step:** 200: the requested historical publication. Compare it with the current policy when investigating a request; its presence does not make it current.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        get: operations["readRuntimeConfigurationRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/policy/proposals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit transaction-rule changes for review
         * @description **Why this exists:** Propose the contract calls and limits your application needs without publishing them yourself.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use when initially configuring transactions or requesting changes. A provider operator reviews and publishes the proposal unless an explicitly enabled automatic-review rule applies.
         *
         *     **Before you start:** Read the current policy first. Use your application token, expected_revision and an original UUIDv4 idempotency key.
         *
         *     **Result and next step:** 200: a durable proposal and its outcome. Keep its ID and inspect it through the proposal-status endpoint. Publication follows the provider’s explicit review mode; proposing never authorizes spending.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        post: operations["proposeRuntimeConfiguration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/application/policy/proposals/{proposalId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check a transaction-rule proposal
         * @description **Why this exists:** Inspect a saved proposal to see its requested rules and publication outcome.
         *
         *     **Who uses it:** Application developer.
         *
         *     **When you need it:** Use after submitting a proposal or losing its response. Keep its ID so you can check the original request.
         *
         *     **Before you start:** Use your application token and the original proposal ID. Applications cannot inspect another application’s proposals.
         *
         *     **Result and next step:** 200: the retained proposal and any publication result. If it still needs manual review, ask the provider operator to review that proposal rather than submitting duplicates.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        get: operations["readRuntimeConfigurationProposal"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/policy/proposals/{proposalId}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve and publish proposed transaction rules
         * @description **Why this exists:** Make a reviewed application proposal the active transaction policy.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use for the normal proposal-and-review workflow. This is separate from accepting business declarations; publication defines the exact calls and limits that may be requested.
         *
         *     **Before you start:** Read the proposal and current policy. Use a provider operator token, the proposal ID, expected_revision and a UUIDv4 idempotency key.
         *
         *     **Result and next step:** 200: the published policy revision, effective without restart. Applications must read the new terms and obtain any required fresh consent. The published rules do not authorize a transaction by themselves.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        post: operations["publishRuntimeConfiguration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/applications/{applicationId}/policy/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set transaction rules directly as the provider
         * @description **Why this exists:** Publish a provider-authored rules version without first creating an application proposal.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Alternative setup path: use for a baseline or provider-controlled policy change. Use proposal publication instead when reviewing an application’s saved proposal; both retain version history.
         *
         *     **Before you start:** Use a provider operator token, the application ID, current expected_revision and a UUIDv4 idempotency key. Submit a complete reviewed policy.
         *
         *     **Result and next step:** 200: a new immutable policy publication, effective without restart. Earlier publications remain available for audit. Applications still need current owner consent and approved agreements before transactions.
         *
         *     **Request details:** Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.
         */
        post: operations["updateRuntimeConfiguration"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/user-checks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * See required user information
         * @description **Why this exists:** See the identity information and permission limits every connected application must follow.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use when reviewing your service’s user checks. The same settings are available under User checks in administration.
         *
         *     **Before you start:** Sign in as a provider operator. These shared settings are also shown under User checks in administration.
         *
         *     **Result and next step:** 200: required identity fields, the agreed verification label, maximum check age, permission duration and current settings revision. This returns requirements, not anyone’s KYC records.
         *
         *     **Request details:** Read the shared identity information, check age and wallet permission duration required from applications. available is false for hosted compatibility installations. No customer identity records are returned.
         */
        get: operations["readProviderUserChecks"];
        put?: never;
        /**
         * Change required user information
         * @description **Why this exists:** Set required identity information, the maximum age of checks and how long wallet permission lasts.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use when your shared requirements change. Applications read the resulting requirements through GET /v1/access-policy.
         *
         *     **Before you start:** Review the requirements with the applications you trust. Read the current revision first and send it as expected_revision with a new UUIDv4 idempotency key. Repeat an uncertain request with the same key and body.
         *
         *     **Result and next step:** 200: saved requirements, effective immediately and retained across restarts. Changed settings end existing wallet approvals and pending access requests across all applications; people must approve the new terms. Identical settings preserve approvals. Applications must read GET /v1/access-policy for the new policy revision.
         *
         *     **Request details:** Save shared user-check requirements without restarting the service. Use the current revision and a UUIDv4 idempotency key. Changed settings end all current wallet approvals and pending access requests; people must give fresh permission to the new terms. Identical settings preserve approvals. This does not perform KYC, change application trust or enable transactions.
         */
        post: operations["saveProviderUserChecks"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/claim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create the first administrator account
         * @description **Why this exists:** Establish the administrator for a new, unclaimed installation using its private setup code.
         *
         *     **Who uses it:** Installer.
         *
         *     **When you need it:** Use once after installation. The First-time setup form in administration sends this request; ordinary sign-in does not use it.
         *
         *     **Before you start:** Use the privately delivered, unexpired installation claim credential. This succeeds once.
         *
         *     **Result and next step:** 200: a provider administrator registration; wallet execution remains disabled.
         *
         *     **Request details:** Atomically claim a new installation using its privately delivered single-use credential. Expires 30 minutes after first initialization. Restart never reopens claiming. Establishes administration only.
         */
        post: operations["claimProviderInstallation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check your service administration status
         * @description **Why this exists:** See whether administration is available, which applications are registered and whether wallet operations are enabled.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use on your administration dashboard or when troubleshooting service setup.
         *
         *     **Before you start:** Authenticate as a current dedicated provider operator.
         *
         *     **Result and next step:** 200: management availability, application registrations and wallet activation status.
         *
         *     **Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.
         */
        get: operations["readProviderStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/identities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * See connected applications and tools
         * @description **Why this exists:** List registered connections so you can find the one to inspect or change.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use when managing registrations. This lists application and tool connections, not wallet owners.
         *
         *     **Before you start:** Authenticate as a current dedicated provider operator.
         *
         *     **Result and next step:** 200: identity metadata without authentication verifiers or secrets.
         *
         *     **Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.
         */
        get: operations["listProviderIdentities"];
        put?: never;
        /**
         * Add an application or management tool
         * @description **Why this exists:** Give an application or administration tool its own connection ID and secret.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use once per new connection. Most operators can use Add application or Add management tool in administration.
         *
         *     **Before you start:** Use a dedicated provider operator and a fresh idempotency key.
         *
         *     **Result and next step:** 200: registration metadata and a secret shown once. Replay returns metadata only; registration does not accept identity trust.
         *
         *     **Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.
         */
        post: operations["createProviderIdentity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/provider/identities/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Change or pause an application connection
         * @description **Why this exists:** Rename a connection, pause access, or change the agreement and permissions for an application.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use after adding a connection. Changing trust or permissions ends its current wallet approvals; renaming alone preserves them.
         *
         *     **Before you start:** Supply the current revision and an idempotency key. Application identities cannot perform this operation.
         *
         *     **Result and next step:** 200: updated registration. Authority changes invalidate obsolete tokens; suspension, trust and owner-permission changes revoke related grants. Renaming preserves authority. Wallet activation is unchanged.
         *
         *     **Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.
         */
        patch: operations["updateProviderIdentity"];
        trace?: never;
    };
    "/v1/provider/identities/{id}/credentials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Replace an application or tool secret
         * @description **Why this exists:** Replace lost or exposed connection details so the old secret and its tokens stop working.
         *
         *     **Who uses it:** Service operator.
         *
         *     **When you need it:** Use for an existing application or management tool. You can also choose Replace secret in administration.
         *
         *     **Before you start:** Use a dedicated provider operator, current revision and an idempotency key.
         *
         *     **Result and next step:** 200: a replacement secret shown once. Obsolete credentials and tokens are rejected.
         *
         *     **Request details:** Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending.
         */
        post: operations["rotateProviderIdentityCredential"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getExecutionCapabilities: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {unknown} */
                        profile: "safe-only-4337-v1";
                        /** @enum {unknown} */
                        revision: "1";
                        configured: boolean;
                    };
                };
            };
        };
    };
    getCapabilities: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        profile: "safe-wallet-service";
                        /** @enum {string} */
                        status: "experimental";
                        configured: boolean;
                        /** @enum {string} */
                        configuration_profile?: "provider-service-v1";
                        action_profiles?: "provider-approved-contracts-v1"[];
                    };
                };
            };
        };
    };
    beginEnrollment: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    identity_subject: string;
                };
            };
        };
        responses: {
            /** @description Default Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        enrollment_id: string;
                        account_id: string;
                        /** @enum {string} */
                        status: "awaiting_identity" | "accepted" | "needs_verification" | "rejected";
                        nonce: string;
                        /** Format: date-time */
                        expires_at: string;
                        identity_issuer: string;
                        identity_client_id: string;
                        required_claims: string[];
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    submitEnrollmentIdentity: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                enrollmentId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id_token: string;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        enrollment_id: string;
                        account_id: string;
                        /** @enum {string} */
                        status: "awaiting_identity" | "accepted" | "needs_verification" | "rejected";
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    getEnrollment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                enrollmentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        enrollment_id: string;
                        account_id: string;
                        /** @enum {string} */
                        status: "awaiting_identity" | "accepted" | "needs_verification" | "rejected";
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    provisionAccount: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
                /** @description Select this person’s current grant for this wallet. Required for shared wallets; the selector alone grants no authority. */
                "wallet-grant-id"?: string;
            };
            path: {
                accountId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        account_id: string;
                        smart_account?: {
                            /** @enum {string} */
                            profile: "safe-1.4.1";
                            /** @enum {string} */
                            chain_id: "eip155:8453" | "eip155:84532";
                            address: string;
                            /** @enum {string} */
                            status: "prepared" | "pending" | "ready" | "unknown";
                        };
                        address: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readSafeWalletInfrastructure: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        chain_id: string;
                        /** @enum {unknown} */
                        profile: "safe-only-4337-v1";
                        /** @enum {string} */
                        status: "unprovisioned" | "needs-funding" | "provisioned";
                        funding_address?: string;
                        paymaster?: string;
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    provisionSafeWalletInfrastructure: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        chain_id: string;
                        /** @enum {unknown} */
                        profile: "safe-only-4337-v1";
                        /** @enum {string} */
                        status: "unprovisioned" | "needs-funding" | "provisioned";
                        funding_address?: string;
                        paymaster?: string;
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    requestAccountAccess: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    mode: "create" | "connect" | "connect_from_application";
                    wallet?: {
                        reference: string;
                        name: string;
                        /** @enum {unknown} */
                        kind: "personal" | "shared";
                    };
                    source_account_id?: string;
                    account_id?: string;
                    /** @description Source application connection ID for connect_from_application, using the same provider issuer. Omit account_id; the provider requires one unique verified identity match. */
                    source_application_id?: string;
                    identity_record?: {
                        reference: string;
                        fields: {
                            [key: string]: string;
                        };
                    };
                    /** @description Required in application-led mode. The explicitly trusted application attests its stable user identity and recorded consent; OAuth scopes alone do not establish these facts. */
                    user?: {
                        id: string;
                        identity?: {
                            reference: string;
                            level: string;
                            /** Format: date-time */
                            verified_at: string;
                            fields: {
                                [key: string]: string;
                            };
                        };
                        consent: {
                            reference: string;
                            /** Format: date-time */
                            granted_at: string;
                            /** Format: date-time */
                            expires_at: string;
                            policy_revision: string;
                            source_application_id?: string;
                            account_id?: string;
                            wallet_reference?: string;
                            membership_revision?: number;
                            sharing_revision?: string;
                            action_policy_revision?: string;
                        };
                    };
                    authorization_details: {
                        /** @enum {string} */
                        type: "https://moovha.com/wallet/account-access";
                        actions: ("account:read" | "operations:request" | "contracts:request" | "members:manage")[];
                    }[];
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        wallet?: {
                            reference: string;
                            name: string;
                            /** @enum {unknown} */
                            kind: "personal" | "shared";
                        };
                        membership_revision?: number;
                        request_id: string;
                        /** @enum {string} */
                        status: "consent_required" | "verification_required" | "funding_approval_required" | "identity_pending" | "reconciliation_required" | "provider_review_required" | "granted" | "denied" | "expired" | "suspended" | "revoked" | "policy_changed";
                        /**
                         * Format: uri
                         * @description Hosted compatibility only. Application-led grants have no provider user redirect.
                         */
                        consent_url?: string;
                        grant_id?: string;
                        account_id?: string;
                        permissions?: ("account:read" | "operations:request" | "contracts:request" | "members:manage")[];
                        /** Format: date-time */
                        expires_at?: string;
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    getAccountAccessPolicy: {
        parameters: {
            query?: {
                source_application_id?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        chain_id?: "eip155:8453" | "eip155:84532";
                        /** @enum {string} */
                        source: "application_record" | "vendor_verification" | "application_attestation";
                        evaluation_only: boolean;
                        required_fields: string[];
                        maximum_field_characters: number;
                        /** @enum {boolean} */
                        owner_consent_required: true;
                        provider_review_required: boolean;
                        provider_login_required?: boolean;
                        /** @enum {string} */
                        flow?: "application" | "hosted";
                        policy_revision?: string;
                        action_policy_revision?: string;
                        contract_call_terms?: {
                            policy: {
                                /** @enum {unknown} */
                                mechanism: "safe-1.4.1";
                                multiSend: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                maximumNativeValueWei: string;
                                lifetimeOperations: string;
                                contracts: {
                                    address: string;
                                    codeHash: string;
                                    selectors: string[];
                                    maximumValueWei: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                }[];
                                swaps?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenIn: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenOut: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    fee: number;
                                    maximumInput: string;
                                }[];
                                vaults?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    vault: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    asset: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    maximumAssets: string;
                                }[];
                                adapters?: {
                                    tokenTransfers?: {
                                        token: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        recipients: string[];
                                        maximumAmount: string;
                                        lifetimeAmount?: string;
                                    }[];
                                    swaps?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenIn: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenOut: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        fee: number;
                                        maximumInput: string;
                                    }[];
                                    vaults?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        vault: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        asset: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        maximumAssets: string;
                                    }[];
                                };
                                nativeTransfers?: {
                                    recipients: {
                                        address: string;
                                        codeHash: string;
                                        maximumValueWei: string;
                                    }[];
                                };
                            };
                            maxValiditySeconds: number;
                        };
                        runtime_contract_terms?: {
                            application_id: string;
                            revision: string;
                            policy_hash: string;
                            policy: {
                                action_requirements?: {
                                    name: string;
                                    description: string;
                                    fields: {
                                        name: string;
                                        required: boolean;
                                        allowed_values: string[];
                                    }[];
                                }[];
                                application_resources_hash?: string;
                                /** @enum {string} */
                                version: "1";
                                enabled: boolean;
                                /** @enum {string} */
                                chain_id: "eip155:84532" | "eip155:8453";
                                contracts: {
                                    address: string;
                                    code_hash: string;
                                    implementation?: {
                                        address: string;
                                        code_hash: string;
                                    };
                                    methods: {
                                        signature: string;
                                        maximum_value_wei: string;
                                        user_address_parameters?: number[];
                                    }[];
                                }[];
                                call_adapters?: {
                                    tokenTransfers?: {
                                        token: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        recipients: string[];
                                        maximumAmount: string;
                                        lifetimeAmount?: string;
                                    }[];
                                    swaps?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenIn: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenOut: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        fee: number;
                                        maximumInput: string;
                                    }[];
                                    vaults?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        vault: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        asset: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        maximumAssets: string;
                                    }[];
                                };
                                native_transfers?: {
                                    address: string;
                                    code_hash: string;
                                    maximum_value_wei: string;
                                }[];
                                maximum_calls: number;
                                maximum_native_value_wei: string;
                                max_validity_seconds: number;
                                claim_requirements: {
                                    name: string;
                                    allowed_values: string[];
                                    max_age_seconds: number;
                                }[];
                            };
                        };
                        max_identity_age_days?: number;
                        max_access_days?: number;
                        wallet_sharing?: {
                            source_application_id: string;
                            matching_fields: string[];
                            revision: string;
                        };
                        verification_level?: string;
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    listUserWallets: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
                /** @description Select this person’s current grant for this wallet. Required for shared wallets; the selector alone grants no authority. */
                "wallet-grant-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    user_id: string;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        accounts: {
                            account_id: string;
                            is_default: boolean;
                            wallet: {
                                reference: string;
                                name: string;
                                /** @enum {unknown} */
                                kind: "personal" | "shared";
                            };
                            grant_id: string;
                            permissions: ("account:read" | "operations:request" | "contracts:request" | "members:manage")[];
                            expires_at: string;
                            /** @enum {unknown} */
                            role: "owner" | "member";
                        }[];
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readWalletMembers: {
        parameters: {
            query?: never;
            header?: {
                /** @description Select this person’s current grant for this wallet. Required for shared wallets; the selector alone grants no authority. */
                "wallet-grant-id"?: string;
            };
            path: {
                accountId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        account_id: string;
                        wallet: {
                            reference: string;
                            name: string;
                            /** @enum {unknown} */
                            kind: "personal" | "shared";
                        };
                        revision: number;
                        members: {
                            member_id: string;
                            application_id: string;
                            user_id?: string;
                            name: string;
                            permissions: ("account:read" | "contracts:request")[];
                            membership_revision: number;
                            /** @enum {unknown} */
                            status: "invited" | "active" | "removed";
                        }[];
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    saveWalletMember: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
                /** @description Select this person’s current grant for this wallet. Required for shared wallets; the selector alone grants no authority. */
                "wallet-grant-id"?: string;
            };
            path: {
                accountId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    user_id?: string;
                    member_id?: string;
                    name?: string;
                    enabled: boolean;
                    permissions: ("account:read" | "contracts:request")[];
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        account_id: string;
                        wallet: {
                            reference: string;
                            name: string;
                            /** @enum {unknown} */
                            kind: "personal" | "shared";
                        };
                        revision: number;
                        members: {
                            member_id: string;
                            application_id: string;
                            user_id?: string;
                            name: string;
                            permissions: ("account:read" | "contracts:request")[];
                            membership_revision: number;
                            /** @enum {unknown} */
                            status: "invited" | "active" | "removed";
                        }[];
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    revokeAccountAccess: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                grantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        grant_id: string;
                        /** @enum {string} */
                        status: "revoked";
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    submitAccountAccessRecords: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    records: {
                        reference: string;
                        fields: {
                            [key: string]: string;
                        };
                    }[];
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        results: {
                            index: number;
                            /** @enum {string} */
                            status: "submitted" | "invalid";
                            required_fields?: string[];
                            receipt?: {
                                wallet?: {
                                    reference: string;
                                    name: string;
                                    /** @enum {unknown} */
                                    kind: "personal" | "shared";
                                };
                                membership_revision?: number;
                                request_id: string;
                                /** @enum {string} */
                                status: "consent_required" | "verification_required" | "funding_approval_required" | "identity_pending" | "reconciliation_required" | "provider_review_required" | "granted" | "denied" | "expired" | "suspended" | "revoked" | "policy_changed";
                                /**
                                 * Format: uri
                                 * @description Hosted compatibility only. Application-led grants have no provider user redirect.
                                 */
                                consent_url?: string;
                                grant_id?: string;
                                account_id?: string;
                                permissions?: ("account:read" | "operations:request" | "contracts:request" | "members:manage")[];
                                /** Format: date-time */
                                expires_at?: string;
                            };
                        }[];
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    getAccountAccessRequest: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        wallet?: {
                            reference: string;
                            name: string;
                            /** @enum {unknown} */
                            kind: "personal" | "shared";
                        };
                        membership_revision?: number;
                        request_id: string;
                        /** @enum {string} */
                        status: "consent_required" | "verification_required" | "funding_approval_required" | "identity_pending" | "reconciliation_required" | "provider_review_required" | "granted" | "denied" | "expired" | "suspended" | "revoked" | "policy_changed";
                        /**
                         * Format: uri
                         * @description Hosted compatibility only. Application-led grants have no provider user redirect.
                         */
                        consent_url?: string;
                        grant_id?: string;
                        account_id?: string;
                        permissions?: ("account:read" | "operations:request" | "contracts:request" | "members:manage")[];
                        /** Format: date-time */
                        expires_at?: string;
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    importAccessIdentity: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    vendor: "didit" | "sumsub";
                    share_token: string;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        wallet?: {
                            reference: string;
                            name: string;
                            /** @enum {unknown} */
                            kind: "personal" | "shared";
                        };
                        membership_revision?: number;
                        request_id: string;
                        /** @enum {string} */
                        status: "consent_required" | "verification_required" | "funding_approval_required" | "identity_pending" | "reconciliation_required" | "provider_review_required" | "granted" | "denied" | "expired" | "suspended" | "revoked" | "policy_changed";
                        /**
                         * Format: uri
                         * @description Hosted compatibility only. Application-led grants have no provider user redirect.
                         */
                        consent_url?: string;
                        grant_id?: string;
                        account_id?: string;
                        permissions?: ("account:read" | "operations:request" | "contracts:request" | "members:manage")[];
                        /** Format: date-time */
                        expires_at?: string;
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readGrantedAccount: {
        parameters: {
            query?: never;
            header?: {
                /** @description Select this person’s current grant for this wallet. Required for shared wallets; the selector alone grants no authority. */
                "wallet-grant-id"?: string;
            };
            path: {
                accountId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        wallet?: {
                            reference: string;
                            name: string;
                            /** @enum {unknown} */
                            kind: "personal" | "shared";
                        };
                        account_id: string;
                        /** @enum {string} */
                        identity_source?: "application_record" | "application_attestation";
                        evaluation_only?: boolean;
                        /** @enum {string} */
                        status: "accepted" | "provisioned";
                        address?: string;
                    };
                };
            };
            /** @description Default Response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    streamWalletCallsStatus: {
        parameters: {
            query?: never;
            header?: {
                /** @description Select this person’s current grant for this wallet. Required for shared wallets; the selector alone grants no authority. */
                "wallet-grant-id"?: string;
            };
            path: {
                accountId: string;
                batchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Bounded SSE stream of authorized wallet status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readWalletExecutionAccount: {
        parameters: {
            query?: never;
            header?: {
                /** @description Select this person’s current grant for this wallet. Required for shared wallets; the selector alone grants no authority. */
                "wallet-grant-id"?: string;
            };
            path: {
                accountId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        address: string;
                        chainId: string;
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    walletCallsRpc: {
        parameters: {
            query?: never;
            header?: {
                /** @description Select this person’s current grant for this wallet. Required for shared wallets; the selector alone grants no authority. */
                "wallet-grant-id"?: string;
            };
            path: {
                accountId: string;
            };
            cookie?: never;
        };
        /** @description Single account-scoped JSON-RPC request. SendCallsParams uses EIP-5792 version 2.0.0. JSON-RPC batch envelopes and notifications are not accepted. */
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    jsonrpc: "2.0";
                    id: string | number | (never | null);
                    /** @enum {string} */
                    method: "wallet_sendCalls";
                    params: {
                        /** @enum {string} */
                        version: "2.0.0";
                        id?: string;
                        from?: string;
                        chainId: string;
                        atomicRequired: boolean;
                        capabilities?: {
                            [key: string]: {
                                optional?: boolean;
                            } & {
                                [key: string]: unknown;
                            };
                        };
                        calls: {
                            to?: string;
                            value?: string;
                            data?: string;
                            capabilities?: {
                                [key: string]: {
                                    optional?: boolean;
                                } & {
                                    [key: string]: unknown;
                                };
                            };
                        }[];
                    }[];
                } | {
                    /** @enum {string} */
                    jsonrpc: "2.0";
                    id: string | number | (never | null);
                    /** @enum {string} */
                    method: "wallet_getCapabilities";
                    params: (string | string[])[];
                } | {
                    /** @enum {string} */
                    jsonrpc: "2.0";
                    id: string | number | (never | null);
                    /** @enum {string} */
                    method: "wallet_getCallsStatus";
                    params: string[];
                } | {
                    /** @enum {string} */
                    jsonrpc: "2.0";
                    id: string | number | (never | null);
                    /** @enum {string} */
                    method: "wallet_showCallsStatus";
                    params: string[];
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        jsonrpc: "2.0";
                        id: string | number | (never | null);
                        result?: {
                            id: string;
                        } | {
                            /** @enum {string} */
                            version: "2.0.0";
                            id: string;
                            chainId: string;
                            /** @enum {integer} */
                            status: 100 | 200 | 400 | 500;
                            /** @enum {boolean} */
                            atomic: true;
                            capabilities?: {
                                preconfirmation?: {
                                    /** @enum {string} */
                                    stage: "preconfirmed";
                                    transactionHash: string;
                                    /** Format: date-time */
                                    observedAt: string;
                                };
                            };
                            receipts?: {
                                logs: {
                                    address: string;
                                    data: string;
                                    topics: string[];
                                }[];
                                /** @enum {string} */
                                status: "0x0" | "0x1";
                                blockHash: string;
                                blockNumber: string;
                                gasUsed: string;
                                transactionHash: string;
                            }[];
                        } | {
                            "0x14a34"?: {
                                applicationAction?: {
                                    /** @enum {boolean} */
                                    supported: true;
                                };
                                paymasterService?: {
                                    /** @enum {boolean} */
                                    supported: true;
                                };
                                atomic: {
                                    /** @enum {string} */
                                    status: "supported";
                                };
                            };
                            "0x2105"?: {
                                applicationAction?: {
                                    /** @enum {boolean} */
                                    supported: true;
                                };
                                paymasterService?: {
                                    /** @enum {boolean} */
                                    supported: true;
                                };
                                atomic: {
                                    /** @enum {string} */
                                    status: "supported";
                                };
                            };
                        };
                        error?: {
                            code: number;
                            message: string;
                        };
                    };
                };
            };
            /** @description Default Response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Default Response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readApplicationGasFunding: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        chain_id: string;
                        /** @enum {unknown} */
                        profile: "safe-only-4337-v1";
                        /** @enum {string} */
                        status: "unprovisioned" | "needs-funding" | "provisioned";
                        funding_address?: string;
                        paymaster?: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readApplicationCredentials: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        reference: string;
                        revision: string;
                        origin: string;
                        /** @enum {string} */
                        status: "active" | "revoked";
                    }[];
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readProviderApplicationCredentials: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        reference: string;
                        revision: string;
                        origin: string;
                        /** @enum {string} */
                        status: "active" | "revoked";
                    }[];
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    writeApplicationCredential: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                reference: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    endpoint: string | null;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        reference: string;
                        revision: string;
                        origin: string;
                        /** @enum {string} */
                        status: "active" | "revoked";
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readApplicationObligations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        resources: {
                            application_id: string;
                            /** @enum {string} */
                            kind: "actions" | "services" | "sponsorship";
                            revision: string;
                            value: {
                                name: string;
                                description: string;
                                fields: {
                                    name: string;
                                    required: boolean;
                                    allowed_values: string[];
                                }[];
                            }[] | {
                                id: string;
                                /** @enum {string} */
                                kind: "rpc-verification" | "rpc-submission" | "rpc-observation" | "other";
                                vendor: string;
                                /** @description Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration. */
                                credential_reference: string;
                                /** @enum {string} */
                                billing_owner: "application";
                            }[] | {
                                /** @enum {string} */
                                chain_id: "eip155:8453" | "eip155:84532";
                                funding_agreement: string;
                                maximum_gas_budget_wei: string;
                                /** @enum {string} */
                                account_model: "provider-controlled-user-safe";
                                /** @enum {string} */
                                asset_model: "individual-user-wallets";
                                maximum_execution_accounts?: number;
                                maximum_in_flight_per_sponsor?: number;
                                gas_limits?: {
                                    gas_limit: string;
                                    max_fee_per_gas: string;
                                    max_priority_fee_per_gas: string;
                                    l1_fee_reserve_wei: string;
                                };
                            };
                            /** Format: date-time */
                            submitted_at: string;
                            /** @enum {string} */
                            decision: "pending" | "accepted" | "rejected";
                            decision_revision: string;
                            /** Format: date-time */
                            decided_at?: string;
                        }[];
                        /** @enum {boolean} */
                        authorizes_spending: false;
                        /** @enum {boolean} */
                        activates_execution: false;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readProviderApplicationObligations: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        resources: {
                            application_id: string;
                            /** @enum {string} */
                            kind: "actions" | "services" | "sponsorship";
                            revision: string;
                            value: {
                                name: string;
                                description: string;
                                fields: {
                                    name: string;
                                    required: boolean;
                                    allowed_values: string[];
                                }[];
                            }[] | {
                                id: string;
                                /** @enum {string} */
                                kind: "rpc-verification" | "rpc-submission" | "rpc-observation" | "other";
                                vendor: string;
                                /** @description Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration. */
                                credential_reference: string;
                                /** @enum {string} */
                                billing_owner: "application";
                            }[] | {
                                /** @enum {string} */
                                chain_id: "eip155:8453" | "eip155:84532";
                                funding_agreement: string;
                                maximum_gas_budget_wei: string;
                                /** @enum {string} */
                                account_model: "provider-controlled-user-safe";
                                /** @enum {string} */
                                asset_model: "individual-user-wallets";
                                maximum_execution_accounts?: number;
                                maximum_in_flight_per_sponsor?: number;
                                gas_limits?: {
                                    gas_limit: string;
                                    max_fee_per_gas: string;
                                    max_priority_fee_per_gas: string;
                                    l1_fee_reserve_wei: string;
                                };
                            };
                            /** Format: date-time */
                            submitted_at: string;
                            /** @enum {string} */
                            decision: "pending" | "accepted" | "rejected";
                            decision_revision: string;
                            /** Format: date-time */
                            decided_at?: string;
                        }[];
                        /** @enum {boolean} */
                        authorizes_spending: false;
                        /** @enum {boolean} */
                        activates_execution: false;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    submitApplicationActions: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    value: {
                        name: string;
                        description: string;
                        fields: {
                            name: string;
                            required: boolean;
                            allowed_values: string[];
                        }[];
                    }[];
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        /** @enum {string} */
                        kind: "actions" | "services" | "sponsorship";
                        revision: string;
                        value: {
                            name: string;
                            description: string;
                            fields: {
                                name: string;
                                required: boolean;
                                allowed_values: string[];
                            }[];
                        }[] | {
                            id: string;
                            /** @enum {string} */
                            kind: "rpc-verification" | "rpc-submission" | "rpc-observation" | "other";
                            vendor: string;
                            /** @description Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration. */
                            credential_reference: string;
                            /** @enum {string} */
                            billing_owner: "application";
                        }[] | {
                            /** @enum {string} */
                            chain_id: "eip155:8453" | "eip155:84532";
                            funding_agreement: string;
                            maximum_gas_budget_wei: string;
                            /** @enum {string} */
                            account_model: "provider-controlled-user-safe";
                            /** @enum {string} */
                            asset_model: "individual-user-wallets";
                            maximum_execution_accounts?: number;
                            maximum_in_flight_per_sponsor?: number;
                            gas_limits?: {
                                gas_limit: string;
                                max_fee_per_gas: string;
                                max_priority_fee_per_gas: string;
                                l1_fee_reserve_wei: string;
                            };
                        };
                        /** Format: date-time */
                        submitted_at: string;
                        /** @enum {string} */
                        decision: "pending" | "accepted" | "rejected";
                        decision_revision: string;
                        /** Format: date-time */
                        decided_at?: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    decideApplicationActions: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    expected_decision_revision: string;
                    /** @enum {string} */
                    decision: "accepted" | "rejected";
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        /** @enum {string} */
                        kind: "actions" | "services" | "sponsorship";
                        revision: string;
                        value: {
                            name: string;
                            description: string;
                            fields: {
                                name: string;
                                required: boolean;
                                allowed_values: string[];
                            }[];
                        }[] | {
                            id: string;
                            /** @enum {string} */
                            kind: "rpc-verification" | "rpc-submission" | "rpc-observation" | "other";
                            vendor: string;
                            /** @description Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration. */
                            credential_reference: string;
                            /** @enum {string} */
                            billing_owner: "application";
                        }[] | {
                            /** @enum {string} */
                            chain_id: "eip155:8453" | "eip155:84532";
                            funding_agreement: string;
                            maximum_gas_budget_wei: string;
                            /** @enum {string} */
                            account_model: "provider-controlled-user-safe";
                            /** @enum {string} */
                            asset_model: "individual-user-wallets";
                            maximum_execution_accounts?: number;
                            maximum_in_flight_per_sponsor?: number;
                            gas_limits?: {
                                gas_limit: string;
                                max_fee_per_gas: string;
                                max_priority_fee_per_gas: string;
                                l1_fee_reserve_wei: string;
                            };
                        };
                        /** Format: date-time */
                        submitted_at: string;
                        /** @enum {string} */
                        decision: "pending" | "accepted" | "rejected";
                        decision_revision: string;
                        /** Format: date-time */
                        decided_at?: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    submitApplicationServices: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    value: {
                        id: string;
                        /** @enum {string} */
                        kind: "rpc-verification" | "rpc-submission" | "rpc-observation" | "other";
                        vendor: string;
                        /** @description Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration. */
                        credential_reference: string;
                        /** @enum {string} */
                        billing_owner: "application";
                    }[];
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        /** @enum {string} */
                        kind: "actions" | "services" | "sponsorship";
                        revision: string;
                        value: {
                            name: string;
                            description: string;
                            fields: {
                                name: string;
                                required: boolean;
                                allowed_values: string[];
                            }[];
                        }[] | {
                            id: string;
                            /** @enum {string} */
                            kind: "rpc-verification" | "rpc-submission" | "rpc-observation" | "other";
                            vendor: string;
                            /** @description Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration. */
                            credential_reference: string;
                            /** @enum {string} */
                            billing_owner: "application";
                        }[] | {
                            /** @enum {string} */
                            chain_id: "eip155:8453" | "eip155:84532";
                            funding_agreement: string;
                            maximum_gas_budget_wei: string;
                            /** @enum {string} */
                            account_model: "provider-controlled-user-safe";
                            /** @enum {string} */
                            asset_model: "individual-user-wallets";
                            maximum_execution_accounts?: number;
                            maximum_in_flight_per_sponsor?: number;
                            gas_limits?: {
                                gas_limit: string;
                                max_fee_per_gas: string;
                                max_priority_fee_per_gas: string;
                                l1_fee_reserve_wei: string;
                            };
                        };
                        /** Format: date-time */
                        submitted_at: string;
                        /** @enum {string} */
                        decision: "pending" | "accepted" | "rejected";
                        decision_revision: string;
                        /** Format: date-time */
                        decided_at?: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    decideApplicationServices: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    expected_decision_revision: string;
                    /** @enum {string} */
                    decision: "accepted" | "rejected";
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        /** @enum {string} */
                        kind: "actions" | "services" | "sponsorship";
                        revision: string;
                        value: {
                            name: string;
                            description: string;
                            fields: {
                                name: string;
                                required: boolean;
                                allowed_values: string[];
                            }[];
                        }[] | {
                            id: string;
                            /** @enum {string} */
                            kind: "rpc-verification" | "rpc-submission" | "rpc-observation" | "other";
                            vendor: string;
                            /** @description Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration. */
                            credential_reference: string;
                            /** @enum {string} */
                            billing_owner: "application";
                        }[] | {
                            /** @enum {string} */
                            chain_id: "eip155:8453" | "eip155:84532";
                            funding_agreement: string;
                            maximum_gas_budget_wei: string;
                            /** @enum {string} */
                            account_model: "provider-controlled-user-safe";
                            /** @enum {string} */
                            asset_model: "individual-user-wallets";
                            maximum_execution_accounts?: number;
                            maximum_in_flight_per_sponsor?: number;
                            gas_limits?: {
                                gas_limit: string;
                                max_fee_per_gas: string;
                                max_priority_fee_per_gas: string;
                                l1_fee_reserve_wei: string;
                            };
                        };
                        /** Format: date-time */
                        submitted_at: string;
                        /** @enum {string} */
                        decision: "pending" | "accepted" | "rejected";
                        decision_revision: string;
                        /** Format: date-time */
                        decided_at?: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    submitApplicationSponsorship: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    value: {
                        /** @enum {string} */
                        chain_id: "eip155:8453" | "eip155:84532";
                        funding_agreement: string;
                        maximum_gas_budget_wei: string;
                        /** @enum {string} */
                        account_model: "provider-controlled-user-safe";
                        /** @enum {string} */
                        asset_model: "individual-user-wallets";
                        maximum_execution_accounts?: number;
                        maximum_in_flight_per_sponsor?: number;
                        gas_limits?: {
                            gas_limit: string;
                            max_fee_per_gas: string;
                            max_priority_fee_per_gas: string;
                            l1_fee_reserve_wei: string;
                        };
                    };
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        /** @enum {string} */
                        kind: "actions" | "services" | "sponsorship";
                        revision: string;
                        value: {
                            name: string;
                            description: string;
                            fields: {
                                name: string;
                                required: boolean;
                                allowed_values: string[];
                            }[];
                        }[] | {
                            id: string;
                            /** @enum {string} */
                            kind: "rpc-verification" | "rpc-submission" | "rpc-observation" | "other";
                            vendor: string;
                            /** @description Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration. */
                            credential_reference: string;
                            /** @enum {string} */
                            billing_owner: "application";
                        }[] | {
                            /** @enum {string} */
                            chain_id: "eip155:8453" | "eip155:84532";
                            funding_agreement: string;
                            maximum_gas_budget_wei: string;
                            /** @enum {string} */
                            account_model: "provider-controlled-user-safe";
                            /** @enum {string} */
                            asset_model: "individual-user-wallets";
                            maximum_execution_accounts?: number;
                            maximum_in_flight_per_sponsor?: number;
                            gas_limits?: {
                                gas_limit: string;
                                max_fee_per_gas: string;
                                max_priority_fee_per_gas: string;
                                l1_fee_reserve_wei: string;
                            };
                        };
                        /** Format: date-time */
                        submitted_at: string;
                        /** @enum {string} */
                        decision: "pending" | "accepted" | "rejected";
                        decision_revision: string;
                        /** Format: date-time */
                        decided_at?: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    decideApplicationSponsorship: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    expected_decision_revision: string;
                    /** @enum {string} */
                    decision: "accepted" | "rejected";
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        /** @enum {string} */
                        kind: "actions" | "services" | "sponsorship";
                        revision: string;
                        value: {
                            name: string;
                            description: string;
                            fields: {
                                name: string;
                                required: boolean;
                                allowed_values: string[];
                            }[];
                        }[] | {
                            id: string;
                            /** @enum {string} */
                            kind: "rpc-verification" | "rpc-submission" | "rpc-observation" | "other";
                            vendor: string;
                            /** @description Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration. */
                            credential_reference: string;
                            /** @enum {string} */
                            billing_owner: "application";
                        }[] | {
                            /** @enum {string} */
                            chain_id: "eip155:8453" | "eip155:84532";
                            funding_agreement: string;
                            maximum_gas_budget_wei: string;
                            /** @enum {string} */
                            account_model: "provider-controlled-user-safe";
                            /** @enum {string} */
                            asset_model: "individual-user-wallets";
                            maximum_execution_accounts?: number;
                            maximum_in_flight_per_sponsor?: number;
                            gas_limits?: {
                                gas_limit: string;
                                max_fee_per_gas: string;
                                max_priority_fee_per_gas: string;
                                l1_fee_reserve_wei: string;
                            };
                        };
                        /** Format: date-time */
                        submitted_at: string;
                        /** @enum {string} */
                        decision: "pending" | "accepted" | "rejected";
                        decision_revision: string;
                        /** Format: date-time */
                        decided_at?: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    listApplicationConfigurations: {
        parameters: {
            query?: {
                application_id?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        network?: "base" | "base-sepolia";
                        /** @enum {string} */
                        role: "provider" | "application";
                        applications: {
                            application_id: string;
                            name: string;
                            active_revision: string;
                            publication?: {
                                application_id: string;
                                revision: string;
                                previous_revision: string;
                                policy_hash: string;
                                policy: {
                                    action_requirements?: {
                                        name: string;
                                        description: string;
                                        fields: {
                                            name: string;
                                            required: boolean;
                                            allowed_values: string[];
                                        }[];
                                    }[];
                                    application_resources_hash?: string;
                                    /** @enum {string} */
                                    version: "1";
                                    enabled: boolean;
                                    /** @enum {string} */
                                    chain_id: "eip155:84532" | "eip155:8453";
                                    contracts: {
                                        address: string;
                                        code_hash: string;
                                        implementation?: {
                                            address: string;
                                            code_hash: string;
                                        };
                                        methods: {
                                            signature: string;
                                            maximum_value_wei: string;
                                            user_address_parameters?: number[];
                                        }[];
                                    }[];
                                    call_adapters?: {
                                        tokenTransfers?: {
                                            token: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            recipients: string[];
                                            maximumAmount: string;
                                            lifetimeAmount?: string;
                                        }[];
                                        swaps?: {
                                            id: string;
                                            router: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            tokenIn: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            tokenOut: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            fee: number;
                                            maximumInput: string;
                                        }[];
                                        vaults?: {
                                            id: string;
                                            router: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            vault: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            asset: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            maximumAssets: string;
                                        }[];
                                    };
                                    native_transfers?: {
                                        address: string;
                                        code_hash: string;
                                        maximum_value_wei: string;
                                    }[];
                                    maximum_calls: number;
                                    maximum_native_value_wei: string;
                                    max_validity_seconds: number;
                                    claim_requirements: {
                                        name: string;
                                        allowed_values: string[];
                                        max_age_seconds: number;
                                    }[];
                                };
                                /** Format: date-time */
                                published_at: string;
                                proposal_id?: string;
                                published_by: string;
                            };
                            publications: {
                                application_id: string;
                                revision: string;
                                previous_revision: string;
                                policy_hash: string;
                                policy: {
                                    action_requirements?: {
                                        name: string;
                                        description: string;
                                        fields: {
                                            name: string;
                                            required: boolean;
                                            allowed_values: string[];
                                        }[];
                                    }[];
                                    application_resources_hash?: string;
                                    /** @enum {string} */
                                    version: "1";
                                    enabled: boolean;
                                    /** @enum {string} */
                                    chain_id: "eip155:84532" | "eip155:8453";
                                    contracts: {
                                        address: string;
                                        code_hash: string;
                                        implementation?: {
                                            address: string;
                                            code_hash: string;
                                        };
                                        methods: {
                                            signature: string;
                                            maximum_value_wei: string;
                                            user_address_parameters?: number[];
                                        }[];
                                    }[];
                                    call_adapters?: {
                                        tokenTransfers?: {
                                            token: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            recipients: string[];
                                            maximumAmount: string;
                                            lifetimeAmount?: string;
                                        }[];
                                        swaps?: {
                                            id: string;
                                            router: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            tokenIn: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            tokenOut: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            fee: number;
                                            maximumInput: string;
                                        }[];
                                        vaults?: {
                                            id: string;
                                            router: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            vault: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            asset: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            maximumAssets: string;
                                        }[];
                                    };
                                    native_transfers?: {
                                        address: string;
                                        code_hash: string;
                                        maximum_value_wei: string;
                                    }[];
                                    maximum_calls: number;
                                    maximum_native_value_wei: string;
                                    max_validity_seconds: number;
                                    claim_requirements: {
                                        name: string;
                                        allowed_values: string[];
                                        max_age_seconds: number;
                                    }[];
                                };
                                /** Format: date-time */
                                published_at: string;
                                proposal_id?: string;
                                published_by: string;
                            }[];
                            review?: {
                                /** @enum {string} */
                                mode: "automatic" | "manual";
                                revision: string;
                                approved_by: string;
                            };
                            proposals_truncated: boolean;
                            proposals: {
                                proposal_id: string;
                                application_id: string;
                                based_on_revision: string;
                                policy_hash: string;
                                policy: {
                                    action_requirements?: {
                                        name: string;
                                        description: string;
                                        fields: {
                                            name: string;
                                            required: boolean;
                                            allowed_values: string[];
                                        }[];
                                    }[];
                                    application_resources_hash?: string;
                                    /** @enum {string} */
                                    version: "1";
                                    enabled: boolean;
                                    /** @enum {string} */
                                    chain_id: "eip155:84532" | "eip155:8453";
                                    contracts: {
                                        address: string;
                                        code_hash: string;
                                        implementation?: {
                                            address: string;
                                            code_hash: string;
                                        };
                                        methods: {
                                            signature: string;
                                            maximum_value_wei: string;
                                            user_address_parameters?: number[];
                                        }[];
                                    }[];
                                    call_adapters?: {
                                        tokenTransfers?: {
                                            token: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            recipients: string[];
                                            maximumAmount: string;
                                            lifetimeAmount?: string;
                                        }[];
                                        swaps?: {
                                            id: string;
                                            router: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            tokenIn: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            tokenOut: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            fee: number;
                                            maximumInput: string;
                                        }[];
                                        vaults?: {
                                            id: string;
                                            router: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            vault: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            asset: {
                                                address: string;
                                                codeHash: string;
                                                implementation?: {
                                                    address: string;
                                                    codeHash: string;
                                                };
                                            };
                                            maximumAssets: string;
                                        }[];
                                    };
                                    native_transfers?: {
                                        address: string;
                                        code_hash: string;
                                        maximum_value_wei: string;
                                    }[];
                                    maximum_calls: number;
                                    maximum_native_value_wei: string;
                                    max_validity_seconds: number;
                                    claim_requirements: {
                                        name: string;
                                        allowed_values: string[];
                                        max_age_seconds: number;
                                    }[];
                                };
                                /** Format: date-time */
                                created_at: string;
                                published_revision?: string;
                            }[];
                        }[];
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    listWalletBatches: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        truncated: boolean;
                        batches: {
                            id: string;
                            account_id: string;
                            sender: string;
                            /** @enum {string} */
                            queue_stage: "queued" | "executing" | "included" | "failed" | "succeeded" | "cancelled" | "expired" | "blocked";
                            policy_revision: string;
                            /** Format: date-time */
                            expires_at: string;
                            application_id: string;
                            /** @enum {string} */
                            version: "2.0.0";
                            /** @enum {string} */
                            chainId: "0x14a34" | "0x2105";
                            /** @enum {integer} */
                            status: 100 | 200 | 400 | 500;
                            /** @enum {boolean} */
                            atomic: true;
                            receipts?: {
                                logs: {
                                    address: string;
                                    data: string;
                                    topics: string[];
                                }[];
                                /** @enum {string} */
                                status: "0x0" | "0x1";
                                blockHash: string;
                                blockNumber: string;
                                gasUsed: string;
                                transactionHash: string;
                            }[];
                        }[];
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    setRuntimeReviewMode: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    expected_review_revision: string;
                    /** @enum {string} */
                    mode: "automatic" | "manual";
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        mode: "automatic" | "manual";
                        revision: string;
                        approved_by: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readRuntimeConfiguration: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        active_revision: string;
                        revision: string;
                        publication?: {
                            application_id: string;
                            revision: string;
                            previous_revision: string;
                            policy_hash: string;
                            policy: {
                                action_requirements?: {
                                    name: string;
                                    description: string;
                                    fields: {
                                        name: string;
                                        required: boolean;
                                        allowed_values: string[];
                                    }[];
                                }[];
                                application_resources_hash?: string;
                                /** @enum {string} */
                                version: "1";
                                enabled: boolean;
                                /** @enum {string} */
                                chain_id: "eip155:84532" | "eip155:8453";
                                contracts: {
                                    address: string;
                                    code_hash: string;
                                    implementation?: {
                                        address: string;
                                        code_hash: string;
                                    };
                                    methods: {
                                        signature: string;
                                        maximum_value_wei: string;
                                        user_address_parameters?: number[];
                                    }[];
                                }[];
                                call_adapters?: {
                                    tokenTransfers?: {
                                        token: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        recipients: string[];
                                        maximumAmount: string;
                                        lifetimeAmount?: string;
                                    }[];
                                    swaps?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenIn: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenOut: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        fee: number;
                                        maximumInput: string;
                                    }[];
                                    vaults?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        vault: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        asset: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        maximumAssets: string;
                                    }[];
                                };
                                native_transfers?: {
                                    address: string;
                                    code_hash: string;
                                    maximum_value_wei: string;
                                }[];
                                maximum_calls: number;
                                maximum_native_value_wei: string;
                                max_validity_seconds: number;
                                claim_requirements: {
                                    name: string;
                                    allowed_values: string[];
                                    max_age_seconds: number;
                                }[];
                            };
                            /** Format: date-time */
                            published_at: string;
                            proposal_id?: string;
                            published_by: string;
                        };
                        /** @enum {boolean} */
                        authorizes_spending: false;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readRuntimeApplicationConfiguration: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        active_revision: string;
                        revision: string;
                        publication?: {
                            application_id: string;
                            revision: string;
                            previous_revision: string;
                            policy_hash: string;
                            policy: {
                                action_requirements?: {
                                    name: string;
                                    description: string;
                                    fields: {
                                        name: string;
                                        required: boolean;
                                        allowed_values: string[];
                                    }[];
                                }[];
                                application_resources_hash?: string;
                                /** @enum {string} */
                                version: "1";
                                enabled: boolean;
                                /** @enum {string} */
                                chain_id: "eip155:84532" | "eip155:8453";
                                contracts: {
                                    address: string;
                                    code_hash: string;
                                    implementation?: {
                                        address: string;
                                        code_hash: string;
                                    };
                                    methods: {
                                        signature: string;
                                        maximum_value_wei: string;
                                        user_address_parameters?: number[];
                                    }[];
                                }[];
                                call_adapters?: {
                                    tokenTransfers?: {
                                        token: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        recipients: string[];
                                        maximumAmount: string;
                                        lifetimeAmount?: string;
                                    }[];
                                    swaps?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenIn: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenOut: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        fee: number;
                                        maximumInput: string;
                                    }[];
                                    vaults?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        vault: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        asset: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        maximumAssets: string;
                                    }[];
                                };
                                native_transfers?: {
                                    address: string;
                                    code_hash: string;
                                    maximum_value_wei: string;
                                }[];
                                maximum_calls: number;
                                maximum_native_value_wei: string;
                                max_validity_seconds: number;
                                claim_requirements: {
                                    name: string;
                                    allowed_values: string[];
                                    max_age_seconds: number;
                                }[];
                            };
                            /** Format: date-time */
                            published_at: string;
                            proposal_id?: string;
                            published_by: string;
                        };
                        /** @enum {boolean} */
                        authorizes_spending: false;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readRuntimeConfigurationRevision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                revision: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        active_revision: string;
                        revision: string;
                        publication?: {
                            application_id: string;
                            revision: string;
                            previous_revision: string;
                            policy_hash: string;
                            policy: {
                                action_requirements?: {
                                    name: string;
                                    description: string;
                                    fields: {
                                        name: string;
                                        required: boolean;
                                        allowed_values: string[];
                                    }[];
                                }[];
                                application_resources_hash?: string;
                                /** @enum {string} */
                                version: "1";
                                enabled: boolean;
                                /** @enum {string} */
                                chain_id: "eip155:84532" | "eip155:8453";
                                contracts: {
                                    address: string;
                                    code_hash: string;
                                    implementation?: {
                                        address: string;
                                        code_hash: string;
                                    };
                                    methods: {
                                        signature: string;
                                        maximum_value_wei: string;
                                        user_address_parameters?: number[];
                                    }[];
                                }[];
                                call_adapters?: {
                                    tokenTransfers?: {
                                        token: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        recipients: string[];
                                        maximumAmount: string;
                                        lifetimeAmount?: string;
                                    }[];
                                    swaps?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenIn: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        tokenOut: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        fee: number;
                                        maximumInput: string;
                                    }[];
                                    vaults?: {
                                        id: string;
                                        router: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        vault: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        asset: {
                                            address: string;
                                            codeHash: string;
                                            implementation?: {
                                                address: string;
                                                codeHash: string;
                                            };
                                        };
                                        maximumAssets: string;
                                    }[];
                                };
                                native_transfers?: {
                                    address: string;
                                    code_hash: string;
                                    maximum_value_wei: string;
                                }[];
                                maximum_calls: number;
                                maximum_native_value_wei: string;
                                max_validity_seconds: number;
                                claim_requirements: {
                                    name: string;
                                    allowed_values: string[];
                                    max_age_seconds: number;
                                }[];
                            };
                            /** Format: date-time */
                            published_at: string;
                            proposal_id?: string;
                            published_by: string;
                        };
                        /** @enum {boolean} */
                        authorizes_spending: false;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    proposeRuntimeConfiguration: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    policy: {
                        action_requirements?: {
                            name: string;
                            description: string;
                            fields: {
                                name: string;
                                required: boolean;
                                allowed_values: string[];
                            }[];
                        }[];
                        application_resources_hash?: string;
                        /** @enum {string} */
                        version: "1";
                        enabled: boolean;
                        /** @enum {string} */
                        chain_id: "eip155:84532" | "eip155:8453";
                        contracts: {
                            address: string;
                            code_hash: string;
                            implementation?: {
                                address: string;
                                code_hash: string;
                            };
                            methods: {
                                signature: string;
                                maximum_value_wei: string;
                                user_address_parameters?: number[];
                            }[];
                        }[];
                        call_adapters?: {
                            tokenTransfers?: {
                                token: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                recipients: string[];
                                maximumAmount: string;
                                lifetimeAmount?: string;
                            }[];
                            swaps?: {
                                id: string;
                                router: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                tokenIn: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                tokenOut: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                fee: number;
                                maximumInput: string;
                            }[];
                            vaults?: {
                                id: string;
                                router: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                vault: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                asset: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                maximumAssets: string;
                            }[];
                        };
                        native_transfers?: {
                            address: string;
                            code_hash: string;
                            maximum_value_wei: string;
                        }[];
                        maximum_calls: number;
                        maximum_native_value_wei: string;
                        max_validity_seconds: number;
                        claim_requirements: {
                            name: string;
                            allowed_values: string[];
                            max_age_seconds: number;
                        }[];
                    };
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        proposal_id: string;
                        application_id: string;
                        based_on_revision: string;
                        policy_hash: string;
                        policy: {
                            action_requirements?: {
                                name: string;
                                description: string;
                                fields: {
                                    name: string;
                                    required: boolean;
                                    allowed_values: string[];
                                }[];
                            }[];
                            application_resources_hash?: string;
                            /** @enum {string} */
                            version: "1";
                            enabled: boolean;
                            /** @enum {string} */
                            chain_id: "eip155:84532" | "eip155:8453";
                            contracts: {
                                address: string;
                                code_hash: string;
                                implementation?: {
                                    address: string;
                                    code_hash: string;
                                };
                                methods: {
                                    signature: string;
                                    maximum_value_wei: string;
                                    user_address_parameters?: number[];
                                }[];
                            }[];
                            call_adapters?: {
                                tokenTransfers?: {
                                    token: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    recipients: string[];
                                    maximumAmount: string;
                                    lifetimeAmount?: string;
                                }[];
                                swaps?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenIn: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenOut: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    fee: number;
                                    maximumInput: string;
                                }[];
                                vaults?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    vault: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    asset: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    maximumAssets: string;
                                }[];
                            };
                            native_transfers?: {
                                address: string;
                                code_hash: string;
                                maximum_value_wei: string;
                            }[];
                            maximum_calls: number;
                            maximum_native_value_wei: string;
                            max_validity_seconds: number;
                            claim_requirements: {
                                name: string;
                                allowed_values: string[];
                                max_age_seconds: number;
                            }[];
                        };
                        /** Format: date-time */
                        created_at: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readRuntimeConfigurationProposal: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                proposalId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        proposal_id: string;
                        application_id: string;
                        based_on_revision: string;
                        policy_hash: string;
                        policy: {
                            action_requirements?: {
                                name: string;
                                description: string;
                                fields: {
                                    name: string;
                                    required: boolean;
                                    allowed_values: string[];
                                }[];
                            }[];
                            application_resources_hash?: string;
                            /** @enum {string} */
                            version: "1";
                            enabled: boolean;
                            /** @enum {string} */
                            chain_id: "eip155:84532" | "eip155:8453";
                            contracts: {
                                address: string;
                                code_hash: string;
                                implementation?: {
                                    address: string;
                                    code_hash: string;
                                };
                                methods: {
                                    signature: string;
                                    maximum_value_wei: string;
                                    user_address_parameters?: number[];
                                }[];
                            }[];
                            call_adapters?: {
                                tokenTransfers?: {
                                    token: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    recipients: string[];
                                    maximumAmount: string;
                                    lifetimeAmount?: string;
                                }[];
                                swaps?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenIn: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenOut: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    fee: number;
                                    maximumInput: string;
                                }[];
                                vaults?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    vault: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    asset: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    maximumAssets: string;
                                }[];
                            };
                            native_transfers?: {
                                address: string;
                                code_hash: string;
                                maximum_value_wei: string;
                            }[];
                            maximum_calls: number;
                            maximum_native_value_wei: string;
                            max_validity_seconds: number;
                            claim_requirements: {
                                name: string;
                                allowed_values: string[];
                                max_age_seconds: number;
                            }[];
                        };
                        /** Format: date-time */
                        created_at: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    publishRuntimeConfiguration: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                proposalId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        revision: string;
                        previous_revision: string;
                        policy_hash: string;
                        policy: {
                            action_requirements?: {
                                name: string;
                                description: string;
                                fields: {
                                    name: string;
                                    required: boolean;
                                    allowed_values: string[];
                                }[];
                            }[];
                            application_resources_hash?: string;
                            /** @enum {string} */
                            version: "1";
                            enabled: boolean;
                            /** @enum {string} */
                            chain_id: "eip155:84532" | "eip155:8453";
                            contracts: {
                                address: string;
                                code_hash: string;
                                implementation?: {
                                    address: string;
                                    code_hash: string;
                                };
                                methods: {
                                    signature: string;
                                    maximum_value_wei: string;
                                    user_address_parameters?: number[];
                                }[];
                            }[];
                            call_adapters?: {
                                tokenTransfers?: {
                                    token: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    recipients: string[];
                                    maximumAmount: string;
                                    lifetimeAmount?: string;
                                }[];
                                swaps?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenIn: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenOut: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    fee: number;
                                    maximumInput: string;
                                }[];
                                vaults?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    vault: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    asset: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    maximumAssets: string;
                                }[];
                            };
                            native_transfers?: {
                                address: string;
                                code_hash: string;
                                maximum_value_wei: string;
                            }[];
                            maximum_calls: number;
                            maximum_native_value_wei: string;
                            max_validity_seconds: number;
                            claim_requirements: {
                                name: string;
                                allowed_values: string[];
                                max_age_seconds: number;
                            }[];
                        };
                        /** Format: date-time */
                        published_at: string;
                        proposal_id?: string;
                        published_by: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    updateRuntimeConfiguration: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                applicationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: string;
                    policy: {
                        action_requirements?: {
                            name: string;
                            description: string;
                            fields: {
                                name: string;
                                required: boolean;
                                allowed_values: string[];
                            }[];
                        }[];
                        application_resources_hash?: string;
                        /** @enum {string} */
                        version: "1";
                        enabled: boolean;
                        /** @enum {string} */
                        chain_id: "eip155:84532" | "eip155:8453";
                        contracts: {
                            address: string;
                            code_hash: string;
                            implementation?: {
                                address: string;
                                code_hash: string;
                            };
                            methods: {
                                signature: string;
                                maximum_value_wei: string;
                                user_address_parameters?: number[];
                            }[];
                        }[];
                        call_adapters?: {
                            tokenTransfers?: {
                                token: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                recipients: string[];
                                maximumAmount: string;
                                lifetimeAmount?: string;
                            }[];
                            swaps?: {
                                id: string;
                                router: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                tokenIn: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                tokenOut: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                fee: number;
                                maximumInput: string;
                            }[];
                            vaults?: {
                                id: string;
                                router: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                vault: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                asset: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                                maximumAssets: string;
                            }[];
                        };
                        native_transfers?: {
                            address: string;
                            code_hash: string;
                            maximum_value_wei: string;
                        }[];
                        maximum_calls: number;
                        maximum_native_value_wei: string;
                        max_validity_seconds: number;
                        claim_requirements: {
                            name: string;
                            allowed_values: string[];
                            max_age_seconds: number;
                        }[];
                    };
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        application_id: string;
                        revision: string;
                        previous_revision: string;
                        policy_hash: string;
                        policy: {
                            action_requirements?: {
                                name: string;
                                description: string;
                                fields: {
                                    name: string;
                                    required: boolean;
                                    allowed_values: string[];
                                }[];
                            }[];
                            application_resources_hash?: string;
                            /** @enum {string} */
                            version: "1";
                            enabled: boolean;
                            /** @enum {string} */
                            chain_id: "eip155:84532" | "eip155:8453";
                            contracts: {
                                address: string;
                                code_hash: string;
                                implementation?: {
                                    address: string;
                                    code_hash: string;
                                };
                                methods: {
                                    signature: string;
                                    maximum_value_wei: string;
                                    user_address_parameters?: number[];
                                }[];
                            }[];
                            call_adapters?: {
                                tokenTransfers?: {
                                    token: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    recipients: string[];
                                    maximumAmount: string;
                                    lifetimeAmount?: string;
                                }[];
                                swaps?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenIn: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    tokenOut: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    fee: number;
                                    maximumInput: string;
                                }[];
                                vaults?: {
                                    id: string;
                                    router: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    vault: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    asset: {
                                        address: string;
                                        codeHash: string;
                                        implementation?: {
                                            address: string;
                                            codeHash: string;
                                        };
                                    };
                                    maximumAssets: string;
                                }[];
                            };
                            native_transfers?: {
                                address: string;
                                code_hash: string;
                                maximum_value_wei: string;
                            }[];
                            maximum_calls: number;
                            maximum_native_value_wei: string;
                            max_validity_seconds: number;
                            claim_requirements: {
                                name: string;
                                allowed_values: string[];
                                max_age_seconds: number;
                            }[];
                        };
                        /** Format: date-time */
                        published_at: string;
                        proposal_id?: string;
                        published_by: string;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readProviderUserChecks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        available: boolean;
                        revision: number;
                        /** @description Identity field names every application must submit. Values are nonempty strings, up to 512 characters; presence does not verify their accuracy. */
                        required_fields: string[];
                        /** @description Agreed verification label; empty when application user-check settings are unavailable in hosted mode. */
                        verification_level: string;
                        max_identity_age_days: number;
                        max_access_days: number;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    saveProviderUserChecks: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    /** @description Identity field names every application must submit. Values are nonempty strings, up to 512 characters; presence does not verify their accuracy. */
                    required_fields: string[];
                    /** @description Exact agreed label for completed identity checks, such as verified. */
                    verification_level: string;
                    max_identity_age_days: number;
                    max_access_days: number;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        available: boolean;
                        revision: number;
                        /** @description Identity field names every application must submit. Values are nonempty strings, up to 512 characters; presence does not verify their accuracy. */
                        required_fields: string[];
                        /** @description Agreed verification label; empty when application user-check settings are unavailable in hosted mode. */
                        verification_level: string;
                        max_identity_age_days: number;
                        max_access_days: number;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    claimProviderInstallation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    claim: string;
                    username: string;
                    password: string;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        name: string;
                        /** @enum {unknown} */
                        role: "administrator" | "automation" | "application";
                        enabled: boolean;
                        revision: number;
                        credentialRevision: number;
                        scopes: string[];
                        policy?: {
                            [key: string]: unknown;
                        };
                        client_secret?: string;
                        credential_replayed?: boolean;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    readProviderStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        installation_id: string;
                        /** @enum {unknown} */
                        claimed: true;
                        applications: {
                            id: string;
                            name: string;
                            /** @enum {unknown} */
                            role: "administrator" | "automation" | "application";
                            enabled: boolean;
                            revision: number;
                            credentialRevision: number;
                            scopes: string[];
                            policy?: {
                                [key: string]: unknown;
                            };
                            client_secret?: string;
                            credential_replayed?: boolean;
                        }[];
                        /** @enum {unknown} */
                        management_available: true;
                        wallet_operations_enabled: boolean;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    listProviderIdentities: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        name: string;
                        /** @enum {unknown} */
                        role: "administrator" | "automation" | "application";
                        enabled: boolean;
                        revision: number;
                        credentialRevision: number;
                        scopes: string[];
                        policy?: {
                            [key: string]: unknown;
                        };
                        client_secret?: string;
                        credential_replayed?: boolean;
                    }[];
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    createProviderIdentity: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @enum {unknown} */
                    role: "application" | "automation";
                    scopes?: ("wallet:configuration:read" | "wallet:configuration:propose" | "wallet:access" | "wallet:access:read" | "wallet:account:read" | "wallet:provision" | "wallet:actions" | "wallet:sign" | "wallet:execute" | "wallet:execute:read" | "provider:manage" | "wallet:configuration:write")[];
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        name: string;
                        /** @enum {unknown} */
                        role: "administrator" | "automation" | "application";
                        enabled: boolean;
                        revision: number;
                        credentialRevision: number;
                        scopes: string[];
                        policy?: {
                            [key: string]: unknown;
                        };
                        client_secret?: string;
                        credential_replayed?: boolean;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    updateProviderIdentity: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    name?: string;
                    scopes?: ("wallet:configuration:read" | "wallet:configuration:propose" | "wallet:access" | "wallet:access:read" | "wallet:account:read" | "wallet:provision" | "wallet:actions" | "wallet:sign" | "wallet:execute" | "wallet:execute:read" | "provider:manage" | "wallet:configuration:write")[];
                    enabled?: boolean;
                    trust_agreement?: string | null;
                    /** @description Allow selected applications to request these wallets under a reviewed identity-and-consent sharing agreement. Null disables sharing and ends dependent approvals. Each requester needs its own consent and permissions. */
                    wallet_sharing?: {
                        applications: string[];
                        /** @description All fields must match exactly. Include identity_number, document_type and issuing_country; each must also be required under User checks. */
                        matchingFields: string[];
                        agreement: string;
                    } | null;
                    permissions?: ("account:read" | "contracts:request" | "operations:request" | "members:manage")[];
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        name: string;
                        /** @enum {unknown} */
                        role: "administrator" | "automation" | "application";
                        enabled: boolean;
                        revision: number;
                        credentialRevision: number;
                        scopes: string[];
                        policy?: {
                            [key: string]: unknown;
                        };
                        client_secret?: string;
                        credential_replayed?: boolean;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
    rotateProviderIdentityCredential: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        name: string;
                        /** @enum {unknown} */
                        role: "administrator" | "automation" | "application";
                        enabled: boolean;
                        revision: number;
                        credentialRevision: number;
                        scopes: string[];
                        policy?: {
                            [key: string]: unknown;
                        };
                        client_secret?: string;
                        credential_replayed?: boolean;
                    };
                };
            };
            /** @description Problem response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
            /** @description Problem response */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": {
                        type: string;
                        title: string;
                        status: number;
                        code: string;
                        request_id: string;
                        /** @enum {string} */
                        outcome?: "not_dispatched" | "rejected" | "unknown";
                    };
                };
            };
        };
    };
}
