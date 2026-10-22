import type { ProviderNetwork } from '../networks.js';
export const sharedCollections = new Set([
  'verifiedUsers',
  'management',
  'managementCommands',
  'evidenceOwners',
]);
export function scopedCollection(
  collection: string,
  network?: ProviderNetwork,
) {
  return network && !sharedCollections.has(collection)
    ? `${network}:${collection}`
    : collection;
}
