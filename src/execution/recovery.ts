import {
  replacementStatusSchema,
  checkedReplacementStatus,
  type ReplacementStatus,
} from './replacement.js';
import { WalletProviderError } from '../domain/signing.js';
import type { ChainObservation, TransferExecutionPlan } from './types.js';

export interface RecoveryConfiguration {
  stuckAfterSeconds: number;
  quarantineOnStuck: boolean;
}
export interface ProviderInspection {
  status: string;
  nonce?: string;
  transactionHash?: string;
  replacement?: ReplacementStatus;
}
export interface NonceSnapshot {
  confirmedNonce: string;
  finalizedNonce: string;
  pendingNonceMinimum: string;
  pendingNonceMaximum: string;
  balanceWei: string;
  baseFeePerGas: string;
  transactionNonce?: string;
  transactionHash?: string;
  transactionMaxFeePerGas?: string;
  transactionMaxPriorityFeePerGas?: string;
  transactionPending?: boolean;
  safeNonce?: string;
}
export interface RecoveryDiagnosis {
  state:
    | 'observing'
    | 'suspected-stuck'
    | 'awaiting-finality'
    | 'finalized'
    | 'unavailable'
    | 'blocked';
  reason:
    | 'within-threshold'
    | 'pending-too-long'
    | 'nonce-gap-suspected'
    | 'nonce-consumed-without-result'
    | 'safe-nonce-advanced'
    | 'insufficient-sponsor-funds'
    | 'fee-cap-below-base-fee'
    | 'transaction-not-visible'
    | 'provider-nonce-conflict'
    | 'evidence-unavailable'
    | 'awaiting-finality'
    | 'verified-finality';
  observed_at: string;
  pending_age_ms: number;
  quarantined: boolean;
  sponsor_nonce?: string;
  confirmed_nonce?: string;
  finalized_nonce?: string;
  safe_nonce?: string;
  next_action:
    | 'wait'
    | 'restore-evidence'
    | 'fund-sponsor'
    | 'review-provider-fees'
    | 'review-provider-nonces'
    | 'reconcile'
    | 'operator-review';
}
/** Diagnosis is operational evidence. It never authorizes dispatch, nonce reuse or financial settlement. */
export function diagnoseExecution(input: {
  plan: TransferExecutionPlan;
  configuration: RecoveryConfiguration;
  startedAt: number;
  observation?: ChainObservation;
  inspection?: ProviderInspection;
  knownNonce?: string;
  snapshot?: NonceSnapshot;
  now?: number;
}): RecoveryDiagnosis {
  const now = input.now ?? Date.now(),
    age = Math.max(0, now - input.startedAt),
    snapshot = input.snapshot;
  const nonce =
    input.knownNonce ?? snapshot?.transactionNonce ?? input.inspection?.nonce;
  const result: RecoveryDiagnosis = {
    state: 'observing',
    reason: 'within-threshold',
    observed_at: new Date(now).toISOString(),
    pending_age_ms: age,
    quarantined: false,
    next_action: 'wait',
    ...(nonce !== undefined ? { sponsor_nonce: nonce } : {}),
    ...(snapshot
      ? {
          confirmed_nonce: snapshot.confirmedNonce,
          finalized_nonce: snapshot.finalizedNonce,
          ...(snapshot.safeNonce !== undefined
            ? { safe_nonce: snapshot.safeNonce }
            : {}),
        }
      : {}),
  };
  const finish = (
    state: RecoveryDiagnosis['state'],
    reason: RecoveryDiagnosis['reason'],
    next_action: RecoveryDiagnosis['next_action'],
  ) => ({
    ...result,
    state,
    reason,
    next_action,
    quarantined:
      input.configuration.quarantineOnStuck &&
      ['suspected-stuck', 'blocked'].includes(state),
  });
  if (
    input.knownNonce !== undefined &&
    [input.inspection?.nonce, snapshot?.transactionNonce].some(
      (value) => value !== undefined && value !== input.knownNonce,
    )
  )
    return finish('blocked', 'provider-nonce-conflict', 'operator-review');
  if (input.observation?.verification === 'rpc-quorum') {
    if (input.observation.chain_status === 'finalized')
      return finish('finalized', 'verified-finality', 'wait');
    if (['included', 'safe'].includes(input.observation.chain_status))
      return finish('awaiting-finality', 'awaiting-finality', 'wait');
  }
  if (!snapshot)
    return finish(
      age >= input.configuration.stuckAfterSeconds * 1000
        ? 'suspected-stuck'
        : 'unavailable',
      'evidence-unavailable',
      'restore-evidence',
    );
  if (nonce !== undefined && BigInt(snapshot.finalizedNonce) > BigInt(nonce))
    return finish(
      'blocked',
      'nonce-consumed-without-result',
      'operator-review',
    );
  if (
    input.plan.intent &&
    snapshot.safeNonce !== undefined &&
    BigInt(snapshot.safeNonce) > BigInt(input.plan.intent.nonce)
  )
    return finish('blocked', 'safe-nonce-advanced', 'operator-review');
  if (age < input.configuration.stuckAfterSeconds * 1000) return result;
  if (
    BigInt(snapshot.balanceWei) <
    BigInt(input.plan.sponsor.gasLimit) *
      BigInt(input.plan.sponsor.maxFeePerGas) +
      BigInt(input.plan.sponsor.l1FeeReserveWei)
  )
    return finish(
      'suspected-stuck',
      'insufficient-sponsor-funds',
      'fund-sponsor',
    );
  if (BigInt(snapshot.baseFeePerGas) > BigInt(input.plan.sponsor.maxFeePerGas))
    return finish(
      'suspected-stuck',
      'fee-cap-below-base-fee',
      'review-provider-fees',
    );
  if (nonce !== undefined && BigInt(nonce) > BigInt(snapshot.confirmedNonce))
    return finish(
      'suspected-stuck',
      'nonce-gap-suspected',
      'review-provider-nonces',
    );
  if (!snapshot.transactionNonce)
    return finish('suspected-stuck', 'transaction-not-visible', 'reconcile');
  return finish('suspected-stuck', 'pending-too-long', 'review-provider-fees');
}
const decimal = { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' };
export const providerInspectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    replacement: replacementStatusSchema,
    status: { type: 'string', maxLength: 32 },
    nonce: decimal,
    transactionHash: { type: 'string', pattern: '^0x[0-9a-f]{64}$' },
  },
};
export const recoveryDiagnosisSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'state',
    'reason',
    'observed_at',
    'pending_age_ms',
    'quarantined',
    'next_action',
  ],
  properties: {
    state: {
      type: 'string',
      enum: [
        'observing',
        'suspected-stuck',
        'awaiting-finality',
        'finalized',
        'unavailable',
        'blocked',
      ],
    },
    reason: {
      type: 'string',
      enum: [
        'within-threshold',
        'pending-too-long',
        'nonce-gap-suspected',
        'nonce-consumed-without-result',
        'safe-nonce-advanced',
        'insufficient-sponsor-funds',
        'fee-cap-below-base-fee',
        'transaction-not-visible',
        'provider-nonce-conflict',
        'evidence-unavailable',
        'awaiting-finality',
        'verified-finality',
      ],
    },
    observed_at: { type: 'string', format: 'date-time' },
    pending_age_ms: {
      type: 'integer',
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    quarantined: { type: 'boolean' },
    sponsor_nonce: decimal,
    confirmed_nonce: decimal,
    finalized_nonce: decimal,
    safe_nonce: decimal,
    next_action: {
      type: 'string',
      enum: [
        'wait',
        'restore-evidence',
        'fund-sponsor',
        'review-provider-fees',
        'review-provider-nonces',
        'reconcile',
        'operator-review',
      ],
    },
  },
};

export function checkedInspection(value: unknown): ProviderInspection {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WalletProviderError('wallet_provider_response');
  const entry = value as Record<string, unknown>;
  if (
    Object.keys(entry).some(
      (key) =>
        !['status', 'nonce', 'transactionHash', 'replacement'].includes(key),
    ) ||
    typeof entry.status !== 'string' ||
    !/^[a-z_]{1,32}$/.test(entry.status) ||
    (entry.nonce !== undefined &&
      (typeof entry.nonce !== 'string' ||
        !/^(0|[1-9][0-9]{0,77})$/.test(entry.nonce) ||
        BigInt(entry.nonce) >= 2n ** 256n)) ||
    (entry.transactionHash !== undefined &&
      (typeof entry.transactionHash !== 'string' ||
        !/^0x[0-9a-f]{64}$/.test(entry.transactionHash)))
  )
    throw new WalletProviderError('wallet_provider_response');
  if (entry.replacement !== undefined)
    checkedReplacementStatus(entry.replacement);
  return structuredClone(entry) as unknown as ProviderInspection;
}
