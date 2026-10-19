import type { ReplacementPolicy } from './replacement.js';

export const defaultReplacementPolicy: Readonly<ReplacementPolicy> =
  Object.freeze({
    initialFeeBasisPoints: 5000,
    bumpBasisPoints: 1250,
    maxAttempts: 3,
    intervalSeconds: 30,
  });
/** Editable starting configuration for Base evaluation; deployment simulation and funding acceptance remain required. */
export const defaultSponsorGas = Object.freeze({
  gasLimit: '500000',
  maxFeePerGas: '3000000000',
  maxPriorityFeePerGas: '1000000000',
  l1FeeReserveWei: '1000000000000',
  lifetimeBudgetWei: '10000000000000000',
});

/** Hard configuration ceiling; sponsors retain their own lower gas and lifetime-budget bounds. */
export function maximumSponsorGasLimit(contractCalls: boolean): bigint {
  return contractCalls ? 5_000_000n : 1_000_000n;
}
