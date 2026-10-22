import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  pendingFunding,
  type FundingReservation,
} from '../src/sponsorship/funding.js';
import { normalizeObligation } from '../src/runtime-configuration/obligations.js';
import { Safe4337SigningService } from '../src/sponsorship/signing.js';
import { fingerprint } from '../src/onboarding/policy.js';
import { fixture } from './helpers/safe-4337.js';
import type {
  UserOperationExecution,
  UserOperationObservation,
} from '../src/sponsorship/execution-types.js';

const denied = { code: 'wallet_authorization_denied' };
const proof = (): FundingReservation => ({
  balanceWei: '100',
  blockNumber: '0x10',
  checkedAt: new Date().toISOString(),
  maximumPendingWei: '100',
  maximumPendingOperations: 2,
  accountingOnly: true,
});
const observation = (
  state: UserOperationObservation['state'],
  blockNumber = '0x10',
) =>
  ({
    state,
    receipt: { blockNumber },
    observedAt: new Date().toISOString(),
    scanNextBlock: '0x11',
  }) as UserOperationObservation;
it('holds unknown and unfinalized fee costs and only releases outcomes covered by the funding snapshot', () => {
  expect(() =>
    pendingFunding(
      [
        { costWei: '60' },
        { costWei: '60', observation: observation('included') },
      ],
      proof(),
    ),
  ).toThrow();
  expect(
    pendingFunding(
      [
        { costWei: '60', observation: observation('finalized') },
        { costWei: '60' },
      ],
      proof(),
    ),
  ).toBe(60n);
  expect(() =>
    pendingFunding(
      [
        { costWei: '60', observation: observation('finalized', '0x11') },
        { costWei: '60' },
      ],
      proof(),
    ),
  ).toThrow();
  expect(() =>
    pendingFunding(
      [
        { costWei: '60', observation: observation('expired') },
        { costWei: '60' },
      ],
      proof(),
    ),
  ).toThrow();
  const expired = {
    ...observation('expired'),
    expiry: {
      validUntil: '1',
      finalizedBlock: '0x10',
      blockHash: '0x' + '1'.repeat(64),
      blockTimestamp: '2',
    },
  };
  expect(
    pendingFunding(
      [{ costWei: '60', observation: expired }, { costWei: '60' }],
      proof(),
    ),
  ).toBe(60n);
});
it('enforces current balances, pending-cost and operation ceilings with fresh observations', () => {
  for (const change of [
    { balanceWei: '50' },
    { maximumPendingWei: '50' },
    { checkedAt: new Date(Date.now() - 16000).toISOString() },
    { maximumPendingOperations: 0 },
    { blockNumber: 'bad' },
  ])
    expect(() =>
      pendingFunding([{ costWei: '60' }], { ...proof(), ...change }),
    ).toThrow();
  expect(() =>
    pendingFunding([{ costWei: '1' }, { costWei: '1' }], proof(), '1'),
  ).toThrow();
});
it('accepts balance-funded terms without a total budget only with explicit fee ceilings', () => {
  const value = {
    chain_id: 'eip155:84532' as const,
    funding_agreement: 'Offline fee agreement',
    funding_mode: 'balance' as const,
    maximum_transaction_fee_wei: '10',
    maximum_pending_fees_wei: '20',
    maximum_execution_accounts: 10,
    account_model: 'provider-controlled-user-safe' as const,
    asset_model: 'individual-user-wallets' as const,
  };
  expect(normalizeObligation('sponsorship', value)).toEqual(value);
  for (const change of [
    { funding_mode: undefined },
    { maximum_transaction_fee_wei: undefined },
    { maximum_pending_fees_wei: '9' },
    { maximum_gas_budget_wei: '9' },
  ])
    expect(() =>
      normalizeObligation('sponsorship', { ...value, ...change }),
    ).toThrow();
  expect(
    normalizeObligation('sponsorship', {
      ...value,
      maximum_gas_budget_wei: '100',
    }).maximum_gas_budget_wei,
  ).toBe('100');
});
async function funded(lifetime?: string, pendingOperations = 2) {
  const f = await fixture((config) => {
    config.sponsors = [
      {
        clientId: 'application',
        ...(lifetime ? { lifetimeBudgetWei: lifetime } : {}),
        funding: {
          maximumOperationCostWei: '5000000',
          maximumPendingWei: '10000000',
          maximumPendingOperations: pendingOperations,
        },
      },
    ];
  });
  let balance = '5000000';
  const service = new Safe4337SigningService(
    f.actions,
    f.db,
    f.config,
    {
      backend: f.backend,
      authorization: async () => 'Bearer offline-fixture',
      authorizeSponsorship: async (_context, terms) => ({
        termsHash: fingerprint(terms),
        consentReference: 'safe4337-consent',
        funding: {
          balanceWei: balance,
          blockNumber: '0x10',
          checkedAt: new Date().toISOString(),
        },
      }),
    },
    f.request,
  );
  const second = () =>
    f.actions.requestCalls(
      { ...f.context, idempotencyKey: randomUUID() },
      f.input,
      async () => '1',
    );
  const expire = async (id: string) =>
    f.db.onboardingStore.transaction((state) => {
      (state.userOperationExecutions ??= {})[id] = {
        observation: {
          state: 'expired',
          expiry: {
            validUntil: '1',
            finalizedBlock: '0x10',
            blockHash: '0x' + '1'.repeat(64),
            blockTimestamp: '2',
          },
          observedAt: new Date().toISOString(),
          scanNextBlock: '0x11',
        },
      } as UserOperationExecution;
    });
  return {
    f,
    service,
    second,
    expire,
    setBalance: (value: string) => {
      balance = value;
    },
  };
}
it('uses durable pending reservations rather than a mandatory lifetime stop and rechecks funding before sponsorship', async () => {
  const t = await funded();
  const first = await t.f.source();
  await t.service.admit(t.f.context, first.action_id, t.f.operation);
  t.setBalance('0');
  await expect(
    t.service.sponsor(t.f.context, first.action_id),
  ).rejects.toMatchObject(denied);
  expect(t.f.state.posts).toBe(0);
  t.setBalance('5000000');
  const next = await t.second();
  t.f.state.nonce = 1;
  const operation = { ...t.f.operation, nonce: '0x1' };
  await expect(
    t.service.admit(t.f.context, next.action_id, operation),
  ).rejects.toMatchObject(denied);
  await t.expire(first.action_id);
  await t.service.admit(t.f.context, next.action_id, operation);
  const record = t.f.db.sponsorship.load(next.action_id)!;
  expect((await t.f.db.budget(record.gasBudgetId))?.reserved).toBe('9640020');
});
it('retains an explicitly chosen cumulative budget after pending costs settle', async () => {
  const t = await funded('5000000');
  const first = await t.f.source();
  await t.service.admit(t.f.context, first.action_id, t.f.operation);
  await t.expire(first.action_id);
  const next = await t.second();
  t.f.state.nonce = 1;
  await expect(
    t.service.admit(t.f.context, next.action_id, {
      ...t.f.operation,
      nonce: '0x1',
    }),
  ).rejects.toMatchObject(denied);
});
it('enforces the durable pending-operation limit even with enough ETH for another operation', async () => {
  const t = await funded(undefined, 1);
  t.setBalance('10000000');
  const first = await t.f.source();
  await t.service.admit(t.f.context, first.action_id, t.f.operation);
  const next = await t.second();
  t.f.state.nonce = 1;
  await expect(
    t.service.admit(t.f.context, next.action_id, {
      ...t.f.operation,
      nonce: '0x1',
    }),
  ).rejects.toMatchObject(denied);
  expect(t.f.db.sponsorship.load(next.action_id)).toBeNull();
});
