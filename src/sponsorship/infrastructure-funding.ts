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
  ready: 'The network fee balances meet their configured targets.',
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
export function infrastructureFundingPlan(input: {
  deposit: bigint;
  depositTarget: bigint;
  executor: bigint;
  executorTarget: bigint;
  funding: bigint;
  allowance: bigint;
}) {
  if (Object.values(input).some((value) => value < 0n))
    throw new WalletProviderError('wallet_provider_configuration');
  const deposit =
    input.deposit < input.depositTarget
      ? input.depositTarget - input.deposit
      : 0n;
  const executor =
    input.executor < input.executorTarget
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
