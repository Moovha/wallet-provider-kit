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
export { createOnboardingProvider } from './onboarding/provider.js';
export type { OnboardingProviderConfiguration } from './onboarding/provider.js';
export { defineOnboardingPolicy } from './onboarding/policy.js';
export { OnboardingService, ownerKey } from './onboarding/service.js';
export { createFileOnboardingStore } from './onboarding/file-store.js';
export { createOnboardingJournal } from './onboarding/journal.js';
export { createOwnerLogin } from './onboarding/login.js';
export type {
  OwnerLogin,
  OwnerLoginConfiguration,
} from './onboarding/login.js';
export {
  createDiditIdentityAdapter,
  createSumsubIdentityAdapter,
} from './onboarding/vendors.js';
export type {
  DiditConfiguration,
  SumsubConfiguration,
} from './onboarding/vendors.js';
export { accessType } from './onboarding/types.js';
export type {
  OnboardingPolicy,
  ApplicationPolicy,
  OnboardingStore,
  ProviderState,
  IdentityAdapter,
  IdentityEvidence,
  OwnerIdentity,
  Permission,
  VendorPrice,
} from './onboarding/types.js';
