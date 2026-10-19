import type { ApprovedCallIntent } from '../execution/approved-calls.js';
import { assetBudgetId } from '../storage/asset-budgets.js';
import type { ProviderDatabase, PolicyBudgetCharge } from '../storage/index.js';
import type { TransferPolicy } from './actions.js';

/** Resolve only allowance terms emitted by an explicitly selected policy adapter. */
export function adapterAllowanceCharges(
  intent: ApprovedCallIntent,
  origin: string,
  erc3009?: TransferPolicy,
): PolicyBudgetCharge[] {
  return (intent.assetBudgets ?? []).map((charge) => ({
    budgetId: assetBudgetId(origin, intent.account.accountId, charge.token),
    units: charge.units,
    maximum:
      erc3009?.token.address.toLowerCase() === charge.token.toLowerCase() &&
      BigInt(erc3009.lifetimeAmount) < BigInt(charge.maximum)
        ? erc3009.lifetimeAmount
        : charge.maximum,
  }));
}

/** Activate the selected adapter's compatibility ledger; generic calls without these terms do not inspect asset history. */
export async function prepareAdapterAllowances(
  database: ProviderDatabase,
  intent: ApprovedCallIntent,
  origin: string,
  revision: string,
  erc3009?: TransferPolicy,
) {
  const charges = adapterAllowanceCharges(intent, origin, erc3009);
  for (const [index, term] of (intent.assetBudgets ?? []).entries()) {
    await database.ensureAssetBudget(
      origin,
      intent.account.accountId,
      term.token,
      charges[index].maximum,
      revision,
    );
  }
}
