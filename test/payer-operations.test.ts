import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  openProviderDatabase,
  type ProviderDatabase,
} from '../src/storage/index.js';
import {
  PayerOperations,
  emptyOperationsState,
  recordPayer,
  payerKey,
  webhookTargets,
  type OperationsConfiguration,
  type OperationsStore,
} from '../src/execution/operations.js';
import { QuorumExecutionObserver } from '../src/execution/chain.js';
import { executionFixture } from './helpers/execution.js';
const directories: string[] = [],
  databases: ProviderDatabase[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-payers-'));
  directories.push(directory);
  const open = () => {
    const db = openProviderDatabase({ directory, initialize: true });
    databases.push(db);
    return db;
  };
  const db = open();
  const configuration: OperationsConfiguration = {
    pollIntervalSeconds: 5,
    lowBalanceWei: '100',
    webhooks: [
      {
        id: 'alerts',
        endpoint: { env: 'ENDPOINT' },
        signingSecrets: [{ env: 'SIGNING' }],
      },
    ],
  };
  const key = randomBytes(32),
    secondKey = randomBytes(32);
  const resolve = (ref: { env: string }) =>
    ({
      ENDPOINT: 'https://receiver.example.test/events',
      SIGNING: 'whsec_' + key.toString('base64'),
      SECOND: 'whsec_' + secondKey.toString('base64'),
    })[ref.env]!;
  const store = (database = db): OperationsStore => ({
    transaction: (operation) =>
      database.onboardingStore.transaction((state) =>
        operation(
          ((state.operations ??= {})['service-v1'] ??= emptyOperationsState()),
        ),
      ),
  });
  let now = 1000000,
    balance = '99',
    outage = false,
    success = false;
  const received: { body: string; headers: Headers }[] = [];
  const request = (async (_url, options) => {
    received.push({
      body: String(options?.body),
      headers: new Headers(options?.headers),
    });
    return new Response(null, { status: success ? 204 : 503 });
  }) as typeof fetch;
  const make = (database = db, sender = request, config = configuration) =>
    new PayerOperations(
      config,
      store(database),
      [
        {
          address: 'payer-one',
          balance: async () => {
            if (outage) throw new Error('private upstream error');
            return balance;
          },
        },
      ],
      'https://wallet.example.test',
      resolve,
      sender,
      () => now,
    );
  return {
    db,
    open,
    configuration,
    key,
    secondKey,
    store,
    make,
    received,
    resolve,
    advance: (ms: number) => (now += ms),
    setBalance: (value: string) => (balance = value),
    setOutage: (value: boolean) => (outage = value),
    succeed: () => (success = true),
  };
}
describe('durable payer events and webhooks', () => {
  it('signs exact CloudEvents bytes, suppresses unchanged observations and retries the same ID after restart', async () => {
    const f = await fixture(),
      monitor = f.make();
    await monitor.sample();
    await monitor.sample();
    expect(await monitor.health()).toMatchObject({
      status: 'degraded',
      low_balance_payers: 1,
      webhook_pending: 1,
    });
    await monitor.deliver();
    const first = f.received[0],
      event = JSON.parse(first.body),
      timestamp = first.headers.get('webhook-timestamp')!;
    expect(first.headers.get('content-type')).toBe(
      'application/cloudevents+json',
    );
    expect(first.headers.get('webhook-id')).toBe(event.id);
    expect(first.headers.get('webhook-signature')).toBe(
      'v1,' +
        createHmac('sha256', f.key)
          .update(`${event.id}.${timestamp}.${first.body}`)
          .digest('base64'),
    );
    expect(event).toMatchObject({
      specversion: '1.0',
      type: 'com.moovha.wallet-provider.payer.observed.v1',
      subject: payerKey('payer-one'),
      data: { balance: 'low', threshold_wei: '100', balance_wei: '99' },
    });
    expect(JSON.stringify(event)).not.toContain('payer-one');
    expect(await monitor.health()).toMatchObject({
      webhook_pending: 1,
      webhook_failed: 1,
    });
    f.advance(10000);
    f.succeed();
    const restarted = f.make(f.open());
    await restarted.deliver();
    expect(f.received).toHaveLength(2);
    expect(f.received[1].body).toBe(first.body);
    expect(f.received[1].headers.get('webhook-timestamp')).not.toBe(timestamp);
    expect(await restarted.health()).toMatchObject({
      webhook_pending: 0,
      webhook_failed: 0,
    });
    f.setBalance('100');
    await restarted.sample();
    expect(await restarted.health()).toMatchObject({
      status: 'healthy',
      low_balance_payers: 0,
      webhook_pending: 1,
    });
  });
  it('claims deliveries atomically across SQLite connections and recovers a lost acknowledgment only after lease expiry', async () => {
    const f = await fixture();
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => (unblock = resolve));
    let calls = 0;
    const delayed = (async () => {
      calls++;
      await gate;
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const first = f.make(f.db, delayed),
      second = f.make(f.open(), delayed);
    await first.sample();
    const sending = first.deliver();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await second.deliver();
    expect(calls).toBe(1);
    f.advance(31000);
    const recovered = second.deliver();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toBe(2);
    unblock();
    await Promise.all([sending, recovered]);
    expect(await second.health()).toMatchObject({ webhook_pending: 0 });
  });
  it('reports unavailable evidence, staleness and recovered funding as distinct transitions without copying errors', async () => {
    const f = await fixture(),
      monitor = f.make();
    f.setOutage(true);
    await monitor.sample();
    expect(await monitor.health()).toMatchObject({
      unavailable_payers: 1,
      low_balance_payers: 0,
    });
    f.advance(16000);
    expect(await monitor.health()).toMatchObject({ stale_payers: 1 });
    f.setOutage(false);
    f.setBalance('100');
    await monitor.sample();
    expect(await monitor.health()).toMatchObject({
      status: 'healthy',
      unavailable_payers: 0,
      stale_payers: 0,
      webhook_pending: 2,
    });
    const state = await f
      .store()
      .transaction((state) => structuredClone(state));
    expect(JSON.stringify(state)).not.toContain('private upstream error');
  });
  it('pins pending deliveries to their original destination and exposes an unroutable backlog after reconfiguration', async () => {
    const f = await fixture(),
      monitor = f.make();
    await monitor.sample();
    await f.store().transaction((state) => {
      for (const delivery of Object.values(state.deliveries))
        delivery.target = 'original-destination';
    });
    await monitor.deliver();
    expect(f.received).toHaveLength(0);
    expect(await monitor.health()).toMatchObject({
      status: 'degraded',
      webhook_unroutable: 1,
    });
  });
  it('records incident and recovery delivery intents atomically with operational conditions and signs with overlapping rotation keys', async () => {
    const f = await fixture();
    f.configuration.webhooks[0].signingSecrets.push({ env: 'SECOND' });
    const monitor = f.make();
    await f
      .store()
      .transaction((state) =>
        recordPayer(
          state,
          payerKey('payer-one'),
          { affected: true, reason: 'payer-quarantined' },
          f.configuration,
          monitor.targets,
          monitor.source,
        ),
      );
    await monitor.sample();
    expect(await monitor.health()).toMatchObject({ affected_payers: 1 });
    await monitor.deliver();
    expect(
      f.received[0].headers.get('webhook-signature')?.split(' '),
    ).toHaveLength(2);
    await f
      .store()
      .transaction((state) =>
        recordPayer(
          state,
          payerKey('payer-one'),
          { affected: false, reason: 'none' },
          f.configuration,
          monitor.targets,
          monitor.source,
        ),
      );
    expect(await monitor.health()).toMatchObject({ affected_payers: 0 });
  });
  it('rejects unsafe destinations and malformed signing keys before network effects', async () => {
    const f = await fixture();
    const credentialed = new URL('https://receiver.example.test');
    credentialed.username = 'fixture';
    credentialed.password = randomBytes(16).toString('hex');
    for (const destination of [
      'http://receiver.example.test',
      credentialed.href,
      'https://receiver.example.test/?secret=x',
    ])
      expect(() =>
        webhookTargets(f.configuration, (ref) =>
          ref.env === 'ENDPOINT' ? destination : f.resolve(ref),
        ),
      ).toThrow();
    expect(() =>
      webhookTargets(f.configuration, (ref) =>
        ref.env === 'SIGNING' ? 'not-a-signing-key' : f.resolve(ref),
      ),
    ).toThrow();
  });
});
it('requires canonical block and balance agreement for idle payer monitoring', async () => {
  const f = executionFixture();
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test', 'https://secondary.example.test'],
    f.configuration.rpc.genesisHash,
    10000,
    f.request,
  );
  const payer = f.configuration.sponsors[0].binding.address;
  expect(BigInt(await observer.payerBalance(payer))).toBeGreaterThan(0n);
  f.state.mutate = (method, result, origin) =>
    method === 'eth_getBalance' && origin.includes('secondary')
      ? '0x1'
      : result;
  await expect(observer.payerBalance(payer)).rejects.toThrow();
});
