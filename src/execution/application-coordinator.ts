import type { VerifiedPrincipal } from '../domain/principal.js';
import { deny } from '../onboarding/policy.js';
import type { ProviderDatabase } from '../storage/index.js';
import { runtimeApplicationId } from '../runtime-configuration/service.js';
import { ApprovedExecutionCoordinator } from './coordinator.js';

export type ExecutionCoordinatorPort = Pick<
  ApprovedExecutionCoordinator,
  | 'profile'
  | 'nonceCancellationEnabled'
  | 'assertWalletCallsSize'
  | 'execute'
  | 'authorizeRemote'
  | 'read'
  | 'reconcile'
  | 'events'
  | 'refresh'
  | 'start'
  | 'close'
>;
/** One immutable sponsor configuration per application; the global worker performs observations only. */
export class ApplicationExecutionCoordinator implements ExecutionCoordinatorPort {
  readonly profile = 'approved-evm-executor-v1' as const;
  readonly nonceCancellationEnabled = false;
  private readonly instances = new Map<
    string,
    Promise<ApprovedExecutionCoordinator>
  >();
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  private cursor = 0;
  constructor(
    private readonly database: ProviderDatabase,
    private readonly revision: string,
    private readonly intervalSeconds: number,
    private readonly create: (
      applicationId: string,
    ) => Promise<ApprovedExecutionCoordinator>,
  ) {}
  private async selected(
    principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>,
  ) {
    const id = runtimeApplicationId(principal.issuer, principal.clientId);
    let instance = this.instances.get(id);
    if (!instance) {
      instance = this.create(id);
      this.instances.set(id, instance);
      void instance.catch(() => {
        if (this.instances.get(id) === instance) this.instances.delete(id);
      });
    }
    return instance;
  }
  async assertWalletCallsSize(
    ...args: Parameters<ApprovedExecutionCoordinator['assertWalletCallsSize']>
  ) {
    return (await this.selected(args[0])).assertWalletCallsSize(...args);
  }
  async execute(...args: Parameters<ApprovedExecutionCoordinator['execute']>) {
    return (await this.selected(args[0].principal)).execute(...args);
  }
  async read(...args: Parameters<ApprovedExecutionCoordinator['read']>) {
    return (await this.selected(args[0])).read(...args);
  }
  async reconcile(
    ...args: Parameters<ApprovedExecutionCoordinator['reconcile']>
  ) {
    return (await this.selected(args[0].principal)).reconcile(...args);
  }
  async events(...args: Parameters<ApprovedExecutionCoordinator['events']>) {
    return (await this.selected(args[0])).events(...args);
  }
  async authorizeRemote(): Promise<never> {
    return deny();
  }
  async refresh(id: string) {
    const caller = await this.database.onboardingStore.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.revision
      )
        deny();
      return state.supportedActions?.[id]?.approval.caller ?? deny();
    });
    return (await this.selected(caller)).refresh(id);
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const tick = async () => {
      try {
        const ids = await this.database.onboardingStore.transaction((state) => {
          if (
            state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.revision
          )
            return [];
          return Object.entries(state.supportedActions ?? {})
            .filter(
              ([, r]) =>
                r.execution?.plan &&
                !r.cancellationId &&
                !r.execution.integrityFailure &&
                r.execution.observation?.chain_status !== 'finalized',
            )
            .map(([id]) => id);
        });
        const selected = ids.length
          ? Array.from(
              { length: Math.min(4, ids.length) },
              (_, i) => ids[(this.cursor + i) % ids.length],
            )
          : [];
        this.cursor = ids.length
          ? (this.cursor + selected.length) % ids.length
          : 0;
        await Promise.allSettled(selected.map((id) => this.refresh(id)));
      } catch {
        /* Retained submissions remain eligible for later read-only observation. */
      }
      if (!this.stopped) schedule();
    };
    const schedule = () => {
      this.timer = setTimeout(() => {
        this.running = tick();
      }, this.intervalSeconds * 1000);
      this.timer.unref();
    };
    schedule();
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
    await Promise.allSettled(
      [...this.instances.values()].map(async (instance) =>
        (await instance).close(),
      ),
    );
  }
}
