import { expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SafeExecutionQueue } from '../src/execution/queue.js';
import { openProviderDatabase } from '../src/storage/index.js';
import type { SupportedActions } from '../src/deployment/actions.js';
import type { OnboardingService } from '../src/onboarding/service.js';
import type { VerifiedPrincipal } from '../src/domain/principal.js';

it('atomically bounds a 128-request burst from 64 users across two applications without provider effects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-overload-'));
  const database = openProviderDatabase({ directory, initialize: true });
  const users = Array.from({ length: 64 }, (_, index) => ({
    accountId: randomUUID(),
    owner: 'offline-user-' + index,
    requestId: randomUUID(),
    id: randomUUID(),
    safeAddress:
      '0x' +
      (1 + (index % 4) + 4 * Math.floor(index / 32))
        .toString(16)
        .padStart(40, '0'),
    address: '0x' + (100 + index).toString(16).padStart(40, '0'),
    clientId: index < 32 ? 'application-a' : 'application-b',
  }));
  let effects = 0;
  // Trusted authority is an offline fixture; admission and SQLite serialization are real.
  const actions = {
    revision: 'offline-revision',
    onboarding: {
      store: database.onboardingStore,
      withAccountAccess: async (
        principal: VerifiedPrincipal,
        accountId: string,
        _permission: unknown,
        operation: Parameters<OnboardingService['withAccountAccess']>[3],
      ) => {
        const user = users.find(
          (u) => u.accountId === accountId && u.clientId === principal.clientId,
        )!;
        if (!user) throw new Error('Offline access denied');
        return database.onboardingStore.transaction((state) =>
          operation(state, { ...user, grantId: user.id } as never),
        );
      },
    },
    applicationQueueExpiry: async () =>
      new Date(Date.now() + 300000).toISOString(),
    queueAuthority: async (
      principal: VerifiedPrincipal,
      input: { account_id: string },
    ) => {
      const user = users.find(
        (u) =>
          u.accountId === input.account_id && u.clientId === principal.clientId,
      )!;
      return {
        grantId: user.id,
        owner: user.owner,
        consentReference: user.requestId,
        safeAddress: user.safeAddress,
        address: user.address,
      };
    },
  } as unknown as SupportedActions;
  try {
    await database.onboardingStore.transaction((state) => {
      for (const user of users)
        state.accounts[user.accountId] = {
          accountId: user.accountId,
          address: user.address,
        } as never;
      state.deploymentBindings = {
        'service-v1': { activeRevision: 'offline-revision' } as never,
      };
    });
    const queue = new SafeExecutionQueue(
      actions,
      database,
      {
        refresh: async () => {
          effects++;
        },
        execute: async () => {
          effects++;
          throw new Error('Offline provider disabled');
        },
      },
      async () => {
        effects++;
        return '0';
      },
      {
        maxDepthPerSafe: 16,
        maxWaitSeconds: 300,
        maxDepthPerUser: 1,
        maxDepthPerApplication: 32,
        maxDepthTotal: 48,
      },
      5,
    );
    const durations: number[] = [];
    const started = performance.now();
    const results = await Promise.allSettled(
      users.flatMap((user) =>
        Array.from({ length: 2 }, async () => {
          const start = performance.now();
          try {
            return await queue.enqueue(
              {
                idempotencyKey: randomUUID(),
                principal: {
                  issuer: 'https://offline.example.test',
                  subject: 'application-service',
                  clientId: user.clientId,
                  scopes: ['wallet:actions', 'wallet:sign', 'wallet:execute'],
                },
              },
              {
                account_id: user.accountId,
                kind: 'contract-call',
                calls: [{ to: user.address, value: '0', data: '0x12345678' }],
              },
            );
          } finally {
            durations.push(performance.now() - start);
          }
        }),
      ),
    );
    const entries = await database.onboardingStore.transaction((state) =>
      Object.values(state.safeRequests ?? {}),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(48);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(80);
    expect(entries).toHaveLength(48);
    for (const user of users)
      expect(
        entries.filter((e) => e.input.account_id === user.accountId).length,
      ).toBeLessThanOrEqual(1);
    for (const clientId of ['application-a', 'application-b'])
      expect(
        entries.filter((e) => e.principal.clientId === clientId).length,
      ).toBeLessThanOrEqual(32);
    expect(effects).toBe(0);
    durations.sort((a, b) => a - b);
    const report = {
      kind: 'offline-sqlite-admission-burst',
      requests: 128,
      users: 64,
      applications: 2,
      accepted: 48,
      rejected: 80,
      elapsedMs: Math.round(performance.now() - started),
      p50Ms: Math.round(durations[63]),
      p95Ms: Math.round(durations[121]),
      providerEffects: effects,
    };
    if (process.env.WPK_QUEUE_BURST_REPORT)
      await writeFile(
        process.env.WPK_QUEUE_BURST_REPORT,
        JSON.stringify(report, null, 2),
        { mode: 0o600 },
      );
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
