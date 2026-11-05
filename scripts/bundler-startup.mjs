import { getAddress } from 'viem';

/** Failed startup probes retry for admitted demand, changed RPCs, or recoverable work. */
export function createBundlerStartupGate(hasPendingWork, now = Date.now) {
  const failures = new Map();
  const requested = new Set();
  return {
    request(applicationId) {
      requested.add(applicationId);
    },
    async shouldStart(config) {
      const failure = failures.get(config.applicationId);
      if (!failure || failure.rpcUrls !== JSON.stringify(config.rpcUrls))
        return true;
      if (now() < failure.retryAt) return false;
      if (requested.has(config.applicationId)) return true;
      return hasPendingWork(config);
    },
    failed(config) {
      const count = (failures.get(config.applicationId)?.count ?? 0) + 1;
      failures.set(config.applicationId, {
        count,
        rpcUrls: JSON.stringify(config.rpcUrls),
        retryAt: now() + Math.min(60000, 10000 * 2 ** Math.min(count - 1, 3)),
      });
      requested.delete(config.applicationId);
    },
    started(applicationId) {
      failures.delete(applicationId);
      requested.delete(applicationId);
    },
  };
}

/** Inspect local Valkey only; uncertainty preserves automatic recovery attempts. */
export async function hasBundlerRecoveryWork(redis, config) {
  const chain = BigInt(config.chainId).toString();
  const keys = [];
  for (const entryPoint of new Set([
    config.entryPoint,
    config.entryPoint.toLowerCase(),
    getAddress(config.entryPoint),
  ])) {
    const prefix = `safe-wallet-${config.applicationId}:${chain}:${entryPoint}`;
    keys.push(
      `${prefix}:outstanding:userop-hash`,
      `${prefix}:outstanding:ready-queue`,
      `${prefix}:processing:userOps`,
    );
  }
  // Alto persists submitted bundles in Bull's chain-scoped restoration queue.
  for (const state of ['wait', 'active', 'delayed', 'paused'])
    keys.push(`bull:alto:mempool:restoration:${chain}:${state}`);
  try {
    const count = await redis.exists(...keys);
    return !Number.isSafeInteger(count) || count !== 0;
  } catch {
    return true;
  }
}
