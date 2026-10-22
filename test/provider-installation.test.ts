import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initializeInstallation,
  installationConfiguration,
  releaseCompose,
} from '../src/deployment/installation.js';
import { openProviderDatabase } from '../src/storage/index.js';
vi.mock('../src/storage/index.js', () => ({
  openProviderDatabase: vi.fn(() => ({ close() {} })),
}));
const options = {
  name: 'Offline provider',
  origin: 'https://localhost',
  privacyUrl: 'https://localhost/privacy',
  localOrigin: 'http://127.0.0.1:8080',
};
const images = {
  api: 'ghcr.io/moovha/wallet-provider-kit@sha256:' + '1'.repeat(64),
  bundler:
    'ghcr.io/moovha/wallet-provider-kit-bundler@sha256:' + '2'.repeat(64),
};
it('packages a disabled zero-application provider without mutable image tags, builds or exposed internal ports', () => {
  const config = installationConfiguration(options);
  expect(config.policy.applications).toEqual([]);
  expect(config.runtimeConfiguration?.operators).toEqual([]);
  expect(config.activation.enabled).toBe(false);
  const compose = releaseCompose(config, '/offline/provider', images);
  expect(compose.services.api).not.toHaveProperty('build');
  expect(compose.services.bundler).not.toHaveProperty('build');
  expect(compose.services.api.image).toBe(images.api);
  expect(compose.services.api.ports).toEqual(['127.0.0.1:8080:8080']);
  expect(compose.services.bundler).not.toHaveProperty('ports');
  expect(() =>
    releaseCompose(config, '/offline/provider', { ...images, api: 'latest' }),
  ).toThrow();
  expect(() =>
    installationConfiguration({
      ...options,
      localOrigin: 'http://public.example.test:8080',
    }),
  ).toThrow();
});
it('retains secrets and image identity on repeat installation and refuses silent upgrades', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'provider-install-'));
  try {
    await initializeInstallation(directory, directory, options, images);
    const retained = await readFile(join(directory, 'provider.env'), 'utf8');
    expect(
      (await lstat(join(directory, 'installation-claim'))).mode & 0o777,
    ).toBe(0o600);
    expect(
      await initializeInstallation(directory, directory, options, images),
    ).toEqual({ reused: true });
    expect(await readFile(join(directory, 'provider.env'), 'utf8')).toBe(
      retained,
    );
    await expect(
      initializeInstallation(directory, directory, options, {
        ...images,
        api: 'ghcr.io/moovha/wallet-provider-kit@sha256:' + '3'.repeat(64),
      }),
    ).rejects.toThrow();
    expect(
      vi
        .mocked(openProviderDatabase)
        .mock.calls.some(([value]) => value.initialize === true),
    ).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('resumes preparation using retained credentials instead of generating replacements', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'provider-resume-'));
  try {
    await initializeInstallation(directory, directory, options, images);
    const config = JSON.parse(
      await readFile(join(directory, 'provider.config.json'), 'utf8'),
    );
    const { parseEnv } = await import('node:util');
    const values = parseEnv(
      await readFile(join(directory, 'provider.env'), 'utf8'),
    );
    await writeFile(
      join(directory, '.installation-preparation.json'),
      JSON.stringify({ config, values, hostDirectory: directory, images }),
      { mode: 0o600 },
    );
    await rm(join(directory, 'compose.json'));
    await initializeInstallation(directory, directory, options, images);
    expect(
      parseEnv(await readFile(join(directory, 'provider.env'), 'utf8')),
    ).toEqual(values);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('initializes Ethereum Sepolia with its own genesis and keeps execution disabled', () => {
  const config = installationConfiguration({
    ...options,
    network: 'ethereum-sepolia',
  });
  expect(config.network).toBe('ethereum-sepolia');
  expect(config.safeWallet?.genesisHash).toBe(
    '0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',
  );
  expect(config.activation.enabled).toBe(false);
  expect(config.policy.applications).toEqual([]);
});
