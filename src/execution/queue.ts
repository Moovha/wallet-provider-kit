import { rpcVerified } from './inclusion.js';
import { executionPlanHash } from '../executor/protocol.js';
import { consumedSafeNonce } from './inclusion.js';
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
  progressionActionId?: string;
  status:
    | 'queued'
    | 'executing'
    | 'included'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'expired'
    | 'blocked';
}
const active = (entry: SafeQueueRecord) =>
  ['queued', 'executing', 'blocked'].includes(entry.status);
function identity(entry: SafeQueueRecord) {
  const {
    identityHash: _hash,
    actionId: _action,
    status: _status,
    progressionActionId: _progression,
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
  private activeWork = false;
  private scheduledAt = Infinity;
  private readonly lanes = new Map<string, Promise<void>>();
  private readonly readyLanes = new Set<string>();
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
    for (const [value, maximum] of [
      [configuration.maxDepthPerUser ?? 8, 100],
      [configuration.maxDepthPerApplication ?? 128, 1000],
      [configuration.maxDepthTotal ?? 512, 10000],
    ])
      if (!Number.isInteger(value) || value < 1 || value > maximum)
        throw new WalletProviderError('wallet_provider_configuration');
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
      entry.progressionActionId &&
      (action?.cancellationId !== entry.progressionActionId ||
        state.supportedActions?.[entry.progressionActionId]?.intent
          ?.cancellation?.actionId !== binding.id)
    )
      deny();
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
      (action.approval.userAccount ?? action.approval.account).accountId !==
        entry.input.account_id ||
      (action.approval.userAccount ?? action.approval.account).address !==
        entry.address ||
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
      this.wake();
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
        const pending = Object.values(entries).filter(active);
        const application = pending.filter(
          (e) =>
            e.principal.issuer === context.principal.issuer &&
            e.principal.clientId === context.principal.clientId,
        );
        if (
          pending.length >= (this.configuration.maxDepthTotal ?? 512) ||
          application.length >=
            (this.configuration.maxDepthPerApplication ?? 128) ||
          application.filter((e) => e.input.account_id === input.account_id)
            .length >= (this.configuration.maxDepthPerUser ?? 8)
        )
          throw new WalletProviderError('wallet_attempt_pending');
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
    this.wake();
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
      execution &&
      rpcVerified(execution.observation?.verification) &&
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
        if (entry.status === 'included') {
          const execution =
            state.supportedActions?.[
              entry.progressionActionId ?? entry.actionId!
            ]?.execution;
          if (
            consumedSafeNonce(execution) &&
            execution?.observation?.chain_status === 'finalized'
          ) {
            this.check(entry);
            this.checkAction(state, entry);
            entry.status = entry.progressionActionId
              ? 'cancelled'
              : execution.observation.outcome === 'succeeded'
                ? 'succeeded'
                : 'failed';
            state.audit.push({
              at: Date.now(),
              event: 'safe_request_finalized',
              resource: entry.id,
              revision: this.actions.revision,
            });
          }
        }
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
    this.activeWork = entries.length > 0;
    const available = entries.filter(
      (entry) => !this.lanes.has(entry.safeAddress),
    );
    const selected = available.length
      ? Array.from(
          {
            length: Math.min(
              Math.max(0, 10 - this.lanes.size),
              available.length,
            ),
          },
          (_, index) => available[(this.cursor + index) % available.length],
        )
      : [];
    this.cursor = available.length
      ? (this.cursor + selected.length) % available.length
      : 0;
    await Promise.allSettled(
      selected.map((entry) => {
        const existing = this.lanes.get(entry.safeAddress);
        if (existing) return existing;
        const running = this.advance(entry).finally(() => {
          if (this.lanes.get(entry.safeAddress) === running)
            this.lanes.delete(entry.safeAddress);
          const ready = this.readyLanes.delete(entry.safeAddress);
          if (!this.stopped) this.schedule(ready ? 0 : 1000);
        });
        this.lanes.set(entry.safeAddress, running);
        return running;
      }),
    );
  }
  private async advance(entry: SafeQueueRecord) {
    // Unsigned expiry must not wait behind an unavailable or quarantined predecessor.
    if (
      Date.parse(entry.expiresAt) <= Date.now() &&
      (!entry.actionId || !this.database.hasActionAttempts(entry.actionId))
    ) {
      try {
        await this.finishUnsigned(entry, 'expired');
      } catch {
        await this.block(entry);
      }
      return;
    }
    // A released predecessor must remain canonically included before this lane advances.
    const predecessor = await this.actions.onboarding.store.transaction(
      (state) => {
        const prior = Object.values(state.safeRequests ?? {}).filter(
          (e) =>
            e.safeAddress === entry.safeAddress &&
            e.sequence < entry.sequence &&
            ['included', 'succeeded', 'failed'].includes(e.status),
        );
        if (
          prior.some(
            (e) =>
              state.supportedActions?.[e.progressionActionId ?? e.actionId!]
                ?.execution?.integrityFailure,
          )
        )
          deny();
        return prior.sort((a, b) => b.sequence - a.sequence)[0];
      },
    );
    if (predecessor?.actionId) {
      const predecessorId =
        predecessor.progressionActionId ?? predecessor.actionId;
      const before = Date.now();
      const finalized = await this.actions.onboarding.store.transaction(
        (state) =>
          state.supportedActions?.[predecessorId]?.execution?.observation
            ?.chain_status === 'finalized',
      );
      if (!finalized) await this.execution.refresh(predecessorId);
      const previous = await this.actions.onboarding.store.transaction(
        (state) => state.supportedActions?.[predecessorId]?.execution,
      );
      if (
        !consumedSafeNonce(previous) ||
        (previous?.observation?.chain_status !== 'finalized' &&
          Date.parse(previous?.observation?.observed_at ?? '') < before)
      )
        return;
    }
    if (entry.actionId) {
      const progressionId = await this.actions.onboarding.store.transaction(
        (state) =>
          state.supportedActions?.[entry.actionId!]?.cancellationId ??
          entry.actionId!,
      );
      const before = Date.now();
      await this.execution.refresh(progressionId);
      const execution = await this.actions.onboarding.store.transaction(
        (state) => state.supportedActions?.[progressionId]?.execution,
      );
      if (execution?.integrityFailure) return;
      const observation = execution?.observation;
      if (
        consumedSafeNonce(execution) &&
        (observation?.chain_status === 'finalized' ||
          Date.parse(observation?.observed_at ?? '') >= before)
      ) {
        await this.actions.onboarding.store.transaction((state) => {
          const latest = state.safeRequests?.[entry.id] ?? deny();
          this.check(latest);
          this.checkAction(state, latest);
          if (
            latest.actionId !== entry.actionId ||
            !active(latest) ||
            state.supportedActions?.[progressionId]?.execution
              ?.integrityFailure ||
            fingerprint(
              state.supportedActions?.[progressionId]?.execution?.observation,
            ) !== fingerprint(observation)
          )
            return;
          if (progressionId !== entry.actionId)
            latest.progressionActionId = progressionId;
          latest.status =
            observation?.chain_status === 'finalized' &&
            observation.outcome === 'succeeded'
              ? 'succeeded'
              : 'included';
          state.audit.push({
            at: Date.now(),
            event:
              latest.status === 'succeeded'
                ? 'safe_request_finalized'
                : 'safe_request_included',
            resource: latest.id,
            revision: this.actions.revision,
          });
        });
        this.wake();
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
    this.schedule(0);
  }
  /** Consume the just-persisted inclusion observation without verifying that same head a second time. */
  async included(actionId: string) {
    const addresses = await this.actions.onboarding.store.transaction(
      (state) => {
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
          this.actions.revision
        )
          deny();
        const changed: string[] = [];
        for (const entry of Object.values(state.safeRequests ?? {})) {
          if (!active(entry) || !entry.actionId) continue;
          const progressionId =
            state.supportedActions?.[entry.actionId]?.cancellationId ??
            entry.actionId;
          if (progressionId !== actionId) continue;
          this.check(entry);
          this.checkAction(state, entry);
          const execution = state.supportedActions?.[progressionId]?.execution;
          if (!consumedSafeNonce(execution)) continue;
          if (progressionId !== entry.actionId)
            entry.progressionActionId = progressionId;
          entry.status =
            execution?.observation?.chain_status === 'finalized' &&
            execution.observation.outcome === 'succeeded'
              ? 'succeeded'
              : 'included';
          state.audit.push({
            at: Date.now(),
            event:
              entry.status === 'succeeded'
                ? 'safe_request_finalized'
                : 'safe_request_included',
            resource: entry.id,
            revision: this.actions.revision,
          });
          changed.push(entry.safeAddress);
        }
        return changed;
      },
    );
    for (const address of addresses)
      if (this.lanes.has(address)) this.readyLanes.add(address);
    if (addresses.length) this.wake();
  }
  wake() {
    if (this.stopped) return;
    this.schedule(0);
  }
  private schedule(delay: number) {
    const due = Date.now() + delay;
    if (this.timer && this.scheduledAt <= due) return;
    clearTimeout(this.timer);
    this.scheduledAt = due;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.scheduledAt = Infinity;
      const running = this.process()
        .catch(() => {})
        .finally(() => {
          if (this.running === running) this.running = undefined;
          if (!this.stopped && !this.timer)
            this.schedule(
              this.activeWork || this.lanes.size
                ? 1000
                : this.pollIntervalSeconds * 1000,
            );
        });
      this.running = running;
    }, delay);
    this.timer.unref();
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.scheduledAt = Infinity;
    await this.running;
    await Promise.allSettled(this.lanes.values());
  }
}
