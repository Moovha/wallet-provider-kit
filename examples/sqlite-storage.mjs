/** Offline storage smoke test: no network, wallets, credentials or provider effects. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProviderDatabase } from '@moovha/wallet-provider-kit/storage';

const directory = await mkdtemp(join(tmpdir(), 'wallet-provider-sqlite-'));
let database = openProviderDatabase({ directory, initialize: true });
try {
  assert.equal(await database.ready(), true);
  await database.setBudget('offline-smoke', '1');
  const request = {
    namespace: 'offline-smoke',
    provider: 'offline',
    attemptId: randomUUID(),
    kind: /** @type {const} */ ('infrastructure_transaction'),
    accountId: randomUUID(),
    resourceKey: 'a'.repeat(64),
    requestHash: 'b'.repeat(64),
  };
  // A trusted host admits exact request fingerprints; this fixture has no real action.
  await database.admitAttempt({
    request,
    budgetId: 'offline-smoke',
    units: '1',
  });
  const claim = await database.journal.claim(request);
  assert.equal(claim.state, 'dispatch');
  if (claim.state !== 'dispatch') throw new Error('Expected exclusive claim');
  const result = {
    kind: /** @type {const} */ ('infrastructure_transaction'),
    transactionId: randomUUID(),
  };
  await database.journal.complete(request, claim.leaseToken, result);
  database.close();
  database = openProviderDatabase({ directory });
  const replay = await database.journal.claim(request);
  assert.equal(replay.state, 'succeeded');
  assert.deepEqual(await database.budget('offline-smoke'), {
    maximum: '1',
    reserved: '1',
  });
  console.log(
    'SQLite storage verified: explicit setup, fenced completion, restart replay and retained budget',
  );
} finally {
  database.close();
  await rm(directory, { recursive: true, force: true });
}
