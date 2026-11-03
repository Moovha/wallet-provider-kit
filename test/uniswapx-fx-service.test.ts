import { expect, it } from 'vitest';
import { serviceFixture } from './helpers/uniswapx.js';
import {
  assessSolverFx,
  validSolverPricePolicy,
  type SolverFxPolicy,
} from '../src/orders/price-policy.js';
import { baseUsdc, baseZarp } from '../src/orders/usd-zar-fx.js';
const policy: SolverFxPolicy = {
  profile: 'solver-fiat-fx-v1',
  source: 'exchangerate-api-open',
  maximumLossBps: 1000,
  cacheSeconds: 3600,
  maximumRateAgeSeconds: 129600,
};
it('signs and recovers an authorized FX-checked order without pool reads', async () => {
  const f = await serviceFixture(true, true);
  try {
    const result = await f.service.submit(f.context, f.accountId, f.quote());
    expect(result.status).toBe('open');
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(1);
    expect(f.state.poolReads).toBe(0);
    await f.restart();
    expect(
      (await f.service.submit(f.context, f.accountId, f.quote())).order_id,
    ).toBe(result.order_id);
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(1);
  } finally {
    await f.close();
  }
});
it('denies FX outages before signing or posting', async () => {
  const f = await serviceFixture(true, true);
  try {
    f.state.fxFails = true;
    await expect(
      f.service.submit(f.context, f.accountId, f.quote()),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(f.state.signs).toBe(0);
    expect(f.state.posts).toBe(0);
    expect(f.state.poolReads).toBe(0);
  } finally {
    await f.close();
  }
});
it('enforces one-unit net boundaries and cannot use another token or a wider loss allowance', async () => {
  const now = 1790000000;
  const reader = {
    get: async () => ({
      source: 'exchangerate-api-open' as const,
      numerator: '16613417',
      denominator: '1000000',
      updatedAt: now - 100,
      fetchedAt: now,
    }),
  };
  const f = await serviceFixture(true, true);
  try {
    // Obtain the same decoded review shape used by the signing boundary.
    const review = {
      tokenIn: baseZarp,
      tokenOut: baseUsdc,
      amountInUnits: '5000000000000000000',
      minimumAmountOutUnits: '270866',
      deadline: now + 60,
    } as Parameters<typeof assessSolverFx>[2];
    expect(
      (await assessSolverFx(reader, policy, review, () => now))
        .minimumRequiredOutUnits,
    ).toBe('270866');
    await expect(
      assessSolverFx(
        reader,
        policy,
        { ...review, minimumAmountOutUnits: '270865' },
        () => now,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
    await expect(
      assessSolverFx(
        reader,
        policy,
        { ...review, tokenOut: '0x4200000000000000000000000000000000000006' },
        () => now,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(
      validSolverPricePolicy({ ...policy, maximumLossBps: 1001 } as never),
    ).toBe(false);
  } finally {
    await f.close();
  }
});
