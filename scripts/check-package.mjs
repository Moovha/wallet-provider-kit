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
  assert.ok(paths.includes('examples/inspect-api.mjs'));
  for (const path of paths) {
    assert.match(path, /^(dist\/|spec\/|docs\/|examples\/|[^/]+$)/);
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
    '--omit=optional',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]);
  const installed = join(temporary, 'node_modules/@moovha/wallet-provider-kit');
  await assert.rejects(
    access(join(temporary, 'node_modules/@open-wallet-standard/core')),
    { code: 'ENOENT' },
  );
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
      if (!name.endsWith('/cdp') && !name.endsWith('/ows') && !name.endsWith('/openzeppelin-relayer')) {
        for (const [key, value] of Object.entries(surface)) assert.equal(root[key], value);
      }
    }
    await assert.rejects(import('@moovha/wallet-provider-kit/dist/main.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    const schema = JSON.parse(await readFile(new URL(import.meta.resolve('@moovha/wallet-provider-kit/spec/provider-api.json')), 'utf8'));
    assert.ok(schema.paths['/v1/actions/{actionId}/sign']);
    const draft = JSON.parse(await readFile(new URL(import.meta.resolve('@moovha/wallet-provider-kit/spec/orchestration-draft.json')), 'utf8'));
    assert.equal(draft.openapi, '3.1.1');
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
  const walkthrough = run(process.execPath, [
    join(installed, 'examples/provider-flow/run.mjs'),
  ]);
  assert.equal(walkthrough.trim().split('\n').length, 7);
  assert.match(
    walkthrough,
    /PASS 7: unknown signing outcome retained; retry does not redispatch/,
  );
  await cp(
    join(installed, 'examples/provider-flow'),
    join(temporary, 'provider-flow'),
    { recursive: true },
  );
  await copyFile(
    join(installed, 'docs/provider.config.example.ts'),
    join(temporary, 'provider.config.ts'),
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
    type SignRoute = ProviderPaths['/v1/actions/{actionId}/sign']['post'];
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
      include: ['*.ts', 'provider-flow/**/*.mjs'],
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
          `${origin}/v1/actions/10000000-0000-4000-8000-000000000001/sign`,
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
    `Package consumer verified: ${candidate.files.length} files, ESM exports, TypeScript, inspection and provider-flow examples, OpenAPI and unconfigured CLI; optional OWS engine omitted`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
