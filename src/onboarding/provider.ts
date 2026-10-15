import { EmbeddedWalletService } from '../domain/embedded-wallet.js';
import { WalletProviderError } from '../domain/signing.js';
import type { WalletSigningProvider } from '../domain/signing.js';
import { createJournaledWalletProvider } from '../providers/journaled.js';
import {
  createAuthenticator,
  type OAuthConfiguration,
} from '../service/auth.js';
import { createServer } from '../service/server.js';
import { createFileOnboardingStore } from './file-store.js';
import { createOwnerLogin, type OwnerLoginConfiguration } from './login.js';
import { createOnboardingJournal } from './journal.js';
import { OnboardingService } from './service.js';
import type { OnboardingPolicy } from './types.js';
import { fingerprint } from './policy.js';
import {
  createDiditIdentityAdapter,
  createSumsubIdentityAdapter,
  type DiditConfiguration,
  type SumsubConfiguration,
} from './vendors.js';

export interface OnboardingProviderConfiguration {
  policy: OnboardingPolicy;
  /** Private absolute directory on a persistent local POSIX filesystem. */
  storageDirectory: string;
  oauth: OAuthConfiguration;
  ownerLogin: OwnerLoginConfiguration;
  reviewers: string[];
  identity: { didit?: DiditConfiguration; sumsub?: SumsubConfiguration };
  walletBackend: WalletSigningProvider;
  /** Prove the selected backend's lifecycle and recovery before enabling provisioning. */
  ready: () => Promise<boolean>;
}
/** One configuration, hosted consent/review, persistent grants and journaled account creation. */
export async function createOnboardingProvider(
  config: OnboardingProviderConfiguration,
) {
  if (
    process.env.GAE_SERVICE === 'exchange' ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
    !Array.isArray(config.reviewers) ||
    !config.reviewers.length ||
    config.reviewers.some((s) => !s || s.length > 256) ||
    !config.identity ||
    (!config.identity.didit && !config.identity.sumsub) ||
    typeof config.ready !== 'function'
  )
    throw new WalletProviderError('wallet_provider_configuration');
  const store = createFileOnboardingStore(config.storageDirectory);
  const identity = [
    ...(config.identity.didit
      ? [createDiditIdentityAdapter(config.identity.didit)]
      : []),
    ...(config.identity.sumsub
      ? [createSumsubIdentityAdapter(config.identity.sumsub)]
      : []),
  ];
  const onboarding = new OnboardingService(
    config.policy,
    store,
    identity,
    config.walletBackend,
  );
  const login = await createOwnerLogin(
    config.ownerLogin,
    onboarding.policy.provider.origin,
    store,
  );
  const backend = createJournaledWalletProvider(config.walletBackend, {
    namespace:
      'onboarding-' +
      fingerprint(onboarding.policy.provider.origin).slice(0, 32),
    journal: createOnboardingJournal(store),
    authorizeAttempt: (request) =>
      request.kind === 'provision'
        ? onboarding.canDispatchProvision(request.attemptId, request.accountId)
        : Promise.resolve(false),
  });
  return createServer({
    authenticate: createAuthenticator(structuredClone(config.oauth)),
    service: new EmbeddedWalletService(onboarding.walletAuthority(), backend),
    onboarding: {
      service: onboarding,
      login,
      reviewers: [...config.reviewers],
    },
    ready: async () =>
      (await config.ready()) && (await store.transaction(() => true)),
  });
}
