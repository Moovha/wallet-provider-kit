import { fingerprint } from '../onboarding/policy.js';
import { WalletProviderError } from '../domain/signing.js';
export interface ApplicationGasAllowance {
  clientId: string;
  lifetimeBudgetWei?: string;
  funding?: {
    maximumOperationCostWei: string;
    maximumPendingWei: string;
    maximumPendingOperations: number;
  };
}

/** One application gas ledger per network across execution mechanisms and payer pool members. Omitted scope retains default-network ledger IDs. */
export function applicationGasBudgetId(
  origin: string,
  issuer: string,
  clientId: string,
  networkScope?: import('../networks.js').ProviderNetwork,
): string {
  if (
    ![origin, issuer, clientId].every(
      (value) => typeof value === 'string' && value.length > 0,
    )
  )
    throw new WalletProviderError('wallet_provider_configuration');
  return fingerprint([
    'execution-gas',
    origin,
    issuer,
    clientId,
    ...(networkScope ? [networkScope] : []),
  ]);
}

function allowances(
  sponsors: readonly ApplicationGasAllowance[],
  clientId: string,
) {
  const values = sponsors.filter((sponsor) => sponsor.clientId === clientId);
  if (!values.length)
    throw new WalletProviderError('wallet_provider_configuration');
  for (const value of values) {
    const uint = (v: unknown) =>
      typeof v === 'string' &&
      /^(0|[1-9][0-9]{0,77})$/.test(v) &&
      BigInt(v) < 2n ** 256n;
    if (
      (value.lifetimeBudgetWei === undefined && !value.funding) ||
      (value.lifetimeBudgetWei !== undefined &&
        !uint(value.lifetimeBudgetWei)) ||
      (value.funding &&
        (!uint(value.funding.maximumOperationCostWei) ||
          !uint(value.funding.maximumPendingWei) ||
          BigInt(value.funding.maximumOperationCostWei) === 0n ||
          BigInt(value.funding.maximumOperationCostWei) >
            BigInt(value.funding.maximumPendingWei) ||
          !Number.isInteger(value.funding.maximumPendingOperations) ||
          value.funding.maximumPendingOperations < 1 ||
          value.funding.maximumPendingOperations > 16)) ||
      values.some((other) => Boolean(other.funding) !== Boolean(value.funding))
    )
      throw new WalletProviderError('wallet_provider_configuration');
  }
  return values;
}
/** Pool members cannot multiply a configured fee ceiling. */
export function applicationGasBudgetLimit(
  sponsors: readonly ApplicationGasAllowance[],
  clientId: string,
): string {
  return allowances(sponsors, clientId)
    .flatMap((s) =>
      [s.lifetimeBudgetWei, s.funding?.maximumOperationCostWei].filter(
        (v): v is string => v !== undefined,
      ),
    )
    .map(BigInt)
    .reduce((a, b) => (a < b ? a : b))
    .toString();
}
export function applicationGasLifetimeBudget(
  sponsors: readonly ApplicationGasAllowance[],
  clientId: string,
): string | undefined {
  const values = allowances(sponsors, clientId).flatMap((s) =>
    s.lifetimeBudgetWei === undefined ? [] : [BigInt(s.lifetimeBudgetWei)],
  );
  return values.length
    ? values.reduce((a, b) => (a < b ? a : b)).toString()
    : undefined;
}
export function applicationGasFunding(
  sponsors: readonly ApplicationGasAllowance[],
  clientId: string,
) {
  const values = allowances(sponsors, clientId).flatMap((s) =>
    s.funding ? [s.funding] : [],
  );
  if (!values.length) return undefined;
  return values.reduce((a, b) => ({
    maximumOperationCostWei:
      BigInt(a.maximumOperationCostWei) < BigInt(b.maximumOperationCostWei)
        ? a.maximumOperationCostWei
        : b.maximumOperationCostWei,
    maximumPendingWei:
      BigInt(a.maximumPendingWei) < BigInt(b.maximumPendingWei)
        ? a.maximumPendingWei
        : b.maximumPendingWei,
    maximumPendingOperations: Math.min(
      a.maximumPendingOperations,
      b.maximumPendingOperations,
    ),
  }));
}
