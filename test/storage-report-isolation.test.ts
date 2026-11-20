import { UniswapXOrderService } from '../src/orders/service.js';
import { SafeWalletRuntime } from '../src/sponsorship/safe-wallet.js';
import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageConnection } from '../src/storage/connection.js';
import { sqliteOnboardingStore } from '../src/storage/onboarding.js';
import { getRecord, putRecord } from '../src/onboarding/records.js';
import { readRecordPage, recordPages } from '../src/onboarding/record-pages.js';
const directories: string[] = [];
const connections: { close(): void }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'wpk-report-pages-'));
  directories.push(directory);
  const connection = new StorageConnection({ directory, initialize: true });
  connections.push(connection);
  const raw = new DatabaseSync(join(directory, 'provider.sqlite'), {
    timeout: 0,
  });
  connections.push(raw);
  const store = sqliteOnboardingStore(connection);
  return { directory, connection, raw, store };
}
it('keeps readiness bounded after opening, still verifies startup integrity and detects catalog changes', async () => {
  const { directory, connection, raw } = fixture();
  const prepare = DatabaseSync.prototype.prepare;
  const queries: string[] = [];
  vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (
    this: DatabaseSync,
    sql: string,
  ) {
    queries.push(sql);
    return prepare.call(this, sql);
  });
  for (let i = 0; i < 20; i++) expect(await connection.ready()).toBe(true);
  expect(
    queries.some((sql) =>
      /quick_check|foreign_key_check|onboarding_records/.test(sql),
    ),
  ).toBe(false);
  expect(
    queries
      .filter((sql) => sql.includes('sqlite_schema'))
      .every((sql) => sql.includes('LIMIT')),
  ).toBe(true);
  raw.exec('PRAGMA foreign_keys=OFF');
  raw.exec(
    "INSERT INTO attempts VALUES('scope','provider','orphan','unknown','lease',1,NULL,NULL)",
  );
  expect(() => new StorageConnection({ directory })).toThrow(
    'wallet_provider_configuration',
  );
  expect(queries).toContain('PRAGMA foreign_key_check');
  raw.exec('DELETE FROM attempts; DROP TRIGGER onboarding_records_update');
  expect(await connection.ready()).toBe(false);
});
it('allows an external writer during a read snapshot and rejects read-callback mutations without poisoning later writes', async () => {
  const { connection, raw, store } = fixture();
  raw
    .prepare('INSERT INTO onboarding_records VALUES(?,?,?)')
    .run('accounts', 'a', '{ "id": "a", "owner": "before" }');
  await store.read!((state) => {
    expect(getRecord(state, 'accounts', 'a').owner).toBe('before');
    raw.exec('BEGIN IMMEDIATE');
    raw
      .prepare(
        'UPDATE onboarding_records SET record=? WHERE collection=? AND id=?',
      )
      .run('{"id":"a","owner":"after"}', 'accounts', 'a');
    raw.exec('COMMIT');
    expect(getRecord(state, 'accounts', 'a').owner).toBe('before');
  });
  expect(
    await store.read!((state) => getRecord(state, 'accounts', 'a').owner),
  ).toBe('after');
  await expect(
    store.read!((state) => {
      getRecord(state, 'accounts', 'a').owner = 'forbidden';
    }),
  ).rejects.toThrow('wallet_attempt_unavailable');
  expect(connection.get('PRAGMA query_only')!.query_only).toBe(0);
  raw.exec('BEGIN IMMEDIATE');
  try {
    expect(await connection.ready()).toBe(true);
    expect(
      await store.read!((state) => getRecord(state, 'accounts', 'a').owner),
    ).toBe('after');
  } finally {
    raw.exec('ROLLBACK');
  }
  await store.transaction((state) => {
    getRecord(state, 'accounts', 'a').owner = 'allowed';
  });
  expect(
    await store.read!((state) => getRecord(state, 'accounts', 'a').owner),
  ).toBe('allowed');
});
it('keeps filtered cursors and page size bounded, and releases the read snapshot between bulk pages', async () => {
  const { raw, store, connection } = fixture();
  const insert = raw.prepare('INSERT INTO onboarding_records VALUES(?,?,?)');
  raw.exec('BEGIN');
  for (let i = 0; i < 2500; i++)
    insert.run(
      'accounts',
      String(i).padStart(4, '0'),
      JSON.stringify({ id: String(i), owner: 'owner' }),
    );
  raw.exec('COMMIT');
  const all = connection.all.bind(connection);
  let maximum = 0;
  vi.spyOn(connection, 'all').mockImplementation((sql, ...args) => {
    const result = all(sql, ...args);
    maximum = Math.max(maximum, result.length);
    return result;
  });
  const empty = await readRecordPage(
    store,
    'accounts',
    { limit: 10 },
    () => undefined,
  );
  expect(empty).toEqual({ items: [], next_cursor: '0009' });
  expect(
    (
      await readRecordPage(
        store,
        'accounts',
        { after: empty.next_cursor!, limit: 10 },
        (_s, r) => r.id,
      )
    ).items,
  ).toEqual(Array.from({ length: 10 }, (_, i) => String(i + 10)));
  await expect(
    readRecordPage(store, 'accounts', { limit: 101 }, (_s, r) => r.id),
  ).rejects.toThrow('wallet_provider_input');
  let pages = 0;
  for await (const records of recordPages(
    store,
    'accounts',
    (_state, row) => row.id,
  )) {
    pages++;
    expect(records.length).toBeLessThanOrEqual(100);
    expect(connection.get('PRAGMA query_only')!.query_only).toBe(0);
    await store.transaction((state) => {
      putRecord(state, 'evidenceOwners', 'progress', String(pages));
    });
  }
  expect(pages).toBe(25);
  expect(maximum).toBeLessThanOrEqual(101);
});
it('latches physical SQLite read failures instead of reporting a healthy connection', async () => {
  const { connection } = fixture();
  const prepare = DatabaseSync.prototype.prepare;
  vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (
    this: DatabaseSync,
    sql: string,
  ) {
    if (sql === 'SELECT broken_fixture')
      throw Object.assign(new Error('offline corruption fixture'), {
        errcode: 11,
      });
    return prepare.call(this, sql);
  });
  expect(() => connection.get('SELECT broken_fixture')).toThrow(
    'wallet_attempt_unavailable',
  );
  expect(await connection.ready()).toBe(false);
  expect(() => connection.transaction(() => true)).toThrow(
    'wallet_attempt_unavailable',
  );
});

it('rotates order recovery past finalized history through bounded read pages', async () => {
  const { raw, store, connection } = fixture();
  const insert = raw.prepare('INSERT INTO onboarding_records VALUES(?,?,?)');
  raw.exec('BEGIN');
  for (let i = 0; i < 312; i++) {
    const id = String(i).padStart(4, '0');
    insert.run(
      'uniswapXOrders',
      id,
      JSON.stringify({
        plan: { id },
        chainFinalized: i < 300,
        state: 'open',
        postDispatched: true,
      }),
    );
  }
  raw.exec('COMMIT');
  let maximum = 0;
  const all = connection.all.bind(connection);
  vi.spyOn(connection, 'all').mockImplementation((sql, ...args) => {
    const rows = all(sql, ...args);
    maximum = Math.max(maximum, rows.length);
    return rows;
  });
  const reconcile = vi.fn(async () => undefined);
  const service = Object.assign(Object.create(UniswapXOrderService.prototype), {
    onboarding: { store },
    reconcile,
  }) as UniswapXOrderService;
  await service.runOnce();
  expect(reconcile.mock.calls).toHaveLength(10);
  await service.runOnce();
  expect(reconcile.mock.calls).toHaveLength(12);
  const ids = reconcile.mock.calls.map(
    (call) => (call as unknown as [{ plan: { id: string } }])[0].plan.id,
  );
  expect(ids).toEqual(
    Array.from({ length: 12 }, (_, i) => String(300 + i).padStart(4, '0')),
  );
  expect(maximum).toBeLessThanOrEqual(101);
});

it('publishes complete streamed bundler configuration and preserves the original on an interrupted page', async () => {
  const { directory } = fixture();
  let fail = false;
  const runtime = Object.assign(Object.create(SafeWalletRuntime.prototype), {
    directory,
    database: {},
    authorization: 'offline-authorization',
    config: {
      safeWallet: {
        runtimeDirectory: 'bundler',
        genesisHash: 'offline-genesis',
      },
    },
    domain: { entryPoint: 'offline-entrypoint', chainId: '0x14a34' },
    current: async () => ({
      paymaster: { address: 'offline-paymaster' },
      executor: { key: 'offline-ciphertext' },
    }),
    resources: { rpcEndpoints: async () => ['https://offline.invalid'] },
    cipher: { open: () => 'disposable-offline-fixture' },
    applicationWalletPages: async function* () {
      for (let page = 0; page < 3; page++) {
        yield Array.from({ length: 100 }, (_, i) => ({
          binding: { address: '0x' + String(page * 100 + i).padStart(40, '0') },
        }));
        if (fail) throw new Error('interrupted fixture');
      }
    },
  }) as { writeBundler(id: string): Promise<void> };
  await runtime.writeBundler('app');
  const path = join(directory, 'bundler/app.json');
  const original = readFileSync(path, 'utf8');
  expect(JSON.parse(original).accounts).toHaveLength(300);
  expect(statSync(path).mode & 0o777).toBe(0o600);
  fail = true;
  await expect(runtime.writeBundler('app')).rejects.toThrow(
    'interrupted fixture',
  );
  expect(readFileSync(path, 'utf8')).toBe(original);
  expect(existsSync(path + '.tmp')).toBe(false);
});
