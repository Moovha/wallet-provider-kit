import { WalletProviderError } from '../domain/signing.js';
import { fingerprint, text } from '../onboarding/policy.js';
import type { FinancialApproval, PolicyBudgetCharge } from './types.js';
import type { StorageConnection } from './connection.js';
import { units } from './journal.js';

export function validateAdditionalBudgets(
  charges: PolicyBudgetCharge[] | undefined,
) {
  if (charges === undefined) return;
  if (!Array.isArray(charges) || !charges.length || charges.length > 16)
    throw new WalletProviderError('wallet_provider_input');
  const ids = new Set<string>();
  for (const charge of charges) {
    if (
      !charge ||
      Object.keys(charge).sort().join(',') !== 'budgetId,maximum,units' ||
      !text(charge.budgetId) ||
      ids.has(charge.budgetId) ||
      units(charge.units) === 0n ||
      units(charge.maximum) === 0n ||
      units(charge.maximum) >= 2n ** 256n ||
      units(charge.units) > units(charge.maximum)
    )
      throw new WalletProviderError('wallet_provider_input');
    ids.add(charge.budgetId);
  }
}
export function budgetReservationId(
  approval: FinancialApproval,
  budgetId: string,
) {
  return fingerprint([
    // Preserve existing durable reservation identities.
    'asset-reservation-v1',
    approval.ownerSubject,
    approval.account.accountId,
    approval.action.operation_id,
    budgetId,
  ]);
}
export function reserveAdditionalBudget(
  connection: StorageConnection,
  approval: FinancialApproval,
  charge: PolicyBudgetCharge,
  historical = false,
) {
  connection.requireTransaction();
  const id = budgetReservationId(approval, charge.budgetId),
    row = connection.get(
      'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
      connection.recordCollection('assetReservations'),
      id,
    );
  if (row) {
    const prior = JSON.parse(String(row.record));
    if (prior.budgetId !== charge.budgetId || prior.units !== charge.units)
      throw new WalletProviderError('wallet_attempt_conflict');
    return;
  }
  const budget = connection.get(
    'SELECT maximum,reserved FROM budgets WHERE id=?',
    charge.budgetId,
  );
  if (!budget) throw new WalletProviderError('wallet_authorization_denied');
  const reserved = units(String(budget.reserved)) + units(charge.units);
  if (
    !historical &&
    (reserved > units(String(budget.maximum)) ||
      reserved > units(charge.maximum))
  )
    throw new WalletProviderError('wallet_authorization_denied');
  connection.run(
    'UPDATE budgets SET reserved=? WHERE id=?',
    reserved.toString(),
    charge.budgetId,
  );
  connection.run(
    'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?)',
    connection.recordCollection('assetReservations'),
    id,
    JSON.stringify({ budgetId: charge.budgetId, units: charge.units }),
  );
  connection.audit(
    historical ? 'historical_asset_reserved' : 'asset_reserved',
    id,
  );
}
/** Reserve optional policy charges once per operation across signer namespaces and SafeOp phases. */
export function reserveAdditionalBudgets(
  connection: StorageConnection,
  approval: FinancialApproval,
) {
  validateAdditionalBudgets(approval.additionalBudgets);
  for (const charge of approval.additionalBudgets ?? [])
    reserveAdditionalBudget(connection, approval, charge);
}
