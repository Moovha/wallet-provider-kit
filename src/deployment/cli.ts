import { readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
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
        })
      : undefined;
    const names = {
      cdp: 'cdp-api-key-wallet-v2',
      ows: 'ows-local-owner-v1',
      'openzeppelin-relayer': 'openzeppelin-relayer-v1',
    };
    const matches = saved
      ? saved.origin === config.policy.provider.origin &&
        saved.binding === config.backend.binding &&
        (config.backend.kind === 'custom' ||
          saved.provider === names[config.backend.kind])
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
  if (config.backend.kind === 'custom')
    checks.push({
      check: 'backend:custom-adapter-conformance',
      status: 'pending',
    });
  return checks;
}
/** Returns false for the backward-compatible inspection executable with no arguments. */
export async function setupCommand(args: string[]): Promise<boolean> {
  if (!args.length) return false;
  if (args.length === 1 && ['help', '--help', '-h'].includes(args[0])) {
    process.stdout.write(
      'wallet-provider-kit setup [--port number] [--no-open]\nwallet-provider-kit init [file]\nwallet-provider-kit validate --config file\nwallet-provider-kit doctor --config file\nwallet-provider-kit init-storage --config file\nwallet-provider-kit run --config file\n',
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
    const example = await readFile(
      new URL('../../docs/provider.config.example.json', import.meta.url),
    );
    await writeFile(resolve(args[1] ?? 'provider.config.json'), example, {
      flag: 'wx',
      mode: 0o600,
    });
    process.stdout.write(
      'Configuration created; replace example settings, then validate\n',
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
