import { describe, expect, it, vi } from 'vitest';
import {
  createBundlerStartupGate,
  hasBundlerRecoveryWork,
} from '../scripts/bundler-startup.mjs';
const config = {
  applicationId: 'a'.repeat(64),
  chainId: '0x2105',
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  rpcUrls: ['https://rpc.example.test'],
};
describe('failed bundler startup', () => {
  it('makes no further startup attempts while idle, regardless of elapsed time', async () => {
    let now = 0;
    const pending = vi.fn(async () => false);
    const gate = createBundlerStartupGate(pending, () => now);
    expect(await gate.shouldStart(config)).toBe(true);
    gate.failed(config);
    for (now = 1000; now <= 86400000; now *= 10)
      expect(await gate.shouldStart(config)).toBe(false);
    expect(pending).toHaveBeenCalled();
  });
  it('honors backoff on demand, consumes failed demand, and permits a later fresh request', async () => {
    let now = 0;
    const gate = createBundlerStartupGate(
      async () => false,
      () => now,
    );
    gate.failed(config);
    gate.request(config.applicationId);
    expect(await gate.shouldStart(config)).toBe(false);
    now = 10000;
    expect(await gate.shouldStart(config)).toBe(true);
    gate.failed(config);
    now = 30000;
    expect(await gate.shouldStart(config)).toBe(false);
    gate.request(config.applicationId);
    expect(await gate.shouldStart(config)).toBe(true);
  });
  it('retries recoverable work without a new request and bounds outage backoff', async () => {
    let now = 0;
    const gate = createBundlerStartupGate(
      async () => true,
      () => now,
    );
    for (const delay of [10000, 20000, 40000, 60000, 60000]) {
      gate.failed(config);
      now += delay - 1;
      expect(await gate.shouldStart(config)).toBe(false);
      now++;
      expect(await gate.shouldStart(config)).toBe(true);
    }
  });
  it('rechecks changed RPCs immediately, without treating account list updates as demand', async () => {
    const gate = createBundlerStartupGate(
      async () => false,
      () => 0,
    );
    gate.failed(config);
    expect(await gate.shouldStart({ ...config })).toBe(false);
    expect(
      await gate.shouldStart({
        ...config,
        rpcUrls: ['https://replacement.example.test'],
      }),
    ).toBe(true);
  });
  it('isolates applications and clears a recovered application failure', async () => {
    const gate = createBundlerStartupGate(
      async () => false,
      () => 100000,
    );
    gate.failed(config);
    expect(
      await gate.shouldStart({ ...config, applicationId: 'b'.repeat(64) }),
    ).toBe(true);
    gate.started(config.applicationId);
    expect(await gate.shouldStart(config)).toBe(true);
  });
});
describe('local queue recovery inspection', () => {
  it('checks outstanding, processing and persisted bundle restoration without reading payloads', async () => {
    const exists = vi.fn(async (..._keys: string[]) => 0);
    expect(await hasBundlerRecoveryWork({ exists }, config)).toBe(false);
    const keys = exists.mock.calls[0];
    expect(keys).toContain(
      `safe-wallet-${config.applicationId}:8453:${config.entryPoint}:outstanding:userop-hash`,
    );
    expect(keys).toContain(
      `safe-wallet-${config.applicationId}:8453:${config.entryPoint.toLowerCase()}:processing:userOps`,
    );
    for (const state of ['wait', 'active', 'delayed', 'paused'])
      expect(keys).toContain(`bull:alto:mempool:restoration:8453:${state}`);
  });
  it('finds canonical queue keys when configuration addresses use lowercase', async () => {
    const exists = vi.fn(async (..._keys: string[]) => 1);
    expect(
      await hasBundlerRecoveryWork(
        { exists },
        { ...config, entryPoint: config.entryPoint.toLowerCase() },
      ),
    ).toBe(true);
    expect(exists.mock.calls[0]).toContain(
      `safe-wallet-${config.applicationId}:8453:${config.entryPoint}:outstanding:userop-hash`,
    );
  });
  it.each([1, 3, -1, NaN])(
    'preserves recovery when local queue count is %s',
    async (count) => {
      expect(
        await hasBundlerRecoveryWork({ exists: async () => count }, config),
      ).toBe(true);
    },
  );
  it('preserves recovery when local queue inspection is unavailable', async () => {
    expect(
      await hasBundlerRecoveryWork(
        {
          exists: async () => {
            throw Error('offline');
          },
        },
        config,
      ),
    ).toBe(true);
  });
});
