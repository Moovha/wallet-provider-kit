export const maximumBundlerUserOperationGas: bigint;
export function applyBundlerSimulationOverrides(
  body: { method: string; params?: unknown[]; [key: string]: unknown },
  code: Record<string, string>,
): { method: string; params: unknown[]; [key: string]: unknown };
export function estimateNativeUserOperationGas(options: {
  operation: Record<string, string>;
  estimate: Record<string, string>;
  entryPoint: string;
  request: (
    method: string,
    params: unknown[],
  ) => Promise<Record<string, unknown>>;
}): Promise<Record<string, string>>;
