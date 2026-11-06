import {
  prepareSafeWalletRecords,
  safeWalletRecord,
} from '../src/sponsorship/wallet-records.js';
import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StorageConnection } from '../src/storage/connection.js';
import { sqliteOnboardingStore } from '../src/storage/onboarding.js';
import {
  getRecord,
  putRecord,
  removeRecord,
  matchingRecords,
  recordPage,
  appendAudit,
  recordCount,
} from '../src/onboarding/records.js';

it('uses primary-key reads and maintained candidate indexes without enumerating unrelated records or audit history', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wpk-indexed-records-'));
  const connection = new StorageConnection({ directory, initialize: true });
  const store = sqliteOnboardingStore(connection);
  try {
    connection.transaction(() => {
      for (let i = 0; i < 5000; i++) {
        const id = String(i).padStart(6, '0');
        connection.run(
          'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?)',
          'accounts',
          id,
          JSON.stringify({ id, owner: 'owner-' + id, status: 'active' }),
        );
        connection.run(
          'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?)',
          'verifiedUsers',
          id,
          JSON.stringify({ id, clientId: i % 2 ? 'a' : 'b' }),
        );
        connection.run(
          'INSERT INTO onboarding_audit(record) VALUES(?)',
          JSON.stringify({
            at: i,
            event: 'fixture',
            resource: 'fixture',
            revision: '1',
          }),
        );
      }
    });
    await store.transaction((s) => {
      expect(
        matchingRecords(s, 'accounts', 'owner', 'owner-000123'),
      ).toHaveLength(1);
      expect(
        recordPage(s, 'verifiedUsers', undefined, 26, 'clientId', 'a'),
      ).toHaveLength(26);
    });
    const all = connection.all.bind(connection);
    let rows = 0;
    const queries: string[] = [];
    vi.spyOn(connection, 'all').mockImplementation((sql, ...parameters) => {
      queries.push(sql);
      const result = all(sql, ...parameters);
      rows += result.length;
      return result;
    });
    await store.transaction((s) => {
      const selected = getRecord(s, 'accounts', '000123');
      expect(selected.owner).toBe('owner-000123');
      selected.owner = 'changed';
      expect(matchingRecords(s, 'accounts', 'owner', 'changed')).toEqual([
        selected,
      ]);
      appendAudit(s, {
        at: 5001,
        event: 'updated',
        resource: 'fixture',
        revision: '1',
      });
    });
    // The first query for a new field builds its index; new values reuse that same field index.
    expect(rows).toBeLessThan(10);
    expect(queries.some((sql) => /SELECT.*onboarding_audit/.test(sql))).toBe(
      false,
    );
    expect(queries.some((sql) => /SELECT id(?:,record)? FROM/.test(sql))).toBe(
      false,
    );
    rows = 0;
    await store.transaction((s) => {
      expect(matchingRecords(s, 'accounts', 'owner', 'changed')).toHaveLength(
        1,
      );
      expect(
        matchingRecords(s, 'accounts', 'owner', 'owner-000123'),
      ).toHaveLength(0);
      expect(
        recordPage(s, 'verifiedUsers', '000050', 26, 'clientId', 'a')[0],
      ).toBe('000051');
    });
    expect(rows).toBeLessThan(40);
    await store.transaction((s) => {
      expect(recordCount(s, 'verifiedUsers', 'clientId', 'a')).toBe(2500);
      getRecord(s, 'verifiedUsers', '000001').clientId = 'b';
      expect(recordCount(s, 'verifiedUsers', 'clientId', 'a')).toBe(2499);
      expect(recordCount(s, 'verifiedUsers', 'clientId', 'b')).toBe(2501);
      getRecord(s, 'verifiedUsers', '000001').clientId = 'a';
    });
    await store.transaction((s) => {
      removeRecord(s, 'verifiedUsers', '000001');
      expect(
        recordPage(s, 'verifiedUsers', undefined, 1, 'clientId', 'a'),
      ).toEqual(['000003']);
    });
    await expect(
      store.transaction((s) => {
        getRecord(s, 'accounts', '000123').owner = 'rolled-back';
        expect(
          matchingRecords(s, 'accounts', 'owner', 'rolled-back'),
        ).toHaveLength(1);
        throw Error('rollback fixture');
      }),
    ).rejects.toMatchObject({ code: 'wallet_attempt_unavailable' });
    expect(
      await store.transaction((s) =>
        matchingRecords(s, 'accounts', 'owner', 'changed'),
      ),
    ).toHaveLength(1);
    await store.transaction((s) => removeRecord(s, 'accounts', '000123'));
    expect(
      await store.transaction((s) =>
        matchingRecords(s, 'accounts', 'owner', 'changed'),
      ),
    ).toHaveLength(0);
  } finally {
    vi.restoreAllMocks();
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('invalidates candidate indexes for another connection and isolates network-specific records', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wpk-index-revocation-'));
  const a = new StorageConnection({ directory, initialize: true });
  const b = new StorageConnection({ directory });
  const first = sqliteOnboardingStore(a),
    second = sqliteOnboardingStore(b);
  const extra = sqliteOnboardingStore(b, 'ethereum');
  try {
    await first.transaction((s) =>
      putRecord(s, 'accounts', 'one', {
        id: 'one',
        owner: 'original',
        status: 'active',
        acceptedUntil: 0,
        acceptanceRevision: '1',
        evidenceHash: '',
      }),
    );
    expect(
      await first.transaction((s) =>
        matchingRecords(s, 'accounts', 'owner', 'original'),
      ),
    ).toHaveLength(1);
    await second.transaction((s) => {
      getRecord(s, 'accounts', 'one').owner = 'revised';
    });
    expect(
      await first.transaction((s) =>
        matchingRecords(s, 'accounts', 'owner', 'original'),
      ),
    ).toHaveLength(0);
    expect(
      await first.transaction((s) =>
        matchingRecords(s, 'accounts', 'owner', 'revised'),
      ),
    ).toHaveLength(1);
    await extra.transaction((s) =>
      putRecord(s, 'accounts', 'two', {
        id: 'two',
        owner: 'revised',
        status: 'active',
        acceptedUntil: 0,
        acceptanceRevision: '1',
        evidenceHash: '',
      }),
    );
    expect(
      (
        await first.transaction((s) =>
          matchingRecords(s, 'accounts', 'owner', 'revised'),
        )
      ).map((r) => r.id),
    ).toEqual(['one']);
    const management = sqliteOnboardingStore(a, undefined, true);
    expect(
      (
        await management.transaction((s) =>
          matchingRecords(s, 'accounts', 'owner', 'revised'),
        )
      ).map((r) => r.id),
    ).toEqual(['one', 'two']);
    await second.transaction((s) => {
      s.accounts = {
        replacement: { ...getRecord(s, 'accounts', 'one'), id: 'replacement' },
      };
      expect(recordCount(s, 'accounts', 'owner', 'revised')).toBe(1);
    });
    expect(
      (
        await first.transaction((s) =>
          matchingRecords(s, 'accounts', 'owner', 'revised'),
        )
      ).map((r) => r.id),
    ).toEqual(['replacement']);
    await first.transaction((s) => {
      const selected = getRecord(s, 'accounts', 'replacement');
      putRecord(s, 'accounts', 'new', { ...selected, id: 'new' });
      expect(
        matchingRecords(s, 'accounts', 'owner', 'revised').map((r) => r.id),
      ).toEqual(['new', 'replacement']);
    });
  } finally {
    a.close();
    b.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('splits legacy Safe records atomically, preserves recovery data and keeps later reads bounded', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wpk-safe-records-'));
  const connection = new StorageConnection({ directory, initialize: true });
  const store = sqliteOnboardingStore(connection);
  const wallets = Object.fromEntries(
    Array.from({ length: 2000 }, (_, i) => [
      String(i),
      {
        accountId: String(i),
        applicationId: 'fixture-app',
        owner: 'fixture-owner',
        status: 'ready',
        recovery: { initializer: '0x1234', saltNonce: String(i) },
      },
    ]),
  );
  const binding = {
    runtimeConfiguration: {
      heads: {},
      proposals: {},
      revisions: {},
      idempotency: {},
      safeWalletAccounts: wallets,
    },
  };
  try {
    connection.transaction(() =>
      connection.run(
        'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?)',
        'deploymentBindings',
        'service-v1',
        JSON.stringify(binding),
      ),
    );
    await expect(
      store.transaction((s) => {
        prepareSafeWalletRecords(s);
        throw Error('rollback fixture');
      }),
    ).rejects.toThrow();
    expect(
      JSON.parse(
        String(
          connection.get(
            'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
            'deploymentBindings',
            'service-v1',
          )!.record,
        ),
      ),
    ).toEqual(binding);
    await store.transaction((s) => prepareSafeWalletRecords(s));
    expect(
      JSON.parse(
        String(
          connection.get(
            'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
            'safeWalletAccounts',
            '1999',
          )!.record,
        ),
      ),
    ).toEqual(wallets['1999']);
    const get = connection.get.bind(connection);
    let bytes = 0;
    vi.spyOn(connection, 'get').mockImplementation((sql, ...parameters) => {
      const row = get(sql, ...parameters);
      bytes += Buffer.byteLength(JSON.stringify(row) ?? '');
      return row;
    });
    expect(await store.transaction((s) => safeWalletRecord(s, '1999'))).toEqual(
      wallets['1999'],
    );
    expect(bytes).toBeLessThan(2000);
    await store.transaction((s) => {
      getRecord(
        s,
        'deploymentBindings',
        'service-v1',
      ).runtimeConfiguration!.safeWalletAccounts = {
        '1999': {
          ...getRecord(s, 'safeWalletAccounts', '1999'),
          owner: 'conflict',
        },
      };
    });
    await expect(
      store.transaction((s) => prepareSafeWalletRecords(s)),
    ).rejects.toMatchObject({ code: 'wallet_provider_configuration' });
    expect(
      JSON.parse(
        String(
          get(
            'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
            'safeWalletAccounts',
            '1999',
          )!.record,
        ),
      ),
    ).toEqual(wallets['1999']);
  } finally {
    vi.restoreAllMocks();
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
