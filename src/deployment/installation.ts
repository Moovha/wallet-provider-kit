import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { configureSafeWalletRuntime } from './application-defaults.js';
import { bundledOAuth } from './authorization-contract.js';
import {
  validateProviderConfiguration,
  type ProviderConfiguration,
  ConfigurationError,
} from './config.js';
import { generateDeploymentSecrets } from './deployment-secrets.js';
import { localCompose, setupEnvironment } from './setup-executor.js';
import { caddyConfiguration } from './https-ingress.js';
import { openProviderDatabase } from '../storage/index.js';

export interface InstallationOptions {
  name: string;
  origin: string;
  privacyUrl: string;
  network?: ProviderConfiguration['network'];
  localOrigin?: string;
}
/** Infrastructure defaults have no connected applications, trusted attestations or enabled execution. */
export function installationConfiguration(
  options: InstallationOptions,
): ProviderConfiguration {
  const config: ProviderConfiguration = {
    configVersion: 1,
    profile: 'provider-service-v1',
    network: options.network ?? 'base',
    management: {
      claim: { env: 'WALLET_INSTALLATION_CLAIM' },
      ...(options.localOrigin ? { localOrigin: options.localOrigin } : {}),
    },
    policy: {
      version: '1',
      provider: {
        name: options.name,
        origin: options.origin,
        privacyUrl: options.privacyUrl,
      },
      applications: [],
      access: { mode: 'application', maxAgeDays: 7 },
      identity: {
        maxAgeDays: 90,
        application: {
          verificationLevel: 'verified',
          requiredFields: ['country'],
        },
      },
    },
    oauth: bundledOAuth(options.origin),
    authorizationServer: {
      signingKey: { env: 'WALLET_OAUTH_SIGNING_KEY' },
      clients: [],
    },
    runtimeConfiguration: {
      operators: [],
      authorizeContracts: true,
      credentialKey: { env: 'APPLICATION_CREDENTIAL_STORAGE_KEY' },
    },
    backend: {
      kind: 'ows',
      binding: 'ows-' + randomBytes(24).toString('hex'),
      vaultDirectory: '.provider-vault',
      passphrase: { env: 'OWS_OWNER_PASSPHRASE' },
    },
    storage: { kind: 'sqlite', directory: '.provider-data' },
    identity: {},
    activation: { enabled: false },
    http: {
      host: '0.0.0.0',
      port: 8080,
      documentation: true,
      ingress: options.localOrigin ? 'existing' : 'caddy',
    },
  };
  configureSafeWalletRuntime(config);
  return validateProviderConfiguration(config);
}
export interface ReleaseImages {
  api: string;
  bundler: string;
}
export function releaseCompose(
  config: ProviderConfiguration,
  hostDirectory: string,
  images: ReleaseImages,
) {
  if (
    !isAbsolute(hostDirectory) ||
    /[\r\n\0]/.test(hostDirectory) ||
    ![images.api, images.bundler].every((image) =>
      /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(image),
    )
  )
    throw new ConfigurationError([
      'Release images must use immutable SHA-256 digests and the deployment path must be absolute.',
    ]);
  const compose = localCompose(
    {
      id: 'installation',
      project: 'wallet-provider',
      port: 8080,
      directory: hostDirectory,
      config,
      secrets: [],
      changes: [],
    },
    '/unused',
  );
  delete (compose.services.api as { build?: unknown }).build;
  compose.services.api.image = images.api;
  if (compose.services.bundler) {
    delete (compose.services.bundler as { build?: unknown }).build;
    compose.services.bundler.image = images.bundler;
  }
  return compose;
}
async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    stat.uid !== process.getuid?.()
  )
    throw new ConfigurationError([
      'Installation storage must be a private directory owned by the service account.',
    ]);
}
/** Explicit installation only. A private preparation record makes interrupted setup resumable. */
export async function initializeInstallation(
  directory: string,
  hostDirectory: string,
  options: InstallationOptions,
  images: ReleaseImages,
) {
  if (!isAbsolute(directory))
    throw new ConfigurationError(['Use an absolute installation directory.']);
  const proposed = installationConfiguration(options);
  releaseCompose(proposed, hostDirectory, images);
  await privateDirectory(directory);
  const readPrivate = async (name: string) => {
    const path = join(directory, name),
      stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.mode & 0o077 ||
      stat.uid !== process.getuid?.()
    )
      throw new Error('Invalid private installation file');
    return readFile(path, 'utf8');
  };
  const saveExact = async (name: string, contents: string) => {
    try {
      await writeFile(join(directory, name), contents, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
        (await readPrivate(name)) !== contents
      )
        throw new ConfigurationError([
          'Retained installation files differ; repair them explicitly without replacing secrets or data.',
        ]);
    }
  };
  const matches = (config: ProviderConfiguration) =>
    config.management &&
    config.policy.provider.origin === options.origin &&
    config.policy.provider.name === options.name &&
    config.policy.provider.privacyUrl === options.privacyUrl &&
    config.network === proposed.network &&
    config.management.localOrigin === proposed.management!.localOrigin;
  let preparation: {
    config: ProviderConfiguration;
    values: Record<string, string>;
    hostDirectory: string;
    images: ReleaseImages;
  };
  try {
    preparation = JSON.parse(
      await readPrivate('.installation-preparation.json'),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new ConfigurationError([
        'Private installation preparation is invalid. Retain all files for explicit repair.',
      ]);
    try {
      const config = validateProviderConfiguration(
        JSON.parse(await readPrivate('provider.config.json')),
      );
      if (!matches(config)) throw new Error('Different installation');
      for (const name of ['provider.env', 'installation-claim'])
        await readPrivate(name);
      const compose = JSON.parse(await readPrivate('compose.json'));
      if (
        compose.services.api.image !== images.api ||
        compose.services.bundler.image !== images.bundler
      )
        throw new Error(
          'Use the reviewed upgrade procedure for a different release',
        );
      // A retained deployment must already have valid storage. Initialization is never used as repair.
      const database = openProviderDatabase({
        directory: join(directory, config.storage.directory),
      });
      database.close();
      return { reused: true };
    } catch (existing) {
      if ((existing as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new ConfigurationError([
          'Existing installation settings or release differ, or retained files are incomplete. Use explicit recovery or the reviewed upgrade procedure.',
        ]);
      try {
        await lstat(join(directory, 'provider.config.json'));
        throw new Error('Partial installation');
      } catch (missing) {
        if ((missing as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new ConfigurationError([
            'Retain the partial installation and repair it explicitly.',
          ]);
      }
    }
    preparation = {
      config: proposed,
      values: generateDeploymentSecrets(proposed, {}),
      hostDirectory,
      images,
    };
    try {
      await writeFile(
        join(directory, '.installation-preparation.json'),
        JSON.stringify(preparation),
        { flag: 'wx', mode: 0o600 },
      );
    } catch (created) {
      if ((created as NodeJS.ErrnoException).code !== 'EEXIST') throw created;
      preparation = JSON.parse(
        await readPrivate('.installation-preparation.json'),
      );
    }
  }
  const config = validateProviderConfiguration(preparation.config);
  if (
    !matches(config) ||
    preparation.hostDirectory !== hostDirectory ||
    preparation.images.api !== images.api ||
    preparation.images.bundler !== images.bundler
  )
    throw new ConfigurationError([
      'Resume with the same reviewed installation settings and release.',
    ]);
  const values = preparation.values;
  await saveExact(
    'provider.env',
    setupEnvironment(
      Object.fromEntries(
        Object.entries(values).sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
  );
  await saveExact(
    'installation-claim',
    values[config.management!.claim.env] + '\n',
  );
  await saveExact(
    'provider.config.json',
    JSON.stringify(config, null, 2) + '\n',
  );
  for (const folder of [
    '.provider-data',
    '.provider-vault',
    '.bundler-data',
    config.safeWallet!.runtimeDirectory,
    '.provider-tls',
  ])
    await privateDirectory(join(directory, folder));
  await saveExact(
    'compose.json',
    JSON.stringify(releaseCompose(config, hostDirectory, images), null, 2) +
      '\n',
  );
  if (config.http?.ingress === 'caddy')
    await saveExact(
      'caddy.json',
      JSON.stringify(caddyConfiguration(options.origin), null, 2) + '\n',
    );
  const database = openProviderDatabase({
    directory: join(directory, '.provider-data'),
    initialize: true,
  });
  database.close();
  await unlink(join(directory, '.installation-preparation.json')).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    },
  );
  return { reused: false };
}
