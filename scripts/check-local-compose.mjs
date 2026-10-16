/** Verify Compose and secret mounts with offline containers; no database or provider effects. */
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
      new URL('../docs/provider.config.example.json', import.meta.url),
      'utf8',
    ),
  );
  config.http = { ...config.http, host: '0.0.0.0', port: 8080 };
  config.storage.directory = '.provider-data';
  await mkdir(join(directory, '.provider-data'), { mode: 0o700 });
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
    { directory, project, port: 18080 },
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
  console.log(
    'Compose parsing, unprivileged config validation and literal multiline secret loading passed; no storage initialization or provider requests.',
  );
} finally {
  await docker(['down', '--remove-orphans']).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
