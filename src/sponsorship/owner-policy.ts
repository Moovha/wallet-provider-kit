import { Interface, getAddress, ZeroAddress } from 'ethers';
import { WalletProviderError } from '../domain/signing.js';

export interface SafeOwnerPolicy {
  /** Confirmed chain state, independent of the original deployment initializer. */
  owners: string[];
  threshold: number;
  providerSigner: string;
  revision: string;
}
export type SafeOwnerChange =
  | { type: 'add'; owner: string; threshold: number }
  | { type: 'remove'; owner: string; threshold: number }
  | { type: 'threshold'; threshold: number };
export const ownerManagementInterface = new Interface([
  'function addOwnerWithThreshold(address owner,uint256 threshold)',
  'function removeOwner(address prevOwner,address owner,uint256 threshold)',
  'function changeThreshold(uint256 threshold)',
]);
export const ownerSentinel = '0x0000000000000000000000000000000000000001';
const invalid = (): never => {
  throw new WalletProviderError('wallet_provider_input');
};
export function normalizeSafeOwners(owners: string[], threshold: number) {
  if (!Array.isArray(owners) || owners.length < 1 || owners.length > 32)
    invalid();
  const normalized = owners.map((owner) => {
    try {
      const address = getAddress(owner);
      if (address === ZeroAddress || address === ownerSentinel) invalid();
      return address.toLowerCase();
    } catch {
      return invalid();
    }
  });
  if (
    new Set(normalized).size !== normalized.length ||
    !Number.isSafeInteger(threshold) ||
    threshold < 1 ||
    threshold > normalized.length
  )
    invalid();
  // Preserve the Safe linked-list order for removeOwner's predecessor.
  return { owners: normalized, threshold };
}
export function normalizeSafeOwnerPolicy(
  policy: SafeOwnerPolicy,
): SafeOwnerPolicy {
  const state = normalizeSafeOwners(policy.owners, policy.threshold);
  let providerSigner: string;
  try {
    providerSigner = getAddress(policy.providerSigner).toLowerCase();
  } catch {
    return invalid();
  }
  if (
    !state.owners.includes(providerSigner) ||
    typeof policy.revision !== 'string' ||
    !/^(0|[1-9][0-9]{0,19})$/.test(policy.revision) ||
    BigInt(policy.revision) >= 2n ** 64n
  )
    invalid();
  return { ...state, providerSigner, revision: policy.revision };
}
export function initialSafeOwnerPolicy(
  providerSigner: string,
): SafeOwnerPolicy {
  return normalizeSafeOwnerPolicy({
    owners: [providerSigner],
    threshold: 1,
    providerSigner,
    revision: '0',
  });
}
export function sameSafeOwners(
  a: { owners: string[]; threshold: number },
  b: { owners: string[]; threshold: number },
) {
  return (
    a.threshold === b.threshold &&
    a.owners.length === b.owners.length &&
    a.owners
      .map((o) => o.toLowerCase())
      .sort()
      .join(',') ===
      b.owners
        .map((o) => o.toLowerCase())
        .sort()
        .join(',')
  );
}
/** Pure narrow Safe administration. Current quorum must authorize the resulting operation. */
export function prepareSafeOwnerChange(
  current: SafeOwnerPolicy,
  change: SafeOwnerChange,
) {
  const policy = normalizeSafeOwnerPolicy(current);
  if (
    !change ||
    Object.keys(change).sort().join(',') !==
      (change.type === 'threshold' ? 'threshold,type' : 'owner,threshold,type')
  )
    invalid();
  if (
    !Number.isSafeInteger(change.threshold) ||
    change.threshold < 1 ||
    change.threshold > 32
  )
    invalid();
  let owners = [...policy.owners];
  let data: string;
  if (change.type === 'threshold') {
    if (change.threshold === policy.threshold) invalid();
    data = ownerManagementInterface.encodeFunctionData('changeThreshold', [
      change.threshold,
    ]);
  } else if (change.type === 'add' || change.type === 'remove') {
    let owner: string;
    try {
      owner = getAddress(change.owner).toLowerCase();
    } catch {
      return invalid();
    }
    if (change.type === 'add') {
      if (owners.includes(owner)) invalid();
      owners = [owner, ...owners];
      data = ownerManagementInterface.encodeFunctionData(
        'addOwnerWithThreshold',
        [owner, change.threshold],
      );
    } else {
      const index = owners.indexOf(owner);
      if (index < 0 || owner === policy.providerSigner) invalid();
      data = ownerManagementInterface.encodeFunctionData('removeOwner', [
        index === 0 ? ownerSentinel : owners[index - 1],
        owner,
        change.threshold,
      ]);
      owners.splice(index, 1);
    }
  } else return invalid();
  const requested = normalizeSafeOwnerPolicy({
    ...policy,
    owners,
    threshold: change.threshold,
    revision: (BigInt(policy.revision) + 1n).toString(),
  });
  return { requested, data: data.toLowerCase() };
}
