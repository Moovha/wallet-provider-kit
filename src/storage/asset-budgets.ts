import { WalletProviderError } from '../domain/signing.js';
import { getAddress, ZeroAddress } from 'ethers';
import { text, uuid } from '../onboarding/policy.js';
import { fingerprint } from '../onboarding/policy.js';
import { units } from './journal.js';
import type { StorageConnection } from './connection.js';
import type { FinancialApproval } from './types.js';
import { budgetReservationId } from './budget-reservations.js';
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
  return fingerprint([
    'asset-budget-v1',
    origin,
    accountId,
    token.toLowerCase(),
  ]);
}
/** Existing exposure must already have a durable allowance marker; never reconstruct spending from opaque calls. */
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
    const row = connection.get(
      'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
      connection.recordCollection('deploymentBindings'),
      'service-v1',
    );
    const binding = row && JSON.parse(String(row.record));
    if (
      !binding ||
      binding.activeRevision !== revision ||
      binding.origin !== origin
    )
      throw new WalletProviderError('wallet_authorization_denied');
    const existing = connection.get(
      'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
      connection.recordCollection('assetBudgetBindings'),
      id,
    );
    if (!existing) {
      for (const row of connection.all(
        'SELECT DISTINCT p.record,p.fingerprint FROM approvals p JOIN admissions a ON a.approval_id=p.id WHERE p.account_id=?',
        accountId,
      )) {
        const approval: FinancialApproval = JSON.parse(String(row.record));
        if (
          fingerprint(approval) !== row.fingerprint ||
          !connection.get(
            'SELECT id FROM onboarding_records WHERE collection=? AND id=?',
            connection.recordCollection('assetReservations'),
            budgetReservationId(approval, id),
          )
        )
          throw new WalletProviderError('wallet_attempt_conflict');
      }
    }
    connection.run(
      'INSERT INTO budgets(id,maximum) VALUES(?,?) ON CONFLICT(id) DO NOTHING',
      id,
      maximum,
    );
    connection.run(
      'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET record=excluded.record',
      connection.recordCollection('assetBudgetBindings'),
      id,
      JSON.stringify({ revision }),
    );
    return id;
  });
}
