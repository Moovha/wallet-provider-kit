import { fingerprint } from '../onboarding/policy.js';
import { WalletProviderError } from '../domain/signing.js';
export interface ApplicationGasAllowance {
  clientId: string;
  lifetimeBudgetWei: string;
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

/** Pool members cannot multiply the application's configured lifetime allowance. */
export function applicationGasBudgetLimit(
  sponsors: readonly ApplicationGasAllowance[],
  clientId: string,
): string {
  const limits = sponsors
    .filter((sponsor) => sponsor.clientId === clientId)
    .map((sponsor) => {
      if (
        typeof sponsor.lifetimeBudgetWei !== 'string' ||
        !/^(0|[1-9][0-9]{0,77})$/.test(sponsor.lifetimeBudgetWei)
      )
        throw new WalletProviderError('wallet_provider_configuration');
      return BigInt(sponsor.lifetimeBudgetWei);
    });
  if (!limits.length)
    throw new WalletProviderError('wallet_provider_configuration');
  return limits.reduce((a, b) => (a < b ? a : b)).toString();
}
