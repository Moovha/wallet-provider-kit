import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
  lstat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLocalRuntime } from '../src/deployment/local-runtime.js';
import { runLocalSetup } from '../src/deployment/local-setup-cli.js';
import { runtimeFixture } from './fixtures/local-runtime.js';
import type { ProviderConfiguration } from '../src/deployment/config.js';
let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'wallet-runtime-test-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});
it('detects without effects, installs only missing packages, preserves Docker settings and context, then verifies a local engine', async () => {
  const fixture = runtimeFixture(home);
  const run = createLocalRuntime(fixture.options);
  expect((await run.check()).state).toBe('missing');
  expect(await readdir(home)).toEqual([]);
  expect(
    fixture.calls.some(
      (call) => call.args.includes('install') || call.args.includes('start'),
    ),
  ).toBe(false);
  await mkdir(join(home, '.docker'), { mode: 0o700 });
  await writeFile(
    join(home, '.docker/config.json'),
    JSON.stringify({
      auths: { 'offline.registry': { auth: 'private-test-value' } },
      cliPluginsExtraDirs: ['/existing/plugins'],
    }),
  );
  expect(run.start().state).toBe('installing');
  expect(() => run.start()).toThrow();
  await run.settled();
  expect(run.status().state).toBe('ready');
  expect(run.status().steps.every((step) => step.state === 'complete')).toBe(
    true,
  );
  expect(
    fixture.calls.find((call) => call.args[0] === 'install')?.args,
  ).toEqual(['install', 'docker', 'docker-compose', 'docker-buildx', 'colima']);
  const start = fixture.calls.find((call) => call.args[0] === 'start')!;
  expect(start.args).toContain('--activate=false');
  expect(start.args).toContain('/offline/checkout');
  expect(start.args).toContain(`${home}/deployments:w`);
  expect(fixture.calls.some((call) => call.args.includes('use'))).toBe(false);
  const saved = JSON.parse(
    await readFile(join(home, '.docker/config.json'), 'utf8'),
  );
  expect(saved.auths['offline.registry'].auth).toBe('private-test-value');
  expect(saved.cliPluginsExtraDirs).toEqual([
    '/existing/plugins',
    join(home, 'brew/lib/docker/cli-plugins'),
  ]);
  expect((await lstat(join(home, '.docker/config.json'))).mode & 0o777).toBe(
    0o600,
  );
  expect(JSON.stringify(run.status())).not.toContain('private-test-value');
  expect(await run.docker(['context', 'inspect'], 1000)).toBe(
    'unix:///offline/docker.sock',
  );
});
it('reuses a healthy runtime without installing or writing anything', async () => {
  const fixture = runtimeFixture(home, {
    docker: true,
    compose: true,
    buildx: true,
    engine: true,
  });
  const run = createLocalRuntime(fixture.options);
  expect((await run.check()).state).toBe('ready');
  expect(() => run.start()).toThrow();
  expect(await readdir(home)).toEqual([]);
  expect(
    fixture.calls.every((call) => !['brew', 'colima'].includes(call.file)),
  ).toBe(true);
});
it('adds only missing plugins to an existing engine without creating a VM', async () => {
  const fixture = runtimeFixture(home, { docker: true, engine: true });
  const run = createLocalRuntime(fixture.options);
  await run.check();
  run.start();
  await run.settled();
  expect(run.status().state).toBe('ready');
  expect(
    fixture.calls.find((call) => call.args[0] === 'install')?.args,
  ).toEqual(['install', 'docker-compose', 'docker-buildx']);
  expect(fixture.calls.some((call) => call.args[0] === 'start')).toBe(false);
});
it('starts a retained profile without rewriting its mounts or resources, including on Linux', async () => {
  const fixture = runtimeFixture(home, {
    docker: true,
    compose: true,
    buildx: true,
    colima: true,
  });
  fixture.existingProfile();
  const run = createLocalRuntime({
    ...fixture.options,
    platform: 'linux',
    arch: 'x64',
  });
  await run.check();
  run.start();
  await run.settled();
  expect(run.status().state).toBe('ready');
  expect(
    fixture.calls.find((call) => call.args[0] === 'install')?.args,
  ).toEqual(['install', 'qemu']);
  expect(fixture.calls.find((call) => call.args[0] === 'start')?.args).toEqual([
    'start',
    'wallet-provider-kit',
    '--activate=false',
  ]);
});
it.each(['remote', 'override', 'root', 'unsupported'] as const)(
  'blocks unsafe runtime selection: %s',
  async (kind) => {
    const fixture = runtimeFixture(home, { docker: true });
    if (kind === 'remote') fixture.remote();
    const run = createLocalRuntime({
      ...fixture.options,
      ...(kind === 'override'
        ? { environment: { DOCKER_HOST: 'tcp://remote.example' } }
        : {}),
      ...(kind === 'root' ? { uid: 0 } : {}),
      ...(kind === 'unsupported' ? { platform: 'win32' } : {}),
    });
    expect((await run.check()).state).toBe('blocked');
    expect(() => run.start()).toThrow();
    expect(await readdir(home)).toEqual([]);
  },
);
it('reports sanitized failure, retains partial installs and succeeds after a deliberate recheck', async () => {
  const fixture = runtimeFixture(home);
  fixture.beforeInstall(async () => {
    fixture.available.docker = true;
    throw new Error('private-provider-secret');
  });
  const run = createLocalRuntime(fixture.options);
  await run.check();
  run.start();
  await run.settled();
  expect(run.status().state).toBe('failed');
  expect(run.status().steps[0].state).toBe('failed');
  expect(JSON.stringify(run.status())).not.toContain('private-provider-secret');
  expect(() => run.start()).toThrow();
  fixture.beforeInstall(async () => {});
  await run.check();
  run.start();
  await run.settled();
  expect(run.status().state).toBe('ready');
  const installs = fixture.calls.filter((call) => call.args[0] === 'install');
  expect(installs[1].args).not.toContain('docker');
});
it('waits for Homebrew installation and prevents competing sessions from changing the runtime', async () => {
  const fixture = runtimeFixture(home, { brew: false });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bootstrap = vi.fn(async () => {
    await gate;
    fixture.available.brew = true;
  });
  const run = createLocalRuntime({ ...fixture.options, bootstrap });
  await run.check();
  run.start();
  await vi.waitFor(() => expect(bootstrap).toHaveBeenCalledOnce());
  const competing = createLocalRuntime({ ...fixture.options, bootstrap });
  await competing.check();
  competing.start();
  await competing.settled();
  expect(competing.status().state).toBe('failed');
  expect(competing.status().message).toContain('Another runtime installation');
  release();
  await run.settled();
  expect(run.status().state).toBe('ready');
});
it('does not follow a Docker configuration symlink or replace private settings on failure', async () => {
  const fixture = runtimeFixture(home);
  const destination = join(home, 'private.json');
  await writeFile(destination, '{"private":"preserve"}');
  await mkdir(join(home, '.docker'), { mode: 0o700 });
  await symlink(destination, join(home, '.docker/config.json'));
  const run = createLocalRuntime(fixture.options);
  await run.check();
  run.start();
  await run.settled();
  expect(run.status().state).toBe('failed');
  expect(await readFile(destination, 'utf8')).toBe('{"private":"preserve"}');
  expect(fixture.calls.some((call) => call.args[0] === 'start')).toBe(false);
});
it('the terminal continues from runtime installation through ordered local setup without exposing secrets', async () => {
  const fixture = runtimeFixture(home);
  const config: ProviderConfiguration = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  );
  const environment = {};
  const commands: string[][] = [];
  const report: string[] = [];
  await runLocalSetup({
    config,
    installRuntime: true,
    runtime: fixture.options,
    executor: {
      root: join(home, 'deployments'),
      environment,
      command: async (args) => {
        commands.push(args);
        if (args[0] === 'context') return 'unix:///offline/docker.sock';
        if (args.includes('version')) return '2.40.0';
        if (args.includes('info')) return 'linux';
        return '';
      },
    },
    report: (message) => report.push(message),
  });
  expect(commands.filter((args) => args.includes('init-storage'))).toHaveLength(
    1,
  );
  expect(commands.at(-1)).toContain('exec');
  expect(report.join()).toContain('Your service is running');
  expect(report.join() + JSON.stringify(commands)).not.toContain(
    'offline-cli-secret',
  );
});
it('the terminal requires explicit installation and rejects incomplete credentials before any installation', async () => {
  const fixture = runtimeFixture(home);
  await expect(
    runLocalSetup({
      installRuntime: false,
      runtime: fixture.options,
      report: () => {},
    }),
  ).rejects.toMatchObject({
    issues: [expect.stringContaining('--install-runtime')],
  });
  expect(await readdir(home)).toEqual([]);
  const config = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  );
  await expect(
    runLocalSetup({
      config,
      installRuntime: true,
      runtime: fixture.options,
      executor: { environment: {} },
      report: () => {},
    }),
  ).rejects.toMatchObject({
    issues: [expect.stringContaining('Local Docker setup is unavailable')],
  });
  // Runtime installation is explicitly authorized; an unavailable Docker context prevents setup.
  expect(fixture.calls.some((call) => call.args[0] === 'up')).toBe(false);
});
it('rejects an altered Homebrew installer before executing it', async () => {
  const fixture = runtimeFixture(home, { brew: false });
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('unreviewed installer'));
  try {
    const run = createLocalRuntime(fixture.options);
    await run.check();
    run.start();
    await run.settled();
    expect(run.status().state).toBe('failed');
    expect(fixture.calls.some((call) => call.args[0] === 'install')).toBe(
      false,
    );
    expect(await readdir(home)).toEqual([]);
  } finally {
    fetch.mockRestore();
  }
});
it('starts installed Docker Desktop without installing another runtime', async () => {
  const fixture = runtimeFixture(home, {
    docker: true,
    compose: true,
    buildx: true,
  });
  const run = createLocalRuntime({
    ...fixture.options,
    desktop: true,
    command: async (file, args, timeout) => {
      if (file === '/usr/bin/open') {
        fixture.calls.push({ file, args });
        fixture.available.engine = true;
        return '';
      }
      return fixture.options.command(file, args, timeout);
    },
  });
  await run.check();
  run.start();
  await run.settled();
  expect(run.status().state).toBe('ready');
  expect(fixture.calls.some((call) => call.file === '/usr/bin/open')).toBe(
    true,
  );
  expect(fixture.calls.some((call) => call.args[0] === 'install')).toBe(false);
});
it('uses QEMU and 9p for a new Linux runtime without enabling a system Docker service', async () => {
  const fixture = runtimeFixture(home);
  const run = createLocalRuntime({
    ...fixture.options,
    platform: 'linux',
    arch: 'x64',
  });
  await run.check();
  run.start();
  await run.settled();
  expect(run.status().state).toBe('ready');
  const start = fixture.calls.find((call) => call.args[0] === 'start')!.args;
  expect(start[start.indexOf('--vm-type') + 1]).toBe('qemu');
  expect(start[start.indexOf('--mount-type') + 1]).toBe('9p');
  expect(
    fixture.calls.some(
      (call) => call.file === 'systemctl' || call.file === 'sudo',
    ),
  ).toBe(false);
});
it('starts an existing Colima runtime without installing an unnecessary package manager', async () => {
  const fixture = runtimeFixture(home, {
    docker: true,
    compose: true,
    buildx: true,
    colima: true,
    brew: false,
  });
  fixture.existingProfile();
  const bootstrap = vi.fn(async () => {
    throw new Error('Must not install Homebrew');
  });
  const run = createLocalRuntime({ ...fixture.options, bootstrap });
  await run.check();
  run.start();
  await run.settled();
  expect(run.status().state).toBe('ready');
  expect(bootstrap).not.toHaveBeenCalled();
  expect(fixture.calls.some((call) => call.args[0] === 'install')).toBe(false);
});
it('reviews Docker Desktop startup accurately when plugins are missing', async () => {
  const fixture = runtimeFixture(home, { docker: true });
  const run = createLocalRuntime({
    ...fixture.options,
    desktop: true,
    command: async (file, args, timeout) => {
      if (file === '/usr/bin/open') {
        fixture.available.engine = true;
        return '';
      }
      return fixture.options.command(file, args, timeout);
    },
  });
  const plan = await run.check();
  expect(plan.actions.join()).toContain('Docker Desktop');
  expect(plan.actions.join()).not.toContain('Colima');
  run.start();
  await run.settled();
  expect(run.status().state).toBe('ready');
});
it('retains the host lock after an interrupted package command whose effects may still be running', async () => {
  const fixture = runtimeFixture(home);
  fixture.beforeInstall(async () => {
    throw Object.assign(new Error('private-timeout-detail'), {
      killed: true,
      signal: 'SIGTERM',
    });
  });
  const run = createLocalRuntime(fixture.options);
  await run.check();
  run.start();
  await run.settled();
  expect(run.status().state).toBe('failed');
  expect(run.status().message).toContain('outcome is uncertain');
  expect(run.status().message).not.toContain('private-timeout-detail');
  expect(
    (
      await lstat(join(home, '.wallet-provider-kit-runtime.lock'))
    ).isDirectory(),
  ).toBe(true);
});

it('accepts the bundled OWS terminal setup with generated credentials', async () => {
  const fixture = runtimeFixture(home, {
    docker: true,
    compose: true,
    buildx: true,
    engine: true,
  });
  const config: ProviderConfiguration = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  );
  const commands: string[][] = [];
  await runLocalSetup({
    config,
    installRuntime: false,
    runtime: fixture.options,
    executor: {
      root: join(home, 'ows-deployments'),
      environment: {},
      command: async (args) => {
        commands.push(args);
        if (args[0] === 'context') return 'unix:///offline/docker.sock';
        if (args.includes('version')) return '2.40.0';
        if (args.includes('info')) return 'linux';
        return '';
      },
    },
    report: () => {},
  });
  expect(commands.filter((args) => args.includes('init-storage'))).toHaveLength(
    1,
  );
});
