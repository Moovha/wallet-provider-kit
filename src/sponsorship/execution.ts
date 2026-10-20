import { randomUUID } from 'node:crypto';
import { WalletProviderError } from '../domain/signing.js';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type { SupportedActions } from '../deployment/actions.js';
import type { ProviderDatabase } from '../storage/index.js';
import { deny } from '../onboarding/policy.js';
import { serviceHash } from '../executor/auth.js';
import { Safe4337SigningService } from './signing.js';
import {
  createBundlerClientV07,
  validateBundlerConfiguration,
  signedUserOperationHash,
  type BundlerConfigurationV07,
} from './bundler.js';
import { UserOperationReceiptObserver } from './receipts.js';
import type { UserOperationExecution } from './execution-types.js';

export function userOperationExecutionBinding(config: BundlerConfigurationV07) {
  validateBundlerConfiguration(config);
  return serviceHash(config);
}
function planHash(plan: UserOperationExecution) {
  const {
    planHash: _,
    dispatch: __,
    observation: ___,
    observationRevision: ____,
    ...identity
  } = plan;
  return serviceHash(identity);
}
/** One durable bundler dispatch per admitted operation. Recovery only reads independent chain evidence. */
export class UserOperationExecutionCoordinator {
  readonly configurationHash: string;
  private readonly listeners = new Set<(id: string) => void>();
  private readonly refreshing = new Map<
    string,
    Promise<UserOperationExecution | null>
  >();
  subscribe(listener: (id: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readonly client: ReturnType<typeof createBundlerClientV07>;
  private readonly observer: UserOperationReceiptObserver;
  private readonly binding: ReturnType<
    Safe4337SigningService['executionBinding']
  >;
  constructor(
    readonly actions: SupportedActions,
    private readonly database: ProviderDatabase,
    readonly signing: Safe4337SigningService,
    configuration: BundlerConfigurationV07,
    authorization: () => Promise<string>,
    request: typeof fetch = fetch,
  ) {
    this.configurationHash = userOperationExecutionBinding(configuration);
    this.binding = signing.executionBinding();
    if (this.binding.submissionBinding !== this.configurationHash)
      throw new WalletProviderError('wallet_provider_configuration');
    this.client = createBundlerClientV07(
      configuration,
      this.binding.acceptance.domain,
      authorization,
      request,
    );
    this.observer = new UserOperationReceiptObserver(
      this.binding.acceptance,
      configuration.maxLogRange,
      request,
    );
  }
  private check(plan: UserOperationExecution) {
    const sponsorship = this.database.sponsorship.load(plan.operationId);
    if (
      plan.configurationHash !== this.configurationHash ||
      plan.planHash !== planHash(plan) ||
      plan.userOperationHash !==
        signedUserOperationHash(
          plan.operation,
          this.binding.acceptance.domain,
        ) ||
      !sponsorship ||
      plan.sponsorshipHash !== sponsorship.termsHash ||
      sponsorship.configurationHash !== this.binding.configurationHash
    )
      throw new WalletProviderError('wallet_attempt_unavailable', 'unknown');
  }
  async load(id: string) {
    const plan = await this.actions.onboarding.store.transaction(
      (state) => state.userOperationExecutions?.[id] ?? null,
    );
    if (plan) this.check(plan);
    return plan;
  }
  private async timestamp(id: string, field: string) {
    await this.actions.onboarding.store.transaction((state) => {
      for (const batch of Object.values(state.userOperationBatches ?? {})) {
        if (
          batch.operationId === id &&
          batch.revision === this.actions.revision
        )
          (batch.timings ??= {})[field] ??= new Date().toISOString();
      }
    });
  }
  async execute(context: AuthorityContext, id: string) {
    context = structuredClone(context);
    if (!context.principal.scopes.includes('wallet:execute')) deny();
    const existing = await this.load(id);
    if (existing?.dispatch) {
      await this.signing.withExecutionRead(context.principal, id, () => true);
      return this.refresh(id);
    }
    if (!existing) {
      const [, anchor] = await Promise.all([
        this.client.ready(),
        this.observer.anchor(),
      ]);
      await this.timestamp(id, 'sponsorship_started_at');
      await this.signing.sponsor(context, id);
      await this.timestamp(id, 'paymaster_signed_at');
      await this.timestamp(id, 'signing_started_at');
      const operation = await this.signing.sign(context, id),
        record = this.database.sponsorship.load(id) ?? deny();
      await this.timestamp(id, 'signed_at');
      await this.signing.authorizeSubmission(context, id, false);
      await this.actions.withAuthorizedTransfer(
        context.principal,
        id,
        (state, source) => {
          const plans = (state.userOperationExecutions ??= {});
          if (plans[id]) return;
          const plan: UserOperationExecution = {
            operationId: id,
            configurationHash: this.configurationHash,
            sponsorshipHash: record.termsHash,
            operation,
            intent: source.intent ?? deny(),
            userOperationHash: signedUserOperationHash(
              operation,
              this.binding.acceptance.domain,
            ),
            scanFromBlock: anchor,
            planHash: '',
            observation: {
              state: 'pending',
              observedAt: new Date().toISOString(),
              scanNextBlock: anchor,
            },
            observationRevision: 0,
          };
          plan.planHash = planHash(plan);
          plans[id] = plan;
        },
      );
    }
    await this.signing.authorizeSubmission(context, id, false);
    const plan = (await this.load(id)) ?? deny();
    let token: string | undefined;
    try {
      await this.timestamp(id, 'submission_started_at');
      await this.client.send(plan.operation, async () => {
        // Unavailable preflight reads leave no dispatch claim and can be retried.
        await this.signing.authorizeSubmission(context, id);
        token = await this.actions.withAuthorizedTransfer(
          context.principal,
          id,
          (state) => {
            const current = state.userOperationExecutions?.[id] ?? deny();
            this.check(current);
            if (current.dispatch)
              throw new WalletProviderError(
                'wallet_attempt_unavailable',
                'unknown',
              );
            const dispatch = {
              token: randomUUID(),
              expiresAt: Date.now() + 30000,
              state: 'dispatch' as const,
            };
            current.dispatch = dispatch;
            return dispatch.token;
          },
        );
      });
      await this.timestamp(id, 'accepted_at');
      await this.finish(id, token ?? deny(), 'accepted');
    } catch (error) {
      if (!token) throw error;
      await this.finish(id, token, 'unknown');
      // A rejected, malformed or lost response retains the dispatch claim.
    }
    return this.refresh(id);
  }
  private async finish(
    id: string,
    token: string,
    state: 'accepted' | 'unknown',
  ) {
    await this.actions.onboarding.store.transaction((store) => {
      const plan = store.userOperationExecutions?.[id] ?? deny();
      this.check(plan);
      if (plan.dispatch?.token !== token || plan.dispatch.state !== 'dispatch')
        throw new WalletProviderError('wallet_attempt_unavailable', 'unknown');
      plan.dispatch.state =
        plan.dispatch.expiresAt > Date.now() ? state : 'unknown';
    });
  }
  async refresh(id: string) {
    const existing = this.refreshing.get(id);
    if (existing) return existing;
    const running = this.observe(id).finally(() => {
      if (this.refreshing.get(id) === running) this.refreshing.delete(id);
    });
    this.refreshing.set(id, running);
    return running;
  }
  private async observe(id: string) {
    const before = await this.load(id);
    if (!before) return null;
    let hint: string | undefined = before.observation.receipt?.transactionHash;
    try {
      hint ??= await this.client.transactionHint(before.userOperationHash);
    } catch {
      /* Bundler lookup is a hint; independent log scans remain available. */
    }
    const record = this.database.sponsorship.load(id) ?? deny();
    const observation = await this.observer.observe(
      before,
      record.maximumCostWei,
      hint,
    );
    await this.actions.onboarding.store.transaction((state) => {
      const current = state.userOperationExecutions?.[id] ?? deny();
      this.check(current);
      if (current.observationRevision !== before.observationRevision) return;
      current.observation = observation;
      current.observationRevision++;
    });
    if (
      observation.receipt &&
      ['included', 'safe', 'finalized'].includes(observation.state)
    )
      await this.timestamp(id, 'included_at');
    if (
      serviceHash([
        before.observation.state,
        before.observation.receipt ?? null,
      ]) !== serviceHash([observation.state, observation.receipt ?? null])
    )
      for (const listener of this.listeners) listener(id);
    return this.load(id);
  }
  async read(principal: VerifiedPrincipal, id: string) {
    await this.signing.withExecutionRead(principal, id, () => true);
    return this.load(id);
  }
}
