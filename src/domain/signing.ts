import type { components } from '../protocol/wallet-v1.generated.js';

export type TypedDataAction = components['schemas']['TypedDataAction'];

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
