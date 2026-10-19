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
import { serviceHash } from '../executor/auth.js';
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
}
/** Durable, explicitly selected ERC-4337 batch lane. It never delegates an uncertain batch to a relayer. */
export class UserOperationWalletCallsDriver implements WalletCallsDriver {
  private readonly config: UserOperationWalletCallsConfiguration;
  private readonly configurationHash: string;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  constructor(
    private readonly actions: SupportedActions,
    private readonly database: ProviderDatabase,
    private readonly execution: UserOperationExecutionCoordinator,
    configuration: UserOperationWalletCallsConfiguration,
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
      configuration.pollIntervalSeconds < 5 ||
      configuration.pollIntervalSeconds > 300
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
    this.configurationHash = serviceHash([
      this.config,
      execution.configurationHash,
      execution.signing.executionBinding().configurationHash,
    ]);
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
        const duplicate = (entry: {
          principal: VerifiedPrincipal;
          safeAddress: string;
          walletCalls?: WalletCallsMetadata;
        }) =>
          entry.walletCalls?.id === metadata.id &&
          entry.safeAddress === authority.safeAddress &&
          entry.principal.issuer === context.principal.issuer &&
          entry.principal.clientId === context.principal.clientId;
        if (
          Object.values(state.safeRequests ?? {}).some(duplicate) ||
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
          lane.filter((e) => !['complete', 'expired'].includes(e.stage))
            .length >= this.config.maxDepthPerSafe
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
  async status(principal: VerifiedPrincipal, accountId: string, id: string) {
    const entry = await this.load(principal, accountId, id);
    const storedPlan = entry.operationId
      ? await this.execution.load(entry.operationId)
      : null;
    let plan = storedPlan
        ? await this.execution.read(principal, storedPlan.operationId)
        : null,
      fresh = true;
    if (plan) {
      try {
        plan = await this.execution.refresh(plan.operationId);
      } catch {
        fresh = false;
      }
    }
    return this.projection(entry, plan, fresh);
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
            : entry.stage === 'complete'
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
          plan?.observation.state === 'finalized',
        ),
      });
    }
    return { truncated: entries.length > 100, batches };
  }
  private async process(entry: UserOperationBatch) {
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
      const exposed =
        entry.operationId &&
        (this.database.sponsorship.load(entry.operationId) ||
          this.database.hasActionAttempts(entry.operationId));
      await this.update(entry, exposed ? 'blocked' : 'expired');
      return;
    } else {
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
      const operation = await this.execution.signing.prepareCalls(
        context.principal,
        entry.input,
        this.config.gas,
      );
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
      latest?.observation.state === 'finalized' ? 'complete' : 'processing',
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
  async runOnce() {
    const entries = await this.actions.onboarding.store.transaction((s) =>
      Object.values(s.userOperationBatches ?? {})
        .filter(
          (e) =>
            e.configurationHash === this.configurationHash &&
            !['complete', 'expired'].includes(e.stage),
        )
        .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)),
    );
    const lanes = new Set<string>();
    for (const entry of entries.slice(0, 100)) {
      const lane = entry.metadata.sender.toLowerCase();
      if (lanes.has(lane)) continue;
      lanes.add(lane);
      try {
        await this.process(entry);
      } catch {
        await this.update(entry, 'blocked');
      }
    }
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const tick = async () => {
      if (this.stopped) return;
      this.running = this.runOnce();
      try {
        await this.running;
      } catch {
        /* Health/acceptance is owned by the embedding host. */
      } finally {
        this.running = undefined;
        if (!this.stopped)
          this.timer = setTimeout(tick, this.config.pollIntervalSeconds * 1000);
      }
    };
    this.timer = setTimeout(tick, 0);
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
}
