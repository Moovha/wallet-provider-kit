import { executionPlanHash } from '../executor/protocol.js';
import { WalletCallsError } from '../wallet-calls/errors.js';
import type { WalletCallsMetadata } from '../wallet-calls/types.js';
import type { ProviderState } from '../onboarding/types.js';
import { randomUUID } from 'node:crypto';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import type { SupportedActions } from '../deployment/actions.js';
import type { ProviderDatabase } from '../storage/index.js';
import { deny, fingerprint, uuid } from '../onboarding/policy.js';
import type {
  ApprovedCallInput,
  SafeAccountBinding,
} from './approved-calls.js';
import type { ApprovedExecutionCoordinator } from './coordinator.js';
import type { ExecutionConfiguration } from './types.js';

export interface SafeQueueRecord {
  walletCalls?: WalletCallsMetadata;
  id: string;
  input: ApprovedCallInput;
  principal: VerifiedPrincipal;
  grantId: string;
  owner: string;
  consentReference: string;
  safeAddress: string;
  address: string;
  revision: string;
  expiresAt: string;
  sequence: number;
  actionKey: string;
  executeKey: string;
  identityHash: string;
  actionId?: string;
  status:
    'queued' | 'executing' | 'succeeded' | 'cancelled' | 'expired' | 'blocked';
}
const active = (entry: SafeQueueRecord) =>
  ['queued', 'executing', 'blocked'].includes(entry.status);
function identity(entry: SafeQueueRecord) {
  const {
    identityHash: _hash,
    actionId: _action,
    status: _status,
    ...immutable
  } = entry;
  return fingerprint(immutable);
}
/** Durable FIFO of unsigned requests. Only its head can become an immutable nonce-bound action. */
export class SafeExecutionQueue {
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  private cursor = 0;
  private readonly configuration: NonNullable<
    ExecutionConfiguration['safeQueue']
  >;
  constructor(
    private readonly actions: SupportedActions,
    private readonly database: ProviderDatabase,
    private readonly execution: Pick<
      ApprovedExecutionCoordinator,
      'refresh' | 'execute'
    >,
    private readonly nonce: (
      binding: SafeAccountBinding,
      owner: string,
      principal?: VerifiedPrincipal,
    ) => Promise<string>,
    configuration: NonNullable<ExecutionConfiguration['safeQueue']>,
    private readonly pollIntervalSeconds: number,
  ) {
    if (
      !Number.isInteger(configuration.maxDepthPerSafe) ||
      configuration.maxDepthPerSafe < 1 ||
      configuration.maxDepthPerSafe > 100 ||
      !Number.isInteger(configuration.maxWaitSeconds) ||
      configuration.maxWaitSeconds < 30 ||
      configuration.maxWaitSeconds > 3600 ||
      !Number.isInteger(pollIntervalSeconds) ||
      pollIntervalSeconds < 5 ||
      pollIntervalSeconds > 300
    )
      throw new WalletProviderError('wallet_provider_configuration');
    this.configuration = structuredClone(configuration);
  }
  private checkAction(state: ProviderState, entry: SafeQueueRecord) {
    const key = fingerprint([
      'supported-call',
      entry.principal.issuer,
      entry.principal.subject,
      entry.principal.clientId,
      entry.actionKey,
    ]);
    const binding = state.idempotency[key];
    if (entry.actionId && binding?.id !== entry.actionId) deny();
    if (!binding) return;
    const action = state.supportedActions?.[binding.id];
    if (
      !action ||
      binding.hash !==
        fingerprint([
          entry.input,
          entry.revision,
          ...(action?.runtimePolicy ? [action.runtimePolicy] : []),
        ]) ||
      !action.intent ||
      fingerprint(action.intent.input) !== fingerprint(entry.input) ||
      action.intent.account.address.toLowerCase() !== entry.safeAddress ||
      action.approval.action.action_id !== binding.id ||
      action.approval.action.expires_at !== entry.expiresAt ||
      action.approval.grantId !== entry.grantId ||
      action.approval.ownerSubject !== entry.owner ||
      action.approval.consentReference !== entry.consentReference ||
      action.approval.account.accountId !== entry.input.account_id ||
      action.approval.account.address !== entry.address ||
      fingerprint(action.approval.caller) !==
        fingerprint({
          issuer: entry.principal.issuer,
          subject: entry.principal.subject,
          clientId: entry.principal.clientId,
        }) ||
      action.revision !== entry.revision
    )
      deny();
  }
  private check(entry: SafeQueueRecord) {
    if (
      entry.revision !== this.actions.revision ||
      entry.identityHash !== identity(entry)
    )
      deny();
  }
  private async authorized(
    principal: VerifiedPrincipal,
    entry: SafeQueueRecord,
  ) {
    this.check(entry);
    if (
      fingerprint([principal.issuer, principal.subject, principal.clientId]) !==
      fingerprint([
        entry.principal.issuer,
        entry.principal.subject,
        entry.principal.clientId,
      ])
    )
      deny();
    const current = await this.actions.queueAuthority(
      principal,
      entry.input,
      entry.expiresAt,
    );
    if (
      fingerprint(current) !==
      fingerprint({
        grantId: entry.grantId,
        owner: entry.owner,
        consentReference: entry.consentReference,
        safeAddress: entry.safeAddress,
        address: entry.address,
      })
    )
      deny();
  }
  private receipt(entry: SafeQueueRecord) {
    return {
      request_id: entry.id,
      account_id: entry.input.account_id,
      status: entry.status,
      expires_at: entry.expiresAt,
      ...(entry.actionId ? { action_id: entry.actionId } : {}),
      next_poll_after_ms: this.pollIntervalSeconds * 1000,
    };
  }
  private async load(id: string) {
    if (!uuid.test(id)) deny();
    return this.actions.onboarding.store.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.actions.revision
      )
        deny();
      const entry = state.safeRequests?.[id] ?? deny();
      this.check(entry);
      this.checkAction(state, entry);
      return entry;
    });
  }
  async enqueue(
    context: AuthorityContext,
    input: ApprovedCallInput,
    walletCalls?: WalletCallsMetadata,
  ) {
    context = structuredClone(context);
    input = structuredClone(input);
    walletCalls = walletCalls && structuredClone(walletCalls);
    if (
      !uuid.test(context.idempotencyKey) ||
      !['wallet:actions', 'wallet:sign', 'wallet:execute'].every((scope) =>
        context.principal.scopes.includes(scope),
      )
    )
      deny();
    const key = fingerprint([
      'safe-queue',
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      context.idempotencyKey,
    ]);
    const hash = fingerprint([
      input,
      this.actions.revision,
      ...(walletCalls ? [walletCalls] : []),
    ]);
    const previous = await this.actions.onboarding.store.transaction(
      (state) => state.idempotency[key],
    );
    if (previous) {
      if (previous.hash !== hash)
        throw new WalletProviderError('wallet_attempt_conflict');
      const entry = await this.load(previous.id);
      await this.authorized(context.principal, entry);
      return this.receipt(entry);
    }
    const expiresAt = await this.actions.applicationQueueExpiry(
      context.principal,
      this.configuration.maxWaitSeconds,
    );
    if (input.kind === 'swap' && Number(input.deadline) * 1000 <= Date.now())
      deny();
    const authority = await this.actions.queueAuthority(
      context.principal,
      input,
      expiresAt,
    );
    const entry = await this.actions.onboarding.withAccountAccess(
      context.principal,
      input.account_id,
      'contracts:request',
      (state, grant) => {
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.actions.revision ||
          grant.id !== authority.grantId ||
          grant.owner !== authority.owner ||
          grant.requestId !== authority.consentReference ||
          state.accounts[input.account_id]?.address !== authority.address
        )
          deny();
        const entries = (state.safeRequests ??= {});
        if (walletCalls) {
          const publication = state.requests[grant.requestId]?.runtimePolicy;
          if (
            walletCalls.sender.toLowerCase() !== authority.safeAddress ||
            !publication ||
            publication.policy_hash !== walletCalls.policyHash ||
            publication.revision !== walletCalls.policyRevision
          )
            deny();
          if (
            Object.values(state.userOperationBatches ?? {}).some(
              (entry) =>
                entry.metadata.id === walletCalls.id &&
                entry.metadata.sender.toLowerCase() === authority.safeAddress &&
                entry.context.principal.issuer === context.principal.issuer &&
                entry.context.principal.clientId === context.principal.clientId,
            )
          )
            return undefined;
          if (
            Object.values(entries).some(
              (entry) =>
                entry.walletCalls?.id === walletCalls.id &&
                entry.safeAddress === authority.safeAddress &&
                entry.principal.issuer === context.principal.issuer &&
                entry.principal.clientId === context.principal.clientId,
            )
          )
            return undefined;
        }
        const replay = state.idempotency[key];
        if (replay) {
          if (replay.hash !== hash || !entries[replay.id])
            throw new WalletProviderError('wallet_attempt_conflict');
          return entries[replay.id];
        }
        const lane = Object.values(entries).filter(
          (entry) => entry.safeAddress === authority.safeAddress,
        );
        if (lane.filter(active).length >= this.configuration.maxDepthPerSafe)
          throw new WalletProviderError('wallet_attempt_pending');
        const sequence =
          lane.reduce(
            (maximum, entry) => Math.max(maximum, entry.sequence),
            0,
          ) + 1;
        if (!Number.isSafeInteger(sequence)) deny();
        const entry: SafeQueueRecord = {
          id: randomUUID(),
          ...(walletCalls ? { walletCalls } : {}),
          input,
          principal: context.principal,
          ...authority,
          revision: this.actions.revision,
          expiresAt,
          sequence,
          actionKey: randomUUID(),
          executeKey: randomUUID(),
          status: 'queued',
          identityHash: '',
        };
        entry.identityHash = identity(entry);
        entries[entry.id] = entry;
        state.idempotency[key] = { hash, id: entry.id };
        state.audit.push({
          at: Date.now(),
          event: 'safe_request_queued',
          resource: entry.id,
          revision: this.actions.revision,
        });
        return entry;
      },
    );
    if (!entry) throw new WalletCallsError(5720);
    await this.authorized(context.principal, entry);
    return this.receipt(entry);
  }
  /** Read batch evidence without renewing financial consent or permitting a new effect. */
  async walletCallsRecord(
    principal: VerifiedPrincipal,
    accountId: string,
    id: string,
  ) {
    const result = await this.actions.onboarding.withAccountAccess(
      principal,
      accountId,
      'account:read',
      (state, grant) => {
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
          this.actions.revision
        )
          deny();
        const entry = Object.values(state.safeRequests ?? {}).find(
          (entry) =>
            entry.walletCalls?.id === id &&
            entry.input.account_id === accountId &&
            entry.owner === grant.owner &&
            entry.principal.issuer === principal.issuer &&
            entry.principal.clientId === principal.clientId &&
            entry.principal.subject === principal.subject,
        );
        if (!entry) return undefined;
        this.check(entry);
        this.checkAction(state, entry);
        return { ...entry, execution: this.walletCallsExecution(state, entry) };
      },
    );
    if (!result) throw new WalletCallsError(5730);
    return result;
  }
  private walletCallsExecution(state: ProviderState, entry: SafeQueueRecord) {
    const record = entry.actionId
      ? state.supportedActions?.[entry.actionId]
      : undefined;
    const execution = record?.execution;
    if (
      execution?.plan &&
      (execution.planHash !== executionPlanHash(execution.plan) ||
        fingerprint(execution.plan.action) !==
          fingerprint(record!.approval.action) ||
        fingerprint(execution.plan.intent ?? null) !==
          fingerprint(record!.intent ?? null) ||
        fingerprint(execution.plan.runtimePolicy ?? null) !==
          fingerprint(record!.runtimePolicy ?? null))
    )
      throw new WalletProviderError('wallet_attempt_unavailable', 'unknown');
    if (
      execution?.observation?.verification === 'rpc-quorum' &&
      !execution.plan
    )
      throw new WalletProviderError('wallet_attempt_unavailable', 'unknown');
    return execution;
  }
  async walletCallsList(
    principal: VerifiedPrincipal,
    authorizeOperator?: (state: ProviderState) => void,
  ) {
    if (!authorizeOperator && !principal.scopes.includes('wallet:execute:read'))
      deny();
    const entries = await this.actions.onboarding.store.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.actions.revision
      )
        deny();
      authorizeOperator?.(state);
      return Object.values(state.safeRequests ?? {})
        .filter(
          (entry) =>
            entry.walletCalls &&
            entry.revision === this.actions.revision &&
            (authorizeOperator ||
              (entry.principal.issuer === principal.issuer &&
                entry.principal.clientId === principal.clientId &&
                entry.principal.subject === principal.subject)),
        )
        .sort((a, b) => b.sequence - a.sequence || a.id.localeCompare(b.id));
    });
    const records = [];
    for (const entry of entries) {
      if (records.length >= 100) break;
      if (authorizeOperator) {
        records.push(
          await this.actions.onboarding.store.transaction((state) => {
            if (
              state.deploymentBindings?.['service-v1']?.activeRevision !==
              this.actions.revision
            )
              deny();
            authorizeOperator(state);
            const latest = state.safeRequests?.[entry.id] ?? deny();
            this.check(latest);
            this.checkAction(state, latest);
            return {
              ...latest,
              execution: this.walletCallsExecution(state, latest),
            };
          }),
        );
      } else {
        try {
          records.push(
            await this.walletCallsRecord(
              principal,
              entry.input.account_id,
              entry.walletCalls!.id,
            ),
          );
        } catch (error) {
          if (!(
            error instanceof WalletProviderError &&
            error.code === 'wallet_authorization_denied'
          ))
            throw error;
        }
      }
    }
    return { records, truncated: entries.length > records.length };
  }
  async read(principal: VerifiedPrincipal, id: string) {
    if (!principal.scopes.includes('wallet:execute:read')) deny();
    const entry = await this.load(id);
    await this.authorized(principal, entry);
    return this.receipt(entry);
  }
  async cancel(context: AuthorityContext, id: string) {
    if (
      !context.principal.scopes.includes('wallet:execute') ||
      !uuid.test(context.idempotencyKey)
    )
      deny();
    const entry = await this.load(id);
    await this.authorized(context.principal, entry);
    if (entry.status !== 'cancelled' && !active(entry))
      throw new WalletProviderError('wallet_attempt_conflict');
    return this.receipt(await this.finishUnsigned(entry, 'cancelled', context));
  }
  private async finishUnsigned(
    entry: SafeQueueRecord,
    status: 'cancelled' | 'expired',
    context?: AuthorityContext,
  ) {
    // Resolve a crash between action insertion and recording actionId using the same durable idempotency binding.
    return this.actions.onboarding.store.transaction((state) => {
      const latest = state.safeRequests?.[entry.id] ?? deny();
      this.check(latest);
      if (context) {
        const key = fingerprint([
          'safe-queue-cancel',
          context.principal.issuer,
          context.principal.subject,
          context.principal.clientId,
          context.idempotencyKey,
        ]);
        const previous = state.idempotency[key];
        if (previous && previous.id !== entry.id)
          throw new WalletProviderError('wallet_attempt_conflict');
        state.idempotency[key] = {
          id: entry.id,
          hash: fingerprint(['cancel', entry.id]),
        };
      }
      this.checkAction(state, latest);
      if (!active(latest)) {
        if (context && latest.status !== 'cancelled')
          throw new WalletProviderError('wallet_attempt_conflict');
        return latest;
      }
      const actionKey = fingerprint([
        'supported-call',
        latest.principal.issuer,
        latest.principal.subject,
        latest.principal.clientId,
        latest.actionKey,
      ]);
      const actionId = latest.actionId ?? state.idempotency[actionKey]?.id;
      if (actionId && this.database.hasActionAttempts(actionId)) {
        throw new WalletProviderError('wallet_attempt_conflict');
      }
      if (actionId) {
        const action = state.supportedActions?.[actionId] ?? deny();
        action.status = 'denied';
        action.nonceReleased = true;
        latest.actionId = actionId;
      }
      latest.status = status;
      state.audit.push({
        at: Date.now(),
        event: 'safe_request_' + status,
        resource: latest.id,
        revision: this.actions.revision,
      });
      return latest;
    });
  }
  /** Process a bounded set of independent Safe heads; duplicates join the same signing and dispatch attempts. */
  async process(): Promise<void> {
    const entries = await this.actions.onboarding.store.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.actions.revision
      )
        deny();
      const heads = new Map<string, SafeQueueRecord>();
      for (const entry of Object.values(state.safeRequests ?? {})) {
        if (!active(entry)) continue;
        if (entry.identityHash !== identity(entry)) deny();
        this.checkAction(state, entry);
        if (
          !heads.has(entry.safeAddress) ||
          heads.get(entry.safeAddress)!.sequence > entry.sequence
        )
          heads.set(entry.safeAddress, entry);
      }
      return [...heads.values()];
    });
    const selected = entries.length
      ? Array.from(
          { length: Math.min(4, entries.length) },
          (_, index) => entries[(this.cursor + index) % entries.length],
        )
      : [];
    this.cursor = entries.length
      ? (this.cursor + selected.length) % entries.length
      : 0;
    await Promise.allSettled(selected.map((entry) => this.advance(entry)));
  }
  private async advance(entry: SafeQueueRecord) {
    if (entry.actionId) {
      await this.execution.refresh(entry.actionId);
      const execution = await this.actions.onboarding.store.transaction(
        (state) => state.supportedActions?.[entry.actionId!]?.execution,
      );
      if (execution?.integrityFailure) return;
      const observation = execution?.observation;
      if (
        observation?.chain_status === 'finalized' &&
        observation.verification === 'rpc-quorum' &&
        observation.outcome === 'succeeded'
      ) {
        await this.actions.onboarding.store.transaction((state) => {
          const latest = state.safeRequests?.[entry.id] ?? deny();
          this.check(latest);
          this.checkAction(state, latest);
          if (
            latest.actionId !== entry.actionId ||
            !active(latest) ||
            state.supportedActions?.[entry.actionId!]?.execution
              ?.integrityFailure ||
            fingerprint(
              state.supportedActions?.[entry.actionId!]?.execution?.observation,
            ) !== fingerprint(observation)
          )
            return;
          latest.status = 'succeeded';
          state.audit.push({
            at: Date.now(),
            event: 'safe_request_finalized',
            resource: latest.id,
            revision: this.actions.revision,
          });
        });
        return;
      }
    }
    if (Date.parse(entry.expiresAt) <= Date.now()) {
      try {
        await this.finishUnsigned(entry, 'expired');
      } catch {
        await this.block(entry);
      }
      return;
    }
    try {
      await this.authorized(entry.principal, entry);
      const action = await this.actions.requestCalls(
        { principal: entry.principal, idempotencyKey: entry.actionKey },
        entry.input,
        this.nonce,
        { id: entry.id, expiresAt: entry.expiresAt },
      );
      await this.actions.onboarding.store.transaction((state) => {
        const latest = state.safeRequests?.[entry.id] ?? deny();
        this.check(latest);
        if (!active(latest)) deny();
        if (latest.actionId && latest.actionId !== action.action_id) deny();
        latest.actionId = action.action_id;
        this.checkAction(state, latest);
        latest.status = 'executing';
      });
      const result = await this.execution.execute(
        { principal: entry.principal, idempotencyKey: entry.executeKey },
        action.action_id,
      );
      if (result.dispatch_status === 'failed') await this.block(entry);
    } catch (error) {
      if (
        error instanceof WalletProviderError &&
        error.code === 'wallet_authorization_denied'
      ) {
        try {
          await this.finishUnsigned(entry, 'cancelled');
        } catch {
          await this.block(entry);
        }
      }
      // Storage/provider uncertainty and a busy sponsor leave the original entry and attempts intact.
    }
  }
  private async block(entry: SafeQueueRecord) {
    await this.actions.onboarding.store.transaction((state) => {
      const latest = state.safeRequests?.[entry.id] ?? deny();
      this.check(latest);
      if (active(latest)) latest.status = 'blocked';
    });
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const schedule = () => {
      this.running = this.process()
        .catch(() => {})
        .finally(() => {
          if (!this.stopped) {
            this.timer = setTimeout(schedule, this.pollIntervalSeconds * 1000);
            this.timer.unref();
          }
        });
    };
    this.timer = setTimeout(schedule, this.pollIntervalSeconds * 1000);
    this.timer.unref();
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
}
