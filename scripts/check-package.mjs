import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  access,
  cp,
  mkdtemp,
  readFile,
  copyFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'wallet-provider-consumer-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, cwd = temporary) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

try {
  const [candidate] = JSON.parse(
    run(
      npm,
      ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary],
      root,
    ),
  );
  const paths = candidate.files.map(({ path }) => path);
  assert.ok(paths.includes('dist/providers/ows-worker.js'));
  assert.ok(paths.includes('dist/management/console.mjs'));
  assert.ok(paths.includes('dist/service/documentation-token-ui.mjs'));
  assert.ok(paths.includes('examples/inspect-api.mjs'));
  assert.ok(paths.includes('spec/provider-config.schema.json'));
  assert.ok(paths.includes('docs/provider.config.safe.example.json'));
  assert.ok(
    !paths.some((path) => /setup-ui|setup-server|setup-readiness/.test(path)),
  );
  assert.ok(paths.includes('docs/provider.config.safe.example.json'));
  assert.ok(
    !paths.some((p) =>
      /(?:^dist\/executor\/|relayer|cdp|orchestration-draft|execution-service)/i.test(
        p,
      ),
    ),
  );
  for (const path of paths) {
    assert.match(path, /^(dist\/|spec\/|docs\/|examples\/|[^/]+$)/);
    assert.doesNotMatch(path, /local-adapters|atomic-vault-swap|DexAdapters/);
    assert.doesNotMatch(
      path,
      /(^|\/)(AGENTS\.md|agents\.md|CLAUDE\.md|\.codex|\.claude|\.idea|\.vscode|\.local|scratch)(\/|$)|\.code-workspace$/,
    );
    assert.doesNotMatch(
      path,
      /(^|\/)(\.env[^/]*|\.provider-data|\.vitepress|node_modules|test|\.git)(\/|$)/,
    );
  }
  await writeFile(
    join(temporary, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  run(npm, [
    'install',
    join(temporary, candidate.filename),
    '--omit=dev',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]);
  const installed = join(temporary, 'node_modules/@moovha/wallet-provider-kit');
  await access(join(temporary, 'node_modules/@open-wallet-standard/core'));
  await access(join(temporary, 'node_modules/oidc-provider'));
  const manifest = JSON.parse(
    await readFile(join(installed, 'package.json'), 'utf8'),
  );
  assert.equal(manifest.private, true, 'npm publication must remain disabled');
  assert.equal(manifest.types, './dist/index.d.ts');
  const modules = Object.keys(manifest.exports).filter(
    (path) => !path.endsWith('.json'),
  );
  const imports = modules.map(
    (path) => `@moovha/wallet-provider-kit${path === '.' ? '' : path.slice(1)}`,
  );
  await writeFile(
    join(temporary, 'exports.mjs'),
    `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    const root = await import('@moovha/wallet-provider-kit');
    for (const name of ${JSON.stringify(imports)}) {
      const surface = await import(name);
      assert.ok(Object.keys(surface).length > 0);
      for (const key of ['atomicVaultSwapCalls', 'dexAdapterArtifacts', 'encodeDexSwapRoute']) assert.equal(surface[key], undefined);
      if (!name.endsWith('/ows')) {
        for (const [key, value] of Object.entries(surface)) assert.equal(root[key], value);
      }
    }
    const sponsorship = await import('@moovha/wallet-provider-kit/sponsorship');
    for (const name of ['UserOperationExecutionCoordinator', 'UserOperationWalletCallsDriver', 'UserOperationReceiptObserver', 'createBundlerClientV07']) assert.equal(typeof sponsorship[name], 'function');
    assert.equal(typeof (await import('@moovha/wallet-provider-kit/http')).WalletCallsService, 'function');
    await assert.rejects(import('@moovha/wallet-provider-kit/dist/main.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    const schema = JSON.parse(await readFile(new URL(import.meta.resolve('@moovha/wallet-provider-kit/spec/provider-api.json')), 'utf8'));
    assert.ok(schema.paths['/v1/accounts/{accountId}/wallet']);

  `,
  );
  run(process.execPath, ['exports.mjs']);
  assert.match(
    run(process.execPath, [join(installed, 'examples/sqlite-storage.mjs')]),
    /SQLite storage verified/,
  );
  await copyFile(
    join(installed, 'examples/inspect-api.mjs'),
    join(temporary, 'inspect-api.mjs'),
  );
  assert.match(
    run(process.execPath, ['inspect-api.mjs']),
    /live: 200, ready: 503, openapi: '3.0.3'/,
  );
  const executable = join(installed, 'dist/main.js');
  assert.match(
    run(process.execPath, [executable, 'init']),
    /Zero-application configuration created/,
  );
  const initialConfiguration = JSON.parse(
    await readFile(join(temporary, 'provider.config.json'), 'utf8'),
  );
  assert.deepEqual(initialConfiguration.policy.applications, []);
  assert.ok(initialConfiguration.management);
  assert.match(
    run(process.execPath, [
      executable,
      'validate',
      '--config',
      'provider.config.json',
    ]),
    /Configuration valid/,
  );
  assert.match(
    run(process.execPath, [
      executable,
      'init-storage',
      '--config',
      'provider.config.json',
    ]),
    /Toolkit storage initialized/,
  );
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [executable, 'doctor', '--config', 'provider.config.json'],
        {
          cwd: temporary,
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    (error) =>
      error.status === 1 &&
      String(error.stdout).includes('storage:catalog-and-integrity') &&
      String(error.stdout).includes('not_verified'),
  );
  assert.match(
    run(process.execPath, [
      executable,
      'init-secrets',
      '--config',
      'provider.config.json',
    ]),
    /Private provider.env created/,
  );
  const retainedSecrets = await readFile(
    join(temporary, 'provider.env'),
    'utf8',
  );
  assert.throws(() =>
    run(process.execPath, [
      executable,
      'init-secrets',
      '--config',
      'provider.config.json',
    ]),
  );
  assert.equal(
    await readFile(join(temporary, 'provider.env'), 'utf8'),
    retainedSecrets,
  );
  const diagnosis = JSON.parse(
    run(process.execPath, [
      '--env-file=provider.env',
      executable,
      'doctor',
      '--config',
      'provider.config.json',
    ]),
  );
  assert.ok(
    diagnosis.checks.some(
      (entry) =>
        entry.check === 'authentication:bundled-issuer' &&
        entry.status === 'pass',
    ),
  );

  await writeFile(
    join(temporary, 'consumer.ts'),
    `
    import { EmbeddedWalletService, type WalletSigningProvider } from '@moovha/wallet-provider-kit/core';
    import { createServer, type ProviderPaths } from '@moovha/wallet-provider-kit/http';
    import { createOnboardingProvider, type OnboardingPolicy } from '@moovha/wallet-provider-kit/onboarding';
    import { EnrollmentService } from '@moovha/wallet-provider-kit/identity';
    import { startTelemetry } from '@moovha/wallet-provider-kit/telemetry';
    ${imports.map((name, i) => `import * as surface${i} from '${name}';\ntype Surface${i} = typeof surface${i};`).join('\n')}
    const server: Promise<Awaited<ReturnType<typeof createServer>>> = createServer();
    type SignRoute = ProviderPaths['/v1/accounts/{accountId}/wallet']['post'];
    type Backend = WalletSigningProvider;
    type Policy = OnboardingPolicy;
  `,
  );
  await writeFile(
    join(temporary, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        allowJs: true,
        checkJs: true,
      },
      include: ['*.ts'],
    }),
  );
  run(process.execPath, [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    '-p',
    temporary,
  ]);

  // Launch the installed executable with a clean environment and ephemeral loopback port.
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  const bin = join(temporary, 'node_modules/.bin/wallet-provider-kit');
  assert.match(await readFile(bin, 'utf8'), /^#!\/usr\/bin\/env node/);
  const child = spawn(bin, [], {
    cwd: temporary,
    env: {
      PATH: process.env.PATH,
      HOST: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const closed = once(child, 'close');
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      closed.then(() => {
        throw new Error('Installed CLI exited before startup');
      }),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Installed CLI startup timed out')),
          10000,
        );
        timer.unref();
      }),
    ]);
    const origin = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${origin}/health/live`)).status, 200);
    assert.equal((await fetch(`${origin}/health/ready`)).status, 503);
    assert.equal(
      (
        await fetch(
          `${origin}/v1/accounts/10000000-0000-4000-8000-000000000001/provision`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          },
        )
      ).status,
      503,
    );
  } finally {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
    await closed;
    clearTimeout(timer);
  }
  console.log(
    `Package consumer verified: ${candidate.files.length} files, ESM exports, TypeScript, API inspection, OpenAPI and unconfigured CLI; bundled OWS engine installed`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
