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
export { createServer } from './service/server.js';
export type { ServerOptions } from './service/server.js';
export { createAuthenticator } from './service/auth.js';
export type { Authenticate, OAuthConfiguration } from './service/auth.js';
export { startTelemetry } from './service/telemetry.js';
export { EnrollmentService } from './domain/enrollment.js';
export type {
  EnrollmentAuthority,
  EnrollmentChallenge,
  EnrollmentRecord,
  EnrollmentDecision,
  EnrollmentStatus,
} from './domain/enrollment.js';
export { createIdentityVerifier } from './identity/oidc.js';
export type {
  IdentityConfiguration,
  IdentityVerifier,
  IdentityAttribute,
  VerifiedIdentity,
} from './identity/oidc.js';
export type { paths as ProviderPaths } from './protocol/provider-api.generated.js';

export { createJournaledWalletProvider } from './providers/journaled.js';
export type {
  JournaledProviderOptions,
  WalletAttemptJournal,
  WalletAttemptRequest,
  WalletAttemptResult,
  WalletAttemptFailure,
  WalletAttemptClaim,
} from './domain/attempt-journal.js';
