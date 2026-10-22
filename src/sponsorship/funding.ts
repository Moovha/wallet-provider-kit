import { WalletProviderError } from '../domain/signing.js';
import type { UserOperationObservation } from './execution-types.js';

/** Trusted host observation of the selected paymaster's deposit at a fixed block. */
export interface FundingSnapshot {
  balanceWei: string;
  blockNumber: string;
  checkedAt: string;
}
export interface FundingReservation extends FundingSnapshot {
  maximumPendingWei: string;
  maximumPendingOperations: number;
  accountingOnly: boolean;
}
export function pendingFunding(
  records: { costWei: string; observation?: UserOperationObservation }[],
  funding: FundingReservation,
  additionalCost?: string,
) {
  const deny = (): never => {
    throw new WalletProviderError('wallet_authorization_denied');
  };
  const uint = (value: string) => {
    if (
      typeof value !== 'string' ||
      !/^(0|[1-9][0-9]{0,77})$/.test(value) ||
      BigInt(value) >= 2n ** 256n
    )
      deny();
    return BigInt(value);
  };
  const block = (value: string) => {
    if (
      typeof value !== 'string' ||
      !/^(0x[0-9a-fA-F]+|0|[1-9][0-9]*)$/.test(value)
    )
      deny();
    return BigInt(value);
  };
  const observed = Date.parse(funding.checkedAt);
  if (
    !Number.isFinite(observed) ||
    observed > Date.now() ||
    Date.now() - observed > 15000 ||
    !Number.isInteger(funding.maximumPendingOperations) ||
    funding.maximumPendingOperations < 1 ||
    funding.maximumPendingOperations > 16
  )
    deny();
  const height = block(funding.blockNumber);
  const outstanding = records.filter(({ observation }) => {
    if (
      observation?.state === 'finalized' &&
      observation.receipt &&
      block(observation.receipt.blockNumber) <= height
    )
      return false;
    if (
      observation?.state === 'expired' &&
      observation.expiry &&
      block(observation.expiry.finalizedBlock) <= height
    )
      return false;
    return true;
  });
  const held =
    outstanding.reduce((sum, r) => sum + uint(r.costWei), 0n) +
    (additionalCost === undefined ? 0n : uint(additionalCost));
  if (
    outstanding.length + (additionalCost === undefined ? 0 : 1) >
      funding.maximumPendingOperations ||
    held > uint(funding.maximumPendingWei) ||
    held > uint(funding.balanceWei)
  )
    deny();
  return held;
}
