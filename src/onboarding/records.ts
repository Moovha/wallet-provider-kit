import type { ProviderState } from './types.js';

export type CollectionName = Exclude<keyof ProviderState, 'format' | 'audit'>;
export type CollectionRow<C extends CollectionName> =
  NonNullable<ProviderState[C]> extends Record<string, infer V> ? V : never;
export interface StateAccess {
  get(collection: CollectionName, id: string): unknown;
  set(collection: CollectionName, id: string, value: unknown): void;
  remove(collection: CollectionName, id: string): void;
  select(
    collection: CollectionName,
    field: string,
    value: string,
  ): [string, unknown][];
  page(
    collection: CollectionName,
    after: string | undefined,
    limit: number,
    field?: string,
    value?: string,
  ): string[];
  count(collection: CollectionName, field: string, value: string): number;
  append(event: ProviderState['audit'][number]): void;
}
const access = new WeakMap<ProviderState, StateAccess>();
export function registerStateAccess(
  state: ProviderState,
  implementation: StateAccess,
) {
  access.set(state, implementation);
}
export function getRecord<C extends CollectionName>(
  state: ProviderState,
  collection: C,
  id: string,
): CollectionRow<C> {
  const adapter = access.get(state);
  return (
    adapter
      ? adapter.get(collection, id)
      : (state[collection] as Record<string, unknown> | undefined)?.[id]
  ) as CollectionRow<C>;
}
export function putRecord<C extends CollectionName>(
  state: ProviderState,
  collection: C,
  id: string,
  value: CollectionRow<C>,
): CollectionRow<C> {
  const adapter = access.get(state);
  if (adapter) adapter.set(collection, id, value);
  else
    ((state[collection] ??= {} as never) as Record<string, unknown>)[id] =
      value;
  return value;
}
export function removeRecord(
  state: ProviderState,
  collection: CollectionName,
  id: string,
): void {
  const adapter = access.get(state);
  if (adapter) adapter.remove(collection, id);
  else delete (state[collection] as Record<string, unknown> | undefined)?.[id];
}
/** Index keys select candidates only. Callers must still verify current records and authority. */
export function recordValues(record: unknown, field: string): string[] {
  if (!record || typeof record !== 'object') return [];
  const row = record as {
    metadata?: { sender?: string };
    stage?: string;
    intent?: { account?: { address?: string }; nonce?: string };
    plan?: { review?: { swapper?: string; nonce?: string } };
    userOwner?: string;
    owner?: string;
    linkedOwners?: string[];
    sharing?: { subjectOwner?: string };
    members?: Record<string, unknown>;
    caller?: { issuer?: string; subject?: string; clientId?: string };
    request?: { namespace?: string; provider?: string; resourceKey?: string };
  };
  let value: unknown;
  if (field === '$batchSender') value = row.metadata?.sender?.toLowerCase();
  else if (field === '$pendingBatch')
    value = ['included', 'complete', 'expired', 'failed'].includes(
      row.stage ?? '',
    )
      ? 'no'
      : 'yes';
  else if (field === '$actionNonce')
    value = JSON.stringify([
      row.intent?.account?.address?.toLowerCase(),
      row.intent?.nonce,
    ]);
  else if (field === '$orderNonce')
    value = JSON.stringify([
      row.plan?.review?.swapper?.toLowerCase(),
      row.plan?.review?.nonce,
    ]);
  else if (field === '$person')
    value = row.userOwner ?? row.sharing?.subjectOwner ?? row.owner;
  else if (field === '$walletOwner')
    value = [row.owner, ...(row.linkedOwners ?? [])];
  else if (field === '$walletPerson')
    value = [
      row.owner,
      ...(row.linkedOwners ?? []),
      ...Object.keys(row.members ?? {}),
    ];
  else if (field === '$caller')
    value = JSON.stringify([
      row.caller?.issuer,
      row.caller?.subject,
      row.caller?.clientId,
    ]);
  else if (field === '$resource')
    value = JSON.stringify([
      row.request?.namespace,
      row.request?.provider,
      row.request?.resourceKey,
    ]);
  else
    value = field
      .split('.')
      .reduce<unknown>(
        (v, part) =>
          v && typeof v === 'object'
            ? (v as Record<string, unknown>)[part]
            : undefined,
        record,
      );
  return (Array.isArray(value) ? value : [value]).filter(
    (v): v is string => typeof v === 'string',
  );
}
export function matchingEntries<C extends CollectionName>(
  state: ProviderState,
  collection: C,
  field: string,
  value: string,
): [string, CollectionRow<C>][] {
  const adapter = access.get(state);
  return (
    adapter
      ? adapter.select(collection, field, value)
      : Object.entries(state[collection] ?? {}).filter(([, row]) =>
          recordValues(row, field).includes(value),
        )
  ) as [string, CollectionRow<C>][];
}
export function matchingRecords<C extends CollectionName>(
  state: ProviderState,
  collection: C,
  field: string,
  value: string,
): CollectionRow<C>[] {
  return matchingEntries(state, collection, field, value).map(([, row]) => row);
}
export function recordPage(
  state: ProviderState,
  collection: CollectionName,
  after: string | undefined,
  limit: number,
  field?: string,
  value?: string,
): string[] {
  const adapter = access.get(state);
  if (adapter) return adapter.page(collection, after, limit, field, value);
  return Object.keys(state[collection] ?? {})
    .sort()
    .filter(
      (id) =>
        (!after || id > after) &&
        (!field ||
          recordValues(getRecord(state, collection, id), field).includes(
            value!,
          )),
    )
    .slice(0, limit);
}
export function appendAudit(
  state: ProviderState,
  event: ProviderState['audit'][number],
) {
  const adapter = access.get(state);
  if (adapter) adapter.append(event);
  else state.audit.push(event);
}

export function recordCount(
  state: ProviderState,
  collection: CollectionName,
  field: string,
  value: string,
): number {
  const adapter = access.get(state);
  return adapter
    ? adapter.count(collection, field, value)
    : matchingRecords(state, collection, field, value).length;
}
