import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const image = process.argv[2] ?? 'wallet-provider-kit:verify';
const [metadata] = JSON.parse(
  execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }),
);
assert.equal(metadata.Config.User, 'node');
assert.equal(metadata.Config.Healthcheck.Test[0], 'CMD');

// Only disposable fixtures run inside this isolated container; no host mounts.
const fixture = String.raw`
import assert from 'node:assert/strict';
import { accessSync, constants, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { owsCommand } from '/app/dist/providers/ows-process.js';

assert.equal(process.getuid(), 1001);
assert.equal(process.versions.node, '26.12.1');
for (const path of ['/app/package.json', '/app/LICENSE', '/app/NOTICE', '/app/spec/provider-config.schema.json', '/app/docs/provider.config.safe.example.json'])
  accessSync(path, constants.R_OK);
for (const path of ['/bin/sh', '/usr/bin/mount', '/usr/bin/nsenter', '/usr/local/bin/npm'])
  assert.equal(existsSync(path), false, path + ' must not ship in the runtime');
createSecureContext();
assert.equal(createHash('sha256').update('fixture').digest('hex').length, 64);
assert.equal(gunzipSync(gzipSync('fixture')).toString(), 'fixture');
const db = new DatabaseSync(':memory:');
assert.equal(db.prepare('select 1 as value').get().value, 1);
db.close();
await import('/app/dist/deployment/provider.js');
const vaultPath = mkdtempSync('/tmp/wpk-container-');
try {
  await owsCommand({ command: 'create', name: 'offline-fixture', secret: randomUUID(), vaultPath });
  const wallets = await owsCommand({ command: 'list', vaultPath });
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0].name, 'offline-fixture');
} finally {
  rmSync(vaultPath, { recursive: true, force: true });
}
console.log('Restricted container verified: native wallet worker, SQLite, TLS and compression');
`;
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--interactive',
    '--network',
    'none',
    '--read-only',
    '--user',
    '1001:1001',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--entrypoint',
    'node',
    image,
    '--input-type=module',
  ],
  { input: fixture, stdio: ['pipe', 'inherit', 'inherit'], timeout: 60000 },
);
