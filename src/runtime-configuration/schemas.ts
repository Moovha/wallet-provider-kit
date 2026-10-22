import { obligationSchemas } from './obligations.js';
import { operationAdaptersSchema } from '../execution/call-schemas.js';
const string = { type: 'string', minLength: 1, maxLength: 256 };
const uint = { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' };
export const revisionSchema = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]{0,19})$',
};
export const applicationIdSchema = {
  type: 'string',
  pattern: '^[0-9a-f]{64}$',
};
export const runtimeConfigurationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operators'],
  properties: {
    rpcVerification: { type: 'string', enum: ['single', 'quorum'] },
    authorizeContracts: { type: 'boolean' },
    credentialKey: {
      type: 'object',
      additionalProperties: false,
      required: ['env'],
      properties: {
        env: { type: 'string', pattern: '^[A-Z][A-Z0-9_]{0,127}$' },
      },
    },
    operators: {
      type: 'array',
      minItems: 0,
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['issuer', 'clientId', 'subject'],
        properties: { issuer: string, clientId: string, subject: string },
      },
    },
  },
};
const pin = {
  type: 'object',
  additionalProperties: false,
  required: ['address', 'code_hash'],
  properties: {
    address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    code_hash: { type: 'string', pattern: '^0x[0-9a-f]{64}$' },
  },
};
export const runtimePolicySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'enabled',
    'chain_id',
    'contracts',
    'maximum_calls',
    'maximum_native_value_wei',
    'max_validity_seconds',
    'claim_requirements',
  ],
  properties: {
    action_requirements: obligationSchemas.actions,
    application_resources_hash: applicationIdSchema,
    version: { type: 'string', enum: ['1'] },
    enabled: { type: 'boolean' },
    chain_id: {
      type: 'string',
      enum: ['eip155:84532', 'eip155:8453', 'eip155:11155111'],
    },
    contracts: {
      type: 'array',
      maxItems: 32,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['address', 'code_hash', 'methods'],
        properties: {
          ...pin.properties,
          implementation: pin,
          methods: {
            type: 'array',
            minItems: 1,
            maxItems: 32,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['signature', 'maximum_value_wei'],
              properties: {
                signature: { type: 'string', minLength: 3, maxLength: 256 },
                maximum_value_wei: uint,
                user_address_parameters: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 16,
                  uniqueItems: true,
                  items: { type: 'integer', minimum: 0, maximum: 31 },
                },
              },
            },
          },
        },
      },
    },
    call_adapters: operationAdaptersSchema,
    native_transfers: {
      type: 'array',
      maxItems: 32,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['address', 'code_hash', 'maximum_value_wei'],
        properties: { ...pin.properties, maximum_value_wei: uint },
      },
    },
    maximum_calls: { type: 'integer', minimum: 1, maximum: 16 },
    maximum_native_value_wei: uint,
    max_validity_seconds: { type: 'integer', minimum: 1, maximum: 3600 },
    claim_requirements: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'allowed_values', 'max_age_seconds'],
        properties: {
          name: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
          allowed_values: {
            type: 'array',
            minItems: 1,
            maxItems: 32,
            uniqueItems: true,
            items: { type: 'string', minLength: 1, maxLength: 128 },
          },
          max_age_seconds: { type: 'integer', minimum: 1, maximum: 31536000 },
        },
      },
    },
  },
};
export const runtimeSnapshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['application_id', 'revision', 'policy_hash', 'policy'],
  properties: {
    application_id: applicationIdSchema,
    revision: revisionSchema,
    policy_hash: applicationIdSchema,
    policy: runtimePolicySchema,
  },
};
export const policyChangeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expected_revision', 'policy'],
  properties: {
    expected_revision: revisionSchema,
    policy: runtimePolicySchema,
  },
};
