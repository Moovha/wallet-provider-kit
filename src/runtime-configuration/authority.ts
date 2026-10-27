import { Interface, id } from 'ethers';
import { networkForChain } from '../networks.js';
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
import { canonicalHash } from '../domain/canonical.js';
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
    snapshot.policy_hash !== canonicalHash(snapshot.policy) ||
    canonicalHash(
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
    publication.revision !== revision ||
    publication.policy_hash !== canonicalHash(publication.policy)
  )
    deny();
  const policy = structuredClone(publication.policy);
  const declared = registry?.obligations?.records[application_id + ':actions'];
  if (declared && policy.transaction_mode !== 'unrestricted') {
    if (declared.decision !== 'accepted') deny();
    const manifest =
      declared.value as import('./obligations.js').ApplicationObligations['actions'];
    if (policy.action_requirements) {
      for (const rule of policy.action_requirements) {
        const declaration = manifest.find(
          (action) => action.name === rule.name,
        );
        if (
          !declaration ||
          rule.fields.some(
            (field) => !declaration.fields.some((d) => d.name === field.name),
          )
        )
          deny();
        rule.fields = declaration.fields.map((field) => {
          const restriction = rule.fields.find((r) => r.name === field.name);
          if (!restriction) return structuredClone(field);
          const allowed_values = restriction.allowed_values.filter((value) =>
            field.allowed_values.includes(value),
          );
          if (!allowed_values.length) deny();
          return {
            name: field.name,
            required: field.required || restriction.required,
            allowed_values,
          };
        });
      }
    } else policy.action_requirements = structuredClone(manifest);
    policy.action_requirements = normalizeRuntimePolicy({
      expected_revision: '0',
      policy,
    }).policy.action_requirements;
  }
  const resources = Object.values(registry?.obligations?.records ?? {}).filter(
    (r) => r.application_id === application_id,
  );
  const credentials = Object.values(registry?.credentials ?? {}).filter(
    (c) => c.application_id === application_id,
  );
  if (resources.length || credentials.length) {
    policy.application_resources_hash = canonicalHash([
      resources.sort((a, b) => a.kind.localeCompare(b.kind)),
      credentials
        .map(({ sealed: _sealed, ...metadata }) => metadata)
        .sort((a, b) => a.reference.localeCompare(b.reference)),
    ]);
  }
  const execution =
    state.management?.provider?.execution?.[networkForChain(policy.chain_id)];
  if (execution) {
    if (!execution.enabled) deny();
    policy.application_resources_hash = canonicalHash([
      policy.application_resources_hash ?? null,
      { network: policy.chain_id, execution_revision: execution.revision },
    ]);
  }
  const snapshot = {
    application_id,
    revision,
    policy_hash: canonicalHash(policy),
    policy,
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
  allowUnboundAccounts = false,
): ApprovedCallPolicy {
  validateRuntimeSnapshot(snapshot);
  const {
    adapters: _staticAdapters,
    unrestrictedCalls: _staticUnrestricted,
    ...infrastructure
  } = structuredClone(base);
  const policy: ApprovedCallPolicy = {
    ...infrastructure,
    ...(snapshot.policy.transaction_mode === 'unrestricted'
      ? { unrestrictedCalls: true as const }
      : {}),
    maximumNativeValueWei:
      snapshot.policy.transaction_mode === 'unrestricted'
        ? snapshot.policy.maximum_native_value_wei
        : String(
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
              ...(contract.implementation.storage_layout
                ? { storageLayout: contract.implementation.storage_layout }
                : {}),
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
  validateApprovedCallPolicy(policy, allowUnboundAccounts);
  return policy;
}
export function validateRuntimeCalls(
  snapshot: RuntimePolicySnapshot,
  input: ApprovedCallInput,
): void {
  validateRuntimeSnapshot(snapshot);
  // Owner administration has a separate owner-only grant and exact Safe call compiler.
  if (input.kind === 'owner-change') return;
  if (
    input.kind !== 'contract-call' ||
    !Array.isArray(input.calls) ||
    input.calls.length > snapshot.policy.maximum_calls
  )
    deny();
  if (snapshot.policy.transaction_mode === 'unrestricted') return;
  const requirements = snapshot.policy.action_requirements;
  if (requirements) {
    const context = input.application_action;
    const action = requirements.find((entry) => entry.name === context?.name);
    if (
      !context ||
      !action ||
      Object.keys(context).sort().join(',') !== 'name,payload' ||
      !context.payload ||
      typeof context.payload !== 'object' ||
      Array.isArray(context.payload) ||
      Object.keys(context.payload).length > 32 ||
      Object.keys(context.payload).some(
        (name) => !action.fields.some((field) => field.name === name),
      )
    )
      deny();
    for (const field of action.fields) {
      const present = Object.hasOwn(context.payload, field.name);
      if (
        (!present && field.required) ||
        (present && !field.allowed_values.includes(context.payload[field.name]))
      )
        deny();
    }
  } else if (input.application_action) deny();
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

/** Enforce explicit Safe-address ABI constraints without imposing a shared-account execution model. */
export function validateSafeAddressParameters(
  snapshot: RuntimePolicySnapshot,
  input: ApprovedCallInput,
  userAddress: string,
): void {
  validateRuntimeCalls(snapshot, input);
  if (input.kind !== 'contract-call') return;
  for (const call of input.calls) {
    const method = snapshot.policy.contracts
      .find((c) => c.address.toLowerCase() === call.to.toLowerCase())
      ?.methods.find(
        (m) => id(m.signature).slice(0, 10) === call.data.slice(0, 10),
      );
    if (!method?.user_address_parameters?.length) continue;
    const abi = new Interface(['function ' + method.signature]);
    const fragment = abi.getFunction(method.signature);
    const decoded = abi.decodeFunctionData(method.signature, call.data);
    for (const index of method.user_address_parameters) {
      if (
        fragment?.inputs[index]?.type !== 'address' ||
        typeof decoded[index] !== 'string' ||
        decoded[index].toLowerCase() !== userAddress.toLowerCase()
      )
        deny();
    }
  }
}
