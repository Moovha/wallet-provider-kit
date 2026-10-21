import { expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WalletProviderError } from '../src/domain/signing.js';
import { randomUUID } from 'node:crypto';
import { openProviderDatabase } from '../src/storage/index.js';
import type { SupportedActions } from '../src/deployment/actions.js';
import type { OnboardingService } from '../src/onboarding/service.js';
import type { VerifiedPrincipal } from '../src/domain/principal.js';
import { UserOperationWalletCallsDriver } from '../src/sponsorship/wallet-calls.js';
import type { UserOperationExecutionCoordinator } from '../src/sponsorship/execution.js';

it('keeps other accounts progressing while one ERC-4337 preparation is stalled, with bounded retries and worker concurrency', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-aa-latency-'));
  const database = openProviderDatabase({ directory, initialize: true });
  const users = [0, 1, 2].map((i) => ({
    accountId: randomUUID(),
    id: randomUUID(),
    requestId: randomUUID(),
    owner: 'offline-' + i,
    address: '0x' + (i + 10).toString(16).padStart(40, '0'),
    safeAddress: '0x' + (i + 1).toString(16).padStart(40, '0'),
  }));
  const principal: VerifiedPrincipal = {
    issuer: 'https://issuer.example.test',
    subject: 'app',
    clientId: 'app',
    scopes: ['wallet:actions', 'wallet:sign', 'wallet:execute'],
  };
  const policyHash = 'a'.repeat(64);
  let revokedAccount: string | undefined;
  const actions = {
    revision: 'offline',
    onboarding: {
      store: database.onboardingStore,
      withAccountAccess: async (
        _principal: VerifiedPrincipal,
        id: string,
        _permission: unknown,
        operation: Parameters<OnboardingService['withAccountAccess']>[3],
      ) =>
        database.onboardingStore.transaction((s) => {
          if (id === revokedAccount)
            throw new WalletProviderError('wallet_authorization_denied');
          return operation(s, users.find((u) => u.accountId === id)! as never);
        }),
    },
    applicationQueueExpiry: async (
      _principal: VerifiedPrincipal,
      _maximumSeconds: number,
      accountId: string,
    ) => {
      expect(users.some((user) => user.accountId === accountId)).toBe(true);
      return new Date(Date.now() + 300000).toISOString();
    },
    queueAuthority: async (
      _principal: VerifiedPrincipal,
      input: { account_id: string },
    ) => {
      const user = users.find((u) => u.accountId === input.account_id)!;
      return {
        owner: user.owner,
        grantId: user.id,
        consentReference: user.requestId,
        address: user.address,
        safeAddress: user.safeAddress,
      };
    },
  } as unknown as SupportedActions;
  let release!: () => void;
  const stalled = new Promise<void>((resolve) => {
    release = resolve;
  });
  const preparations: string[] = [];
  let active = 0,
    maximum = 0;
  const execution = {
    configurationHash: 'offline',
    signing: {
      executionBinding: () => ({ configurationHash: 'offline' }),
      prepareCalls: async (
        _principal: VerifiedPrincipal,
        input: { account_id: string },
      ) => {
        preparations.push(input.account_id);
        active++;
        maximum = Math.max(maximum, active);
        try {
          if (input.account_id === users[0].accountId) await stalled;
          throw new Error('Offline unavailable preparation');
        } finally {
          active--;
        }
      },
    },
  } as unknown as UserOperationExecutionCoordinator;
  const driver = new UserOperationWalletCallsDriver(
    actions,
    database,
    execution,
    {
      gas: {
        callGasLimit: '0x186a0',
        verificationGasLimit: '0x186a0',
        preVerificationGas: '0x5208',
        maxFeePerGas: '0xa',
        maxPriorityFeePerGas: '0x1',
      },
      maxDepthPerSafe: 2,
      maxDepthTotal: 3,
      maxConcurrentAccounts: 2,
      maxWaitSeconds: 300,
      pollIntervalSeconds: 1,
    },
  );
  try {
    await database.onboardingStore.transaction((s) => {
      s.deploymentBindings = {
        'service-v1': { activeRevision: 'offline' } as never,
      };
      for (const user of users) {
        s.accounts[user.accountId] = { address: user.address } as never;
        s.requests[user.requestId] = {
          runtimePolicy: { policy_hash: policyHash, revision: '1' },
        } as never;
      }
    });
    for (const user of users)
      await driver.enqueue(
        { principal, idempotencyKey: randomUUID() },
        {
          account_id: user.accountId,
          kind: 'contract-call',
          calls: [{ to: user.address, value: '0', data: '0x12345678' }],
        },
        {
          id: randomUUID(),
          sender: user.safeAddress,
          policyHash,
          policyRevision: '1',
        } as never,
      );
    await database.onboardingStore.transaction((s) => {
      for (const entry of Object.values(s.userOperationBatches ?? {}))
        entry.sequence =
          users.findIndex((u) => u.accountId === entry.input.account_id) + 1;
    });
    vi.useFakeTimers();
    driver.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(preparations).toContain(users[0].accountId);
    expect(preparations).toContain(users[1].accountId);
    await vi.advanceTimersByTimeAsync(1100);
    expect(preparations).toContain(users[2].accountId);
    expect(preparations.filter((id) => id === users[0].accountId)).toHaveLength(
      1,
    );
    expect(maximum).toBe(2);
    expect(preparations.length).toBeLessThanOrEqual(5);
    for (const user of users.slice(1))
      expect(
        preparations.filter((id) => id === user.accountId).length,
      ).toBeLessThanOrEqual(2);
    revokedAccount = users[1].accountId;
    const beforeRevocation = preparations.filter(
      (id) => id === revokedAccount,
    ).length;
    await vi.advanceTimersByTimeAsync(3000);
    const revoked = await database.onboardingStore.transaction((s) =>
      Object.values(s.userOperationBatches ?? {}).find(
        (entry) => entry.input.account_id === revokedAccount,
      ),
    );
    expect(revoked).toMatchObject({
      stage: 'failed',
      lastFailure: { code: 'wallet_authorization_denied' },
    });
    expect(revoked?.operationId).toBeUndefined();
    expect(preparations.filter((id) => id === revokedAccount)).toHaveLength(
      beforeRevocation,
    );
  } finally {
    release();
    await driver.stop();
    vi.useRealTimers();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
