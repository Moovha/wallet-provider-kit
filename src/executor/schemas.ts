import {
  providerInspectionSchema,
  recoveryDiagnosisSchema,
} from '../execution/recovery.js';
import {
  approvedCallIntentSchema,
  safePayloadSchema,
} from '../execution/call-schemas.js';
import { uuidSchema } from '../service/schemas.js';
const hash = { type: 'string', pattern: '^[0-9a-f]{64}$' };
export const authoritySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'execution_id',
    'action_id',
    'plan_hash',
    'request_hash',
    'provider_id',
    'provider_revision',
  ],
  properties: {
    provider_id: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,64}$' },
    provider_revision: { type: 'string', pattern: '^[1-9][0-9]{0,19}$' },
    execution_id: uuidSchema,
    action_id: uuidSchema,
    plan_hash: hash,
    request_hash: hash,
  },
};
export const authorityReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'allowed',
    'provider_id',
    'provider_revision',
    'execution_id',
    'action_id',
    'plan_hash',
    'request_hash',
  ],
  properties: {
    action_id: uuidSchema,
    allowed: { type: 'boolean', enum: [true] },
    provider_id: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,64}$' },
    provider_revision: { type: 'string', pattern: '^[1-9][0-9]{0,19}$' },
    execution_id: uuidSchema,
    plan_hash: hash,
    request_hash: hash,
  },
};
export const executorReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['contract', 'execution_id', 'plan_hash', 'dispatch_status'],
  properties: {
    provider_inspection: providerInspectionSchema,
    recovery: recoveryDiagnosisSchema,
    contract: { type: 'string', enum: ['execution-dispatch-v1'] },
    execution_id: uuidSchema,
    plan_hash: hash,
    dispatch_status: {
      type: 'string',
      enum: ['not_started', 'pending', 'accepted', 'unknown', 'failed'],
    },
    transaction_hash: { type: 'string', pattern: '^0x[0-9a-f]{64}$' },
  },
};
export const dispatchSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contract',
    'execution_id',
    'provider_id',
    'provider_revision',
    'wallet_attempt',
    'plan',
  ],
  properties: {
    contract: { type: 'string', enum: ['execution-dispatch-v1'] },
    execution_id: uuidSchema,
    provider_id: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,64}$' },
    provider_revision: { type: 'string', pattern: '^[1-9][0-9]{0,19}$' },
    wallet_attempt: {
      type: 'object',
      additionalProperties: false,
      required: [
        'namespace',
        'provider',
        'attemptId',
        'kind',
        'accountId',
        'resourceKey',
        'requestHash',
      ],
      properties: {
        namespace: { type: 'string', enum: ['configured-execution-v1'] },
        provider: {
          type: 'string',
          enum: ['erc3009-executor-v1', 'approved-evm-executor-v1'],
        },
        attemptId: uuidSchema,
        kind: { type: 'string', enum: ['relay_transaction'] },
        accountId: uuidSchema,
        resourceKey: hash,
        requestHash: hash,
      },
    },
    plan: {
      type: 'object',
      description:
        'Exact immutable ApprovedExecutionPlan for the selected execution profile. ERC-3009 transfers or Safe calls, owner signature, sponsor, code pins, hashes and all action fields are independently validated against server policy and the current wallet authority callback before effects.',
    },
  },
};

const text = { type: 'string', minLength: 1, maxLength: 256 };
const revision = { type: 'string', pattern: '^[1-9][0-9]{0,19}$' };
const address = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' };
const word = { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' };
const uint = { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' };
function object(properties: Record<string, unknown>) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}
const payload = object({
  primaryType: { type: 'string', enum: ['TransferWithAuthorization'] },
  domain: object({
    name: text,
    version: text,
    chainId: { type: 'string', enum: ['84532'] },
    verifyingContract: address,
  }),
  types: object({
    TransferWithAuthorization: {
      type: 'array',
      minItems: 6,
      maxItems: 6,
      items: object({
        name: {
          type: 'string',
          enum: ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'],
        },
        type: { type: 'string', enum: ['address', 'uint256', 'bytes32'] },
      }),
    },
  }),
  message: object({
    from: address,
    to: address,
    value: uint,
    validAfter: { type: 'string', enum: ['0'] },
    validBefore: uint,
    nonce: word,
  }),
});
const action = object({
  action_id: uuidSchema,
  operation_id: uuidSchema,
  kind: { type: 'string', enum: ['sign_typed_data'] },
  profile: { type: 'string', enum: ['evm_eoa_v1'] },
  profile_revision: { type: 'string', enum: ['1'] },
  status: { type: 'string', enum: ['ready'] },
  chain_id: { type: 'string', enum: ['eip155:84532'] },
  chain_account_id: {
    type: 'string',
    pattern: '^eip155:84532:0x[0-9a-fA-F]{40}$',
  },
  binding_revision: revision,
  capability_revision: { type: 'string', enum: ['1'] },
  plan_revision: { type: 'string', enum: ['1'] },
  plan_hash: word,
  payload_hash: word,
  expires_at: { type: 'string', format: 'date-time' },
  dependencies: { type: 'array', maxItems: 0, items: { type: 'object' } },
  payload,
});
const transferPlanSchema = {
  ...object({
    profile: {
      type: 'string',
      enum: ['erc3009-executor-v1', 'approved-evm-executor-v1'],
    },
    revision: { type: 'string', enum: ['1'] },
    configurationHash: hash,
    genesisHash: word,
    tokenCodeHash: word,
    scanFromBlock: uint,
    data: { type: 'string', pattern: '^0x[0-9a-f]+$', maxLength: 8192 },
    action,
    sponsor: object({
      clientId: text,
      accountId: uuidSchema,
      binding: object({ address, bindingRevision: revision }),
      fundingAgreement: text,
      gasLimit: uint,
      maxFeePerGas: uint,
      maxPriorityFeePerGas: uint,
      l1FeeReserveWei: uint,
      lifetimeBudgetWei: uint,
    }),
  }),
  description: dispatchSchema.properties.plan.description,
};
export const executorCapabilitiesSchema = object({
  contract: { type: 'string', enum: ['execution-dispatch-v1'] },
  profiles: {
    type: 'array',
    items: {
      type: 'string',
      enum: ['erc3009-executor-v1', 'approved-evm-executor-v1'],
    },
  },
  providers: {
    type: 'array',
    maxItems: 32,
    items: object({
      id: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,64}$' },
      revision,
    }),
  },
});

const callAction = {
  ...action,
  properties: { ...action.properties, payload: safePayloadSchema },
};
const callPlan = {
  ...transferPlanSchema,
  required: [
    ...transferPlanSchema.required.filter((field) => field !== 'tokenCodeHash'),
    'intent',
  ],
  properties: {
    ...transferPlanSchema.properties,
    profile: { type: 'string', enum: ['approved-evm-executor-v1'] },
    intent: approvedCallIntentSchema,
    action: callAction,
    data: { type: 'string', pattern: '^0x[0-9a-f]+$', maxLength: 32768 },
  },
};
Object.assign(dispatchSchema.properties, {
  plan: { oneOf: [transferPlanSchema, callPlan] },
});
