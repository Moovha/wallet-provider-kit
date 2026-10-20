/** Verify bundled Compose with isolated offline fixtures; no wallet or provider effects. */
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { caddyConfiguration } from '../dist/deployment/https-ingress.js';
import {
  localCompose,
  setupEnvironment,
} from '../dist/deployment/setup-executor.js';

const execute = promisify(execFile);
// The fixture root must be writable and shared with the selected Docker daemon.
const artifacts =
  process.env.WPK_COMPOSE_CHECK_ROOT ??
  fileURLToPath(new URL('../artifacts/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(join(artifacts, 'compose-contract-'));
const project = `wpk-compose-check-${process.pid}`;
const args = [
  'compose',
  '--env-file',
  '/dev/null',
  '--file',
  join(directory, 'compose.json'),
  '--project-name',
  project,
];
const docker = (extra, timeout = 180000) =>
  execute('docker', [...args, ...extra], {
    timeout,
    maxBuffer: 1024 * 1024,
  });
try {
  const config = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  );
  config.http = { ...config.http, host: '0.0.0.0', port: 8080 };
  config.storage.directory = '.provider-data';
  for (const folder of ['.provider-data', '.provider-vault', '.provider-tls'])
    await mkdir(join(directory, folder), { mode: 0o700 });
  await writeFile(
    join(directory, 'caddy.json'),
    JSON.stringify(caddyConfiguration(config.policy.provider.origin)),
    { mode: 0o600 },
  );
  await writeFile(
    join(directory, 'provider.config.json'),
    JSON.stringify(config),
    { mode: 0o600 },
  );
  const fixture = 'offline-$#-value\nsecond line';
  await writeFile(
    join(directory, 'provider.env'),
    setupEnvironment({ OFFLINE_COMPOSE_VALUE: fixture }),
    { mode: 0o600 },
  );
  await mkdir(join(directory, config.safeWallet.runtimeDirectory), {
    recursive: true,
    mode: 0o700,
  });
  await mkdir(join(directory, '.bundler-data'), { mode: 0o700 });
  const compose = localCompose(
    { directory, project, port: 18080, config },
    fileURLToPath(new URL('../', import.meta.url)),
  );
  // CI builds this reviewed image immediately before this check.
  compose.services.api.image = 'wallet-provider-kit:verify';
  delete compose.services.api.build;
  // Empty engine and isolated network prohibit provider effects in this check.
  compose.networks.default.internal = true;
  compose.services['bundler-store'].logging = { driver: 'local' };
  await writeFile(join(directory, 'compose.json'), JSON.stringify(compose), {
    mode: 0o600,
  });
  await docker(['config', '--quiet']);
  await docker([
    'run',
    '--rm',
    '--no-deps',
    'api',
    'validate',
    '--config',
    '/config/provider.json',
  ]);
  await docker([
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'node',
    'api',
    '--env-file=/secrets/provider.env',
    '-e',
    `if(process.env.OFFLINE_COMPOSE_VALUE!==${JSON.stringify(fixture)}||process.getuid()===0)process.exit(1)`,
  ]);
  await docker([
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'node',
    'api',
    '-e',
    "import('@open-wallet-standard/core').then(engine=>{if(typeof engine.createWallet!=='function')process.exit(1)})",
  ]);
  // Validation provisions configuration only; it never starts listeners or certificate issuance.
  await docker([
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'caddy',
    'https',
    'validate',
    '--config',
    '/etc/caddy/provider.json',
  ]);
  await docker(['build', 'bundler'], 10 * 60 * 1000);
  await docker([
    'up',
    '--detach',
    '--wait',
    '--wait-timeout',
    '120',
    'bundler',
  ]);
  await docker([
    'exec',
    '-T',
    'bundler',
    'node',
    '-e',
    "fetch('http://127.0.0.1:3000/rpc/'+ 'a'.repeat(64)).then(r=>{if(r.status!==403)process.exit(1)}).catch(()=>process.exit(1))",
  ]);
  await docker([
    'exec',
    '-T',
    'bundler-store',
    'valkey-cli',
    'SET',
    'wpk-offline-retention',
    'retained',
  ]);
  await docker(['restart', 'bundler-store']);
  await docker([
    'up',
    '--detach',
    '--wait',
    '--wait-timeout',
    '120',
    'bundler',
  ]);
  const retained = await docker([
    'exec',
    '-T',
    'bundler-store',
    'valkey-cli',
    '--raw',
    'GET',
    'wpk-offline-retention',
  ]);
  if (retained.stdout.trim() !== 'retained')
    throw new Error('Execution store did not retain the offline fixture');
  console.log(
    'Compose parsing, unprivileged config validation, literal multiline secret loading, bundled OWS native import, Caddy configuration validation, and empty bundled ERC-4337 gateway/Valkey readiness with fixture retention across a store restart passed; no wallets, provider requests or certificate issuance.',
  );
} catch (error) {
  const logs = await docker(['logs', '--no-color', 'bundler-store']).catch(
    () => ({ stdout: '', stderr: '' }),
  );
  console.error(logs.stdout);
  throw error;
} finally {
  await docker(['down', '--remove-orphans']).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
