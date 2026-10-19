const text = { type: 'string' };
const quantity = {
  type: 'string',
  pattern: '^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$',
};
const address = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' };
const capability = {
  type: 'object',
  maxProperties: 16,
  additionalProperties: {
    type: 'object',
    properties: { optional: { type: 'boolean' } },
    additionalProperties: true,
  },
};
export const sendCallsParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'chainId', 'atomicRequired', 'calls'],
  properties: {
    version: { type: 'string', enum: ['2.0.0'] },
    id: { type: 'string', minLength: 1, maxLength: 8194 },
    from: address,
    chainId: quantity,
    atomicRequired: { type: 'boolean' },
    capabilities: capability,
    calls: {
      type: 'array',
      minItems: 1,
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          to: address,
          value: quantity,
          data: { type: 'string', pattern: '^0x(?:[0-9a-fA-F]{2})*$' },
          capabilities: capability,
        },
      },
    },
  },
};
const correlationId = {
  anyOf: [
    { type: 'string', maxLength: 256 },
    { type: 'integer' },
    { type: 'null' },
  ],
};
function envelope(method: string, params: object) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['jsonrpc', 'id', 'method', 'params'],
    properties: {
      jsonrpc: { type: 'string', enum: ['2.0'] },
      id: correlationId,
      method: { type: 'string', enum: [method] },
      params,
    },
  };
}
export const rpcRequestSchema = {
  oneOf: [
    envelope('wallet_sendCalls', {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: sendCallsParamsSchema,
    }),
    envelope('wallet_getCapabilities', {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: {
        anyOf: [address, { type: 'array', maxItems: 64, items: quantity }],
      },
    }),
    ...['wallet_getCallsStatus', 'wallet_showCallsStatus'].map((method) =>
      envelope(method, {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        items: { type: 'string', minLength: 1, maxLength: 8194 },
      }),
    ),
  ],
  description:
    'Single account-scoped JSON-RPC request. SendCallsParams uses EIP-5792 version 2.0.0. JSON-RPC batch envelopes and notifications are not accepted.',
};
export const walletCallsReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'logs',
    'status',
    'blockHash',
    'blockNumber',
    'gasUsed',
    'transactionHash',
  ],
  properties: {
    logs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['address', 'data', 'topics'],
        properties: {
          address,
          data: text,
          topics: { type: 'array', items: text },
        },
      },
    },
    status: { type: 'string', enum: ['0x0', '0x1'] },
    blockHash: text,
    blockNumber: quantity,
    gasUsed: quantity,
    transactionHash: text,
  },
};
export const rpcResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['jsonrpc', 'id'],
  properties: {
    jsonrpc: { type: 'string', enum: ['2.0'] },
    id: correlationId,
    result: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: text },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['version', 'id', 'chainId', 'status', 'atomic'],
          properties: {
            version: { type: 'string', enum: ['2.0.0'] },
            id: text,
            chainId: quantity,
            status: { type: 'integer', enum: [100, 200, 400, 500] },
            atomic: { type: 'boolean', enum: [true] },
            receipts: { type: 'array', items: walletCallsReceiptSchema },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            '0x14a34': {
              type: 'object',
              additionalProperties: false,
              required: ['atomic'],
              properties: {
                paymasterService: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['supported'],
                  properties: { supported: { type: 'boolean', enum: [true] } },
                },
                atomic: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['supported'] },
                  },
                },
              },
            },
            '0x2105': {
              type: 'object',
              additionalProperties: false,
              required: ['atomic'],
              properties: {
                paymasterService: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['supported'],
                  properties: { supported: { type: 'boolean', enum: [true] } },
                },
                atomic: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['supported'] },
                  },
                },
              },
            },
          },
        },
      ],
    },
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message'],
      properties: { code: { type: 'integer' }, message: text },
    },
  },
};
