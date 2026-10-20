import { createRpcObserver } from '../execution/single-rpc.js';
import { quoteNetworkFees } from '../execution/network-fees.js';
import { RpcReader } from '../execution/chain.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import { fingerprint, deny } from '../onboarding/policy.js';
import type { OnboardingStore } from '../onboarding/types.js';
import type { ProviderNetwork } from '../networks.js';
import { QuorumExecutionObserver } from '../execution/chain.js';
import type {
  ExecutionObserver,
  ExecutionConfiguration,
  TransferExecutionPlan,
} from '../execution/types.js';
import type { SafeAccountBinding } from '../execution/approved-calls.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
} from './service.js';

/** Each chain observation uses the application's reviewed credentials, without a provider-billed fallback. */
export class ApplicationExecutionObserver implements ExecutionObserver {
  private readonly observers = new Map<
    string,
    { hash: string; observer: ReturnType<typeof createRpcObserver> }
  >();
  constructor(
    private readonly resources: RuntimeConfigurationService,
    private readonly store: OnboardingStore,
    private readonly config: ExecutionConfiguration,
    private readonly network?: ProviderNetwork,
    private readonly request: typeof fetch = fetch,
    private readonly networkFeePricing = false,
  ) {}
  private async selected(applicationId: string) {
    const endpoints = await this.resources.rpcEndpoints(applicationId);
    const hash = fingerprint([endpoints, this.resources.rpcVerification]);
    const cached = this.observers.get(applicationId);
    if (cached?.hash === hash) return cached.observer;
    const observer = createRpcObserver(
      endpoints,
      this.config.rpc.genesisHash,
      this.config.maxLogRange,
      this.request,
      this.network,
      this.resources.rpcVerification,
      this.networkFeePricing,
      this.networkFeePricing,
    );
    this.observers.set(applicationId, { hash, observer });
    return observer;
  }
  private async plan(plan: TransferExecutionPlan) {
    const applicationId = plan.runtimePolicy?.application_id;
    if (!applicationId) deny();
    return this.selected(applicationId);
  }
  async subscribe(plan: TransferExecutionPlan, wake: () => void) {
    const observer: ExecutionObserver = await this.plan(plan);
    return observer.subscribe ? observer.subscribe(plan, wake) : () => {};
  }
  async quoteFees(
    sponsor: import('../execution/types.js').ExecutionSponsor,
    principal: VerifiedPrincipal,
  ) {
    if (!this.networkFeePricing) return undefined;
    return (await this.anchorWithFees(sponsor, principal)).networkFees;
  }
  async anchorWithFees(
    sponsor: import('../execution/types.js').ExecutionSponsor,
    principal: VerifiedPrincipal,
  ) {
    if (!this.networkFeePricing)
      return {
        scanFromBlock: await this.anchor(principal),
        networkFees: undefined,
      };
    return this.resources.withRpc(
      runtimeApplicationId(principal.issuer, principal.clientId),
      async (endpoints) => {
        const observer = createRpcObserver(
          endpoints,
          this.config.rpc.genesisHash,
          this.config.maxLogRange,
          this.request,
          this.network,
          this.resources.rpcVerification,
          this.networkFeePricing,
        );
        const [scanFromBlock, networkFees] = await Promise.all([
          observer.anchor(),
          quoteNetworkFees(
            new RpcReader(
              endpoints[0],
              this.request,
              4,
              this.networkFeePricing,
              this.resources.rpcVerification === 'single'
                ? 'endpoint-failover'
                : 'bounded',
            ),
            sponsor,
          ),
        ]);
        return { scanFromBlock, networkFees };
      },
      this.request,
    );
  }
  async anchor(principal?: VerifiedPrincipal) {
    if (!principal) deny();
    return (
      await this.selected(
        runtimeApplicationId(principal.issuer, principal.clientId),
      )
    ).anchor();
  }
  async preflightUnsigned(plan: TransferExecutionPlan) {
    return (await this.plan(plan)).preflightUnsigned(plan);
  }
  async preflight(plan: TransferExecutionPlan) {
    return (await this.plan(plan)).preflight(plan);
  }
  async observeFresh(
    ...args: Parameters<QuorumExecutionObserver['observeFresh']>
  ) {
    return (await this.plan(args[0])).observeFresh(...args);
  }
  async recheckInclusion(
    ...args: Parameters<QuorumExecutionObserver['recheckInclusion']>
  ) {
    return (await this.plan(args[0])).recheckInclusion(...args);
  }
  async observe(...args: Parameters<QuorumExecutionObserver['observe']>) {
    return (await this.plan(args[0])).observe(...args);
  }
  async nonceSnapshot(
    ...args: Parameters<QuorumExecutionObserver['nonceSnapshot']>
  ) {
    return (await this.plan(args[0])).nonceSnapshot(...args);
  }
  async contractNonce(
    binding: SafeAccountBinding,
    owner: string,
    principal?: VerifiedPrincipal,
  ) {
    if (!principal) deny();
    const applicationId = await this.store.transaction((state) => {
      const record = Object.values(
        state.deploymentBindings?.['service-v1']?.safeAccounts ?? {},
      ).find(
        (record) =>
          record.plan.address.toLowerCase() === binding.address.toLowerCase(),
      );
      if (
        !record ||
        record.plan.address.toLowerCase() !== binding.address.toLowerCase() ||
        record.plan.owner.toLowerCase() !== owner.toLowerCase()
      )
        deny();
      return runtimeApplicationId(principal.issuer, principal.clientId);
    });
    const observer = await this.selected(applicationId);
    return this.networkFeePricing
      ? observer.actionNonce(binding)
      : observer.contractNonce(binding, owner);
  }
  async payerBalance(sponsor: string) {
    const clientId = this.config.sponsors.find(
      (s) => s.binding.address.toLowerCase() === sponsor.toLowerCase(),
    )?.clientId;
    const app = this.resources.onboardingPolicy.applications.find(
      (a) => a.enabled !== false && a.clientId === clientId,
    );
    if (!app) deny();
    return (
      await this.selected(runtimeApplicationId(app.issuer, app.clientId))
    ).payerBalance(sponsor);
  }
}
