interface StartupConfiguration {
  applicationId: string;
  chainId: string;
  entryPoint: string;
  rpcUrls: string[];
}
export function createBundlerStartupGate(
  hasPendingWork: (config: StartupConfiguration) => Promise<boolean>,
  now?: () => number,
): {
  request(applicationId: string): void;
  shouldStart(config: StartupConfiguration): Promise<boolean>;
  failed(config: StartupConfiguration): void;
  started(applicationId: string): void;
};
export function hasBundlerRecoveryWork(
  redis: { exists(...keys: string[]): Promise<number> },
  config: StartupConfiguration,
): Promise<boolean>;
