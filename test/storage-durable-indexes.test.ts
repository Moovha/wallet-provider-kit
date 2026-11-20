import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StorageConnection } from '../src/storage/connection.js';
import { sqliteOnboardingStore } from '../src/storage/onboarding.js';
import { RecordIndexes } from '../src/storage/record-index.js';
import { lookupDefinitions } from '../src/storage/lookup-schema.js';
import { schemaV2 } from '../src/storage/schema-v2.js';
import { applicationId } from '../src/storage/schema.js';
import { upgradeProviderDatabase } from '../src/storage/upgrade.js';
import {
  recordValues,
  recordCount,
  recordPage,
} from '../src/onboarding/records.js';
import { setupCommand } from '../src/deployment/cli.js';
const execute = promisify(execFile);
const directories: string[] = [];
const connections: { close(): void }[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'wpk-durable-index-'));
  directories.push(path);
  return path;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const c of connections.splice(0)) c.close();
  for (const p of directories.splice(0))
    rmSync(p, { recursive: true, force: true });
});

it.each(['OFF', 'ON'])(
  'maintains every lookup projection and count through raw SQLite changes with recursive triggers %s',
  (recursive) => {
    const dir = directory();
    const c = new StorageConnection({ directory: dir, initialize: true });
    connections.push(c);
    const raw = new DatabaseSync(join(dir, 'provider.sqlite'));
    connections.push(raw);
    raw.exec(
      `PRAGMA trusted_schema=OFF; PRAGMA recursive_triggers=${recursive}; PRAGMA foreign_keys=OFF`,
    );
    const row = {
      owner: 'owner',
      userOwner: 'person',
      linkedOwners: ['owner', 'linked', 'linked'],
      members: { owner: {}, member: {} },
      sharing: { subjectOwner: 'shared' },
      accountId: 'wallet',
      applicationId: 'app',
      clientId: 'client',
      caller: {
        issuer: 'https://offline.invalid',
        subject: 'quote"\\雪',
        clientId: 'app',
      },
      input: {
        account_id: 'wallet',
        user: { identity: { fields: { identity_number: 'fixture' } } },
      },
      request: {
        namespace: 'scope',
        provider: 'offline',
        resourceKey: 'resource',
        accountId: 'wallet',
        attemptId: 'attempt',
      },
      metadata: { sender: '0xAbCd', id: 'batch' },
      operationId: 'operation',
      configurationHash: 'configuration',
      stage: 'queued',
      intent: { account: { address: '0xABcd' }, nonce: '9007199254740993' },
      plan: { review: { swapper: '0xAbCD', nonce: '9007199254740994' } },
    };
    const insert = raw.prepare('INSERT INTO onboarding_records VALUES(?,?,?)');
    for (const collection of new Set(
      lookupDefinitions.map(([collection]) => collection),
    ))
      insert.run(collection, 'a', JSON.stringify(row));
    function check() {
      const expected: string[] = [];
      for (const record of raw
        .prepare('SELECT collection,id,record FROM onboarding_records')
        .all()) {
        const logical = String(record.collection).split(':').at(-1);
        for (const [collection, field] of lookupDefinitions)
          if (logical === collection)
            for (const value of new Set(
              recordValues(JSON.parse(String(record.record)), field),
            ))
              expected.push(
                JSON.stringify([record.collection, field, value, record.id]),
              );
      }
      const actual = raw
        .prepare('SELECT collection,field,value,id FROM onboarding_lookup')
        .all()
        .map((r) => JSON.stringify([r.collection, r.field, r.value, r.id]));
      expect(actual.sort()).toEqual(expected.sort());
      expect(
        raw
          .prepare(
            'SELECT collection,field,value,count FROM onboarding_lookup_counts ORDER BY collection,field,value',
          )
          .all(),
      ).toEqual(
        raw
          .prepare(
            'SELECT collection,field,value,count(*) AS count FROM onboarding_lookup GROUP BY collection,field,value ORDER BY collection,field,value',
          )
          .all(),
      );
      expect(
        raw
          .prepare(
            'SELECT collection FROM onboarding_collections ORDER BY collection',
          )
          .all(),
      ).toEqual(
        raw
          .prepare(
            'SELECT DISTINCT collection FROM onboarding_records ORDER BY collection',
          )
          .all(),
      );
    }
    check();
    raw
      .prepare('INSERT OR IGNORE INTO onboarding_records VALUES(?,?,?)')
      .run('accounts', 'a', JSON.stringify({ owner: 'ignored' }));
    check();
    raw
      .prepare('INSERT OR REPLACE INTO onboarding_records VALUES(?,?,?)')
      .run(
        'accounts',
        'a',
        JSON.stringify({ owner: 'replacement', linkedOwners: ['replacement'] }),
      );
    check();
    raw
      .prepare(
        'INSERT INTO onboarding_records VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET record=excluded.record',
      )
      .run('accounts', 'a', JSON.stringify(row));
    check();
    insert.run('accounts', 'b', JSON.stringify({ owner: 'destination' }));
    raw.exec(
      "UPDATE OR REPLACE onboarding_records SET id='b' WHERE collection='accounts' AND id='a'",
    );
    check();
    raw.exec(
      "UPDATE onboarding_records SET collection='ethereum:accounts' WHERE collection='accounts'",
    );
    check();
    raw.exec('BEGIN IMMEDIATE');
    raw.exec("UPDATE onboarding_records SET record='{}'");
    check();
    raw.exec('ROLLBACK');
    check();
    raw.exec('DELETE FROM onboarding_records');
    check();
  },
);

it('uses durable covering indexes on a fresh process and after unrelated external commits', async () => {
  const dir = directory();
  const c = new StorageConnection({ directory: dir, initialize: true });
  connections.push(c);
  c.transaction(() => {
    for (let i = 0; i < 5000; i++) {
      c.run(
        'INSERT INTO onboarding_records VALUES(?,?,?)',
        'safeWalletAccounts',
        String(i).padStart(6, '0'),
        JSON.stringify({ accountId: String(i), applicationId: 'app' }),
      );
      c.run(
        'INSERT INTO onboarding_records VALUES(?,?,?)',
        'verifiedUsers',
        String(i).padStart(6, '0'),
        JSON.stringify({ clientId: 'app' }),
      );
    }
  });
  const connectionUrl = new URL('../src/storage/connection.ts', import.meta.url)
    .href;
  const indexesUrl = new URL('../src/storage/record-index.ts', import.meta.url)
    .href;
  const program = `import {StorageConnection} from ${JSON.stringify(connectionUrl)}; import {RecordIndexes} from ${JSON.stringify(indexesUrl)};
  const c=new StorageConnection({directory:process.argv[1]});let rows=0;const all=c.all.bind(c);const plans=[];
  c.all=(sql,...args)=>{ const result=all(sql,...args); rows+=result.length; if(sql.includes('onboarding_lookup') || sql.includes('onboarding_records')) plans.push(...all('EXPLAIN QUERY PLAN '+sql,...args).map(r=>r.detail));return result;};
  const index=new RecordIndexes(c);const count=index.count('safeWalletAccounts','applicationId','app');const page=index.ids('verifiedUsers','clientId','app','004970',10);const absent=index.ids('safeWalletAccounts','applicationId','absent');
  console.log(JSON.stringify({rows,count,length:page.length,absent:absent.length,plans}));c.close();`;
  for (let i = 0; i < 2; i++) {
    const result = JSON.parse(
      (
        await execute(process.execPath, [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          program,
          dir,
        ])
      ).stdout,
    );
    expect(result).toMatchObject({ count: 5000, length: 10, absent: 0 });
    expect(result.rows).toBe(11);
    expect(
      result.plans.every(
        (p: string) => p.includes('SEARCH') && !p.includes('SCAN'),
      ),
    ).toBe(true);
    const raw = new DatabaseSync(join(dir, 'provider.sqlite'));
    raw.prepare('INSERT INTO onboarding_audit(record) VALUES(?)').run('{}');
    raw.close();
  }
  const store = sqliteOnboardingStore(c);
  const index = new RecordIndexes(c);
  expect(
    await store.transaction((s) =>
      recordCount(s, 'safeWalletAccounts', 'applicationId', 'app'),
    ),
  ).toBe(5000);
  const raw = new DatabaseSync(join(dir, 'provider.sqlite'));
  connections.push(raw);
  raw.exec(
    "DELETE FROM onboarding_records WHERE collection='safeWalletAccounts' AND id='000001'",
  );
  const all = c.all.bind(c);
  const queries: string[] = [];
  vi.spyOn(c, 'all').mockImplementation((sql, ...args) => {
    queries.push(sql);
    return all(sql, ...args);
  });
  expect(
    await store.transaction((s) =>
      recordCount(s, 'safeWalletAccounts', 'applicationId', 'app'),
    ),
  ).toBe(4999);
  expect(
    await store.transaction((s) =>
      recordPage(s, 'verifiedUsers', '004970', 10, 'clientId', 'app'),
    ),
  ).toHaveLength(10);
  expect(index.ids('safeWalletAccounts', 'applicationId', 'absent')).toEqual(
    [],
  );
  expect(
    queries.some(
      (q) =>
        q.includes('data_version') ||
        q.includes('SELECT id,record') ||
        q.includes('SELECT DISTINCT'),
    ),
  ).toBe(false);
});

function legacy(dir: string) {
  const path = join(dir, 'provider.sqlite');
  writeFileSync(path, '', { mode: 0o600 });
  const db = new DatabaseSync(path);
  db.exec(schemaV2);
  db.exec(`PRAGMA application_id=${applicationId}; PRAGMA user_version=2`);
  db.prepare('INSERT INTO onboarding_records VALUES(?,?,?)').run(
    'accounts',
    'wallet',
    '{ "owner": "retained", "linkedOwners": ["linked"], "members": {"member":{}} }',
  );
  db.prepare('INSERT INTO onboarding_records VALUES(?,?,?)').run(
    'safeWalletAccounts',
    'wallet',
    JSON.stringify({
      accountId: 'wallet',
      applicationId: 'app',
      recovery: { initializer: '0x1234', saltNonce: '9007199254740993' },
      signer: { accountId: 'signer', address: 'offline-fixture' },
    }),
  );
  db.exec(
    "INSERT INTO budgets VALUES('budget','10','1'); INSERT INTO approvals VALUES('approval','wallet','sign_typed_data','fingerprint','{}',0); INSERT INTO admissions VALUES('scope','provider','attempt','resource','hash','{}','approval',NULL,'budget','1'); INSERT INTO attempts VALUES('scope','provider','attempt','unknown','lease',1,NULL,NULL)",
  );
  return db;
}
const tableNames = [...schemaV2.matchAll(/CREATE TABLE (\w+)/g)].map(
  (m) => m[1],
);
function snapshot(db: DatabaseSync) {
  return tableNames.map((table) =>
    db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  );
}

it('upgrades only the exact legacy catalog atomically, preserves wallet and attempt records, and supports the offline CLI', async () => {
  const dir = directory();
  const old = legacy(dir);
  const before = snapshot(old);
  old.close();
  expect(
    () => new StorageConnection({ directory: dir, initialize: true }),
  ).toThrow('wallet_provider_configuration');
  const original = DatabaseSync.prototype.exec;
  const fault = vi
    .spyOn(DatabaseSync.prototype, 'exec')
    .mockImplementation(function (this: DatabaseSync, sql: string) {
      original.call(this, sql);
      if (sql === 'UPDATE onboarding_records SET record=record')
        throw Error('interrupted upgrade fixture');
    });
  expect(() => upgradeProviderDatabase(dir)).toThrow(
    'wallet_provider_configuration',
  );
  fault.mockRestore();
  const retained = new DatabaseSync(join(dir, 'provider.sqlite'));
  expect(retained.prepare('PRAGMA user_version').get()!.user_version).toBe(2);
  expect(snapshot(retained)).toEqual(before);
  expect(
    retained
      .prepare("SELECT name FROM sqlite_schema WHERE name='onboarding_lookup'")
      .get(),
  ).toBeUndefined();
  retained.close();
  const config = JSON.parse(
    readFileSync(
      new URL('../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  );
  config.storage.directory = '.';
  writeFileSync(join(dir, 'provider.config.json'), JSON.stringify(config));
  const output = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  expect(
    await setupCommand([
      'upgrade-storage',
      '--config',
      join(dir, 'provider.config.json'),
    ]),
  ).toBe(true);
  output.mockRestore();
  expect(upgradeProviderDatabase(dir)).toEqual({
    fromVersion: 3,
    toVersion: 3,
  });
  const upgraded = new StorageConnection({ directory: dir });
  connections.push(upgraded);
  expect(await upgraded.ready()).toBe(true);
  const inspect = new DatabaseSync(join(dir, 'provider.sqlite'));
  expect(snapshot(inspect)).toEqual(before);
  inspect.close();
  expect(
    new RecordIndexes(upgraded).ids('accounts', '$walletPerson', 'member'),
  ).toEqual(['wallet']);
  expect(
    new RecordIndexes(upgraded).count(
      'safeWalletAccounts',
      'applicationId',
      'app',
    ),
  ).toBe(1);
});

it('refuses schema drift, unknown versions and unsafe permissions without upgrading', () => {
  const dir = directory();
  const db = legacy(dir);
  const before = snapshot(db);
  db.exec('CREATE INDEX unrecognized ON budgets(maximum)');
  expect(() => upgradeProviderDatabase(dir)).toThrow(
    'wallet_provider_configuration',
  );
  expect(snapshot(db)).toEqual(before);
  expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(2);
  db.exec('DROP INDEX unrecognized; PRAGMA user_version=999');
  expect(() => upgradeProviderDatabase(dir)).toThrow(
    'wallet_provider_configuration',
  );
  db.close();
  chmodSync(join(dir, 'provider.sqlite'), 0o644);
  expect(() => upgradeProviderDatabase(dir)).toThrow(
    'wallet_provider_configuration',
  );
});

it('rejects missing maintenance triggers and refuses unindexed field lookups', async () => {
  const dir = directory();
  const c = new StorageConnection({ directory: dir, initialize: true });
  connections.push(c);
  expect(() =>
    new RecordIndexes(c).ids('accounts', 'unindexed', 'value'),
  ).toThrow();
  const raw = new DatabaseSync(join(dir, 'provider.sqlite'));
  raw.exec('DROP TRIGGER onboarding_records_update');
  raw.close();
  expect(await c.ready()).toBe(false);
  expect(() => new StorageConnection({ directory: dir })).toThrow(
    'wallet_provider_configuration',
  );
  expect(() => upgradeProviderDatabase(dir)).toThrow(
    'wallet_provider_configuration',
  );
});
