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
    smart_account: {
      type: 'object',
      additionalProperties: false,
      required: ['profile', 'chain_id', 'address', 'status'],
      properties: {
        profile: { type: 'string', const: 'safe-1.4.1' },
        chain_id: {
          type: 'string',
          enum: ['eip155:8453', 'eip155:84532', 'eip155:11155111'],
        },
        address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
        status: {
          type: 'string',
          enum: ['prepared', 'pending', 'ready', 'unknown'],
        },
      },
    },
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
export const enrollmentReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['enrollment_id', 'account_id', 'status'],
  properties: {
    enrollment_id: uuidSchema,
    account_id: uuidSchema,
    status: {
      type: 'string',
      enum: ['awaiting_identity', 'accepted', 'needs_verification', 'rejected'],
    },
  },
};
export const enrollmentChallengeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'enrollment_id',
    'account_id',
    'status',
    'nonce',
    'expires_at',
    'identity_issuer',
    'identity_client_id',
    'required_claims',
  ],
  properties: {
    ...enrollmentReceiptSchema.properties,
    nonce: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
    expires_at: { type: 'string', format: 'date-time' },
    identity_issuer: { type: 'string' },
    identity_client_id: { type: 'string' },
    required_claims: { type: 'array', items: { type: 'string' } },
  },
};
export const enrollmentIdentitySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id_token'],
  properties: {
    id_token: {
      type: 'string',
      maxLength: 32768,
      pattern: '^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$',
    },
  },
};
