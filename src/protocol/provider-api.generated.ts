export interface paths {
    "/v1/execution-capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
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
        /** @description Reserve an owner-enrollment challenge through current host policy and durable storage. No wallet is created. */
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
        /** @description Submit a provider-nonce-bound OIDC Identity Assurance ID token. Provider policy decides acceptance; this never creates a wallet or spend grant. */
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
        /** @description Read the current authorized enrollment receipt without identity attributes or the proof token. */
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
        /** @description Provision a host-authorized account by stored ID with an empty body and durable attempt. When enrollment is configured, current provider acceptance for the same caller/account/owner is also required. Acceptance does not grant signing rights. */
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
        get: operations["readSafeWalletInfrastructure"];
        put?: never;
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
        get: operations["getAccountAccessPolicy"];
        put?: never;
        post?: never;
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
        /** @description Authenticated bounded SSE status stream. Sends current account-authorized EIP-5792 status after durable observation changes. Reconnect after 55 seconds; ordinary status reads remain available. */
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
        get: operations["readWalletExecutionAccount"];
        put?: never;
        /** @description Optional account-scoped EIP-5792 2.0.0 JSON-RPC transport. Runtime financial authority, the Safe ERC-4337 driver, current owner consent and method-specific scopes remain required. wallet_sendCalls admits a durable atomic batch without waiting for chain inclusion. Headless wallet_showCallsStatus returns unsupported method; the client adapter can present status through an explicit host callback. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Store or rotate an application-owned HTTPS service endpoint in encrypted storage. Send null to revoke it. Secret paths are never returned. Associated service declarations require provider review after every change. */
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
        /** @description Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here. */
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
        /** @description Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here. */
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
        /** @description Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here. */
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
        /** @description Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here. */
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
        /** @description Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here. */
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
        /** @description Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here. */
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
        /** @description Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here. */
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
        /** @description Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity. */
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
        /** @description Read the shared identity information, check age and wallet permission duration required from applications. available is false for hosted compatibility installations. No customer identity records are returned. */
        get: operations["readProviderUserChecks"];
        put?: never;
        /** @description Save shared user-check requirements without restarting the service. Use the current revision and a UUIDv4 idempotency key. Changed settings end all current wallet approvals and pending access requests; people must give fresh permission to the new terms. Identical settings preserve approvals. This does not perform KYC, change application trust or enable transactions. */
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
        /** @description Atomically claim a new installation using its privately delivered single-use credential. Expires 30 minutes after first initialization. Restart never reopens claiming. Establishes administration only. */
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
        /** @description Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending. */
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
        /** @description Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending. */
        get: operations["listProviderIdentities"];
        put?: never;
        /** @description Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending. */
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
        /** @description Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending. */
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
        /** @description Protected installation and application administration. Management credentials do not activate wallet operations or authorize spending. */
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
                    mode: "create" | "connect";
                    account_id?: string;
                    identity_record?: {
                        reference: string;
                        fields: {
                            [key: string]: string;
                        };
                    };
                    /** @description Required in application-led mode. The explicitly trusted application attests its stable user identity and recorded consent; OAuth scopes alone do not establish these facts. */
                    user?: {
                        id: string;
                        identity: {
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
                            action_policy_revision?: string;
                        };
                    };
                    authorization_details: {
                        /** @enum {string} */
                        type: "https://moovha.com/wallet/account-access";
                        actions: ("account:read" | "operations:request" | "contracts:request")[];
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
                        permissions?: ("account:read" | "operations:request" | "contracts:request")[];
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
                                permissions?: ("account:read" | "operations:request" | "contracts:request")[];
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
                        permissions?: ("account:read" | "operations:request" | "contracts:request")[];
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
                        permissions?: ("account:read" | "operations:request" | "contracts:request")[];
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
            header?: never;
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
            header?: never;
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
            header?: never;
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
            header?: never;
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
                    permissions?: ("account:read" | "contracts:request" | "operations:request")[];
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
