import type { SafeWalletConfiguration } from './safe-wallet.js';
/** Published Safe 4337 0.3.0-1 and EntryPoint 0.7.0 artifacts, including constructor immutables. */
export function defaultSafeWallet(
  genesisHash: string,
): SafeWalletConfiguration {
  return {
    profile: 'safe-only-4337-v1',
    genesisHash,
    entryPoint: {
      address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      codeHash:
        '0x8db5ff695839d655407cc8490bb7a5d82337a86a6b39c3f0258aa6c3b582fc58',
    },
    module: {
      address: '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226',
      codeHash:
        '0x2aea997c4e3cf0e2f333025372e219abcfde81c21fc2f8fb066414a5685dd3e0',
    },
    bundlerAuthorization: { env: 'SAFE_WALLET_BUNDLER_AUTHORIZATION' },
    runtimeDirectory: '.provider-data/bundler',
    maximumSetupCostWei: '250000000000000',
    executorBalanceWei: '30000000000000',
    paymasterDepositWei: '60000000000000',
  };
}
