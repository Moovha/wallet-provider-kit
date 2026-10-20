/** Editable starting configuration for Base evaluation; deployment simulation and funding acceptance remain required. */
export const defaultSponsorGas = Object.freeze({
  gasLimit: '500000',
  maxFeePerGas: '3000000000',
  maxPriorityFeePerGas: '1000000000',
  l1FeeReserveWei: '1000000000000',
  lifetimeBudgetWei: '10000000000000000',
});

/** Hard configuration ceiling; sponsors retain their own lower gas and lifetime-budget bounds. */
export function maximumSponsorGasLimit(): bigint {
  return 5_000_000n;
}
