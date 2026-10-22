import { WalletProviderError } from './domain/signing.js';

export type ProviderNetwork =
  'base' | 'base-sepolia' | 'ethereum' | 'ethereum-sepolia';
export type ProviderChainId =
  'eip155:8453' | 'eip155:84532' | 'eip155:1' | 'eip155:11155111';

const networks = {
  base: {
    name: 'base',
    label: 'Base',
    chainId: '8453',
    caip: 'eip155:8453',
    hex: '0x2105',
    testnet: false,
  },
  'base-sepolia': {
    name: 'base-sepolia',
    label: 'Base Sepolia',
    chainId: '84532',
    caip: 'eip155:84532',
    hex: '0x14a34',
    testnet: true,
  },
  ethereum: {
    name: 'ethereum',
    label: 'Ethereum',
    chainId: '1',
    caip: 'eip155:1',
    hex: '0x1',
    testnet: false,
  },
  'ethereum-sepolia': {
    name: 'ethereum-sepolia',
    label: 'Ethereum Sepolia',
    chainId: '11155111',
    caip: 'eip155:11155111',
    hex: '0xaa36a7',
    testnet: true,
  },
} as const;

/** Server-selected network identity. Omitted selections retain existing Base Sepolia deployments. */
export function providerNetwork(network: ProviderNetwork = 'base-sepolia') {
  if (!Object.hasOwn(networks, network))
    throw new WalletProviderError('wallet_provider_configuration');
  return Object.freeze(networks[network]);
}

/** Parse an immutable stored action's supported chain; this is validation, never spending authority. */
export function networkForChain(chain: string): ProviderNetwork {
  if (chain === 'eip155:8453') return 'base';
  if (chain === 'eip155:84532') return 'base-sepolia';
  if (chain === 'eip155:1') return 'ethereum';
  if (chain === 'eip155:11155111') return 'ethereum-sepolia';
  throw new WalletProviderError('wallet_provider_input');
}
