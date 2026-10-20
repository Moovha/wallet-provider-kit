import { WalletProviderError } from '../domain/signing.js';
import { NetworkFeeLimitError } from '../execution/network-fees.js';
import { waitForObservation } from '../execution/read-observation.js';
import { randomUUID } from 'node:crypto';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type { SupportedActions } from '../deployment/actions.js';
import type { ProviderDatabase } from '../storage/index.js';
import type { ApprovedCallInput } from '../execution/approved-calls.js';
import type {
  WalletCallsMetadata,
  WalletCallsStatus,
  WalletCallsBatchSummary,
} from '../wallet-calls/types.js';
import type { ProviderState } from '../onboarding/types.js';
import { WalletCallsError } from '../wallet-calls/errors.js';
import { fingerprint, deny } from '../onboarding/policy.js';
import { canonicalHash } from '../domain/canonical.js';
import { runtimeApplicationId } from '../runtime-configuration/service.js';
import {
  normalizeUserOperationV07,
  type UserOperationV07,
} from './user-operation.js';
import { UserOperationExecutionCoordinator } from './execution.js';
import type {
  UserOperationBatch,
  UserOperationExecution,
  WalletCallsDriver,
} from './execution-types.js';

export interface UserOperationWalletCallsConfiguration {
  gas: Pick<
    UserOperationV07,
    | 'callGasLimit'
    | 'verificationGasLimit'
    | 'preVerificationGas'
    | 'maxFeePerGas'
    | 'maxPriorityFeePerGas'
  >;
  maxDepthPerSafe: number;
  maxWaitSeconds: number;
  pollIntervalSeconds: number;
  maxConcurrentAccounts?: number;
  maxDepthTotal?: number;
}
/** Durable ERC-4337 batch lane. Uncertain batches retain their immutable operation identity. */
export class UserOperationWalletCallsDriver implements WalletCallsDriver {
  private readonly config: UserOperationWalletCallsConfiguration;
  private readonly configurationHash: string;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  private readonly lanes = new Map<string, Promise<void>>();
  private nextWakeAt = 0;
  private readonly retryAt = new Map<string, number>();
  private cursor = 0;
  private settlementCursor = 0;
  private nextSettlementAt = 0;
  constructor(
    private readonly actions: SupportedActions,
    private readonly database: ProviderDatabase,
    private readonly execution: UserOperationExecutionCoordinator,
    configuration: UserOperationWalletCallsConfiguration,
    private readonly networkFees?: () => Promise<
      Pick<UserOperationV07, 'maxFeePerGas' | 'maxPriorityFeePerGas'>
    >,
    private readonly prepareWork?: (work: () => Promise<void>) => Promise<void>,
    private readonly estimateOperation?: (
      operation: UserOperationV07,
    ) => Promise<UserOperationV07>,
    private readonly wake?: (delay: number) => void,
  ) {
    this.config = structuredClone(configuration);
    if (
      !Number.isInteger(configuration.maxDepthPerSafe) ||
      configuration.maxDepthPerSafe < 1 ||
      configuration.maxDepthPerSafe > 100 ||
      !Number.isInteger(configuration.maxWaitSeconds) ||
      configuration.maxWaitSeconds < 30 ||
      configuration.maxWaitSeconds > 3600 ||
      !Number.isInteger(configuration.pollIntervalSeconds) ||
      configuration.pollIntervalSeconds < 1 ||
      configuration.pollIntervalSeconds > 300 ||
      !Number.isInteger(configuration.maxConcurrentAccounts ?? 10) ||
      (configuration.maxConcurrentAccounts ?? 10) < 1 ||
      (configuration.maxConcurrentAccounts ?? 10) > 32 ||
      !Number.isInteger(configuration.maxDepthTotal ?? 512) ||
      (configuration.maxDepthTotal ?? 512) < 1 ||
      (configuration.maxDepthTotal ?? 512) > 10000
    )
      throw new WalletCallsError(-32602);
    const gas = normalizeUserOperationV07({
      ...this.config.gas,
      sender: '0x1111111111111111111111111111111111111111',
      nonce: '0x0',
      callData: '0x',
    });
    if (
      [
        gas.callGasLimit,
        gas.verificationGasLimit,
        gas.preVerificationGas,
        gas.maxFeePerGas,
      ].some((g) => BigInt(g) === 0n)
    )
      throw new WalletCallsError(-32602);
    this.configurationHash = canonicalHash([
      this.config,
      execution.configurationHash,
      execution.signing.executionBinding().configurationHash,
    ]);
  }
  subscribe(listener: (batchId: string) => void) {
    return this.execution.subscribe((id) => {
      void this.actions.onboarding.store
        .transaction((state) =>
          Object.values(state.userOperationBatches ?? {})
            .filter((b) => b.operationId === id)
            .map((b) => b.metadata.id),
        )
        .then((ids) => ids.forEach(listener))
        .catch(() => undefined);
    });
  }
  handles(accountId: string) {
    return this.execution.signing
      .executionBinding()
      .accountIds.includes(accountId);
  }
  async capabilities(principal: VerifiedPrincipal, accountId: string) {
    await this.execution.signing.assertAccepted(principal, accountId);
  }
  acceptPaymaster(value: unknown) {
    if (value === undefined) return;
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new WalletCallsError(-32602);
    const capability = value as Record<string, unknown>;
    if (
      Object.keys(capability).some(
        (k) => !['url', 'context', 'optional'].includes(k),
      ) ||
      capability.url !==
        this.execution.signing.executionBinding().paymasterUrl ||
      (capability.context !== undefined &&
        (!capability.context ||
          typeof capability.context !== 'object' ||
          Array.isArray(capability.context) ||
          Object.keys(capability.context).length !== 0))
    )
      throw new WalletCallsError(4100);
  }
  async assertSize(principal: VerifiedPrincipal, input: ApprovedCallInput) {
    const preview = await this.actions.previewWalletCalls(principal, input);
    if (Buffer.byteLength(JSON.stringify(preview), 'utf8') > 16384)
      throw new WalletCallsError(5740);
  }
  async enqueue(
    context: AuthorityContext,
    input: ApprovedCallInput,
    metadata: WalletCallsMetadata,
  ) {
    context = structuredClone(context);
    input = structuredClone(input);
    metadata = structuredClone(metadata);
    if (
      !['wallet:actions', 'wallet:sign', 'wallet:execute'].every((scope) =>
        context.principal.scopes.includes(scope),
      )
    )
      deny();
    const expiresAt = await this.actions.applicationQueueExpiry(
        context.principal,
        this.config.maxWaitSeconds,
      ),
      authority = await this.actions.queueAuthority(
        context.principal,
        input,
        expiresAt,
      );
    const result = await this.actions.onboarding.withAccountAccess(
      context.principal,
      input.account_id,
      'contracts:request',
      (state, grant) => {
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.actions.revision ||
          authority.owner !== grant.owner ||
          authority.grantId !== grant.id ||
          authority.consentReference !== grant.requestId ||
          state.accounts[grant.accountId].address !== authority.address
        )
          deny();
        const publication = state.requests[grant.requestId]?.runtimePolicy;
        if (
          !publication ||
          publication.policy_hash !== metadata.policyHash ||
          publication.revision !== metadata.policyRevision ||
          metadata.sender.toLowerCase() !== authority.safeAddress
        )
          deny();
        const entries = (state.userOperationBatches ??= {});
        if (
          Object.values(entries).some(
            (e) =>
              e.metadata.id === metadata.id &&
              e.metadata.sender.toLowerCase() === authority.safeAddress &&
              e.context.principal.issuer === context.principal.issuer &&
              e.context.principal.clientId === context.principal.clientId,
          )
        )
          return 5720;
        const lane = Object.values(entries).filter(
          (e) => e.metadata.sender.toLowerCase() === authority.safeAddress,
        );
        if (
          lane.filter(
            (e) => !['included', 'complete', 'expired'].includes(e.stage),
          ).length >= this.config.maxDepthPerSafe
        )
          return 5740;
        if (
          Object.values(entries).filter(
            (e) => !['included', 'complete', 'expired'].includes(e.stage),
          ).length >= (this.config.maxDepthTotal ?? 512)
        )
          return 5740;
        const sequence =
          lane.reduce((max, e) => Math.max(max, e.sequence), 0) + 1;
        if (!Number.isSafeInteger(sequence)) deny();
        const id = randomUUID();
        entries[id] = {
          id,
          metadata,
          context: {
            principal: context.principal,
            idempotencyKey: randomUUID(),
          },
          input,
          owner: grant.owner,
          grantId: grant.id,
          consentReference: grant.requestId,
          address: authority.address,
          configurationHash: this.configurationHash,
          revision: this.actions.revision,
          expiresAt,
          sequence,
          stage: 'queued',
          timings: { queued_at: new Date().toISOString() },
        };
        state.audit.push({
          at: Date.now(),
          event: 'user_operation_batch_queued',
          resource: id,
          revision: this.actions.revision,
        });
      },
    );
    if (result) throw new WalletCallsError(result);
    this.schedule(0);
  }
  private async load(
    principal: VerifiedPrincipal,
    accountId: string,
    id: string,
  ) {
    const entry = await this.actions.onboarding.withAccountAccess(
      principal,
      accountId,
      'account:read',
      (state, grant) => {
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
          this.actions.revision
        )
          deny();
        return Object.values(state.userOperationBatches ?? {}).find(
          (e) =>
            e.metadata.id === id &&
            e.input.account_id === accountId &&
            e.owner === grant.owner &&
            ['issuer', 'clientId', 'subject'].every(
              (key) =>
                e.context.principal[
                  key as 'issuer' | 'clientId' | 'subject'
                ] === principal[key as 'issuer' | 'clientId' | 'subject'],
            ) &&
            e.configurationHash === this.configurationHash,
        );
      },
    );
    if (!entry) throw new WalletCallsError(5730);
    return entry;
  }
  private projection(
    entry: UserOperationBatch,
    plan: UserOperationExecution | null,
    fresh: boolean,
  ): WalletCallsStatus {
    const receipt = fresh ? plan?.observation.receipt : undefined;
    return {
      version: '2.0.0',
      id: entry.metadata.id,
      chainId: this.actions.network.hex,
      atomic: true,
      status: receipt
        ? receipt.status === '0x1'
          ? 200
          : 500
        : entry.stage === 'expired'
          ? 400
          : 100,
      ...(receipt ? { receipts: [receipt] } : {}),
    };
  }
  async status(
    principal: VerifiedPrincipal,
    accountId: string,
    id: string,
    refresh = true,
  ) {
    const entry = await this.load(principal, accountId, id);
    const stored = entry.operationId
      ? await this.execution.load(entry.operationId)
      : null;
    let plan = stored
      ? await this.execution.read(principal, stored.operationId)
      : null;
    if (plan && refresh) {
      try {
        await waitForObservation(
          this.execution.refresh(plan.operationId).then(() => undefined),
        );
      } catch {
        return this.projection(entry, plan, false);
      }
      plan = await this.execution.read(principal, plan.operationId);
    }
    const age = plan
      ? Date.now() - Date.parse(plan.observation.observedAt)
      : Infinity;
    return this.projection(
      entry,
      plan,
      Number.isFinite(age) && age >= 0 && age <= 3000,
    );
  }
  async list(
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
      return Object.values(state.userOperationBatches ?? {})
        .filter(
          (e) =>
            e.configurationHash === this.configurationHash &&
            (authorizeOperator ||
              ['issuer', 'subject', 'clientId'].every(
                (k) =>
                  e.context.principal[
                    k as 'issuer' | 'subject' | 'clientId'
                  ] === principal[k as 'issuer' | 'subject' | 'clientId'],
              )),
        )
        .sort((a, b) => b.sequence - a.sequence || a.id.localeCompare(b.id));
    });
    const batches: WalletCallsBatchSummary[] = [];
    for (const entry of entries.slice(0, 100)) {
      if (!authorizeOperator)
        await this.load(principal, entry.input.account_id, entry.metadata.id);
      const plan = entry.operationId
        ? await this.execution.load(entry.operationId)
        : null;
      batches.push({
        account_id: entry.input.account_id,
        sender: entry.metadata.sender,
        queue_stage:
          entry.stage === 'processing'
            ? 'executing'
            : entry.stage === 'included' || entry.stage === 'complete'
              ? 'succeeded'
              : entry.stage,
        policy_revision: entry.metadata.policyRevision,
        expires_at: entry.expiresAt,
        application_id: runtimeApplicationId(
          entry.context.principal.issuer,
          entry.context.principal.clientId,
        ),
        ...this.projection(
          entry,
          plan,
          !!plan?.observation.receipt &&
            ['included', 'safe', 'finalized'].includes(plan.observation.state),
        ),
      });
    }
    return { truncated: entries.length > 100, batches };
  }
  private async timestamp(entry: UserOperationBatch, field: string) {
    await this.actions.onboarding.store.transaction((s) => {
      const current = s.userOperationBatches?.[entry.id];
      if (!current || current.configurationHash !== this.configurationHash)
        deny();
      (current.timings ??= {})[field] ??= new Date().toISOString();
    });
  }
  private async process(
    entry: UserOperationBatch,
    predecessor?: UserOperationBatch,
  ) {
    if (predecessor) {
      if (!predecessor.operationId) deny();
      const previous = await this.execution.refresh(predecessor.operationId);
      if (
        !previous?.observation.receipt ||
        !['included', 'safe', 'finalized'].includes(previous.observation.state)
      )
        deny();
    }
    const context = entry.context;
    if (!entry.operationId) {
      const key = fingerprint([
        'supported-call',
        context.principal.issuer,
        context.principal.subject,
        context.principal.clientId,
        context.idempotencyKey,
      ]);
      const recovered = await this.actions.onboarding.store.transaction(
        (s) => s.idempotency[key]?.id,
      );
      if (recovered) entry.operationId = recovered;
    }
    const plan = entry.operationId
      ? await this.execution.load(entry.operationId)
      : null;
    if (plan?.dispatch) {
      await this.execution.refresh(plan.operationId);
    } else if (Date.parse(entry.expiresAt) <= Date.now()) {
      const sponsorship =
        entry.operationId && this.database.sponsorship.load(entry.operationId);
      const exposed =
        entry.operationId &&
        (this.database.hasActionAttempts(entry.operationId) ||
          (sponsorship &&
            (BigInt(sponsorship.validUntil) * 1000n > BigInt(Date.now()) ||
              this.database.hasActionAttempts(sponsorship.signingActionId))));
      await this.update(entry, exposed ? 'blocked' : 'expired');
      return;
    } else if (
      entry.operationId &&
      this.database.sponsorship.load(entry.operationId)
    ) {
      await this.execution.execute(context, entry.operationId);
    } else {
      await this.timestamp(entry, 'preparation_started_at');
      const authority = await this.actions.queueAuthority(
        context.principal,
        entry.input,
        entry.expiresAt,
      );
      if (
        authority.owner !== entry.owner ||
        authority.grantId !== entry.grantId ||
        authority.consentReference !== entry.consentReference ||
        authority.address !== entry.address
      )
        deny();
      const feeQuote = this.networkFees?.();
      // After a fee-ceiling rejection, retry fees before any account or estimation reads.
      const availableFees =
        entry.lastFailure?.code === 'network_fee_limit'
          ? await feeQuote
          : feeQuote;
      const [prepared, fees] = await Promise.all([
        this.execution.signing.prepareCalls(
          context.principal,
          entry.input,
          this.config.gas,
        ),
        availableFees,
      ]);
      let operation = { ...prepared, ...fees };
      if (this.estimateOperation)
        operation = await this.estimateOperation(operation);
      await this.timestamp(entry, 'prepared_at');
      const admitted = await this.execution.signing.requestCalls(
        context,
        entry.input,
        operation,
        entry.expiresAt,
      );
      entry.operationId = admitted.operation_id;
      await this.update(entry, 'processing');
      await this.execution.execute(context, entry.operationId);
    }
    const latest = entry.operationId
      ? await this.execution.load(entry.operationId)
      : null;
    await this.update(
      entry,
      latest?.observation.state === 'expired'
        ? 'expired'
        : latest?.observation.state === 'finalized'
          ? 'complete'
          : latest?.observation.receipt &&
              ['included', 'safe'].includes(latest.observation.state)
            ? 'included'
            : 'processing',
    );
  }
  private async update(
    entry: UserOperationBatch,
    stage: UserOperationBatch['stage'],
  ) {
    await this.actions.onboarding.store.transaction((state) => {
      const current = state.userOperationBatches?.[entry.id] ?? deny();
      if (
        current.configurationHash !== this.configurationHash ||
        state.deploymentBindings?.['service-v1']?.activeRevision !==
          this.actions.revision ||
        (current.operationId &&
          entry.operationId &&
          current.operationId !== entry.operationId)
      )
        deny();
      if (entry.operationId) current.operationId = entry.operationId;
      if (!['complete', 'expired'].includes(current.stage))
        current.stage = stage;
    });
  }
  async runOnce(snapshot?: readonly UserOperationBatch[]): Promise<void> {
    const entries = (
      snapshot ??
      (await this.actions.onboarding.store.transaction((s) =>
        Object.values(s.userOperationBatches ?? {}),
      ))
    )
      .filter(
        (e) =>
          e.configurationHash === this.configurationHash &&
          !['complete', 'expired'].includes(e.stage),
      )
      .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
    const retained = new Set(entries.map((e) => e.id));
    for (const id of this.retryAt.keys())
      if (!retained.has(id)) this.retryAt.delete(id);
    const groups = new Map<string, UserOperationBatch[]>();
    for (const entry of entries) {
      const lane = entry.metadata.sender.toLowerCase();
      const group = groups.get(lane) ?? [];
      group.push(entry);
      groups.set(lane, group);
    }
    const heads = [...groups.values()].flatMap((group) => {
      const index = group.findIndex((e) => e.stage !== 'included');
      return index < 0
        ? []
        : [{ entry: group[index], predecessor: group.slice(0, index).at(-1) }];
    });
    const available = heads.filter(
      (head) =>
        !this.lanes.has(head.entry.metadata.sender.toLowerCase()) &&
        (this.stopped || (this.retryAt.get(head.entry.id) ?? 0) <= Date.now()),
    );
    const limit = Math.max(
      0,
      (this.config.maxConcurrentAccounts ?? 10) - this.lanes.size,
    );
    const selected = Array.from(
      { length: Math.min(limit, available.length) },
      (_, i) => available[(this.cursor + i) % available.length],
    );
    this.cursor = available.length
      ? (this.cursor + selected.length) % available.length
      : 0;
    const work = selected.map(({ entry, predecessor }) => {
      const lane = entry.metadata.sender.toLowerCase();
      const existing = this.lanes.get(lane);
      if (existing) return existing;
      const running = (async () => {
        try {
          if (this.prepareWork)
            await this.prepareWork(() => this.process(entry, predecessor));
          else await this.process(entry, predecessor);
        } catch (error) {
          const code =
            error instanceof NetworkFeeLimitError
              ? error.reason
              : error instanceof WalletProviderError
                ? error.code
                : 'wallet_execution_unavailable';
          await this.actions.onboarding.store.transaction((state) => {
            const current = state.userOperationBatches?.[entry.id] ?? deny();
            if (
              current.configurationHash !== this.configurationHash ||
              state.deploymentBindings?.['service-v1']?.activeRevision !==
                this.actions.revision
            )
              deny();
            current.lastFailure = { code, at: new Date().toISOString() };
            current.retryCount = (current.retryCount ?? 0) + 1;
          });
          await this.update(entry, 'blocked');
          this.retryAt.set(
            entry.id,
            Date.now() + (error instanceof NetworkFeeLimitError ? 2000 : 1000),
          );
        }
      })().finally(() => {
        if (this.lanes.get(lane) === running) this.lanes.delete(lane);
        this.retryAt.set(
          entry.id,
          Math.max(this.retryAt.get(entry.id) ?? 0, Date.now() + 1000),
        );
        this.schedule(0);
      });
      this.lanes.set(lane, running);
      return running;
    });
    await Promise.allSettled(work);
    // Settlement is independent of account admission and receives one bounded rotating slot.
    const included = entries.filter(
      (e) =>
        e.stage === 'included' &&
        !selected.some(
          (head) =>
            head.entry.metadata.sender.toLowerCase() ===
            e.metadata.sender.toLowerCase(),
        ),
    );
    if (included.length && Date.now() >= this.nextSettlementAt) {
      this.nextSettlementAt = Date.now() + 15000;
      const entry = included[this.settlementCursor++ % included.length];
      try {
        await this.process(entry);
      } catch {
        /* A read failure retains the historical inclusion and reservations. */
      }
    }
  }
  private schedule(delay: number) {
    if (this.stopped) return;
    if (this.wake) {
      this.wake(delay);
      return;
    }
    const at = Date.now() + delay;
    if (this.timer && this.nextWakeAt <= at) return;
    if (this.timer) clearTimeout(this.timer);
    this.nextWakeAt = at;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.stopped) return;
      const running = this.runOnce();
      this.running = running;
      void running
        .catch(() => undefined)
        .finally(() => {
          if (this.running === running) this.running = undefined;
          this.schedule(this.config.pollIntervalSeconds * 1000);
        });
    }, delay);
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.running;
    await Promise.allSettled([...this.lanes.values()]);
  }
}
