import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openProviderDatabase } from '../src/storage/index.js';
import {
  openExecutorDatabase,
  type ExecutorDatabase,
} from '../src/executor/storage.js';
import type { ExecutionServiceConfiguration } from '../src/executor/config.js';
import { ReplacementWorker } from '../src/executor/replacement-worker.js';
import { createTransferExecutionProvider } from '../src/execution/relayer.js';
import { QuorumExecutionObserver } from '../src/execution/chain.js';
import {
  defaultReplacementPolicy,
  pinReplacementPolicy,
  initialFees,
  assertReplacement,
  proposeReplacement,
} from '../src/execution/replacement.js';
import { PayerOperations } from '../src/execution/operations.js';
import { diagnoseExecution } from '../src/execution/recovery.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { replacementWire } from './helpers/replacements.js';
const directories: string[] = [],
  databases: ExecutorDatabase[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture(initialFeeBasisPoints = 5000) {
  const wire = replacementWire(),
    directory = await mkdtemp(join(tmpdir(), 'wpk-replacement-'));
  directories.push(directory);
  openProviderDatabase({ directory, initialize: true }).close();
  const plan = await wire.f.plan();
  plan.profile = 'erc3009-executor-v1';
  plan.replacement = pinReplacementPolicy({
    ...defaultReplacementPolicy,
    initialFeeBasisPoints,
  });
  plan.sponsor = {
    ...plan.sponsor,
    binding: {
      address: plan.sponsor.binding.address,
      bindingRevision: plan.sponsor.binding.bindingRevision,
    },
  };
  const providerConfig = {
    id: 'sponsor',
    revision: '1',
    kind: 'openzeppelin-relayer' as const,
    relayer: wire.f.configuration.relayer,
    rpc: wire.f.configuration.rpc,
    token: {
      address: wire.f.domain.verifyingContract,
      name: 'Test Token',
      version: '1',
      symbol: 'TEST',
      decimals: 6,
    },
    sponsors: wire.f.configuration.sponsors,
    recovery: { stuckAfterSeconds: 30, quarantineOnStuck: true },
    replacement: { ...defaultReplacementPolicy, initialFeeBasisPoints },
  };
  const config: ExecutionServiceConfiguration = {
    configVersion: 1,
    profile: 'execution-service-v1',
    origin: 'https://executor.example.test',
    binding: 'offline',
    storage: { kind: 'sqlite', directory },
    signing: { id: 'executor', privateKey: { env: 'UNUSED' } },
    callers: [
      {
        origin: 'https://wallet.example.test',
        keys: [{ id: 'wallet', publicKey: { env: 'UNUSED_PUBLIC' } }],
        providers: ['sponsor'],
      },
    ],
    providers: [providerConfig],
    activation: {
      enabled: true,
      providerAcceptance: 'offline',
      recoveryAcceptance: 'offline',
      authenticationAcceptance: 'offline',
    },
  };
  const open = () => {
    const db = openExecutorDatabase(config, process.cwd());
    databases.push(db);
    return db;
  };
  const db = open(),
    id = randomUUID();
  const walletAttempt = createWalletAttemptRequest(
    'configured-execution-v1',
    plan.profile,
    'relay_transaction',
    randomUUID(),
    id,
    plan.action.action_id,
    plan,
  );
  const record = db.admit(
    'https://wallet.example.test',
    {
      contract: 'execution-dispatch-v1',
      execution_id: id,
      provider_id: 'sponsor',
      provider_revision: '1',
      wallet_attempt: walletAttempt,
      plan,
    },
    providerConfig,
  );
  const provider = createTransferExecutionProvider(
    wire.f.configuration,
    'ephemeral-offline-api-token',
    wire.request,
  );
  const local = (value: typeof plan) => ({
    ...value,
    sponsor: wire.f.configuration.sponsors[0],
  });
  const adapter = {
    prepare: (value: typeof plan) => provider.prepare(local(value)),
    submit: (value: typeof plan) => provider.submit(local(value)),
    inspect: (value: typeof plan, tx: string) =>
      provider.inspect!(local(value), tx),
    transactionHash: (value: typeof plan, tx: string) =>
      provider.transactionHash(local(value), tx),
    replace: (
      value: typeof plan,
      tx: string,
      proposal: Parameters<NonNullable<typeof provider.replace>>[2],
      authorize: () => Promise<void>,
    ) => provider.replace!(local(value), tx, proposal, authorize),
  };
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test', 'https://secondary.example.test'],
    plan.genesisHash,
    10000,
    wire.request,
  );
  const request = db.request(record),
    claim = await db.journal.claim(request);
  if (claim.state !== 'dispatch') throw new Error('Fixture admission failed');
  const tx = await adapter.submit(plan);
  await db.journal.complete(request, claim.leaseToken, {
    kind: 'relay_transaction',
    transactionId: tx,
  });
  db.replacementTransaction(
    record,
    (latest) => (latest.startedAt = Date.now() - 31000),
  );
  const snapshot = await observer.nonceSnapshot(plan, wire.state.hash);
  const current = db.load(id, record.walletOrigin)!;
  db.recovery(
    current,
    diagnoseExecution({
      plan,
      configuration: providerConfig.recovery,
      startedAt: current.startedAt!,
      snapshot,
      knownNonce: '0',
    }),
    true,
  );
  const authority = vi.fn(async () => undefined);
  const operations = new PayerOperations(
    {
      pollIntervalSeconds: 15,
      lowBalanceWei: '1',
      webhooks: [
        {
          id: 'alerts',
          endpoint: { env: 'URL' },
          signingSecrets: [{ env: 'KEY' }],
        },
      ],
    },
    { transaction: (fn) => db.operations(fn) },
    [
      {
        address: plan.sponsor.binding.address,
        balance: async () => '10000000000000000',
      },
    ],
    config.origin,
    (ref) =>
      ref.env === 'URL'
        ? 'https://alerts.example.test/events'
        : 'whsec_' + Buffer.alloc(32, 7).toString('base64'),
  );
  const worker = (
    database = db,
    authorize: ConstructorParameters<typeof ReplacementWorker>[3] = authority,
  ) =>
    new ReplacementWorker(database, adapter, observer, authorize, operations);
  const load = (database = db) => database.load(id, record.walletOrigin)!;
  return {
    directory,
    operations,
    wire,
    db,
    open,
    config,
    plan,
    provider,
    adapter,
    observer,
    authority,
    worker,
    load,
  };
}
describe('bounded replacement worker', () => {
  it('keeps the original budget reservation and admission while exhausting replacement attempts at the configured interval', async () => {
    const t = await fixture();
    const database = new DatabaseSync(join(t.directory, 'provider.sqlite'), {
      readOnly: true,
    });
    const financial = () => ({
      budgets: database.prepare('SELECT * FROM budgets').all(),
      admissions: database.prepare('SELECT * FROM admissions').all(),
    });
    try {
      const before = financial();
      const start = Date.now();
      const now = vi.spyOn(Date, 'now').mockReturnValue(start);
      await t.worker().run(t.load());
      await t.worker().run(t.load());
      expect(t.wire.state.puts).toBe(1);
      for (let i = 1; i < 3; i++) {
        now.mockReturnValue(start + i * 31000);
        await t.worker().run(t.load());
        await t.worker().run(t.load());
      }
      now.mockReturnValue(start + 95000);
      await t.worker().run(t.load());
      expect(t.wire.state.puts).toBe(3);
      expect(t.load().replacementStatus).toMatchObject({
        state: 'exhausted',
        reason: 'attempt-limit',
        attempts: 3,
      });
      expect(financial()).toEqual(before);
      expect(await t.operations.health()).toMatchObject({
        replacement_exhausted: 1,
      });
      const events = await t.db.operations((state) =>
        Object.values(state.deliveries).map((entry) => entry.event),
      );
      expect(
        events.some((event) => event.data.replacement?.exhausted === 1),
      ).toBe(true);
      expect(JSON.stringify(events)).not.toContain(
        t.load().dispatch.execution_id,
      );
    } finally {
      database.close();
    }
  });
  it('abandons an expired preparation after restart and uses a new bounded proposal without repeating a dispatch', async () => {
    const t = await fixture();
    const proposal = proposeReplacement(
      t.plan,
      1,
      await t.observer.nonceSnapshot(t.plan, t.wire.state.hash),
    );
    t.db.replacementTransaction(t.load(), (latest) => {
      latest.replacements = [
        {
          proposal,
          state: 'prepared',
          startedAt: Date.now() - 61000,
          leaseUntil: Date.now() - 1000,
        },
      ];
    });
    const restarted = t.open();
    await t.worker(restarted).run(t.load(restarted));
    expect(t.load().replacements![0].state).toBe('abandoned');
    await t.worker(restarted).run(t.load(restarted));
    expect(t.wire.state.puts).toBe(1);
    expect(t.load().replacements).toHaveLength(2);
    expect(t.load().replacements![1].proposal.sequence).toBe(2);
  });
  it('fences an expired dispatch claim after restart when provider acceptance cannot be proven', async () => {
    const t = await fixture();
    const proposal = proposeReplacement(
      t.plan,
      1,
      await t.observer.nonceSnapshot(t.plan, t.wire.state.hash),
    );
    t.db.replacementTransaction(t.load(), (latest) => {
      latest.replacements = [
        {
          proposal,
          state: 'dispatch',
          startedAt: Date.now() - 61000,
          leaseUntil: Date.now() - 1000,
        },
      ];
    });
    const restarted = t.open();
    await t.worker(restarted).run(t.load(restarted));
    await t.worker().run(t.load());
    expect(t.wire.state.puts).toBe(0);
    expect(t.load().replacementStatus?.state).toBe('unknown');
    expect(await t.operations.health()).toMatchObject({
      replacement_unknown: 1,
    });
  });
  it.each(['included', 'expired', 'integrity'] as const)(
    'prevents replacements for %s executions',
    async (reason) => {
      const t = await fixture();
      const original = t.load();
      t.db.replacementTransaction(original, (latest) => {
        if (reason === 'integrity') latest.integrityFailure = true;
        if (reason === 'included') latest.effectObserved = true;
      });
      if (reason === 'expired')
        vi.spyOn(Date, 'now').mockReturnValue(
          Date.parse(t.plan.action.expires_at) + 1,
        );
      if (reason === 'integrity')
        await expect(t.worker().run(original)).rejects.toThrow();
      else await t.worker().run(t.load());
      expect(t.wire.state.puts).toBe(0);
      expect(t.authority).not.toHaveBeenCalled();
    },
  );

  it('uses initial fee headroom and serializes concurrent replacements across independent SQLite connections', async () => {
    const t = await fixture(),
      second = t.open();
    expect(t.wire.state).toMatchObject({
      fee: '1500000000',
      priority: '500000000',
    });
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        t.worker(i % 2 ? t.db : second).run(t.load(i % 2 ? t.db : second)),
      ),
    );
    expect(t.wire.state.puts).toBe(1);
    expect(t.wire.f.state.posts).toBe(1);
    expect(t.authority).toHaveBeenCalledTimes(2);
    expect(t.load().replacements).toHaveLength(1);
    expect(t.load().replacementStatus).toMatchObject({
      state: 'accepted',
      attempts: 1,
    });
    expect(t.wire.state).toMatchObject({
      fee: '1687500000',
      priority: '562500000',
    });
  });
  it('recovers a lost replacement response after restart using the original identity without repeating the mutation', async () => {
    const t = await fixture();
    t.wire.state.loseAfter = true;
    await t.worker().run(t.load());
    const proposal = t.load().replacements![0].proposal;
    expect(t.load().replacementStatus).toMatchObject({
      state: 'unknown',
      attempts: 1,
    });
    t.wire.state.loseAfter = false;
    const restarted = t.open();
    await t.worker(restarted).run(t.load(restarted));
    expect(t.load(restarted).replacements![0]).toMatchObject({
      proposal,
      state: 'observed',
    });
    expect(t.wire.state.puts).toBe(1);
    expect(t.wire.f.state.posts).toBe(1);
  });
  it('retains uncertainty after a response loss before provider acceptance, including after claim expiry and restart', async () => {
    const t = await fixture();
    t.wire.state.loseBefore = true;
    await t.worker().run(t.load());
    const proposal = t.load().replacements![0].proposal;
    t.wire.state.loseBefore = false;
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 61000);
    const restarted = t.open();
    await t.worker(restarted).run(t.load(restarted));
    await t.worker().run(t.load());
    expect(t.wire.state.puts).toBe(1);
    expect(t.load().replacements).toHaveLength(1);
    expect(t.load().replacements![0]).toMatchObject({
      state: 'unknown',
      proposal,
    });
  });
  it('rechecks authority immediately before provider effects and fences a revoked replacement without changing original attempts', async () => {
    const t = await fixture();
    let calls = 0;
    await t
      .worker(t.db, async () => {
        if (++calls === 2) throw new Error('Revoked authority');
      })
      .run(t.load());
    expect(calls).toBe(2);
    expect(t.wire.state.puts).toBe(0);
    expect(t.wire.f.state.posts).toBe(1);
    expect(t.load().replacementStatus).toMatchObject({ state: 'unknown' });
    expect((await t.db.journal.read(t.db.request(t.load())))?.state).toBe(
      'succeeded',
    );
  });
  it('stops at fixed approved caps instead of clipping the bump or increasing a gas limit', async () => {
    const t = await fixture(9000);
    await t.worker().run(t.load());
    expect(t.wire.state.puts).toBe(0);
    expect(t.load().replacementStatus).toEqual({
      state: 'exhausted',
      attempts: 0,
      reason: 'fee-cap',
    });
    expect(t.load().dispatch.plan.sponsor.gasLimit).toBe('150000');
  });
  it('denies replacement before authority when independent RPC sources disagree on exact pending fees', async () => {
    const t = await fixture();
    t.wire.state.disagree = true;
    await t.worker().run(t.load());
    expect(t.wire.state.puts).toBe(0);
    expect(t.authority).not.toHaveBeenCalled();
    expect(t.load().replacementStatus).toMatchObject({
      state: 'blocked',
      reason: 'evidence-unavailable',
    });
  });
  it('rejects an unpatched provider contract before replacement effects', async () => {
    const t = await fixture();
    t.wire.state.contract = false;
    await t.worker().run(t.load());
    expect(t.wire.state.puts).toBe(0);
    expect(t.load().replacementStatus).toMatchObject({
      state: 'blocked',
      reason: 'evidence-unavailable',
    });
  });
  it('rejects stale nonce, payload visibility and fee evidence without authorizing another nonce', async () => {
    const t = await fixture();
    const snapshot = await t.observer.nonceSnapshot(t.plan, t.wire.state.hash),
      proposal = proposeReplacement(t.plan, 1, snapshot);
    for (const changed of [
      { ...snapshot, confirmedNonce: '1' },
      { ...snapshot, transactionPending: false },
      { ...snapshot, transactionNonce: '1' },
      { ...snapshot, transactionMaxPriorityFeePerGas: '1' },
      { ...snapshot, balanceWei: '0' },
    ])
      expect(() => assertReplacement(t.plan, proposal, changed)).toThrow();
    expect(initialFees({ ...t.plan, replacement: undefined })).toEqual({
      maxFeePerGas: '3000000000',
      maxPriorityFeePerGas: '1000000000',
    });
  });
});
