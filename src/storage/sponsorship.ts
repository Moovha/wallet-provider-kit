import { randomUUID } from 'node:crypto';
import { WalletProviderError } from '../domain/signing.js';
import { fingerprint, uuid } from '../onboarding/policy.js';
import type { SponsorshipAdmission } from '../sponsorship/admission.js';
import type { PaymasterStubV07 } from '../sponsorship/paymaster.js';
import { bindExecutionMechanism } from './execution-binding.js';
import { StorageConnection, unavailable } from './connection.js';
import { loadApproval } from './financial.js';
import { units } from './journal.js';

export function sqliteSponsorshipStore(connection: StorageConnection) {
  const load = (id: string): SponsorshipAdmission | null => {
    if (!uuid.test(id)) throw new WalletProviderError('wallet_provider_input');
    const row = connection.get(
      'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
      'sponsorships',
      id,
    );
    return row ? JSON.parse(String(row.record)) : null;
  };
  const save = (record: SponsorshipAdmission) =>
    connection.run(
      'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET record=excluded.record',
      'sponsorships',
      record.id,
      JSON.stringify(record),
    );
  function reserveBudget(id: string, amount: string) {
    const budget = connection.get(
      'SELECT maximum,reserved FROM budgets WHERE id=?',
      id,
    );
    if (!budget) throw new WalletProviderError('wallet_authorization_denied');
    const reserved = units(String(budget.reserved)) + units(amount);
    if (reserved > units(String(budget.maximum)))
      throw new WalletProviderError('wallet_authorization_denied');
    connection.run(
      'UPDATE budgets SET reserved=? WHERE id=?',
      reserved.toString(),
      id,
    );
  }
  return {
    load,
    /** Invoke synchronously inside SupportedActions.withAuthorizedTransfer on this database. */
    reserve(
      input: Omit<SponsorshipAdmission, 'phases' | 'signingActionId'>,
    ): SponsorshipAdmission {
      connection.requireTransaction();
      const proposed = structuredClone(input),
        previous = load(proposed.id);
      if (previous) {
        const { phases: _, signingActionId: __, ...terms } = previous;
        if (fingerprint(terms) !== fingerprint(proposed))
          throw new WalletProviderError('wallet_attempt_conflict');
        return previous;
      }
      if (
        proposed.source.action.kind !== 'sign_typed_data' ||
        proposed.source.action.operation_id !== proposed.id ||
        fingerprint(loadApproval(connection, proposed.id)) !==
          fingerprint(proposed.source)
      )
        throw new WalletProviderError('wallet_authorization_denied');
      bindExecutionMechanism(connection, proposed.source, 'safe-4337-v07');
      // Both counters and mechanism selection commit together, before any usable sponsorship.
      reserveBudget(proposed.source.budgetId, proposed.source.units);
      reserveBudget(proposed.gasBudgetId, proposed.maximumCostWei);
      const record = { ...proposed, signingActionId: randomUUID(), phases: {} };
      save(record);
      connection.audit('sponsorship_reserved', record.id);
      return record;
    },
    /** Fresh exact-action authority must enclose the claim in the same shared transaction. */
    claim(id: string, stage: 'stub' | 'final', requestHash: string) {
      connection.requireTransaction();
      const record = load(id) ?? unavailable(),
        previous = record.phases[stage];
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new WalletProviderError('wallet_attempt_conflict');
        if (previous.state === 'succeeded' && previous.result)
          return { state: 'succeeded' as const, result: previous.result };
        throw new WalletProviderError(
          previous.state === 'dispatch' && previous.expiresAt > Date.now()
            ? 'wallet_attempt_pending'
            : 'wallet_attempt_unavailable',
          'unknown',
        );
      }
      const phase = {
        requestHash,
        token: randomUUID(),
        expiresAt: Date.now() + 30000,
        state: 'dispatch' as const,
      };
      record.phases[stage] = phase;
      save(record);
      connection.audit('paymaster_dispatched', id);
      return { state: 'dispatch' as const, token: phase.token };
    },
    assertDispatch(
      id: string,
      stage: 'stub' | 'final',
      token: string,
      requestHash: string,
    ) {
      connection.requireTransaction();
      const phase = load(id)?.phases[stage];
      if (
        !phase ||
        phase.state !== 'dispatch' ||
        phase.token !== token ||
        phase.requestHash !== requestHash ||
        phase.expiresAt <= Date.now()
      )
        unavailable();
      return true;
    },
    complete(
      id: string,
      stage: 'stub' | 'final',
      token: string,
      result: PaymasterStubV07 | null,
    ) {
      connection.transaction(() => {
        const record = load(id) ?? unavailable(),
          phase = record.phases[stage];
        if (
          !phase ||
          phase.state !== 'dispatch' ||
          phase.token !== token ||
          phase.expiresAt <= Date.now()
        )
          unavailable();
        phase.state = result ? 'succeeded' : 'unknown';
        if (result) phase.result = structuredClone(result);
        save(record);
        connection.audit(
          result ? 'paymaster_succeeded' : 'paymaster_unknown',
          id,
        );
      });
    },
  };
}
