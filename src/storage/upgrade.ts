import { DatabaseSync } from 'node:sqlite';
import { isAbsolute, join } from 'node:path';
import { WalletProviderError } from '../domain/signing.js';
import { applicationId, schemaStatements, schemaVersion } from './schema.js';
import { schemaV2 } from './schema-v2.js';
import { lookupSchema } from './lookup-schema.js';
import { privatePath } from './private-path.js';

const normalize = (sql: string) =>
  sql.trim().replace(/;$/, '').replace(/\s+/g, ' ');
function verify(
  database: DatabaseSync,
  version: number,
  statements: readonly string[],
) {
  const actual = database
    .prepare("SELECT sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")
    .all()
    .map((row) => normalize(String(row.sql)))
    .sort();
  if (
    database.prepare('PRAGMA application_id').get()!.application_id !==
      applicationId ||
    database.prepare('PRAGMA user_version').get()!.user_version !== version ||
    JSON.stringify(actual) !==
      JSON.stringify(statements.map(normalize).sort()) ||
    database.prepare('PRAGMA quick_check').get()!.quick_check !== 'ok' ||
    database.prepare('PRAGMA foreign_key_check').all().length
  )
    throw new Error();
}
/**
 * Offline, explicit schema 2-to-3 upgrade.
 * Stop every writer and retain a verified recovery backup first.
 */
export function upgradeProviderDatabase(directory: string): {
  fromVersion: number;
  toVersion: number;
} {
  let database: DatabaseSync | undefined;
  try {
    if (!isAbsolute(directory) || !privatePath(directory, true))
      throw new Error();
    const path = join(directory, 'provider.sqlite');
    if (!privatePath(path, false)) throw new Error();
    for (const suffix of ['-wal', '-shm', '-journal'])
      privatePath(path + suffix, false);
    database = new DatabaseSync(path, {
      timeout: 2000,
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    database.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL');
    database.exec('BEGIN IMMEDIATE');
    const fromVersion = Number(
      database.prepare('PRAGMA user_version').get()!.user_version,
    );
    if (fromVersion === schemaVersion)
      verify(database, schemaVersion, schemaStatements);
    else {
      if (fromVersion !== 2) throw new Error();
      verify(
        database,
        2,
        schemaV2
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      database.exec(lookupSchema.join(';\n') + ';');
      // Reindex retained rows in SQLite without materializing a collection in the host or changing record bytes.
      database.exec('UPDATE onboarding_records SET record=record');
      database.exec(`PRAGMA user_version=${schemaVersion}`);
      verify(database, schemaVersion, schemaStatements);
    }
    database.exec('COMMIT');
    return { fromVersion, toVersion: schemaVersion };
  } catch {
    if (database?.isTransaction) {
      try {
        database.exec('ROLLBACK');
      } catch {
        /* Closing also discards an uncommitted upgrade. */
      }
    }
    throw new WalletProviderError('wallet_provider_configuration');
  } finally {
    database?.close();
  }
}
