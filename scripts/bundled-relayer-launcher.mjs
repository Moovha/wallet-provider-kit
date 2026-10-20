/** Private runtime launcher: no shell, secret arguments, vendor logs or public administration listener. */
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
const secrets = parseEnv(readFileSync('/secrets/execution.env', 'utf8'));
for (const name of ['API_KEY', 'KEYSTORE_PASSPHRASE', 'STORAGE_ENCRYPTION_KEY'])
  if (!secrets[name]) process.exit(1);
const child = spawn('/app/openzeppelin-relayer', [], {
  stdio: 'ignore',
  shell: false,
  env: {
    PATH: process.env.PATH,
    HOME: '/tmp',
    ...secrets,
    HOST: '0.0.0.0',
    APP_PORT: '8080',
    IN_DOCKER: 'true',
    REDIS_URL: 'redis://execution-store:6379',
    REPOSITORY_STORAGE_TYPE: 'redis',
    QUEUE_BACKEND: 'redis',
    RESET_STORAGE_ON_START: 'false',
    TRANSACTION_EXPIRATION_HOURS: '876000',
    LOG_LEVEL: 'off',
    RUST_LOG: 'off',
    ENABLE_SWAGGER: 'false',
    METRICS_ENABLED: 'false',
    ACTIX_WORKERS: '1',
    TOKIO_WORKER_THREADS: '1',
    RPC_BLOCK_PRIVATE_IPS: 'true',
    PROVIDER_MAX_RETRIES: '1',
    PROVIDER_MAX_FAILOVERS: '2',
    WPK_FEE_ONLY_REPLACEMENTS: '1',
  },
});
child.on('error', () => process.exit(1));
child.on('close', (code) => process.exit(code ?? 1));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => child.kill(signal));
