import type { ProviderState } from '../onboarding/types.js';
import { getRecord, putRecord } from '../onboarding/records.js';
import { canonicalHash } from '../domain/canonical.js';
import { WalletProviderError } from '../domain/signing.js';

/** Split the legacy runtime wallet map in the same transaction as its replacement records. */
export function prepareSafeWalletRecords(state: ProviderState): void {
  const registry = getRecord(
    state,
    'deploymentBindings',
    'service-v1',
  )?.runtimeConfiguration;
  if (!registry?.safeWalletAccounts) return;
  for (const [id, wallet] of Object.entries(registry.safeWalletAccounts)) {
    const existing = getRecord(state, 'safeWalletAccounts', id);
    if (
      wallet.accountId !== id ||
      (existing && canonicalHash(existing) !== canonicalHash(wallet))
    )
      throw new WalletProviderError('wallet_provider_configuration');
    if (!existing) putRecord(state, 'safeWalletAccounts', id, wallet);
  }
  delete registry.safeWalletAccounts;
}
export function safeWalletRecord(state: ProviderState, id: string) {
  prepareSafeWalletRecords(state);
  return getRecord(state, 'safeWalletAccounts', id);
}
