export type TypedValue =
  string | boolean | TypedValue[] | { [key: string]: TypedValue };
/** Internal owner-signer envelope for Safe intent approval, account bootstrap and immutable SafeOp signing. */
export interface TypedDataAction {
  action_id: string;
  operation_id: string;
  plan_revision: string;
  plan_hash: string;
  binding_revision: string;
  capability_revision: string;
  profile: 'safe_owner_v1';
  profile_revision: string;
  chain_id: string;
  chain_account_id: string;
  payload_hash: string;
  dependencies: string[];
  expires_at: string;
  status:
    | 'blocked'
    | 'ready'
    | 'pending'
    | 'fulfilled'
    | 'rejected'
    | 'expired'
    | 'unknown';
  kind: 'sign_typed_data';
  payload: {
    domain: Record<string, TypedValue>;
    types: Record<string, { name: string; type: string }[]>;
    message: Record<string, TypedValue>;
    primaryType: string;
  };
}

export interface EmbeddedAccount {
  accountId: string;
  address: string;
}

export interface WalletSigningProvider {
  readonly provider: string;
  createAccount(accountId: string, attemptId: string): Promise<EmbeddedAccount>;
  findAccount(accountId: string): Promise<EmbeddedAccount | null>;
  signTypedData(
    account: EmbeddedAccount,
    action: TypedDataAction,
    attemptId: string,
  ): Promise<string>;
}

export class WalletProviderError extends Error {
  constructor(
    readonly code:
      | 'wallet_provider_configuration'
      | 'wallet_provider_input'
      | 'wallet_provider_rejected'
      | 'wallet_provider_unavailable'
      | 'wallet_provider_response'
      | 'wallet_authorization_denied'
      | 'wallet_attempt_conflict'
      | 'wallet_signatures_pending'
      | 'wallet_attempt_pending'
      | 'wallet_attempt_unavailable'
      | 'wallet_identity_invalid'
      | 'wallet_identity_unavailable'
      | 'wallet_onboarding_unavailable'
      | 'wallet_enrollment_unavailable',
    readonly outcome:
      'not_dispatched' | 'rejected' | 'unknown' = 'not_dispatched',
  ) {
    // Provider exceptions can contain request headers, credentials and payloads.
    super(code);
    this.name = 'WalletProviderError';
  }
}
