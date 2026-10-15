export interface paths {
    "/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Discover protocol capabilities */
        get: operations["getCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List registered asset units */
        get: operations["listAssets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/account-links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create one-use ownership challenge
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        post: operations["createAccountLink"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/account-links/{linkId}/proof": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Validate ownership without activating spending
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        post: operations["proveAccountLink"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/account-links/{linkId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Revoke provider link and report outstanding authorities
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        delete: operations["revokeAccountLink"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accounts/{accountId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read authorized account
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        get: operations["getAccount"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accounts/{accountId}/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read effective account capabilities
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        get: operations["getAccountCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accounts/{accountId}/balances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read observed balances without provisioning
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        get: operations["getAccountBalances"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read authorized operation history
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        get: operations["listOperations"];
        put?: never;
        /**
         * Prepare a draft without funding or signing
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        post: operations["prepareOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/{operationId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read authoritative operation and recovery state
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        get: operations["getOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/{operationId}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Requote an uncommitted draft
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        post: operations["reviseOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/{operationId}/commit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Admit exact reviewed immutable plan
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        post: operations["commitOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/{operationId}/actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read exact actions and dependencies
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        get: operations["listActions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/{operationId}/actions/{actionId}/results": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Record exact authorization or submission result
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        post: operations["submitActionResult"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/{operationId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Request cancellation with explicit outstanding authorities
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        post: operations["cancelOperation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Poll authorized minimal event references
         * @description Requires verified provider access token and current client-bound owner grant/object scope; never accepts a caller-supplied subject or KYC status.
         */
        get: operations["listEvents"];
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
    schemas: {
        /** Format: uuid */
        ResourceId: string;
        Revision: string;
        /** @description Canonical unsigned base-unit decimal string, at most 2^256-1. Never parse through Number. */
        Uint256: string;
        PositiveAmount: components["schemas"]["Uint256"] & string;
        Hash: string;
        HexBytes: string;
        ChainId: string;
        /** @description CAIP-10 EVM account. Chain agreement and checksum/canonical identity are semantic checks. */
        ChainAccountId: string;
        /** @description Pinned CAIP-19 fungible profile. Registry distinguishes native, underlying and share assets; symbols are display only. */
        AssetId: string;
        /** Format: date-time */
        Timestamp: string;
        /** @enum {string} */
        OperationKind: "transfer" | "swap" | "deposit" | "withdraw" | "redeem" | "bridge" | "cashout" | "wallet_migration";
        /** @enum {string} */
        OperationStatus: "draft" | "requires_action" | "processing" | "needs_review" | "completed" | "cancelled" | "expired" | "failed";
        /** @enum {string} */
        ActionKind: "sign_typed_data" | "sign_transaction" | "submit_transaction" | "submit_calls" | "account_operation";
        Profile: string;
        AssetAmount: {
            asset_id: components["schemas"]["AssetId"];
            amount: components["schemas"]["Uint256"];
        };
        TransferIntent: {
            /** @constant */
            kind: "transfer";
            debit: components["schemas"]["AssetAmount"];
            recipient: components["schemas"]["ChainAccountId"];
        };
        /** @description Exact input only; route, fee and registry policy are server-derived. */
        SwapIntent: {
            /** @constant */
            kind: "swap";
            input: components["schemas"]["AssetAmount"];
            output_asset_id: components["schemas"]["AssetId"];
            minimum_output: components["schemas"]["Uint256"];
            recipient: components["schemas"]["ChainAccountId"];
            refund_account: components["schemas"]["ChainAccountId"];
        };
        DepositIntent: {
            /** @constant */
            kind: "deposit";
            vault: components["schemas"]["ChainAccountId"];
            underlying: components["schemas"]["AssetAmount"];
            minimum_shares: components["schemas"]["Uint256"];
            recipient: components["schemas"]["ChainAccountId"];
        };
        WithdrawIntent: {
            /** @constant */
            kind: "withdraw";
            vault: components["schemas"]["ChainAccountId"];
            assets: components["schemas"]["AssetAmount"];
            maximum_shares: components["schemas"]["PositiveAmount"];
            recipient: components["schemas"]["ChainAccountId"];
        };
        RedeemIntent: {
            /** @constant */
            kind: "redeem";
            vault: components["schemas"]["ChainAccountId"];
            shares: components["schemas"]["AssetAmount"];
            minimum_assets: components["schemas"]["Uint256"];
            recipient: components["schemas"]["ChainAccountId"];
        };
        BridgeIntent: {
            /** @constant */
            kind: "bridge";
            input: components["schemas"]["AssetAmount"];
            destination_asset_id: components["schemas"]["AssetId"];
            minimum_delivery: components["schemas"]["Uint256"];
            recipient: components["schemas"]["ChainAccountId"];
            refund_account: components["schemas"]["ChainAccountId"];
            /** @enum {string} */
            finality_policy: "standard" | "fast";
        };
        FiatAmount: {
            currency: string;
            minor_units: components["schemas"]["Uint256"];
            minor_unit_exponent: number;
        };
        /** @description Beneficiary is an authorized opaque server-side reference; no arbitrary payout URL or account details. */
        CashoutIntent: {
            /** @constant */
            kind: "cashout";
            input: components["schemas"]["AssetAmount"];
            beneficiary_id: components["schemas"]["ResourceId"];
            minimum_fiat_delivery: components["schemas"]["FiatAmount"];
            refund_account: components["schemas"]["ChainAccountId"];
        };
        /** @description First-party attested owner only, fresh recovery/step-up required; provider grants cannot initiate migration. */
        MigrationIntent: {
            /** @constant */
            kind: "wallet_migration";
            destination_account_id: components["schemas"]["ResourceId"];
            inventory_revision: components["schemas"]["Revision"];
        };
        Intent: components["schemas"]["TransferIntent"] | components["schemas"]["SwapIntent"] | components["schemas"]["DepositIntent"] | components["schemas"]["WithdrawIntent"] | components["schemas"]["RedeemIntent"] | components["schemas"]["BridgeIntent"] | components["schemas"]["CashoutIntent"] | components["schemas"]["MigrationIntent"];
        /** @description The principal supplies subject/environment/client authority. Provider requests require current grant_id. No private keys or client-provided KYC/fees. */
        PrepareRequest: {
            account_id: components["schemas"]["ResourceId"];
            grant_id?: components["schemas"]["ResourceId"];
            intent: components["schemas"]["Intent"];
            external_reference?: string;
        };
        RevisionRequest: {
            expected_revision: components["schemas"]["Revision"];
            intent: components["schemas"]["Intent"];
        };
        CommitRequest: {
            plan_revision: components["schemas"]["Revision"];
            plan_hash: components["schemas"]["Hash"];
            binding_revision: components["schemas"]["Revision"];
            capability_revision: components["schemas"]["Revision"];
        };
        CancelRequest: {
            expected_revision: components["schemas"]["Revision"];
            /** @enum {string} */
            reason: "user_requested" | "superseded";
        };
        Account: {
            account_id: components["schemas"]["ResourceId"];
            chain_account_id: components["schemas"]["ChainAccountId"];
            chain_id: components["schemas"]["ChainId"];
            binding_revision: components["schemas"]["Revision"];
            profile: components["schemas"]["Profile"];
            profile_revision: components["schemas"]["Revision"];
            capability_revision: components["schemas"]["Revision"];
            /** @enum {string} */
            link_state: "linked" | "revoked" | "suspended";
            /** @enum {string} */
            key_control: "moovha_custody" | "device" | "external_provider";
            recovery_policy_id: string;
        };
        /** @description Effective intersection of certified provider, account/chain/token, current session/grant and enabled driver. Empty support means unavailable. */
        Capability: {
            profile: components["schemas"]["Profile"];
            profile_revision: components["schemas"]["Revision"];
            capability_revision: components["schemas"]["Revision"];
            operation_kinds: components["schemas"]["OperationKind"][];
            action_kinds: components["schemas"]["ActionKind"][];
            signature_formats: string[];
            /** @enum {string} */
            submission_owner: "moovha" | "wallet" | "certified_driver";
            sponsor_modes: ("relayed" | "bounded_eoa_grant" | "account_sponsored")[];
            maximum_payload_bytes: number;
            maximum_action_lifetime_seconds: number;
        };
        Discovery: {
            /** @constant */
            protocol_version: "1";
            /** @enum {string} */
            release_state: "unavailable" | "test" | "cohort" | "available";
            chain_ids: components["schemas"]["ChainId"][];
            profiles: components["schemas"]["Capability"][];
            idempotency_replay_seconds: number;
            /** @constant */
            maximum_request_bytes: 262144;
        };
        Asset: {
            asset_id: components["schemas"]["AssetId"];
            chain_id: components["schemas"]["ChainId"];
            /** @enum {string} */
            kind: "native" | "token" | "vault_share";
            decimals: number;
            symbol: string;
            name: string;
            registry_revision: components["schemas"]["Revision"];
            contract_version: string;
        };
        Observation: {
            block_number: components["schemas"]["Uint256"];
            block_hash: components["schemas"]["Hash"];
            /** @enum {string} */
            finality: "pending" | "included" | "safe" | "finalized";
            observed_at: components["schemas"]["Timestamp"];
        };
        Balance: {
            asset: components["schemas"]["AssetAmount"];
            observation: components["schemas"]["Observation"];
        };
        /** @description Requires existing Moovha-authenticated owner consent for this client/account. SIWE alone does not create a grant. */
        LinkRequest: {
            grant_id: components["schemas"]["ResourceId"];
            chain_account_id: components["schemas"]["ChainAccountId"];
            profile: components["schemas"]["Profile"];
        };
        /** @description Complete server-created SIWE message bound to client, subject, account, chain, URI, domain, purpose, one-use nonce and expiry. Never a spending request. */
        LinkChallenge: {
            link_id: components["schemas"]["ResourceId"];
            grant_id: components["schemas"]["ResourceId"];
            chain_account_id: components["schemas"]["ChainAccountId"];
            profile: components["schemas"]["Profile"];
            message: string;
            expires_at: components["schemas"]["Timestamp"];
            /** @constant */
            purpose: "account_link";
        };
        LinkProof: {
            message: string;
            signature: components["schemas"]["HexBytes"];
            profile: components["schemas"]["Profile"];
        };
        LinkRevocation: {
            link_id: components["schemas"]["ResourceId"];
            /** @constant */
            state: "revoked";
            outstanding_operation_ids: components["schemas"]["ResourceId"][];
            outstanding_authorities: components["schemas"]["Authority"][];
        };
        Authority: {
            action_id: components["schemas"]["ResourceId"];
            /** @enum {string} */
            state: "usable" | "unknown" | "invalidation_required" | "expired" | "invalidated";
            onchain_deadline?: components["schemas"]["Uint256"];
        };
        Credit: {
            asset_id: components["schemas"]["AssetId"];
            expected_amount: components["schemas"]["Uint256"];
            minimum_amount: components["schemas"]["Uint256"];
            recipient: components["schemas"]["ChainAccountId"];
        };
        Fee: {
            asset: components["schemas"]["AssetAmount"];
            recipient: components["schemas"]["ChainAccountId"];
            /** @enum {string} */
            kind: "platform" | "partner" | "bridge" | "payout";
        };
        BridgeTerms: {
            /** @enum {string} */
            minimum_finality_threshold: "1000" | "2000";
            maximum_fee: components["schemas"]["AssetAmount"];
            destination_caller: components["schemas"]["ChainAccountId"];
            destination_chain_id: components["schemas"]["ChainId"];
        };
        CashoutTerms: {
            beneficiary_id: components["schemas"]["ResourceId"];
            beneficiary_commitment: components["schemas"]["Hash"];
            minimum_delivery: components["schemas"]["FiatAmount"];
            escrow: components["schemas"]["ChainAccountId"];
            policy_id: components["schemas"]["Hash"];
            refund_after: components["schemas"]["Uint256"];
        };
        /** @description Registry-derived exact review; conditional bridge/cashout terms required by corresponding intent. Must be equivalent to the contract payload, not trusted display text. */
        Review: {
            debits: components["schemas"]["AssetAmount"][];
            credits: components["schemas"]["Credit"][];
            fees: components["schemas"]["Fee"][];
            refund_accounts: components["schemas"]["ChainAccountId"][];
            asset_registry_revision: components["schemas"]["Revision"];
            bridge?: components["schemas"]["BridgeTerms"];
            cashout?: components["schemas"]["CashoutTerms"];
        };
        SponsorStep: {
            step_id: components["schemas"]["ResourceId"];
            chain_id: components["schemas"]["ChainId"];
            onchain_payer: components["schemas"]["ChainAccountId"];
            maximum_network_cost: components["schemas"]["AssetAmount"];
            grant: components["schemas"]["AssetAmount"];
            eligible_components: ("execution_gas" | "base_l1_data" | "operator_fee" | "authorized_replacement" | "failed_authorized_call")[];
        };
        /** @description Grant covers full admitted cost independent of personal ETH. Native principal/business fees excluded. Actual fees and one make-good reconcile per step. */
        Sponsorship: {
            /** @constant */
            economic_sponsor: "moovha";
            /** @enum {string} */
            mode: "relayed" | "bounded_eoa_grant" | "account_sponsored";
            steps: components["schemas"]["SponsorStep"][];
            expires_at: components["schemas"]["Timestamp"];
            /** @enum {string} */
            retained_grant_terms: "not_applicable" | "wallet_can_retain_full_bounded_grant";
            /** @constant */
            personal_balance_offset: "0";
        };
        SubmissionReference: components["schemas"]["TransactionReference"] | components["schemas"]["CallsReference"] | components["schemas"]["UserOperationReference"];
        TransactionReference: {
            /** @constant */
            kind: "evm_transaction";
            chain_id: components["schemas"]["ChainId"];
            driver: components["schemas"]["Profile"];
            transaction_hash: components["schemas"]["Hash"];
        };
        CallsReference: {
            /** @constant */
            kind: "wallet_calls";
            chain_id: components["schemas"]["ChainId"];
            driver: components["schemas"]["Profile"];
            calls_id: string;
        };
        UserOperationReference: {
            /** @constant */
            kind: "user_operation";
            chain_id: components["schemas"]["ChainId"];
            driver: components["schemas"]["Profile"];
            user_operation_hash: components["schemas"]["Hash"];
            entry_point: components["schemas"]["ChainAccountId"];
        };
        Step: {
            step_id: components["schemas"]["ResourceId"];
            dependencies: components["schemas"]["ResourceId"][];
            /** @enum {string} */
            status: "blocked" | "requires_action" | "ready" | "submitted" | "confirming" | "confirmed" | "failed" | "unknown" | "skipped";
            reason_code?: string;
            submission?: components["schemas"]["SubmissionReference"];
        };
        Cancellation: {
            /** @enum {string} */
            state: "none" | "requested" | "requires_invalidation" | "reconciling" | "resolved";
            outstanding_authorities: components["schemas"]["Authority"][];
            recovery_codes: string[];
        };
        /** @description Drafts contain no signable actions. Commit freezes intent/review/plan. Completion requires all intended effects and finality; accepted/approved/submitted are not completed. */
        Operation: {
            operation_id: components["schemas"]["ResourceId"];
            /** @constant */
            protocol_version: "1";
            revision: components["schemas"]["Revision"];
            status: components["schemas"]["OperationStatus"];
            account_id: components["schemas"]["ResourceId"];
            binding_revision: components["schemas"]["Revision"];
            capability_revision: components["schemas"]["Revision"];
            plan_revision: components["schemas"]["Revision"];
            plan_hash: components["schemas"]["Hash"];
            intent: components["schemas"]["Intent"];
            review: components["schemas"]["Review"];
            sponsorship: components["schemas"]["Sponsorship"];
            expires_at: components["schemas"]["Timestamp"];
            created_at: components["schemas"]["Timestamp"];
            updated_at: components["schemas"]["Timestamp"];
            steps: components["schemas"]["Step"][];
            action_ids: components["schemas"]["ResourceId"][];
            effects: components["schemas"]["Effect"][];
            cancellation: components["schemas"]["Cancellation"];
            predecessor_operation_id?: components["schemas"]["ResourceId"];
        };
        /** @description Initial EOA profile permits at most three container levels within each domain/message field; deeper payloads require a versioned schema/profile extension. Integer values are strings, not JSON numbers. */
        TypedValue: components["schemas"]["TypedScalar"] | components["schemas"]["TypedValueLevel2"][] | {
            [key: string]: components["schemas"]["TypedValueLevel2"];
        };
        TypedField: {
            name: string;
            type: string;
        };
        /** @description Complete EIP-712 data. Integer fields are decimal strings; selected profile validates types and computes the EIP-712 digest. Arbitrary typed data is never accepted as a prepare intent. */
        TypedData: {
            domain: {
                [key: string]: components["schemas"]["TypedValue"];
            };
            types: {
                [key: string]: components["schemas"]["TypedField"][];
            };
            message: {
                [key: string]: components["schemas"]["TypedValue"];
            };
            primaryType: string;
        };
        /** @description Fully populated initial EIP-1559 transaction. Exact chain/from/to/value/calldata and detached fees/nonce are immutable. Wallet edits require driver reconciliation, never blind retry. */
        Transaction: {
            chain_id: components["schemas"]["ChainId"];
            from: components["schemas"]["ChainAccountId"];
            to: components["schemas"]["ChainAccountId"];
            value: components["schemas"]["Uint256"];
            data: string;
            nonce: components["schemas"]["Uint256"];
            gas_limit: components["schemas"]["PositiveAmount"];
            max_fee_per_gas: components["schemas"]["PositiveAmount"];
            max_priority_fee_per_gas: components["schemas"]["Uint256"];
            /** @constant */
            type: "2";
        };
        TypedDataAction: {
            action_id: components["schemas"]["ResourceId"];
            operation_id: components["schemas"]["ResourceId"];
            plan_revision: components["schemas"]["Revision"];
            plan_hash: components["schemas"]["Hash"];
            binding_revision: components["schemas"]["Revision"];
            capability_revision: components["schemas"]["Revision"];
            profile: components["schemas"]["Profile"];
            profile_revision: components["schemas"]["Revision"];
            chain_id: components["schemas"]["ChainId"];
            chain_account_id: components["schemas"]["ChainAccountId"];
            payload_hash: components["schemas"]["Hash"];
            dependencies: components["schemas"]["ResourceId"][];
            expires_at: components["schemas"]["Timestamp"];
            /** @enum {string} */
            status: "blocked" | "ready" | "pending" | "fulfilled" | "rejected" | "expired" | "unknown";
            /** @constant */
            kind: "sign_typed_data";
            payload: components["schemas"]["TypedData"];
        };
        SignTransactionAction: {
            action_id: components["schemas"]["ResourceId"];
            operation_id: components["schemas"]["ResourceId"];
            plan_revision: components["schemas"]["Revision"];
            plan_hash: components["schemas"]["Hash"];
            binding_revision: components["schemas"]["Revision"];
            capability_revision: components["schemas"]["Revision"];
            profile: components["schemas"]["Profile"];
            profile_revision: components["schemas"]["Revision"];
            chain_id: components["schemas"]["ChainId"];
            chain_account_id: components["schemas"]["ChainAccountId"];
            payload_hash: components["schemas"]["Hash"];
            dependencies: components["schemas"]["ResourceId"][];
            expires_at: components["schemas"]["Timestamp"];
            /** @enum {string} */
            status: "blocked" | "ready" | "pending" | "fulfilled" | "rejected" | "expired" | "unknown";
            /** @constant */
            kind: "sign_transaction";
            payload: components["schemas"]["Transaction"];
        };
        SubmitTransactionAction: {
            action_id: components["schemas"]["ResourceId"];
            operation_id: components["schemas"]["ResourceId"];
            plan_revision: components["schemas"]["Revision"];
            plan_hash: components["schemas"]["Hash"];
            binding_revision: components["schemas"]["Revision"];
            capability_revision: components["schemas"]["Revision"];
            profile: components["schemas"]["Profile"];
            profile_revision: components["schemas"]["Revision"];
            chain_id: components["schemas"]["ChainId"];
            chain_account_id: components["schemas"]["ChainAccountId"];
            payload_hash: components["schemas"]["Hash"];
            dependencies: components["schemas"]["ResourceId"][];
            expires_at: components["schemas"]["Timestamp"];
            /** @enum {string} */
            status: "blocked" | "ready" | "pending" | "fulfilled" | "rejected" | "expired" | "unknown";
            /** @constant */
            kind: "submit_transaction";
            payload: components["schemas"]["Transaction"];
        };
        /** @description Initial EOA wire profile. submit_calls/account_operation are advertised only after a separately versioned certified driver defines its exact schema; unavailable in this revision. Unknown required action kinds must be rejected. */
        Action: components["schemas"]["TypedDataAction"] | components["schemas"]["SignTransactionAction"] | components["schemas"]["SubmitTransactionAction"];
        PendingResult: {
            /** @constant */
            kind: "pending";
            provider_reference?: string;
        };
        SignatureResult: {
            /** @constant */
            kind: "signature";
            signature: components["schemas"]["HexBytes"];
        };
        SignedTransactionResult: {
            /** @constant */
            kind: "signed_transaction";
            signed_transaction: components["schemas"]["HexBytes"];
        };
        SubmittedResult: {
            /** @constant */
            kind: "submitted";
            reference: components["schemas"]["SubmissionReference"];
        };
        RejectedResult: {
            /** @constant */
            kind: "rejected";
            /** @enum {string} */
            reason: "user_rejected" | "unsupported_method" | "account_changed" | "chain_changed" | "expired";
        };
        /** @description All echoed values must equal persisted action; semantic validator checks result kind against action. Pending and HTTP acceptance confer no financial authority. */
        ActionResultRequest: {
            action_id: components["schemas"]["ResourceId"];
            plan_revision: components["schemas"]["Revision"];
            plan_hash: components["schemas"]["Hash"];
            binding_revision: components["schemas"]["Revision"];
            capability_revision: components["schemas"]["Revision"];
            profile: components["schemas"]["Profile"];
            profile_revision: components["schemas"]["Revision"];
            chain_id: components["schemas"]["ChainId"];
            chain_account_id: components["schemas"]["ChainAccountId"];
            payload_hash: components["schemas"]["Hash"];
            result: components["schemas"]["PendingResult"] | components["schemas"]["SignatureResult"] | components["schemas"]["SignedTransactionResult"] | components["schemas"]["SubmittedResult"] | components["schemas"]["RejectedResult"];
        };
        Event: {
            event_id: components["schemas"]["ResourceId"];
            /** @constant */
            protocol_version: "1";
            /** @enum {string} */
            type: "operation.updated" | "action.available" | "account.updated" | "grant.revoked";
            resource_id: components["schemas"]["ResourceId"];
            resource_revision: components["schemas"]["Revision"];
            occurred_at: components["schemas"]["Timestamp"];
            operation_id?: components["schemas"]["ResourceId"];
        };
        FieldError: {
            pointer: string;
            code: string;
        };
        /** @description RFC 9457 error. No raw bodies, signatures, credentials, private keys or beneficiary PII. */
        Problem: {
            /** Format: uri */
            type: string;
            title: string;
            status: number;
            /** @enum {string} */
            code: "INVALID_REQUEST" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "IDEMPOTENCY_CONFLICT" | "REVISION_CONFLICT" | "ID_VERIFICATION_REQUIRED" | "GRANT_REVOKED" | "ACCOUNT_BINDING_CHANGED" | "UNSUPPORTED_CAPABILITY" | "INVALID_INTENT" | "ACTION_EXPIRED" | "ACTION_MISMATCH" | "DEPENDENCY_UNAVAILABLE" | "OUTCOME_UNKNOWN" | "RATE_LIMITED" | "SPONSOR_BUDGET_EXHAUSTED" | "OPERATION_STATE_CONFLICT";
            request_id: components["schemas"]["ResourceId"];
            operation_id?: components["schemas"]["ResourceId"];
            errors?: components["schemas"]["FieldError"][];
        };
        AssetPage: {
            items: components["schemas"]["Asset"][];
            next_cursor?: string;
        };
        BalancePage: {
            items: components["schemas"]["Balance"][];
            next_cursor?: string;
        };
        OperationPage: {
            items: components["schemas"]["Operation"][];
            next_cursor?: string;
        };
        ActionPage: {
            items: components["schemas"]["Action"][];
            next_cursor?: string;
        };
        EventPage: {
            items: components["schemas"]["Event"][];
            next_cursor?: string;
        };
        ChainEffect: {
            effect_id: components["schemas"]["ResourceId"];
            step_id: components["schemas"]["ResourceId"];
            /** @enum {string} */
            kind: "debit" | "credit" | "fee" | "sponsor_cost" | "escrow_locked" | "escrow_refunded";
            asset: components["schemas"]["AssetAmount"];
            account: components["schemas"]["ChainAccountId"];
            observation: components["schemas"]["Observation"];
            verified: boolean;
        };
        FiatEffect: {
            effect_id: components["schemas"]["ResourceId"];
            step_id: components["schemas"]["ResourceId"];
            /** @constant */
            kind: "payout_settled";
            amount: components["schemas"]["FiatAmount"];
            beneficiary_commitment: components["schemas"]["Hash"];
            settlement_reference: string;
            verified_at: components["schemas"]["Timestamp"];
        };
        Effect: components["schemas"]["ChainEffect"] | components["schemas"]["FiatEffect"];
        TypedScalar: string | boolean;
        TypedValueLevel1: components["schemas"]["TypedScalar"] | components["schemas"]["TypedScalar"][] | {
            [key: string]: components["schemas"]["TypedScalar"];
        };
        TypedValueLevel2: components["schemas"]["TypedScalar"] | components["schemas"]["TypedValueLevel1"][] | {
            [key: string]: components["schemas"]["TypedValueLevel1"];
        };
    };
    responses: {
        /** @description Safe RFC 9457 error; 401 unauthenticated, 403 unauthorized, 404 invisible/missing, 409 revision/idempotency conflict, 422 invalid or unsupported, 429 rate/budget limit, 503 dependency unavailable. */
        Problem: {
            headers: {
                /** @description Seconds before a read/admission retry; never authorizes repeating a spend. */
                "Retry-After"?: string;
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        /** @description Random UUID; same canonical request returns original resource; changed body is 409. Not a financial dispatch retry token. */
        IdempotencyKey: components["schemas"]["ResourceId"];
        /** @description Opaque, tenant-bound cursor; never an arbitrary SQL offset. */
        Cursor: string;
        Limit: number;
    };
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
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Discovery"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    listAssets: {
        parameters: {
            query?: {
                /** @description Opaque, tenant-bound cursor; never an arbitrary SQL offset. */
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetPage"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    createAccountLink: {
        parameters: {
            query?: never;
            header: {
                /** @description Random UUID; same canonical request returns original resource; changed body is 409. Not a financial dispatch retry token. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LinkRequest"];
            };
        };
        responses: {
            /** @description Created resource. */
            201: {
                headers: {
                    /** @description Canonical resource URL under https://api.moovha.com/v1. */
                    Location: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LinkChallenge"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    proveAccountLink: {
        parameters: {
            query?: never;
            header: {
                /** @description Random UUID; same canonical request returns original resource; changed body is 409. Not a financial dispatch retry token. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                linkId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LinkProof"];
            };
        };
        responses: {
            /** @description Created resource. */
            201: {
                headers: {
                    /** @description Canonical resource URL under https://api.moovha.com/v1. */
                    Location: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Account"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    revokeAccountLink: {
        parameters: {
            query?: never;
            header: {
                /** @description Random UUID; same canonical request returns original resource; changed body is 409. Not a financial dispatch retry token. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                linkId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LinkRevocation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    getAccount: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                accountId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Account"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    getAccountCapabilities: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                accountId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Capability"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    getAccountBalances: {
        parameters: {
            query?: {
                /** @description Opaque, tenant-bound cursor; never an arbitrary SQL offset. */
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                accountId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BalancePage"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    listOperations: {
        parameters: {
            query?: {
                /** @description Opaque, tenant-bound cursor; never an arbitrary SQL offset. */
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
                account_id?: components["schemas"]["ResourceId"];
                status?: components["schemas"]["OperationStatus"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationPage"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    prepareOperation: {
        parameters: {
            query?: never;
            header: {
                /** @description Random UUID; same canonical request returns original resource; changed body is 409. Not a financial dispatch retry token. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrepareRequest"];
            };
        };
        responses: {
            /** @description Created resource. */
            201: {
                headers: {
                    /** @description Canonical resource URL under https://api.moovha.com/v1. */
                    Location: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    getOperation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                operationId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    reviseOperation: {
        parameters: {
            query?: never;
            header: {
                /** @description Random UUID; same canonical request returns original resource; changed body is 409. Not a financial dispatch retry token. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                operationId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevisionRequest"];
            };
        };
        responses: {
            /** @description Created resource. */
            201: {
                headers: {
                    /** @description Canonical resource URL under https://api.moovha.com/v1. */
                    Location: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    commitOperation: {
        parameters: {
            query?: never;
            header: {
                /** @description Random UUID; same canonical request returns original resource; changed body is 409. Not a financial dispatch retry token. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                operationId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommitRequest"];
            };
        };
        responses: {
            /** @description Command durably accepted; financial outcome pending. */
            202: {
                headers: {
                    /** @description Canonical resource URL under https://api.moovha.com/v1. */
                    Location: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    listActions: {
        parameters: {
            query?: {
                /** @description Opaque, tenant-bound cursor; never an arbitrary SQL offset. */
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path: {
                operationId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActionPage"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    submitActionResult: {
        parameters: {
            query?: never;
            header: {
                /** @description Random UUID; same canonical request returns original resource; changed body is 409. Not a financial dispatch retry token. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                operationId: components["schemas"]["ResourceId"];
                actionId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActionResultRequest"];
            };
        };
        responses: {
            /** @description Command durably accepted; financial outcome pending. */
            202: {
                headers: {
                    /** @description Canonical resource URL under https://api.moovha.com/v1. */
                    Location: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    cancelOperation: {
        parameters: {
            query?: never;
            header: {
                /** @description Random UUID; same canonical request returns original resource; changed body is 409. Not a financial dispatch retry token. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                operationId: components["schemas"]["ResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelRequest"];
            };
        };
        responses: {
            /** @description Command durably accepted; financial outcome pending. */
            202: {
                headers: {
                    /** @description Canonical resource URL under https://api.moovha.com/v1. */
                    Location: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    listEvents: {
        parameters: {
            query?: {
                /** @description Opaque, tenant-bound cursor; never an arbitrary SQL offset. */
                cursor?: components["parameters"]["Cursor"];
                limit?: components["parameters"]["Limit"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized current resource. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventPage"];
                };
            };
            400: components["responses"]["Problem"];
            401: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            422: components["responses"]["Problem"];
            429: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
}
