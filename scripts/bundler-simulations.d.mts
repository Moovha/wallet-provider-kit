export function applyBundlerSimulationOverrides(
  body: { method: string; params?: unknown[]; [key: string]: unknown },
  code: Record<string, string>,
): { method: string; params: unknown[]; [key: string]: unknown };
