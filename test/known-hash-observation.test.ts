import { executionPlanHash } from '../src/executor/protocol.js';
import { expect, it, vi } from 'vitest';
import { ApprovedExecutionCoordinator } from '../src/execution/coordinator.js';
import { executionFixture } from './helpers/execution.js';

it('persists canonical inclusion and releases capacity without consulting a stalled provider or nonce diagnostics', async () => {
  const f = executionFixture();
  const plan = await f.plan();
  const execution = {
    plan,
    planHash: executionPlanHash(plan),
    observationRevision: 0,
    transactionHashes: [f.transactionHash],
  };
  const state = {
    deploymentBindings: { 'service-v1': { activeRevision: 'current' } },
    supportedActions: { action: { execution } },
    audit: [],
  };
  const stalled = vi.fn(() => new Promise(() => {}));
  const included = vi.fn(async () => {});
  const coordinator = Object.assign(
    Object.create(ApprovedExecutionCoordinator.prototype),
    {
      actions: {
        revision: 'current',
        onboarding: {
          policy: { provider: { origin: 'https://wallet.example.test' } },
          store: {
            transaction: async (read: (value: unknown) => unknown) =>
              read(state),
          },
        },
      },
      database: { journal: { read: async () => null } },
      observations: new Map(),
      listeners: new Set(),
      config: { recovery: { stuckAfterSeconds: 60, quarantineOnStuck: false } },
      request: () => ({}),
      receipt: async () => ({ dispatch_status: 'accepted' }),
      provider: {
        recover: stalled,
        transactionHash: stalled,
        inspect: stalled,
      },
      observer: {
        nonceSnapshot: stalled,
        observe: async () => ({
          chain_status: 'included',
          verification: 'rpc-single',
          outcome: 'succeeded',
          settlement: 'pending',
          safe_nonce_consumed: true,
          observed_at: new Date().toISOString(),
          transaction_hash: f.transactionHash,
        }),
      },
      onInclusion: included,
    },
  ) as ApprovedExecutionCoordinator;
  await coordinator.refresh('action');
  expect(stalled).not.toHaveBeenCalled();
  expect(execution).toMatchObject({
    observationRevision: 1,
    observation: { chain_status: 'included' },
    recovery: { state: 'awaiting-finality' },
  });
  expect(included).toHaveBeenCalledOnce();
  const firstIncluded = (
    execution as unknown as { timings: { included_at: string } }
  ).timings.included_at;
  expect(Number.isFinite(Date.parse(firstIncluded))).toBe(true);
  const internals = coordinator as unknown as {
    observer: {
      observe: () => Promise<unknown>;
      recheckInclusion?: () => Promise<unknown>;
    };
  };
  const original = internals.observer.observe;
  const full = vi.fn(original);
  internals.observer.observe = full;
  const recheck = vi.fn(
    async () => (execution as unknown as { observation: unknown }).observation,
  );
  internals.observer.recheckInclusion = recheck;
  await coordinator.refresh('action');
  expect(recheck).toHaveBeenCalledOnce();
  expect(full).not.toHaveBeenCalled();
  expect(
    (execution as unknown as { timings: { included_at: string } }).timings
      .included_at,
  ).toBe(firstIncluded);
  (
    execution as unknown as { inclusionProof: { observationHash: string } }
  ).inclusionProof.observationHash = 'changed';
  await coordinator.refresh('action');
  expect(full).toHaveBeenCalledOnce();
  expect(recheck).toHaveBeenCalledOnce();
});
