import type { PinnedContract } from '../src/execution/approved-calls.js';
import { formatUnits, parseUnits } from 'ethers';
import type { OperationAdapters } from '../src/execution/operation-adapters.js';
export const emptyPin = () => ({ address: '', codeHash: '' });
export function parseDisplayAmount(
  value: string,
  decimals: number,
): string | undefined {
  if (!new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{0,${decimals}})?$`).test(value))
    return;
  try {
    const result = parseUnits(value, decimals);
    if (result < 2n ** 256n) return result.toString();
  } catch {
    /* Invalid or excessive precision. */
  }
}
export function displayAmount(value: string, decimals: number) {
  try {
    return /^(0|[1-9][0-9]*)$/.test(value) ? formatUnits(value, decimals) : '';
  } catch {
    return '';
  }
}
export function validateAdapterAmounts(adapters?: OperationAdapters) {
  const positive = (value: string) => {
    if (!/^[1-9][0-9]{0,77}$/.test(value) || BigInt(value) >= 2n ** 256n)
      throw new Error(
        'Adapter amounts must be positive decimal base units below 2²⁵⁶.',
      );
  };
  for (const entry of adapters?.tokenTransfers ?? []) {
    positive(entry.maximumAmount);
    if (entry.lifetimeAmount !== undefined) positive(entry.lifetimeAmount);
  }
  for (const entry of adapters?.swaps ?? []) positive(entry.maximumInput);
  for (const entry of adapters?.vaults ?? []) positive(entry.maximumAssets);
}

/** Copy a contract pin without target permissions or unrelated configuration fields. */
export function pinForAdapter(pin: PinnedContract): PinnedContract {
  return {
    address: pin.address,
    codeHash: pin.codeHash,
    ...(pin.implementation
      ? {
          implementation: {
            address: pin.implementation.address,
            codeHash: pin.implementation.codeHash,
          },
        }
      : {}),
  };
}
