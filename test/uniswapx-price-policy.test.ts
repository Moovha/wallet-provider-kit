import { describe, expect, it } from 'vitest';
import {
  assessSolverTwap,
  meanTickBounds,
  tickPriceBounds,
  type OrderRpc,
} from '../src/orders/price-policy.js';
import { reviewUniswapXV3Order } from '../src/orders/uniswapx-v3.js';
import {
  blockHash,
  code,
  orderFixture,
  poolInterface,
} from './helpers/uniswapx.js';

describe('conservative integer solver benchmark', () => {
  for (const tick of [-887272, -10001, -1, 0, 1, 10001, 887272])
    it('bounds exact rational price at tick ' + tick, () => {
      const bound = tickPriceBounds(tick),
        exponent = BigInt(Math.abs(tick));
      const numerator = (tick < 0 ? 10000n : 10001n) ** exponent;
      const denominator = (tick < 0 ? 10001n : 10000n) ** exponent;
      expect(bound.lower * denominator <= numerator * bound.denominator).toBe(
        true,
      );
      expect(bound.upper * denominator >= numerator * bound.denominator).toBe(
        true,
      );
      expect(bound.lower > 0n).toBe(true);
    });
  it('rounds negative and positive cumulative ticks outward', () => {
    expect(meanTickBounds(-1801n, 1800n)).toEqual({ floor: -2, ceil: -1 });
    expect(meanTickBounds(1801n, 1800n)).toEqual({ floor: 1, ceil: 2 });
    expect(() => meanTickBounds(1n, 0n)).toThrow();
    expect(() => tickPriceBounds(887273)).toThrow();
  });
  function fixture() {
    const f = orderFixture();
    const review = reviewUniswapXV3Order(f.encode(), f.safe, f.policy);
    const state = {
      liquidity: 1n,
      spot: 1n << 96n,
      ticks: 0n,
      code,
      reverse: false,
      unavailable: false,
    };
    const seen: unknown[][] = [];
    const rpc: OrderRpc = {
      async call(method, params) {
        seen.push(params);
        if (method === 'eth_getCode') return state.code;
        const request = params[0] as { data: string };
        const fn = poolInterface.getFunction(request.data.slice(0, 10))!.name;
        if (state.unavailable && fn === 'observe')
          throw new Error('insufficient history');
        const values: Record<string, unknown[]> = {
          token0: [state.reverse ? review.tokenOut : review.tokenIn],
          token1: [state.reverse ? review.tokenIn : review.tokenOut],
          liquidity: [state.liquidity],
          slot0: [state.spot],
          observe: [
            [0, state.ticks],
            [0, 0],
          ],
        };
        return poolInterface.encodeFunctionResult(fn, values[fn]);
      },
    };
    const snapshot = {
      number: 100,
      hash: blockHash,
      timestamp: Math.floor(Date.now() / 1000),
    };
    return { ...f, review, state, rpc, snapshot, seen };
  }
  it('uses net output including the fee, same-block pins and both token directions', async () => {
    const f = fixture();
    expect(
      (
        await assessSolverTwap(
          f.rpc,
          f.policy.pricePolicy,
          f.review,
          f.snapshot,
        )
      ).minimumRequiredOutUnits,
    ).toBe('980000');
    expect(
      f.seen.every(
        (params) =>
          JSON.stringify(params.at(-1)) ===
          JSON.stringify({ blockHash, requireCanonical: true }),
      ),
    ).toBe(true);
    f.state.reverse = true;
    expect(
      (
        await assessSolverTwap(
          f.rpc,
          f.policy.pricePolicy,
          f.review,
          f.snapshot,
        )
      ).minimumRequiredOutUnits,
    ).toBe('980000');
    await expect(
      assessSolverTwap(
        f.rpc,
        f.policy.pricePolicy,
        { ...f.review, minimumAmountOutUnits: '979999' },
        f.snapshot,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
  });
  for (const failure of [
    'stale',
    'future',
    'inactive',
    'code mismatch',
    'spot manipulation',
    'missing history',
  ])
    it('holds ' + failure, async () => {
      const f = fixture();
      if (failure === 'stale') f.snapshot.timestamp -= 31;
      if (failure === 'future') f.snapshot.timestamp += 60;
      if (failure === 'inactive') f.state.liquidity = 0n;
      if (failure === 'code mismatch') f.state.code = '0x6001';
      if (failure === 'spot manipulation')
        f.state.spot = (f.state.spot * 102n) / 100n;
      if (failure === 'missing history') f.state.unavailable = true;
      await expect(
        assessSolverTwap(f.rpc, f.policy.pricePolicy, f.review, f.snapshot),
      ).rejects.toThrow('wallet_authorization_denied');
    });
});
