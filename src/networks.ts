import { WalletProviderError } from './domain/signing.js';

export type ProviderNetwork = 'base' | 'base-sepolia';
export type ProviderChainId = 'eip155:8453' | 'eip155:84532';

/** Server-selected network identity. Omitted selections retain existing Sepolia deployments. */
export function providerNetwork(network: ProviderNetwork = 'base-sepolia') {
  if (network !== 'base' && network !== 'base-sepolia')
    throw new WalletProviderError('wallet_provider_configuration');
  return Object.freeze(
    network === 'base'
      ? {
          name: network,
          label: 'Base',
          chainId: '8453',
          caip: 'eip155:8453' as ProviderChainId,
          hex: '0x2105',
          testnet: false,
        }
      : {
          name: network,
          label: 'Base Sepolia',
          chainId: '84532',
          caip: 'eip155:84532' as ProviderChainId,
          hex: '0x14a34',
          testnet: true,
        },
  );
}

/** Parse an immutable stored action's supported chain; this is validation, never spending authority. */
export function networkForChain(chain: string): ProviderNetwork {
  if (chain === 'eip155:8453') return 'base';
  if (chain === 'eip155:84532') return 'base-sepolia';
  throw new WalletProviderError('wallet_provider_input');
}
