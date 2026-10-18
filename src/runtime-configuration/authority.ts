import { Interface, id } from 'ethers';
import type { VerifiedPrincipal } from '../domain/principal.js';
import type {
  ApplicationUserAssertion,
  ProviderState,
} from '../onboarding/types.js';
import type {
  ApprovedCallInput,
  ApprovedCallPolicy,
} from '../execution/approved-calls.js';
import { validateApprovedCallPolicy } from '../execution/approved-calls.js';
import { deny } from '../onboarding/policy.js';
import { serviceHash } from '../executor/auth.js';
import {
  normalizeRuntimePolicy,
  runtimeApplicationId,
  type RuntimePolicy,
} from './service.js';

/** Immutable application publication carried with consent, actions and execution plans. */
export interface RuntimePolicySnapshot {
  application_id: string;
  revision: string;
  policy_hash: string;
  policy: RuntimePolicy;
}
export function validateRuntimeSnapshot(snapshot: RuntimePolicySnapshot): void {
  if (
    !snapshot ||
    Object.keys(snapshot).sort().join(',') !==
      'application_id,policy,policy_hash,revision' ||
    !/^[0-9a-f]{64}$/.test(snapshot.application_id) ||
    !/^[1-9][0-9]{0,19}$/.test(snapshot.revision) ||
    BigInt(snapshot.revision) >= 2n ** 64n ||
    !snapshot.policy.enabled ||
    snapshot.policy_hash !== serviceHash(snapshot.policy) ||
    serviceHash(
      normalizeRuntimePolicy({
        expected_revision: '0',
        policy: snapshot.policy,
      }).policy,
    ) !== snapshot.policy_hash
  )
    deny();
}
export function currentRuntimePolicy(
  state: ProviderState,
  principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>,
): RuntimePolicySnapshot {
  const application_id = runtimeApplicationId(
    principal.issuer,
    principal.clientId,
  );
  const registry =
    state.deploymentBindings?.['service-v1']?.runtimeConfiguration;
  const revision = registry?.heads[application_id];
  const publication =
    revision && registry?.revisions[application_id + ':' + revision];
  if (
    !publication ||
    publication.application_id !== application_id ||
    publication.revision !== revision
  )
    deny();
  const snapshot = {
    application_id,
    revision,
    policy_hash: publication.policy_hash,
    policy: structuredClone(publication.policy),
  };
  validateRuntimeSnapshot(snapshot);
  return snapshot;
}
/** Claims are application attestations under the registered trust agreement, with one identity verification timestamp. */
export function validateRuntimeClaims(
  snapshot: RuntimePolicySnapshot,
  user: ApplicationUserAssertion | undefined,
): void {
  const verifiedAt = Date.parse(user?.identity.verified_at ?? '');
  for (const claim of snapshot.policy.claim_requirements) {
    if (
      !user ||
      !Number.isFinite(verifiedAt) ||
      verifiedAt > Date.now() ||
      verifiedAt + claim.max_age_seconds * 1000 <= Date.now() ||
      !Object.hasOwn(user.identity.fields, claim.name) ||
      !claim.allowed_values.includes(user.identity.fields[claim.name])
    )
      deny();
  }
}
/** Infrastructure and provider ceilings remain local; a publication supplies only application targets and narrower limits. */
export function runtimeCallPolicy(
  base: ApprovedCallPolicy,
  snapshot: RuntimePolicySnapshot,
): ApprovedCallPolicy {
  validateRuntimeSnapshot(snapshot);
  const { adapters: _staticAdapters, ...infrastructure } =
    structuredClone(base);
  const policy: ApprovedCallPolicy = {
    ...infrastructure,
    maximumNativeValueWei: String(
      BigInt(base.maximumNativeValueWei) <
        BigInt(snapshot.policy.maximum_native_value_wei)
        ? BigInt(base.maximumNativeValueWei)
        : BigInt(snapshot.policy.maximum_native_value_wei),
    ),
    contracts: snapshot.policy.contracts.map((contract) => ({
      address: contract.address,
      codeHash: contract.code_hash,
      ...(contract.implementation
        ? {
            implementation: {
              address: contract.implementation.address,
              codeHash: contract.implementation.code_hash,
            },
          }
        : {}),
      selectors: contract.methods.map((method) =>
        id(method.signature).slice(0, 10),
      ),
      maximumValueWei: String(
        contract.methods.reduce(
          (max, method) =>
            BigInt(method.maximum_value_wei) > max
              ? BigInt(method.maximum_value_wei)
              : max,
          0n,
        ),
      ),
    })),
    swaps: [],
    vaults: [],
    ...(snapshot.policy.call_adapters
      ? { adapters: structuredClone(snapshot.policy.call_adapters) }
      : {}),
    ...(base.nativeTransfers
      ? {
          nativeTransfers: {
            recipients: (snapshot.policy.native_transfers ?? []).map((r) => ({
              address: r.address,
              codeHash: r.code_hash,
              maximumValueWei: String(
                BigInt(r.maximum_value_wei) < BigInt(base.maximumNativeValueWei)
                  ? BigInt(r.maximum_value_wei)
                  : BigInt(base.maximumNativeValueWei),
              ),
            })),
          },
        }
      : {}),
  };
  validateApprovedCallPolicy(policy);
  return policy;
}
export function validateRuntimeCalls(
  snapshot: RuntimePolicySnapshot,
  input: ApprovedCallInput,
): void {
  validateRuntimeSnapshot(snapshot);
  if (
    input.kind !== 'contract-call' ||
    !Array.isArray(input.calls) ||
    input.calls.length > snapshot.policy.maximum_calls
  )
    deny();
  for (const call of input.calls) {
    if (call.data === '0x') {
      const recipient = snapshot.policy.native_transfers?.find(
        (r) => r.address.toLowerCase() === call.to.toLowerCase(),
      );
      if (
        !recipient ||
        !/^[1-9][0-9]{0,77}$/.test(call.value) ||
        BigInt(call.value) > BigInt(recipient.maximum_value_wei)
      )
        deny();
      continue;
    }
    const contract = snapshot.policy.contracts.find(
      (contract) => contract.address.toLowerCase() === call.to.toLowerCase(),
    );
    const method = contract?.methods.find(
      (method) => id(method.signature).slice(0, 10) === call.data.slice(0, 10),
    );
    if (
      !method ||
      !/^(0|[1-9][0-9]{0,77})$/.test(call.value) ||
      BigInt(call.value) > BigInt(method.maximum_value_wei)
    )
      deny();
    const abi = new Interface(['function ' + method.signature]);
    try {
      const decoded = abi.decodeFunctionData(method.signature, call.data);
      if (abi.encodeFunctionData(method.signature, decoded) !== call.data)
        deny();
    } catch {
      deny();
    }
  }
}
