import { executionAttemptInput } from './protocol.js';
import { includedExecution } from '../execution/inclusion.js';
import type {
  ReplacementAttempt,
  ReplacementStatus,
} from '../execution/replacement.js';
import {
  emptyOperationsState,
  recordPayer,
  recordReplacement,
  payerKey,
  type OperationsState,
  type PayerOperations,
} from '../execution/operations.js';
import type { RecoveryDiagnosis } from '../execution/recovery.js';
import { resolve } from 'node:path';
import { StorageConnection } from '../storage/connection.js';
import {
  admission,
  reconcileAttempt,
  sqliteJournal,
  units,
} from '../storage/journal.js';
import { createWalletAttemptRequest } from '../providers/attempt-lifecycle.js';
import { WalletProviderError } from '../domain/signing.js';
import type { ChainObservation } from '../execution/types.js';
import type {
  ExecutionServiceConfiguration,
  ExecutorProviderConfiguration,
} from './config.js';
import {
  executorProviderIdentity,
  type ExecutionDispatch,
} from './protocol.js';
import { serviceHash } from './auth.js';

export interface ExecutorRecord {
  walletOrigin: string;
  dispatch: ExecutionDispatch;
  identityHash: string;
  revision: string;
  providerHash: string;
  observation?: ChainObservation;
  observationRevision: number;
  startedAt?: number;
  providerNonce?: string;
  recovery?: RecoveryDiagnosis;
  replacements?: ReplacementAttempt[];
  replacementStatus?: ReplacementStatus;
  scanNextBlock?: string;
  transactionHashes?: string[];
  integrityFailure?: boolean;
  effectObserved?: boolean;
}

/** Separate local database, verified against the existing toolkit catalog before use. No schema migration. */
export function openExecutorDatabase(
  config: ExecutionServiceConfiguration,
  directory: string,
) {
  const connection = new StorageConnection({
    directory: resolve(directory, config.storage.directory),
  });
  const revision = serviceHash(config);
  const binding = {
    origin: config.origin,
    binding: config.binding,
    profile: config.profile,
  };
  function getRecord<T>(
    collection:
      | 'executorBindings'
      | 'executorDispatches'
      | 'executorNonces'
      | 'executorQuarantines'
      | 'operations',
    id: string,
  ): T | undefined {
    const row = connection.get(
      'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
      collection,
      id,
    );
    return row ? (JSON.parse(String(row.record)) as T) : undefined;
  }
  function save(
    collection:
      | 'executorBindings'
      | 'executorDispatches'
      | 'executorNonces'
      | 'executorQuarantines'
      | 'operations',
    id: string,
    record: unknown,
  ) {
    connection.run(
      'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET record=excluded.record',
      collection,
      id,
      JSON.stringify(record),
    );
  }
  function fence() {
    if (
      getRecord<{ revision: string }>('executorBindings', 'service-v1')
        ?.revision !== revision ||
      !config.activation.enabled
    )
      throw new WalletProviderError('wallet_authorization_denied');
  }
  try {
    connection.transaction(() => {
      const previous = getRecord<{
        binding: typeof binding;
        revision: string;
        providers?: Record<string, string>;
      }>('executorBindings', 'service-v1');
      if (
        previous
          ? serviceHash(previous.binding) !== serviceHash(binding)
          : !!connection.get(
              'SELECT 1 FROM onboarding_records UNION ALL SELECT 1 FROM budgets UNION ALL SELECT 1 FROM approvals UNION ALL SELECT 1 FROM admissions UNION ALL SELECT 1 FROM attempts UNION ALL SELECT 1 FROM financial_audit UNION ALL SELECT 1 FROM onboarding_audit UNION ALL SELECT 1 FROM enrollments LIMIT 1',
            )
      )
        throw new WalletProviderError('wallet_provider_configuration');
      const manifest: Record<string, string> = {
        ...(previous?.providers ?? {}),
      };
      for (const provider of config.providers) {
        const key = provider.id + ':' + provider.revision;
        const hash = serviceHash(executorProviderIdentity(provider));
        if (manifest[key] && manifest[key] !== hash)
          throw new WalletProviderError('wallet_provider_configuration');
        manifest[key] = hash;
      }
      if (Object.keys(manifest).length > 4096)
        throw new WalletProviderError('wallet_provider_configuration');
      save('executorBindings', 'service-v1', {
        binding,
        revision,
        providers: manifest,
      });
    });
  } catch (error) {
    connection.close();
    throw error;
  }
  const journal = sqliteJournal(connection, fence);
  function request(record: ExecutorRecord) {
    return createWalletAttemptRequest(
      'designated-execution-v1',
      'designated-execution-v1',
      'relay_transaction',
      record.dispatch.plan.sponsor.accountId,
      record.dispatch.execution_id,
      record.walletOrigin + ':' + record.dispatch.plan.action.action_id,
      { ...record.dispatch, plan: executionAttemptInput(record.dispatch.plan) },
    );
  }
  function load(id: string, walletOrigin: string) {
    fence();
    const record = getRecord<ExecutorRecord>('executorDispatches', id);
    const provider = record
      ? config.providers.find(
          (entry) =>
            entry.id === record.dispatch.provider_id &&
            entry.revision === record.dispatch.provider_revision,
        )
      : undefined;
    if (record && !provider)
      throw new WalletProviderError('wallet_authorization_denied');
    if (
      record &&
      (record.walletOrigin !== walletOrigin ||
        record.identityHash !== serviceHash(record.dispatch) ||
        record.providerHash !==
          serviceHash(executorProviderIdentity(provider!)) ||
        record.integrityFailure)
    )
      throw new WalletProviderError('wallet_authorization_denied');
    return record;
  }
  function quarantineKey(address: string) {
    return serviceHash(['payer', address.toLowerCase()]);
  }
  function quarantined(address: string) {
    fence();
    return !!getRecord<{ executionIds: string[] }>(
      'executorQuarantines',
      quarantineKey(address),
    )?.executionIds.length;
  }
  return {
    quarantined,
    replacementTransaction<T>(
      record: ExecutorRecord,
      operation: (current: ExecutorRecord) => T,
      operations?: PayerOperations,
    ): T {
      return connection.transaction(() => {
        const current = load(record.dispatch.execution_id, record.walletOrigin);
        if (!current || current.identityHash !== record.identityHash)
          throw new WalletProviderError('wallet_authorization_denied');
        const previous = serviceHash(current.replacementStatus ?? null);
        const previousAttempt = serviceHash(
          current.replacements?.at(-1) ?? null,
        );
        const result = operation(current);
        const last = current.replacements?.at(-1);
        if (
          last &&
          previousAttempt !== serviceHash(last) &&
          previous === serviceHash(current.replacementStatus ?? null)
        )
          current.replacementStatus = {
            state: last.state,
            attempts: current.replacements!.length,
            last_attempt_at: new Date(last.startedAt).toISOString(),
          };
        if (previous !== serviceHash(current.replacementStatus ?? null)) {
          connection.audit(
            'executor_replacement_observed',
            current.dispatch.execution_id,
          );
          if (operations && current.replacementStatus) {
            const state =
              getRecord<OperationsState>('operations', 'service-v1') ??
              emptyOperationsState();
            recordReplacement(
              state,
              payerKey(current.dispatch.plan.sponsor.binding.address),
              current.dispatch.execution_id,
              current.replacementStatus,
              operations.configuration,
              operations.targets,
              operations.source,
            );
            save('operations', 'service-v1', state);
          }
        }
        save('executorDispatches', current.dispatch.execution_id, current);
        return result;
      });
    },
    replacementQuarantineAllowed(
      record: ExecutorRecord,
      nonce: string,
    ): boolean {
      fence();
      const address =
        record.dispatch.plan.sponsor.binding.address.toLowerCase();
      const blocked =
        getRecord<{ executionIds: string[] }>(
          'executorQuarantines',
          quarantineKey(address),
        )?.executionIds ?? [];
      const records = connection
        .all(
          "SELECT record FROM onboarding_records WHERE collection='executorDispatches'",
        )
        .map((row) => JSON.parse(String(row.record)) as ExecutorRecord);
      return blocked.every((id) => {
        const entry = records.find(
          (entry) => entry.dispatch.execution_id === id,
        );
        return (
          !!entry &&
          !entry.integrityFailure &&
          entry.dispatch.plan.sponsor.binding.address.toLowerCase() ===
            address &&
          (id === record.dispatch.execution_id
            ? entry.recovery?.reason === 'pending-too-long'
            : entry.recovery?.reason === 'nonce-gap-suspected' &&
              entry.providerNonce !== undefined &&
              BigInt(entry.providerNonce) > BigInt(nonce))
        );
      });
    },
    operations<T>(operation: (state: OperationsState) => T): Promise<T> {
      return Promise.resolve(
        connection.transaction(() => {
          fence();
          const state =
            getRecord<OperationsState>('operations', 'service-v1') ??
            emptyOperationsState();
          const result = operation(state);
          save('operations', 'service-v1', state);
          return result;
        }),
      );
    },
    pendingRecovery() {
      fence();
      return connection
        .all(
          "SELECT record FROM onboarding_records WHERE collection='executorDispatches'",
        )
        .map((row) => JSON.parse(String(row.record)) as ExecutorRecord)
        .filter(
          (record) =>
            (record.observation?.chain_status !== 'finalized' ||
              (record.replacementStatus &&
                record.replacementStatus.state !== 'settled')) &&
            config.providers.some(
              (provider) =>
                provider.id === record.dispatch.provider_id &&
                provider.revision === record.dispatch.provider_revision &&
                provider.recovery,
            ),
        );
    },
    recovery(
      record: ExecutorRecord,
      diagnosis: RecoveryDiagnosis,
      fresh: boolean,
      operations?: PayerOperations,
    ) {
      return connection.transaction(() => {
        const latest = load(record.dispatch.execution_id, record.walletOrigin);
        if (
          !latest ||
          latest.identityHash !== record.identityHash ||
          latest.observationRevision !== record.observationRevision
        )
          throw new WalletProviderError('wallet_attempt_pending');
        latest.startedAt ??= record.startedAt ?? Date.now();
        latest.providerNonce ??= diagnosis.sponsor_nonce;
        const previous = latest.recovery;
        latest.recovery = diagnosis;
        latest.observationRevision++;
        const key = quarantineKey(latest.dispatch.plan.sponsor.binding.address);
        const current =
          getRecord<{ executionIds: string[] }>('executorQuarantines', key)
            ?.executionIds ?? [];
        if (diagnosis.quarantined)
          save('executorQuarantines', key, {
            executionIds: [
              ...new Set([...current, latest.dispatch.execution_id]),
            ],
          });
        else if (
          fresh &&
          diagnosis.state === 'finalized' &&
          latest.observation?.chain_status === 'finalized' &&
          latest.observation.verification === 'rpc-quorum' &&
          !latest.integrityFailure
        )
          save('executorQuarantines', key, {
            executionIds: current.filter(
              (id) => id !== latest.dispatch.execution_id,
            ),
          });
        diagnosis.quarantined = !!getRecord<{ executionIds: string[] }>(
          'executorQuarantines',
          key,
        )?.executionIds.length;
        save('executorDispatches', latest.dispatch.execution_id, latest);
        if (operations) {
          const payer = latest.dispatch.plan.sponsor.binding.address;
          const affected =
            quarantined(payer) ||
            connection
              .all(
                "SELECT record FROM onboarding_records WHERE collection='executorDispatches'",
              )
              .map((row) => JSON.parse(String(row.record)) as ExecutorRecord)
              .some(
                (entry) =>
                  entry.dispatch.plan.sponsor.binding.address.toLowerCase() ===
                    payer.toLowerCase() &&
                  (entry.integrityFailure ||
                    (entry.observation?.chain_status !== 'finalized' &&
                      ['suspected-stuck', 'blocked', 'unavailable'].includes(
                        entry.recovery?.state ?? '',
                      ))),
              );
          const state =
            getRecord<OperationsState>('operations', 'service-v1') ??
            emptyOperationsState();
          recordPayer(
            state,
            payerKey(payer),
            {
              affected,
              reason: affected
                ? diagnosis.quarantined
                  ? 'payer-quarantined'
                  : diagnosis.reason
                : 'none',
            },
            operations.configuration,
            operations.targets,
            operations.source,
          );
          save('operations', 'service-v1', state);
        }

        if (
          previous?.state !== diagnosis.state ||
          previous?.reason !== diagnosis.reason
        )
          connection.audit(
            'executor_recovery_observed',
            latest.dispatch.execution_id,
          );
        return latest;
      });
    },
    journal,
    request,
    load,
    fence,
    revision,
    ready: async () => {
      try {
        fence();
        return await connection.ready();
      } catch {
        return false;
      }
    },
    close: () => connection.close(),
    admit(
      walletOrigin: string,
      dispatch: ExecutionDispatch,
      provider: ExecutorProviderConfiguration,
    ) {
      return connection.transaction(() => {
        fence();
        const previous = load(dispatch.execution_id, walletOrigin);
        if (previous) {
          if (previous.identityHash !== serviceHash(dispatch))
            throw new WalletProviderError('wallet_attempt_conflict');
          return previous;
        }
        if (dispatch.plan.intent) {
          const key = serviceHash([
            'safe-nonce',
            dispatch.plan.intent.account.address.toLowerCase(),
            dispatch.plan.intent.nonce,
          ]);
          const reservation = getRecord<{
            executionId: string;
            walletOrigin: string;
          }>('executorNonces', key);
          if (
            reservation &&
            (reservation.executionId !== dispatch.execution_id ||
              reservation.walletOrigin !== walletOrigin)
          )
            throw new WalletProviderError('wallet_attempt_conflict');
          save('executorNonces', key, {
            executionId: dispatch.execution_id,
            walletOrigin,
          });
        }
        const sponsor = provider.sponsors.find(
          (entry) => entry.accountId === dispatch.plan.sponsor.accountId,
        )!;
        if (quarantined(sponsor.binding.address))
          throw new WalletProviderError('wallet_attempt_pending');
        if (provider.sponsorPool) {
          const active = connection
            .all(
              "SELECT record FROM onboarding_records WHERE collection='executorDispatches'",
            )
            .map((row) => JSON.parse(String(row.record)) as ExecutorRecord)
            .filter(
              (entry) =>
                entry.dispatch.plan.sponsor.binding.address.toLowerCase() ===
                  sponsor.binding.address.toLowerCase() &&
                !(
                  (entry.dispatch.plan.profile === 'approved-evm-executor-v1' &&
                    includedExecution(entry)) ||
                  (entry.observation?.chain_status === 'finalized' &&
                    entry.observation.verification === 'rpc-quorum' &&
                    !entry.integrityFailure)
                ),
            );
          if (active.length >= provider.sponsorPool.maxInFlightPerSponsor)
            throw new WalletProviderError('wallet_attempt_pending');
        }
        const budgetId = serviceHash([
          'executor-gas',
          config.origin,
          provider.id,
          sponsor.clientId,
        ]);
        const maximum = config.providers
          .filter((entry) => entry.id === provider.id)
          .flatMap((entry) =>
            entry.sponsors.filter(
              (binding) => binding.clientId === sponsor.clientId,
            ),
          )
          .map((binding) => units(binding.lifetimeBudgetWei))
          .reduce(
            (minimum, value) => (value < minimum ? value : minimum),
            units(sponsor.lifetimeBudgetWei),
          );
        const budget = connection.get(
          'SELECT reserved FROM budgets WHERE id=?',
          budgetId,
        );
        if (budget && units(String(budget.reserved)) > maximum)
          throw new WalletProviderError('wallet_attempt_conflict');
        connection.run(
          'INSERT INTO budgets(id,maximum) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET maximum=excluded.maximum',
          budgetId,
          maximum.toString(),
        );
        const record: ExecutorRecord = {
          walletOrigin,
          dispatch: structuredClone(dispatch),
          identityHash: serviceHash(dispatch),
          revision,
          providerHash: serviceHash(executorProviderIdentity(provider)),
          observationRevision: 0,
          startedAt: Date.now(),
        };
        admission(connection, {
          request: request(record),
          budgetId,
          units: (
            BigInt(sponsor.gasLimit) * BigInt(sponsor.maxFeePerGas) +
            BigInt(sponsor.l1FeeReserveWei)
          ).toString(),
        });
        save('executorDispatches', dispatch.execution_id, record);
        return record;
      });
    },
    observe(
      record: ExecutorRecord,
      observation: ChainObservation,
      scanNextBlock?: string,
      operations?: PayerOperations,
    ) {
      return connection.transaction(() => {
        const latest = load(record.dispatch.execution_id, record.walletOrigin);
        if (
          !latest ||
          latest.identityHash !== record.identityHash ||
          latest.observationRevision !== record.observationRevision
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
          if (operations) {
            const state =
              getRecord<OperationsState>('operations', 'service-v1') ??
              emptyOperationsState();
            recordPayer(
              state,
              payerKey(latest.dispatch.plan.sponsor.binding.address),
              { affected: true, reason: 'integrity-failure' },
              operations.configuration,
              operations.targets,
              operations.source,
            );
            save('operations', 'service-v1', state);
          }
          const provider = config.providers.find(
            (entry) =>
              entry.id === latest.dispatch.provider_id &&
              entry.revision === latest.dispatch.provider_revision,
          );
          if (provider?.recovery?.quarantineOnStuck) {
            const key = quarantineKey(
              latest.dispatch.plan.sponsor.binding.address,
            );
            const previous =
              getRecord<{ executionIds: string[] }>('executorQuarantines', key)
                ?.executionIds ?? [];
            save('executorQuarantines', key, {
              executionIds: [
                ...new Set([...previous, latest.dispatch.execution_id]),
              ],
            });
          }
          save('executorDispatches', latest.dispatch.execution_id, latest);
          connection.audit(
            'executor_integrity_failure',
            latest.dispatch.execution_id,
          );
          return false;
        }
        if (
          observation.verification === 'rpc-quorum' &&
          observation.outcome === 'succeeded'
        )
          latest.effectObserved = true;
        latest.observation = observation;
        latest.observationRevision++;
        if (scanNextBlock) latest.scanNextBlock = scanNextBlock;
        latest.transactionHashes = [
          ...new Set([
            ...(observation.transaction_hash
              ? [observation.transaction_hash]
              : []),
            ...(latest.transactionHashes ?? []),
          ]),
        ].slice(0, 8);
        save('executorDispatches', latest.dispatch.execution_id, latest);
        connection.audit('executor_observed', latest.dispatch.execution_id);
        return true;
      });
    },
    reconcile: (
      input: Parameters<typeof reconcileAttempt>[1],
      result: Parameters<typeof reconcileAttempt>[2],
      evidence: string,
      verify: Parameters<typeof reconcileAttempt>[4],
    ) => reconcileAttempt(connection, input, result, evidence, verify),
  };
}
export type ExecutorDatabase = ReturnType<typeof openExecutorDatabase>;
