import { Interface } from 'ethers';
import type { VerifiedPrincipal } from '../domain/principal.js';
import { deny } from '../onboarding/policy.js';
import { canonicalHash } from '../domain/canonical.js';
import { runtimeApplicationId } from '../runtime-configuration/service.js';
import {
  runtimeCallPolicy,
  validateRuntimeCalls,
  type RuntimePolicySnapshot,
} from '../runtime-configuration/authority.js';
import {
  approvedCallExecution,
  buildApprovedCallIntent,
  type ApprovedCallInput,
  type ApprovedCallPolicy,
  type ApprovedCallIntent,
} from '../execution/approved-calls.js';
import {
  applicationGasBudgetId,
  applicationGasBudgetLimit,
  type ApplicationGasAllowance,
} from './budget.js';
import {
  normalizeUserOperationV07,
  normalizeUserOperationDomainV07,
  maximumUserOperationCostV07,
  userOperationHashV07,
  type UserOperationV07,
  type UserOperationDomainV07,
} from './user-operation.js';

const execution = new Interface([
  'function executeUserOp(address to,uint256 value,bytes data,uint8 operation)',
]);
/** Encode the exact ordered calls for Safe4337Module execution. */
export function safeUserOperationCallData(intent: ApprovedCallIntent): string {
  const message = approvedCallExecution(intent);
  return execution
    .encodeFunctionData('executeUserOp', [
      message.to,
      message.value,
      message.data,
      message.operation,
    ])
    .toLowerCase();
}
export interface RuntimeUserOperationPreparationOptions {
  providerOrigin: string;
  principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>;
  runtimePolicy: RuntimePolicySnapshot;
  basePolicy: ApprovedCallPolicy;
  input: ApprovedCallInput;
  operation: UserOperationV07;
  domain: UserOperationDomainV07;
  sponsors: readonly ApplicationGasAllowance[];
  expiresAt: string;
  maxValiditySeconds: number;
  l1FeeReserveWei: string;
}
/** Pure policy/encoding preparation. It does not establish current owner authority or reserve funds. */
export function prepareRuntimeUserOperationV07(
  options: RuntimeUserOperationPreparationOptions,
) {
  options = structuredClone(options);
  const snapshot = options.runtimePolicy;
  if (
    snapshot.application_id !==
    runtimeApplicationId(options.principal.issuer, options.principal.clientId)
  )
    deny();
  validateRuntimeCalls(snapshot, options.input);
  const until = Date.parse(options.expiresAt);
  if (
    !Number.isInteger(options.maxValiditySeconds) ||
    options.maxValiditySeconds < 1 ||
    options.maxValiditySeconds > 3600 ||
    !Number.isFinite(until) ||
    until <= Date.now() ||
    until >
      Date.now() +
        Math.min(
          options.maxValiditySeconds,
          snapshot.policy.max_validity_seconds,
        ) *
          1000
  )
    deny();
  const operation = normalizeUserOperationV07(options.operation);
  const domain = normalizeUserOperationDomainV07(options.domain);
  const intent = buildApprovedCallIntent(
    runtimeCallPolicy(options.basePolicy, snapshot),
    options.input,
    BigInt(operation.nonce).toString(),
    options.expiresAt,
  );
  if (
    operation.sender.toLowerCase() !== intent.account.address.toLowerCase() ||
    operation.callData !== safeUserOperationCallData(intent)
  )
    deny();
  const maximumCostWei = maximumUserOperationCostV07(
    operation,
    options.l1FeeReserveWei,
  );
  const maximum = applicationGasBudgetLimit(
    options.sponsors,
    options.principal.clientId,
  );
  if (BigInt(maximumCostWei) > BigInt(maximum)) deny();
  return {
    profile: 'safe-4337-v07-preparation-v1' as const,
    authorizes_spending: false as const,
    authorizes_sponsorship: false as const,
    operation,
    domain,
    intent,
    runtimePolicy: snapshot,
    expiresAt: options.expiresAt,
    userOperationHash: userOperationHashV07(operation, domain),
    intentHash: canonicalHash(intent),
    budget: {
      id: applicationGasBudgetId(
        options.providerOrigin,
        options.principal.issuer,
        options.principal.clientId,
      ),
      maximum,
      maximumCostWei,
    },
  };
}
