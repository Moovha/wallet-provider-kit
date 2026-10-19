import { getAddress, ZeroAddress } from 'ethers';
import { WalletProviderError } from '../domain/signing.js';
import { fingerprint, text, uuid } from '../onboarding/policy.js';
import { tokenInterface } from '../execution/operation-interfaces.js';
import { approvedCallPayload } from '../execution/approved-calls.js';
import type { FinancialApproval, AssetBudgetCharge } from './types.js';
import type { StorageConnection } from './connection.js';
import { units } from './journal.js';

/** Preserve the deployed ERC-3009 allowance identity on the supported Base Sepolia profile. */
export function assetBudgetId(
  origin: string,
  accountId: string,
  token: string,
) {
  if (
    !text(origin) ||
    !uuid.test(accountId) ||
    getAddress(token) === ZeroAddress
  )
    throw new WalletProviderError('wallet_provider_input');
  return fingerprint(['transfer', origin, accountId, token.toLowerCase()]);
}
export function validateAssetBudgetCharges(
  charges: AssetBudgetCharge[] | undefined,
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
function reservationId(approval: FinancialApproval, budgetId: string) {
  return fingerprint([
    'asset-reservation-v1',
    approval.ownerSubject,
    approval.account.accountId,
    approval.action.kind === 'sign_typed_data'
      ? approval.action.operation_id
      : approval.action.operationId,
    budgetId,
  ]);
}
function reserve(
  connection: StorageConnection,
  approval: FinancialApproval,
  charge: AssetBudgetCharge,
  historical = false,
) {
  connection.requireTransaction();
  const id = reservationId(approval, charge.budgetId),
    row = connection.get(
      'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
      'assetReservations',
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
    'assetReservations',
    id,
    JSON.stringify({ budgetId: charge.budgetId, units: charge.units }),
  );
  connection.audit(
    historical ? 'historical_asset_reserved' : 'asset_reserved',
    id,
  );
}
/** The same operation reserves each asset once across signer namespaces and SafeOp phases. */
export function reserveAssetBudgets(
  connection: StorageConnection,
  approval: FinancialApproval,
) {
  validateAssetBudgetCharges(approval.additionalBudgets);
  for (const charge of approval.additionalBudgets ?? [])
    reserve(connection, approval, charge);
}
/** Trusted activation port. Retains existing counters, never increases their ceiling, and inventories earlier generic authorizations. */
export function ensureAssetBudget(
  connection: StorageConnection,
  origin: string,
  accountId: string,
  token: string,
  maximum: string,
  revision: string,
) {
  const id = assetBudgetId(origin, accountId, token);
  if (units(maximum) === 0n || units(maximum) >= 2n ** 256n)
    throw new WalletProviderError('wallet_provider_input');
  return connection.transaction(() => {
    const binding = connection.get(
      'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
      'deploymentBindings',
      'service-v1',
    );
    if (
      !binding ||
      JSON.parse(String(binding.record)).activeRevision !== revision ||
      JSON.parse(String(binding.record)).origin !== origin
    )
      throw new WalletProviderError('wallet_authorization_denied');
    connection.run(
      'INSERT INTO budgets(id,maximum) VALUES(?,?) ON CONFLICT(id) DO NOTHING',
      id,
      maximum,
    );
    const migration = connection.get(
      'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
      'assetBudgetMigrations',
      id,
    );
    if (migration) {
      if (
        JSON.parse(String(migration.record)).profile !==
        'direct-token-transfers-v1'
      )
        throw new WalletProviderError('wallet_attempt_conflict');
    }
    const sources = new Map<string, FinancialApproval>();
    // Legacy admissions retain possible exposure. Budgeted dispatches require their atomic asset marker.
    for (const row of connection.all(
      `SELECT DISTINCT p.id,p.record,p.fingerprint FROM approvals p JOIN admissions a ON a.approval_id=p.id WHERE p.account_id=?`,
      accountId,
    )) {
      const approval: FinancialApproval = JSON.parse(String(row.record));
      if (fingerprint(approval) !== row.fingerprint)
        throw new WalletProviderError('wallet_attempt_unavailable');
      if (
        approval.action.kind !== 'sign_typed_data' ||
        approval.action.payload.primaryType === 'TransferWithAuthorization'
      )
        continue;
      if (!['SafeTx', 'SafeOp'].includes(approval.action.payload.primaryType))
        throw new WalletProviderError('wallet_attempt_conflict');
      if (
        approval.additionalBudgets?.some((charge) => charge.budgetId === id) &&
        !connection.get(
          'SELECT 1 FROM admissions a JOIN attempts t USING(namespace,provider,attempt_id) WHERE a.approval_id=? LIMIT 1',
          String(row.id),
        )
      )
        continue;
      sources.set(approval.action.operation_id, approval);
    }
    for (const row of connection.all(
      'SELECT record FROM onboarding_records WHERE collection=?',
      'sponsorships',
    )) {
      const source: FinancialApproval = JSON.parse(String(row.record)).source;
      if (source.account.accountId === accountId)
        sources.set(
          source.action.kind === 'sign_typed_data'
            ? source.action.operation_id
            : source.action.operationId,
          source,
        );
    }
    for (const [operationId, approval] of sources) {
      if (
        connection.get(
          'SELECT id FROM onboarding_records WHERE collection=? AND id=?',
          'assetReservations',
          reservationId(approval, id),
        )
      )
        continue;
      const row = connection.get(
        'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
        'supportedActions',
        operationId,
      );
      const record = row && JSON.parse(String(row.record));
      if (
        !record?.intent ||
        record.approval.account.accountId !== accountId ||
        record.approval.ownerSubject !== approval.ownerSubject ||
        record.approval.action.operation_id !== operationId ||
        record.approval.additionalBudgets?.some(
          (charge: AssetBudgetCharge) => charge.budgetId === id,
        )
      )
        throw new WalletProviderError('wallet_attempt_conflict');
      const stored = connection.get(
        'SELECT fingerprint FROM approvals WHERE id=?',
        record.approval.action.action_id,
      );
      if (!stored || stored.fingerprint !== fingerprint(record.approval))
        throw new WalletProviderError('wallet_attempt_conflict');
      if (
        record.approval.action.kind !== 'sign_typed_data' ||
        fingerprint(approvedCallPayload(record.intent)) !==
          fingerprint(record.approval.action.payload)
      )
        throw new WalletProviderError('wallet_attempt_conflict');
      let amount = 0n;
      for (const call of record.intent.calls) {
        // Migration is intentionally limited to attributable direct ERC-20 transfers. Opaque historical calls require review.
        if (
          call.value !== '0' ||
          !call.data.startsWith(
            tokenInterface.getFunction('transfer')!.selector,
          )
        )
          throw new WalletProviderError('wallet_attempt_conflict');
        const decoded = tokenInterface.decodeFunctionData(
          'transfer',
          call.data,
        );
        if (
          tokenInterface
            .encodeFunctionData('transfer', decoded)
            .toLowerCase() !== call.data
        )
          throw new WalletProviderError('wallet_attempt_conflict');
        if (call.to.toLowerCase() === token.toLowerCase())
          amount += BigInt(decoded[1]);
      }
      if (amount > 0n)
        reserve(
          connection,
          record.approval,
          { budgetId: id, units: amount.toString(), maximum },
          true,
        );
    }
    connection.run(
      'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET record=excluded.record',
      'assetBudgetMigrations',
      id,
      JSON.stringify({ revision, profile: 'direct-token-transfers-v1' }),
    );
    connection.audit('asset_budget_migrated', id);
    return id;
  });
}
