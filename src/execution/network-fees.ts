import { WalletProviderError } from '../domain/signing.js';
import type { RpcReader } from './chain.js';

export interface NetworkFeeQuote {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  baseFeePerGas: string;
  quotedAt: string;
}
/** The accepted fee limits cannot cover the current network quote. */
export class NetworkFeeLimitError extends WalletProviderError {
  readonly reason = 'network_fee_limit';
  constructor() {
    super('wallet_provider_unavailable', 'not_dispatched');
  }
}
function quantity(value: unknown): bigint {
  if (
    typeof value !== 'string' ||
    !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value)
  )
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  return BigInt(value);
}
/** Price from the network; configured limits bound spending rather than setting the offered price. */
export async function quoteNetworkFees(
  reader: RpcReader,
  limits: { maxFeePerGas: string; maxPriorityFeePerGas: string },
): Promise<NetworkFeeQuote> {
  const raw = await reader.feeHistory();
  const history = raw as { baseFeePerGas?: unknown[]; reward?: unknown[][] };
  if (
    !history ||
    !Array.isArray(history.baseFeePerGas) ||
    history.baseFeePerGas.length !== 6 ||
    !Array.isArray(history.reward) ||
    history.reward.length !== 5
  )
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  const bases = history.baseFeePerGas.map(quantity);
  const rewards = history.reward
    .map((row) => {
      if (!Array.isArray(row) || row.length !== 1)
        throw new WalletProviderError(
          'wallet_provider_unavailable',
          'not_dispatched',
        );
      return quantity(row[0]);
    })
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const base = bases.at(-1)!;
  const priorityCeiling = BigInt(limits.maxPriorityFeePerGas);
  const tip = rewards[2];
  if (tip > priorityCeiling) throw new NetworkFeeLimitError();
  const minimum = base + tip;
  const ceiling = BigInt(limits.maxFeePerGas);
  if (minimum > ceiling) throw new NetworkFeeLimitError();
  const buffered = base * 2n + tip;
  return {
    maxFeePerGas: (buffered > ceiling ? ceiling : buffered).toString(),
    maxPriorityFeePerGas: tip.toString(),
    baseFeePerGas: base.toString(),
    quotedAt: new Date().toISOString(),
  };
}
