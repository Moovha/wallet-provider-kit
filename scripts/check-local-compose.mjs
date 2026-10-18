/** Verify Compose and secret mounts with offline containers; no database or provider effects. */
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
const directory = await mkdtemp(join(tmpdir(), 'wpk-compose-contract-'));
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
const docker = (extra) =>
  execute('docker', [...args, ...extra], {
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
try {
  const config = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.bundled.example.json', import.meta.url),
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
  const compose = localCompose(
    { directory, project, port: 18080, config },
    fileURLToPath(new URL('../', import.meta.url)),
  );
  // CI builds this reviewed image immediately before this check.
  compose.services.api.image = 'wallet-provider-kit:verify';
  delete compose.services.api.build;
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
  console.log(
    'Compose parsing, unprivileged config validation, literal multiline secret loading, bundled OWS native import and Caddy configuration validation passed; no storage initialization, wallets, provider requests or certificate issuance.',
  );
} finally {
  await docker(['down', '--remove-orphans']).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
