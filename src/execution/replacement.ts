import { randomUUID } from 'node:crypto';
import { WalletProviderError } from '../domain/signing.js';
import type { NonceSnapshot } from './recovery.js';
import type { TransferExecutionPlan } from './types.js';

export const replacementProviderContract = 'wpk-fee-only-replacement-v1';
export interface ReplacementPolicy {
  initialFeeBasisPoints: number;
  bumpBasisPoints: number;
  maxAttempts: number;
  intervalSeconds: number;
}
export type PinnedReplacementPolicy = {
  [Key in keyof ReplacementPolicy]: string;
};
export function pinReplacementPolicy(
  policy: ReplacementPolicy,
): PinnedReplacementPolicy {
  return {
    initialFeeBasisPoints: String(policy.initialFeeBasisPoints),
    bumpBasisPoints: String(policy.bumpBasisPoints),
    maxAttempts: String(policy.maxAttempts),
    intervalSeconds: String(policy.intervalSeconds),
  };
}
export { defaultReplacementPolicy, defaultSponsorGas } from './defaults.js';
export interface ReplacementProposal {
  id: string;
  sequence: number;
  nonce: string;
  previousTransactionHash: string;
  previousMaxFeePerGas: string;
  previousMaxPriorityFeePerGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}
export interface ReplacementAuthority {
  proposal: ReplacementProposal;
  phase: 'prepare' | 'dispatch';
}
export interface ReplacementAttempt {
  proposal: ReplacementProposal;
  startedAt: number;
  leaseUntil: number;
  state:
    | 'prepared'
    | 'dispatch'
    | 'accepted'
    | 'unknown'
    | 'observed'
    | 'abandoned'
    | 'settled';
  transactionHash?: string;
}
export interface WalletReplacementAttempt {
  proposal: ReplacementProposal;
  leaseUntil: number;
  dispatchAuthorizedAt?: number;
}
const decimal = { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' };
export const replacementPolicySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'initialFeeBasisPoints',
    'bumpBasisPoints',
    'maxAttempts',
    'intervalSeconds',
  ],
  properties: {
    initialFeeBasisPoints: { type: 'integer', minimum: 1000, maximum: 9000 },
    bumpBasisPoints: { type: 'integer', minimum: 1000, maximum: 10000 },
    maxAttempts: { type: 'integer', minimum: 1, maximum: 6 },
    intervalSeconds: { type: 'integer', minimum: 30, maximum: 3600 },
  },
};
export const replacementProposalSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'sequence',
    'nonce',
    'previousTransactionHash',
    'previousMaxFeePerGas',
    'previousMaxPriorityFeePerGas',
    'maxFeePerGas',
    'maxPriorityFeePerGas',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    sequence: { type: 'integer', minimum: 1, maximum: 6 },
    nonce: decimal,
    previousTransactionHash: { type: 'string', pattern: '^0x[0-9a-f]{64}$' },
    previousMaxFeePerGas: decimal,
    previousMaxPriorityFeePerGas: decimal,
    maxFeePerGas: decimal,
    maxPriorityFeePerGas: decimal,
  },
};
export const replacementAuthoritySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposal', 'phase'],
  properties: {
    proposal: replacementProposalSchema,
    phase: { type: 'string', enum: ['prepare', 'dispatch'] },
  },
};
export function initialFees(plan: TransferExecutionPlan): {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
} {
  if (plan.networkFees) {
    const fees = plan.networkFees;
    if (
      !/^(0|[1-9][0-9]{0,77})$/.test(fees.maxFeePerGas) ||
      !/^(0|[1-9][0-9]{0,77})$/.test(fees.maxPriorityFeePerGas) ||
      BigInt(fees.maxFeePerGas) > BigInt(plan.sponsor.maxFeePerGas) ||
      BigInt(fees.maxPriorityFeePerGas) >
        BigInt(plan.sponsor.maxPriorityFeePerGas) ||
      BigInt(fees.maxFeePerGas) < BigInt(fees.maxPriorityFeePerGas)
    )
      throw new WalletProviderError('wallet_authorization_denied');
    return {
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    };
  }
  if (!plan.replacement)
    return {
      maxFeePerGas: plan.sponsor.maxFeePerGas,
      maxPriorityFeePerGas: plan.sponsor.maxPriorityFeePerGas,
    };
  const factor = BigInt(plan.replacement.initialFeeBasisPoints);
  const fee = (value: string) => {
    const result = (BigInt(value) * factor) / 10000n;
    return (result > 0n ? result : 1n).toString();
  };
  return {
    maxFeePerGas: fee(plan.sponsor.maxFeePerGas),
    maxPriorityFeePerGas: fee(plan.sponsor.maxPriorityFeePerGas),
  };
}
function deny(): never {
  throw new WalletProviderError('wallet_authorization_denied');
}
export function assertReplacement(
  plan: TransferExecutionPlan,
  proposal: ReplacementProposal,
  snapshot: NonceSnapshot,
): void {
  const policy = plan.replacement;
  if (
    !policy ||
    Date.parse(plan.action.expires_at) <= Date.now() ||
    proposal.sequence < 1 ||
    proposal.sequence > Number(policy.maxAttempts) ||
    !snapshot.transactionPending ||
    snapshot.transactionHash !== proposal.previousTransactionHash ||
    snapshot.transactionNonce !== proposal.nonce ||
    snapshot.confirmedNonce !== proposal.nonce ||
    BigInt(snapshot.finalizedNonce) > BigInt(proposal.nonce) ||
    snapshot.transactionMaxFeePerGas !== proposal.previousMaxFeePerGas ||
    snapshot.transactionMaxPriorityFeePerGas !==
      proposal.previousMaxPriorityFeePerGas ||
    (plan.intent && snapshot.safeNonce !== plan.intent.nonce)
  )
    deny();
  const bump = (value: string) =>
    (
      (BigInt(value) * (10000n + BigInt(policy.bumpBasisPoints)) + 9999n) /
      10000n
    ).toString();
  if (
    proposal.maxFeePerGas !== bump(proposal.previousMaxFeePerGas) ||
    proposal.maxPriorityFeePerGas !==
      bump(proposal.previousMaxPriorityFeePerGas) ||
    BigInt(proposal.maxFeePerGas) <= BigInt(proposal.previousMaxFeePerGas) ||
    BigInt(proposal.maxPriorityFeePerGas) <=
      BigInt(proposal.previousMaxPriorityFeePerGas) ||
    BigInt(proposal.maxFeePerGas) > BigInt(plan.sponsor.maxFeePerGas) ||
    BigInt(proposal.maxPriorityFeePerGas) >
      BigInt(plan.sponsor.maxPriorityFeePerGas) ||
    BigInt(proposal.maxPriorityFeePerGas) > BigInt(proposal.maxFeePerGas) ||
    BigInt(snapshot.baseFeePerGas) + BigInt(proposal.maxPriorityFeePerGas) >
      BigInt(proposal.maxFeePerGas) ||
    BigInt(snapshot.balanceWei) <
      BigInt(plan.sponsor.gasLimit) * BigInt(plan.sponsor.maxFeePerGas) +
        BigInt(plan.sponsor.l1FeeReserveWei)
  )
    deny();
}
export function proposeReplacement(
  plan: TransferExecutionPlan,
  sequence: number,
  snapshot: NonceSnapshot,
): ReplacementProposal {
  if (
    !plan.replacement ||
    !snapshot.transactionHash ||
    snapshot.transactionNonce === undefined ||
    snapshot.transactionMaxFeePerGas === undefined ||
    snapshot.transactionMaxPriorityFeePerGas === undefined
  )
    deny();
  const bump = (value: string) =>
    (
      (BigInt(value) * (10000n + BigInt(plan.replacement!.bumpBasisPoints)) +
        9999n) /
      10000n
    ).toString();
  const proposal = {
    id: randomUUID(),
    sequence,
    nonce: snapshot.transactionNonce,
    previousTransactionHash: snapshot.transactionHash,
    previousMaxFeePerGas: snapshot.transactionMaxFeePerGas,
    previousMaxPriorityFeePerGas: snapshot.transactionMaxPriorityFeePerGas,
    maxFeePerGas: bump(snapshot.transactionMaxFeePerGas),
    maxPriorityFeePerGas: bump(snapshot.transactionMaxPriorityFeePerGas),
  };
  assertReplacement(plan, proposal, snapshot);
  return proposal;
}

export function validateReplacementSponsors(
  policy: ReplacementPolicy,
  sponsors: TransferExecutionPlan['sponsor'][],
): void {
  for (const sponsor of sponsors) {
    const initial =
      (BigInt(sponsor.maxFeePerGas) * BigInt(policy.initialFeeBasisPoints)) /
      10000n;
    const priority =
      (BigInt(sponsor.maxPriorityFeePerGas) *
        BigInt(policy.initialFeeBasisPoints)) /
      10000n;
    if (
      initial < 1n ||
      priority < 1n ||
      initial >= BigInt(sponsor.maxFeePerGas) ||
      priority >= BigInt(sponsor.maxPriorityFeePerGas)
    )
      deny();
  }
}

export interface ReplacementStatus {
  state: ReplacementAttempt['state'] | 'exhausted' | 'blocked' | 'settled';
  attempts: number;
  reason?:
    | 'fee-cap'
    | 'attempt-limit'
    | 'authority-or-preparation-denied'
    | 'evidence-unavailable';
  last_attempt_at?: string;
}
export const replacementStatusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'attempts'],
  properties: {
    state: {
      type: 'string',
      enum: [
        'prepared',
        'dispatch',
        'accepted',
        'unknown',
        'observed',
        'abandoned',
        'exhausted',
        'blocked',
        'settled',
      ],
    },
    attempts: { type: 'integer', minimum: 0, maximum: 6 },
    reason: {
      type: 'string',
      enum: [
        'fee-cap',
        'attempt-limit',
        'authority-or-preparation-denied',
        'evidence-unavailable',
      ],
    },
    last_attempt_at: { type: 'string', format: 'date-time' },
  },
};
export function checkedReplacementStatus(value: unknown): ReplacementStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) deny();
  const entry = value as Record<string, unknown>;
  if (
    Object.keys(entry).some(
      (key) =>
        !['state', 'attempts', 'reason', 'last_attempt_at'].includes(key),
    ) ||
    !replacementStatusSchema.properties.state.enum.includes(
      String(entry.state),
    ) ||
    !Number.isInteger(entry.attempts) ||
    Number(entry.attempts) < 0 ||
    Number(entry.attempts) > 6 ||
    (entry.reason !== undefined &&
      !replacementStatusSchema.properties.reason.enum.includes(
        String(entry.reason),
      )) ||
    (entry.last_attempt_at !== undefined &&
      (typeof entry.last_attempt_at !== 'string' ||
        entry.last_attempt_at.length > 64 ||
        !Number.isFinite(Date.parse(entry.last_attempt_at))))
  )
    deny();
  return structuredClone(value) as ReplacementStatus;
}
