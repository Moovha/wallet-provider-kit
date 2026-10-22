import {
  infrastructureFundingPlan,
  fundingMessages,
  InfrastructureFundingUnavailable,
  type FundingObservation,
} from './infrastructure-funding.js';
import {
  createSafeRecoveryManifest,
  predictSafeAddress,
  type SafeRecoveryManifest,
} from '../provisioning/recovery.js';
import {
  applyEstimatedUserOperationGas,
  readUserOperationGasEstimate,
} from './estimated-gas.js';
import {
  atomicSafeInitializer,
  safeModuleSetup,
} from '../provisioning/atomic-safe.js';
import { moduleSetupAction, moduleSetupCallData } from './account-setup.js';
import { bindRpcTransport } from '../execution/rpc-capacity.js';
import { createWalletAttemptRequest } from '../providers/attempt-lifecycle.js';
import { applicationGasBudgetId } from './budget.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  Interface,
  Transaction,
  Wallet,
  ZeroAddress,
  getBytes,
  getCreateAddress,
  keccak256,
  toQuantity,
  solidityPacked,
} from 'ethers';
import type { ProviderDatabase } from '../storage/index.js';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type {
  EmbeddedAccount,
  WalletSigningProvider,
} from '../domain/signing.js';
import { WalletProviderError } from '../domain/signing.js';
import { deny, fingerprint } from '../onboarding/policy.js';
import type { ProviderState } from '../onboarding/types.js';
import type { OnboardingService } from '../onboarding/service.js';
import type {
  ProviderConfiguration,
  SecretReference,
} from '../deployment/config.js';
import type { SupportedActions } from '../deployment/actions.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
} from '../runtime-configuration/service.js';
import {
  ApplicationCredentialCipher,
  type ApplicationCredential,
} from '../runtime-configuration/credentials.js';
import { RpcReader } from '../execution/chain.js';
import { quoteNetworkFees } from '../execution/network-fees.js';
import {
  type SafeAccountBinding,
  type PinnedContract,
  type ApprovedCallIntent,
} from '../execution/approved-calls.js';
import {
  safeFactoryInterface,
  safeSetupInterface,
} from '../provisioning/safe.js';
import {
  localPaymasterDeployment,
  createLocalPaymasterTransport,
  localPaymasterUrl,
} from './local-paymaster.js';
import { localPaymasterAbi } from './local-paymaster-contract.generated.js';
import { Safe4337SigningService } from './signing.js';
import { Safe4337Verifier, type Safe4337Acceptance } from './verifier.js';
import {
  UserOperationExecutionCoordinator,
  userOperationExecutionBinding,
} from './execution.js';
import { UserOperationWalletCallsDriver } from './wallet-calls.js';
import type { WalletCallsDriver } from './execution-types.js';
import { providerNetwork } from '../networks.js';
import {
  sponsorshipGas,
  type ApplicationObligations,
} from '../runtime-configuration/obligations.js';

export interface SafeWalletConfiguration {
  profile: 'safe-only-4337-v1';
  entryPoint: PinnedContract;
  module: PinnedContract;
  genesisHash: string;
  bundlerAuthorization: SecretReference;
  runtimeDirectory: string;
  maximumSetupCostWei: string;
  executorBalanceWei: string;
  paymasterDepositWei: string;
}
export interface SafeWalletAccount {
  applicationId: string;
  accountId: string;
  owner: string;
  signer: EmbeddedAccount;
  binding: SafeAccountBinding;
  status: 'prepared' | 'ready';
  initialization?: { profile: 'atomic-4337-v1'; initializer: string };
  recovery?: SafeRecoveryManifest;
}
interface SetupPreparation {
  fees: import('../execution/network-fees.js').NetworkFeeQuote;
  estimate: unknown;
  balance: unknown;
  pendingNonce: unknown;
}
interface SetupTransaction {
  id: string;
  request: import('../domain/attempt-journal.js').WalletAttemptRequest;
  feeReserveWei: string;
  unsigned: ApplicationCredential;
  purpose: string;
  requestHash: string;
  nonce: number;
  hash?: string;
  raw?: ApplicationCredential;
  maximumCostWei: string;
  included?: boolean;
  settled?: boolean;
  submitted?: boolean;
}
export interface SafeWalletInfrastructure {
  applicationId: string;
  fundingAddress: string;
  fundingAccountId: string;
  fundingKey: ApplicationCredential;
  executor: { address: string; key: ApplicationCredential };
  paymasterSigner: { address: string; key: ApplicationCredential };
  paymaster?: PinnedContract;
  transactions: SetupTransaction[];
  setupSignatures?: Record<
    string,
    {
      action: import('../domain/signing.js').TypedDataAction;
      attemptId: string;
      state: 'prepared' | 'dispatch' | 'signed';
      signature?: ApplicationCredential;
    }
  >;
}
const configAbi = new Interface([
  'function enableModule(address)',
  'function setFallbackHandler(address)',
  'function nonce() view returns(uint256)',
  'function getOwners() view returns(address[])',
  'function getModulesPaginated(address,uint256) view returns(address[],address)',
  'function getThreshold() view returns(uint256)',
  'function masterCopy() view returns(address)',
  'function VERSION() view returns(string)',
]);
const paymasterAbi = new Interface(localPaymasterAbi);
const entryAbi = new Interface([
  'function balanceOf(address) view returns(uint256)',
]);
const sentinel = '0x0000000000000000000000000000000000000001';
const internalBundler = 'https://bundled-bundler.invalid';
const pending = () =>
  new WalletProviderError('wallet_attempt_pending', 'unknown');

/** One Safe asset address per wallet account; infrastructure keys never authorize user asset calls. */
export class SafeWalletRuntime {
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly drivers = new Map<string, UserOperationWalletCallsDriver>();
  private readonly fundingObservations = new Map<string, FundingObservation>();
  private walletTimer?: ReturnType<typeof setTimeout>;
  private walletWakeAt = Infinity;
  private walletTick?: Promise<void>;
  private settlement?: Promise<void>;
  private settlementCursor = 0;
  private readonly walletRuns = new Map<
    UserOperationWalletCallsDriver,
    Promise<void>
  >();

  /** Share the retained-batch snapshot; a stalled account never holds other accounts' workers. */
  private async runWallets() {
    const snapshot = await this.database.onboardingStore.transaction(
      (state) => {
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
          this.actions.revision
        )
          deny();
        return Object.values(state.userOperationBatches ?? {});
      },
    );
    for (const driver of this.drivers.values()) {
      if (this.walletRuns.has(driver)) continue;
      const running = driver
        .runOnce(snapshot, false)
        .catch(() => undefined)
        .finally(() => {
          if (this.walletRuns.get(driver) === running)
            this.walletRuns.delete(driver);
        });
      this.walletRuns.set(driver, running);
    }
    // One provider-wide finality observer avoids a restart burst from every retained wallet.
    if (!this.settlement) {
      const drivers = [...this.drivers.values()];
      const running = (async () => {
        for (let i = 0; i < drivers.length; i++) {
          const index = this.settlementCursor++ % drivers.length;
          if (await drivers[index].settleOnce(snapshot)) break;
        }
      })()
        .catch(() => undefined)
        .finally(() => {
          if (this.settlement === running) this.settlement = undefined;
        });
      this.settlement = running;
    }
  }
  private scheduleWallets(delay: number) {
    if (this.stopped) return;
    const at = Date.now() + delay;
    if (this.walletTimer && this.walletWakeAt <= at) return;
    clearTimeout(this.walletTimer);
    this.walletWakeAt = at;
    this.walletTimer = setTimeout(() => {
      this.walletTimer = undefined;
      if (this.stopped) return;
      const running = this.runWallets();
      this.walletTick = running;
      void running
        .catch(() => undefined)
        .finally(() => {
          if (this.walletTick === running) this.walletTick = undefined;
          this.scheduleWallets(1000);
        });
    }, delay);
    this.walletTimer.unref();
  }
  private readonly fees = new Map<
    string,
    Promise<import('../execution/network-fees.js').NetworkFeeQuote>
  >();
  private readonly domain;
  private readonly network;
  private stopped = false;
  private readonly listeners = new Set<(batchId: string) => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private replenishing?: Promise<void>;
  private preparing = 0;
  private readonly waiting: (() => void)[] = [];
  private async prepare<T>(work: () => Promise<T>): Promise<T> {
    if (this.preparing >= 10) {
      if (this.waiting.length >= 100)
        throw new WalletProviderError('wallet_provider_unavailable');
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else this.preparing++;
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.preparing--;
    }
  }

  constructor(
    private readonly config: ProviderConfiguration,
    private readonly database: ProviderDatabase,
    private readonly resources: RuntimeConfigurationService,
    private readonly onboarding: OnboardingService,
    private readonly actions: SupportedActions,
    private readonly backend: WalletSigningProvider,
    private readonly cipher: ApplicationCredentialCipher,
    private readonly directory: string,
    private readonly authorization: string,
    private readonly request: typeof fetch = fetch,
  ) {
    this.network = providerNetwork(config.network);
    this.domain = {
      chainId: this.network.hex,
      entryPoint: config.safeWallet!.entryPoint.address,
      entryPointVersion: '0.7' as const,
    };
  }
  private transaction<T>(
    fn: (
      registry: import('../runtime-configuration/service.js').RuntimeConfigurationState,
      state: ProviderState,
    ) => T,
  ) {
    return this.database.onboardingStore.transaction((s) => {
      const deployment = s.deploymentBindings?.['service-v1'];
      if (
        deployment?.activeRevision !== this.actions.revision ||
        !deployment.runtimeConfiguration
      )
        deny();
      return fn(deployment.runtimeConfiguration, s);
    });
  }
  private async exclusive<T>(
    applicationId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(applicationId) ?? Promise.resolve();
    const running = previous.catch(() => undefined).then(operation);
    this.locks.set(applicationId, running);
    try {
      return await running;
    } finally {
      if (this.locks.get(applicationId) === running)
        this.locks.delete(applicationId);
    }
  }
  private seal(applicationId: string, reference: string, value: string) {
    return this.cipher.seal(
      {
        application_id: applicationId,
        reference,
        revision: '1',
        origin: '',
        status: 'active',
      },
      value,
    );
  }
  private async agreement(applicationId: string) {
    const result = await this.resources.acceptedSponsorship(applicationId);
    const agreement = result.value as ApplicationObligations['sponsorship'];
    if (agreement.account_model !== 'provider-controlled-user-safe') deny();
    return agreement;
  }
  private async reader(applicationId: string) {
    const endpoints = await this.resources.rpcEndpoints(applicationId);
    return new RpcReader(
      endpoints[0],
      this.request,
      4,
      true,
      'endpoint-failover',
    );
  }
  private async networkFees(applicationId: string) {
    const previous = this.fees.get(applicationId);
    if (previous) return previous;
    const quote = this.resources
      .withRpc(
        applicationId,
        async (endpoints) => {
          const agreement = await this.agreement(applicationId);
          const reader = new RpcReader(
            endpoints[0],
            this.request,
            4,
            true,
            'endpoint-failover',
          );
          const [chain, fees] = await Promise.all([
            reader.feed('eth_chainId', []),
            quoteNetworkFees(reader, sponsorshipGas(agreement)),
            reader.verifyGenesis(
              this.config.safeWallet!.genesisHash,
              async () => {
                const block = (await reader.call('eth_getBlockByNumber', [
                  '0x0',
                  false,
                ])) as { hash: string };
                if (block.hash !== this.config.safeWallet!.genesisHash) deny();
              },
            ),
          ]);
          if (chain !== this.network.hex) deny();
          return fees;
        },
        this.request,
      )
      .finally(() => {
        if (this.fees.get(applicationId) === quote)
          this.fees.delete(applicationId);
      });
    this.fees.set(applicationId, quote);
    return quote;
  }
  private async infrastructureRpc(
    applicationId: string,
    method: 'eth_estimateGas' | 'eth_sendRawTransaction',
    params: unknown[],
  ) {
    const endpoints = await this.resources.rpcEndpoints(applicationId);
    const id = randomUUID();
    try {
      const response = await this.request(endpoints[0], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error();
      }
      const body = (await response.json()) as {
        id: string;
        result?: unknown;
        error?: unknown;
      };
      if (body.id !== id || body.error || !Object.hasOwn(body, 'result'))
        throw new Error();
      return body.result;
    } catch {
      throw new WalletProviderError(
        'wallet_provider_unavailable',
        method === 'eth_sendRawTransaction' ? 'unknown' : 'not_dispatched',
      );
    }
  }
  private async pin(reader: RpcReader, contract: PinnedContract) {
    if (
      keccak256(
        String(await reader.call('eth_getCode', [contract.address, 'latest'])),
      ) !== contract.codeHash
    )
      deny();
  }
  private async current(applicationId: string) {
    if (!this.config.activation.enabled) deny();
    await this.agreement(applicationId);
    return this.transaction(
      (r) => r.safeWalletInfrastructure?.[applicationId] ?? deny(),
    );
  }
  async ensure(context: AuthorityContext, applicationId: string) {
    this.resources.assertOperator(context.principal);
    await this.agreement(applicationId);
    return this.exclusive(applicationId, async () => {
      await this.transaction((r) => {
        const records = (r.safeWalletInfrastructure ??= {});
        if (records[applicationId]) {
          if (!records[applicationId].fundingAccountId) deny();
          return;
        }
        const funding = Wallet.createRandom(),
          executor = Wallet.createRandom(),
          signer = Wallet.createRandom();
        records[applicationId] = {
          applicationId,
          fundingAddress: funding.address,
          fundingAccountId: randomUUID(),
          fundingKey: this.seal(
            applicationId,
            'safe-wallet-funding',
            funding.privateKey,
          ),
          executor: {
            address: executor.address,
            key: this.seal(
              applicationId,
              'bundler-executor',
              executor.privateKey,
            ),
          },
          paymasterSigner: {
            address: signer.address,
            key: this.seal(
              applicationId,
              'paymaster-signer',
              signer.privateKey,
            ),
          },
          transactions: [],
        };
      });
      const reader = await this.reader(applicationId);
      await Promise.all([
        this.pin(reader, this.config.safeWallet!.entryPoint),
        this.pin(reader, this.config.safeWallet!.module),
      ]);
      const infra = await this.current(applicationId);
      if (!infra.paymaster) {
        const deployment = localPaymasterDeployment(
          this.domain.entryPoint,
          infra.fundingAddress,
          infra.fundingAddress,
          infra.paymasterSigner.address,
        );
        const transaction = await this.send(
          applicationId,
          'paymaster-deployment',
          { data: deployment.data, value: '0' },
        );
        const address = getCreateAddress({
          from: infra.fundingAddress,
          nonce: transaction.nonce,
        });
        await this.pin(reader, {
          address,
          codeHash: deployment.runtimeCodeHash,
        });
        const call = async (name: string, args: unknown[] = []) =>
          paymasterAbi.decodeFunctionResult(
            name,
            String(
              await reader.call('eth_call', [
                {
                  to: address,
                  data: paymasterAbi.encodeFunctionData(name, args),
                },
                'latest',
              ]),
            ),
          )[0];
        if (
          String(await call('entryPoint')).toLowerCase() !==
            this.domain.entryPoint.toLowerCase() ||
          !(await call('hasRole', [
            await call('DEFAULT_ADMIN_ROLE'),
            infra.fundingAddress,
          ])) ||
          !(await call('hasRole', [
            await call('MANAGER_ROLE'),
            infra.fundingAddress,
          ])) ||
          !(await call('signers', [infra.paymasterSigner.address]))
        )
          deny();
        await this.transaction((r) => {
          r.safeWalletInfrastructure![applicationId].paymaster = {
            address,
            codeHash: deployment.runtimeCodeHash,
          };
        });
      }
      await this.replenish(applicationId);
      await this.publishBundler(applicationId);
      return this.read(context.principal, applicationId);
    });
  }
  async read(principal: VerifiedPrincipal, applicationId: string) {
    await this.resources.readObligations(
      principal,
      runtimeApplicationId(principal.issuer, principal.clientId) ===
        applicationId
        ? undefined
        : applicationId,
    );
    return this.transaction((r) => {
      const infrastructure = r.safeWalletInfrastructure?.[applicationId];
      return {
        application_id: applicationId,
        chain_id: this.network.caip,
        profile: 'safe-only-4337-v1',
        execution_funding: this.fundingObservation(applicationId),
        status: infrastructure?.paymaster
          ? 'provisioned'
          : infrastructure
            ? 'needs-funding'
            : 'unprovisioned',
        ...(infrastructure
          ? { funding_address: infrastructure.fundingAddress }
          : {}),
        ...(infrastructure?.paymaster
          ? { paymaster: infrastructure.paymaster.address }
          : {}),
      };
    });
  }
  private async dispatchSetup(
    applicationId: string,
    purpose: string,
    transaction: { to?: string; data?: string; value: string },
    beforeEffect?: () => Promise<void>,
    prepared?: SetupPreparation,
  ) {
    await this.agreement(applicationId);
    const reader = await this.reader(applicationId),
      requestHash = fingerprint(transaction);
    let infra = await this.current(applicationId),
      retained = infra.transactions.find((t) => t.purpose === purpose);
    if (retained && retained.requestHash !== requestHash) deny();
    if (!retained) {
      const agreement = await this.agreement(applicationId);
      const wallet = new Wallet(this.cipher.open(infra.fundingKey));
      if (wallet.address.toLowerCase() !== infra.fundingAddress.toLowerCase())
        deny();
      if (!prepared) throw pending();
      const { fees, estimate, balance, pendingNonce } = prepared;
      const gas = (BigInt(String(estimate)) * 12n) / 10n;
      const reserved =
        gas * BigInt(fees.maxFeePerGas) +
        BigInt(transaction.value) +
        BigInt(sponsorshipGas(agreement).l1FeeReserveWei);
      const spent = infra.transactions.reduce(
        (sum, t) => sum + BigInt(t.maximumCostWei),
        0n,
      );
      if (
        spent + reserved >
        BigInt(this.config.safeWallet!.maximumSetupCostWei)
      )
        throw new InfrastructureFundingUnavailable('limit-reached');
      const inflight = infra.transactions.filter((t) => !t.included);
      const limit = agreement.maximum_in_flight_per_sponsor ?? 10;
      if (
        inflight.length >= limit ||
        inflight.some((t) => !t.submitted || !t.hash || !t.raw)
      )
        throw pending();
      const held = inflight.reduce(
        (sum, t) => sum + BigInt(t.maximumCostWei),
        0n,
      );
      if (BigInt(String(balance)) < held + reserved)
        throw new InfrastructureFundingUnavailable('needs-funding');
      const observed = BigInt(String(pendingNonce));
      const tail = infra.transactions.reduce(
        (n, t) => Math.max(n, t.nonce + 1),
        0,
      );
      if (
        observed < 0n ||
        observed > BigInt(Number.MAX_SAFE_INTEGER) ||
        !Number.isSafeInteger(tail)
      )
        deny();
      const nonce = Math.max(Number(observed), tail);
      const unsigned = {
        ...transaction,
        value: transaction.value,
        nonce: String(nonce),
        type: '2',
        chainId: this.network.chainId,
        gasLimit: gas.toString(),
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      };
      const id = randomUUID();
      const effect = createWalletAttemptRequest(
        'safe-wallet-setup-v1',
        'safe-wallet-infrastructure-v1',
        'infrastructure_transaction',
        infra.fundingAccountId,
        id,
        infra.fundingAccountId + ':' + nonce,
        unsigned,
      );
      retained = {
        id,
        purpose,
        requestHash,
        nonce,
        request: effect,
        feeReserveWei: (reserved - BigInt(transaction.value)).toString(),
        unsigned: this.seal(
          applicationId,
          'unsigned-' + purpose,
          JSON.stringify(unsigned),
        ),
        maximumCostWei: reserved.toString(),
      };
      await this.transaction((r) => {
        const current = r.safeWalletInfrastructure![applicationId];
        if (
          current.transactions.some(
            (t) =>
              t.purpose === purpose ||
              t.nonce >= nonce ||
              (!t.included && (!t.submitted || !t.hash || !t.raw)),
          )
        )
          deny();
        if (
          current.transactions.reduce(
            (sum, t) => sum + BigInt(t.maximumCostWei),
            0n,
          ) +
            reserved >
          BigInt(this.config.safeWallet!.maximumSetupCostWei)
        )
          deny();
        const pendingTransactions = current.transactions.filter(
          (t) => !t.included,
        );
        if (
          pendingTransactions.length >=
          (agreement.maximum_in_flight_per_sponsor ?? 10)
        )
          throw pending();
        if (
          pendingTransactions.reduce(
            (sum, t) => sum + BigInt(t.maximumCostWei),
            0n,
          ) +
            reserved >
          BigInt(String(balance))
        )
          throw new WalletProviderError('wallet_provider_unavailable');
        current.transactions.push(retained!);
      });
    }
    const saved = retained;
    const agreement = await this.agreement(applicationId);
    const application =
      this.config.policy.applications.find(
        (a) => runtimeApplicationId(a.issuer, a.clientId) === applicationId,
      ) ?? deny();
    const budgetId = applicationGasBudgetId(
      this.config.policy.provider.origin,
      application.issuer,
      application.clientId,
    );
    await this.database.setBudget(
      budgetId,
      agreement.maximum_gas_budget_wei,
      this.actions.revision,
    );
    await this.database.admitAttempt({
      request: saved.request,
      budgetId,
      units: saved.feeReserveWei,
    });
    const claim = await this.database.journal.claim(saved.request);
    if (claim.state === 'conflict') deny();
    let newlySigned = false;
    if (!saved.raw || !saved.hash) {
      if (claim.state !== 'dispatch') throw pending();
      await beforeEffect?.();
      await this.agreement(applicationId);
      const unsigned = JSON.parse(this.cipher.open(saved.unsigned));
      const wallet = new Wallet(
        this.cipher.open((await this.current(applicationId)).fundingKey),
      );
      const raw = await wallet.signTransaction(unsigned);
      saved.hash = keccak256(raw);
      saved.raw = this.seal(applicationId, 'setup-' + purpose, raw);
      newlySigned = true;
      await this.transaction((r) => {
        const current =
          r.safeWalletInfrastructure![applicationId].transactions.find(
            (t) => t.id === saved.id,
          ) ?? deny();
        if (
          current.hash ||
          current.request.requestHash !== saved.request.requestHash
        )
          deny();
        current.hash = saved.hash;
        current.raw = saved.raw;
      });
    }
    if (keccak256(this.cipher.open(saved.raw)) !== saved.hash) deny();
    if (
      !newlySigned &&
      (await this.observeSetup(applicationId, saved, reader, claim))
    )
      return { saved, claim, included: true };
    await this.agreement(applicationId);
    await beforeEffect?.();
    try {
      const hash = await this.infrastructureRpc(
        applicationId,
        'eth_sendRawTransaction',
        [this.cipher.open(saved.raw)],
      );
      if (hash !== saved.hash) throw pending();
      await this.markSubmitted(applicationId, saved);
    } catch {
      // A lost acknowledgement retains the original hash and blocks later nonce admission.
    }
    return { saved, claim, included: false };
  }

  private async markSubmitted(applicationId: string, saved: SetupTransaction) {
    await this.transaction((r) => {
      const current =
        r.safeWalletInfrastructure![applicationId].transactions.find(
          (t) => t.id === saved.id,
        ) ?? deny();
      if (
        current.hash !== saved.hash ||
        current.request.requestHash !== saved.request.requestHash
      )
        deny();
      current.submitted = true;
    });
  }

  private async send(
    applicationId: string,
    purpose: string,
    transaction: { to?: string; data?: string; value: string },
    beforeEffect?: () => Promise<void>,
  ) {
    const reader = await this.reader(applicationId);
    const infrastructure = await this.current(applicationId);
    let prepared: SetupPreparation | undefined;
    if (!infrastructure.transactions.some((t) => t.purpose === purpose)) {
      const wallet = new Wallet(this.cipher.open(infrastructure.fundingKey));
      if (
        wallet.address.toLowerCase() !==
        infrastructure.fundingAddress.toLowerCase()
      )
        deny();
      const base = {
        from: wallet.address,
        ...(transaction.to ? { to: transaction.to } : {}),
        data: transaction.data ?? '0x',
        value: toQuantity(BigInt(transaction.value)),
      };
      const [fees, estimate, balance, pendingNonce] = await Promise.all([
        this.networkFees(applicationId),
        this.infrastructureRpc(applicationId, 'eth_estimateGas', [base]),
        reader.call('eth_getBalance', [wallet.address, 'pending']),
        reader.call('eth_getTransactionCount', [wallet.address, 'pending']),
      ]);
      prepared = { fees, estimate, balance, pendingNonce };
    }
    const { saved, claim, included } = await this.exclusive(
      'funding:' + applicationId,
      async () => {
        const current = await this.current(applicationId);
        if (current.transactions.some((t) => !t.included && !t.submitted))
          await this.recoverSetup(applicationId);
        return this.dispatchSetup(
          applicationId,
          purpose,
          transaction,
          beforeEffect,
          prepared,
        );
      },
    );
    if (included) return saved;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        if (await this.observeSetup(applicationId, saved, reader, claim))
          return saved;
      } catch (error) {
        if (
          !(error instanceof WalletProviderError) ||
          error.code !== 'wallet_provider_unavailable'
        )
          throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw pending();
  }
  private async observeSetup(
    applicationId: string,
    saved: SetupTransaction,
    reader: RpcReader,
    claim?: import('../domain/attempt-journal.js').WalletAttemptClaim,
  ): Promise<boolean> {
    if (!saved.hash || !saved.raw) return false;
    if (keccak256(this.cipher.open(saved.raw)) !== saved.hash) deny();
    const receipt = (await reader.call('eth_getTransactionReceipt', [
      saved.hash,
    ])) as { status: string; blockNumber: string; blockHash: string } | null;
    if (!receipt) return false;
    if (receipt.status !== '0x1') deny();
    const block = (await reader.call('eth_getBlockByNumber', [
      receipt.blockNumber,
      false,
    ])) as { hash: string } | null;
    if (!block || block.hash !== receipt.blockHash) return false;
    const currentClaim =
      claim ?? (await this.database.journal.read(saved.request));
    const result = {
      kind: 'infrastructure_transaction' as const,
      transactionId: saved.id,
    };
    let settled = false;
    if (
      currentClaim?.state === 'dispatch' &&
      Date.parse(currentClaim.leaseExpiresAt) > Date.now()
    ) {
      await this.database.journal.complete(
        saved.request,
        currentClaim.leaseToken,
        result,
      );
      settled = true;
    } else if (
      currentClaim?.state === 'unknown' ||
      (currentClaim?.state === 'dispatch' &&
        Date.parse(currentClaim.leaseExpiresAt) <= Date.now())
    ) {
      await this.database.reconcileAttempt(
        saved.request,
        result,
        saved.hash,
        async (request, value, evidence) =>
          fingerprint(request) === fingerprint(saved.request) &&
          value.kind === 'infrastructure_transaction' &&
          value.transactionId === saved.id &&
          evidence === saved.hash &&
          receipt.status === '0x1' &&
          block.hash === receipt.blockHash,
      );
      settled = true;
    } else if (currentClaim?.state === 'succeeded') {
      if (fingerprint(currentClaim.result) !== fingerprint(result)) deny();
      settled = true;
    } else if (currentClaim?.state !== 'pending') deny();
    await this.transaction((r) => {
      const retained =
        r.safeWalletInfrastructure![applicationId].transactions.find(
          (t) => t.id === saved.id,
        ) ?? deny();
      if (
        retained.hash !== saved.hash ||
        retained.request.requestHash !== saved.request.requestHash
      )
        deny();
      retained.included = true;
      if (settled) retained.settled = true;
    });
    return true;
  }

  /** Observe other accounts without acquiring their signing authority or rebroadcasting. */
  private async recoverSetup(applicationId: string) {
    const infra = await this.current(applicationId);
    const reader = await this.reader(applicationId);
    for (const saved of infra.transactions.filter(
      (t) => !t.settled && t.hash,
    )) {
      // Completed historical records may predate the current journal protocol.
      if (saved.request.kind !== 'infrastructure_transaction') {
        if (!saved.included) throw pending();
        continue;
      }
      const claim = await this.database.journal.read(saved.request);
      if (claim?.state === 'succeeded' && saved.included) {
        if (
          claim.result.kind !== 'infrastructure_transaction' ||
          claim.result.transactionId !== saved.id
        )
          deny();
        await this.transaction((r) => {
          r.safeWalletInfrastructure![applicationId].transactions.find(
            (t) => t.id === saved.id,
          )!.settled = true;
        });
        continue;
      }
      try {
        const included = await this.observeSetup(
          applicationId,
          saved,
          reader,
          claim ?? undefined,
        );
        if (!included && !saved.submitted && saved.raw) {
          const found = (await reader.call('eth_getTransactionByHash', [
            saved.hash,
          ])) as { hash?: string; from?: string; nonce?: string } | null;
          const exact = Transaction.from(this.cipher.open(saved.raw));
          if (
            found &&
            found.hash === saved.hash &&
            found.from?.toLowerCase() === exact.from?.toLowerCase() &&
            BigInt(found.nonce ?? '-1') === BigInt(exact.nonce)
          )
            await this.markSubmitted(applicationId, saved);
        }
      } catch (error) {
        if (
          !(error instanceof WalletProviderError) ||
          error.code !== 'wallet_provider_unavailable'
        )
          throw error;
      }
    }
  }

  private fundingObservation(applicationId: string): FundingObservation {
    const saved = this.fundingObservations.get(applicationId);
    return saved?.checked_at &&
      Date.now() - Date.parse(saved.checked_at) <= 30000
      ? structuredClone(saved)
      : { status: 'checking', message: fundingMessages.checking };
  }
  private fundingObserved(
    applicationId: string,
    status: FundingObservation['status'],
  ) {
    this.fundingObservations.set(applicationId, {
      status,
      message: fundingMessages[status],
      checked_at: new Date().toISOString(),
    });
  }
  private async replenish(applicationId: string) {
    try {
      await this.replenishBalances(applicationId);
      this.fundingObserved(applicationId, 'ready');
    } catch (error) {
      this.fundingObserved(
        applicationId,
        error instanceof InfrastructureFundingUnavailable
          ? error.reason
          : 'unavailable',
      );
      throw error;
    }
  }
  private async replenishBalances(applicationId: string) {
    await this.recoverSetup(applicationId);
    let infrastructure = await this.current(applicationId);
    const reader = await this.reader(applicationId);
    if (!infrastructure.paymaster) deny();
    for (const saved of infrastructure.transactions.filter(
      (t) =>
        !t.included &&
        (t.purpose.startsWith('paymaster-deposit-') ||
          t.purpose.startsWith('bundler-working-balance-')),
    )) {
      const original = saved.raw
        ? Transaction.from(this.cipher.open(saved.raw))
        : JSON.parse(this.cipher.open(saved.unsigned));
      await this.send(applicationId, saved.purpose, {
        to: original.to!,
        ...(original.data !== '0x' ? { data: original.data } : {}),
        value: original.value.toString(),
      });
    }
    infrastructure = await this.current(applicationId);

    const deposit = entryAbi.decodeFunctionResult(
      'balanceOf',
      String(
        await reader.call('eth_call', [
          {
            to: this.domain.entryPoint,
            data: entryAbi.encodeFunctionData('balanceOf', [
              infrastructure.paymaster!.address,
            ]),
          },
          'latest',
        ]),
      ),
    )[0] as bigint;
    const executorBalance = BigInt(
      String(
        await reader.call('eth_getBalance', [
          infrastructure.executor.address,
          'latest',
        ]),
      ),
    );
    const target = BigInt(this.config.safeWallet!.paymasterDepositWei);
    const executorTarget = BigInt(this.config.safeWallet!.executorBalanceWei);
    if (deposit >= target && executorBalance >= executorTarget) return;
    const fundingBalance = await reader.call('eth_getBalance', [
      infrastructure.fundingAddress,
      'pending',
    ]);
    const remaining =
      BigInt(this.config.safeWallet!.maximumSetupCostWei) -
      infrastructure.transactions.reduce(
        (sum, t) => sum + BigInt(t.maximumCostWei),
        0n,
      );
    const plan = infrastructureFundingPlan({
      deposit,
      depositTarget: BigInt(this.config.safeWallet!.paymasterDepositWei),
      executor: BigInt(String(executorBalance)),
      executorTarget: BigInt(this.config.safeWallet!.executorBalanceWei),
      funding: BigInt(String(fundingBalance)),
      allowance: remaining > 0n ? remaining : 0n,
    });
    this.fundingObserved(applicationId, plan.status);
    if (plan.status === 'needs-funding' || plan.status === 'limit-reached')
      throw new InfrastructureFundingUnavailable(plan.status);
    if (deposit < target)
      await this.send(
        applicationId,
        'paymaster-deposit-' +
          infrastructure.transactions.filter((t) =>
            t.purpose.startsWith('paymaster-deposit-'),
          ).length,
        {
          to: infrastructure.paymaster!.address,
          data: paymasterAbi.encodeFunctionData('deposit'),
          value: (target - deposit).toString(),
        },
      );
    // A deposit transaction can take several blocks while the executor spends.
    const balance =
      deposit < target
        ? BigInt(
            String(
              await reader.call('eth_getBalance', [
                infrastructure.executor.address,
                'latest',
              ]),
            ),
          )
        : executorBalance;
    if (balance < executorTarget)
      await this.send(
        applicationId,
        'bundler-working-balance-' +
          infrastructure.transactions.filter((t) =>
            t.purpose.startsWith('bundler-working-balance-'),
          ).length,
        {
          to: infrastructure.executor.address,
          value: (executorTarget - balance).toString(),
        },
      );
  }
  private async acceptance(applicationId: string): Promise<Safe4337Acceptance> {
    const infra = await this.current(applicationId);
    return {
      profile: 'safe-4337-module-0.3.0-v07',
      domain: this.domain,
      entryPoint: this.config.safeWallet!.entryPoint,
      module: this.config.safeWallet!.module,
      paymaster: infra.paymaster ?? deny(),
      genesisHash: this.config.safeWallet!.genesisHash,
      rpcVerification: this.resources.rpcVerification,
      aggregateReads: true,
      observationRpcUrls: await this.resources.rpcEndpoints(
        applicationId,
        'rpc-observation',
      ),
      rpcUrls: await this.resources.rpcEndpoints(applicationId),
    };
  }
  private assertRecoveryRecipe(wallet: SafeWalletAccount) {
    if (
      wallet.initialization &&
      wallet.initialization.initializer !==
        atomicSafeInitializer(
          wallet.signer.address,
          this.config.safeWallet!.module.address,
        )
    )
      deny();
    if (
      wallet.recovery &&
      (wallet.recovery.owner.toLowerCase() !==
        wallet.signer.address.toLowerCase() ||
        wallet.recovery.initializer !== wallet.initialization?.initializer ||
        wallet.recovery.address.toLowerCase() !==
          wallet.binding.address.toLowerCase() ||
        predictSafeAddress(wallet.recovery).toLowerCase() !==
          wallet.binding.address.toLowerCase() ||
        JSON.stringify(wallet.recovery.factory) !==
          JSON.stringify(this.config.safeProvisioning!.factory) ||
        JSON.stringify(wallet.recovery.singleton) !==
          JSON.stringify(this.config.safeProvisioning!.singleton) ||
        wallet.recovery.proxyCodeHash !==
          this.config.safeProvisioning!.proxyCodeHash ||
        JSON.stringify(wallet.recovery.module) !==
          JSON.stringify(this.config.safeWallet!.module) ||
        JSON.stringify(wallet.recovery.entryPoint) !==
          JSON.stringify(this.config.safeWallet!.entryPoint))
    )
      deny();
  }
  async provision(context: AuthorityContext, accountId: string) {
    const applicationId = runtimeApplicationId(
      context.principal.issuer,
      context.principal.clientId,
    );
    await this.agreement(applicationId);
    const work = async () => {
      const authority = async () =>
        this.onboarding.withAccountAccess(
          context.principal,
          accountId,
          'contracts:request',
          (s, grant) => ({
            owner: grant.owner,
            account: s.accounts[accountId],
            shared: Boolean(
              s.requests[grant.requestId]?.sharing ||
              s.requests[grant.requestId]?.membership,
            ),
          }),
        );
      const current = await authority();
      const retainedWallet = await this.transaction(
        (r) => r.safeWalletAccounts?.[accountId],
      );
      if (
        current.shared &&
        (!retainedWallet || retainedWallet.status !== 'ready')
      )
        deny();
      if (retainedWallet && retainedWallet.applicationId !== applicationId) {
        if (
          retainedWallet.owner !== current.owner ||
          retainedWallet.status !== 'ready'
        )
          deny();
        await this.onboarding.withAccountAccess(
          context.principal,
          accountId,
          'contracts:request',
          (state) => {
            if (
              !this.onboarding.hasSharedWalletAccess(
                state,
                applicationId,
                accountId,
              )
            )
              deny();
          },
        );
        this.assertRecoveryRecipe(retainedWallet);
        await this.current(applicationId);
        await this.publishBundler(applicationId);
        await authority();
        return {
          account_id: accountId,
          address: retainedWallet.binding.address,
        };
      }
      if (retainedWallet) {
        if (
          retainedWallet.owner !== current.owner ||
          retainedWallet.applicationId !== applicationId
        )
          deny();
        this.assertRecoveryRecipe(retainedWallet);
      }
      await this.recoverSetup(applicationId);
      const infrastructure = await this.current(applicationId);
      for (const saved of infrastructure.transactions.filter(
        (t) =>
          !t.included &&
          ['safe-deployment-', 'enableModule-', 'setFallbackHandler-'].some(
            (prefix) => t.purpose === prefix + accountId,
          ),
      )) {
        const original = JSON.parse(this.cipher.open(saved.unsigned));
        await this.send(
          applicationId,
          saved.purpose,
          {
            ...(original.to ? { to: original.to } : {}),
            ...(original.data ? { data: original.data } : {}),
            value: original.value,
          },
          async () => {
            await authority();
          },
        );
      }
      await this.transaction((r) => {
        const accounts = (r.safeWalletAccounts ??= {});
        if (accounts[accountId]) {
          if (
            accounts[accountId].owner !== current.owner ||
            accounts[accountId].applicationId !== applicationId
          )
            deny();
          return;
        }
        const accepted = r.obligations?.records[applicationId + ':sponsorship']
          ?.value as ApplicationObligations['sponsorship'];
        if (
          Object.values(accounts).filter(
            (a) => a.applicationId === applicationId,
          ).length >= (accepted.maximum_execution_accounts ?? 0)
        )
          deny();
        const signer = {
          accountId,
          address: current.account.address ?? deny(),
        };
        accounts[accountId] = {
          applicationId,
          accountId,
          owner: current.owner,
          signer,
          binding: {
            accountId,
            address: ZeroAddress,
            codeHash: this.config.safeProvisioning!.proxyCodeHash,
            singleton: this.config.safeProvisioning!.singleton,
          },
          status: 'prepared',
          initialization: {
            profile: 'atomic-4337-v1',
            initializer: atomicSafeInitializer(
              signer.address,
              this.config.safeWallet!.module.address,
            ),
          },
        };
      });
      let wallet = await this.transaction(
        (r) => r.safeWalletAccounts![accountId],
      );
      this.assertRecoveryRecipe(wallet);
      if (wallet.status !== 'ready') {
        const reader = await this.reader(applicationId);
        await Promise.all([
          this.pin(reader, this.config.safeProvisioning!.factory),
          this.pin(reader, this.config.safeProvisioning!.singleton),
          ...(wallet.initialization
            ? [
                this.pin(reader, safeModuleSetup),
                this.pin(reader, this.config.safeWallet!.module),
              ]
            : []),
        ]);
      }
      if (wallet.binding.address === ZeroAddress) {
        const reader = await this.reader(applicationId);
        const initializer =
          wallet.initialization?.initializer ??
          safeSetupInterface.encodeFunctionData('setup', [
            [wallet.signer.address],
            1,
            ZeroAddress,
            '0x',
            ZeroAddress,
            ZeroAddress,
            0,
            ZeroAddress,
          ]);
        const salt = BigInt(
          fingerprint(['safe-wallet', applicationId, accountId]).replace(
            /^/,
            '0x',
          ),
        );
        const data = safeFactoryInterface.encodeFunctionData(
          'createProxyWithNonce',
          [this.config.safeProvisioning!.singleton.address, initializer, salt],
        );
        const creation = await reader.call('eth_call', [
          {
            to: this.config.safeProvisioning!.factory.address,
            data: safeFactoryInterface.encodeFunctionData('proxyCreationCode'),
          },
          'latest',
        ]);
        const proxyCreationCode = String(
          safeFactoryInterface.decodeFunctionResult(
            'proxyCreationCode',
            String(creation),
          )[0],
        );
        const recovery = wallet.initialization
          ? createSafeRecoveryManifest({
              config: this.config.safeProvisioning!,
              owner: wallet.signer.address,
              module: this.config.safeWallet!.module,
              entryPoint: this.config.safeWallet!.entryPoint,
              saltNonce: salt.toString(),
              proxyCreationCode,
            })
          : undefined;
        const address = predictSafeAddress({
          factory: this.config.safeProvisioning!.factory,
          singleton: this.config.safeProvisioning!.singleton,
          initializer,
          saltNonce: salt.toString(),
          proxyCreationCode,
        });
        await this.transaction((r) => {
          const saved = r.safeWalletAccounts![accountId];
          saved.binding.address = address;
          if (recovery) saved.recovery = recovery;
        });
        await this.send(
          applicationId,
          'safe-deployment-' + accountId,
          {
            to: this.config.safeProvisioning!.factory.address,
            data,
            value: '0',
          },
          async () => {
            await authority();
          },
        );
        wallet = await this.transaction(
          (r) => r.safeWalletAccounts![accountId],
        );
      }
      if (
        wallet.initialization &&
        !(await this.current(applicationId)).transactions.some(
          (t) => t.purpose === 'safe-deployment-' + accountId && t.included,
        )
      ) {
        await this.send(
          applicationId,
          'safe-deployment-' + accountId,
          {
            to: this.config.safeProvisioning!.factory.address,
            data: safeFactoryInterface.encodeFunctionData(
              'createProxyWithNonce',
              [
                this.config.safeProvisioning!.singleton.address,
                wallet.initialization.initializer,
                BigInt(
                  '0x' + fingerprint(['safe-wallet', applicationId, accountId]),
                ),
              ],
            ),
            value: '0',
          },
          async () => {
            await authority();
          },
        );
      }
      const reader = await this.reader(applicationId);
      if (
        !wallet.initialization &&
        wallet.status !== 'ready' &&
        (await reader.call('eth_getCode', [
          wallet.binding.address,
          'latest',
        ])) === '0x'
      ) {
        await Promise.all([
          this.pin(reader, this.config.safeProvisioning!.factory),
          this.pin(reader, this.config.safeProvisioning!.singleton),
        ]);
        const initializer = safeSetupInterface.encodeFunctionData('setup', [
          [wallet.signer.address],
          1,
          ZeroAddress,
          '0x',
          ZeroAddress,
          ZeroAddress,
          0,
          ZeroAddress,
        ]);
        const salt = BigInt(
          '0x' + fingerprint(['safe-wallet', applicationId, accountId]),
        );
        const data = safeFactoryInterface.encodeFunctionData(
          'createProxyWithNonce',
          [this.config.safeProvisioning!.singleton.address, initializer, salt],
        );
        await this.send(
          applicationId,
          'safe-deployment-' + accountId,
          {
            to: this.config.safeProvisioning!.factory.address,
            data,
            value: '0',
          },
          async () => {
            await authority();
          },
        );
      }
      if (!wallet.initialization && wallet.status !== 'ready')
        await this.configureAccount(applicationId, wallet, authority);
      const acceptance = await this.acceptance(applicationId);
      await new Safe4337Verifier(acceptance, this.request).verify(
        {
          account: wallet.binding,
          multiSend: this.config.approvedCalls!.policy.multiSend,
          calls: [],
          contracts: [],
        },
        wallet.signer.address,
      );
      await authority();
      await this.transaction((r) => {
        r.safeWalletAccounts![accountId].status = 'ready';
      });
      await this.publishBundler(applicationId);

      return { account_id: accountId, address: wallet.binding.address };
    };
    return this.prepare(() =>
      this.exclusive('provision:' + applicationId + ':' + accountId, work),
    );
  }
  /** Read or reconstruct the original atomic deployment recipe under current account authority. */
  async recoveryManifest(
    context: AuthorityContext,
    accountId: string,
  ): Promise<SafeRecoveryManifest> {
    const access = () =>
      this.onboarding.withAccountAccess(
        context.principal,
        accountId,
        'contracts:request',
        () => undefined,
      );
    await access();
    const applicationId = runtimeApplicationId(
      context.principal.issuer,
      context.principal.clientId,
    );
    const wallet = await this.transaction(
      (r) => r.safeWalletAccounts?.[accountId],
    );
    if (
      !wallet ||
      wallet.applicationId !== applicationId ||
      !wallet.initialization
    )
      deny();
    if (wallet.recovery) return structuredClone(wallet.recovery);
    const original = (await this.current(applicationId)).transactions.find(
      (t) => t.purpose === 'safe-deployment-' + accountId,
    );
    if (!original) deny();
    const unsigned = JSON.parse(this.cipher.open(original.unsigned));
    if (
      unsigned.to?.toLowerCase() !==
      this.config.safeProvisioning!.factory.address.toLowerCase()
    )
      deny();
    const decoded = safeFactoryInterface.decodeFunctionData(
      'createProxyWithNonce',
      unsigned.data,
    );
    if (
      decoded[0].toLowerCase() !==
        this.config.safeProvisioning!.singleton.address.toLowerCase() ||
      decoded[1] !== wallet.initialization.initializer
    )
      deny();
    const reader = await this.reader(applicationId);
    await this.pin(reader, this.config.safeProvisioning!.factory);
    const creation = await reader.call('eth_call', [
      {
        to: unsigned.to,
        data: safeFactoryInterface.encodeFunctionData('proxyCreationCode'),
      },
      'latest',
    ]);
    const manifest = createSafeRecoveryManifest({
      config: this.config.safeProvisioning!,
      owner: wallet.signer.address,
      module: this.config.safeWallet!.module,
      entryPoint: this.config.safeWallet!.entryPoint,
      saltNonce: decoded[2].toString(),
      proxyCreationCode: String(
        safeFactoryInterface.decodeFunctionResult(
          'proxyCreationCode',
          String(creation),
        )[0],
      ),
    });
    if (
      manifest.initializer !== decoded[1] ||
      manifest.address.toLowerCase() !== wallet.binding.address.toLowerCase()
    )
      deny();
    await access();
    await this.transaction((r) => {
      r.safeWalletAccounts![accountId].recovery = manifest;
    });
    return structuredClone(manifest);
  }
  private async configureAccount(
    applicationId: string,
    wallet: SafeWalletAccount,
    authority: () => Promise<unknown>,
  ) {
    const reader = await this.reader(applicationId);
    await Promise.all([
      this.pin(reader, wallet.binding),
      this.pin(reader, wallet.binding.singleton),
      this.pin(reader, this.config.safeWallet!.module),
    ]);
    for (const method of ['enableModule', 'setFallbackHandler'] as const) {
      await authority();
      const call = async (name: string, args: unknown[] = []) =>
        configAbi.decodeFunctionResult(
          name,
          String(
            await reader.call('eth_call', [
              {
                to: wallet.binding.address,
                data: configAbi.encodeFunctionData(name, args),
              },
              'latest',
            ]),
          ),
        );
      const [owners, threshold, singleton, version, modules] =
        await Promise.all([
          call('getOwners'),
          call('getThreshold'),
          call('masterCopy'),
          call('VERSION'),
          call('getModulesPaginated', [sentinel, 2]),
        ]);
      if (
        owners[0].length !== 1 ||
        String(owners[0][0]).toLowerCase() !==
          wallet.signer.address.toLowerCase() ||
        threshold[0] !== 1n ||
        String(singleton[0]).toLowerCase() !==
          wallet.binding.singleton.address.toLowerCase() ||
        version[0] !== '1.4.1' ||
        String(modules[1]).toLowerCase() !== sentinel ||
        modules[0].length > 1 ||
        (modules[0].length === 1 &&
          String(modules[0][0]).toLowerCase() !==
            this.config.safeWallet!.module.address.toLowerCase())
      )
        deny();
      const [rawHandler, guard] = await Promise.all([
        reader.call('eth_getStorageAt', [
          wallet.binding.address,
          keccak256(
            new TextEncoder().encode('fallback_manager.handler.address'),
          ),
          'latest',
        ]),
        reader.call('eth_getStorageAt', [
          wallet.binding.address,
          keccak256(new TextEncoder().encode('guard_manager.guard.address')),
          'latest',
        ]),
      ]);
      const handler = String(rawHandler);
      const expected =
        '0x' +
        '0'.repeat(24) +
        this.config.safeWallet!.module.address.slice(2).toLowerCase();
      const zero = '0x' + '0'.repeat(64);
      if (handler !== zero && handler !== expected) deny();
      if (guard !== zero) deny();
      if (
        (method === 'enableModule' && modules[0].length === 1) ||
        (method === 'setFallbackHandler' && handler === expected)
      )
        continue;
      const nonce = String((await call('nonce'))[0]);
      const data = configAbi.encodeFunctionData(method, [
        this.config.safeWallet!.module.address,
      ]);
      const action = moduleSetupAction(
        wallet.binding.address,
        wallet.signer.address,
        this.config.safeWallet!.module.address,
        method,
        nonce,
        new Date(Date.now() + 300000).toISOString(),
        randomUUID(),
        this.config.network,
      );
      await authority();
      const purpose = method + '-' + wallet.accountId;
      const stored = await this.transaction((r) => {
        const signatures = (r.safeWalletInfrastructure![
          applicationId
        ].setupSignatures ??= {});
        const existing = signatures[purpose];
        if (existing && existing.action.payload_hash !== action.payload_hash)
          deny();
        return (signatures[purpose] ??= {
          action,
          attemptId: randomUUID(),
          state: 'prepared',
        });
      });
      if (Date.parse(stored.action.expires_at) <= Date.now()) deny();
      let signature: string;
      if (stored.state === 'signed' && stored.signature)
        signature = this.cipher.open(stored.signature);
      else {
        await this.transaction((r) => {
          const phase =
            r.safeWalletInfrastructure![applicationId].setupSignatures![
              purpose
            ];
          if (phase.state !== 'prepared') throw pending();
          phase.state = 'dispatch';
        });
        await authority();
        signature = await this.backend.signTypedData(
          wallet.signer,
          stored.action,
          stored.attemptId,
        );
        await this.transaction((r) => {
          const phase =
            r.safeWalletInfrastructure![applicationId].setupSignatures![
              purpose
            ];
          if (
            phase.state !== 'dispatch' ||
            phase.action.payload_hash !== stored.action.payload_hash
          )
            deny();
          phase.signature = this.seal(
            applicationId,
            purpose + '-signature',
            signature,
          );
          phase.state = 'signed';
        });
      }
      await this.send(
        applicationId,
        method + '-' + wallet.accountId,
        {
          to: wallet.binding.address,
          data: moduleSetupCallData(
            stored.action,
            signature,
            wallet.binding.address,
            this.config.safeWallet!.module.address,
          ),
          value: '0',
        },
        async () => {
          await authority();
        },
      );
    }
  }
  private async publishBundler(applicationId: string) {
    return this.exclusive('publication:' + applicationId, () =>
      this.writeBundler(applicationId),
    );
  }
  private async writeBundler(applicationId: string) {
    const infrastructure = await this.current(applicationId),
      urls = await this.resources.rpcEndpoints(applicationId);
    if (!infrastructure.paymaster) deny();
    const accounts = await this.transaction((r, state) =>
      Object.values(r.safeWalletAccounts ?? {})
        .filter(
          (a) =>
            (a.applicationId === applicationId ||
              this.onboarding.hasSharedWalletAccess(
                state,
                applicationId,
                a.accountId,
              )) &&
            a.status === 'ready',
        )
        .map((a) => a.binding.address),
    );
    const root = resolve(
      this.directory,
      this.config.safeWallet!.runtimeDirectory,
    );
    await mkdir(root, { recursive: true, mode: 0o700 });
    const path = resolve(root, applicationId + '.json');
    await writeFile(
      path + '.tmp',
      JSON.stringify({
        applicationId,
        authorization: this.authorization,
        entryPoint: this.domain.entryPoint,
        paymaster: infrastructure.paymaster!.address,
        accounts,
        executorKey: this.cipher.open(infrastructure.executor.key),
        chainId: this.domain.chainId,
        genesisHash: this.config.safeWallet!.genesisHash,
        rpcUrls: urls,
      }),
      { mode: 0o600 },
    );
    await rename(path + '.tmp', path);
  }
  private transport(applicationId: string): typeof fetch {
    return (async (url, init) => {
      if (String(url) !== internalBundler + '/rpc/' + applicationId)
        return this.request(url, init);
      return this.request('http://bundler:3000/rpc/' + applicationId, init);
    }) as typeof fetch;
  }
  private configGas() {
    return {
      callGasLimit: '0x493e0',
      verificationGasLimit: '0x493e0',
      preVerificationGas: '0x493e0',
    };
  }
  async driver(applicationId: string, accountId: string) {
    await this.transaction((r, state) => {
      const wallet = r.safeWalletAccounts?.[accountId];
      if (
        !wallet ||
        (wallet.applicationId !== applicationId &&
          !this.onboarding.hasSharedWalletAccess(
            state,
            applicationId,
            accountId,
          )) ||
        wallet.status !== 'ready'
      )
        deny();
    });
    const driverKey = applicationId + ':' + accountId;
    const existing = this.drivers.get(driverKey);
    if (existing) return existing;
    await this.publishBundler(applicationId);
    const infra = await this.current(applicationId),
      agreement = await this.agreement(applicationId);
    const application =
      this.config.policy.applications.find(
        (a) => runtimeApplicationId(a.issuer, a.clientId) === applicationId,
      ) ?? deny();
    const accounts = await this.transaction((r, state) =>
      Object.values(r.safeWalletAccounts ?? {})
        .filter(
          (a) =>
            (a.applicationId === applicationId ||
              this.onboarding.hasSharedWalletAccess(
                state,
                applicationId,
                accountId,
              )) &&
            a.accountId === accountId &&
            a.status === 'ready',
        )
        .map((a) => a.binding),
    );
    const bundler = {
      profile: 'safe4337-bundler-v07' as const,
      url: internalBundler + '/rpc/' + applicationId,
      maxLogRange: 1000,
    };
    let signing: Safe4337SigningService;
    const transport = createLocalPaymasterTransport(
      {
        domain: this.domain,
        paymaster: infra.paymaster?.address ?? deny(),
        signer: infra.paymasterSigner.address,
        maximumVerificationGas: '0x186a0',
        maximumPostOpGas: '0xc350',
        maximumCostWei: agreement.maximum_gas_budget_wei,
        l1FeeReserveWei: '1000000000000',
        authorize: (request) => signing.authorizeLocalPaymaster(request),
        sign: async (hash, request) => {
          await signing.authorizeLocalPaymaster(request);
          return new Wallet(
            this.cipher.open(infra.paymasterSigner.key),
          ).signMessage(getBytes(hash));
        },
      },
      this.transport(applicationId),
    );
    bindRpcTransport(transport, this.request);
    const basePolicy = { ...this.config.approvedCalls!.policy, accounts };
    signing = new Safe4337SigningService(
      this.actions,
      this.database,
      {
        submissionBinding: userOperationExecutionBinding(bundler),
        acceptance: await this.acceptance(applicationId),
        basePolicy,
        sponsors: [
          {
            clientId: application.clientId,
            lifetimeBudgetWei: agreement.maximum_gas_budget_wei,
          },
        ],
        maxValiditySeconds: Math.min(
          300,
          this.config.approvedCalls!.maxValiditySeconds,
        ),
        paymaster: {
          url: localPaymasterUrl,
          maximumVerificationGas: '0x186a0',
          maximumPostOpGas: '0xc350',
          l1FeeReserveWei: '1000000000000',
        },
      },
      {
        backend: this.backend,
        authorization: async () => 'Bearer ' + this.authorization,
        authorizeSponsorship: async (context, terms) => {
          const current = await this.agreement(applicationId);
          if (
            current.funding_agreement !== agreement.funding_agreement ||
            current.maximum_gas_budget_wei !==
              agreement.maximum_gas_budget_wei ||
            terms.preparation.runtimePolicy.application_id !== applicationId
          )
            return null;
          return this.actions.withAuthorizedCalls(
            context.principal,
            terms.operationId,
            (_state, record) => ({
              termsHash: fingerprint(terms),
              consentReference: record.approval.consentReference,
            }),
          );
        },
      },
      transport,
    );
    const execution = new UserOperationExecutionCoordinator(
      this.actions,
      this.database,
      signing,
      bundler,
      async () => 'Bearer ' + this.authorization,
      transport,
    );
    const driver = new UserOperationWalletCallsDriver(
      this.actions,
      this.database,
      execution,
      {
        gas: {
          callGasLimit: '0x493e0',
          verificationGasLimit: '0x493e0',
          preVerificationGas: '0x493e0',
          maxFeePerGas: '0x3b9aca00',
          maxPriorityFeePerGas: '0x3b9aca00',
        },
        maxDepthPerSafe: 10,
        maxWaitSeconds: 120,
        pollIntervalSeconds: 1,
        maxConcurrentAccounts: 10,
        maxDepthTotal: 100,
      },
      async () => {
        const fees = await this.networkFees(applicationId);
        return {
          maxFeePerGas: toQuantity(BigInt(fees.maxFeePerGas)),
          maxPriorityFeePerGas: toQuantity(BigInt(fees.maxPriorityFeePerGas)),
        };
      },
      (work) => this.prepare(work),
      async (operation) => {
        const dummy = await Wallet.createRandom().signMessage(
          'Safe wallet gas estimation',
        );
        const signature = solidityPacked(
          ['uint48', 'uint48', 'bytes'],
          [0, Math.floor(Date.now() / 1000) + 120, dummy],
        );
        const paymasterData = solidityPacked(
          ['uint8', 'uint48', 'uint48', 'bytes'],
          [1, Math.floor(Date.now() / 1000) + 120, 0, dummy],
        );
        const id = randomUUID();
        const response = await this.transport(applicationId)(bundler.url, {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + this.authorization,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            method: 'eth_estimateUserOperationGas',
            params: [
              {
                ...operation,
                paymaster: infra.paymaster!.address,
                paymasterData,
                paymasterVerificationGasLimit: '0x186a0',
                paymasterPostOpGasLimit: '0xc350',
                signature,
              },
              this.domain.entryPoint,
            ],
          }),
          signal: AbortSignal.timeout(15000),
        });
        const estimate = readUserOperationGasEstimate(
          response.ok,
          await response.json(),
          id,
        );
        const accepted = await this.agreement(applicationId);
        const ceilings = this.configGas();
        if (accepted.gas_limits)
          ceilings.callGasLimit = toQuantity(
            BigInt(accepted.gas_limits.gas_limit),
          );
        return applyEstimatedUserOperationGas(
          operation,
          estimate,
          ceilings,
          accepted.gas_limits?.gas_limit,
        );
      },
      (delay) => this.scheduleWallets(delay),
    );
    driver.subscribe((batchId) => {
      for (const listener of this.listeners) listener(batchId);
    });
    this.drivers.set(driverKey, driver);
    if (!this.stopped) driver.start();
    return driver;
  }
  walletDriver(): WalletCallsDriver {
    const get = async (principal: VerifiedPrincipal, accountId: string) => {
      await this.onboarding.withAccountAccess(
        principal,
        accountId,
        'account:read',
        () => true,
      );
      return this.driver(
        runtimeApplicationId(principal.issuer, principal.clientId),
        accountId,
      );
    };
    return {
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      },
      handles: () => true,
      capabilities: async (principal, id) =>
        (await get(principal, id)).capabilities(principal, id),
      acceptPaymaster: (value) => {
        if (value !== undefined) deny();
      },
      assertSize: async (principal, input) =>
        (await get(principal, input.account_id)).assertSize(principal, input),
      enqueue: async (context, input, metadata) =>
        (await get(context.principal, input.account_id)).enqueue(
          context,
          input,
          metadata,
        ),
      status: async (principal, accountId, id, refresh) =>
        (await get(principal, accountId)).status(
          principal,
          accountId,
          id,
          refresh,
        ),
      list: async (principal, authorize) => {
        const wallets = await this.transaction((r) =>
          Object.values(r.safeWalletAccounts ?? {}).filter(
            (a) => a.status === 'ready',
          ),
        );
        const shared = await this.onboarding.store.transaction((state) =>
          Object.values(state.grants)
            .filter(
              (grant) =>
                (state.requests[grant.requestId]?.sharing ||
                  state.requests[grant.requestId]?.membership) &&
                (authorize ||
                  (grant.caller.issuer === principal.issuer &&
                    grant.caller.clientId === principal.clientId)),
            )
            .map((grant) => ({
              accountId: grant.accountId,
              applicationId: runtimeApplicationId(
                grant.caller.issuer,
                grant.caller.clientId,
              ),
            }))
            .filter(
              (link) =>
                wallets.some((wallet) => wallet.accountId === link.accountId) &&
                this.onboarding.hasSharedWalletAccess(
                  state,
                  link.applicationId,
                  link.accountId,
                ),
            ),
        );
        const readers = new Map(
          [...wallets, ...shared].map((wallet) => [
            wallet.applicationId + ':' + wallet.accountId,
            wallet,
          ]),
        );
        const results = await Promise.all(
          [...readers.values()].map(async (wallet) =>
            (await this.driver(wallet.applicationId, wallet.accountId)).list(
              principal,
              authorize,
            ),
          ),
        );
        return {
          truncated: results.some((r) => r.truncated),
          batches: results.flatMap((r) => r.batches),
        };
      },
    };
  }
  async start() {
    const wallets = await this.transaction((r) =>
      Object.values(r.safeWalletAccounts ?? {}).filter(
        (a) => a.status === 'ready',
      ),
    );
    for (const applicationId of new Set(
      wallets.map((wallet) => wallet.applicationId),
    ))
      await this.publishBundler(applicationId);
    for (const wallet of wallets)
      await this.driver(wallet.applicationId, wallet.accountId);
    const shared = await this.onboarding.store.transaction((state) =>
      Object.values(state.grants)
        .filter(
          (grant) =>
            state.requests[grant.requestId]?.sharing ||
            state.requests[grant.requestId]?.membership,
        )
        .map((grant) => ({
          accountId: grant.accountId,
          applicationId: runtimeApplicationId(
            grant.caller.issuer,
            grant.caller.clientId,
          ),
        }))
        .filter(
          (link) =>
            wallets.some((wallet) => wallet.accountId === link.accountId) &&
            this.onboarding.hasSharedWalletAccess(
              state,
              link.applicationId,
              link.accountId,
            ),
        ),
    );
    for (const link of shared)
      await this.driver(link.applicationId, link.accountId);
    const tick = () => {
      if (this.stopped) return;
      this.timer = setTimeout(() => {
        this.replenishing = this.transaction((r) =>
          Object.keys(r.safeWalletInfrastructure ?? {}),
        )
          .then(async (ids) => {
            for (const id of ids) {
              try {
                await this.exclusive(id, async () => {
                  await this.replenish(id);
                });
              } catch {
                /* Each application's funding observation retains its own failure. */
              }
            }
          })
          .catch(() => undefined)
          .finally(() => {
            this.replenishing = undefined;
            tick();
          });
      }, 10000);
      this.timer.unref();
    };
    tick();
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.walletTimer);
    await this.walletTick;
    await Promise.allSettled([...this.walletRuns.values()]);
    await this.replenishing;
    await this.settlement;
    await Promise.all(
      [...this.drivers.values()].map((driver) => driver.stop()),
    );
  }
}
