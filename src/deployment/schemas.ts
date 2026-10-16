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
