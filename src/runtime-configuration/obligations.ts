import { Ajv } from 'ajv';
import {
  defaultSponsorGas,
  maximumSponsorGasLimit,
} from '../execution/defaults.js';
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
    kind: 'rpc-verification' | 'rpc-submission' | 'rpc-observation' | 'other';
    vendor: string;
    credential_reference: string;
    billing_owner: 'application';
  }[];
  sponsorship: {
    chain_id: 'eip155:8453' | 'eip155:84532' | 'eip155:1' | 'eip155:11155111';
    funding_agreement: string;
    maximum_gas_budget_wei?: string;
    funding_mode?: 'balance';
    maximum_transaction_fee_wei?: string;
    maximum_pending_fees_wei?: string;
    gas_limits?: {
      gas_limit: string;
      max_fee_per_gas: string;
      max_priority_fee_per_gas: string;
      l1_fee_reserve_wei: string;
    };
    account_model: 'provider-controlled-user-safe';
    maximum_execution_accounts?: number;
    maximum_in_flight_per_sponsor?: number;
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
const sponsorshipProperties = {
  chain_id: {
    type: 'string',
    enum: ['eip155:8453', 'eip155:84532', 'eip155:1', 'eip155:11155111'],
  },
  funding_agreement: boundedText,
  maximum_gas_budget_wei: {
    description:
      'Optional cumulative sponsorship allowance in balance mode; required for legacy agreements. Additional ETH does not raise a configured allowance.',
    type: 'string',
    pattern: '^[1-9][0-9]{0,77}$',
  },
  account_model: {
    type: 'string',
    enum: ['provider-controlled-user-safe'],
  },
  asset_model: { type: 'string', enum: ['individual-user-wallets'] },
};
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
        enum: [
          'rpc-verification',
          'rpc-submission',
          'rpc-observation',
          'other',
        ],
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
  sponsorship: {
    ...object(sponsorshipProperties),
    required: Object.keys(sponsorshipProperties).filter(
      (key) => key !== 'maximum_gas_budget_wei',
    ),
    anyOf: [
      {
        required: [
          'funding_mode',
          'maximum_transaction_fee_wei',
          'maximum_pending_fees_wei',
        ],
        properties: {
          funding_mode: { const: 'balance' },
          maximum_transaction_fee_wei: {},
          maximum_pending_fees_wei: {},
        },
      },
      {
        required: ['maximum_gas_budget_wei'],
        properties: { maximum_gas_budget_wei: {} },
        not: { required: ['funding_mode'], properties: { funding_mode: {} } },
      },
    ],
    properties: {
      ...sponsorshipProperties,
      funding_mode: {
        type: 'string',
        enum: ['balance'],
        description:
          'Use current application funding with durable pending-cost reservations. A total budget remains optional; transaction and pending-fee ceilings are required.',
      },
      maximum_transaction_fee_wei: {
        description:
          'Maximum authorized network fee for one wallet operation, including its verification and fee reserve.',
        type: 'string',
        pattern: '^[1-9][0-9]{0,77}$',
      },
      maximum_pending_fees_wei: {
        description:
          'Maximum aggregate fee reservation for wallet operations without a verified final outcome. Unknown and unfinalized outcomes retain their reservations.',
        type: 'string',
        pattern: '^[1-9][0-9]{0,77}$',
      },
      maximum_execution_accounts: {
        type: 'integer',
        minimum: 1,
        maximum: 100000,
      },
      maximum_in_flight_per_sponsor: {
        type: 'integer',
        minimum: 1,
        maximum: 16,
      },
      gas_limits: object(
        Object.fromEntries(
          [
            'gas_limit',
            'max_fee_per_gas',
            'max_priority_fee_per_gas',
            'l1_fee_reserve_wei',
          ].map((name) => [
            name,
            { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' },
          ]),
        ),
      ),
    },
  },
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
  } else {
    const sponsorship = result as ApplicationObligations['sponsorship'];
    const gas = sponsorshipGas(sponsorship);
    if (
      sponsorship.account_model === 'provider-controlled-user-safe' &&
      sponsorship.maximum_execution_accounts === undefined
    )
      invalid();
    if (
      (sponsorship.maximum_gas_budget_wei !== undefined &&
        BigInt(sponsorship.maximum_gas_budget_wei) >= 2n ** 256n) ||
      (sponsorship.funding_mode === 'balance' &&
        (!sponsorship.maximum_transaction_fee_wei ||
          !sponsorship.maximum_pending_fees_wei ||
          BigInt(sponsorship.maximum_transaction_fee_wei) >
            BigInt(sponsorship.maximum_pending_fees_wei) ||
          BigInt(sponsorship.maximum_pending_fees_wei) >= 2n ** 256n ||
          (sponsorship.maximum_gas_budget_wei !== undefined &&
            BigInt(sponsorship.maximum_transaction_fee_wei) >
              BigInt(sponsorship.maximum_gas_budget_wei)))) ||
      BigInt(gas.gasLimit) < 21000n ||
      BigInt(gas.gasLimit) > maximumSponsorGasLimit() ||
      BigInt(gas.maxFeePerGas) === 0n ||
      BigInt(gas.maxPriorityFeePerGas) > BigInt(gas.maxFeePerGas) ||
      [gas.maxFeePerGas, gas.maxPriorityFeePerGas].some(
        (value) => BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER),
      ) ||
      (BigInt(gas.l1FeeReserveWei) === 0n &&
        sponsorship.chain_id !== 'eip155:11155111' &&
        sponsorship.chain_id !== 'eip155:1') ||
      BigInt(gas.l1FeeReserveWei) >= 2n ** 256n ||
      (sponsorship.gas_limits !== undefined &&
        sponsorship.maximum_gas_budget_wei !== undefined &&
        BigInt(sponsorship.maximum_gas_budget_wei) < minimumSponsorFunding(gas))
    )
      invalid();
  }
  return result;
}
export function sponsorshipGas(value: ApplicationObligations['sponsorship']) {
  const limits = value.gas_limits;
  return limits
    ? {
        gasLimit: limits.gas_limit,
        maxFeePerGas: limits.max_fee_per_gas,
        maxPriorityFeePerGas: limits.max_priority_fee_per_gas,
        l1FeeReserveWei: limits.l1_fee_reserve_wei,
      }
    : {
        gasLimit: defaultSponsorGas.gasLimit,
        maxFeePerGas: defaultSponsorGas.maxFeePerGas,
        maxPriorityFeePerGas: defaultSponsorGas.maxPriorityFeePerGas,
        l1FeeReserveWei:
          value.chain_id === 'eip155:11155111' || value.chain_id === 'eip155:1'
            ? '0'
            : defaultSponsorGas.l1FeeReserveWei,
      };
}
export function minimumSponsorFunding(gas: ReturnType<typeof sponsorshipGas>) {
  return (
    BigInt(gas.gasLimit) * BigInt(gas.maxFeePerGas) +
    BigInt(gas.l1FeeReserveWei)
  );
}
