import type { PayerOperations } from '../execution/operations.js';
import { WalletProviderError } from '../domain/signing.js';
import { serviceHash } from './auth.js';
import {
  assertReplacement,
  proposeReplacement,
  type ReplacementAuthority,
  type ReplacementAttempt,
} from '../execution/replacement.js';
import type {
  ExecutionProvider,
  ExecutionObserver,
} from '../execution/types.js';
import type { ExecutorDatabase, ExecutorRecord } from './storage.js';

function deny(): never {
  throw new WalletProviderError('wallet_authorization_denied');
}
/** A claimed mutation is never retried. Uncertain responses recover through independent read-only evidence. */
export class ReplacementWorker {
  constructor(
    private readonly database: ExecutorDatabase,
    private readonly provider: ExecutionProvider,
    private readonly observer: ExecutionObserver,
    private readonly authorize: (
      record: ExecutorRecord,
      authority: ReplacementAuthority,
    ) => Promise<void>,
    private readonly operations?: PayerOperations,
  ) {}
  private mutate<T>(
    record: ExecutorRecord,
    operation: (record: ExecutorRecord) => T,
  ): T {
    return this.database.replacementTransaction(
      record,
      operation,
      this.operations,
    );
  }
  async run(record: ExecutorRecord): Promise<void> {
    record = structuredClone(record);
    let plan = record.dispatch.plan;
    if (
      !plan.replacement ||
      !this.provider.replace ||
      !this.provider.inspect ||
      !this.observer.nonceSnapshot
    )
      return;
    const current = this.database.load(
      record.dispatch.execution_id,
      record.walletOrigin,
    );
    if (!current) return;
    record = current;
    plan = structuredClone(current.dispatch.plan);
    if (!plan.replacement) return;
    const claim = await this.database.journal.read(
      this.database.request(record),
    );
    if (
      claim?.state !== 'succeeded' ||
      claim.result.kind !== 'relay_transaction'
    )
      return;
    const providerId = claim.result.transactionId;
    let last = record.replacements?.at(-1);
    if (
      record.replacementStatus &&
      record.observation?.chain_status === 'finalized'
    ) {
      try {
        const evidence = await this.observer.nonceSnapshot(
          plan,
          record.observation.transaction_hash,
        );
        if (
          BigInt(evidence.finalizedNonce) >
          BigInt(last?.proposal.nonce ?? record.providerNonce ?? deny())
        )
          this.mutate(record, (latest) => {
            const attempt = latest.replacements?.at(-1);
            if (
              (!last && !attempt) ||
              attempt?.proposal.id === last?.proposal.id
            ) {
              if (attempt) attempt.state = 'settled';
              latest.replacementStatus = {
                state: 'settled',
                attempts: latest.replacements?.length ?? 0,
                ...(attempt
                  ? {
                      last_attempt_at: new Date(
                        attempt.startedAt,
                      ).toISOString(),
                    }
                  : {}),
              };
            }
          });
      } catch {
        /* Financial finality remains independent of replacement status. */
      }
      return;
    }
    if (last && ['dispatch', 'accepted', 'unknown'].includes(last.state)) {
      if (last.state === 'dispatch' && last.leaseUntil > Date.now()) return;
      if (last.state === 'dispatch')
        this.mutate(record, (latest) => {
          const attempt = latest.replacements?.at(-1);
          if (
            attempt?.proposal.id === last!.proposal.id &&
            attempt.state === 'dispatch' &&
            attempt.leaseUntil <= Date.now()
          )
            attempt.state = 'unknown';
        });
      try {
        const hint = await this.provider.inspect(plan, providerId);
        const hash = last.transactionHash ?? hint.transactionHash;
        if (!hash) return;
        const evidence = await this.observer.nonceSnapshot(plan, hash);
        if (
          evidence.transactionNonce !== last.proposal.nonce ||
          evidence.transactionMaxFeePerGas !== last.proposal.maxFeePerGas ||
          evidence.transactionMaxPriorityFeePerGas !==
            last.proposal.maxPriorityFeePerGas ||
          hash === last.proposal.previousTransactionHash
        )
          return;
        this.mutate(record, (latest) => {
          const attempt = latest.replacements?.find(
            (entry) => entry.proposal.id === last!.proposal.id,
          );
          if (
            !attempt ||
            !['dispatch', 'accepted', 'unknown'].includes(attempt.state)
          )
            return;
          attempt.state = 'observed';
          attempt.transactionHash = hash;
          latest.transactionHashes = [
            ...new Set([
              hash,
              ...(latest.transactionHashes ?? []),
              last!.proposal.previousTransactionHash,
            ]),
          ].slice(0, 8);
        });
      } catch {
        return;
      }
      record = this.database.load(
        record.dispatch.execution_id,
        record.walletOrigin,
      )!;
      last = record.replacements?.at(-1);
    }
    if (last?.state === 'prepared') {
      if (last.leaseUntil <= Date.now())
        this.mutate(record, (latest) => {
          const attempt = latest.replacements?.at(-1);
          if (
            attempt?.proposal.id === last!.proposal.id &&
            attempt.state === 'prepared'
          )
            attempt.state = 'abandoned';
        });
      return;
    }
    if (
      (record.replacements?.length ?? 0) >=
        Number(plan.replacement.maxAttempts) &&
      (!last || ['observed', 'abandoned'].includes(last.state)) &&
      !record.effectObserved &&
      record.observation?.chain_status !== 'finalized'
    ) {
      this.mutate(record, (latest) => {
        latest.replacementStatus = {
          state: 'exhausted',
          attempts: latest.replacements?.length ?? 0,
          reason: 'attempt-limit',
          ...(last
            ? { last_attempt_at: new Date(last.startedAt).toISOString() }
            : {}),
        };
      });
      return;
    }
    if (
      record.integrityFailure ||
      record.effectObserved ||
      ['included', 'safe', 'finalized'].includes(
        record.observation?.chain_status ?? '',
      ) ||
      record.recovery?.reason !== 'pending-too-long' ||
      Date.now() - (record.startedAt ?? Date.now()) < 30000 ||
      (last && !['observed', 'abandoned'].includes(last.state)) ||
      (last &&
        Date.now() - last.startedAt <
          Number(plan.replacement.intervalSeconds) * 1000) ||
      (record.replacements?.length ?? 0) >=
        Number(plan.replacement.maxAttempts) ||
      Date.parse(plan.action.expires_at) <= Date.now()
    )
      return;
    let proposal: import('../execution/replacement.js').ReplacementProposal;
    try {
      await this.provider.prepare(plan);
      await this.observer.preflight(plan);
      const inspection = await this.provider.inspect(plan, providerId);
      const snapshot = await this.observer.nonceSnapshot(
        plan,
        inspection.transactionHash,
      );
      const bump = (value: string) =>
        (BigInt(value) * (10000n + BigInt(plan.replacement!.bumpBasisPoints)) +
          9999n) /
        10000n;
      if (
        snapshot.transactionMaxFeePerGas !== undefined &&
        snapshot.transactionMaxPriorityFeePerGas !== undefined &&
        (bump(snapshot.transactionMaxFeePerGas) >
          BigInt(plan.sponsor.maxFeePerGas) ||
          bump(snapshot.transactionMaxPriorityFeePerGas) >
            BigInt(plan.sponsor.maxPriorityFeePerGas))
      ) {
        this.mutate(record, (latest) => {
          latest.replacementStatus = {
            state: 'exhausted',
            attempts: latest.replacements?.length ?? 0,
            reason: 'fee-cap',
          };
        });
        return;
      }
      proposal = proposeReplacement(
        plan,
        (record.replacements?.length ?? 0) + 1,
        snapshot,
      );
    } catch {
      this.mutate(record, (latest) => {
        latest.replacementStatus = {
          state: 'blocked',
          attempts: latest.replacements?.length ?? 0,
          reason: 'evidence-unavailable',
        };
      });
      return;
    }
    if (!this.database.replacementQuarantineAllowed(record, proposal.nonce))
      deny();
    const attempt = this.mutate(
      record,
      (latest): ReplacementAttempt | undefined => {
        if (
          latest.integrityFailure ||
          latest.effectObserved ||
          ['included', 'safe', 'finalized'].includes(
            latest.observation?.chain_status ?? '',
          ) ||
          latest.recovery?.reason !== 'pending-too-long' ||
          (latest.replacements?.length ?? 0) !== proposal.sequence - 1 ||
          !this.database.replacementQuarantineAllowed(latest, proposal.nonce)
        )
          return;
        const attempts = (latest.replacements ??= []);
        const previous = attempts.at(-1);
        if (
          previous &&
          (!['observed', 'abandoned'].includes(previous.state) ||
            Date.now() - previous.startedAt <
              Number(plan.replacement!.intervalSeconds) * 1000)
        )
          return;
        const created: ReplacementAttempt = {
          proposal,
          state: 'prepared',
          startedAt: Date.now(),
          leaseUntil: Date.now() + 60000,
        };
        attempts.push(created);
        return structuredClone(created);
      },
    );
    if (!attempt) return;
    let dispatch = false;
    try {
      await this.authorize(record, { proposal, phase: 'prepare' });
      this.mutate(record, (latest) => {
        const current = latest.replacements?.at(-1);
        if (
          !current ||
          current.proposal.id !== proposal.id ||
          current.state !== 'prepared' ||
          current.leaseUntil <= Date.now()
        )
          deny();
        current.state = 'dispatch';
        dispatch = true;
      });
      const hash = await this.provider.replace(
        plan,
        providerId,
        proposal,
        async () => {
          const latest =
            this.database.load(
              record.dispatch.execution_id,
              record.walletOrigin,
            ) ?? deny();
          const current = latest.replacements?.at(-1);
          if (
            current?.state !== 'dispatch' ||
            current.leaseUntil <= Date.now() ||
            serviceHash(current.proposal) !== serviceHash(proposal) ||
            latest.effectObserved ||
            !this.database.replacementQuarantineAllowed(latest, proposal.nonce)
          )
            deny();
          assertReplacement(
            plan,
            proposal,
            await this.observer.nonceSnapshot!(
              plan,
              proposal.previousTransactionHash,
            ),
          );
          await this.authorize(latest, { proposal, phase: 'dispatch' });
        },
      );
      if (
        !/^0x[0-9a-f]{64}$/.test(hash) ||
        hash === proposal.previousTransactionHash
      )
        throw new WalletProviderError('wallet_provider_response', 'unknown');
      this.mutate(record, (latest) => {
        const current = latest.replacements?.at(-1);
        if (
          !current ||
          current.proposal.id !== proposal.id ||
          current.state !== 'dispatch'
        )
          deny();
        current.state = 'accepted';
        current.transactionHash = hash;
        latest.transactionHashes = [
          ...new Set([
            hash,
            proposal.previousTransactionHash,
            ...(latest.transactionHashes ?? []),
          ]),
        ].slice(0, 8);
      });
    } catch {
      this.mutate(record, (latest) => {
        const current = latest.replacements?.at(-1);
        if (
          current?.proposal.id === proposal.id &&
          ['prepared', 'dispatch'].includes(current.state)
        ) {
          current.state = dispatch ? 'unknown' : 'abandoned';
          if (!dispatch)
            latest.replacementStatus = {
              state: 'blocked',
              attempts: latest.replacements!.length,
              reason: 'authority-or-preparation-denied',
              last_attempt_at: new Date(current.startedAt).toISOString(),
            };
        }
      });
    }
  }
}
