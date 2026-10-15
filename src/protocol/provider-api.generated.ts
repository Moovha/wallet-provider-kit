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
    "/v1/accounts/{accountId}/provision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires current owner/grant/KYC authority and a durable attempt. Never retry an unknown outcome blindly. The body must be an empty object. */
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
}
