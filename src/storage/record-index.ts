import { lookupDefinitions } from './lookup-schema.js';
import type { StorageConnection } from './connection.js';

/** Durable candidate IDs and counts. Authority is read from current records in the caller's transaction. */
export class RecordIndexes {
  constructor(private readonly connection: StorageConnection) {}
  get collections(): string[] {
    // The supported collection/network namespace is finite. Reject an oversized catalog without enumerating it.
    const rows = this.connection.all(
      'SELECT collection FROM onboarding_collections ORDER BY collection LIMIT 257',
    );
    if (rows.length > 256) throw new Error();
    return rows.map((row) => String(row.collection));
  }
  private check(collection: string, field: string) {
    const logical = collection.slice(collection.lastIndexOf(':') + 1);
    if (!lookupDefinitions.some(([c, f]) => c === logical && f === field))
      throw new Error();
  }
  ids(
    collection: string,
    field = '$id',
    value = '',
    after?: string,
    limit?: number,
  ): string[] {
    const page =
      (after === undefined ? '' : ' AND id>?') +
      ' ORDER BY id' +
      (limit === undefined ? '' : ' LIMIT ?');
    const parameters = [
      ...(after === undefined ? [] : [after]),
      ...(limit === undefined ? [] : [limit]),
    ];
    if (field === '$id')
      return this.connection
        .all(
          'SELECT id FROM onboarding_records WHERE collection=?' + page,
          collection,
          ...parameters,
        )
        .map((row) => String(row.id));
    this.check(collection, field);
    return this.connection
      .all(
        'SELECT id FROM onboarding_lookup WHERE collection=? AND field=? AND value=?' +
          page,
        collection,
        field,
        value,
        ...parameters,
      )
      .map((row) => String(row.id));
  }
  count(collection: string, field: string, value: string): number {
    this.check(collection, field);
    return Number(
      this.connection.get(
        'SELECT count FROM onboarding_lookup_counts WHERE collection=? AND field=? AND value=?',
        collection,
        field,
        value,
      )?.count ?? 0,
    );
  }
  has(collection: string, field: string, value: string, id: string): boolean {
    this.check(collection, field);
    return !!this.connection.get(
      'SELECT 1 FROM onboarding_lookup WHERE collection=? AND field=? AND value=? AND id=?',
      collection,
      field,
      value,
      id,
    );
  }
}
