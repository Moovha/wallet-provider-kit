import { randomUUID } from 'node:crypto';
import {
  Interface,
  id as hashText,
  ZeroAddress,
  concat,
  getAddress,
  getCreate2Address,
  keccak256,
  solidityPacked,
  toBeHex,
  toQuantity,
} from 'ethers';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import type { ProviderDatabase } from '../storage/index.js';
import type { OnboardingService } from '../onboarding/service.js';
import { fingerprint, uuid } from '../onboarding/policy.js';
import {
  createWalletAttemptRequest,
  createAttemptLifecycle,
} from '../providers/attempt-lifecycle.js';
import { RpcReader, QuorumExecutionObserver } from '../execution/chain.js';
import {
  createRelayerClient,
  type RelayerBinding,
} from '../providers/relayer-client.js';
import type {
  ExecutionConfiguration,
  ExecutionSponsor,
} from '../execution/types.js';
import type {
  PinnedContract,
  SafeAccountBinding,
} from '../execution/approved-calls.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
import {
  applicationGasBudgetId,
  applicationGasBudgetLimit,
} from '../sponsorship/budget.js';

export interface SafeProvisioningConfiguration {
  profile: 'safe-1.4.1';
  factory: PinnedContract;
  singleton: PinnedContract;
  proxyCodeHash: string;
  maxValiditySeconds: number;
}
/** Deployment identity excludes dispatch timing and sponsor budgets; changing code pins cannot replace an existing account. */
export function safeProvisioningIdentity(
  config: SafeProvisioningConfiguration,
  network?: ProviderNetwork,
): string {
  return fingerprint([
    config.profile,
    config.factory,
    config.singleton,
    config.proxyCodeHash,
    providerNetwork(network).name,
  ]);
}
export const safeFactoryInterface = new Interface([
  'function proxyCreationCode() view returns(bytes)',
  'function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address)',
]);
export const safeSetupInterface = new Interface([
  'function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)',
]);
export interface SafeDeploymentPlan {
  accountId: string;
  owner: string;
  address: string;
  saltNonce: string;
  data: string;
  chainId: string;
  factory: PinnedContract;
  singleton: PinnedContract;
  proxyCodeHash: string;
  sponsor: ExecutionSponsor;
  expiresAt: string;
}
export interface SafeDeploymentRecord {
  attemptId: string;
  caller: Pick<VerifiedPrincipal, 'issuer' | 'subject' | 'clientId'>;
  configurationHash: string;
  plan: SafeDeploymentPlan;
  state: 'prepared' | 'pending' | 'ready' | 'unknown';
  transactionId?: string;
}
/** Trusted narrow deployment driver. Submit must recheck authorizeEffect immediately before a provider mutation. */
export interface SafeDeploymentDriver {
  prepare(plan: SafeDeploymentPlan): Promise<void>;
  submit(
    plan: SafeDeploymentPlan,
    authorizeEffect: () => Promise<void>,
  ): Promise<string>;
}
function denied(): never {
  throw new WalletProviderError('wallet_authorization_denied');
}
function unavailable(): never {
  throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
}

export function createSafeDeploymentDriver(
  configuration: ExecutionConfiguration,
  apiKey: string,
  request: typeof fetch = fetch,
): SafeDeploymentDriver {
  configuration = structuredClone(configuration);
  if (!configuration.relayer)
    throw new WalletProviderError('wallet_provider_configuration');
  const client = createRelayerClient(
    {
      url: configuration.relayer.url,
      apiKey,
      network: configuration.network,
      resolveAccount: async (id) =>
        (configuration.sponsors.find((s) => s.accountId === id)
          ?.binding as RelayerBinding) ?? null,
    },
    request,
  );
  return {
    async prepare(plan) {
      const binding = await client.binding(plan.sponsor.accountId);
      const policies = binding?.metadata.policies;
      if (
        !binding ||
        fingerprint(binding.binding) !== fingerprint(plan.sponsor.binding) ||
        !policies ||
        typeof policies !== 'object' ||
        (policies as Record<string, unknown>).gas_limit_estimation !== false ||
        (policies as Record<string, unknown>).gas_price_cap !==
          Number(plan.sponsor.maxFeePerGas)
      )
        denied();
    },
    async submit(plan, authorizeEffect) {
      await client.current(
        plan.sponsor.accountId,
        plan.sponsor.binding as RelayerBinding,
      );
      await authorizeEffect();
      if (Date.parse(plan.expiresAt) <= Date.now()) denied();
      const result = await client.call(
        'POST',
        `/relayers/${plan.sponsor.binding.relayerId}/transactions`,
        JSON.stringify({
          to: plan.factory.address,
          value: '0x0',
          data: plan.data,
          gas_limit: Number(plan.sponsor.gasLimit),
          max_fee_per_gas: Number(plan.sponsor.maxFeePerGas),
          max_priority_fee_per_gas: Number(plan.sponsor.maxPriorityFeePerGas),
          valid_until: plan.expiresAt,
        }),
      );
      if (
        !result ||
        typeof result.id !== 'string' ||
        !uuid.test(result.id) ||
        result.relayer_id !== plan.sponsor.binding.relayerId ||
        String(result.to).toLowerCase() !==
          plan.factory.address.toLowerCase() ||
        String(result.from).toLowerCase() !==
          plan.sponsor.binding.address.toLowerCase() ||
        result.data !== plan.data ||
        BigInt(String(result.value)) !== 0n
      )
        unavailable();
      return result.id;
    },
  };
}

/** Fixed Safe factory initialization; no caller-selected owner, modules, delegatecall, payment or native value. */
export class SafeProvisioningService {
  private readonly config: SafeProvisioningConfiguration;
  private readonly execution: ExecutionConfiguration;
  private readonly readers: RpcReader[];
  private readonly observer?: QuorumExecutionObserver;
  private readonly configurationHash: string;
  private readonly network: ReturnType<typeof providerNetwork>;
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly database: ProviderDatabase,
    config: SafeProvisioningConfiguration,
    execution: ExecutionConfiguration,
    private readonly revision: string,
    private readonly driver: SafeDeploymentDriver,
    endpoints: string[],
    network?: ProviderNetwork,
    private readonly request: typeof fetch = fetch,
    private readonly resolveEndpoints?: (
      context: AuthorityContext,
    ) => Promise<string[]>,
    private readonly assertResources?: () => Promise<void>,
    private readonly applicationAuthority?: () => Promise<{
      owner: string;
      caller: Pick<VerifiedPrincipal, 'issuer' | 'subject' | 'clientId'>;
    }>,
  ) {
    this.config = structuredClone(config);
    this.execution = structuredClone(execution);
    this.network = providerNetwork(network);
    this.readers = endpoints.map((url) => new RpcReader(url, request));
    this.observer = resolveEndpoints
      ? undefined
      : new QuorumExecutionObserver(
          endpoints,
          execution.rpc.genesisHash,
          execution.maxLogRange,
          request,
          network,
        );
    this.configurationHash = safeProvisioningIdentity(this.config, network);
  }
  private async authority(
    context: AuthorityContext,
    id: string,
    provision = true,
  ) {
    await this.assertResources?.();
    if (this.applicationAuthority) return this.applicationAuthority();
    if (
      !uuid.test(id) ||
      !uuid.test(context.idempotencyKey) ||
      !context.principal.scopes.includes(
        provision ? 'wallet:provision' : 'wallet:account:read',
      )
    )
      denied();
    const grant = await this.onboarding.authorize(
      context.principal,
      id,
      provision ? 'operations:request' : 'account:read',
    );
    return this.database.onboardingStore.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
          this.revision ||
        fingerprint(state.grants[grant.id]) !== fingerprint(grant)
      )
        denied();
      const account = state.accounts[id];
      if (!account?.address || account.owner !== grant.owner) denied();
      return {
        owner: getAddress(account.address),
        caller: {
          issuer: context.principal.issuer,
          subject: context.principal.subject,
          clientId: context.principal.clientId,
        },
      };
    });
  }
  private async creationCode() {
    await this.observer!.anchor();
    const results = await Promise.all(
      this.readers.map(async (reader) => {
        const [factory, singleton, encoded] = await Promise.all([
          reader.call('eth_getCode', [this.config.factory.address, 'latest']),
          reader.call('eth_getCode', [this.config.singleton.address, 'latest']),
          reader.call('eth_call', [
            {
              to: this.config.factory.address,
              data: safeFactoryInterface.encodeFunctionData(
                'proxyCreationCode',
              ),
            },
            'latest',
          ]),
        ]);
        if (
          typeof factory !== 'string' ||
          typeof singleton !== 'string' ||
          keccak256(factory) !== this.config.factory.codeHash ||
          keccak256(singleton) !== this.config.singleton.codeHash
        )
          unavailable();
        return String(
          safeFactoryInterface.decodeFunctionResult(
            'proxyCreationCode',
            String(encoded),
          )[0],
        );
      }),
    );
    if (
      results.some((v) => v !== results[0]) ||
      !/^0x(?:[0-9a-f]{2})+$/i.test(results[0])
    )
      unavailable();
    return results[0];
  }
  private binding(plan: SafeDeploymentPlan): SafeAccountBinding {
    return {
      accountId: plan.accountId,
      address: plan.address,
      codeHash: plan.proxyCodeHash,
      singleton: plan.singleton,
    };
  }
  private async deployed(plan: SafeDeploymentPlan): Promise<boolean> {
    await this.observer!.anchor();
    const heads = await Promise.all(
      this.readers.map((r) =>
        r.call('eth_getBlockByNumber', ['finalized', false]),
      ),
    );
    if (
      heads.some(
        (h) =>
          !h ||
          typeof h !== 'object' ||
          typeof (h as Record<string, unknown>).number !== 'string',
      )
    )
      unavailable();
    const height = heads
      .map((h) => BigInt(String((h as Record<string, unknown>).number)))
      .reduce((a, b) => (a < b ? a : b));
    const tag = toQuantity(height);
    const observations = await Promise.all(
      this.readers.map(async (r) => {
        const [block, code] = await Promise.all([
          r.call('eth_getBlockByNumber', [tag, false]),
          r.call('eth_getCode', [plan.address, tag]),
        ]);
        if (
          !block ||
          typeof block !== 'object' ||
          typeof (block as Record<string, unknown>).hash !== 'string' ||
          typeof code !== 'string'
        )
          unavailable();
        return { block: (block as Record<string, unknown>).hash, code };
      }),
    );
    if (
      observations.some(
        (v) =>
          v.block !== observations[0].block || v.code !== observations[0].code,
      )
    )
      unavailable();
    if (observations[0].code === '0x') return false;
    if (keccak256(observations[0].code) !== plan.proxyCodeHash) unavailable();
    await this.observer!.contractNonce(this.binding(plan), plan.owner);
    const guardSlot = hashText('guard_manager.guard.address');
    const fallbackSlot = hashText('fallback_manager.handler.address');
    const storage = await Promise.all(
      this.readers.flatMap((reader) =>
        [guardSlot, fallbackSlot].map((slot) =>
          reader.call('eth_getStorageAt', [plan.address, slot, 'latest']),
        ),
      ),
    );
    if (storage.some((value) => value !== '0x' + '0'.repeat(64))) unavailable();
    return true;
  }
  private async preflight(plan: SafeDeploymentPlan): Promise<void> {
    await this.creationCode();
    await Promise.all(
      this.readers.map(async (reader) => {
        const [balance, result] = await Promise.all([
          reader.call('eth_getBalance', [
            plan.sponsor.binding.address,
            'latest',
          ]),
          reader.call('eth_call', [
            {
              from: plan.sponsor.binding.address,
              to: plan.factory.address,
              data: plan.data,
              value: '0x0',
              gas: toQuantity(BigInt(plan.sponsor.gasLimit)),
            },
            'latest',
          ]),
        ]);
        const ceiling =
          BigInt(plan.sponsor.gasLimit) * BigInt(plan.sponsor.maxFeePerGas) +
          BigInt(plan.sponsor.l1FeeReserveWei);
        if (
          typeof balance !== 'string' ||
          !/^0x[0-9a-f]+$/i.test(balance) ||
          BigInt(balance) < ceiling ||
          getAddress(
            String(
              safeFactoryInterface.decodeFunctionResult(
                'createProxyWithNonce',
                String(result),
              )[0],
            ),
          ) !== plan.address
        )
          unavailable();
      }),
    );
  }
  private async scoped(context: AuthorityContext) {
    context = structuredClone(context);
    const endpoints = await this.resolveEndpoints!(context);
    return new SafeProvisioningService(
      this.onboarding,
      this.database,
      this.config,
      this.execution,
      this.revision,
      this.driver,
      endpoints,
      this.network.name,
      this.request,
      undefined,
      async () => {
        if (
          fingerprint(await this.resolveEndpoints!(context)) !==
          fingerprint(endpoints)
        )
          denied();
      },
    );
  }
  async read(
    context: AuthorityContext,
    id: string,
  ): Promise<{
    profile: 'safe-1.4.1';
    chain_id: string;
    address: string;
    status: SafeDeploymentRecord['state'];
  }> {
    if (this.resolveEndpoints)
      return (await this.scoped(context)).read(context, id);
    const authority = await this.authority(context, id, false);
    const record = await this.database.onboardingStore.transaction(
      (state) => state.deploymentBindings?.['service-v1']?.safeAccounts?.[id],
    );
    if (
      !record ||
      record.configurationHash !== this.configurationHash ||
      record.plan.owner !== authority.owner
    )
      denied();
    if (await this.deployed(record.plan)) {
      await this.authority(context, id, false);
      return this.saveReady(record);
    }
    return this.receipt({
      ...record,
      state: record.state === 'ready' ? 'unknown' : record.state,
    });
  }
  private async saveReady(record: SafeDeploymentRecord) {
    return this.database.onboardingStore.transaction((state) => {
      const deployment = state.deploymentBindings?.['service-v1'];
      const saved = deployment?.safeAccounts?.[record.plan.accountId];
      if (
        deployment?.activeRevision !== this.revision ||
        !saved ||
        fingerprint(saved.plan) !== fingerprint(record.plan)
      )
        denied();
      saved.state = 'ready';
      return this.receipt(saved);
    });
  }
  private receipt(record: SafeDeploymentRecord) {
    return {
      profile: 'safe-1.4.1' as const,
      chain_id: this.network.caip,
      address: record.plan.address,
      status: record.state,
    };
  }
  async provision(
    input: AuthorityContext,
    id: string,
  ): Promise<{
    profile: 'safe-1.4.1';
    chain_id: string;
    address: string;
    status: SafeDeploymentRecord['state'];
  }> {
    if (this.resolveEndpoints)
      return (await this.scoped(input)).provision(input, id);
    const context = structuredClone(input),
      authority = await this.authority(context, id);
    const creation = await this.creationCode();
    const initial = await this.database.onboardingStore.transaction((state) => {
      const deployment = state.deploymentBindings?.['service-v1'];
      if (deployment?.activeRevision !== this.revision) denied();
      const records = (deployment.safeAccounts ??= {});
      const existing = records[id];
      if (existing) {
        if (
          existing.configurationHash !== this.configurationHash ||
          existing.plan.owner !== authority.owner ||
          fingerprint(existing.caller) !== fingerprint(authority.caller)
        )
          denied();
        return existing;
      }
      const sponsor = this.execution.sponsors.find(
        (s) => s.clientId === context.principal.clientId,
      );
      if (
        !sponsor ||
        sponsor.binding.address.toLowerCase() === authority.owner.toLowerCase()
      )
        denied();
      const saltNonce = BigInt(
        '0x' +
          fingerprint([
            this.onboarding.policy.provider.origin,
            this.network.name,
            id,
            authority.owner,
            this.configurationHash,
          ]),
      ).toString();
      const initializer = safeSetupInterface.encodeFunctionData('setup', [
        [authority.owner],
        1,
        ZeroAddress,
        '0x',
        ZeroAddress,
        ZeroAddress,
        0,
        ZeroAddress,
      ]);
      const salt = keccak256(
        solidityPacked(
          ['bytes32', 'uint256'],
          [keccak256(initializer), saltNonce],
        ),
      );
      const address = getCreate2Address(
        this.config.factory.address,
        salt,
        keccak256(
          concat([creation, toBeHex(this.config.singleton.address, 32)]),
        ),
      );
      const record: SafeDeploymentRecord = {
        attemptId: randomUUID(),
        caller: authority.caller,
        configurationHash: this.configurationHash,
        state: 'prepared',
        plan: {
          accountId: id,
          owner: authority.owner,
          address,
          saltNonce,
          data: safeFactoryInterface.encodeFunctionData(
            'createProxyWithNonce',
            [this.config.singleton.address, initializer, saltNonce],
          ),
          chainId: this.network.chainId,
          factory: this.config.factory,
          singleton: this.config.singleton,
          proxyCodeHash: this.config.proxyCodeHash,
          sponsor,
          expiresAt: new Date(
            Date.now() + this.config.maxValiditySeconds * 1000,
          ).toISOString(),
        },
      };
      records[id] = record;
      return record;
    });
    if (await this.deployed(initial.plan)) {
      await this.authority(context, id);
      return this.saveReady(initial);
    }
    if (initial.state === 'ready') unavailable();
    const request = createWalletAttemptRequest(
      'safe-provisioning-v1',
      'safe-factory-relayer-v1',
      'relay_transaction',
      id,
      initial.attemptId,
      id,
      initial.plan,
    );
    const current = async () => {
      const authorityNow = await this.authority(context, id);
      const saved = await this.database.onboardingStore.transaction(
        (s) => s.deploymentBindings?.['service-v1']?.safeAccounts?.[id],
      );
      return (
        !!saved &&
        saved.configurationHash === this.configurationHash &&
        fingerprint(saved.plan) === fingerprint(initial.plan) &&
        saved.plan.owner === authorityNow.owner &&
        fingerprint(saved.caller) === fingerprint(authorityNow.caller)
      );
    };
    const prior = await this.database.journal.read(request);
    if (prior?.state === 'pending' || prior?.state === 'unknown')
      return this.receipt({ ...initial, state: 'unknown' });
    if (!prior) {
      if (Date.parse(initial.plan.expiresAt) <= Date.now()) denied();
      await this.driver.prepare(initial.plan);
      await this.preflight(initial.plan);
      const maximum =
        BigInt(initial.plan.sponsor.gasLimit) *
          BigInt(initial.plan.sponsor.maxFeePerGas) +
        BigInt(initial.plan.sponsor.l1FeeReserveWei);
      await this.database.setBudget(
        applicationGasBudgetId(
          this.onboarding.policy.provider.origin,
          context.principal.issuer,
          context.principal.clientId,
        ),
        applicationGasBudgetLimit(
          this.execution.sponsors,
          context.principal.clientId,
        ),
        this.revision,
      );
      await this.database.admitAttempt({
        request,
        budgetId: applicationGasBudgetId(
          this.onboarding.policy.provider.origin,
          context.principal.issuer,
          context.principal.clientId,
        ),
        units: maximum.toString(),
      });
    }
    const lifecycle = createAttemptLifecycle('safe-factory-relayer-v1', {
      namespace: 'safe-provisioning-v1',
      journal: this.database.journal,
      authorizeAttempt: current,
    });
    try {
      const result = await lifecycle.execute(
        request,
        async () => ({
          kind: 'relay_transaction',
          transactionId: await this.driver.submit(initial.plan, async () => {
            if (
              !(await current()) ||
              Date.parse(initial.plan.expiresAt) <= Date.now()
            )
              denied();
          }),
        }),
        (result) => {
          if (
            result.kind !== 'relay_transaction' ||
            !uuid.test(result.transactionId)
          )
            unavailable();
          return result;
        },
      );
      if (result.kind !== 'relay_transaction') unavailable();
      await this.database.onboardingStore.transaction((state) => {
        const record =
          state.deploymentBindings?.['service-v1']?.safeAccounts?.[id];
        if (!record || fingerprint(record.plan) !== fingerprint(initial.plan))
          denied();
        record.state = 'pending';
        record.transactionId = result.transactionId;
      });
    } catch (error) {
      if (error instanceof WalletProviderError && error.outcome === 'unknown') {
        await this.database.onboardingStore.transaction((state) => {
          const record =
            state.deploymentBindings?.['service-v1']?.safeAccounts?.[id];
          if (record && fingerprint(record.plan) === fingerprint(initial.plan))
            record.state = 'unknown';
        });
        return this.receipt({ ...initial, state: 'unknown' });
      }
      throw error;
    }
    if (await this.deployed(initial.plan)) {
      await this.authority(context, id);
      return this.saveReady(initial);
    }
    return this.receipt({ ...initial, state: 'pending' });
  }
}
