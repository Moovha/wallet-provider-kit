import {
  registerStateAccess,
  recordValues,
  type CollectionName,
} from '../onboarding/records.js';
import { RecordIndexes, lowerBound } from './record-index.js';
import { sharedCollections, scopedCollection } from './network-scope.js';
export { scopedCollection } from './network-scope.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
import type { OnboardingStore, ProviderState } from '../onboarding/types.js';
import type { StorageConnection } from './connection.js';

const collections = [
  'verifiedUsers',
  'management',
  'managementCommands',
  'supportedActions',
  'safeWalletAccounts',
  'uniswapXOrders',
  'assetReservations',
  'assetBudgetBindings',
  'executionBindings',
  'sponsorships',
  'userOperationExecutions',
  'userOperationBatches',
  'deploymentBindings',
  'requests',
  'accounts',
  'grants',
  'idempotency',
  'budgets',
  'evidenceOwners',
  'attempts',
  'admissions',
  'sessions',
  'logins',
] as const;

function knownCollection(value: string) {
  if (collections.includes(value as (typeof collections)[number])) return true;
  const [network, collection, extra] = value.split(':');
  if (extra || sharedCollections.has(collection)) return false;
  try {
    providerNetwork(network as ProviderNetwork);
  } catch {
    return false;
  }
  return collections.includes(collection as (typeof collections)[number]);
}

/** Hydrate a row only when read; nested changes are compared before committing. */
function lazyJson(target: object, key: string, load: () => string) {
  let materialized = false;
  let value: unknown;
  let encoded: string | undefined;
  const original = () => (encoded ??= load());
  const get = () => {
    if (!materialized) {
      value = JSON.parse(original());
      materialized = true;
    }
    return value;
  };
  const set = (replacement: unknown) => {
    value = replacement;
    materialized = true;
  };
  Object.defineProperty(target, key, {
    get,
    set,
    enumerable: true,
    configurable: true,
  });
  return {
    original,
    untouched(current: object) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      return !materialized && descriptor?.get === get && descriptor.set === set;
    },
    encode(current: object) {
      return JSON.stringify(Reflect.get(current, key));
    },
  };
}

export function sqliteOnboardingStore(
  connection: StorageConnection,
  network?: ProviderNetwork,
  allNetworkAccounts = false,
): OnboardingStore {
  return {
    async transaction<T>(operation: (state: ProviderState) => T): Promise<T> {
      let indexes!: RecordIndexes;
      let externalVersion = '';
      const changes: { collection: string; id: string; record?: string }[] = [];
      const result = connection.transaction(() => {
        externalVersion = String(
          connection.get('PRAGMA data_version')!.data_version,
        );
        indexes = RecordIndexes.current(
          connection,
          externalVersion + ':' + connection.recordRevision,
        );
        const state = {
          format: 'moovha-onboarding-1',
          audit: [],
        } as unknown as ProviderState;
        const previous = new Set<string>();
        const encode = new Map<string, ReturnType<typeof lazyJson>>();
        const sources = new Map<string, string>();
        const present = indexes.collections;
        for (const collection of present)
          if (!knownCollection(collection)) throw new Error();
        const loaded = new Set<string>();
        const loaders = new Map<string, () => void>();
        const targets = new Map<string, () => Record<string, unknown>>();
        const readers = new Map<string, (id: string) => unknown>();
        const physicals = new Map<string, string[]>();
        const checkedIds = new Map<string, Set<string>>();
        for (const collection of collections) {
          const physicalCollections =
            allNetworkAccounts &&
            ['accounts', 'requests', 'grants'].includes(collection)
              ? [
                  collection,
                  ...present.filter((name) => name.endsWith(':' + collection)),
                ]
              : [scopedCollection(collection, network)];
          physicals.set(collection, physicalCollections);
          let value: Record<string, unknown> = Object.create(null);
          let enumerated = false,
            replaced = false;
          const checked = new Set<string>();
          checkedIds.set(collection, checked);
          const attach = (physical: string, id: string, original?: string) => {
            checked.add(id);
            const key = JSON.stringify([collection, id]);
            if (sources.has(key)) {
              if (sources.get(key) !== physical) throw new Error();
              return;
            }
            sources.set(key, physical);
            encode.set(
              key,
              lazyJson(value, id, () => {
                if (original !== undefined) return original;
                const record = connection.get(
                  'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
                  physical,
                  id,
                );
                if (typeof record?.record !== 'string') throw new Error();
                return record.record;
              }),
            );
            previous.add(key);
          };
          const load = () => {
            loaded.add(collection);
            if (enumerated) return;
            enumerated = true;
            for (const physical of physicalCollections)
              for (const id of indexes.ids(physical)) attach(physical, id);
          };
          const read = (id: string) => {
            loaded.add(collection);
            if (replaced) return value[id];
            if (!checked.has(id) && !enumerated) {
              checked.add(id);
              for (const physical of physicalCollections) {
                const row = connection.get(
                  'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
                  physical,
                  id,
                );
                if (row) attach(physical, id, String(row.record));
              }
            }
            return value[id];
          };
          const get = () => {
            load();
            return value;
          };
          const set = (replacement: object) => {
            load();
            value = replacement as Record<string, unknown>;
            replaced = true;
          };
          Object.defineProperty(state, collection, {
            get,
            set,
            enumerable: true,
            configurable: true,
          });
          const current = () => {
            const descriptor = Object.getOwnPropertyDescriptor(
              state,
              collection,
            );
            if (descriptor?.get !== get || descriptor.set !== set) {
              load();
              replaced = true;
              return Reflect.get(state, collection) as Record<string, unknown>;
            }
            return value;
          };
          targets.set(collection, current);
          readers.set(collection, (id) => {
            const target = current();
            return replaced ? target[id] : read(id);
          });
          loaders.set(collection, () => {
            const descriptor = Object.getOwnPropertyDescriptor(
              state,
              collection,
            );
            if (descriptor?.get !== get || descriptor.set !== set) load();
          });
        }
        const pendingAudit: ProviderState['audit'] = [];
        let originalAudit: ReturnType<StorageConnection['all']> | undefined;
        let auditEncoders: ReturnType<typeof lazyJson>[] = [];
        let audit: ProviderState['audit'];
        const loadAudit = () => {
          if (!originalAudit) {
            originalAudit = connection.all(
              'SELECT sequence FROM onboarding_audit ORDER BY sequence',
            );
            audit = new Array(originalAudit.length);
            auditEncoders = originalAudit.map((row, index) =>
              lazyJson(audit, String(index), () => {
                const record = connection.get(
                  'SELECT record FROM onboarding_audit WHERE sequence=?',
                  String(row.sequence),
                );
                if (typeof record?.record !== 'string') throw new Error();
                return record.record;
              }),
            );
          }
          if (pendingAudit.length) audit.push(...pendingAudit.splice(0));
          return audit;
        };
        const replaceAudit = (replacement: ProviderState['audit']) => {
          loadAudit();
          audit = replacement;
        };
        Object.defineProperty(state, 'audit', {
          get: loadAudit,
          set: replaceAudit,
          enumerable: true,
          configurable: true,
        });
        const read = (collection: CollectionName, id: string) =>
          readers.get(collection)!(id);
        const matches = (
          collection: CollectionName,
          field: string,
          key: string,
        ) => {
          const target = targets.get(collection)!();
          const ids = new Set<string>(Object.keys(target));
          for (const physical of physicals.get(collection)!)
            for (const id of indexes.ids(physical, field, key)) ids.add(id);
          return [...ids]
            .sort()
            .map((id) => [id, read(collection, id)] as [string, unknown])
            .filter(([, row]) => recordValues(row, field).includes(key));
        };
        registerStateAccess(state, {
          get: read,
          set(collection, id, value) {
            read(collection, id);
            targets.get(collection)!()[id] = value;
            loaded.add(collection);
          },
          remove(collection, id) {
            read(collection, id);
            delete targets.get(collection)!()[id];
          },
          select: matches,
          count(collection, field, key) {
            const physical = physicals.get(collection)!;
            if (physical.length !== 1)
              return matches(collection, field, key).length;
            const target = targets.get(collection)!();
            const ids = indexes.ids(physical[0], field, key);
            let count = ids.length;
            for (const id of new Set([
              ...Object.keys(target),
              ...checkedIds.get(collection)!,
            ])) {
              const before = ids[lowerBound(ids, id)] === id;
              const after = recordValues(read(collection, id), field).includes(
                key,
              );
              count += Number(after) - Number(before);
            }
            return count;
          },
          page(collection, after, limit, field, key) {
            const target = targets.get(collection)!();
            const touched = [
              ...new Set([
                ...Object.keys(target),
                ...checkedIds.get(collection)!,
              ]),
            ];
            const ids = new Set(touched);
            for (const physical of physicals.get(collection)!) {
              const indexed = indexes.ids(physical, field, key);
              let start = after ? lowerBound(indexed, after) : 0;
              if (after && indexed[start] === after) start++;
              for (const id of indexed.slice(
                start,
                start + limit + touched.length,
              ))
                ids.add(id);
            }
            return [...ids]
              .sort()
              .filter(
                (id) =>
                  (!after || id > after) &&
                  read(collection, id) !== undefined &&
                  (!field ||
                    recordValues(read(collection, id), field).includes(key!)),
              )
              .slice(0, limit);
          },
          append(event) {
            if (originalAudit) state.audit.push(event);
            else pendingAudit.push(structuredClone(event));
          },
        });
        const result = operation(state);
        if (result && typeof (result as { then?: unknown }).then === 'function')
          throw new Error();
        // Returned snapshots must be detached while original rows still exist.
        const detached = structuredClone(result);
        if (
          Object.keys(state).some(
            (key) =>
              key !== 'format' &&
              key !== 'audit' &&
              !collections.includes(key as (typeof collections)[number]),
          ) ||
          state.format !== 'moovha-onboarding-1'
        )
          throw new Error();
        const auditDescriptor = Object.getOwnPropertyDescriptor(state, 'audit');
        if (
          auditDescriptor?.get !== loadAudit ||
          auditDescriptor.set !== replaceAudit
        )
          loadAudit();
        if (
          originalAudit &&
          (!Array.isArray(state.audit) ||
            state.audit.length < originalAudit.length ||
            auditEncoders.some((cell) => {
              if (cell.untouched(state.audit)) return false;
              const current = cell.encode(state.audit),
                original = cell.original();
              return (
                current !== original &&
                current !== JSON.stringify(JSON.parse(original))
              );
            }))
        )
          throw new Error();
        for (const collection of collections) {
          loaders.get(collection)!();
          if (!loaded.has(collection)) continue;
          const target = targets.get(collection)!();
          if (!target || typeof target !== 'object' || Array.isArray(target))
            throw new Error();
          for (const id of Object.keys(target)) {
            const key = JSON.stringify([collection, id]);
            const cell = encode.get(key);
            if (cell?.untouched(target)) {
              previous.delete(key);
              continue;
            }
            const encoded = JSON.stringify(target[id]);
            if (!cell || cell.original() !== encoded) {
              const physical =
                sources.get(key) ?? scopedCollection(collection, network);
              changes.push({ collection: physical, id, record: encoded });
              connection.run(
                'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET record=excluded.record',
                sources.get(key) ?? scopedCollection(collection, network),
                id,
                encoded,
              );
            }
            previous.delete(key);
          }
        }
        for (const key of previous.keys()) {
          const [collection, id] = JSON.parse(key) as string[];
          changes.push({
            collection:
              sources.get(key) ?? scopedCollection(collection, network),
            id,
          });
          connection.run(
            'DELETE FROM onboarding_records WHERE collection=? AND id=?',
            sources.get(key) ?? scopedCollection(collection, network),
            id,
          );
        }
        for (const event of originalAudit
          ? state.audit.slice(originalAudit.length)
          : pendingAudit)
          connection.run(
            'INSERT INTO onboarding_audit(record) VALUES(?)',
            JSON.stringify(network ? { ...event, network } : event),
          );
        return detached;
      });
      indexes.committed(
        changes,
        externalVersion + ':' + connection.recordRevision,
      );
      return result;
    },
  };
}
