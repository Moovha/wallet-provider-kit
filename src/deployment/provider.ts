import { networkConfigurations } from './network-configuration.js';
import {
  createNetworkResolver,
  type NetworkContext,
} from '../service/network-context.js';
import type { ProviderConfiguration } from './config.js';
import type { ProviderDatabase } from '../storage/index.js';
import { currentRuntimePolicy } from '../runtime-configuration/authority.js';
import { ManagementService } from '../management/service.js';
import { createManagementAuthorizationServer } from '../management/authorization.js';
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

/** One identity and application registry with independently authorized network runtimes. */
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
  const database = openProviderDatabase({
    directory: resolve(directory, config.storage.directory),
  });
  const contexts: NetworkContext[] = [];
  const databases = [database];
  try {
    if (config.management) {
      const selected = database.managementSnapshot()?.networkSettings?.networks;
      if (selected) {
        if (!selected.includes(providerNetwork(config.network).name)) {
          database.close();
          throw new ConfigurationError([
            '/network: the retained default network cannot change',
          ]);
        }
        config.additionalNetworks = selected
          .filter((network) => network !== providerNetwork(config.network).name)
          .map(
            (network) =>
              config.additionalNetworks?.find(
                (entry) => entry.network === network,
              ) ?? { network },
          );
        validateProviderConfiguration(config);
      }
    }
    const management = config.management
      ? new ManagementService(
          database.managementStore,
          database.managementSnapshot,
          config.oauth.issuer,
          config.policy,
          undefined,
          database.accountNetwork,
        )
      : undefined;
    let authorizationServer:
      | ReturnType<typeof createBundledAuthorizationServer>
      | Awaited<ReturnType<typeof createManagementAuthorizationServer>>
      | undefined;
    const initializeHost = async () => {
      if (management) {
        await management.initialize(resolveSecret(config.management!.claim));
        authorizationServer = await createManagementAuthorizationServer(
          config,
          management,
        );
        Object.defineProperty(config.policy, 'applications', {
          enumerable: true,
          get: () => management.applications(),
        });
      } else
        authorizationServer = config.authorizationServer
          ? createBundledAuthorizationServer(config)
          : undefined;
    };
    const configurations = networkConfigurations(config);
    const networkSetRevision =
      configurations.length > 1 ? fingerprint(configurations) : undefined;
    for (const [index, networkConfig] of configurations.entries()) {
      const scoped =
        index === 0
          ? database
          : openProviderDatabase({
              directory: resolve(directory, config.storage.directory),
              networkScope: networkConfig.network,
              expectedNetworkSetRevision: networkSetRevision,
            });
      if (index > 0) databases.push(scoped);
      contexts.push(
        await createNetworkContext(
          networkConfig,
          directory,
          scoped,
          management,
          index === 0 ? initializeHost : undefined,
          networkSetRevision,
        ),
      );
    }
    const primary = contexts[0];
    const authenticate =
      authorizationServer?.authenticate ?? createAuthenticator(config.oauth);
    const issueExplorerToken = config.apiExplorer
      ? createExplorerTokenIssuer(config, authenticate)
      : undefined;
    const app = await createServer({
      ...primary,
      networkContexts: contexts,
      ready: async () =>
        (await Promise.all(contexts.map((context) => context.ready!()))).some(
          Boolean,
        ),
      resolveNetwork: createNetworkResolver(contexts),
      management,
      managementReady: management
        ? async () =>
            (await database.ready()) && (await primary.currentConfiguration())
        : undefined,
      providerOrigin: config.policy.provider.origin,
      localManagementOrigin: config.management?.localOrigin,
      authenticate,
      authorizationServer,
      configurationProfile: config.profile,
      actionProfiles: config.approvedCalls
        ? ['provider-approved-contracts-v1']
        : [],
      documentationTokens: config.apiExplorer
        ? {
            origin: config.policy.provider.origin,
            issuer: config.ownerLogin!.issuer,
            login: primary.onboarding!.login!,
            operators: config.apiExplorer.operators,
            applications: config.apiExplorer.clients.map((entry) => ({
              clientId: entry.clientId,
              name: config.policy.applications.find(
                (app) => app.clientId === entry.clientId,
              )!.name,
              scopes: entry.scopes,
            })),
            currentConfiguration: primary.currentConfiguration,
            issue: issueExplorerToken!,
          }
        : undefined,
      onClose: async () => {
        for (const context of contexts) await context.close();
      },
      documentation: config.http?.documentation ?? false,
      requestsPerMinute: config.http?.requestsPerMinute,
    });
    for (const context of contexts) await context.start();
    return app;
  } catch (error) {
    for (const context of contexts) await context.safeWallet?.close();
    for (const store of databases) store.close();
    throw error;
  }
}

async function createNetworkContext(
  config: ProviderConfiguration,
  directory: string,
  database: ProviderDatabase,
  management?: ManagementService,
  initializeHost?: () => Promise<void>,
  networkSetRevision?: string,
): Promise<NetworkContext> {
  const network = providerNetwork(config.network);
  assertSafeWalletConfiguration(config);
  let onboarding: OnboardingService | undefined;
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
  const backend = provision;
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
      ...(!database.networkScope ? { networkSetRevision } : {}),
    };
    return true;
  });
  if (!bound)
    throw new ConfigurationError([
      '/storage: provider binding changed or existing host requires reviewed migration',
    ]);
  await initializeHost?.();
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
  const actionPolicyRevisionBase = fingerprint(callPolicyBinding);
  const actionPolicyRevision =
    network.testnet && !database.networkScope
      ? actionPolicyRevisionBase
      : fingerprint([network.name, actionPolicyRevisionBase]);
  onboarding = new OnboardingService(
    management ? { ...config.policy, applications: [] } : config.policy,
    database.onboardingStore,
    identity,
    backend,
    actionPolicyRevision,
    config.runtimeConfiguration?.authorizeContracts,
    !!config.safeWallet,
    management
      ? {
          userChecks: () => management.currentUserChecks(),
          list: () => management.applications(),
          current: (principal) => management.application(principal),
        }
      : undefined,
    database.networkScope,
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
    onboarding!.installationPolicyRevision,
    ...(networkSetRevision ? [networkSetRevision] : []),
    ...(network.testnet ? [] : [network.name]),
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
        let actionPolicyCurrent = true;
        if (grant.permissions.includes('contracts:request')) {
          try {
            const expected = onboarding!.runtimeContracts
              ? fingerprint([
                  actionPolicyRevision,
                  currentRuntimePolicy(state, grant.caller),
                ])
              : actionPolicyRevision;
            actionPolicyCurrent = grant.actionPolicyRevision === expected;
          } catch {
            actionPolicyCurrent = false;
          }
        }
        if (
          grant.revision !== onboarding!.policy.revision ||
          !actionPolicyCurrent
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
  const actions = config.approvedCalls
    ? new SupportedActions(
        onboarding,
        database,
        activeRevision,
        config.approvedCalls,
        config.network,
      )
    : undefined;
  const authority = onboarding.walletAuthority();
  const service = new EmbeddedWalletService(
    {
      provision: async (context, accountId) => {
        const admitted = await authority.provision(context, accountId);
        return admitted;
      },
      sign: async () => null,
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
              database.networkScope,
            )
          : undefined,
        management
          ? (principal) => management.assertOperator(principal)
          : undefined,
      )
    : undefined;
  await runtimeConfiguration?.initialize();
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
            database.networkScope,
          ),
          directory,
          resolveSecret(config.safeWallet.bundlerAuthorization),
        )
      : undefined;
  const baselineActivation = { ...config.activation };
  const executionSetting = () =>
    management?.storedExecution(network.name, baselineActivation) ??
    baselineActivation;
  if (management)
    Object.defineProperty(config.activation, 'enabled', {
      enumerable: true,
      get: () => executionSetting().enabled,
    });
  let workersStarted = false;
  let workersStarting: Promise<void> | undefined;
  const syncExecution = async () => {
    if (!executionSetting().enabled || workersStarted) return;
    workersStarting ??= Promise.resolve()
      .then(async () => {
        await safeWallet?.start();
        workersStarted = true;
      })
      .finally(() => {
        workersStarting = undefined;
      });
    await workersStarting;
  };
  const currentConfiguration = () =>
    database.onboardingStore.transaction(
      (state) =>
        state.deploymentBindings?.['service-v1']?.activeRevision ===
          activeRevision &&
        state.deploymentBindings?.['service-v1']?.transportRevision ===
          transportRevision,
    );

  return {
    network: network.name,
    database,
    execution: { defaults: baselineActivation, sync: syncExecution },
    service,
    safeWallet,
    walletCalls: safeWallet
      ? new WalletCallsService(actions!, safeWallet.walletDriver())
      : undefined,
    runtimeConfiguration,
    onboarding: {
      service: onboarding!,
      network: network.name,
      login,
      apiExplorerLogin: !!config.apiExplorer,
      reviewers: config.reviewers ?? [],
      currentConfiguration,
      actions,
    },
    currentConfiguration,
    ready: async () => {
      try {
        return (
          config.activation.enabled &&
          workersStarted &&
          (await database.ready()) &&
          (await currentConfiguration())
        );
      } catch {
        return false;
      }
    },
    start: async () => {
      await syncExecution();
    },
    close: async () => {
      await safeWallet?.close();
      database.close();
    },
  };
}
