import {
  fiatMinimumOutput,
  fiatPairDirection,
  validUsdZarSnapshot,
  usdZarAttribution,
  type UsdZarFxReader,
} from './usd-zar-fx.js';
import { Interface, keccak256 } from 'ethers';
import { WalletProviderError } from '../domain/signing.js';
import type { UniswapXOrderReview } from './uniswapx-v3.js';
export interface SolverTwapPolicy {
  profile: 'solver-twap-benchmark-v1';
  pool: { address: string; codeHash: string };
  lookbackSeconds: 1800;
  maximumLossBps: 200;
  maximumSpotDivergenceBps: 100;
}
export interface OrderSnapshot {
  number: number;
  hash: string;
  timestamp: number;
}
export interface OrderRpc {
  call(method: string, params: unknown[]): Promise<unknown>;
}
const pool = new Interface([
  'function token0() view returns(address)',
  'function token1() view returns(address)',
  'function liquidity() view returns(uint128)',
  'function slot0() view returns(uint160)',
  'function observe(uint32[]) view returns(int56[],uint160[])',
]);
const scale = 1n << 320n;
const ceil = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator - 1n) / denominator;
/** Interval exponentiation of the exact rational 1.0001. Every rounding step
 * widens the interval. Financial checks use its upper bound, never floats. */
export function tickPriceBounds(tick: number): {
  lower: bigint;
  upper: bigint;
  denominator: bigint;
} {
  if (!Number.isInteger(tick) || Math.abs(tick) > 887272)
    throw new Error('invalid_tick');
  let exponent = Math.abs(tick),
    lower = scale,
    upper = scale;
  const numerator = tick < 0 ? 10000n : 10001n,
    denominator = tick < 0 ? 10001n : 10000n;
  let factorLower = (numerator * scale) / denominator,
    factorUpper = ceil(numerator * scale, denominator);
  while (exponent > 0) {
    if (exponent % 2 === 1) {
      lower = (lower * factorLower) / scale;
      upper = ceil(upper * factorUpper, scale);
    }
    exponent = Math.floor(exponent / 2);
    if (exponent > 0) {
      factorLower = (factorLower * factorLower) / scale;
      factorUpper = ceil(factorUpper * factorUpper, scale);
    }
  }
  return { lower, upper, denominator: scale };
}
export function meanTickBounds(
  delta: bigint,
  seconds: bigint,
): { floor: number; ceil: number } {
  if (seconds <= 0n) throw new Error('invalid_window');
  const quotient = delta / seconds,
    remainder = delta % seconds;
  const floor = Number(quotient - (remainder < 0n ? 1n : 0n));
  const upper = Number(quotient + (remainder > 0n ? 1n : 0n));
  if (
    !Number.isSafeInteger(floor) ||
    Math.abs(floor) > 887272 ||
    Math.abs(upper) > 887272
  )
    throw new Error('invalid_tick');
  return { floor, ceil: upper };
}
/** A bounded canary benchmark, not a fiat peg oracle or the solver's pool impact.
 * The same canonical block supplies code, liquidity, spot and a 30-minute TWAP. */
export async function assessSolverTwap(
  rpc: OrderRpc,
  policy: SolverPricePolicy,
  review: UniswapXOrderReview,
  snapshot: OrderSnapshot,
  now = Math.floor(Date.now() / 1000),
) {
  try {
    if (
      policy.profile !== 'solver-twap-benchmark-v1' ||
      policy.lookbackSeconds !== 1800 ||
      policy.maximumLossBps !== 200 ||
      policy.maximumSpotDivergenceBps !== 100 ||
      snapshot.timestamp > now ||
      snapshot.timestamp < now - 30 ||
      !/^0x[a-fA-F0-9]{64}$/.test(snapshot.hash) ||
      !Number.isSafeInteger(snapshot.number) ||
      snapshot.number < 0
    )
      throw new Error();
    const block = { blockHash: snapshot.hash, requireCanonical: true };
    const code = String(
      await rpc.call('eth_getCode', [policy.pool.address, block]),
    );
    if (keccak256(code) !== policy.pool.codeHash) throw new Error();
    const call = async (method: string, args: unknown[] = []) =>
      pool.decodeFunctionResult(
        method,
        String(
          await rpc.call('eth_call', [
            {
              to: policy.pool.address,
              data: pool.encodeFunctionData(method, args),
            },
            block,
          ]),
        ),
      );
    const [token0, token1, liquidity, slot, observed] = await Promise.all([
      call('token0'),
      call('token1'),
      call('liquidity'),
      call('slot0'),
      call('observe', [[1800, 0]]),
    ]);
    const forward =
      String(token0[0]).toLowerCase() === review.tokenIn.toLowerCase() &&
      String(token1[0]).toLowerCase() === review.tokenOut.toLowerCase();
    const reverse =
      String(token1[0]).toLowerCase() === review.tokenIn.toLowerCase() &&
      String(token0[0]).toLowerCase() === review.tokenOut.toLowerCase();
    if (
      (!forward && !reverse) ||
      liquidity[0] <= 0n ||
      slot[0] <= 0n ||
      observed[0].length !== 2
    )
      throw new Error();
    const ticks = meanTickBounds(
      BigInt(observed[0][1]) - BigInt(observed[0][0]),
      1800n,
    );
    const twap = tickPriceBounds(forward ? ticks.ceil : ticks.floor);
    const rates = forward
      ? [
          { numerator: slot[0] ** 2n, denominator: 1n << 192n },
          { numerator: twap.upper, denominator: twap.denominator },
        ]
      : [
          { numerator: 1n << 192n, denominator: slot[0] ** 2n },
          { numerator: twap.denominator, denominator: twap.lower },
        ];
    rates.sort((a, b) =>
      a.numerator * b.denominator === b.numerator * a.denominator
        ? 0
        : a.numerator * b.denominator > b.numerator * a.denominator
          ? -1
          : 1,
    );
    const high = rates[0].numerator * rates[1].denominator,
      low = rates[1].numerator * rates[0].denominator;
    if ((high - low) * 10000n > high * 100n) throw new Error();
    const minimum = ceil(
      BigInt(review.amountInUnits) * rates[0].numerator * 9800n,
      rates[0].denominator * 10000n,
    );
    if (BigInt(review.minimumAmountOutUnits) < minimum) throw new Error();
    return {
      profile: policy.profile,
      snapshot,
      lookbackSeconds: 1800,
      maximumLossBps: 200,
      twapTicks: ticks,
      minimumRequiredOutUnits: minimum.toString(),
      minimumAmountOutUnits: review.minimumAmountOutUnits,
    };
  } catch {
    throw new WalletProviderError('wallet_authorization_denied');
  }
}

export interface SolverFxPolicy {
  profile: 'solver-fiat-fx-v1';
  source: 'exchangerate-api-open';
  maximumLossBps: 1000;
  cacheSeconds: 3600;
  maximumRateAgeSeconds: 129600;
}
export type SolverPricePolicy = SolverTwapPolicy | SolverFxPolicy;
export function validSolverPricePolicy(policy: SolverPricePolicy): boolean {
  if (!policy) return false;
  if (policy.profile === 'solver-fiat-fx-v1')
    return (
      policy.source === 'exchangerate-api-open' &&
      policy.maximumLossBps === 1000 &&
      policy.cacheSeconds === 3600 &&
      policy.maximumRateAgeSeconds === 129600 &&
      Object.keys(policy).length === 5
    );
  return (
    policy.profile === 'solver-twap-benchmark-v1' &&
    policy.lookbackSeconds === 1800 &&
    policy.maximumLossBps === 200 &&
    policy.maximumSpotDivergenceBps === 100 &&
    /^0x[a-fA-F0-9]{40}$/.test(policy.pool?.address) &&
    BigInt(policy.pool.address) !== 0n &&
    /^0x[a-f0-9]{64}$/.test(policy.pool.codeHash)
  );
}
/** Recomputed by the signer from the full input and the user's signed net floor.
 * USD/ZAR is indicative fiat FX; nominal stablecoin pegs are explicit policy assumptions. */
export async function assessSolverFx(
  reader: Pick<UsdZarFxReader, 'get'>,
  policy: SolverFxPolicy,
  review: UniswapXOrderReview,
  now: () => number = () => Math.floor(Date.now() / 1000),
) {
  try {
    if (!validSolverPricePolicy(policy)) throw new Error();
    const direction = fiatPairDirection(review.tokenIn, review.tokenOut);
    const rate = await reader.get();
    if (
      !rate ||
      !validUsdZarSnapshot(rate, now()) ||
      !Number.isSafeInteger(review.deadline) ||
      review.deadline <= now() ||
      !/^[1-9][0-9]{0,38}$/.test(review.minimumAmountOutUnits)
    )
      throw new Error();
    const amounts = fiatMinimumOutput(
      review.amountInUnits,
      direction,
      rate,
      1000,
    );
    if (
      BigInt(review.minimumAmountOutUnits) <
      BigInt(amounts.minimumRequiredOutUnits)
    )
      throw new Error();
    return {
      profile: policy.profile,
      maximumLossBps: 1000,
      reference: rate,
      attribution: usdZarAttribution,
      ...amounts,
      minimumAmountOutUnits: review.minimumAmountOutUnits,
    };
  } catch {
    throw new WalletProviderError('wallet_authorization_denied');
  }
}
