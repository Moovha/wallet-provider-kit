/** Guard the single supported execution surface in source, schema and package exports. */
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.deepEqual(Object.keys(manifest.exports), [
  '.',
  './core',
  './http',
  './onboarding',
  './identity',
  './telemetry',
  './ows',
  './spec/provider-api.json',
  './storage',
  './deployment',
  './spec/provider-config.schema.json',
  './wallet-calls',
  './sponsorship',
]);
for (const path of [
  'src/executor',
  'src/backend.ts',
  'src/providers/cdp.ts',
  'src/providers/openzeppelin-relayer.ts',
  'src/execution/relayer.ts',
  'src/provisioning/pools.ts',
  'spec/execution-service.config.schema.json',
]) {
  await assert.rejects(access(path), { code: 'ENOENT' });
}
const schema = JSON.parse(
  await readFile('spec/provider-config.schema.json', 'utf8'),
);
for (const key of ['financial', 'execution', 'operations', 'localExecution'])
  assert.equal(schema.properties[key], undefined);
for (const key of [
  'safeWallet',
  'safeProvisioning',
  'approvedCalls',
  'runtimeConfiguration',
])
  assert.ok(schema.required.includes(key));
const api = JSON.parse(await readFile('spec/provider-api.json', 'utf8'));
for (const path of Object.keys(api.paths))
  assert.doesNotMatch(
    path,
    /transfer-authorizations|^\/v1\/actions\/|execution-pool|internal\/execution-authority/,
  );
assert.ok(api.paths['/v1/accounts/{accountId}/wallet']);
console.log('Safe/bundler/paymaster is the sole execution surface');
