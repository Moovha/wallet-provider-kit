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
it.each([false, true])(
  'starts the Safe runtime with activation=%s before policy publication and preserves configuration identity after restart',
  async (enabled) => {
    const directory = await mkdtemp(join(tmpdir(), 'wpk-safe-runtime-'));
    folders.push(directory);
    const config = await current();
    config.activation = enabled
      ? {
          enabled: true,
          backendAcceptance: 'Offline fixture only',
          recoveryAcceptance: 'Offline fixture only',
        }
      : { enabled: false };
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
        configured: enabled,
      });
      await app.close();
      apps.pop();
    }
    expect(network).not.toHaveBeenCalled();
  },
);

it('preserves current application-specific consent across activation changes while revoking stale policy and retaining withdrawals', async () => {
  const { OnboardingService } = await import('../src/onboarding/service.js');
  const { fingerprint } = await import('../src/onboarding/policy.js');
  const { canonicalHash } = await import('../src/domain/canonical.js');
  const { currentRuntimePolicy } =
    await import('../src/runtime-configuration/authority.js');
  const { normalizeRuntimePolicy, runtimeApplicationId } =
    await import('../src/runtime-configuration/service.js');
  const directory = await mkdtemp(join(tmpdir(), 'wpk-consent-restart-'));
  folders.push(directory);
  const config = await current();
  config.network = 'base-sepolia';
  config.storage.directory = join(directory, 'data');
  config.backend.vaultDirectory = join(directory, 'vault');
  await mkdir(config.backend.vaultDirectory, { mode: 0o700 });
  for (const [name, value] of Object.entries(
    generateDeploymentSecrets(config, {}),
  ))
    vi.stubEnv(name, value);
  const initial = openProviderDatabase({
    directory: config.storage.directory,
    initialize: true,
  });
  initial.close();
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('No network'));
  const app = await createConfiguredProvider(config, directory);
  await app.close();
  const db = openProviderDatabase({ directory: config.storage.directory });
  const base = fingerprint([config.approvedCalls, config.safeWallet]);
  const onboarding = new OnboardingService(
    config.policy,
    db.onboardingStore,
    [],
    undefined,
    base,
    true,
    true,
  );
  const caller = {
    issuer: config.policy.applications[0].issuer,
    clientId: config.policy.applications[0].clientId,
    subject: 'offline',
  };
  const applicationId = runtimeApplicationId(caller.issuer, caller.clientId);
  const policy = normalizeRuntimePolicy({
    expected_revision: '0',
    policy: {
      version: '1',
      enabled: true,
      chain_id: 'eip155:84532',
      maximum_calls: 1,
      maximum_native_value_wei: '0',
      max_validity_seconds: 120,
      claim_requirements: [],
      contracts: [
        {
          address: '0x' + '1'.repeat(40),
          code_hash: '0x' + '2'.repeat(64),
          methods: [{ signature: 'work(uint256)', maximum_value_wei: '0' }],
        },
      ],
    },
  }).policy;
  await db.onboardingStore.transaction((state) => {
    const registry =
      state.deploymentBindings!['service-v1'].runtimeConfiguration!;
    registry.heads[applicationId] = '1';
    registry.revisions[applicationId + ':1'] = {
      application_id: applicationId,
      revision: '1',
      previous_revision: '0',
      policy_hash: canonicalHash(policy),
      policy,
      published_by: 'offline',
      published_at: new Date().toISOString(),
    };
    const actionPolicyRevision = fingerprint([
      base,
      currentRuntimePolicy(state, caller),
    ]);
    for (const key of ['current', 'stale', 'withdrawn'])
      state.grants[key] = {
        id: key,
        caller,
        permissions: ['contracts:request'],
        revision: onboarding.policy.revision,
        actionPolicyRevision:
          key === 'stale' ? 'obsolete' : actionPolicyRevision,
        state: key === 'withdrawn' ? 'revoked' : 'active',
      } as never;
  });
  db.close();
  for (const enabled of [true, false]) {
    config.activation = enabled
      ? {
          enabled,
          backendAcceptance: 'Offline fixture only',
          recoveryAcceptance: 'Offline fixture only',
        }
      : { enabled };
    const restarted = await createConfiguredProvider(config, directory);
    await restarted.close();
    const stored = openProviderDatabase({
      directory: config.storage.directory,
    });
    try {
      expect(
        await stored.onboardingStore.transaction((state) =>
          Object.fromEntries(
            Object.entries(state.grants).map(([id, g]) => [id, g.state]),
          ),
        ),
      ).toEqual({ current: 'active', stale: 'revoked', withdrawn: 'revoked' });
    } finally {
      stored.close();
    }
  }
  expect(network).not.toHaveBeenCalled();
});
