import { privatePath } from './private-path.js';
import { scopedCollection } from './network-scope.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
import { constants, closeSync, mkdirSync, openSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { WalletProviderError } from '../domain/signing.js';
import { AuthenticationError } from '../service/auth.js';
import {
  applicationId,
  schema,
  schemaStatements,
  schemaVersion,
} from './schema.js';

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

function normalize(sql: string) {
  return sql.trim().replace(/;$/, '').replace(/\s+/g, ' ');
}

/** Internal SQL boundary. Public methods never accept SQL or arbitrary table names. */
export class StorageConnection {
  private readonly db: DatabaseSync;
  private closed = false;
  private poisoned = false;
  private readonly statements = new Map<string, StatementSync>();

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
          "SELECT type, name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' LIMIT 1",
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
      this.validateIntegrity();
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
    const expected = schemaStatements.map(normalize).sort();
    const actual = this.db
      .prepare(
        `SELECT sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' LIMIT ${schemaStatements.length + 1}`,
      )
      .all()
      .map((r) => normalize(String(r.sql)))
      .sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error();
  }

  private validateIntegrity() {
    if (this.db.prepare('PRAGMA foreign_key_check').get()) throw new Error();
    if (this.db.prepare('PRAGMA quick_check').get()!.quick_check !== 'ok')
      throw new Error();
  }

  requireTransaction() {
    if (this.closed || this.poisoned || !this.db.isTransaction) unavailable();
  }

  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      if (this.statements.size >= 128)
        this.statements.delete(this.statements.keys().next().value!);
      this.statements.set(sql, statement);
    }
    return statement;
  }
  private storageFailure(error: unknown): never {
    const code = (error as { errcode?: number } | null)?.errcode;
    // Primary SQLite error codes: IOERR, CORRUPT and NOTADB, including their extended variants.
    if (typeof code === 'number' && [10, 11, 26].includes(code & 255))
      this.poisoned = true;
    return unavailable();
  }
  all(sql: string, ...values: StorageValue[]): StorageRow[] {
    if (this.closed || this.poisoned) unavailable();
    try {
      return this.statement(sql).all(...values);
    } catch (error) {
      return this.storageFailure(error);
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
      return this.statement(sql).run(...values);
    } catch (error) {
      return this.storageFailure(error);
    }
  }
  recordCollection(name: string) {
    return scopedCollection(name, this.options.networkScope);
  }
  transaction<T>(operation: () => T, readOnly = false): T {
    if (this.closed || this.poisoned || this.db.isTransaction) unavailable();
    try {
      if (readOnly) this.db.exec('PRAGMA query_only=ON');
      this.db.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
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
    } finally {
      if (readOnly) {
        try {
          this.db.exec('PRAGMA query_only=OFF');
        } catch {
          this.poisoned = true;
          unavailable();
        }
      }
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
      // Startup and the offline doctor verify all pages. Request readiness checks only the bounded catalog and connection settings.
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
      this.statements.clear();
      this.db.close();
      this.closed = true;
    }
  }
}
