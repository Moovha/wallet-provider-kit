import { uuidSchema } from '../service/schemas.js';
const address = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' };
const uint = { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' };
const hash = { type: 'string', pattern: '^0x[0-9a-f]{64}$' };
const route = { type: 'string', pattern: '^[A-Za-z0-9._-]{1,64}$' };
function object(properties: Record<string, unknown>, optional: string[] = []) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties).filter((key) => !optional.includes(key)),
    properties,
  };
}
const pin = {
  ...object({ address, codeHash: hash }),
  properties: {
    address,
    codeHash: hash,
    implementation: object({ address, codeHash: hash }),
  },
};
const call = object({
  to: address,
  value: uint,
  data: { type: 'string', pattern: '^0x(?:[0-9a-f]{2}){0,4096}$' },
});
export const approvedCallInputSchema = {
  oneOf: [
    object({
      account_id: uuidSchema,
      kind: { type: 'string', enum: ['contract-call'] },
      calls: { type: 'array', minItems: 1, maxItems: 16, items: call },
    }),
    object({
      account_id: uuidSchema,
      kind: { type: 'string', enum: ['swap'] },
      route,
      amount_in: uint,
      minimum_out: uint,
      deadline: uint,
    }),
    object({
      account_id: uuidSchema,
      kind: { type: 'string', enum: ['vault-deposit'] },
      route,
      assets: uint,
      minimum_shares: uint,
    }),
  ],
};
export const approvedCallIntentSchema = object({
  version: { type: 'string', enum: ['1'] },
  mechanism: { type: 'string', enum: ['safe-1.4.1'] },
  input: approvedCallInputSchema,
  account: {
    ...object({
      address,
      codeHash: hash,
      accountId: uuidSchema,
      singleton: pin,
    }),
    properties: { ...pin.properties, accountId: uuidSchema, singleton: pin },
  },
  multiSend: pin,
  calls: { type: 'array', minItems: 1, maxItems: 16, items: call },
  contracts: { type: 'array', maxItems: 32, items: pin },
  effects: {
    type: 'array',
    maxItems: 16,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['token', 'from', 'to', 'minimum'],
      properties: {
        token: address,
        from: { type: 'string' },
        to: { type: 'string' },
        minimum: uint,
        maximum: uint,
      },
    },
  },
  nonce: uint,
});

approvedCallIntentSchema.properties = {
  ...approvedCallIntentSchema.properties,
  assetBudgets: {
    type: 'array',
    minItems: 1,
    maxItems: 16,
    items: object({ token: address, units: uint, maximum: uint }),
  },
  nativeRecipients: {
    type: 'array',
    minItems: 1,
    maxItems: 16,
    items: address,
  },
  adapterInput: {
    oneOf: [
      approvedCallInputSchema.oneOf[1],
      approvedCallInputSchema.oneOf[2],
      object({
        kind: { type: 'string', enum: ['token-transfer'] },
        token: address,
        recipient: address,
        amount: uint,
      }),
    ],
  },
};

/** SafeTx is constructed by the wallet; applications never submit this payload for signing. */
export const safePayloadSchema = object({
  primaryType: { type: 'string', enum: ['SafeTx'] },
  domain: object({
    chainId: { type: 'string', enum: ['84532', '8453'] },
    verifyingContract: address,
  }),
  types: object({
    SafeTx: {
      type: 'array',
      minItems: 10,
      maxItems: 10,
      items: object({
        name: {
          type: 'string',
          enum: [
            'to',
            'value',
            'data',
            'operation',
            'safeTxGas',
            'baseGas',
            'gasPrice',
            'gasToken',
            'refundReceiver',
            'nonce',
          ],
        },
        type: {
          type: 'string',
          enum: ['address', 'uint256', 'bytes', 'uint8'],
        },
      }),
    },
  }),
  message: object({
    to: address,
    value: uint,
    data: { type: 'string', pattern: '^0x(?:[0-9a-f]{2})*$', maxLength: 8192 },
    operation: { type: 'string', enum: ['0', '1'] },
    safeTxGas: { type: 'string', enum: ['0'] },
    baseGas: { type: 'string', enum: ['0'] },
    gasPrice: { type: 'string', enum: ['0'] },
    gasToken: {
      type: 'string',
      enum: ['0x0000000000000000000000000000000000000000'],
    },
    refundReceiver: {
      type: 'string',
      enum: ['0x0000000000000000000000000000000000000000'],
    },
    nonce: uint,
  }),
});
export const operationAdaptersSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tokenTransfers: {
      type: 'array',
      maxItems: 128,
      items: object(
        {
          token: pin,
          recipients: {
            type: 'array',
            minItems: 1,
            maxItems: 128,
            uniqueItems: true,
            items: address,
          },
          maximumAmount: uint,
          lifetimeAmount: uint,
        },
        ['lifetimeAmount'],
      ),
    },
    swaps: {
      type: 'array',
      maxItems: 128,
      items: object({
        id: route,
        router: pin,
        tokenIn: pin,
        tokenOut: pin,
        fee: { type: 'integer', minimum: 1, maximum: 999999 },
        maximumInput: uint,
      }),
    },
    vaults: {
      type: 'array',
      maxItems: 128,
      items: object({
        id: route,
        router: pin,
        vault: pin,
        asset: pin,
        maximumAssets: uint,
      }),
    },
  },
};
