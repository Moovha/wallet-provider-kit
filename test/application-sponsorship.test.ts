import { expect, it } from 'vitest';
import {
  normalizeObligation,
  sponsorshipGas,
  minimumSponsorFunding,
} from '../src/runtime-configuration/obligations.js';
const agreement = {
  chain_id: 'eip155:8453' as const,
  funding_agreement: 'Bounded application gas',
  maximum_gas_budget_wei: '20000000000000',
  account_model: 'provider-controlled-application-safe' as const,
  asset_model: 'individual-user-wallets' as const,
  gas_limits: {
    gas_limit: '750000',
    max_fee_per_gas: '10000000',
    max_priority_fee_per_gas: '1000000',
    l1_fee_reserve_wei: '1000000000000',
  },
};
it('accepts exact bounded application gas terms and exposes the required reserve', () => {
  expect(normalizeObligation('sponsorship', agreement)).toEqual(agreement);
  expect(minimumSponsorFunding(sponsorshipGas(agreement))).toBe(8500000000000n);
});
it.each([
  { gas_limit: '20999' },
  { gas_limit: '5000001' },
  { gas_limit: '0' },
  { max_fee_per_gas: '0' },
  { max_fee_per_gas: '9007199254740992' },
  { max_priority_fee_per_gas: '10000001' },
  { max_priority_fee_per_gas: '-1' },
  { l1_fee_reserve_wei: '0' },
  { l1_fee_reserve_wei: String(2n ** 256n) },
])(
  'rejects invalid sponsor limits before infrastructure creation: %j',
  (limits) => {
    expect(() =>
      normalizeObligation('sponsorship', {
        ...agreement,
        gas_limits: { ...agreement.gas_limits, ...limits },
      }),
    ).toThrow();
  },
);
it('rejects a budget below one bounded transaction reserve', () => {
  expect(() =>
    normalizeObligation('sponsorship', {
      ...agreement,
      maximum_gas_budget_wei: '8499999999999',
    }),
  ).toThrow();
});

it('requires explicit bounded account creation and sponsor concurrency for the per-user model', () => {
  const value = {
    ...agreement,
    account_model: 'provider-controlled-user-safe' as const,
  };
  expect(() => normalizeObligation('sponsorship', value)).toThrow();
  expect(
    normalizeObligation('sponsorship', {
      ...value,
      maximum_execution_accounts: 10,
      maximum_in_flight_per_sponsor: 2,
    }).account_model,
  ).toBe('provider-controlled-user-safe');
  for (const maximum_execution_accounts of [0, 100001, 1.5])
    expect(() =>
      normalizeObligation('sponsorship', {
        ...value,
        maximum_execution_accounts,
      }),
    ).toThrow();
  for (const maximum_in_flight_per_sponsor of [0, 17, 1.5])
    expect(() =>
      normalizeObligation('sponsorship', {
        ...value,
        maximum_execution_accounts: 10,
        maximum_in_flight_per_sponsor,
      }),
    ).toThrow();
  expect(() =>
    normalizeObligation('sponsorship', {
      ...agreement,
      maximum_in_flight_per_sponsor: 2,
    }),
  ).toThrow();
});
