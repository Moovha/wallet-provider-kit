import { defaultSafeWallet } from '../sponsorship/defaults.js';
import type { ProviderConfiguration } from './config.js';
import { defaultSafeProvisioning } from '../provisioning/defaults.js';
/** Genesis identities from superchain-registry 720185c32b0599fa31b14f101cbc990ec39c0a36; contract pins from safe-deployments v1.37.40. */
export function applicationGenesis(network: ProviderConfiguration['network']) {
  return network === 'base'
    ? '0xf712aa9241cc24369b143cf6dce85f0902a9731e70d66818a3a5845b296c73dd'
    : '0x0dcc9e089e30b90ddfc55be9a37dd15bc551aeee999d2e2b51414c54eaf934e4';
}
/** Default user asset account and application-owned ERC-4337 infrastructure. */
export function configureSafeWalletRuntime(config: ProviderConfiguration) {
  config.safeProvisioning = defaultSafeProvisioning();
  config.approvedCalls = {
    maxValiditySeconds: 300,
    policy: {
      mechanism: 'safe-1.4.1',
      accounts: [],
      multiSend: {
        address: '0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
        codeHash:
          '0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939',
      },
      maximumNativeValueWei: '0',
      lifetimeOperations: '1000000',
      contracts: [],
      swaps: [],
      vaults: [],
    },
  };
  if (config.runtimeConfiguration) {
    config.runtimeConfiguration.rpcVerification = 'single';
  }
  config.safeWallet = defaultSafeWallet(applicationGenesis(config.network));
}
