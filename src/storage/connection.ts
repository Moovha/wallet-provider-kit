import { scopedCollection } from './network-scope.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
import { constants, closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WalletProviderError } from '../domain/signing.js';
import { AuthenticationError } from '../service/auth.js';
import { applicationId, schema, schemaVersion } from './schema.js';

type StorageValue = string | number | bigint | null;
type StorageRow = Record<string, StorageValue | Uint8Array>;

export interface ProviderDatabaseOptions {
  /** Additional network state shares identity and management in the same verified schema. */
  networkScope?: ProviderNetwork;
  expectedNetworkSetRevision?: string;
  /** Dedicated private directory on persistent local POSIX storage. */
  directory: string;
  /** Explicitly initialize an empty toolkit database. Never upgrades an existing schema. */
  initialize?: boolean;
}

export function unavailable(): never {
  throw new WalletProviderError('wallet_attempt_unavailable', 'unknown');
}

function privatePath(path: string, directory: boolean): boolean {
  try {
    const stat = lstatSync(path);
    if (
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      stat.uid !== process.getuid?.() ||
      (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)
    )
      throw new Error();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new WalletProviderError('wallet_provider_configuration');
  }
}

function normalize(sql: string) {
  return sql.trim().replace(/;$/, '').replace(/\s+/g, ' ');
}

/** Internal SQL boundary. Public methods never accept SQL or arbitrary table names. */
export class StorageConnection {
  private readonly db: DatabaseSync;
  private closed = false;
  private poisoned = false;

  constructor(private readonly options: ProviderDatabaseOptions) {
    if (
      !options ||
      typeof options.directory !== 'string' ||
      !isAbsolute(options.directory) ||
      process.platform === 'win32' ||
      (options.initialize !== undefined &&
        typeof options.initialize !== 'boolean')
    )
      throw new WalletProviderError('wallet_provider_configuration');
    let database: DatabaseSync | undefined;
    if (options.networkScope !== undefined)
      providerNetwork(options.networkScope);
    this.options = Object.freeze({ ...options });
    try {
      if (!privatePath(options.directory, true)) {
        if (!options.initialize) throw new Error();
        mkdirSync(options.directory, { recursive: true, mode: 0o700 });
        if (!privatePath(options.directory, true)) throw new Error();
      }
      const path = join(options.directory, 'provider.sqlite');
      if (!privatePath(path, false)) {
        if (!options.initialize) throw new Error();
        try {
          closeSync(
            openSync(
              path,
              constants.O_CREAT |
                constants.O_EXCL |
                constants.O_WRONLY |
                constants.O_NOFOLLOW,
              0o600,
            ),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
        if (!privatePath(path, false)) throw new Error();
      }
      for (const suffix of ['-wal', '-shm', '-journal'])
        privatePath(path + suffix, false);
      database = new DatabaseSync(path, {
        timeout: 2000,
        allowExtension: false,
        enableForeignKeyConstraints: true,
        enableDoubleQuotedStringLiterals: false,
      });
      // Inspect the actual catalog before any schema work, even for a newly created file.
      const catalog = database
        .prepare(
          "SELECT type, name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
        )
        .all();
      const version = database.prepare('PRAGMA user_version').get()!
        .user_version;
      const identity = database.prepare('PRAGMA application_id').get()!
        .application_id;
      if (
        catalog.length === 0 &&
        version === 0 &&
        identity === 0 &&
        options.initialize === true
      ) {
        database.exec('BEGIN IMMEDIATE');
        try {
          // Recheck after the exclusive writer claim: another process may have initialized it.
          const current = database.prepare('PRAGMA user_version').get()!
            .user_version;
          if (current === 0) {
            if (
              database
                .prepare(
                  "SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
                )
                .all().length
            )
              throw new Error();
            database.exec(schema);
            database.exec(
              `PRAGMA application_id = ${applicationId}; PRAGMA user_version = ${schemaVersion}`,
            );
          }
          database.exec('COMMIT');
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      }
      this.db = database;
      this.validateSchema();
      if (
        database.prepare('PRAGMA journal_mode = WAL').get()!.journal_mode !==
        'wal'
      )
        throw new Error();
      database.exec('PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF');
    } catch {
      database?.close();
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }

  private validateSchema() {
    if (
      this.db.prepare('PRAGMA user_version').get()!.user_version !==
        schemaVersion ||
      this.db.prepare('PRAGMA application_id').get()!.application_id !==
        applicationId ||
      this.db.prepare('PRAGMA foreign_keys').get()!.foreign_keys !== 1
    )
      throw new Error();
    const expected = schema.split(';').map(normalize).filter(Boolean).sort();
    const actual = this.db
      .prepare("SELECT sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")
      .all()
      .map((r) => normalize(String(r.sql)))
      .sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error();
    if (this.db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error();
    if (this.db.prepare('PRAGMA quick_check').get()!.quick_check !== 'ok')
      throw new Error();
  }

  requireTransaction() {
    if (this.closed || this.poisoned || !this.db.isTransaction) unavailable();
  }

  all(sql: string, ...values: StorageValue[]): StorageRow[] {
    if (this.closed || this.poisoned) unavailable();
    try {
      return this.db.prepare(sql).all(...values);
    } catch {
      return unavailable();
    }
  }
  get(sql: string, ...values: StorageValue[]): StorageRow | undefined {
    return this.all(sql, ...values)[0];
  }
  run(
    sql: string,
    ...values: StorageValue[]
  ): { changes: number | bigint; lastInsertRowid: number | bigint } {
    if (this.closed || this.poisoned) unavailable();
    try {
      return this.db.prepare(sql).run(...values);
    } catch {
      return unavailable();
    }
  }
  recordCollection(name: string) {
    return scopedCollection(name, this.options.networkScope);
  }
  transaction<T>(operation: () => T): T {
    if (this.closed || this.poisoned || this.db.isTransaction) unavailable();
    try {
      this.db.exec('BEGIN IMMEDIATE');
      if (this.options.expectedNetworkSetRevision !== undefined) {
        const host = this.get(
          'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
          'deploymentBindings',
          'service-v1',
        );
        if (
          !host ||
          JSON.parse(String(host.record)).networkSetRevision !==
            this.options.expectedNetworkSetRevision
        )
          throw new WalletProviderError('wallet_authorization_denied');
      }
      const value = operation();
      if (value && typeof (value as { then?: unknown }).then === 'function')
        throw new Error();
      const result = structuredClone(value);
      try {
        this.db.exec('COMMIT');
      } catch {
        this.poisoned = true;
        unavailable();
      }
      return result;
    } catch (error) {
      if (this.db.isTransaction) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          this.poisoned = true;
        }
      }
      if (
        error instanceof WalletProviderError ||
        error instanceof AuthenticationError
      )
        throw error;
      return unavailable();
    }
  }
  audit(event: string, reference: string) {
    this.run(
      'INSERT INTO financial_audit(at,event,reference) VALUES(?,?,?)',
      Date.now(),
      event,
      reference,
    );
  }
  async ready(): Promise<boolean> {
    try {
      if (this.closed || this.poisoned) return false;
      this.validateSchema();
      return (
        this.db.prepare('PRAGMA synchronous').get()!.synchronous === 2 &&
        this.db.prepare('PRAGMA journal_mode').get()!.journal_mode === 'wal'
      );
    } catch {
      return false;
    }
  }
  close() {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
}
