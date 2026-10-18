export interface paths {
    "/v1/executor-capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Authenticated discovery of provider IDs/revisions allowed for the pinned wallet origin. No credentials or sponsor bindings are exposed. */
        get: operations["getExecutorCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/dispatches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Signed exact immutable dispatch. A duplicate identity joins its original durable attempt; unknown provider effects never dispatch again. Fresh wallet owner/grant/KYC/consent/approval and durable handoff authority is checked after preparation, claim and immediately before effects. */
        post: operations["dispatchApprovedExecution"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/dispatches/{executionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Read-only durable recovery by stable execution ID. Provider hash and exact chain searches are hints for independent wallet verification. Never claims or submits an attempt. */
        get: operations["getExecutorDispatch"];
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
    getExecutorCapabilities: {
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
                        contract: "execution-dispatch-v1";
                        profiles: ("erc3009-executor-v1" | "approved-evm-executor-v1")[];
                        providers: {
                            id: string;
                            revision: string;
                            /** @enum {string} */
                            replacement_contract?: "wpk-fee-only-replacement-v1";
                        }[];
                    };
                };
            };
        };
    };
    dispatchApprovedExecution: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    contract: "execution-dispatch-v1";
                    execution_id: string;
                    provider_id: string;
                    provider_revision: string;
                    wallet_attempt: {
                        /** @enum {string} */
                        namespace: "configured-execution-v1";
                        /** @enum {string} */
                        provider: "erc3009-executor-v1" | "approved-evm-executor-v1";
                        attemptId: string;
                        /** @enum {string} */
                        kind: "relay_transaction";
                        accountId: string;
                        resourceKey: string;
                        requestHash: string;
                    };
                    plan: {
                        /** @enum {string} */
                        profile: "erc3009-executor-v1" | "approved-evm-executor-v1";
                        /** @enum {string} */
                        revision: "1";
                        configurationHash: string;
                        genesisHash: string;
                        tokenCodeHash: string;
                        scanFromBlock: string;
                        data: string;
                        action: {
                            action_id: string;
                            operation_id: string;
                            /** @enum {string} */
                            kind: "sign_typed_data";
                            /** @enum {string} */
                            profile: "evm_eoa_v1";
                            /** @enum {string} */
                            profile_revision: "1";
                            /** @enum {string} */
                            status: "ready";
                            /** @enum {string} */
                            chain_id: "eip155:84532";
                            chain_account_id: string;
                            binding_revision: string;
                            /** @enum {string} */
                            capability_revision: "1";
                            /** @enum {string} */
                            plan_revision: "1";
                            plan_hash: string;
                            payload_hash: string;
                            /** Format: date-time */
                            expires_at: string;
                            dependencies: Record<string, never>[];
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
                        sponsor: {
                            clientId: string;
                            accountId: string;
                            binding: {
                                address: string;
                                bindingRevision: string;
                            };
                            fundingAgreement: string;
                            gasLimit: string;
                            maxFeePerGas: string;
                            maxPriorityFeePerGas: string;
                            l1FeeReserveWei: string;
                            lifetimeBudgetWei: string;
                        };
                        replacement?: {
                            initialFeeBasisPoints: string;
                            bumpBasisPoints: string;
                            maxAttempts: string;
                            intervalSeconds: string;
                        };
                    } | {
                        /** @enum {string} */
                        profile: "approved-evm-executor-v1";
                        /** @enum {string} */
                        revision: "1";
                        configurationHash: string;
                        genesisHash: string;
                        tokenCodeHash?: string;
                        scanFromBlock: string;
                        data: string;
                        action: {
                            action_id: string;
                            operation_id: string;
                            /** @enum {string} */
                            kind: "sign_typed_data";
                            /** @enum {string} */
                            profile: "evm_eoa_v1";
                            /** @enum {string} */
                            profile_revision: "1";
                            /** @enum {string} */
                            status: "ready";
                            /** @enum {string} */
                            chain_id: "eip155:84532";
                            chain_account_id: string;
                            binding_revision: string;
                            /** @enum {string} */
                            capability_revision: "1";
                            /** @enum {string} */
                            plan_revision: "1";
                            plan_hash: string;
                            payload_hash: string;
                            /** Format: date-time */
                            expires_at: string;
                            dependencies: Record<string, never>[];
                            payload: {
                                /** @enum {string} */
                                primaryType: "SafeTx";
                                domain: {
                                    /** @enum {string} */
                                    chainId: "84532";
                                    verifyingContract: string;
                                };
                                types: {
                                    SafeTx: {
                                        /** @enum {string} */
                                        name: "to" | "value" | "data" | "operation" | "safeTxGas" | "baseGas" | "gasPrice" | "gasToken" | "refundReceiver" | "nonce";
                                        /** @enum {string} */
                                        type: "address" | "uint256" | "bytes" | "uint8";
                                    }[];
                                };
                                message: {
                                    to: string;
                                    value: string;
                                    data: string;
                                    /** @enum {string} */
                                    operation: "0" | "1";
                                    /** @enum {string} */
                                    safeTxGas: "0";
                                    /** @enum {string} */
                                    baseGas: "0";
                                    /** @enum {string} */
                                    gasPrice: "0";
                                    /** @enum {string} */
                                    gasToken: "0x0000000000000000000000000000000000000000";
                                    /** @enum {string} */
                                    refundReceiver: "0x0000000000000000000000000000000000000000";
                                    nonce: string;
                                };
                            };
                        };
                        sponsor: {
                            clientId: string;
                            accountId: string;
                            binding: {
                                address: string;
                                bindingRevision: string;
                            };
                            fundingAgreement: string;
                            gasLimit: string;
                            maxFeePerGas: string;
                            maxPriorityFeePerGas: string;
                            l1FeeReserveWei: string;
                            lifetimeBudgetWei: string;
                        };
                        replacement?: {
                            initialFeeBasisPoints: string;
                            bumpBasisPoints: string;
                            maxAttempts: string;
                            intervalSeconds: string;
                        };
                        intent: {
                            /** @enum {string} */
                            version: "1";
                            /** @enum {string} */
                            mechanism: "safe-1.4.1";
                            input: {
                                account_id: string;
                                /** @enum {string} */
                                kind: "contract-call";
                                calls: {
                                    to: string;
                                    value: string;
                                    data: string;
                                }[];
                            } | {
                                account_id: string;
                                /** @enum {string} */
                                kind: "swap";
                                route: string;
                                amount_in: string;
                                minimum_out: string;
                                deadline: string;
                            } | {
                                account_id: string;
                                /** @enum {string} */
                                kind: "vault-deposit";
                                route: string;
                                assets: string;
                                minimum_shares: string;
                            };
                            account: {
                                address: string;
                                codeHash: string;
                                implementation?: {
                                    address: string;
                                    codeHash: string;
                                };
                                accountId: string;
                                singleton: {
                                    address: string;
                                    codeHash: string;
                                    implementation?: {
                                        address: string;
                                        codeHash: string;
                                    };
                                };
                            };
                            multiSend: {
                                address: string;
                                codeHash: string;
                                implementation?: {
                                    address: string;
                                    codeHash: string;
                                };
                            };
                            calls: {
                                to: string;
                                value: string;
                                data: string;
                            }[];
                            contracts: {
                                address: string;
                                codeHash: string;
                                implementation?: {
                                    address: string;
                                    codeHash: string;
                                };
                            }[];
                            effects: {
                                token: string;
                                from: string;
                                to: string;
                                minimum: string;
                                maximum?: string;
                            }[];
                            nonce: string;
                            nativeRecipients?: string[];
                            adapterInput?: {
                                account_id: string;
                                /** @enum {string} */
                                kind: "swap";
                                route: string;
                                amount_in: string;
                                minimum_out: string;
                                deadline: string;
                            } | {
                                account_id: string;
                                /** @enum {string} */
                                kind: "vault-deposit";
                                route: string;
                                assets: string;
                                minimum_shares: string;
                            } | {
                                /** @enum {string} */
                                kind: "token-transfer";
                                token: string;
                                recipient: string;
                                amount: string;
                            };
                        };
                        runtimePolicy?: {
                            application_id: string;
                            revision: string;
                            policy_hash: string;
                            policy: {
                                /** @enum {string} */
                                version: "1";
                                enabled: boolean;
                                /** @enum {string} */
                                chain_id: "eip155:84532";
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
                        provider_inspection?: {
                            replacement?: {
                                /** @enum {string} */
                                state: "prepared" | "dispatch" | "accepted" | "unknown" | "observed" | "abandoned" | "exhausted" | "blocked" | "settled";
                                attempts: number;
                                /** @enum {string} */
                                reason?: "fee-cap" | "attempt-limit" | "authority-or-preparation-denied" | "evidence-unavailable";
                                /** Format: date-time */
                                last_attempt_at?: string;
                            };
                            status: string;
                            nonce?: string;
                            transactionHash?: string;
                        };
                        replacement?: {
                            /** @enum {string} */
                            state: "prepared" | "dispatch" | "accepted" | "unknown" | "observed" | "abandoned" | "exhausted" | "blocked" | "settled";
                            attempts: number;
                            /** @enum {string} */
                            reason?: "fee-cap" | "attempt-limit" | "authority-or-preparation-denied" | "evidence-unavailable";
                            /** Format: date-time */
                            last_attempt_at?: string;
                        };
                        recovery?: {
                            /** @enum {string} */
                            state: "observing" | "suspected-stuck" | "awaiting-finality" | "finalized" | "unavailable" | "blocked";
                            /** @enum {string} */
                            reason: "within-threshold" | "pending-too-long" | "nonce-gap-suspected" | "nonce-consumed-without-result" | "safe-nonce-advanced" | "insufficient-sponsor-funds" | "fee-cap-below-base-fee" | "transaction-not-visible" | "provider-nonce-conflict" | "evidence-unavailable" | "awaiting-finality" | "verified-finality";
                            /** Format: date-time */
                            observed_at: string;
                            pending_age_ms: number;
                            quarantined: boolean;
                            sponsor_nonce?: string;
                            confirmed_nonce?: string;
                            finalized_nonce?: string;
                            safe_nonce?: string;
                            /** @enum {string} */
                            next_action: "wait" | "restore-evidence" | "fund-sponsor" | "review-provider-fees" | "review-provider-nonces" | "reconcile" | "operator-review";
                        };
                        /** @enum {string} */
                        contract: "execution-dispatch-v1";
                        execution_id: string;
                        plan_hash: string;
                        /** @enum {string} */
                        dispatch_status: "not_started" | "pending" | "accepted" | "unknown" | "failed";
                        transaction_hash?: string;
                    };
                };
            };
        };
    };
    getExecutorDispatch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                executionId: string;
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
                        provider_inspection?: {
                            replacement?: {
                                /** @enum {string} */
                                state: "prepared" | "dispatch" | "accepted" | "unknown" | "observed" | "abandoned" | "exhausted" | "blocked" | "settled";
                                attempts: number;
                                /** @enum {string} */
                                reason?: "fee-cap" | "attempt-limit" | "authority-or-preparation-denied" | "evidence-unavailable";
                                /** Format: date-time */
                                last_attempt_at?: string;
                            };
                            status: string;
                            nonce?: string;
                            transactionHash?: string;
                        };
                        replacement?: {
                            /** @enum {string} */
                            state: "prepared" | "dispatch" | "accepted" | "unknown" | "observed" | "abandoned" | "exhausted" | "blocked" | "settled";
                            attempts: number;
                            /** @enum {string} */
                            reason?: "fee-cap" | "attempt-limit" | "authority-or-preparation-denied" | "evidence-unavailable";
                            /** Format: date-time */
                            last_attempt_at?: string;
                        };
                        recovery?: {
                            /** @enum {string} */
                            state: "observing" | "suspected-stuck" | "awaiting-finality" | "finalized" | "unavailable" | "blocked";
                            /** @enum {string} */
                            reason: "within-threshold" | "pending-too-long" | "nonce-gap-suspected" | "nonce-consumed-without-result" | "safe-nonce-advanced" | "insufficient-sponsor-funds" | "fee-cap-below-base-fee" | "transaction-not-visible" | "provider-nonce-conflict" | "evidence-unavailable" | "awaiting-finality" | "verified-finality";
                            /** Format: date-time */
                            observed_at: string;
                            pending_age_ms: number;
                            quarantined: boolean;
                            sponsor_nonce?: string;
                            confirmed_nonce?: string;
                            finalized_nonce?: string;
                            safe_nonce?: string;
                            /** @enum {string} */
                            next_action: "wait" | "restore-evidence" | "fund-sponsor" | "review-provider-fees" | "review-provider-nonces" | "reconcile" | "operator-review";
                        };
                        /** @enum {string} */
                        contract: "execution-dispatch-v1";
                        execution_id: string;
                        plan_hash: string;
                        /** @enum {string} */
                        dispatch_status: "not_started" | "pending" | "accepted" | "unknown" | "failed";
                        transaction_hash?: string;
                    };
                };
            };
        };
    };
}
