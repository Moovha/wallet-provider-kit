import { randomBytes } from 'node:crypto';
import { ManagementService } from '../management/service.js';
import { createBundledAuthorizationServer } from './authorization-server.js';
import { generateDeploymentSecrets } from './deployment-secrets.js';
import { setupEnvironment } from './setup-executor.js';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ConfigurationError,
  loadProviderConfiguration,
  resolveSecret,
  secretReferences,
  type ProviderConfiguration,
} from './config.js';
import { applicationId, schema, schemaVersion } from '../storage/schema.js';
import { openProviderDatabase } from '../storage/index.js';

export async function inspectSetup(
  config: ProviderConfiguration,
  directory: string,
) {
  const checks: { check: string; status: 'pass' | 'fail' | 'pending' }[] = [];
  for (const ref of secretReferences(config)) {
    try {
      resolveSecret(ref);
      checks.push({ check: 'secret:' + ref.env, status: 'pass' });
    } catch {
      checks.push({ check: 'secret:' + ref.env, status: 'fail' });
    }
  }
  if (config.authorizationServer) {
    try {
      createBundledAuthorizationServer(config);
      checks.push({ check: 'authentication:bundled-issuer', status: 'pass' });
    } catch {
      checks.push({ check: 'authentication:bundled-issuer', status: 'fail' });
    }
  }
  if (config.backend.kind === 'ows') {
    try {
      import.meta.resolve('@open-wallet-standard/core');
      checks.push({ check: 'backend:ows-engine', status: 'pass' });
    } catch {
      checks.push({ check: 'backend:ows-engine', status: 'fail' });
    }
    try {
      const vault = await lstat(
        resolve(directory, config.backend.vaultDirectory),
      );
      if (
        !vault.isDirectory() ||
        vault.isSymbolicLink() ||
        (vault.mode & 0o077) !== 0 ||
        vault.uid !== process.getuid?.()
      )
        throw new Error();
      const passphrase = resolveSecret(config.backend.passphrase);
      if (
        passphrase.length < 16 ||
        passphrase.length > 4096 ||
        passphrase.startsWith('ows_key_')
      )
        throw new Error();
      checks.push({
        check: 'backend:ows-vault-and-owner-credential',
        status: 'pass',
      });
    } catch {
      checks.push({
        check: 'backend:ows-vault-and-owner-credential',
        status: 'fail',
      });
    }
  }
  let database: DatabaseSync | undefined;
  try {
    const folder = resolve(directory, config.storage.directory);
    const path = join(folder, 'provider.sqlite');
    for (const [location, isDirectory] of [
      [folder, true],
      [path, false],
    ] as const) {
      const info = await lstat(location);
      if (
        info.isSymbolicLink() ||
        (info.mode & 0o077) !== 0 ||
        info.uid !== process.getuid?.() ||
        (isDirectory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1)
      )
        throw new Error();
    }
    database = new DatabaseSync(path, {
      readOnly: true,
      allowExtension: false,
    });
    const normalize = (sql: string) =>
      sql.trim().replace(/;$/, '').replace(/\s+/g, ' ');
    const actual = database
      .prepare("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => normalize(String(r.sql)))
      .sort();
    const expected = schema.split(';').map(normalize).filter(Boolean).sort();
    if (
      database.prepare('PRAGMA application_id').get()?.application_id !==
        applicationId ||
      database.prepare('PRAGMA user_version').get()?.user_version !==
        schemaVersion ||
      JSON.stringify(actual) !== JSON.stringify(expected) ||
      database.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error();
    checks.push({ check: 'storage:catalog-and-integrity', status: 'pass' });
    const row = database
      .prepare(
        "SELECT record FROM onboarding_records WHERE collection='deploymentBindings' AND id='service-v1'",
      )
      .get();
    const saved = row
      ? (JSON.parse(String(row.record)) as {
          origin: string;
          provider: string;
          binding: string;
          network?: import('../networks.js').ProviderNetwork;
        })
      : undefined;

    const matches = saved
      ? saved.origin === config.policy.provider.origin &&
        saved.binding === config.backend.binding &&
        (saved.network ?? 'base-sepolia') ===
          (config.network ?? 'base-sepolia') &&
        saved.provider === 'ows-local-owner-v1'
      : !database
          .prepare(
            'SELECT 1 FROM onboarding_records UNION ALL SELECT 1 FROM onboarding_audit UNION ALL SELECT 1 FROM budgets UNION ALL SELECT 1 FROM approvals UNION ALL SELECT 1 FROM admissions UNION ALL SELECT 1 FROM attempts UNION ALL SELECT 1 FROM financial_audit UNION ALL SELECT 1 FROM enrollments LIMIT 1',
          )
          .get();
    checks.push({
      check: 'storage:provider-binding',
      status: matches ? 'pass' : 'fail',
    });
  } catch {
    checks.push({ check: 'storage:catalog-and-integrity', status: 'fail' });
  } finally {
    database?.close();
  }
  checks.push({
    check: 'activation:operator-acceptance',
    status: config.activation.enabled ? 'pass' : 'pending',
  });
  return checks;
}
/** Returns false for the backward-compatible inspection executable with no arguments. */
export async function setupCommand(args: string[]): Promise<boolean> {
  if (!args.length) return false;
  if (args.length === 1 && ['help', '--help', '-h'].includes(args[0])) {
    process.stdout.write(
      'wallet-provider-kit setup [--port number] [--no-open]\nwallet-provider-kit runtime check\nwallet-provider-kit runtime install\nwallet-provider-kit local-setup --config file [--install-runtime]\nwallet-provider-kit init [file]\nwallet-provider-kit validate --config file\nwallet-provider-kit doctor --config file\nwallet-provider-kit init-secrets --config file\nwallet-provider-kit init-storage --config file\nwallet-provider-kit renew-claim --config file\nwallet-provider-kit recover-admin --config file\nwallet-provider-kit run --config file\n',
    );
    return true;
  }
  if (
    args[0] === 'runtime' &&
    args.length === 2 &&
    ['check', 'install'].includes(args[1])
  ) {
    const { runLocalSetup } = await import('./local-setup-cli.js');
    await runLocalSetup({ installRuntime: args[1] === 'install' });
    return true;
  }
  if (args[0] === 'local-setup') {
    if (
      args[1] !== '--config' ||
      !args[2] ||
      (args.length !== 3 &&
        !(args.length === 4 && args[3] === '--install-runtime'))
    )
      throw new ConfigurationError([
        'Use wallet-provider-kit local-setup --config file [--install-runtime].',
      ]);
    const { config } = await loadProviderConfiguration(args[2]);
    const { runLocalSetup } = await import('./local-setup-cli.js');
    await runLocalSetup({
      config,
      installRuntime: args.includes('--install-runtime'),
    });
    return true;
  }
  if (['renew-claim', 'recover-admin'].includes(args[0])) {
    if (args.length !== 3 || args[1] !== '--config')
      throw new ConfigurationError([
        'Use renew-claim or recover-admin --config file with the API stopped.',
      ]);
    const { config, directory } = await loadProviderConfiguration(args[2]);
    if (!config.management)
      throw new ConfigurationError([
        '/management: durable administration is not configured',
      ]);
    const database = openProviderDatabase({
      directory: resolve(directory, config.storage.directory),
    });
    try {
      const management = new ManagementService(
        database.onboardingStore,
        database.managementSnapshot,
        config.oauth.issuer,
        config.policy,
      );
      const secret = randomBytes(48).toString('base64url');
      const path = join(
        directory,
        args[0] === 'renew-claim'
          ? 'renewed-installation-claim'
          : 'recovery-administrator',
      );
      // Reserve a private output before changing authority; never print authentication material.
      await writeFile(
        path,
        args[0] === 'renew-claim'
          ? secret + '\n'
          : 'operator-recovery\n' + secret + '\n',
        { flag: 'wx', mode: 0o600 },
      );
      if (args[0] === 'renew-claim')
        await management.renewUnclaimedInstallation(secret);
      else await management.recoverAdministrator(secret);
      process.stdout.write(
        'Recovery credential saved privately beside the configuration. Restart the API, then establish current administrator access.\n',
      );
    } finally {
      database.close();
    }
    return true;
  }
  if (args[0] === 'install-init') {
    if (args.length !== 1)
      throw new ConfigurationError([
        'Installation settings are supplied through non-secret environment variables.',
      ]);
    const selectedNetwork = process.env.WPK_NETWORK ?? 'base';
    if (!['base', 'base-sepolia', 'ethereum-sepolia'].includes(selectedNetwork))
      throw new ConfigurationError([
        'WPK_NETWORK must be base, base-sepolia or ethereum-sepolia.',
      ]);
    const { initializeInstallation } = await import('./installation.js');
    const { reused } = await initializeInstallation(
      process.env.WPK_DIRECTORY ?? '/config',
      process.env.WPK_HOST_DIRECTORY ?? '',
      {
        name: process.env.WPK_NAME ?? 'Wallet provider',
        origin: process.env.WPK_ORIGIN ?? 'https://localhost',
        privacyUrl: process.env.WPK_PRIVACY_URL ?? 'https://localhost/privacy',
        network: selectedNetwork as import('../networks.js').ProviderNetwork,
        ...(process.env.WPK_LOCAL === 'true'
          ? { localOrigin: 'http://127.0.0.1:8080' }
          : {}),
      },
      {
        api: process.env.WPK_API_IMAGE ?? '',
        bundler: process.env.WPK_BUNDLER_IMAGE ?? '',
      },
    );
    process.stdout.write(
      reused
        ? 'Retained installation reused; identity and secrets unchanged.\n'
        : 'Installation prepared. Read the private installation-claim file to establish administrator access.\n',
    );
    return true;
  }
  if (args[0] === 'setup') {
    const remaining = args.slice(1);
    const openBrowser = !remaining.includes('--no-open');
    const flags = remaining.filter((arg) => arg !== '--no-open');
    if (
      (flags.length !== 0 && (flags.length !== 2 || flags[0] !== '--port')) ||
      remaining.filter((arg) => arg === '--no-open').length > 1
    )
      throw new Error('Invalid setup command');
    const port = flags.length ? Number(flags[1]) : 0;
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error('Invalid setup port');
    const { startSetupWizard } = await import('./setup-server.js');
    await startSetupWizard(port, openBrowser);
    return true;
  }
  if (args[0] === 'init' && args.length <= 2) {
    const { installationConfiguration } = await import('./installation.js');
    const example = installationConfiguration({
      name: 'Wallet provider',
      origin: 'https://wallet.example.com',
      privacyUrl: 'https://wallet.example.com/privacy',
    });
    await writeFile(
      resolve(args[1] ?? 'provider.config.json'),
      JSON.stringify(example, null, 2) + '\n',
      {
        flag: 'wx',
        mode: 0o600,
      },
    );
    process.stdout.write(
      'Zero-application configuration created; configure the final provider identity, then validate. Register applications after deployment\n',
    );
    return true;
  }
  if (
    args[0] === 'init-secrets' &&
    args.length === 3 &&
    args[1] === '--config'
  ) {
    const { config, directory } = await loadProviderConfiguration(args[2]);
    const parent = await lstat(directory);
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      (parent.mode & 0o077) !== 0 ||
      parent.uid !== process.getuid?.()
    )
      throw new ConfigurationError([
        '/storage: init-secrets requires a private deployment directory owned by the service account',
      ]);
    const existing = Object.fromEntries(
      secretReferences(config)
        .filter((ref) => !!process.env[ref.env])
        .map((ref) => [ref.env, process.env[ref.env]!]),
    );
    const values = generateDeploymentSecrets(config, existing);
    const names = [...new Set(secretReferences(config).map((ref) => ref.env))];
    setupEnvironment(
      Object.fromEntries(
        names.map((name) => [name, 'required-secret-placeholder']),
      ),
    );
    const contents =
      setupEnvironment(values) +
      names
        .filter((name) => !values[name])
        .map((name) => `${name}=\n`)
        .join('');
    await writeFile(join(directory, 'provider.env'), contents, {
      flag: 'wx',
      mode: 0o600,
    });
    if (config.management)
      await writeFile(
        join(directory, 'installation-claim'),
        values[config.management.claim.env] + '\n',
        { flag: 'wx', mode: 0o600 },
      );
    process.stdout.write(
      'Private provider.env created. Retain it across restarts and supply any external-service secrets before starting.\n',
    );
    return true;
  }
  if (
    args.length !== 3 ||
    args[1] !== '--config' ||
    !['validate', 'doctor', 'init-storage', 'run'].includes(args[0])
  )
    throw new Error('Invalid command');
  if (args[0] === 'run') return false;
  const { config, directory } = await loadProviderConfiguration(args[2]);
  if (args[0] === 'validate')
    process.stdout.write('Configuration valid; no integrations activated\n');
  if (args[0] === 'init-storage') {
    const db = openProviderDatabase({
      directory: resolve(directory, config.storage.directory),
      initialize: true,
    });
    db.close();
    if (config.backend.kind === 'ows') {
      const vaultPath = resolve(directory, config.backend.vaultDirectory);
      await mkdir(vaultPath, { mode: 0o700 }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        },
      );
      const vault = await lstat(vaultPath);
      if (
        !vault.isDirectory() ||
        vault.isSymbolicLink() ||
        (vault.mode & 0o077) !== 0 ||
        vault.uid !== process.getuid?.()
      )
        throw new ConfigurationError([
          '/backend/vaultDirectory: use a private directory owned by the service account',
        ]);
    }
    process.stdout.write(
      'Toolkit storage initialized; no integrations activated\n',
    );
  }
  if (args[0] === 'doctor') {
    const checks = await inspectSetup(config, directory);
    process.stdout.write(
      JSON.stringify(
        {
          checks,
          networkChecks: 'not_performed',
          providerAcceptance: 'not_verified',
        },
        null,
        2,
      ) + '\n',
    );
    if (checks.some((c) => c.status === 'fail')) process.exitCode = 1;
  }
  return true;
}
