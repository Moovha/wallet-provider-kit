import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createConfiguredProvider } from '../src/deployment/provider.js';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import { generateDeploymentSecrets } from '../src/deployment/deployment-secrets.js';
import { openProviderDatabase } from '../src/storage/index.js';
import { fixture } from './helpers/safe-4337.js';

it('applies execution changes without restart, retains them after restart and preserves disabled-by-default behavior', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-execution-'));
  let app: Awaited<ReturnType<typeof createConfiguredProvider>> | undefined;
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('No external calls'));
  try {
    const raw = JSON.parse(
      await readFile('docs/provider.config.safe.example.json', 'utf8'),
    );
    raw.policy.applications = [];
    raw.authorizationServer.clients = [];
    delete raw.authorizationServer.operatorClients;
    delete raw.apiExplorer;
    raw.runtimeConfiguration.operators = [];
    raw.management = { claim: { env: 'OFFLINE_NETWORK_CLAIM' } };
    raw.storage.directory = join(directory, 'data');
    raw.backend.vaultDirectory = join(directory, 'vault');
    raw.activation = { enabled: false };
    const config = validateProviderConfiguration(raw);
    await mkdir(config.backend.vaultDirectory, { mode: 0o700 });
    const secrets = generateDeploymentSecrets(config, {});
    for (const [name, value] of Object.entries(secrets))
      vi.stubEnv(name, value);
    const db = openProviderDatabase({
      directory: config.storage.directory,
      initialize: true,
    });
    db.close();
    app = await createConfiguredProvider(config, directory);
    const claim = await app.inject({
      method: 'POST',
      url: '/v1/provider/claim',
      payload: {
        claim: secrets.OFFLINE_NETWORK_CLAIM,
        username: 'admin',
        password: 'offline-network-admin-password',
      },
    });
    expect(claim.statusCode).toBe(200);
    const token = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'operator-admin',
        client_secret: 'offline-network-admin-password',
        scope: 'provider:manage',
      }).toString(),
    });
    expect(token.statusCode).toBe(200);
    const headers = { authorization: 'Bearer ' + token.json().access_token };
    const path = '/v1/provider/networks/base/execution';
    expect((await app.inject({ url: path })).statusCode).toBe(401);
    expect((await app.inject({ url: path, headers })).json()).toMatchObject({
      enabled: false,
      ready: false,
      revision: 1,
    });
    const enabled = await app.inject({
      method: 'POST',
      url: path,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: {
        expected_revision: 1,
        enabled: true,
        mainnet_confirmed: true,
        backendAcceptance: 'offline-backend-check',
        recoveryAcceptance: 'offline-recovery-check',
      },
    });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json()).toMatchObject({
      enabled: true,
      ready: true,
      revision: 2,
    });
    expect(
      (await app.inject('/v1/execution-capabilities')).json().configured,
    ).toBe(true);
    const disabled = await app.inject({
      method: 'POST',
      url: path,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { expected_revision: 2, enabled: false },
    });
    expect(disabled.json()).toMatchObject({
      enabled: false,
      ready: false,
      revision: 3,
    });
    await app.close();
    app = await createConfiguredProvider(config, directory);
    expect((await app.inject({ url: path, headers })).json()).toMatchObject({
      enabled: false,
      ready: false,
      revision: 3,
    });
    const again = await app.inject({
      method: 'POST',
      url: path,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { expected_revision: 3, enabled: true, mainnet_confirmed: true },
    });
    expect(again.json()).toMatchObject({
      enabled: true,
      ready: true,
      revision: 4,
    });
    expect(network).not.toHaveBeenCalled();
  } finally {
    await app?.close();
    network.mockRestore();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it('pausing a network fences prepared authority and re-enabling never revives old consent', async () => {
  const f = await fixture();
  await expect(
    f.actions.previewWalletCalls(f.context.principal, f.input),
  ).resolves.toBeDefined();
  await f.db.onboardingStore.transaction((s) => {
    s.management ??= {};
    s.management.provider = {
      version: 1,
      installationId: randomUUID(),
      claimHash: '',
      claimExpiresAt: 0,
      claimed: true,
      identities: {},
      execution: {
        'base-sepolia': {
          revision: 2,
          enabled: false,
          backendAcceptance: 'offline',
          recoveryAcceptance: 'offline',
        },
      },
    };
  });
  await expect(
    f.actions.previewWalletCalls(f.context.principal, f.input),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  await f.db.onboardingStore.transaction((s) => {
    s.management!.provider!.execution!['base-sepolia']!.enabled = true;
    s.management!.provider!.execution!['base-sepolia']!.revision = 3;
  });
  await expect(
    f.actions.previewWalletCalls(f.context.principal, f.input),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(f.state.signs).toBe(0);
  expect(f.state.posts).toBe(0);
});
