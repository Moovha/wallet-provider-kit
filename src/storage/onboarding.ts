import type { OnboardingStore, ProviderState } from '../onboarding/types.js';
import type { StorageConnection } from './connection.js';

const collections = [
  'verifiedUsers',
  'management',
  'managementCommands',
  'supportedActions',
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
        const previous = new Set<string>();
        const encode = new Map<string, ReturnType<typeof lazyJson>>();
        for (const row of connection.all(
          'SELECT DISTINCT collection FROM onboarding_records',
        ))
          if (
            !collections.includes(
              String(row.collection) as (typeof collections)[number],
            )
          )
            throw new Error();
        const loaded = new Set<string>();
        const loaders = new Map<string, () => void>();
        for (const collection of collections) {
          let value: object;
          const load = () => {
            if (loaded.has(collection)) return;
            loaded.add(collection);
            value = Object.create(null);
            for (const row of connection.all(
              'SELECT id FROM onboarding_records WHERE collection=?',
              collection,
            )) {
              const key = JSON.stringify([collection, row.id]);
              encode.set(
                key,
                lazyJson(value, String(row.id), () => {
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
          };
          const get = () => {
            load();
            return value;
          };
          const set = (replacement: object) => {
            load();
            value = replacement;
          };
          Object.defineProperty(state, collection, {
            get,
            set,
            enumerable: true,
            configurable: true,
          });
          loaders.set(collection, () => {
            const descriptor = Object.getOwnPropertyDescriptor(
              state,
              collection,
            );
            if (descriptor?.get !== get || descriptor.set !== set) load();
          });
        }
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
        for (const event of originalAudit
          ? state.audit.slice(originalAudit.length)
          : [])
          connection.run(
            'INSERT INTO onboarding_audit(record) VALUES(?)',
            JSON.stringify(event),
          );
        return detached;
      });
    },
  };
}
