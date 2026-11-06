import { recordValues } from '../onboarding/records.js';
import type { StorageConnection } from './connection.js';

export function lowerBound(ids: string[], key: string) {
  let left = 0,
    right = ids.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (ids[middle] < key) left = middle + 1;
    else right = middle;
  }
  return left;
}
function update(ids: string[], id: string, include: boolean) {
  const position = lowerBound(ids, id);
  if (ids[position] === id) {
    if (!include) ids.splice(position, 1);
  } else if (include) ids.splice(position, 0, id);
}
interface FieldIndex {
  collection: string;
  field: string;
  values: Map<string, string[]>;
  keysById: Map<string, string[]>;
}
const caches = new WeakMap<StorageConnection, RecordIndexes>();
export class RecordIndexes {
  version = '';
  collections: string[] = [];
  private readonly fields = new Map<string, FieldIndex>();
  constructor(private readonly connection: StorageConnection) {}
  static current(connection: StorageConnection, version: string) {
    let cache = caches.get(connection);
    if (!cache || cache.version !== version) {
      cache = new RecordIndexes(connection);
      cache.version = version;
      cache.collections = connection
        .all('SELECT DISTINCT collection FROM onboarding_records')
        .map((row) => String(row.collection));
      caches.set(connection, cache);
    }
    return cache;
  }
  ids(collection: string, field = '$id', value = ''): string[] {
    const key = JSON.stringify([collection, field]);
    let index = this.fields.get(key);
    if (!index) {
      index = { collection, field, values: new Map(), keysById: new Map() };
      const rows = this.connection.all(
        field === '$id'
          ? 'SELECT id FROM onboarding_records WHERE collection=? ORDER BY id'
          : 'SELECT id,record FROM onboarding_records WHERE collection=? ORDER BY id',
        collection,
      );
      for (const row of rows) {
        const keys =
          field === '$id'
            ? ['']
            : [...new Set(recordValues(JSON.parse(String(row.record)), field))];
        index.keysById.set(String(row.id), keys);
        for (const value of keys) {
          const ids = index.values.get(value) ?? [];
          ids.push(String(row.id));
          index.values.set(value, ids);
        }
      }
      this.fields.set(key, index);
    }
    return index.values.get(value) ?? [];
  }
  committed(
    changes: { collection: string; id: string; record?: string }[],
    version: string,
  ) {
    for (const change of changes) {
      if (!this.collections.includes(change.collection))
        this.collections.push(change.collection);
      for (const index of this.fields.values()) {
        if (index.collection !== change.collection) continue;
        const old = index.keysById.get(change.id) ?? [];
        const next =
          change.record === undefined
            ? []
            : index.field === '$id'
              ? ['']
              : [
                  ...new Set(
                    recordValues(JSON.parse(change.record), index.field),
                  ),
                ];
        for (const value of new Set([...old, ...next])) {
          const ids = index.values.get(value) ?? [];
          update(ids, change.id, next.includes(value));
          if (ids.length) index.values.set(value, ids);
          else index.values.delete(value);
        }
        if (change.record === undefined) index.keysById.delete(change.id);
        else index.keysById.set(change.id, next);
      }
    }
    this.version = version;
  }
}
