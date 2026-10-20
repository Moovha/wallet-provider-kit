import { readFile, mkdtemp, mkdir, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createConfiguredProvider } from '../src/deployment/provider.js';
import {
  assertSafeWalletConfiguration,
  validateProviderConfiguration,
} from '../src/deployment/config.js';
import { generateDeploymentSecrets } from '../src/deployment/deployment-secrets.js';
import { openProviderDatabase } from '../src/storage/index.js';

const folders: string[] = [];
const apps: Awaited<ReturnType<typeof createConfiguredProvider>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function current() {
  return validateProviderConfiguration(
    JSON.parse(
      await readFile('docs/provider.config.safe.example.json', 'utf8'),
    ),
  );
}
it.each([
  'safeWallet',
  'safeProvisioning',
  'approvedCalls',
  'runtimeConfiguration',
])('rejects a missing %s before storage or network effects', async (field) => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-incomplete-'));
  folders.push(directory);
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('No network'));
  const config = JSON.parse(
    await readFile('docs/provider.config.safe.example.json', 'utf8'),
  );
  delete config[field];
  await expect(
    createConfiguredProvider(config, directory),
  ).rejects.toMatchObject({ issues: expect.any(Array) });
  expect(await readdir(directory)).toEqual([]);
  expect(network).not.toHaveBeenCalled();
});
it('starts only the Safe runtime, advertises one execution choice and preserves its configuration identity after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-safe-runtime-'));
  folders.push(directory);
  const config = await current();
  assertSafeWalletConfiguration(config);
  config.storage.directory = join(directory, 'data');
  config.backend.vaultDirectory = join(directory, 'vault');
  await mkdir(config.backend.vaultDirectory, { mode: 0o700 });
  for (const [name, value] of Object.entries(
    generateDeploymentSecrets(config, {}),
  ))
    vi.stubEnv(name, value);
  const db = openProviderDatabase({
    directory: config.storage.directory,
    initialize: true,
  });
  db.close();
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('No network'));
  for (let i = 0; i < 2; i++) {
    const app = await createConfiguredProvider(config, directory);
    apps.push(app);
    const response = await app.inject({ url: '/v1/execution-capabilities' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: 'safe-only-4337-v1',
      revision: '1',
      configured: false,
    });
    await app.close();
    apps.pop();
  }
  expect(network).not.toHaveBeenCalled();
});
