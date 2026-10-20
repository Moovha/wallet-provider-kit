import { ObservationWorker } from './observation-worker.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import { observationDue } from './inclusion.js';
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
> & { subscribe?: (listener: (id: string) => void) => () => void };
/** One immutable sponsor configuration per application; the global worker performs observations only. */
export class ApplicationExecutionCoordinator implements ExecutionCoordinatorPort {
  readonly profile = 'approved-evm-executor-v1' as const;
  private readonly instances = new Map<
    string,
    Promise<ApprovedExecutionCoordinator>
  >();
  private worker?: ObservationWorker;
  private readonly listeners = new Set<(id: string) => void>();
  subscribe(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readonly configurationRevisions = new Map<string, string>();
  constructor(
    private readonly database: ProviderDatabase,
    private readonly revision: string,
    private readonly intervalSeconds: number,
    private readonly create: (
      applicationId: string,
    ) => Promise<ApprovedExecutionCoordinator>,
    readonly nonceCancellationEnabled = false,
    private readonly configurationRevision?: (
      applicationId: string,
    ) => Promise<string>,
  ) {}
  private async selected(
    principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>,
  ) {
    const id = runtimeApplicationId(principal.issuer, principal.clientId);
    if (this.configurationRevision) {
      const revision = await this.configurationRevision(id);
      if (this.configurationRevisions.get(id) !== revision) {
        const previous = this.instances.get(id);
        this.instances.delete(id);
        if (previous)
          void previous
            .then((coordinator) => coordinator.close())
            .catch(() => {});
        this.configurationRevisions.set(id, revision);
      }
    }
    let instance = this.instances.get(id);
    if (!instance) {
      instance = this.create(id).then((coordinator) => {
        coordinator.setObservationWake(() => this.worker?.hint());
        coordinator.subscribe((actionId) => {
          for (const listener of this.listeners) listener(actionId);
        });
        return coordinator;
      });
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
  start(): void {
    if (this.worker) return;
    this.worker = new ObservationWorker(
      async () =>
        this.database.onboardingStore.transaction((state) => {
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
                observationDue(r.execution),
            )
            .map(([id, r]) => ({ id, execution: r.execution! }));
        }),
      (id) => this.refresh(id),
      this.intervalSeconds * 1000,
    );
    this.worker.start();
  }
  async close() {
    this.listeners.clear();
    await this.worker?.close();
    this.worker = undefined;
    await Promise.allSettled(
      [...this.instances.values()].map(async (instance) =>
        (await instance).close(),
      ),
    );
  }
}
