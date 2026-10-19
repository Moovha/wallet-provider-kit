import { Ajv } from 'ajv';
import { invalid } from '../onboarding/policy.js';

/** Application declarations require provider acceptance; they never grant spending authority. */
export interface ApplicationObligations {
  actions: {
    name: string;
    description: string;
    fields: {
      name: string;
      required: boolean;
      allowed_values: string[];
    }[];
  }[];
  services: {
    id: string;
    kind: 'rpc-verification' | 'rpc-submission' | 'other';
    vendor: string;
    credential_reference: string;
    billing_owner: 'application';
  }[];
  sponsorship: {
    chain_id: 'eip155:8453' | 'eip155:84532';
    funding_agreement: string;
    maximum_gas_budget_wei: string;
    account_model: 'provider-controlled-application-safe';
    asset_model: 'individual-user-wallets';
  };
}
export type ObligationKind = keyof ApplicationObligations;
export interface ObligationRecord {
  application_id: string;
  kind: ObligationKind;
  revision: string;
  value: ApplicationObligations[ObligationKind];
  submitted_at: string;
  decision: 'pending' | 'accepted' | 'rejected';
  decision_revision: string;
  decided_at?: string;
}
export interface ObligationRegistry {
  records: Record<string, ObligationRecord>;
  receipts: Record<string, { hash: string; record: ObligationRecord }>;
}
const identifier = {
  type: 'string',
  pattern: '^[a-z][a-z0-9_-]{0,63}$',
};
const boundedText = { type: 'string', minLength: 1, maxLength: 256 };
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
export const obligationSchemas = {
  actions: {
    type: 'array',
    maxItems: 64,
    items: object({
      name: identifier,
      description: boundedText,
      fields: {
        type: 'array',
        maxItems: 32,
        items: object({
          name: identifier,
          required: { type: 'boolean' },
          allowed_values: {
            type: 'array',
            minItems: 1,
            maxItems: 64,
            uniqueItems: true,
            items: { type: 'string', minLength: 1, maxLength: 128 },
          },
        }),
      },
    }),
  },
  services: {
    type: 'array',
    maxItems: 32,
    items: object({
      id: identifier,
      kind: {
        type: 'string',
        enum: ['rpc-verification', 'rpc-submission', 'other'],
      },
      vendor: identifier,
      credential_reference: {
        type: 'string',
        pattern: '^[a-zA-Z0-9_-]{1,128}$',
        description:
          'Opaque application-local secret-store reference. Never a credential, URL, environment-variable lookup or authority to read another application’s secret. Runtime resolution is not enabled by registration.',
      },
      billing_owner: { type: 'string', enum: ['application'] },
    }),
  },
  sponsorship: object({
    chain_id: { type: 'string', enum: ['eip155:8453', 'eip155:84532'] },
    funding_agreement: boundedText,
    maximum_gas_budget_wei: {
      type: 'string',
      pattern: '^[1-9][0-9]{0,77}$',
    },
    account_model: {
      type: 'string',
      enum: ['provider-controlled-application-safe'],
    },
    asset_model: { type: 'string', enum: ['individual-user-wallets'] },
  }),
} as const;
const ajv = new Ajv({ strict: true });
const validators = Object.fromEntries(
  Object.entries(obligationSchemas).map(([kind, schema]) => [
    kind,
    ajv.compile(schema),
  ]),
);
export function normalizeObligation<K extends ObligationKind>(
  kind: K,
  value: ApplicationObligations[K],
): ApplicationObligations[K] {
  if (
    !Object.hasOwn(validators, kind) ||
    !validators[kind](value) ||
    Buffer.byteLength(JSON.stringify(value)) > 24576
  )
    invalid();
  const result = structuredClone(value);
  const unique = (values: string[]) => {
    if (
      new Set(values).size !== values.length ||
      values.some((v) => ['constructor', 'prototype', '__proto__'].includes(v))
    )
      invalid();
  };
  if (kind === 'actions') {
    const actions = result as ApplicationObligations['actions'];
    unique(actions.map((action) => action.name));
    for (const action of actions) {
      unique(action.fields.map((field) => field.name));
      action.fields.sort((a, b) => a.name.localeCompare(b.name, 'en'));
      for (const field of action.fields) field.allowed_values.sort();
    }
    actions.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  } else if (kind === 'services') {
    const services = result as ApplicationObligations['services'];
    unique(services.map((service) => service.id));
    services.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  } else if (
    BigInt(
      (result as ApplicationObligations['sponsorship']).maximum_gas_budget_wei,
    ) >=
    2n ** 256n
  )
    invalid();
  return result;
}
