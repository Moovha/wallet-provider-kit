import { providerNetwork } from '../networks.js';
import {
  runtimeCallPolicy,
  validateRuntimeCalls,
} from '../runtime-configuration/authority.js';
import { pinReplacementPolicy } from '../execution/replacement.js';
import {
  validateApprovedCallAction,
  approvedCallData,
  safeInterface,
} from '../execution/approved-calls.js';
import { TypedDataEncoder, recoverAddress, Signature } from 'ethers';
import type { WalletAttemptRequest } from '../domain/attempt-journal.js';
import { WalletProviderError } from '../domain/signing.js';
import { fingerprint, uuid } from '../onboarding/policy.js';
import { createWalletAttemptRequest } from '../providers/attempt-lifecycle.js';
import { transferTypes } from '../deployment/actions.js';
import type {
  ExecutionConfiguration,
  TransferExecutionPlan,
} from '../execution/types.js';
import {
  designatedExecutionProfile,
  executionProfile,
} from '../execution/types.js';
import { transferInterface } from '../execution/chain.js';
import type { ExecutorProviderConfiguration } from './config.js';
import { canonicalServiceJson, serviceHash } from './auth.js';

export interface ExecutionDispatch {
  contract: 'execution-dispatch-v1';
  execution_id: string;
  provider_id: string;
  provider_revision: string;
  wallet_attempt: WalletAttemptRequest;
  plan: TransferExecutionPlan;
}
export interface ExecutionAuthorityRequest {
  provider_id: string;
  provider_revision: string;
  execution_id: string;
  action_id: string;
  plan_hash: string;
  request_hash: string;
  replacement?: import('../execution/replacement.js').ReplacementAuthority;
}
export interface ExecutorReceipt {
  replacement?: import('../execution/replacement.js').ReplacementStatus;
  provider_inspection?: import('../execution/recovery.js').ProviderInspection;
  recovery?: import('../execution/recovery.js').RecoveryDiagnosis;
  contract: 'execution-dispatch-v1';
  execution_id: string;
  plan_hash: string;
  dispatch_status:
    'not_started' | 'pending' | 'accepted' | 'unknown' | 'failed';
  transaction_hash?: string;
}
/** Credentials may rotate without rebuilding a financial plan; destinations and provider revisions remain pinned. */
export function executionConfigurationIdentity(
  config: ExecutionConfiguration,
): unknown {
  if (!config.service) return config;
  const { signing: _signing, keys: _keys, ...service } = config.service;
  return { ...config, service };
}
export function executorProviderIdentity(
  provider: ExecutorProviderConfiguration,
): unknown {
  return {
    id: provider.id,
    revision: provider.revision,
    kind: provider.kind,
    ...(provider.network ? { network: provider.network } : {}),
    ...(provider.relayer ? { relayerOrigin: provider.relayer.url } : {}),
    ...(provider.module
      ? { module: provider.module, options: provider.options ?? {} }
      : {}),
    ...(provider.token ? { token: provider.token } : {}),
    ...(provider.contractCalls
      ? { contractCalls: provider.contractCalls }
      : {}),
    ...(provider.runtimeContracts ? { runtimeContracts: true } : {}),
    sponsors: provider.sponsors,
    ...(provider.replacement ? { replacement: provider.replacement } : {}),
    ...(provider.recovery ? { recovery: provider.recovery } : {}),
    ...(provider.sponsorPool ? { sponsorPool: provider.sponsorPool } : {}),
    genesisHash: provider.rpc.genesisHash,
    ...(provider.rpc.tokenCodeHash
      ? { tokenCodeHash: provider.rpc.tokenCodeHash }
      : {}),
  };
}
/** Preserve existing journal identities; runtime policy numbers are bound as canonical JSON text. */
export function executionAttemptInput(plan: TransferExecutionPlan) {
  return plan.runtimePolicy
    ? { ...plan, runtimePolicy: canonicalServiceJson(plan.runtimePolicy) }
    : plan;
}
export function executionPlanHash(plan: TransferExecutionPlan): string {
  return plan.profile === executionProfile
    ? fingerprint(plan)
    : serviceHash(plan);
}
function exact(value: object, fields: string[]) {
  if (!value || Object.keys(value).sort().join(',') !== fields.sort().join(','))
    throw new Error();
}
/** Independent versioned operation and mechanism checks precede authority callbacks and every provider dispatch. */
export function validateExecutionDispatch(
  input: ExecutionDispatch,
  provider: ExecutorProviderConfiguration,
): void {
  try {
    exact(input, [
      'contract',
      'execution_id',
      'provider_id',
      'provider_revision',
      'wallet_attempt',
      'plan',
    ]);
    const plan = input.plan;
    const network = providerNetwork(provider.network);
    exact(plan, [
      'profile',
      'revision',
      'action',
      'sponsor',
      'configurationHash',
      'genesisHash',
      ...(plan.tokenCodeHash ? ['tokenCodeHash'] : []),
      'data',
      'scanFromBlock',
      ...(plan.intent ? ['intent'] : []),
      ...(plan.runtimePolicy ? ['runtimePolicy'] : []),
      ...(plan.replacement ? ['replacement'] : []),
    ]);
    if (
      input.contract !== 'execution-dispatch-v1' ||
      !uuid.test(input.execution_id) ||
      input.provider_id !== provider.id ||
      input.provider_revision !== provider.revision ||
      ![designatedExecutionProfile, 'approved-evm-executor-v1'].includes(
        plan.profile,
      ) ||
      plan.revision !== '1' ||
      !/^[0-9a-f]{64}$/.test(plan.configurationHash) ||
      !/^(0|[1-9][0-9]{0,77})$/.test(plan.scanFromBlock) ||
      plan.genesisHash !== provider.rpc.genesisHash ||
      (!plan.intent &&
        (!plan.tokenCodeHash ||
          plan.tokenCodeHash !== provider.rpc.tokenCodeHash))
    )
      throw new Error();
    if (
      serviceHash(plan.replacement ?? null) !==
      serviceHash(
        provider.replacement
          ? pinReplacementPolicy(provider.replacement)
          : null,
      )
    )
      throw new Error();
    const sponsor = provider.sponsors.find(
      (entry) =>
        entry.clientId === plan.sponsor.clientId &&
        entry.accountId === plan.sponsor.accountId,
    );
    if (!sponsor) throw new Error();
    const expectedSponsor = {
      ...sponsor,
      binding: {
        address: sponsor.binding.address,
        bindingRevision: sponsor.binding.bindingRevision,
      },
    };
    if (serviceHash(expectedSponsor) !== serviceHash(plan.sponsor))
      throw new Error();
    const action = plan.action;
    exact(action, [
      'action_id',
      'operation_id',
      'kind',
      'profile',
      'profile_revision',
      'status',
      'chain_id',
      'chain_account_id',
      'binding_revision',
      'capability_revision',
      'plan_revision',
      'plan_hash',
      'payload_hash',
      'expires_at',
      'dependencies',
      'payload',
    ]);
    if (plan.runtimePolicy && (!plan.intent || !provider.runtimeContracts))
      throw new Error();
    if (plan.intent) {
      if (
        plan.profile !== 'approved-evm-executor-v1' ||
        !provider.contractCalls ||
        input.wallet_attempt.accountId !== plan.intent.input.account_id ||
        plan.intent.account.accountId !== input.wallet_attempt.accountId
      )
        throw new Error();
      const policy = plan.runtimePolicy
        ? runtimeCallPolicy(provider.contractCalls, plan.runtimePolicy)
        : provider.contractCalls;
      if (plan.runtimePolicy) {
        if (plan.runtimePolicy.policy.chain_id !== network.caip)
          throw new Error();
        validateRuntimeCalls(plan.runtimePolicy, plan.intent.input);
        if (
          Date.parse(action.expires_at) >
          Date.now() + plan.runtimePolicy.policy.max_validity_seconds * 1000
        )
          throw new Error();
      }
      validateApprovedCallAction(policy, plan.intent, action, network.name);
      const parsed = safeInterface.parseTransaction({ data: plan.data });
      const signature = String(parsed?.args.signatures);
      if (
        approvedCallData(action, signature) !== plan.data ||
        recoverAddress(action.payload_hash, signature).toLowerCase() !==
          action.chain_account_id.split(':')[2].toLowerCase() ||
        action.chain_account_id ===
          network.caip + ':' + sponsor.binding.address ||
        !uuid.test(action.action_id) ||
        action.operation_id !== action.action_id ||
        action.kind !== 'sign_typed_data' ||
        action.profile !== 'evm_eoa_v1' ||
        action.profile_revision !== '1' ||
        action.status !== 'ready' ||
        action.chain_id !== network.caip ||
        !new RegExp('^' + network.caip + ':0x[0-9a-fA-F]{40}$').test(
          action.chain_account_id,
        ) ||
        !/^[1-9][0-9]{0,19}$/.test(action.binding_revision) ||
        action.capability_revision !== '1' ||
        action.plan_revision !== '1' ||
        action.dependencies.length !== 0 ||
        !Number.isFinite(Date.parse(action.expires_at))
      )
        throw new Error();
      const expected = createWalletAttemptRequest(
        'configured-execution-v1',
        plan.profile,
        'relay_transaction',
        input.wallet_attempt.accountId,
        input.execution_id,
        action.action_id,
        executionAttemptInput(plan),
      );
      if (serviceHash(expected) !== serviceHash(input.wallet_attempt))
        throw new Error();
      return;
    }
    const { domain, types, message, primaryType } = action.payload;
    exact(action.payload, ['domain', 'types', 'message', 'primaryType']);
    exact(domain, ['name', 'version', 'chainId', 'verifyingContract']);
    exact(message, [
      'from',
      'to',
      'value',
      'validAfter',
      'validBefore',
      'nonce',
    ]);
    const parsed = transferInterface.parseTransaction({ data: plan.data });
    const signature = Signature.from({
      v: Number(parsed!.args.v),
      r: parsed!.args.r,
      s: parsed!.args.s,
    });
    const digest = TypedDataEncoder.hash(domain, types, message);
    if (
      !uuid.test(action.action_id) ||
      action.operation_id !== action.action_id ||
      action.kind !== 'sign_typed_data' ||
      action.profile !== 'evm_eoa_v1' ||
      action.profile_revision !== '1' ||
      action.status !== 'ready' ||
      action.chain_id !== network.caip ||
      action.chain_account_id !== network.caip + ':' + message.from ||
      !/^[1-9][0-9]{0,19}$/.test(action.binding_revision) ||
      action.capability_revision !== '1' ||
      action.plan_revision !== '1' ||
      !Array.isArray(action.dependencies) ||
      action.dependencies.length !== 0 ||
      action.plan_hash !== digest ||
      action.payload_hash !== digest ||
      primaryType !== 'TransferWithAuthorization' ||
      serviceHash(types) !== serviceHash(transferTypes) ||
      domain.chainId !== network.chainId ||
      domain.name !== provider.token?.name ||
      domain.version !== provider.token?.version ||
      String(domain.verifyingContract).toLowerCase() !==
        provider.token?.address.toLowerCase() ||
      message.validAfter !== '0' ||
      !/^[1-9][0-9]{0,77}$/.test(String(message.value)) ||
      !/^0x[0-9a-f]{64}$/.test(String(message.nonce)) ||
      !/^[1-9][0-9]{0,15}$/.test(String(message.validBefore)) ||
      new Date(Number(message.validBefore) * 1000).toISOString() !==
        action.expires_at ||
      recoverAddress(digest, signature.serialized).toLowerCase() !==
        String(message.from).toLowerCase() ||
      String(message.from).toLowerCase() ===
        sponsor.binding.address.toLowerCase()
    )
      throw new Error();
    const data = transferInterface
      .encodeFunctionData('transferWithAuthorization', [
        message.from,
        message.to,
        message.value,
        message.validAfter,
        message.validBefore,
        message.nonce,
        signature.v,
        signature.r,
        signature.s,
      ])
      .toLowerCase();
    if (data !== plan.data || parsed!.name !== 'transferWithAuthorization')
      throw new Error();
    const request = input.wallet_attempt;
    const expected = createWalletAttemptRequest(
      'configured-execution-v1',
      plan.profile,
      'relay_transaction',
      request.accountId,
      input.execution_id,
      action.action_id,
      plan,
    );
    if (serviceHash(request) !== serviceHash(expected)) throw new Error();
  } catch {
    throw new WalletProviderError('wallet_authorization_denied');
  }
}
