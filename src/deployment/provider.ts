import {
  PayerOperations,
  emptyOperationsState,
} from '../execution/operations.js';
import { SafeExecutionQueue } from '../execution/queue.js';
import { RuntimeConfigurationService } from '../runtime-configuration/service.js';
import { executionConfigurationIdentity } from '../executor/protocol.js';
import { createServiceIdentity } from '../executor/auth.js';
import { createRemoteExecutionProvider } from '../execution/remote.js';
import { createExplorerTokenIssuer } from './explorer-tokens.js';
import { createConfiguredBackend } from './backends.js';
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
} from './config.js';
import { TransferExecutionCoordinator } from '../execution/coordinator.js';
import { QuorumTransferObserver } from '../execution/chain.js';
import { createTransferExecutionProvider } from '../execution/relayer.js';
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
  const authenticate = createAuthenticator(config.oauth);
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
    );
    const occupied = await database.hasStoredRecords();
    const bound = await database.onboardingStore.transaction((state) => {
      const expected = {
        origin: config.policy.provider.origin,
        provider: backend.provider,
        binding: config.backend.binding,
        accessMode: config.policy.access?.mode ?? 'hosted',
      };
      const previous = state.deploymentBindings?.['service-v1'];
      if (
        previous
          ? fingerprint({
              origin: previous.origin,
              provider: previous.provider,
              binding: previous.binding,
              accessMode: previous.accessMode ?? 'hosted',
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
    const actionPolicyRevision = config.approvedCalls
      ? fingerprint([config.financial ?? null, config.approvedCalls])
      : config.financial
        ? fingerprint(config.financial)
        : undefined;
    onboarding = new OnboardingService(
      config.policy,
      database.onboardingStore,
      identity,
      backend,
      actionPolicyRevision,
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
      config.financial ?? null,
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
    const observer = config.execution
      ? new QuorumTransferObserver(
          config.execution.rpc.endpoints.map((entry) => resolveSecret(entry)),
          config.execution.rpc.genesisHash,
          config.execution.maxLogRange,
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
      config.execution && actions
        ? new TransferExecutionCoordinator(
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
                ),
            observer!,
            operations,
          )
        : undefined;
    const safeQueue =
      config.execution?.safeQueue && execution && actions && observer
        ? new SafeExecutionQueue(
            actions,
            database,
            execution,
            (binding, owner) => observer.contractNonce(binding, owner),
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
    const app = await createServer({
      runtimeConfiguration: config.runtimeConfiguration
        ? new RuntimeConfigurationService(
            onboarding.policy,
            database.onboardingStore,
            config.runtimeConfiguration,
            activeRevision,
            transportRevision,
          )
        : undefined,
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
        executionIdentity,
        contractNonce:
          config.approvedCalls && observer
            ? (binding, owner) => observer.contractNonce(binding, owner)
            : undefined,
      },
      onClose: async () => {
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
    });
    if (config.activation.enabled) {
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
