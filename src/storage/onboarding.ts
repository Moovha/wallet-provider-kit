import type { OnboardingStore, ProviderState } from '../onboarding/types.js';
import type { StorageConnection } from './connection.js';

const collections = [
  'supportedActions',
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
        const previous = new Map<string, string>();
        for (const row of connection.all(
          'SELECT collection,id,record FROM onboarding_records',
        )) {
          const collection = String(
            row.collection,
          ) as (typeof collections)[number];
          if (!collections.includes(collection)) throw new Error();
          Object.defineProperty(state[collection], String(row.id), {
            value: JSON.parse(String(row.record)),
            writable: true,
            enumerable: true,
            configurable: true,
          });
          previous.set(
            JSON.stringify([collection, row.id]),
            String(row.record),
          );
        }
        state.audit = connection
          .all('SELECT record FROM onboarding_audit ORDER BY sequence')
          .map((r) => JSON.parse(String(r.record)));
        const originalAudit = state.audit.map((r) => JSON.stringify(r));
        const result = operation(state);
        if (result && typeof (result as { then?: unknown }).then === 'function')
          throw new Error();
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
          originalAudit.some((r, i) => JSON.stringify(state.audit[i]) !== r)
        )
          throw new Error();
        for (const collection of collections) {
          if (
            !state[collection] ||
            typeof state[collection] !== 'object' ||
            Array.isArray(state[collection])
          )
            throw new Error();
          for (const [id, record] of Object.entries(state[collection])) {
            const key = JSON.stringify([collection, id]);
            const encoded = JSON.stringify(record);
            if (previous.get(key) !== encoded)
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
        return result;
      });
    },
  };
}
