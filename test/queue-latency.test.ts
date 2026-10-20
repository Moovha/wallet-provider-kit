import { expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SafeExecutionQueue } from '../src/execution/queue.js';
import { openProviderDatabase } from '../src/storage/index.js';
import { WalletProviderError } from '../src/domain/signing.js';
import type { SupportedActions } from '../src/deployment/actions.js';
import type { OnboardingService } from '../src/onboarding/service.js';
import type { VerifiedPrincipal } from '../src/domain/principal.js';
it('retries a ready Safe lane promptly while another lane remains stalled, without spinning or duplicate preparation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-queue-latency-'));
  const database = openProviderDatabase({ directory, initialize: true });
  const users = [0, 1].map((i) => ({
    accountId: randomUUID(),
    id: randomUUID(),
    owner: 'offline-' + i,
    requestId: randomUUID(),
    address: '0x' + (i + 10).toString(16).padStart(40, '0'),
    safeAddress: '0x' + (i + 1).toString(16).padStart(40, '0'),
  }));
  const principal: VerifiedPrincipal = {
    issuer: 'https://issuer.example.test',
    subject: 'application',
    clientId: 'application',
    scopes: ['wallet:execute', 'wallet:actions', 'wallet:sign'],
  };
  let release!: () => void;
  const stalled = new Promise<void>((r) => {
    release = r;
  });
  const prepared: string[] = [];
  const actions = {
    revision: 'offline',
    onboarding: {
      store: database.onboardingStore,
      withAccountAccess: async (
        _p: VerifiedPrincipal,
        id: string,
        _permission: unknown,
        operation: Parameters<OnboardingService['withAccountAccess']>[3],
      ) => {
        const u = users.find((u) => u.accountId === id)!;
        return database.onboardingStore.transaction((s) =>
          operation(s, u as never),
        );
      },
    },
    applicationQueueExpiry: async () =>
      new Date(Date.now() + 300000).toISOString(),
    queueAuthority: async (
      _p: VerifiedPrincipal,
      input: { account_id: string },
    ) => {
      const u = users.find((u) => u.accountId === input.account_id)!;
      return {
        grantId: u.id,
        owner: u.owner,
        consentReference: u.requestId,
        safeAddress: u.safeAddress,
        address: u.address,
      };
    },
    requestCalls: async (_context: unknown, input: { account_id: string }) => {
      prepared.push(input.account_id);
      if (input.account_id === users[0].accountId) await stalled;
      throw new WalletProviderError(
        'wallet_provider_unavailable',
        'not_dispatched',
      );
    },
  } as unknown as SupportedActions;
  const queue = new SafeExecutionQueue(
    actions,
    database,
    { refresh: vi.fn(), execute: vi.fn() },
    async () => '0',
    { maxDepthPerSafe: 8, maxWaitSeconds: 300 },
    300,
  );
  try {
    await database.onboardingStore.transaction((s) => {
      s.deploymentBindings = {
        'service-v1': { activeRevision: 'offline' } as never,
      };
      for (const u of users)
        s.accounts[u.accountId] = {
          accountId: u.accountId,
          address: u.address,
        } as never;
    });
    for (const u of users)
      await queue.enqueue(
        { principal, idempotencyKey: randomUUID() },
        {
          account_id: u.accountId,
          kind: 'contract-call',
          calls: [{ to: u.address, value: '0', data: '0x12345678' }],
        },
      );
    vi.useFakeTimers();
    queue.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(prepared.filter((id) => id === users[0].accountId)).toHaveLength(1);
    expect(prepared.filter((id) => id === users[1].accountId)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(prepared.filter((id) => id === users[0].accountId)).toHaveLength(1);
    expect(prepared.filter((id) => id === users[1].accountId)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10);
    expect(prepared).toHaveLength(3);
  } finally {
    release();
    await queue.close();
    vi.useRealTimers();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
