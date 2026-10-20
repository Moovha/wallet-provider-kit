import type { OnboardingStore, ProviderState } from '../onboarding/types.js';
import type { StorageConnection } from './connection.js';

const collections = [
  'supportedActions',
  'assetReservations',
  'assetBudgetMigrations',
  'executionBindings',
  'sponsorships',
  'userOperationExecutions',
  'userOperationBatches',
  'operations',
  'executionPools',
  'sponsorQuarantines',
  'safeRequests',
  'deploymentBindings',
  'backendAccounts',
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
): OnboardingStore {
  return {
    async transaction<T>(operation: (state: ProviderState) => T): Promise<T> {
      return connection.transaction(() => {
        const state = {
          format: 'moovha-onboarding-1',
          audit: [],
        } as unknown as ProviderState;
        for (const collection of collections)
          state[collection] = Object.create(null);
        const previous = new Set<string>();
        const encode = new Map<string, ReturnType<typeof lazyJson>>();
        for (const row of connection.all(
          'SELECT collection,id FROM onboarding_records',
        )) {
          const collection = String(
            row.collection,
          ) as (typeof collections)[number];
          if (!collections.includes(collection)) throw new Error();
          const key = JSON.stringify([collection, row.id]);
          encode.set(
            key,
            lazyJson(state[collection]!, String(row.id), () => {
              const record = connection.get(
                'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
                collection,
                String(row.id),
              );
              if (typeof record?.record !== 'string') throw new Error();
              return record.record;
            }),
          );
          previous.add(key);
        }
        const originalAudit = connection.all(
          'SELECT sequence FROM onboarding_audit ORDER BY sequence',
        );
        state.audit = new Array(originalAudit.length);
        const auditEncoders = originalAudit.map((row, index) =>
          lazyJson(state.audit, String(index), () => {
            const record = connection.get(
              'SELECT record FROM onboarding_audit WHERE sequence=?',
              String(row.sequence),
            );
            if (typeof record?.record !== 'string') throw new Error();
            return record.record;
          }),
        );
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
          state.format !== 'moovha-onboarding-1' ||
          !Array.isArray(state.audit) ||
          state.audit.length < originalAudit.length ||
          auditEncoders.some((cell) => {
            if (cell.untouched(state.audit)) return false;
            const current = cell.encode(state.audit),
              original = cell.original();
            return (
              current !== original &&
              current !== JSON.stringify(JSON.parse(original))
            );
          })
        )
          throw new Error();
        for (const collection of collections) {
          if (
            !state[collection] ||
            typeof state[collection] !== 'object' ||
            Array.isArray(state[collection])
          )
            throw new Error();
          for (const id of Object.keys(state[collection])) {
            const key = JSON.stringify([collection, id]);
            const cell = encode.get(key);
            if (cell?.untouched(state[collection])) {
              previous.delete(key);
              continue;
            }
            const encoded = JSON.stringify(state[collection][id]);
            if (!cell || cell.original() !== encoded)
              connection.run(
                'INSERT INTO onboarding_records(collection,id,record) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET record=excluded.record',
                collection,
                id,
                encoded,
              );
            previous.delete(key);
          }
        }
        for (const key of previous.keys()) {
          const [collection, id] = JSON.parse(key) as string[];
          connection.run(
            'DELETE FROM onboarding_records WHERE collection=? AND id=?',
            collection,
            id,
          );
        }
        for (const event of state.audit.slice(originalAudit.length))
          connection.run(
            'INSERT INTO onboarding_audit(record) VALUES(?)',
            JSON.stringify(event),
          );
        return detached;
      });
    },
  };
}
