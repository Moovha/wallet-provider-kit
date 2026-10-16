import { uuidSchema } from '../service/schemas.js';
const address = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' };
const integer = { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' };
export const transferReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'action_id',
    'account_id',
    'status',
    'expires_at',
    'payload_hash',
    'payload',
  ],
  properties: {
    action_id: uuidSchema,
    account_id: uuidSchema,
    status: {
      type: 'string',
      enum: ['authorizing', 'authorized', 'denied'],
    },
    expires_at: { type: 'string', format: 'date-time' },
    payload_hash: { type: 'string', pattern: '^0x[0-9a-f]{64}$' },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['domain', 'types', 'primaryType', 'message'],
      properties: {
        primaryType: { type: 'string', enum: ['TransferWithAuthorization'] },
        domain: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'version', 'chainId', 'verifyingContract'],
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            chainId: { type: 'string', enum: ['84532'] },
            verifyingContract: address,
          },
        },
        types: {
          type: 'object',
          additionalProperties: false,
          required: ['TransferWithAuthorization'],
          properties: {
            TransferWithAuthorization: {
              type: 'array',
              minItems: 6,
              maxItems: 6,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'type'],
                properties: {
                  name: {
                    type: 'string',
                    enum: [
                      'from',
                      'to',
                      'value',
                      'validAfter',
                      'validBefore',
                      'nonce',
                    ],
                  },
                  type: {
                    type: 'string',
                    enum: ['address', 'uint256', 'bytes32'],
                  },
                },
              },
            },
          },
        },
        message: {
          type: 'object',
          additionalProperties: false,
          required: [
            'from',
            'to',
            'value',
            'validAfter',
            'validBefore',
            'nonce',
          ],
          properties: {
            from: address,
            to: address,
            value: integer,
            validAfter: { type: 'string', enum: ['0'] },
            validBefore: integer,
            nonce: { type: 'string', pattern: '^0x[0-9a-f]{64}$' },
          },
        },
      },
    },
  },
};

export const transactionEventInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['event', 'chain_id', 'transaction_hash', 'observed_at'],
  properties: {
    event: {
      type: 'string',
      enum: ['submitted', 'confirmed', 'failed'],
      description:
        'Application observation only; confirmed is not provider-verified settlement.',
    },
    chain_id: { type: 'string', enum: ['eip155:84532'] },
    transaction_hash: { type: 'string', pattern: '^0x[0-9a-f]{64}$' },
    observed_at: {
      type: 'string',
      format: 'date-time',
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$',
    },
  },
};
export const transactionEventSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    ...transactionEventInputSchema.required,
    'report_id',
    'recorded_at',
    'verification',
  ],
  properties: {
    ...transactionEventInputSchema.properties,
    report_id: uuidSchema,
    recorded_at: { type: 'string', format: 'date-time' },
    verification: {
      type: 'string',
      enum: ['unverified'],
      description:
        'No chain receipt, transfer effect or finality verification is performed.',
    },
  },
};
export const transactionEventReceiptSchema = {
  ...transactionEventSchema,
  required: [...transactionEventSchema.required, 'action_id'],
  properties: { ...transactionEventSchema.properties, action_id: uuidSchema },
};
export const transactionEventsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['action_id', 'events'],
  properties: {
    action_id: uuidSchema,
    events: { type: 'array', maxItems: 32, items: transactionEventSchema },
  },
};
