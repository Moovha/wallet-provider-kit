export const uuidSchema = {
  type: 'string',
  pattern:
    '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
};
export const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  maxProperties: 0,
};
export const problemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'code', 'request_id'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    code: { type: 'string' },
    request_id: { type: 'string' },
    outcome: {
      type: 'string',
      enum: ['not_dispatched', 'rejected', 'unknown'],
    },
  },
};
export const accountSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['account_id', 'address'],
  properties: {
    account_id: uuidSchema,
    address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
  },
};
export const signatureSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['signature'],
  properties: {
    signature: { type: 'string', pattern: '^0x[0-9a-fA-F]{130}$' },
  },
};
