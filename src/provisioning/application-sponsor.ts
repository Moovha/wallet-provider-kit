import { ApplicationFundingService } from './application-funding.js';
import { rpcVerified } from '../execution/inclusion.js';
import { includedExecution } from '../execution/inclusion.js';
import { createRpcObserver } from '../execution/single-rpc.js';
import { RpcReader } from '../execution/chain.js';
import { rpcCapacity } from '../execution/rpc-capacity.js';
import { WalletProviderError } from '../domain/signing.js';
import { poolKey, poolMembers, retainPoolConfiguration } from './pools.js';
import { randomUUID } from 'node:crypto';
import { Wallet } from 'ethers';
import { fingerprint, deny, uuid } from '../onboarding/policy.js';
import type { AuthorityContext } from '../domain/principal.js';
import type { ProviderDatabase } from '../storage/index.js';
import type { ProviderNetwork } from '../networks.js';
import { providerNetwork } from '../networks.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
} from '../runtime-configuration/service.js';
import {
  sponsorshipGas,
  minimumSponsorFunding,
  type ApplicationObligations,
} from '../runtime-configuration/obligations.js';
import {
  ApplicationCredentialCipher,
  type ApplicationCredential,
} from '../runtime-configuration/credentials.js';
import type {
  ExecutionConfiguration,
  ExecutionSponsor,
} from '../execution/types.js';
import {
  localSponsorIds,
  localExecutionOrigin,
} from '../deployment/local-execution-contract.js';
import {
  createRelayerClient,
  record as isRecord,
} from '../providers/relayer-client.js';

export interface ApplicationSponsorRecord {
  applicationId: string;
  poolIndex?: number;
  sponsor: ExecutionSponsor;
  key: ApplicationCredential;
  status: 'prepared' | 'ready';
}
/** Deterministic private Relayer identities allow read-before-create reconciliation without replacing an uncertain signer. */
export class ApplicationSponsorService {
  readonly funding: ApplicationFundingService;
  private readonly installedSubmission = new Map<string, string>();
  private readonly installedEndpoint = new Map<string, string>();
  private readonly configuring = new Map<string, Promise<void>>();
  private readonly client: ReturnType<typeof createRelayerClient>;
  constructor(
    private readonly resources: RuntimeConfigurationService,
    private readonly database: ProviderDatabase,
    private readonly cipher: ApplicationCredentialCipher,
    private readonly template: ExecutionConfiguration,
    private readonly revision: string,
    apiKey: string,
    private readonly transport: typeof fetch,
    private readonly network?: ProviderNetwork,
    private readonly fundingTransport: typeof fetch = fetch,
  ) {
    this.funding = new ApplicationFundingService(
      resources,
      database,
      cipher,
      revision,
      template.rpc.genesisHash,
      fundingTransport,
      network,
    );
    this.client = createRelayerClient(
      {
        url: localExecutionOrigin,
        apiKey,
        network,
        resolveAccount: async () => null,
      },
      transport,
    );
  }
  async read(applicationId: string, index = 0) {
    return this.database.onboardingStore.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.revision
      )
        deny();
      return state.deploymentBindings['service-v1'].runtimeConfiguration
        ?.applicationSponsors?.[poolKey(applicationId, index)];
    });
  }
  async members(applicationId: string) {
    return this.database.onboardingStore.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.revision
      )
        deny();
      return poolMembers(
        state.deploymentBindings['service-v1'].runtimeConfiguration
          ?.applicationSponsors,
        applicationId,
      );
    });
  }
  async configuration(applicationId: string): Promise<ExecutionConfiguration> {
    const records = await this.members(applicationId);
    const agreement = (await this.resources.acceptedSponsorship(applicationId))
      .value as ApplicationObligations['sponsorship'];
    const gas = sponsorshipGas(agreement);
    const count = (await this.resources.poolConfiguration(applicationId))
      .sponsorCount;
    if (records.length !== count || records.some((r) => r.status !== 'ready'))
      deny();
    if (
      records.some(
        (r) => r.sponsor.fundingAgreement !== agreement.funding_agreement,
      )
    )
      deny();
    return {
      ...structuredClone(this.template),
      sponsors: records.map((r) => ({
        ...structuredClone(r.sponsor),
        ...gas,
        lifetimeBudgetWei: agreement.maximum_gas_budget_wei,
      })),
      ...(this.resources.hasExecutionPool ||
      count > 1 ||
      agreement.account_model === 'provider-controlled-user-safe'
        ? {
            sponsorPool: {
              strategy: 'round-robin' as const,
              maxInFlightPerSponsor:
                agreement.account_model === 'provider-controlled-user-safe'
                  ? (agreement.maximum_in_flight_per_sponsor ?? 2)
                  : 1,
            },
          }
        : {}),
    };
  }
  async provision(context: AuthorityContext, applicationId: string, index = 0) {
    if (
      index >=
      (await this.resources.poolConfiguration(applicationId)).sponsorCount
    )
      deny();
    const pool = await this.resources.poolConfiguration(applicationId);
    const key = poolKey(applicationId, index);
    context = structuredClone(context);
    if (!uuid.test(context.idempotencyKey)) deny();
    const resources = await this.resources.readObligations(
      context.principal,
      applicationId,
    );
    const declaration = resources.resources.find(
      (r) => r.kind === 'sponsorship',
    );
    if (declaration?.decision !== 'accepted') deny();
    const agreement =
      declaration.value as ApplicationObligations['sponsorship'];
    const gas = sponsorshipGas(agreement);
    if (BigInt(agreement.maximum_gas_budget_wei) < minimumSponsorFunding(gas))
      deny();
    const routingReserve =
      21000n * BigInt(gas.maxFeePerGas) + BigInt(gas.l1FeeReserveWei);
    if (
      BigInt(agreement.maximum_gas_budget_wei) <
      minimumSponsorFunding(gas) * BigInt(pool.safeCount) +
        routingReserve * BigInt(pool.sponsorCount)
    )
      deny();
    const application =
      this.resources.onboardingPolicy.applications.find(
        (a) => runtimeApplicationId(a.issuer, a.clientId) === applicationId,
      ) ?? deny();
    const endpoints = await this.resources.rpcEndpoints(
      applicationId,
      'rpc-submission',
    );
    const assertCurrent = async () => {
      const current = await this.resources.readObligations(
        context.principal,
        applicationId,
      );
      if (
        fingerprint(current.resources.find((r) => r.kind === 'sponsorship')) !==
          fingerprint(declaration) ||
        fingerprint(
          await this.resources.rpcEndpoints(applicationId, 'rpc-submission'),
        ) !== fingerprint(endpoints)
      )
        deny();
    };
    const saved = await this.database.onboardingStore.transaction((state) => {
      this.resources.assertOperatorState(context.principal, state);
      const registry =
        state.deploymentBindings!['service-v1'].runtimeConfiguration ?? deny();
      const records = (registry.applicationSponsors ??= {});
      retainPoolConfiguration(registry, applicationId, pool);
      if (records[key]) return records[key];
      const accountId = randomUUID(),
        wallet = Wallet.createRandom();
      return (records[key] = {
        applicationId,
        poolIndex: index,
        sponsor: {
          ...gas,
          accountId,
          clientId: application.clientId,
          binding: {
            ...localSponsorIds(accountId),
            address: wallet.address,
            bindingRevision: '1',
          },
          fundingAgreement: agreement.funding_agreement,
          lifetimeBudgetWei: agreement.maximum_gas_budget_wei,
        },
        key: this.cipher.seal(
          {
            application_id: applicationId,
            reference: 'private-sponsor-key',
            revision: '1',
            origin: '',
            status: 'active',
          },
          wallet.privateKey,
        ),
        status: 'prepared',
      });
    });
    if (
      saved.status === 'ready' &&
      saved.sponsor.fundingAgreement === agreement.funding_agreement
    ) {
      await assertCurrent();
      return {
        application_id: applicationId,
        funding_address: await this.funding.ensure(applicationId),
        pool_index: index,
        status: 'ready' as const,
      };
    }
    if (
      saved.sponsor.fundingAgreement !== agreement.funding_agreement ||
      saved.sponsor.lifetimeBudgetWei !== agreement.maximum_gas_budget_wei ||
      Object.entries(gas).some(
        ([field, value]) =>
          saved.sponsor[field as keyof ExecutionSponsor] !== value,
      )
    )
      deny();
    const ids = saved.sponsor.binding;
    // Creation is constrained to retained deterministic IDs; an existing resource is never overwritten.
    let signer = await this.client.call('GET', '/signers/' + ids.signerId);
    if (!signer) {
      await assertCurrent();
      await this.client.call(
        'POST',
        '/signers',
        JSON.stringify({
          id: ids.signerId,
          type: 'plain',
          config: { key: this.cipher.open(saved.key).slice(2) },
        }),
      );
      signer = await this.client.call('GET', '/signers/' + ids.signerId);
    }
    if (!signer || signer.id !== ids.signerId || signer.type !== 'local')
      deny();
    let relayer = await this.client.call('GET', '/relayers/' + ids.relayerId);
    if (!relayer) {
      await assertCurrent();
      await this.client.call(
        'POST',
        '/relayers',
        JSON.stringify({
          id: ids.relayerId,
          name: 'Application gas sponsor',
          network: providerNetwork(this.network).name,
          network_type: 'evm',
          paused: false,
          signer_id: ids.signerId,
          custom_rpc_urls: endpoints.map((url) => ({ url, weight: 100 })),
          policies: {
            min_balance: 0,
            gas_limit_estimation: false,
            eip1559_pricing: true,
            gas_price_cap: Number(saved.sponsor.maxFeePerGas),
          },
        }),
      );
      relayer = await this.client.call('GET', '/relayers/' + ids.relayerId);
    }
    if (
      !relayer ||
      relayer.id !== ids.relayerId ||
      relayer.signer_id !== ids.signerId ||
      String(relayer.address).toLowerCase() !== ids.address.toLowerCase() ||
      relayer.network !== providerNetwork(this.network).name
    )
      deny();
    await assertCurrent();
    await this.database.onboardingStore.transaction((state) => {
      this.resources.assertOperatorState(context.principal, state);
      const record =
        state.deploymentBindings!['service-v1'].runtimeConfiguration
          ?.applicationSponsors?.[key];
      if (!record || fingerprint(record.sponsor) !== fingerprint(saved.sponsor))
        deny();
      record.status = 'ready';
    });
    return {
      application_id: applicationId,
      funding_address: await this.funding.ensure(applicationId),
      pool_index: index,
      status: 'ready' as const,
    };
  }
  /** Install this application's accepted submission RPCs before relayer RPC or transaction work. */
  private async submissionConfiguration(id: string) {
    const record = await this.database.onboardingStore.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.revision
      )
        deny();
      return Object.values(
        state.deploymentBindings['service-v1'].runtimeConfiguration
          ?.applicationSponsors ?? {},
      ).find(
        (record) =>
          record.status === 'ready' && record.sponsor.binding.relayerId === id,
      );
    });
    if (!record) deny();
    const endpoints = await this.resources.rpcEndpoints(
      record.applicationId,
      'rpc-submission',
    );
    const agreement = (
      await this.resources.acceptedSponsorship(record.applicationId)
    ).value as ApplicationObligations['sponsorship'];
    const gas = sponsorshipGas(agreement);
    return {
      record,
      endpoints,
      gas,
      configuration: fingerprint([endpoints, gas]),
    };
  }
  private submissionInstalled(id: string, configuration: string) {
    const endpoint = this.installedEndpoint.get(id);
    return (
      this.installedSubmission.get(id) === configuration &&
      endpoint !== undefined &&
      rpcCapacity(this.fundingTransport, endpoint).retryAfter <= Date.now()
    );
  }
  request(): typeof fetch {
    return (async (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== localExecutionOrigin) deny();
      const id =
        /^\/api\/v1\/relayers\/([^/]+)(?:\/(?:transactions|rpc)(?:\/|$)|$)/.exec(
          url.pathname,
        )?.[1];
      if (id) {
        if (!init?.method || init.method === 'GET') {
          const { configuration } = await this.submissionConfiguration(id);
          if (this.submissionInstalled(id, configuration))
            return this.transport(input, init);
        }
        const previous = this.configuring.get(id) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const tail = previous.catch(() => undefined).then(() => gate);
        this.configuring.set(id, tail);
        await previous.catch(() => undefined);
        try {
          const { record, endpoints, gas, configuration } =
            await this.submissionConfiguration(id);
          const newTransaction =
            init?.method === 'POST' && url.pathname.endsWith('/transactions');
          let requiredBalance = 0n;
          if (newTransaction) {
            let payload: unknown;
            try {
              payload = JSON.parse(String(init?.body));
            } catch {
              deny();
            }
            if (!isRecord(payload)) deny();
            const quantities = [
              payload.gas_limit,
              payload.max_fee_per_gas,
              payload.max_priority_fee_per_gas,
            ];
            if (
              quantities.some(
                (value) => !Number.isSafeInteger(value) || Number(value) < 0,
              ) ||
              payload.gas_limit !== Number(gas.gasLimit) ||
              Number(payload.max_fee_per_gas) > Number(gas.maxFeePerGas) ||
              Number(payload.max_priority_fee_per_gas) >
                Number(gas.maxPriorityFeePerGas) ||
              Number(payload.max_priority_fee_per_gas) >
                Number(payload.max_fee_per_gas)
            )
              deny();
            requiredBalance =
              BigInt(Number(payload.gas_limit)) *
                BigInt(Number(payload.max_fee_per_gas)) +
              BigInt(gas.l1FeeReserveWei);
          }
          if (!newTransaction && this.submissionInstalled(id, configuration))
            return this.transport(input, init);
          await this.database.onboardingStore.transaction((state) => {
            const uncertain = Object.values(state.supportedActions ?? {}).some(
              (action) => {
                const plan = action.execution?.plan;
                if (
                  plan?.sponsor.accountId !== record.sponsor.accountId ||
                  plan.sponsor.maxFeePerGas === gas.maxFeePerGas
                )
                  return false;
                const observation = action.execution?.observation;
                return (
                  action.execution?.integrityFailure ||
                  !observation ||
                  !rpcVerified(observation.verification) ||
                  !['included', 'safe', 'finalized'].includes(
                    observation.chain_status,
                  )
                );
              },
            );
            if (uncertain) deny();
          });
          const floor = await this.database.onboardingStore.transaction(
            (state) => {
              const deployment = state.deploymentBindings?.['service-v1'];
              const deployments = Object.values(
                deployment?.safeAccounts ?? {},
              ).filter(
                (safe) =>
                  safe.state === 'ready' &&
                  safe.plan.sponsor.accountId === record.sponsor.accountId,
              ).length;
              const consumed = Object.values(
                state.supportedActions ?? {},
              ).filter(
                (action) =>
                  action.execution?.sponsorAccountId ===
                    record.sponsor.accountId &&
                  includedExecution(action.execution),
              ).length;
              return BigInt(deployments + consumed);
            },
          );
          const endpoint = await this.resources.withSubmissionRpc(
            record.applicationId,
            async (endpoint, unavailable) => {
              const observer = createRpcObserver(
                [endpoint],
                this.template.rpc.genesisHash,
                this.template.maxLogRange,
                this.fundingTransport,
                this.network,
                'single',
                true,
              );
              const reader = new RpcReader(
                endpoint,
                this.fundingTransport,
                4,
                true,
                'endpoint-failover',
              );
              const [nonce, pending, balance] = await Promise.all([
                reader.call('eth_getTransactionCount', [
                  record.sponsor.binding.address,
                  'latest',
                ]),
                reader.call('eth_getTransactionCount', [
                  record.sponsor.binding.address,
                  'pending',
                ]),
                reader.call('eth_getBalance', [
                  record.sponsor.binding.address,
                  'latest',
                ]),
                observer.verifyNetwork(),
              ]);
              if (
                ![nonce, pending, balance].every(
                  (value) =>
                    typeof value === 'string' &&
                    /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value),
                )
              )
                throw new WalletProviderError(
                  'wallet_provider_unavailable',
                  'not_dispatched',
                );
              if (
                BigInt(String(nonce)) < floor ||
                BigInt(String(pending)) < floor ||
                BigInt(String(balance)) < requiredBalance
              ) {
                unavailable();
                throw new WalletProviderError(
                  'wallet_provider_unavailable',
                  'not_dispatched',
                );
              }
              return endpoint;
            },
            this.fundingTransport,
          );
          if (
            this.installedSubmission.get(id) !== configuration ||
            this.installedEndpoint.get(id) !== endpoint
          )
            await this.client.call(
              'PATCH',
              '/relayers/' + id,
              JSON.stringify({
                custom_rpc_urls: [{ url: endpoint, weight: 100 }],
                policies: {
                  min_balance: 0,
                  gas_limit_estimation: false,
                  eip1559_pricing: true,
                  gas_price_cap: Number(gas.maxFeePerGas),
                },
              }),
            );
          if (
            fingerprint(
              await this.resources.rpcEndpoints(
                record.applicationId,
                'rpc-submission',
              ),
            ) !== fingerprint(endpoints)
          )
            deny();
          this.installedSubmission.set(id, configuration);
          this.installedEndpoint.set(id, endpoint);
        } finally {
          release();
          if (this.configuring.get(id) === tail) this.configuring.delete(id);
        }
      }
      return this.transport(input, init);
    }) as typeof fetch;
  }
}
