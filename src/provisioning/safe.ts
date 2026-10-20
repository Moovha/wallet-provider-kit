import { Interface } from 'ethers';
import { fingerprint } from '../onboarding/policy.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
import type { PinnedContract } from '../execution/approved-calls.js';
export interface SafeProvisioningConfiguration {
  profile: 'safe-1.4.1';
  factory: PinnedContract;
  singleton: PinnedContract;
  proxyCodeHash: string;
  maxValiditySeconds: number;
}
/** Deployment identity excludes dispatch timing and sponsor budgets; changing code pins cannot replace an existing account. */
export function safeProvisioningIdentity(
  config: SafeProvisioningConfiguration,
  network?: ProviderNetwork,
): string {
  return fingerprint([
    config.profile,
    config.factory,
    config.singleton,
    config.proxyCodeHash,
    providerNetwork(network).name,
  ]);
}
export const safeFactoryInterface = new Interface([
  'function proxyCreationCode() view returns(bytes)',
  'function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address)',
]);
export const safeSetupInterface = new Interface([
  'function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)',
]);
