import { SafeWalletRuntime } from '../../src/sponsorship/safe-wallet.js';
import { createOwsSigningBackend } from '../../src/providers/ows.js';
import { ApplicationExecutionCoordinator } from '../../src/execution/application-coordinator.js';
import { ApplicationSponsorService } from '../../src/provisioning/application-sponsor.js';
import {
  ApplicationSafeService,
  applicationAccountNamespace,
} from '../../src/provisioning/application.js';
import { ApplicationExecutionObserver } from '../../src/runtime-configuration/observer.js';
import { ApplicationCredentialCipher } from '../../src/runtime-configuration/credentials.js';
import {
  SafeProvisioningService,
  createSafeDeploymentDriver,
} from '../../src/provisioning/safe.js';
import { providerNetwork } from '../../src/networks.js';
import { localExecutionFetch } from '../../src/deployment/local-execution.js';
import { createBundledAuthorizationServer } from '../../src/deployment/authorization-server.js';
import { WalletCallsService } from '../../src/wallet-calls/service.js';
import {
  PayerOperations,
  emptyOperationsState,
} from '../../src/execution/operations.js';
import { SafeExecutionQueue } from '../../src/execution/queue.js';
import {
  runtimeApplicationId,
  RuntimeConfigurationService,
} from '../../src/runtime-configuration/service.js';
import { executionConfigurationIdentity } from '../../src/executor/protocol.js';
import { createServiceIdentity } from '../../src/executor/auth.js';
import { createRemoteExecutionProvider } from '../../src/execution/remote.js';
import { createExplorerTokenIssuer } from '../../src/deployment/explorer-tokens.js';
import { createConfiguredBackend } from '../../src/deployment/backends.js';
import { resolve } from 'node:path';
import { EmbeddedWalletService } from '../../src/domain/embedded-wallet.js';
import { createOnboardingJournal } from '../../src/onboarding/journal.js';
import { createOwnerLogin } from '../../src/onboarding/login.js';
import { fingerprint } from '../../src/onboarding/policy.js';
import { OnboardingService } from '../../src/onboarding/service.js';
import {
  createDiditIdentityAdapter,
  createSumsubIdentityAdapter,
} from '../../src/onboarding/vendors.js';
import { createAuthenticator } from '../../src/service/auth.js';
import { createServer } from '../../src/service/server.js';
import { openProviderDatabase } from '../../src/storage/index.js';
import {
  ConfigurationError,
  resolveSecret,
  validateProviderConfiguration,
} from '../../src/deployment/config.js';
import { TransferExecutionCoordinator } from '../../src/execution/coordinator.js';
import { QuorumTransferObserver } from '../../src/execution/chain.js';
import { createTransferExecutionProvider } from '../../src/execution/relayer.js';
import { SupportedActions } from '../../src/deployment/actions.js';

/** Historical composition for offline authority/recovery regression fixtures only. Never shipped as a service entry point. */
export async function createLegacyProviderFixture(
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
  if (config.execution && !network.testnet)
    config.execution.network = network.name;
  if (
    config.execution?.local &&
    config.execution.sponsors.some(
      (sponsor) => sponsor.binding.address === 'managed',
    )
  )
    throw new ConfigurationError([
      '/execution/sponsors: run local setup to create and retain managed sponsor credentials before starting',
    ]);
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
    const backend = await createConfiguredBackend(
      config.backend,
      directory,
      database,
      {
        namespace:
          'onboarding-' +
          fingerprint(config.policy.provider.origin).slice(0, 32),
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
      },
      {
        namespace: 'configured-transfers-v1',
        journal: database.journal,
        authorizeAttempt: (request) =>
          financial?.authorizeAttempt(request) ?? Promise.resolve(false),
      },
      config.network,
    );
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
    const transportRevision = config.execution?.service
      ? fingerprint([
          config.execution.service.signing,
          config.execution.service.keys,
        ])
      : undefined;
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
      ...(config.execution
        ? [executionConfigurationIdentity(config.execution)]
        : []),
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
            !!config.safeWallet ||
              !!config.runtimeConfiguration?.sharedApplicationSafes,
            config.runtimeConfiguration?.executionPool?.safeCount ?? 1,
            !!config.safeWallet,
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
          if (admitted) await backend.reserveAccount?.(accountId);
          return admitted;
        },
        sign: financial?.authority.sign ?? authority.sign,
      },
      backend,
    );
    const executionIdentity = config.execution?.service
      ? await createServiceIdentity(
          config.policy.provider.origin,
          config.execution.service.signing,
          [
            {
              origin: config.execution.service.url,
              keys: config.execution.service.keys,
            },
          ],
        )
      : undefined;
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
    const applicationSponsors =
      !safeWallet && config.runtimeConfiguration?.sharedApplicationSafes
        ? new ApplicationSponsorService(
            runtimeConfiguration!,
            database,
            new ApplicationCredentialCipher(
              resolveSecret(config.runtimeConfiguration.credentialKey!),
            ),
            config.execution!,
            activeRevision,
            resolveSecret(config.execution!.relayer!.apiKey),
            localExecutionFetch(),
            config.network,
          )
        : undefined;
    let applicationSafes: ApplicationSafeService | undefined;
    if (!safeWallet && config.runtimeConfiguration?.sharedApplicationSafes) {
      const applicationBackend = await createConfiguredBackend(
        config.backend,
        directory,
        database,
        {
          namespace: applicationAccountNamespace,
          journal: database.journal,
          authorizeAttempt: (request) =>
            applicationSafes?.authorizeProvision(request) ??
            Promise.resolve(false),
        },
        {
          namespace: 'configured-transfers-v1',
          journal: database.journal,
          authorizeAttempt: (request) =>
            financial?.authorizeAttempt(request) ?? Promise.resolve(false),
        },
        config.network,
      );
      applicationSafes = new ApplicationSafeService(
        runtimeConfiguration!,
        onboarding,
        database,
        applicationBackend,
        config.safeProvisioning!,
        config.execution!,
        createSafeDeploymentDriver(
          config.execution!,
          resolveSecret(config.execution!.relayer!.apiKey),
          localExecutionFetch(),
        ),
        activeRevision,
        config.activation.enabled,
        config.network,
        fetch,
        applicationSponsors,
        (execution) =>
          createSafeDeploymentDriver(
            execution,
            resolveSecret(config.execution!.relayer!.apiKey),
            applicationSponsors!.request(),
          ),
      );
    }
    const observer = config.execution
      ? runtimeConfiguration && config.runtimeConfiguration?.credentialKey
        ? new ApplicationExecutionObserver(
            runtimeConfiguration,
            database.onboardingStore,
            config.execution,
            config.network,
            fetch,
            !!config.runtimeConfiguration?.sharedApplicationSafes,
          )
        : new QuorumTransferObserver(
            config.execution.rpc.endpoints.map((entry) => resolveSecret(entry)),
            config.execution.rpc.genesisHash,
            config.execution.maxLogRange,
            fetch,
            config.network,
          )
      : undefined;
    let operationsBinding: string | undefined;
    const operations =
      config.operations && config.execution && observer
        ? new PayerOperations(
            config.operations,
            {
              transaction: (operation) =>
                database.onboardingStore.transaction((state) => {
                  if (
                    state.deploymentBindings?.['service-v1']?.activeRevision !==
                    activeRevision
                  )
                    throw new Error('Inactive configuration');
                  const data = ((state.operations ??= {})['service-v1'] ??=
                    emptyOperationsState());
                  if (data.binding !== operationsBinding)
                    throw new Error('Inactive operations configuration');
                  return operation(data);
                }),
            },
            config.execution.sponsors.map((sponsor) => ({
              address: sponsor.binding.address,
              balance: () => observer.payerBalance(sponsor.binding.address),
            })),
            config.policy.provider.origin,
            resolveSecret,
          )
        : undefined;
    if (operations) {
      operationsBinding = operations.binding;
      await database.onboardingStore.transaction((state) => {
        ((state.operations ??= {})['service-v1'] ??=
          emptyOperationsState()).binding = operationsBinding;
      });
    } else
      await database.onboardingStore.transaction((state) => {
        if (state.operations?.['service-v1'])
          state.operations['service-v1'].binding = 'disabled';
      });
    const execution =
      !safeWallet && config.execution && actions
        ? applicationSponsors
          ? new ApplicationExecutionCoordinator(
              database,
              activeRevision,
              config.execution.pollIntervalSeconds,
              async (applicationId) => {
                const execution =
                  await applicationSponsors.configuration(applicationId);
                return new TransferExecutionCoordinator(
                  actions,
                  database,
                  service,
                  execution,
                  createTransferExecutionProvider(
                    execution,
                    resolveSecret(execution.relayer!.apiKey),
                    applicationSponsors.request(),
                  ),
                  observer!,
                  undefined,
                  async (id): Promise<void> => {
                    await safeQueue?.included(id);
                  },
                );
              },
              !!config.execution.local,
              async (applicationId) =>
                fingerprint(
                  await applicationSponsors.configuration(applicationId),
                ),
            )
          : new TransferExecutionCoordinator(
              actions,
              database,
              service,
              config.execution,
              config.execution.service
                ? createRemoteExecutionProvider(
                    config.execution,
                    executionIdentity!,
                  )
                : createTransferExecutionProvider(
                    config.execution,
                    resolveSecret(config.execution.relayer!.apiKey),
                    config.execution.local ? localExecutionFetch() : undefined,
                  ),
              observer!,
              operations,
              async (id): Promise<void> => {
                await safeQueue?.included(id);
              },
            )
        : undefined;
    const safeQueue: SafeExecutionQueue | undefined =
      config.execution?.safeQueue && execution && actions && observer
        ? new SafeExecutionQueue(
            actions,
            database,
            execution,
            (binding, owner, principal) =>
              observer.contractNonce(binding, owner, principal),
            config.execution.safeQueue,
            config.execution.pollIntervalSeconds,
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
    const safeProvisioning =
      !safeWallet && config.safeProvisioning && config.execution
        ? new SafeProvisioningService(
            onboarding,
            database,
            config.safeProvisioning,
            config.execution,
            activeRevision,
            createSafeDeploymentDriver(
              config.execution,
              resolveSecret(config.execution.relayer!.apiKey),
              localExecutionFetch(),
            ),
            config.runtimeConfiguration?.credentialKey
              ? []
              : config.execution.rpc.endpoints.map((entry) =>
                  resolveSecret(entry),
                ),
            config.network,
            fetch,
            config.runtimeConfiguration?.credentialKey
              ? (context) =>
                  runtimeConfiguration!.rpcEndpoints(
                    runtimeApplicationId(
                      context.principal.issuer,
                      context.principal.clientId,
                    ),
                  )
              : undefined,
          )
        : undefined;
    const app = await createServer({
      safeWallet,
      safeProvisioning: applicationSafes ? undefined : safeProvisioning,
      applicationSafes,
      applicationSponsors,
      walletCalls: safeWallet
        ? new WalletCallsService(actions!, safeWallet.walletDriver())
        : config.runtimeConfiguration?.authorizeContracts &&
            actions &&
            safeQueue &&
            execution
          ? new WalletCallsService(actions, safeQueue, execution)
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
      operationsHealth: operations ? () => operations.health() : undefined,
      configurationProfile: config.profile,
      actionProfiles: [
        ...(config.financial ? [config.financial.profile] : []),
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
        execution,
        safeQueue,
        rpcVerification: runtimeConfiguration?.rpcVerification,
        executionIdentity,
        contractNonce:
          config.approvedCalls && observer
            ? (binding, owner, principal) =>
                observer.contractNonce(binding, owner, principal)
            : undefined,
      },
      onClose: async () => {
        await safeWallet?.close();
        await applicationSponsors?.funding.close();
        await operations?.close();
        await safeQueue?.close();
        await execution?.close();
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
      applicationSponsors?.funding.start();
      operations?.start();
      execution?.start();
      safeQueue?.start();
    }
    return app;
  } catch (error) {
    database.close();
    throw error;
  }
}
