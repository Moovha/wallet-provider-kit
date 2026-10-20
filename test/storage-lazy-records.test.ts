import { it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProviderDatabase } from '../src/storage/index.js';
import { StorageConnection } from '../src/storage/connection.js';
import { sqliteOnboardingStore } from '../src/storage/onboarding.js';

it('reads only requested JSON payloads as retained history grows, and detaches replaced collections before saving', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-read-budget-'));
  const connection = new StorageConnection({ directory, initialize: true });
  const store = sqliteOnboardingStore(connection);
  try {
    connection.transaction(() => {
      for (let i = 0; i < 500; i++)
        connection.run(
          'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?)',
          'supportedActions',
          String(i),
          JSON.stringify({ fixture: 'x'.repeat(8192) }),
        );
      connection.run(
        'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?)',
        'executionPools',
        'selected',
        '7',
      );
      for (let i = 0; i < 1000; i++)
        connection.run(
          'INSERT INTO onboarding_audit(record) VALUES(?)',
          JSON.stringify({
            at: i,
            event: 'offline-created',
            resource: 'fixture',
            revision: '1',
          }),
        );
    });
    let bytes = 0;
    const all = connection.all.bind(connection);
    const get = connection.get.bind(connection);
    vi.spyOn(connection, 'all').mockImplementation((sql, ...params) => {
      const result = all(sql, ...params);
      bytes += Buffer.byteLength(JSON.stringify(result));
      return result;
    });
    vi.spyOn(connection, 'get').mockImplementation((sql, ...params) => {
      const result = get(sql, ...params);
      bytes += Buffer.byteLength(JSON.stringify(result));
      return result;
    });
    const started = performance.now();
    expect(await store.transaction((s) => s.executionPools!.selected)).toBe(7);
    if (process.env.WPK_RPC_DIAGNOSTICS === '1')
      console.info(
        JSON.stringify({
          scenario: 'indexed-state-read',
          bytes,
          milliseconds: Math.round(performance.now() - started),
          retainedRecords: 501,
          retainedAuditEvents: 1000,
        }),
      );
    expect(bytes).toBeLessThan(100000);
    const detached = await store.transaction((s) => {
      const previous = s.executionPools;
      s.executionPools = { replacement: 9 };
      return previous;
    });
    expect(detached).toEqual({ selected: 7 });
    expect(await store.transaction((s) => s.executionPools)).toEqual({
      replacement: 9,
    });
    expect(await store.transaction((s) => s.audit.length)).toBe(1000);
  } finally {
    vi.restoreAllMocks();
    connection.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it('persists nested changes, replacement and deletion while retaining untouched records and detached snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-lazy-'));
  const a = openProviderDatabase({ directory, initialize: true }),
    b = openProviderDatabase({ directory });
  try {
    await a.onboardingStore.transaction((s) => {
      s.executionPools = { a: 1, b: 2 };
      s.sponsorQuarantines = { one: ['first'], two: ['retained'] };
      s.audit.push({
        at: 1,
        event: 'created',
        resource: 'offline',
        revision: '1',
      });
    });
    const detached = await a.onboardingStore.transaction(
      (s) => s.sponsorQuarantines!.one,
    );
    await b.onboardingStore.transaction((s) => {
      s.sponsorQuarantines!.one.push('revoked');
      delete s.executionPools!.b;
      s.executionPools!.c = 3;
    });
    expect(detached).toEqual(['first']);
    expect(
      await a.onboardingStore.transaction((s) => s.sponsorQuarantines!.one),
    ).toEqual(['first', 'revoked']);
    expect(
      await a.onboardingStore.transaction((s) =>
        structuredClone(s.executionPools),
      ),
    ).toEqual({ a: 1, c: 3 });
    await a.onboardingStore.transaction((s) => {
      s.executionPools = { replacement: 9 };
      Object.defineProperty(s.sponsorQuarantines!, 'one', {
        value: ['replacement'],
        enumerable: true,
        configurable: true,
      });
      s.audit = [
        ...s.audit,
        { at: 2, event: 'updated', resource: 'offline', revision: '1' },
      ];
    });
    expect(
      await b.onboardingStore.transaction((s) =>
        structuredClone(s.executionPools),
      ),
    ).toEqual({ replacement: 9 });
    expect(
      await b.onboardingStore.transaction((s) => s.sponsorQuarantines),
    ).toEqual({ one: ['replacement'], two: ['retained'] });
  } finally {
    a.close();
    b.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it('rolls back record changes and every form of historical audit mutation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-lazy-audit-'));
  const db = openProviderDatabase({ directory, initialize: true });
  try {
    await db.onboardingStore.transaction((s) => {
      s.budgets.saved = 1;
      s.audit.push({
        at: 1,
        event: 'created',
        resource: 'offline',
        revision: '1',
      });
    });
    const mutations = [
      (a: unknown[]) => {
        delete a[0];
      },
      (a: unknown[]) => {
        (a[0] as { event: string }).event = 'changed';
      },
      (a: unknown[]) => {
        Object.defineProperty(a, '0', {
          value: { at: 1, event: 'forged' },
          enumerable: true,
        });
      },
      (a: unknown[]) => {
        a.length = 0;
      },
      (a: unknown[]) => {
        a.splice(0, 1);
      },
    ];
    for (const mutate of mutations)
      await expect(
        db.onboardingStore.transaction((s) => {
          s.budgets.saved = 9;
          mutate(s.audit);
        }),
      ).rejects.toMatchObject({ code: 'wallet_attempt_unavailable' });
    expect(
      await db.onboardingStore.transaction((s) => ({
        value: s.budgets.saved,
        audit: structuredClone(s.audit),
      })),
    ).toEqual({
      value: 1,
      audit: [{ at: 1, event: 'created', resource: 'offline', revision: '1' }],
    });
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
