import type { SafeProvisioningConfiguration } from './safe.js';

/** Safe 1.4.1 canonical deployments from safe-deployments v1.37.40 and safe-contracts 1.4.1. Runtime code is checked against the accepted pins before deployment. */
export function defaultSafeProvisioning(): SafeProvisioningConfiguration {
  return {
    profile: 'safe-1.4.1',
    factory: {
      address: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
      codeHash:
        '0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317',
    },
    singleton: {
      address: '0x41675C099F32341bf84BFc5382aF534df5C7461a',
      codeHash:
        '0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4',
    },
    proxyCodeHash:
      '0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c',
    maxValiditySeconds: 300,
  };
}
