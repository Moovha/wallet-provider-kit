import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOwsWalletProvider } from '../dist/providers/ows.js';
import { TestJournal } from '../test/helpers/journal.ts';

// Test-only journal and ephemeral vault; verifies the compiled worker path.
const vaultPath = mkdtempSync(join(tmpdir(), 'moovha-ows-built-'));
try {
  const secret = randomUUID();
  const provider = createOwsWalletProvider(
    { vaultPath, passphrase: async () => secret },
    {
      namespace: 'compiled-ows-test',
      journal: new TestJournal(),
      authorizeAttempt: async () => true,
    },
  );
  const accountId = randomUUID();
  const account = await provider.createAccount(accountId, randomUUID());
  assert.deepEqual(await provider.findAccount(accountId), account);
  console.log(
    'Compiled OWS adapter and worker verified with an ephemeral offline wallet',
  );
} finally {
  rmSync(vaultPath, { recursive: true, force: true });
}
