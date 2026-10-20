import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSetupExecutor,
  setupEnvironment,
} from '../src/deployment/setup-executor.js';
import type { ProviderConfiguration } from '../src/deployment/config.js';

let temporary: string;
let config: ProviderConfiguration;
const calls: string[][] = [];
function offlineCommand(args: string[]) {
  calls.push(args);
  if (args[0] === 'context')
    return Promise.resolve('unix:///offline/docker.sock\n');
  if (args.includes('version')) return Promise.resolve('2.40.0\n');
  if (args.includes('info')) return Promise.resolve('linux\n');
  if (args.includes('ps')) return Promise.resolve('api\n');
  return Promise.resolve('');
}
beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'wallet-setup-executor-'));
  calls.length = 0;
  config = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(temporary, { recursive: true, force: true });
});
const executor = (
  command = offlineCommand,
  environment: NodeJS.ProcessEnv = {},
) =>
  createSetupExecutor({
    root: join(temporary, 'deployments'),
    command,
    environment,
  });
const values = (
  plan: Awaited<ReturnType<ReturnType<typeof executor>['prepare']>>,
) =>
  Object.fromEntries(
    plan.secrets
      .filter((secret) => !secret.available)
      .map(({ name }) => [name, 'offline-secret-$#\nsecond-line']),
  );

describe('explicit local container executor with offline command fixtures', () => {
  it('prepares without writes, rejects stale plans, saves private files, and runs ordered commands without secret arguments', async () => {
    const run = executor();
    const old = await run.prepare(config);
    const plan = await run.prepare(config);
    expect(await readdir(temporary)).toEqual([]);
    expect(() => run.start(old.id, values(old))).toThrow(
      expect.objectContaining({
        issues: [expect.stringContaining('Review a local setup plan')],
      }),
    );
    const secretValues = values(plan);
    expect(JSON.stringify(plan)).not.toContain('offline-secret');
    expect(run.start(plan.id, secretValues).state).toBe('running');
    expect(() => run.start(plan.id, secretValues)).toThrow(
      expect.objectContaining({
        issues: [expect.stringContaining('already started')],
      }),
    );
    await expect(run.prepare(config)).rejects.toMatchObject({
      issues: [expect.stringContaining('already prepared')],
    });
    await run.settled();
    expect(run.status().state).toBe('complete');
    expect(run.status().steps.every((step) => step.state === 'complete')).toBe(
      true,
    );
    expect(run.status().plan?.config.activation.enabled).toBe(false);
    const saved = JSON.parse(
      await readFile(join(plan.directory, 'provider.config.json'), 'utf8'),
    );
    expect(saved.http).toMatchObject({ host: '0.0.0.0', port: 8080 });
    expect(saved.policy).toEqual(config.policy);
    expect(saved.storage.directory).toBe('.provider-data/storage');
    if (saved.backend.kind === 'ows')
      expect(saved.backend.vaultDirectory).toBe('.provider-vault/vault');
    expect(
      parseEnv(await readFile(join(plan.directory, 'provider.env'), 'utf8')),
    ).toMatchObject(secretValues);
    for (const name of [
      'provider.config.json',
      'provider.env',
      'compose.json',
      'provider-setup.md',
      'provider-setup.status.json',
    ])
      expect((await lstat(join(plan.directory, name))).mode & 0o777).toBe(
        0o600,
      );
    for (const path of [
      join(temporary, 'deployments'),
      plan.directory,
      join(plan.directory, '.provider-data'),
    ])
      expect((await lstat(path)).mode & 0o777).toBe(0o700);
    const compose = JSON.parse(
      await readFile(join(plan.directory, 'compose.json'), 'utf8'),
    );
    expect(compose.services.api).toMatchObject({
      read_only: true,
      restart: 'unless-stopped',
      cap_drop: ['ALL'],
      ports: [`127.0.0.1:${plan.port}:8080`],
    });
    expect(
      compose.services.api.volumes.filter(
        (mount: { read_only?: boolean }) => mount.read_only,
      ),
    ).toHaveLength(2);
    const mutations = calls.filter((args) => args.includes('--file'));
    expect(
      mutations.map((args) => args.slice(args.indexOf(plan.project) + 1)[0]),
    ).toEqual(['build', 'run', 'run', 'run', 'up', 'exec']);
    expect(
      mutations.filter((args) => args.includes('init-storage')),
    ).toHaveLength(1);
    expect(JSON.stringify(calls) + JSON.stringify(run.status())).not.toContain(
      'offline-secret',
    );
    await run.stop();
    expect(run.status().state).toBe('stopped');
    expect(
      parseEnv(await readFile(join(plan.directory, 'provider.env'), 'utf8')),
    ).toMatchObject(secretValues);
  });

  it.each(['storage', 'up', 'exec'])(
    'halts after %s failure, cleans up only its project and retains files without retrying initialization',
    async (failed) => {
      const run = executor(async (args) => {
        if (args.includes(failed === 'storage' ? 'init-storage' : failed)) {
          calls.push(args);
          throw new Error('private-provider-secret');
        }
        return offlineCommand(args);
      });
      const plan = await run.prepare(config);
      run.start(plan.id, values(plan));
      await run.settled();
      expect(run.status().state).toBe('failed');
      expect(run.status().cleanup).toBe('stopped');
      expect(JSON.stringify(run.status())).not.toContain(
        'private-provider-secret',
      );
      expect(calls.at(-1)).toContain('down');
      expect(calls.at(-1)).not.toContain('--volumes');
      expect(calls.at(-1)).toContain(plan.project);
      expect(
        calls.filter((args) => args.includes('init-storage')),
      ).toHaveLength(1);
      expect(() => run.start(plan.id, values(plan))).toThrow(
        expect.objectContaining({
          issues: [expect.stringContaining('already started')],
        }),
      );
      expect(
        (await lstat(join(plan.directory, '.provider-data'))).isDirectory(),
      ).toBe(true);
    },
  );

  it('reports unconfirmed cleanup and a later service exit without claiming readiness', async () => {
    const failed = executor(async (args) => {
      if (args.includes('exec') || args.includes('down'))
        throw new Error('private');
      return offlineCommand(args);
    });
    const plan = await failed.prepare(config);
    failed.start(plan.id, values(plan));
    await failed.settled();
    expect(failed.status().cleanup).toBe('unconfirmed');
    const stopped = executor(async (args) =>
      args.includes('ps') ? '' : offlineCommand(args),
    );
    const next = await stopped.prepare(config);
    stopped.start(next.id, values(next));
    await stopped.settled();
    expect((await stopped.liveStatus()).state).toBe('failed');
  });

  it('accepts only the missing referenced secrets, validates inherited values and never returns them', async () => {
    const name =
      config.backend.kind === 'ows' ? config.backend.passphrase.env : '';
    config.authorizationServer!.clients[0].clientSecret = {
      env: 'EXTERNAL_CLIENT_SECRET',
    };
    const run = executor(offlineCommand, { [name]: 'inherited-offline-value' });
    const plan = await run.prepare(config);
    expect(plan.secrets.find((secret) => secret.name === name)?.available).toBe(
      true,
    );
    expect(() =>
      run.start(plan.id, { ...values(plan), [name]: 'replacement' }),
    ).toThrow(
      expect.objectContaining({
        issues: [expect.stringContaining('Only the missing')],
      }),
    );
    expect(() =>
      run.start(plan.id, { ...values(plan), NODE_OPTIONS: '--inspect' }),
    ).toThrow(
      expect.objectContaining({
        issues: [expect.stringContaining('Only the missing')],
      }),
    );
    run.start(plan.id, values(plan));
    await run.settled();
    expect(
      parseEnv(await readFile(join(plan.directory, 'provider.env'), 'utf8'))[
        name
      ],
    ).toBe('inherited-offline-value');
    expect(JSON.stringify(run.status()) + JSON.stringify(calls)).not.toContain(
      'inherited-offline-value',
    );
  });

  it('rejects unsafe or unsupported plans before effects and refuses a symlink deployment root', async () => {
    const run = executor();
    await expect(
      run.prepare({
        ...config,
        activation: {
          enabled: true,
          backendAcceptance: 'reviewed',
          recoveryAcceptance: 'reviewed',
        },
      }),
    ).rejects.toMatchObject({ issues: [expect.stringContaining('Turn off')] });
    await expect(
      run.prepare({
        ...config,
        backend: {
          kind: 'custom',
          binding: 'local',
          module: './custom.js',
        },
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.any(String)]),
    });
    const reservedConfig = structuredClone(config);
    if (reservedConfig.backend.kind === 'ows')
      reservedConfig.backend.passphrase.env = 'NODE_OPTIONS';
    await expect(run.prepare(reservedConfig)).rejects.toMatchObject({
      issues: [expect.stringContaining('secret variable names')],
    });
    const remote = executor(async (args) =>
      args[0] === 'context' ? 'ssh://remote.example' : offlineCommand(args),
    );
    await expect(remote.prepare(config)).rejects.toMatchObject({
      issues: [expect.stringContaining('local Docker context')],
    });
    expect(await readdir(temporary)).toEqual([]);
    await symlink(temporary, join(temporary, 'deployments'));
    const plan = await run.prepare(config);
    run.start(plan.id, values(plan));
    await run.settled();
    expect(run.status().steps[0].state).toBe('failed');
    expect(calls.some((args) => args.includes('--file'))).toBe(false);
  });
});

it('preserves multiline, quotes and dollar characters without executable environment settings', () => {
  for (const value of [
    'a"b\n$#',
    "a'b",
    'a`b',
    ' leading and trailing ',
    'line\nline',
  ])
    expect(
      parseEnv(setupEnvironment({ OFFLINE_SECRET: value })).OFFLINE_SECRET,
    ).toBe(value);
  for (const value of ['', 'contains\0nul', 'windows\r\n', '\'"`'])
    expect(() => setupEnvironment({ OFFLINE_SECRET: value })).toThrow();
  expect(() =>
    setupEnvironment({ NODE_OPTIONS: '--import=malicious' }),
  ).toThrow();
});
