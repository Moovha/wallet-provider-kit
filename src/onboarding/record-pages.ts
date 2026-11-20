import { setImmediate } from 'node:timers/promises';
import { WalletProviderError } from '../domain/signing.js';
import {
  getRecord,
  recordPage,
  type CollectionName,
  type CollectionRow,
} from './records.js';
import type { OnboardingStore, ProviderState } from './types.js';

export interface RecordPageInput {
  /** Continuation cursor returned by the previous page. */
  after?: string;
  /** Page size, from 1 to 100; defaults to 50. */
  limit?: number;
}
export function readState<T>(
  store: OnboardingStore,
  operation: (state: ProviderState) => T,
): Promise<T> {
  return store.read ? store.read(operation) : store.transaction(operation);
}
/** A cursor advances over examined rows, including rows excluded by the projection. Pages are not a snapshot. */
export async function readRecordPage<C extends CollectionName, T>(
  store: OnboardingStore,
  collection: C,
  input: RecordPageInput,
  project: (state: ProviderState, row: CollectionRow<C>) => T | undefined,
  guard: (state: ProviderState) => void = () => undefined,
  field?: string,
  value?: string,
): Promise<{ items: T[]; next_cursor: string | null }> {
  const limit = input.limit ?? 50;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (input.after !== undefined &&
      (typeof input.after !== 'string' ||
        !input.after ||
        input.after.length > 256))
  )
    throw new WalletProviderError('wallet_provider_input');
  return readState(store, (state) => {
    guard(state);
    const ids = recordPage(
      state,
      collection,
      input.after,
      limit + 1,
      field,
      value,
    );
    const page = ids.slice(0, limit);
    const items: T[] = [];
    for (const id of page) {
      const item = project(state, getRecord(state, collection, id));
      if (item !== undefined) items.push(item);
    }
    return { items, next_cursor: ids.length > limit ? page.at(-1)! : null };
  });
}
/** Bulk maintenance yields between read-only pages; no database transaction spans a yield. */
export async function* recordPages<C extends CollectionName, T>(
  store: OnboardingStore,
  collection: C,
  project: (state: ProviderState, row: CollectionRow<C>) => T | undefined,
  guard?: (state: ProviderState) => void,
  field?: string,
  value?: string,
): AsyncGenerator<T[]> {
  let after: string | undefined;
  do {
    await setImmediate();
    const page = await readRecordPage(
      store,
      collection,
      { after, limit: 100 },
      project,
      guard,
      field,
      value,
    );
    yield page.items;
    after = page.next_cursor ?? undefined;
  } while (after !== undefined);
}
