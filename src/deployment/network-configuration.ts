import type { ProviderConfiguration } from './config.js';
import { configureSafeWalletRuntime } from './application-defaults.js';

/** Shared identity/authentication, explicit independent network execution settings. */
export function networkConfigurations(
  config: ProviderConfiguration,
): ProviderConfiguration[] {
  const { additionalNetworks, ...primary } = config;
  return [
    primary,
    ...[...(additionalNetworks ?? [])]
      .sort((a, b) => a.network.localeCompare(b.network))
      .map((entry) => {
        const expanded: ProviderConfiguration = {
          ...primary,
          network: entry.network,
          runtimeConfiguration: primary.runtimeConfiguration
            ? { ...primary.runtimeConfiguration }
            : undefined,
          activation: { enabled: false },
        };
        configureSafeWalletRuntime(expanded);
        expanded.safeWallet!.bundlerAuthorization =
          primary.safeWallet!.bundlerAuthorization;
        expanded.safeWallet!.runtimeDirectory =
          primary.safeWallet!.runtimeDirectory;
        for (const key of [
          'safeWallet',
          'safeProvisioning',
          'approvedCalls',
          'activation',
        ] as const)
          if (entry[key]) Object.assign(expanded, { [key]: entry[key] });
        return expanded;
      }),
  ];
}
