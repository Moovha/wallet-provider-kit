import { approvedCallData } from './approved-calls.js';
import {
  executionPlanHash,
  executionConfigurationIdentity,
  type ExecutionAuthorityRequest,
} from '../executor/protocol.js';
import { randomUUID } from 'node:crypto';
import { Signature, recoverAddress } from 'ethers';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type { EmbeddedWalletService } from '../domain/embedded-wallet.js';
import type {
  WalletAttemptRequest,
  WalletAttemptClaim,
} from '../domain/attempt-journal.js';
import { WalletProviderError } from '../domain/signing.js';
import { deny, fingerprint, uuid } from '../onboarding/policy.js';
import type { ProviderDatabase } from '../storage/index.js';
import type {
  SupportedActions,
  TransferRecord,
} from '../deployment/actions.js';
import {
  createAttemptLifecycle,
  createWalletAttemptRequest,
} from '../providers/attempt-lifecycle.js';
import { transferInterface } from './chain.js';
import {
  type ExecutionConfiguration,
  type ExecutionObserver,
  type ExecutionProvider,
  type ExecutionReceipt,
  type TransferExecutionPlan,
} from './types.js';

function unknown(): never {
  throw new WalletProviderError('wallet_attempt_unavailable', 'unknown');
}

/** One immutable execution per approved action; uncertain attempts are never dispatched again. */
export class ApprovedExecutionCoordinator {
  readonly configurationHash: string;
  readonly profile: ExecutionConfiguration['profile'];
  private readonly config: ExecutionConfiguration;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  private cursor = 0;
  constructor(
    readonly actions: SupportedActions,
    private readonly database: ProviderDatabase,
    private readonly wallet: EmbeddedWalletService,
    configuration: ExecutionConfiguration,
    private readonly provider: ExecutionProvider,
    private readonly observer: ExecutionObserver,
  ) {
    this.config = structuredClone(configuration);
    this.profile = configuration.profile;
    this.configurationHash = fingerprint(
      executionConfigurationIdentity(configuration),
    );
  }
  private request(record: TransferRecord): WalletAttemptRequest {
    const execution = record.execution;
    if (
      !execution?.plan ||
      !execution.planHash ||
      execution.planHash !== executionPlanHash(execution.plan) ||
      execution.profile !== this.profile ||
      execution.revision !== '1' ||
      execution.plan.profile !== this.profile ||
      execution.plan.revision !== '1' ||
      execution.plan.action.action_id !== record.approval.action.action_id ||
      fingerprint(execution.plan.action) !==
        fingerprint(record.approval.action) ||
      fingerprint(execution.plan.intent ?? null) !==
        fingerprint(record.intent ?? null)
    )
      unknown();
    return createWalletAttemptRequest(
      'configured-execution-v1',
      this.profile,
      'relay_transaction',
      record.approval.account.accountId,
      execution.executionId,
      record.approval.action.action_id,
      execution.plan,
    );
  }
  private async current(
    principal: VerifiedPrincipal,
    id: string,
    allowExpired = false,
  ) {
    return this.actions.withAuthorizedTransfer(
      principal,
      id,
      (_state, record) => record,
      allowExpired,
    );
  }
  private async authorize(
    principal: VerifiedPrincipal,
    id: string,
    expected: WalletAttemptRequest,
  ) {
    const record = await this.current(principal, id);
    if (
      record.execution?.configurationHash !== this.configurationHash ||
      fingerprint(this.request(record)) !== fingerprint(expected) ||
      record.execution.integrityFailure ||
      record.execution.effectObserved
    )
      deny();
    return true;
  }
  private async claim(
    record: TransferRecord,
  ): Promise<WalletAttemptClaim | null> {
    return record.execution?.plan
      ? this.database.journal.read(this.request(record))
      : null;
  }
  private async receipt(record: TransferRecord): Promise<ExecutionReceipt> {
    const execution = record.execution;
    if (!execution || execution.integrityFailure) unknown();
    const claim = await this.claim(record);
    const dispatch = !claim
      ? 'not_started'
      : claim.state === 'succeeded'
        ? 'accepted'
        : claim.state === 'pending' || claim.state === 'dispatch'
          ? 'pending'
          : claim.state === 'failed' && claim.failure.outcome !== 'unknown'
            ? 'failed'
            : 'unknown';
    return {
      profile: this.profile,
      profile_revision: '1',
      action_id: record.approval.action.action_id,
      execution_id: execution.executionId,
      dispatch_status: dispatch,
      observation_revision: execution.observationRevision,
      outcome_scope: record.intent
        ? record.intent.input.kind === 'swap'
          ? 'swap-effects'
          : record.intent.input.kind === 'vault-deposit'
            ? 'vault-deposit-effects'
            : 'contract-execution'
        : 'token-transfer',
      next_poll_after_ms: this.config.pollIntervalSeconds * 1000,
      ...(execution.observation ?? {
        chain_status: 'unobserved',
        verification: 'unverified',
        outcome: 'unknown',
        settlement: 'pending',
        observed_at: new Date(Date.now()).toISOString(),
      }),
    };
  }
  async execute(
    input: AuthorityContext,
    id: string,
  ): Promise<ExecutionReceipt> {
    const context = structuredClone(input);
    if (
      !context.principal.scopes.includes('wallet:execute') ||
      !context.principal.scopes.includes('wallet:sign') ||
      !uuid.test(context.idempotencyKey)
    )
      deny();
    const sponsor = this.config.sponsors.find(
      (candidate) => candidate.clientId === context.principal.clientId,
    );
    if (!sponsor) deny();
    const key = fingerprint([
      'execute-transfer',
      context.principal.issuer,
      context.principal.clientId,
      context.principal.subject,
      context.idempotencyKey,
    ]);
    const identity = fingerprint([id, this.configurationHash]);
    let record = await this.actions.withAuthorizedTransfer(
      context.principal,
      id,
      (state, latest) => {
        const previous = state.idempotency[key];
        if (
          previous &&
          (previous.hash !== identity ||
            previous.id !== latest.execution?.executionId)
        )
          throw new WalletProviderError('wallet_attempt_conflict');
        if (
          latest.execution &&
          latest.execution.configurationHash !== this.configurationHash
        )
          deny();
        if (
          sponsor.binding.address.toLowerCase() ===
          latest.approval.account.address.toLowerCase()
        )
          deny();
        if (
          !latest.execution &&
          Date.parse(latest.approval.action.expires_at) <= Date.now()
        )
          deny();
        if (!latest.execution)
          latest.execution = {
            profile: this.profile,
            revision: '1',
            executionId: randomUUID(),
            signingKey: randomUUID(),
            ...(this.config.service
              ? { dispatchPrincipal: context.principal }
              : {}),
            configurationHash: this.configurationHash,
            sponsorClientId: sponsor.clientId,
            observationRevision: 0,
          };
        state.idempotency[key] = {
          hash: identity,
          id: latest.execution.executionId,
        };
        return latest;
      },
      true,
    );
    if (record.intent && this.profile !== 'approved-evm-executor-v1') deny();
    const existing = await this.claim(record);
    if (existing || record.execution?.effectObserved) {
      if (
        this.provider.recover &&
        existing?.state === 'unknown' &&
        !record.execution?.effectObserved
      ) {
        await this.openHandoff(context.principal, id, this.request(record));
        await this.provider.submit(record.execution!.plan!, {
          executionId: record.execution!.executionId,
          request: this.request(record),
          authorizeEffect: async () => {
            await this.authorize(context.principal, id, this.request(record));
          },
        });
        await this.recover(record);
      }
      return this.receipt(await this.current(context.principal, id, true));
    }
    record = await this.current(context.principal, id);
    if (!record.execution) unknown();
    if (!record.execution.plan) {
      const scanFromBlock = await this.observer.anchor();
      const signature = Signature.from(
        await this.wallet.sign(
          { ...context, idempotencyKey: record.execution.signingKey },
          id,
        ),
      );
      if (
        recoverAddress(
          record.approval.action.payload_hash,
          signature.serialized,
        ).toLowerCase() !== record.approval.account.address.toLowerCase()
      )
        unknown();
      const message = record.approval.action.payload.message;
      const plan: TransferExecutionPlan = {
        profile: this.profile,
        revision: '1',
        action: record.approval.action,
        sponsor: structuredClone(sponsor),
        configurationHash: this.configurationHash,
        genesisHash: this.config.rpc.genesisHash,
        ...(!record.intent
          ? { tokenCodeHash: this.config.rpc.tokenCodeHash! }
          : {}),
        scanFromBlock,
        ...(record.intent ? { intent: structuredClone(record.intent) } : {}),
        data: record.intent
          ? approvedCallData(record.approval.action, signature.serialized)
          : transferInterface
              .encodeFunctionData('transferWithAuthorization', [
                message.from,
                message.to,
                message.value,
                message.validAfter,
                message.validBefore,
                message.nonce,
                signature.v,
                signature.r,
                signature.s,
              ])
              .toLowerCase(),
      };
      record = await this.actions.withAuthorizedTransfer(
        context.principal,
        id,
        (_state, latest) => {
          const execution = latest.execution;
          if (
            !execution ||
            execution.executionId !== record.execution!.executionId ||
            execution.configurationHash !== this.configurationHash
          )
            deny();
          if (execution.plan) {
            // Concurrent preparations retain the first immutable plan and scan anchor.
            return latest;
          }
          execution.plan = plan;
          execution.planHash = executionPlanHash(plan);
          return latest;
        },
      );
    }
    const execution = record.execution!;
    const plan = structuredClone(execution.plan!);
    const request = this.request(record);
    await this.provider.prepare(plan);
    await this.observer.preflight(plan);
    await this.authorize(context.principal, id, request);
    const budgetId = fingerprint([
      'execution-gas',
      this.actions.onboarding.policy.provider.origin,
      context.principal.issuer,
      sponsor.clientId,
    ]);
    await this.database.setBudget(
      budgetId,
      sponsor.lifetimeBudgetWei,
      this.actions.revision,
    );
    const units = (
      BigInt(sponsor.gasLimit) * BigInt(sponsor.maxFeePerGas) +
      BigInt(sponsor.l1FeeReserveWei)
    ).toString();
    await this.database.admitAttempt({ request, budgetId, units });
    const lifecycle = createAttemptLifecycle(this.profile, {
      namespace: 'configured-execution-v1',
      journal: this.database.journal,
      authorizeAttempt: (attempt) =>
        this.authorize(context.principal, id, attempt),
    });
    await lifecycle.execute(
      request,
      async () => {
        await this.authorize(context.principal, id, request);
        if (this.config.service)
          await this.openHandoff(context.principal, id, request);
        return {
          kind: 'relay_transaction',
          transactionId: await this.provider.submit(plan, {
            executionId: execution.executionId,
            request,
            authorizeEffect: async () => {
              await this.authorize(context.principal, id, request);
            },
          }),
        };
      },
      (result) => {
        if (
          result.kind !== 'relay_transaction' ||
          !uuid.test(result.transactionId)
        )
          unknown();
        return result;
      },
    );
    return this.receipt(await this.current(context.principal, id, true));
  }
  private async openHandoff(
    principal: VerifiedPrincipal,
    id: string,
    request: WalletAttemptRequest,
  ) {
    await this.authorize(principal, id, request);
    await this.actions.withAuthorizedTransfer(
      principal,
      id,
      (_state, record) => {
        if (
          !record.execution ||
          record.execution.configurationHash !== this.configurationHash ||
          fingerprint(this.request(record)) !== fingerprint(request)
        )
          deny();
        record.execution.dispatchPrincipal = structuredClone(principal);
        record.execution.dispatchLeaseUntil = Date.now() + 30000;
      },
    );
  }
  /** Authenticated executor callback: a service identity never replaces current wallet authority. */
  async authorizeRemote(input: ExecutionAuthorityRequest) {
    if (
      !this.config.service ||
      this.config.service.providerId !== input.provider_id ||
      this.config.service.providerRevision !== input.provider_revision
    )
      deny();
    const record = await this.actions.onboarding.store.transaction(
      (state) => state.supportedActions?.[input.action_id],
    );
    const execution = record?.execution;
    if (
      !execution?.dispatchPrincipal ||
      !execution.plan ||
      execution.executionId !== input.execution_id ||
      execution.planHash !== input.plan_hash ||
      execution.dispatchLeaseUntil === undefined ||
      execution.dispatchLeaseUntil <= Date.now()
    )
      deny();
    const request = this.request(record!);
    if (request.requestHash !== input.request_hash) deny();
    await this.authorize(execution.dispatchPrincipal, input.action_id, request);
    const claim = await this.database.journal.read(request);
    if (!claim || !['pending', 'unknown'].includes(claim.state)) deny();
    await this.authorize(execution.dispatchPrincipal, input.action_id, request);
    if (execution.dispatchLeaseUntil <= Date.now()) deny();
    return { allowed: true as const, ...input };
  }
  private async recover(record: TransferRecord): Promise<string | undefined> {
    if (!this.provider.recover || !record.execution?.plan) return undefined;
    const request = this.request(record);
    const recovered = await this.provider.recover(record.execution.plan, {
      executionId: record.execution.executionId,
      request,
    });
    const claim = await this.database.journal.read(request);
    if (recovered.accepted && claim?.state === 'unknown')
      await this.database.reconcileAttempt(
        request,
        {
          kind: 'relay_transaction',
          transactionId: record.execution.executionId,
        },
        'designated-executor:' + record.execution.planHash,
        async () => recovered.accepted,
      );
    return recovered.transactionHash;
  }
  async read(
    principal: VerifiedPrincipal,
    id: string,
  ): Promise<ExecutionReceipt> {
    principal = structuredClone(principal);
    if (!principal.scopes.includes('wallet:execute:read')) deny();
    const record = await this.current(principal, id, true);
    if (!record.execution) deny();
    if (record.execution.plan) await this.refresh(id);
    return this.receipt(await this.current(principal, id, true));
  }
  async events(principal: VerifiedPrincipal, id: string, after = '0') {
    if (!principal.scopes.includes('wallet:execute:read')) deny();
    if (
      !/^(0|[1-9][0-9]{0,15})$/.test(after) ||
      !Number.isSafeInteger(Number(after))
    )
      throw new WalletProviderError('wallet_provider_input');
    return this.actions.withAuthorizedTransfer(
      principal,
      id,
      (_state, record) => {
        const execution = record.execution;
        if (!execution || execution.integrityFailure) unknown();
        const sequence = execution.eventSequence ?? 0;
        if (Number(after) > sequence)
          throw new WalletProviderError('wallet_attempt_conflict');
        const events = execution.events ?? [];
        const oldest = events[0]?.sequence ?? 0;
        return {
          profile: this.profile,
          profile_revision: '1',
          action_id: id,
          events: events.filter((event) => event.sequence > Number(after)),
          oldest_sequence: oldest,
          next_sequence: sequence,
          history_truncated: oldest > Number(after) + 1,
        };
      },
      true,
    );
  }
  /** Trusted read-only observer entry point. It never signs, claims, submits or releases reservations. */
  async refresh(id: string): Promise<void> {
    const record = await this.actions.onboarding.store.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.actions.revision
      )
        deny();
      return state.supportedActions?.[id];
    });
    if (!record?.execution?.plan || record.execution.integrityFailure) return;
    const execution = record.execution;
    const plan = structuredClone(execution.plan!);
    const claim = await this.database.journal.read(this.request(record));
    let ownHash: string | undefined;
    if (this.provider.recover) {
      try {
        ownHash = await this.recover(record);
      } catch {
        /* Preserve transport uncertainty; independent observation can still recover exact effects. */
      }
    }
    if (
      claim?.state === 'succeeded' &&
      claim.result.kind === 'relay_transaction' &&
      execution.configurationHash === this.configurationHash
    ) {
      // Lost provider status does not prevent independent chain verification.
      try {
        ownHash = await this.provider.transactionHash(
          plan,
          claim.result.transactionId,
        );
      } catch {
        /* Preserve uncertainty; never resubmit. */
      }
    }
    const candidates = [
      ...(execution.transactionHashes ?? []),
      ...(record.transactionEvents ?? [])
        .slice(-4)
        .map((event) => event.transaction_hash),
    ];
    const { scanNextBlock, ...observation } = await this.observer.observe(
      plan,
      candidates,
      ownHash,
      execution.scanNextBlock,
    );
    const eventData = await this.receipt({
      ...record,
      execution: {
        ...execution,
        observation,
        observationRevision: execution.observationRevision + 1,
      },
    });
    const stored = await this.actions.onboarding.store.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.actions.revision
      )
        deny();
      const latest = state.supportedActions?.[id]?.execution;
      if (
        !latest ||
        latest.planHash !== execution.planHash ||
        latest.observationRevision !== execution.observationRevision ||
        latest.integrityFailure
      )
        throw new WalletProviderError('wallet_attempt_pending');
      const previous = latest.observation;
      if (
        previous?.chain_status === 'finalized' &&
        (observation.chain_status !== 'finalized' ||
          observation.verification !== 'rpc-quorum' ||
          observation.block_hash !== previous.block_hash ||
          observation.transaction_hash !== previous.transaction_hash ||
          observation.outcome !== previous.outcome)
      ) {
        latest.integrityFailure = true;
        state.audit.push({
          at: Date.now(),
          event: 'execution_integrity_failure',
          resource: id,
          revision: this.actions.revision,
        });
        return false;
      }
      if (scanNextBlock) latest.scanNextBlock = scanNextBlock;
      latest.observation = observation;
      latest.observationRevision++;
      if (
        observation.verification === 'rpc-quorum' &&
        observation.outcome === 'succeeded'
      )
        latest.effectObserved = true;
      latest.transactionHashes = [
        ...new Set([
          ...(ownHash ? [ownHash] : []),
          ...(observation.transaction_hash
            ? [observation.transaction_hash]
            : []),
          ...(latest.transactionHashes ?? []),
        ]),
      ].slice(0, 8);
      if (
        !previous ||
        previous.chain_status !== observation.chain_status ||
        previous.block_hash !== observation.block_hash ||
        previous.transaction_hash !== observation.transaction_hash ||
        previous.verification !== observation.verification ||
        previous.outcome !== observation.outcome ||
        latest.lastDispatchStatus !== eventData.dispatch_status
      ) {
        const sequence = (latest.eventSequence ?? 0) + 1;
        if (!Number.isSafeInteger(sequence)) unknown();
        latest.eventSequence = sequence;
        (latest.events ??= []).push({
          specversion: '1.0',
          id: randomUUID(),
          source:
            'urn:moovha:wallet-provider-kit:execution:' +
            fingerprint(this.actions.onboarding.policy.provider.origin),
          type: 'com.moovha.wallet-provider.execution.observed.v1',
          subject: id,
          time: observation.observed_at,
          datacontenttype: 'application/json',
          sequence,
          data: eventData,
        });
        latest.events = latest.events.slice(-64);
        state.audit.push({
          at: Date.now(),
          event: 'execution_chain_observed',
          resource: id,
          revision: this.actions.revision,
        });
      }
      latest.lastDispatchStatus = eventData.dispatch_status;
      return true;
    });
    if (!stored) unknown();
  }
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const tick = async () => {
      try {
        const ids = await this.actions.onboarding.store.transaction((state) => {
          if (
            state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.actions.revision
          )
            return [];
          return Object.entries(state.supportedActions ?? {})
            .filter(
              ([, record]) =>
                record.execution?.plan &&
                !record.execution.integrityFailure &&
                record.execution.observation?.chain_status !== 'finalized',
            )
            .map(([id]) => id);
        });
        // Rotate a bounded batch so older pending actions cannot starve later attempts.
        const selected = ids.length
          ? Array.from(
              { length: Math.min(4, ids.length) },
              (_, index) => ids[(this.cursor + index) % ids.length],
            )
          : [];
        this.cursor = ids.length
          ? (this.cursor + selected.length) % ids.length
          : 0;
        await Promise.allSettled(selected.map((id) => this.refresh(id)));
      } catch {
        /* Read-only observation resumes on the next bounded poll. */
      }
      if (!this.stopped) {
        this.timer = setTimeout(
          schedule,
          this.config.pollIntervalSeconds * 1000,
        );
        this.timer.unref();
      }
    };
    const schedule = () => {
      this.running = tick();
    };
    this.timer = setTimeout(schedule, this.config.pollIntervalSeconds * 1000);
    this.timer.unref();
  }
  async close(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
}

/** Compatibility name for existing transfer integrations. */
export { ApprovedExecutionCoordinator as TransferExecutionCoordinator };
