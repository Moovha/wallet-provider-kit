import { replacementStatusSchema } from './replacement.js';
import { recoveryDiagnosisSchema } from './recovery.js';
import { uuidSchema } from '../service/schemas.js';

export const executionHeaders = {
  type: 'object',
  required: ['execution-profile', 'execution-profile-revision'],
  properties: {
    'execution-profile': {
      type: 'string',
      enum: [
        'erc3009-relayer-v1',
        'erc3009-executor-v1',
        'approved-evm-executor-v1',
      ],
      description:
        'Select the exact execution contract from GET /v1/execution-capabilities.',
    },
    'execution-profile-revision': {
      type: 'string',
      enum: ['1'],
      description:
        'Unknown revisions are rejected; the server never substitutes a different execution contract.',
    },
  },
};
const hash = { type: 'string', pattern: '^0x[0-9a-f]{64}$' };
const number = { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' };
const proofFields = [
  'transaction_hash',
  'block_hash',
  'block_number',
  'execution_origin',
];
export const executionReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'profile',
    'profile_revision',
    'action_id',
    'execution_id',
    'dispatch_status',
    'observation_revision',
    'next_poll_after_ms',
    'chain_status',
    'verification',
    'outcome',
    'settlement',
    'observed_at',
  ],
  properties: {
    recovery: recoveryDiagnosisSchema,
    replacement: replacementStatusSchema,
    profile: {
      type: 'string',
      enum: [
        'erc3009-relayer-v1',
        'erc3009-executor-v1',
        'approved-evm-executor-v1',
      ],
    },
    outcome_scope: {
      type: 'string',
      enum: [
        'token-transfer',
        'contract-execution',
        'swap-effects',
        'vault-deposit-effects',
      ],
      description:
        'What verified success establishes: exact token transfer, successful approved calls, or the required swap/vault asset effects. Contract execution alone does not prove an arbitrary business outcome.',
    },
    profile_revision: { type: 'string', enum: ['1'] },
    action_id: uuidSchema,
    execution_id: uuidSchema,
    dispatch_status: {
      type: 'string',
      enum: ['not_started', 'pending', 'accepted', 'unknown', 'failed'],
      description:
        'Durable submission state. Accepted identifies a durable executor/provider acceptance; it is not chain inclusion or settlement.',
    },
    observation_revision: { type: 'integer', minimum: 0 },
    next_poll_after_ms: { type: 'integer', minimum: 5000, maximum: 300000 },
    chain_status: {
      type: 'string',
      enum: [
        'unobserved',
        'pending',
        'included',
        'safe',
        'finalized',
        'reorged',
      ],
    },
    verification: {
      type: 'string',
      enum: ['unverified', 'rpc-quorum'],
      description:
        'RPC quorum means agreement of all configured trusted RPC sources on exact receipt effects and canonical block evidence, not a cryptographic light-client proof.',
    },
    outcome: { type: 'string', enum: ['unknown', 'succeeded', 'reverted'] },
    settlement: {
      type: 'string',
      enum: ['pending', 'succeeded', 'reverted'],
      description:
        'The supported token transfer reaches succeeded/reverted settlement only after matching finalized chain evidence. This is not a claim of general business-operation completion.',
    },
    observed_at: { type: 'string', format: 'date-time' },
    transaction_hash: hash,
    block_hash: hash,
    block_number: number,
    execution_origin: {
      type: 'string',
      enum: ['sponsor', 'external'],
      description:
        'An external party can relay the same ERC-3009 authorization. Only its exact verified token effect can establish success.',
    },
  },
  oneOf: [
    {
      type: 'object',
      properties: {
        verification: { enum: ['unverified'] },
        chain_status: { enum: ['unobserved', 'pending', 'reorged'] },
        outcome: { enum: ['unknown'] },
        settlement: { enum: ['pending'] },
      },
      not: {
        anyOf: proofFields.map((field) => ({
          type: 'object',
          required: [field],
        })),
      },
    },
    {
      type: 'object',
      required: proofFields,
      properties: {
        verification: { enum: ['rpc-quorum'] },
        chain_status: { enum: ['included', 'safe'] },
        outcome: { enum: ['succeeded', 'reverted'] },
        settlement: { enum: ['pending'] },
      },
    },
    {
      type: 'object',
      required: proofFields,
      properties: {
        verification: { enum: ['rpc-quorum'] },
        chain_status: { enum: ['finalized'] },
        outcome: { enum: ['succeeded'] },
        settlement: { enum: ['succeeded'] },
      },
    },
    {
      type: 'object',
      required: proofFields,
      properties: {
        verification: { enum: ['rpc-quorum'] },
        chain_status: { enum: ['finalized'] },
        outcome: { enum: ['reverted'] },
        settlement: { enum: ['reverted'] },
      },
    },
  ],
};

/** Discovery is extensible; clients execute only a profile ID/revision they explicitly support. */
export const executionCapabilitiesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['contract_version', 'profiles'],
  properties: {
    contract_version: { type: 'string', enum: ['1'] },
    profiles: {
      type: 'array',
      maxItems: 32,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'revision',
          'implemented',
          'configured',
          'ready',
          'chain_id',
          'account_type',
          'signing',
          'token_authorization',
          'submission',
          'verification',
          'finality',
          'minimum_rpc_sources',
          'execute_scopes',
          'read_scopes',
        ],
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9._-]{0,63}$' },
          revision: { type: 'string', pattern: '^[1-9][0-9]{0,19}$' },
          implemented: { type: 'boolean' },
          configured: { type: 'boolean' },
          ready: { type: 'boolean' },
          chain_id: { type: 'string' },
          account_type: { type: 'string' },
          signing: { type: 'string' },
          token_authorization: { type: 'string' },
          submission: { type: 'string' },
          verification: { type: 'string' },
          finality: { type: 'string' },
          minimum_rpc_sources: { type: 'integer', minimum: 2 },
          execute_scopes: { type: 'array', items: { type: 'string' } },
          read_scopes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

export const executionEventsSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'profile',
    'profile_revision',
    'action_id',
    'events',
    'oldest_sequence',
    'next_sequence',
    'history_truncated',
  ],
  properties: {
    profile: {
      type: 'string',
      enum: [
        'erc3009-relayer-v1',
        'erc3009-executor-v1',
        'approved-evm-executor-v1',
      ],
    },
    profile_revision: { type: 'string', enum: ['1'] },
    action_id: uuidSchema,
    oldest_sequence: { type: 'integer', minimum: 0 },
    next_sequence: { type: 'integer', minimum: 0 },
    history_truncated: {
      type: 'boolean',
      description:
        'An explicit cursor gap requires resynchronization through verified execution status. The bounded feed is not a complete historical chain ledger.',
    },
    events: {
      type: 'array',
      maxItems: 64,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'specversion',
          'id',
          'source',
          'type',
          'subject',
          'time',
          'datacontenttype',
          'sequence',
          'data',
        ],
        properties: {
          specversion: { type: 'string', enum: ['1.0'] },
          id: uuidSchema,
          source: { type: 'string', format: 'uri' },
          type: {
            type: 'string',
            enum: ['com.moovha.wallet-provider.execution.observed.v1'],
          },
          subject: uuidSchema,
          time: { type: 'string', format: 'date-time' },
          datacontenttype: { type: 'string', enum: ['application/json'] },
          sequence: { type: 'integer', minimum: 1 },
          data: executionReceiptSchema,
        },
      },
    },
  },
};
