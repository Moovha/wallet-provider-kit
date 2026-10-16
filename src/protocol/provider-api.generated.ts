export interface paths {
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
    "/v1/actions/{actionId}/sign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires current owner/grant/KYC authority and a durable attempt. Never retry an unknown outcome blindly. The body must be an empty object. */
        post: operations["signAction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/transfer-authorizations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Fixed Base Sepolia ERC-3009 transfer authorization. Explicit transfer delegation, current owner-bound access, identity and provider policy authorization are required. No per-transfer owner prompt. No broadcast or settlement. */
        post: operations["requestTransferAuthorization"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/transfer-authorizations/{actionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Fixed Base Sepolia ERC-3009 transfer authorization. Explicit transfer delegation, current owner-bound access, identity and provider policy authorization are required. No per-transfer owner prompt. No broadcast or settlement. */
        get: operations["getTransferAuthorization"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/execution-capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Public versioned execution discovery. Profile implementation, configuration and service readiness do not establish live-provider certification or production custody acceptance. Clients must select an exact supported ID/revision and ignore unknown profiles. */
        get: operations["getExecutionCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/actions/{actionId}/execute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Optional fixed ERC-3009 transfer execution with exact version selection, current owner/grant/identity/consent/approval checks, durable signing and submission authority, application gas sponsorship and independent RPC receipt/finality verification. Unknown submission outcomes never permit redispatch. No arbitrary transaction payload is accepted. */
        post: operations["executeTransfer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/actions/{actionId}/execution": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Optional fixed ERC-3009 transfer execution with exact version selection, current owner/grant/identity/consent/approval checks, durable signing and submission authority, application gas sponsorship and independent RPC receipt/finality verification. Unknown submission outcomes never permit redispatch. No arbitrary transaction payload is accepted. */
        get: operations["getTransferExecution"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/actions/{actionId}/execution-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Authenticated CloudEvents 1.0 execution observations with a monotonic sequence in the active store. At most 64 transitions are retained per execution; history_truncated signals a cursor gap requiring verified-status resynchronization. Reports never become verified events without RPC evidence. This endpoint does not refresh, submit or release budgets. */
        get: operations["getExecutionEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/actions/{actionId}/transaction-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Record or read unverified application transaction observations for an existing authorized transfer. Current caller, owner, grant, identity, consent and policy checks apply even after signing expiry. Reports never broadcast, reconcile attempts, verify settlement or release budgets. */
        get: operations["getTransactionEvents"];
        put?: never;
        /** @description Record or read unverified application transaction observations for an existing authorized transfer. Current caller, owner, grant, identity, consent and policy checks apply even after signing expiry. Reports never broadcast, reconcile attempts, verify settlement or release budgets. */
        post: operations["reportTransactionEvent"];
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
                        profile: "provider-signing-preview";
                        /** @enum {string} */
                        status: "experimental";
                        configured: boolean;
                        /** @enum {string} */
                        configuration_profile?: "provider-service-v1";
                        action_profiles?: "provider-authorized-erc3009-v1"[];
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
    signAction: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                actionId: string;
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
                        signature: string;
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
    requestTransferAuthorization: {
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
                    account_id: string;
                    recipient: string;
                    amount: string;
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
                        action_id: string;
                        account_id: string;
                        /** @enum {string} */
                        status: "authorizing" | "authorized" | "denied";
                        /** Format: date-time */
                        expires_at: string;
                        payload_hash: string;
                        payload: {
                            /** @enum {string} */
                            primaryType: "TransferWithAuthorization";
                            domain: {
                                name: string;
                                version: string;
                                /** @enum {string} */
                                chainId: "84532";
                                verifyingContract: string;
                            };
                            types: {
                                TransferWithAuthorization: {
                                    /** @enum {string} */
                                    name: "from" | "to" | "value" | "validAfter" | "validBefore" | "nonce";
                                    /** @enum {string} */
                                    type: "address" | "uint256" | "bytes32";
                                }[];
                            };
                            message: {
                                from: string;
                                to: string;
                                value: string;
                                /** @enum {string} */
                                validAfter: "0";
                                validBefore: string;
                                nonce: string;
                            };
                        };
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
    getTransferAuthorization: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                actionId: string;
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
                        action_id: string;
                        account_id: string;
                        /** @enum {string} */
                        status: "authorizing" | "authorized" | "denied";
                        /** Format: date-time */
                        expires_at: string;
                        payload_hash: string;
                        payload: {
                            /** @enum {string} */
                            primaryType: "TransferWithAuthorization";
                            domain: {
                                name: string;
                                version: string;
                                /** @enum {string} */
                                chainId: "84532";
                                verifyingContract: string;
                            };
                            types: {
                                TransferWithAuthorization: {
                                    /** @enum {string} */
                                    name: "from" | "to" | "value" | "validAfter" | "validBefore" | "nonce";
                                    /** @enum {string} */
                                    type: "address" | "uint256" | "bytes32";
                                }[];
                            };
                            message: {
                                from: string;
                                to: string;
                                value: string;
                                /** @enum {string} */
                                validAfter: "0";
                                validBefore: string;
                                nonce: string;
                            };
                        };
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
                        /** @enum {string} */
                        contract_version: "1";
                        profiles: {
                            id: string;
                            revision: string;
                            implemented: boolean;
                            configured: boolean;
                            ready: boolean;
                            chain_id: string;
                            account_type: string;
                            signing: string;
                            token_authorization: string;
                            submission: string;
                            verification: string;
                            finality: string;
                            minimum_rpc_sources: number;
                            execute_scopes: string[];
                            read_scopes: string[];
                        }[];
                    };
                };
            };
        };
    };
    executeTransfer: {
        parameters: {
            query?: never;
            header: {
                /** @description Select the exact execution contract from GET /v1/execution-capabilities. */
                "execution-profile": "erc3009-relayer-v1";
                /** @description Unknown revisions are rejected; the server never substitutes a different execution contract. */
                "execution-profile-revision": "1";
                "idempotency-key": string;
            };
            path: {
                actionId: string;
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
                        /** @enum {string} */
                        profile: "erc3009-relayer-v1";
                        /** @enum {string} */
                        profile_revision: "1";
                        action_id: string;
                        execution_id: string;
                        /**
                         * @description Durable submission state. Accepted identifies a Relayer queue record; it is not chain inclusion or settlement.
                         * @enum {string}
                         */
                        dispatch_status: "not_started" | "pending" | "accepted" | "unknown" | "failed";
                        observation_revision: number;
                        next_poll_after_ms: number;
                        /** @enum {string} */
                        chain_status: "unobserved" | "pending" | "included" | "safe" | "finalized" | "reorged";
                        /**
                         * @description RPC quorum means agreement of all configured trusted RPC sources on exact receipt effects and canonical block evidence, not a cryptographic light-client proof.
                         * @enum {string}
                         */
                        verification: "unverified" | "rpc-quorum";
                        /** @enum {string} */
                        outcome: "unknown" | "succeeded" | "reverted";
                        /**
                         * @description The supported token transfer reaches succeeded/reverted settlement only after matching finalized chain evidence. This is not a claim of general business-operation completion.
                         * @enum {string}
                         */
                        settlement: "pending" | "succeeded" | "reverted";
                        /** Format: date-time */
                        observed_at: string;
                        transaction_hash?: string;
                        block_hash?: string;
                        block_number?: string;
                        /**
                         * @description An external party can relay the same ERC-3009 authorization. Only its exact verified token effect can establish success.
                         * @enum {string}
                         */
                        execution_origin?: "sponsor" | "external";
                    } & ({
                        /** @enum {unknown} */
                        verification?: "unverified";
                        /** @enum {unknown} */
                        chain_status?: "unobserved" | "pending" | "reorged";
                        /** @enum {unknown} */
                        outcome?: "unknown";
                        /** @enum {unknown} */
                        settlement?: "pending";
                    } | {
                        /** @enum {unknown} */
                        verification?: "rpc-quorum";
                        /** @enum {unknown} */
                        chain_status?: "included" | "safe";
                        /** @enum {unknown} */
                        outcome?: "succeeded" | "reverted";
                        /** @enum {unknown} */
                        settlement?: "pending";
                    } | {
                        /** @enum {unknown} */
                        verification?: "rpc-quorum";
                        /** @enum {unknown} */
                        chain_status?: "finalized";
                        /** @enum {unknown} */
                        outcome?: "succeeded";
                        /** @enum {unknown} */
                        settlement?: "succeeded";
                    } | {
                        /** @enum {unknown} */
                        verification?: "rpc-quorum";
                        /** @enum {unknown} */
                        chain_status?: "finalized";
                        /** @enum {unknown} */
                        outcome?: "reverted";
                        /** @enum {unknown} */
                        settlement?: "reverted";
                    });
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
    getTransferExecution: {
        parameters: {
            query?: never;
            header: {
                /** @description Select the exact execution contract from GET /v1/execution-capabilities. */
                "execution-profile": "erc3009-relayer-v1";
                /** @description Unknown revisions are rejected; the server never substitutes a different execution contract. */
                "execution-profile-revision": "1";
            };
            path: {
                actionId: string;
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
                        /** @enum {string} */
                        profile: "erc3009-relayer-v1";
                        /** @enum {string} */
                        profile_revision: "1";
                        action_id: string;
                        execution_id: string;
                        /**
                         * @description Durable submission state. Accepted identifies a Relayer queue record; it is not chain inclusion or settlement.
                         * @enum {string}
                         */
                        dispatch_status: "not_started" | "pending" | "accepted" | "unknown" | "failed";
                        observation_revision: number;
                        next_poll_after_ms: number;
                        /** @enum {string} */
                        chain_status: "unobserved" | "pending" | "included" | "safe" | "finalized" | "reorged";
                        /**
                         * @description RPC quorum means agreement of all configured trusted RPC sources on exact receipt effects and canonical block evidence, not a cryptographic light-client proof.
                         * @enum {string}
                         */
                        verification: "unverified" | "rpc-quorum";
                        /** @enum {string} */
                        outcome: "unknown" | "succeeded" | "reverted";
                        /**
                         * @description The supported token transfer reaches succeeded/reverted settlement only after matching finalized chain evidence. This is not a claim of general business-operation completion.
                         * @enum {string}
                         */
                        settlement: "pending" | "succeeded" | "reverted";
                        /** Format: date-time */
                        observed_at: string;
                        transaction_hash?: string;
                        block_hash?: string;
                        block_number?: string;
                        /**
                         * @description An external party can relay the same ERC-3009 authorization. Only its exact verified token effect can establish success.
                         * @enum {string}
                         */
                        execution_origin?: "sponsor" | "external";
                    } & ({
                        /** @enum {unknown} */
                        verification?: "unverified";
                        /** @enum {unknown} */
                        chain_status?: "unobserved" | "pending" | "reorged";
                        /** @enum {unknown} */
                        outcome?: "unknown";
                        /** @enum {unknown} */
                        settlement?: "pending";
                    } | {
                        /** @enum {unknown} */
                        verification?: "rpc-quorum";
                        /** @enum {unknown} */
                        chain_status?: "included" | "safe";
                        /** @enum {unknown} */
                        outcome?: "succeeded" | "reverted";
                        /** @enum {unknown} */
                        settlement?: "pending";
                    } | {
                        /** @enum {unknown} */
                        verification?: "rpc-quorum";
                        /** @enum {unknown} */
                        chain_status?: "finalized";
                        /** @enum {unknown} */
                        outcome?: "succeeded";
                        /** @enum {unknown} */
                        settlement?: "succeeded";
                    } | {
                        /** @enum {unknown} */
                        verification?: "rpc-quorum";
                        /** @enum {unknown} */
                        chain_status?: "finalized";
                        /** @enum {unknown} */
                        outcome?: "reverted";
                        /** @enum {unknown} */
                        settlement?: "reverted";
                    });
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
    getExecutionEvents: {
        parameters: {
            query?: {
                after?: string;
            };
            header: {
                /** @description Select the exact execution contract from GET /v1/execution-capabilities. */
                "execution-profile": "erc3009-relayer-v1";
                /** @description Unknown revisions are rejected; the server never substitutes a different execution contract. */
                "execution-profile-revision": "1";
            };
            path: {
                actionId: string;
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
                        /** @enum {string} */
                        profile: "erc3009-relayer-v1";
                        /** @enum {string} */
                        profile_revision: "1";
                        action_id: string;
                        oldest_sequence: number;
                        next_sequence: number;
                        /** @description An explicit cursor gap requires resynchronization through verified execution status. The bounded feed is not a complete historical chain ledger. */
                        history_truncated: boolean;
                        events: {
                            /** @enum {string} */
                            specversion: "1.0";
                            id: string;
                            /** Format: uri */
                            source: string;
                            /** @enum {string} */
                            type: "com.moovha.wallet-provider.execution.observed.v1";
                            subject: string;
                            /** Format: date-time */
                            time: string;
                            /** @enum {string} */
                            datacontenttype: "application/json";
                            sequence: number;
                            data: {
                                /** @enum {string} */
                                profile: "erc3009-relayer-v1";
                                /** @enum {string} */
                                profile_revision: "1";
                                action_id: string;
                                execution_id: string;
                                /**
                                 * @description Durable submission state. Accepted identifies a Relayer queue record; it is not chain inclusion or settlement.
                                 * @enum {string}
                                 */
                                dispatch_status: "not_started" | "pending" | "accepted" | "unknown" | "failed";
                                observation_revision: number;
                                next_poll_after_ms: number;
                                /** @enum {string} */
                                chain_status: "unobserved" | "pending" | "included" | "safe" | "finalized" | "reorged";
                                /**
                                 * @description RPC quorum means agreement of all configured trusted RPC sources on exact receipt effects and canonical block evidence, not a cryptographic light-client proof.
                                 * @enum {string}
                                 */
                                verification: "unverified" | "rpc-quorum";
                                /** @enum {string} */
                                outcome: "unknown" | "succeeded" | "reverted";
                                /**
                                 * @description The supported token transfer reaches succeeded/reverted settlement only after matching finalized chain evidence. This is not a claim of general business-operation completion.
                                 * @enum {string}
                                 */
                                settlement: "pending" | "succeeded" | "reverted";
                                /** Format: date-time */
                                observed_at: string;
                                transaction_hash?: string;
                                block_hash?: string;
                                block_number?: string;
                                /**
                                 * @description An external party can relay the same ERC-3009 authorization. Only its exact verified token effect can establish success.
                                 * @enum {string}
                                 */
                                execution_origin?: "sponsor" | "external";
                            } & ({
                                /** @enum {unknown} */
                                verification?: "unverified";
                                /** @enum {unknown} */
                                chain_status?: "unobserved" | "pending" | "reorged";
                                /** @enum {unknown} */
                                outcome?: "unknown";
                                /** @enum {unknown} */
                                settlement?: "pending";
                            } | {
                                /** @enum {unknown} */
                                verification?: "rpc-quorum";
                                /** @enum {unknown} */
                                chain_status?: "included" | "safe";
                                /** @enum {unknown} */
                                outcome?: "succeeded" | "reverted";
                                /** @enum {unknown} */
                                settlement?: "pending";
                            } | {
                                /** @enum {unknown} */
                                verification?: "rpc-quorum";
                                /** @enum {unknown} */
                                chain_status?: "finalized";
                                /** @enum {unknown} */
                                outcome?: "succeeded";
                                /** @enum {unknown} */
                                settlement?: "succeeded";
                            } | {
                                /** @enum {unknown} */
                                verification?: "rpc-quorum";
                                /** @enum {unknown} */
                                chain_status?: "finalized";
                                /** @enum {unknown} */
                                outcome?: "reverted";
                                /** @enum {unknown} */
                                settlement?: "reverted";
                            });
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
    getTransactionEvents: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                actionId: string;
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
                        action_id: string;
                        events: {
                            /**
                             * @description Application observation only; confirmed is not provider-verified settlement.
                             * @enum {string}
                             */
                            event: "submitted" | "confirmed" | "failed";
                            /** @enum {string} */
                            chain_id: "eip155:84532";
                            transaction_hash: string;
                            /** Format: date-time */
                            observed_at: string;
                            report_id: string;
                            /** Format: date-time */
                            recorded_at: string;
                            /**
                             * @description No chain receipt, transfer effect or finality verification is performed.
                             * @enum {string}
                             */
                            verification: "unverified";
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
    reportTransactionEvent: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path: {
                actionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Application observation only; confirmed is not provider-verified settlement.
                     * @enum {string}
                     */
                    event: "submitted" | "confirmed" | "failed";
                    /** @enum {string} */
                    chain_id: "eip155:84532";
                    transaction_hash: string;
                    /** Format: date-time */
                    observed_at: string;
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
                        /**
                         * @description Application observation only; confirmed is not provider-verified settlement.
                         * @enum {string}
                         */
                        event: "submitted" | "confirmed" | "failed";
                        /** @enum {string} */
                        chain_id: "eip155:84532";
                        transaction_hash: string;
                        /** Format: date-time */
                        observed_at: string;
                        report_id: string;
                        /** Format: date-time */
                        recorded_at: string;
                        /**
                         * @description No chain receipt, transfer effect or finality verification is performed.
                         * @enum {string}
                         */
                        verification: "unverified";
                        action_id: string;
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
                            transfer_policy_revision?: string;
                        };
                    };
                    authorization_details: {
                        /** @enum {string} */
                        type: "https://moovha.com/wallet/account-access";
                        actions: ("account:read" | "operations:request" | "transfers:request")[];
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
                        permissions?: ("account:read" | "operations:request" | "transfers:request")[];
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
                        transfer_policy_revision?: string;
                        transfer_terms?: {
                            /** @enum {unknown} */
                            profile: "provider-authorized-erc3009-v1";
                            token: {
                                address: string;
                                name: string;
                                version: string;
                                symbol: string;
                                decimals: number;
                            };
                            recipients: string[];
                            maximumAmount: string;
                            lifetimeAmount: string;
                            maxValiditySeconds: number;
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
                                permissions?: ("account:read" | "operations:request" | "transfers:request")[];
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
                        permissions?: ("account:read" | "operations:request" | "transfers:request")[];
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
                        permissions?: ("account:read" | "operations:request" | "transfers:request")[];
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
}
