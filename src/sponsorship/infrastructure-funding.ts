import { WalletProviderError } from '../domain/signing.js';
export type FundingState =
  | 'checking'
  | 'ready'
  | 'replenishing'
  | 'needs-funding'
  | 'limit-reached'
  | 'unavailable';
export interface FundingObservation {
  status: FundingState;
  message: string;
  checked_at?: string;
}
export const fundingMessages: Record<FundingState, string> = {
  checking: 'Checking the application’s network fee funds.',
  ready: 'The network fee balances are above their refill thresholds.',
  replenishing: 'Restoring the application’s network fee balances.',
  'needs-funding':
    'Add network fee funds to the application’s funding account.',
  'limit-reached':
    'Review the infrastructure fee limit before adding more funds.',
  unavailable:
    'Network fee funding could not be checked. The service will check again.',
};
export class InfrastructureFundingUnavailable extends WalletProviderError {
  constructor(readonly reason: 'needs-funding' | 'limit-reached') {
    super(
      reason === 'limit-reached'
        ? 'wallet_authorization_denied'
        : 'wallet_provider_unavailable',
    );
  }
}
/** Principal feasibility only; exact fee reserves and durable authority remain mandatory at dispatch. */
export function infrastructureFundingPlan(
  input: {
    deposit: bigint;
    depositTarget: bigint;
    executor: bigint;
    executorTarget: bigint;
    funding: bigint;
    allowance: bigint;
  },
  lowWatermarkBps = 10000,
) {
  if (Object.values(input).some((value) => value < 0n))
    throw new WalletProviderError('wallet_provider_configuration');
  if (
    !Number.isInteger(lowWatermarkBps) ||
    lowWatermarkBps < 1 ||
    lowWatermarkBps > 10000
  )
    throw new WalletProviderError('wallet_provider_configuration');
  const deposit =
    input.deposit * 10000n < input.depositTarget * BigInt(lowWatermarkBps)
      ? input.depositTarget - input.deposit
      : 0n;
  const executor =
    input.executor * 10000n < input.executorTarget * BigInt(lowWatermarkBps)
      ? input.executorTarget - input.executor
      : 0n;
  const principal = deposit + executor;
  const status: FundingState =
    principal === 0n
      ? 'ready'
      : principal > input.allowance
        ? 'limit-reached'
        : principal > input.funding
          ? 'needs-funding'
          : 'replenishing';
  return { deposit, executor, status };
}

export interface FundingAllocation {
  paymasterBasisPoints: number;
  bundlerBasisPoints: number;
  /** Funding-address share available for wallet deployment fees. */
  provisioningBasisPoints?: number;
  reserveBasisPoints: number;
  feeReserveWei: string;
  minimumRefillWei: string;
}
export function validateFundingAllocation(policy: FundingAllocation) {
  const percentages = [
    policy.paymasterBasisPoints,
    policy.bundlerBasisPoints,
    policy.reserveBasisPoints,
  ];
  const provisioning =
    policy.provisioningBasisPoints === undefined
      ? 0
      : policy.provisioningBasisPoints;
  if (
    !Number.isSafeInteger(provisioning) ||
    provisioning < 0 ||
    provisioning >= 10000 ||
    percentages.some(
      (value) => !Number.isSafeInteger(value) || value <= 0 || value >= 10000,
    ) ||
    percentages.reduce((a, b) => a + b, provisioning) !== 10000 ||
    [policy.feeReserveWei, policy.minimumRefillWei].some(
      (value) =>
        !/^[1-9][0-9]{0,77}$/.test(value) || BigInt(value) >= 2n ** 256n,
    )
  )
    throw new WalletProviderError('wallet_provider_configuration');
}
/** Allocate available balances after a fee buffer; never withdraw from active services. */
export function percentageFundingPlan(
  input: {
    deposit: bigint;
    executor: bigint;
    funding: bigint;
    allowance: bigint;
  },
  policy: FundingAllocation,
  lowWatermarkBps = 10000,
) {
  validateFundingAllocation(policy);
  if (
    !Number.isInteger(lowWatermarkBps) ||
    lowWatermarkBps < 1 ||
    lowWatermarkBps > 10000
  )
    throw new WalletProviderError('wallet_provider_configuration');
  if (Object.values(input).some((value) => value < 0n))
    throw new WalletProviderError('wallet_provider_configuration');
  const total = input.deposit + input.executor + input.funding;
  const buffer = BigInt(policy.feeReserveWei);
  if (total <= buffer)
    return {
      deposit: 0n,
      executor: 0n,
      reserve: total,
      status: 'needs-funding' as FundingState,
    };
  const allocatable = total > buffer ? total - buffer : 0n;
  const depositTarget =
    (allocatable * BigInt(policy.paymasterBasisPoints)) / 10000n;
  const executorTarget =
    (allocatable * BigInt(policy.bundlerBasisPoints)) / 10000n;
  const reserve = total - depositTarget - executorTarget;
  const threshold = BigInt(policy.minimumRefillWei);
  const deficit = (target: bigint, balance: bigint) =>
    target * BigInt(lowWatermarkBps) > balance * 10000n &&
    target - balance >= threshold
      ? target - balance
      : 0n;
  let deposit = deficit(depositTarget, input.deposit),
    executor = deficit(executorTarget, input.executor);
  const principal = deposit + executor;
  if (!principal)
    return { deposit, executor, reserve, status: 'ready' as FundingState };
  const liquidity = input.funding > reserve ? input.funding - reserve : 0n;
  const headroom = input.allowance > buffer ? input.allowance - buffer : 0n;
  const available = liquidity < headroom ? liquidity : headroom;
  if (!available)
    return {
      deposit: 0n,
      executor: 0n,
      reserve,
      status: (liquidity ? 'limit-reached' : 'needs-funding') as FundingState,
    };
  if (principal > available) {
    deposit = (available * deposit) / principal;
    executor = available - deposit;
  }
  return { deposit, executor, reserve, status: 'replenishing' as FundingState };
}
