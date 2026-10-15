/** Host authority, stored actions and durable signing attempts. No HTTP startup. */
export { EmbeddedWalletService } from './domain/embedded-wallet.js';
export type {
  EmbeddedWalletAuthority,
  SigningAuthority,
} from './domain/embedded-wallet.js';
export { WalletProviderError } from './domain/signing.js';
export type {
  EmbeddedAccount,
  TypedDataAction,
  WalletSigningProvider,
} from './domain/signing.js';
export type {
  AuthorityContext,
  VerifiedPrincipal,
} from './domain/principal.js';
export { createJournaledWalletProvider } from './providers/journaled.js';
export type {
  JournaledProviderOptions,
  WalletAttemptJournal,
  WalletAttemptRequest,
  WalletAttemptResult,
  WalletAttemptFailure,
  WalletAttemptClaim,
} from './domain/attempt-journal.js';

export {
  createDurableSigningService,
  createStoredWalletBackend,
} from './backend.js';
export type {
  StoredSigningResult,
  StoredSigningDispatch,
  StoredSigningAuthority,
  StoredTypedDataSigner,
  StoredAccountRecord,
  StoredAccountResult,
  StoredAccountAuthority,
  StoredWalletBackendConfiguration,
} from './backend.js';
