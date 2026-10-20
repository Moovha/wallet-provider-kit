import { SafeWalletRuntime } from '../sponsorship/safe-wallet.js';
import {
  createOwsWalletProvider,
  createOwsSigningBackend,
} from '../providers/ows.js';
import { ApplicationCredentialCipher } from '../runtime-configuration/credentials.js';
import { providerNetwork } from '../networks.js';
import { createBundledAuthorizationServer } from './authorization-server.js';
import { WalletCallsService } from '../wallet-calls/service.js';
import { RuntimeConfigurationService } from '../runtime-configuration/service.js';
import { createExplorerTokenIssuer } from './explorer-tokens.js';
import { resolve } from 'node:path';
import { EmbeddedWalletService } from '../domain/embedded-wallet.js';
import { createOnboardingJournal } from '../onboarding/journal.js';
import { createOwnerLogin } from '../onboarding/login.js';
import { fingerprint } from '../onboarding/policy.js';
import { OnboardingService } from '../onboarding/service.js';
import {
  createDiditIdentityAdapter,
  createSumsubIdentityAdapter,
} from '../onboarding/vendors.js';
import { createAuthenticator } from '../service/auth.js';
import { createServer } from '../service/server.js';
import { openProviderDatabase } from '../storage/index.js';
import {
  ConfigurationError,
  resolveSecret,
  validateProviderConfiguration,
  assertSafeWalletConfiguration,
} from './config.js';
import { SupportedActions } from './actions.js';

/** Compose the supported configured service with built-in authority and journals; activation remains explicit. */
export async function createConfiguredProvider(
  input: unknown,
  directory = process.cwd(),
) {
  if (
    process.env.GAE_SERVICE === 'exchange' ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
  )
    throw new ConfigurationError(['/: unsafe environment']);
  const config = validateProviderConfiguration(input);
  const network = providerNetwork(config.network);
  assertSafeWalletConfiguration(config);
  const authorizationServer = config.authorizationServer
    ? createBundledAuthorizationServer(config)
    : undefined;
  const authenticate =
    authorizationServer?.authenticate ?? createAuthenticator(config.oauth);
  const issueExplorerToken = config.apiExplorer
    ? createExplorerTokenIssuer(config, authenticate)
    : undefined;
  const database = openProviderDatabase({
    directory: resolve(directory, config.storage.directory),
  });
  try {
    let onboarding: OnboardingService | undefined;
    let financial: ReturnType<typeof database.financialAuthority> | undefined;
    let activeRevision: string | undefined;
    const passphrase = resolveSecret(config.backend.passphrase);
    if (
      passphrase.length < 16 ||
      passphrase.length > 4096 ||
      passphrase.startsWith('ows_key_')
    )
      throw new ConfigurationError([
        '/backend/passphrase: invalid owner credential',
      ]);
    const backendOptions = {
      vaultPath: resolve(directory, config.backend.vaultDirectory),
      passphrase: async () => passphrase,
      network: config.network,
    };
    const provision = createOwsWalletProvider(backendOptions, {
      namespace:
        'onboarding-' + fingerprint(config.policy.provider.origin).slice(0, 32),
      journal: createOnboardingJournal(database.onboardingStore),
      authorizeAttempt: async (request) =>
        request.kind === 'provision' &&
        !!onboarding &&
        !!activeRevision &&
        (await database.onboardingStore.transaction(
          (state) =>
            state.deploymentBindings?.['service-v1']?.activeRevision ===
              activeRevision &&
            state.deploymentBindings?.['service-v1']?.transportRevision ===
              transportRevision,
        )) &&
        (await onboarding.canDispatchProvision(
          request.attemptId,
          request.accountId,
        )),
    });
    const signing = createOwsWalletProvider(backendOptions, {
      namespace: 'configured-transfers-v1',
      journal: database.journal,
      authorizeAttempt: (request) =>
        financial?.authorizeAttempt(request) ?? Promise.resolve(false),
    });
    const backend = { ...provision, signTypedData: signing.signTypedData };
    const occupied = await database.hasStoredRecords();
    const bound = await database.onboardingStore.transaction((state) => {
      const expected = {
        origin: config.policy.provider.origin,
        provider: backend.provider,
        binding: config.backend.binding,
        accessMode: config.policy.access?.mode ?? 'hosted',
        network: network.name,
      };
      const previous = state.deploymentBindings?.['service-v1'];
      if (
        previous
          ? fingerprint({
              origin: previous.origin,
              provider: previous.provider,
              binding: previous.binding,
              accessMode: previous.accessMode ?? 'hosted',
              network: previous.network ?? 'base-sepolia',
            }) !== fingerprint(expected)
          : occupied
      )
        return false;
      (state.deploymentBindings ??= {})['service-v1'] = {
        ...previous,
        ...expected,
      };
      return true;
    });
    if (!bound)
      throw new ConfigurationError([
        '/storage: provider binding changed or existing host requires reviewed migration',
      ]);
    const identity = [
      ...(config.identity.didit
        ? [
            createDiditIdentityAdapter({
              ...config.identity.didit,
              apiKey: resolveSecret(config.identity.didit.apiKey),
            }),
          ]
        : []),
      ...(config.identity.sumsub
        ? [
            createSumsubIdentityAdapter({
              ...config.identity.sumsub,
              appToken: resolveSecret(config.identity.sumsub.appToken),
              secretKey: resolveSecret(config.identity.sumsub.secretKey),
            }),
          ]
        : []),
    ];
    const callPolicyBinding = config.safeWallet
      ? [config.approvedCalls, config.safeWallet]
      : config.approvedCalls;
    const actionPolicyRevisionBase = config.approvedCalls
      ? fingerprint([config.financial ?? null, callPolicyBinding])
      : config.financial
        ? fingerprint(config.financial)
        : undefined;
    const actionPolicyRevision = network.testnet
      ? actionPolicyRevisionBase
      : fingerprint([network.name, actionPolicyRevisionBase]);
    onboarding = new OnboardingService(
      config.policy,
      database.onboardingStore,
      identity,
      backend,
      actionPolicyRevision,
      config.runtimeConfiguration?.authorizeContracts,
      !!config.safeWallet,
    );
    const login = config.ownerLogin
      ? await createOwnerLogin(
          {
            ...config.ownerLogin,
            clientSecret: resolveSecret(config.ownerLogin.clientSecret),
          },
          config.policy.provider.origin,
          database.onboardingStore,
        )
      : undefined;
    const transportRevision = undefined;
    activeRevision = fingerprint([
      onboarding!.policy.revision,
      ...(network.testnet ? [] : [network.name]),
      config.financial ?? null,
      ...(config.safeWallet ? [config.safeWallet] : []),
      ...(config.safeProvisioning ? [config.safeProvisioning] : []),
      ...(config.approvedCalls ? [config.approvedCalls] : []),
      config.backend,
      config.reviewers,
      config.ownerLogin?.issuer,
      config.ownerLogin?.clientId,
      config.activation.enabled,
      ...(config.runtimeConfiguration ? [config.runtimeConfiguration] : []),
      ...(config.authorizationServer
        ? [config.authorizationServer, config.oauth]
        : []),
      ...(config.apiExplorer ? [config.apiExplorer, config.oauth] : []),
    ]);
    await database.onboardingStore.transaction((state) => {
      const binding = state.deploymentBindings!['service-v1'];
      if (binding.activeRevision !== activeRevision) {
        for (const record of Object.values(state.supportedActions ?? {})) {
          if (record.revision !== activeRevision) record.status = 'denied';
        }
        for (const grant of Object.values(state.grants)) {
          if (
            grant.revision !== onboarding!.policy.revision ||
            (grant.permissions.some((permission) =>
              ['transfers:request', 'contracts:request'].includes(permission),
            ) &&
              grant.transferPolicyRevision !== actionPolicyRevision)
          )
            grant.state = 'revoked';
        }
        state.audit.push({
          at: Date.now(),
          event: 'configured_policy_activated',
          resource: 'service-v1',
          revision: activeRevision,
        });
      }
      binding.activeRevision = activeRevision;
      binding.transportRevision = transportRevision;
    });
    const actions =
      config.financial || config.approvedCalls
        ? new SupportedActions(
            onboarding,
            database,
            config.financial,
            activeRevision,
            config.approvedCalls,
            config.network,
            config.safeProvisioning ?? false,
            true,
            1,
            true,
          )
        : undefined;
    financial = actions
      ? database.financialAuthority({
          namespace: 'configured-transfers-v1',
          provider: backend.provider,
          authorize: (context, approval, purpose) =>
            purpose === 'sign'
              ? actions.authorize(context, approval)
              : Promise.resolve(null),
        })
      : undefined;
    const authority = onboarding.walletAuthority();
    const service = new EmbeddedWalletService(
      {
        provision: async (context, accountId) => {
          const admitted = await authority.provision(context, accountId);
          return admitted;
        },
        sign: financial?.authority.sign ?? authority.sign,
      },
      backend,
    );
    const runtimeConfiguration = config.runtimeConfiguration
      ? new RuntimeConfigurationService(
          onboarding.policy,
          database.onboardingStore,
          config.runtimeConfiguration,
          activeRevision,
          transportRevision,
          config.network,
          config.runtimeConfiguration.credentialKey
            ? new ApplicationCredentialCipher(
                resolveSecret(config.runtimeConfiguration.credentialKey),
              )
            : undefined,
        )
      : undefined;
    const safeWallet =
      config.safeWallet &&
      actions &&
      runtimeConfiguration &&
      config.backend.kind === 'ows'
        ? new SafeWalletRuntime(
            config,
            database,
            runtimeConfiguration,
            onboarding,
            actions,
            createOwsSigningBackend({
              vaultPath: resolve(directory, config.backend.vaultDirectory),
              passphrase: async () =>
                resolveSecret(
                  (
                    config.backend as Extract<
                      typeof config.backend,
                      { kind: 'ows' }
                    >
                  ).passphrase,
                ),
              network: config.network,
            }),
            new ApplicationCredentialCipher(
              resolveSecret(config.runtimeConfiguration!.credentialKey!),
            ),
            directory,
            resolveSecret(config.safeWallet.bundlerAuthorization),
          )
        : undefined;
    const currentConfiguration = () =>
      database.onboardingStore.transaction(
        (state) =>
          state.deploymentBindings?.['service-v1']?.activeRevision ===
            activeRevision &&
          state.deploymentBindings?.['service-v1']?.transportRevision ===
            transportRevision,
      );
    const app = await createServer({
      safeWallet,
      walletCalls: safeWallet
        ? new WalletCallsService(actions!, safeWallet.walletDriver())
        : undefined,
      runtimeConfiguration,
      documentationTokens: config.apiExplorer
        ? {
            origin: config.policy.provider.origin,
            issuer: config.ownerLogin!.issuer,
            login: login!,
            operators: config.apiExplorer.operators,
            applications: config.apiExplorer.clients.map((entry) => ({
              clientId: entry.clientId,
              name: config.policy.applications.find(
                (app) => app.clientId === entry.clientId,
              )!.name,
              scopes: entry.scopes,
            })),
            currentConfiguration,
            issue: issueExplorerToken!,
          }
        : undefined,
      authenticate,
      authorizationServer,
      configurationProfile: config.profile,
      actionProfiles: [
        ...(config.approvedCalls
          ? ['provider-approved-contracts-v1' as const]
          : []),
      ],
      service,
      onboarding: {
        service: onboarding,
        network: config.network,
        login,
        apiExplorerLogin: !!config.apiExplorer,
        reviewers: config.reviewers ?? [],
        currentConfiguration: () =>
          database.onboardingStore.transaction(
            (state) =>
              state.deploymentBindings?.['service-v1']?.activeRevision ===
                activeRevision &&
              state.deploymentBindings?.['service-v1']?.transportRevision ===
                transportRevision,
          ),
        actions,
      },
      onClose: async () => {
        await safeWallet?.close();
        database.close();
      },
      ready: async () =>
        config.activation.enabled &&
        (await database.ready()) &&
        (await database.onboardingStore.transaction(
          (state) =>
            state.deploymentBindings?.['service-v1']?.activeRevision ===
              activeRevision &&
            state.deploymentBindings?.['service-v1']?.transportRevision ===
              transportRevision,
        )),
      documentation: config.http?.documentation ?? false,
      requestsPerMinute: config.http?.requestsPerMinute,
    });
    if (config.activation.enabled) {
      await safeWallet?.start();
    }
    return app;
  } catch (error) {
    database.close();
    throw error;
  }
}
