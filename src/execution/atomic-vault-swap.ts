import {
  AbiCoder,
  Interface,
  ZeroAddress,
  getAddress,
  solidityPacked,
} from 'ethers';
import { atomicVaultSwapAbi } from './atomic-vault-swap.generated.js';
import { tokenInterface } from './operation-interfaces.js';
export {
  atomicVaultSwapAbi,
  atomicVaultSwapCreationCode,
  dexAdapterArtifacts,
} from './atomic-vault-swap.generated.js';
export interface AtomicSwapQuote {
  assetsIn: bigint;
  assetsOut: bigint;
  amountOut: bigint;
  quotedAt: bigint;
  deadline: bigint;
  slippageBps: number;
}
export interface AtomicSwapRequest {
  tokenIn: string;
  tokenOut: string;
  sourceVault?: string;
  destinationVault?: string;
  amount: bigint;
  protocol: 3 | 4 | 5;
  path: string;
  quote: AtomicSwapQuote;
}
export interface AtomicV4Pool {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks?: string;
}
const coder = AbiCoder.defaultAbiCoder();
const poolType =
  'tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)[]';
function uint(value: bigint) {
  if (value <= 0n || value >= 2n ** 128n)
    throw new RangeError('Amount must be positive and fit uint128');
}
function address(value: string) {
  const result = getAddress(value);
  if (result === ZeroAddress)
    throw new RangeError('A nonzero token or helper address is required');
  return result;
}
function tolerance(bps: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps > 1000)
    throw new RangeError('Slippage must be between 0 and 1000 basis points');
}
/** Round the minimum received upward, using integer token units and the actual intermediate amount. */
export function atomicSwapMinimum(
  quotedOutput: bigint,
  actualBasis: bigint,
  quotedBasis: bigint,
  slippageBps: number,
) {
  [quotedOutput, actualBasis, quotedBasis].forEach(uint);
  tolerance(slippageBps);
  const numerator = quotedOutput * actualBasis * BigInt(10000 - slippageBps),
    denominator = quotedBasis * 10000n;
  return (numerator + denominator - 1n) / denominator;
}
/** Quote anchors must come from one consistent application quote snapshot, including vault previews. */
export function atomicSwapQuote(input: {
  assetsIn: bigint;
  assetsOut: bigint;
  amountOut: bigint;
  slippageBps?: number;
  quotedAt?: bigint;
  ttlSeconds?: number;
}): AtomicSwapQuote {
  const quotedAt = input.quotedAt ?? BigInt(Math.floor(Date.now() / 1000));
  const ttl = input.ttlSeconds ?? 60;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 300)
    throw new RangeError('Quote lifetime must be between 1 and 300 seconds');
  const quote = {
    assetsIn: input.assetsIn,
    assetsOut: input.assetsOut,
    amountOut: input.amountOut,
    slippageBps: input.slippageBps ?? 100,
    quotedAt,
    deadline: quotedAt + BigInt(ttl),
  };
  validateQuote(quote);
  return quote;
}
function validateQuote(q: AtomicSwapQuote) {
  [q.assetsIn, q.assetsOut, q.amountOut].forEach(uint);
  tolerance(q.slippageBps);
  if (
    q.quotedAt < 0n ||
    q.deadline >= 2n ** 48n ||
    q.deadline <= q.quotedAt ||
    q.deadline - q.quotedAt > 300n
  )
    throw new RangeError('Invalid quote timestamps');
}
export function encodeV3SwapPath(tokens: string[], fees: number[]) {
  if (tokens.length < 2 || fees.length !== tokens.length - 1)
    throw new RangeError('A route requires at least one hop');
  const normalized = tokens.map(address);
  if (
    new Set(normalized).size !== normalized.length ||
    fees.some((f) => !Number.isInteger(f) || f <= 0 || f >= 1000000)
  )
    throw new RangeError('Invalid v3 path');
  const types = ['address'],
    values: (string | number)[] = [normalized[0]];
  fees.forEach((fee, i) => {
    types.push('uint24', 'address');
    values.push(fee, normalized[i + 1]);
  });
  return solidityPacked(types, values).toLowerCase();
}
export function encodeV4SwapPath(pools: AtomicV4Pool[]) {
  if (pools.length < 1)
    throw new RangeError('A route requires at least one hop');
  const normalized = pools.map((p) => ({
    ...p,
    currency0: address(p.currency0),
    currency1: address(p.currency1),
    hooks: p.hooks ?? ZeroAddress,
  }));
  for (const p of normalized)
    if (
      BigInt(p.currency0) >= BigInt(p.currency1) ||
      getAddress(p.hooks) !== ZeroAddress ||
      !Number.isInteger(p.fee) ||
      p.fee < 0 ||
      p.fee >= 1000000 ||
      !Number.isInteger(p.tickSpacing) ||
      p.tickSpacing <= 0 ||
      p.tickSpacing > 32767
    )
      throw new RangeError('Invalid v4 pool');
  return coder.encode([poolType], [normalized]).toLowerCase();
}
export interface AtomicDexStep {
  adapter: string;
  tokenOut: string;
  data: string;
}
const stepType = 'tuple(address adapter,address tokenOut,bytes data)[]';
/** Ordered approved-adapter calls. Each step receives the full actual output of its predecessor. */
export function encodeDexSwapRoute(steps: AtomicDexStep[]) {
  if (!steps.length) throw new RangeError('A route requires at least one step');
  const clean = steps.map((s) => ({
    adapter: address(s.adapter),
    tokenOut: address(s.tokenOut),
    data: s.data.toLowerCase(),
  }));
  if (
    new Set(clean.map((s) => s.tokenOut)).size !== clean.length ||
    clean.some((s) => !/^0x(?:[0-9a-f]{2})*$/.test(s.data))
  )
    throw new RangeError('Invalid adapter route');
  return coder.encode([stepType], [clean]).toLowerCase();
}
export function encodeV3AdapterData(fee: number) {
  if (!Number.isInteger(fee) || fee <= 0 || fee >= 1000000)
    throw new RangeError('Invalid v3 fee');
  return coder.encode(['uint24'], [fee]);
}
export function encodeV4AdapterData(pool: AtomicV4Pool) {
  const normalized = coder.decode([poolType], encodeV4SwapPath([pool]))[0][0];
  return coder.encode([poolType.slice(0, -2)], [normalized]);
}
export function encodeSlipstreamAdapterData(tickSpacing: number) {
  if (!Number.isInteger(tickSpacing) || tickSpacing <= 0 || tickSpacing > 32767)
    throw new RangeError('Invalid Slipstream tick spacing');
  return coder.encode(['int24'], [tickSpacing]);
}
export function encodeAerodromeAdapterData(stable: boolean, factory: string) {
  if (typeof stable !== 'boolean')
    throw new RangeError('Invalid Aerodrome pool type');
  return coder.encode(['bool', 'address'], [stable, address(factory)]);
}
/** Four exact wallet calls; provider policy, current authority and on-chain quote bounds remain authoritative. */
export function atomicVaultSwapCalls(
  input: AtomicSwapRequest & { helper: string },
): { to: string; data: string; value: '0x0' }[] {
  const helper = address(input.helper),
    tokenIn = address(input.tokenIn),
    tokenOut = address(input.tokenOut),
    sourceVault = input.sourceVault ? address(input.sourceVault) : ZeroAddress,
    destinationVault = input.destinationVault
      ? address(input.destinationVault)
      : ZeroAddress;
  uint(input.amount);
  validateQuote(input.quote);
  if (
    tokenIn === tokenOut ||
    (sourceVault === ZeroAddress && input.quote.assetsIn !== input.amount) ||
    (destinationVault === ZeroAddress &&
      input.quote.amountOut !== input.quote.assetsOut)
  )
    throw new RangeError('Quote does not match swap endpoints');
  let path = input.path.toLowerCase();
  if (!/^0x(?:[0-9a-f]{2})+$/.test(path))
    throw new RangeError('Invalid path bytes');
  let current = tokenIn;
  const seen = new Set([current]);
  if (input.protocol === 3) {
    const bytes = (path.length - 2) / 2;
    if (bytes < 43 || (bytes - 20) % 23 !== 0)
      throw new RangeError('Invalid v3 path');
    const tokens = [getAddress('0x' + path.slice(2, 42))],
      fees = [];
    for (let offset = 42; offset < path.length; offset += 46) {
      fees.push(Number.parseInt(path.slice(offset, offset + 6), 16));
      tokens.push(getAddress('0x' + path.slice(offset + 6, offset + 46)));
    }
    if (
      tokens[0] !== tokenIn ||
      tokens.at(-1) !== tokenOut ||
      encodeV3SwapPath(tokens, fees) !== path
    )
      throw new RangeError('V3 endpoints do not match');
  } else if (input.protocol === 4) {
    const pools = coder.decode(
      [poolType],
      path,
    )[0] as unknown as AtomicV4Pool[];
    const clean = pools.map((p) => ({
      currency0: p.currency0,
      currency1: p.currency1,
      fee: Number(p.fee),
      tickSpacing: Number(p.tickSpacing),
      hooks: p.hooks,
    }));
    if (encodeV4SwapPath(clean) !== path)
      throw new RangeError('Noncanonical v4 path');
    for (const p of clean) {
      const next =
        current === p.currency0
          ? p.currency1
          : current === p.currency1
            ? p.currency0
            : undefined;
      if (!next || seen.has(next))
        throw new RangeError('Disconnected or repeated v4 currency');
      seen.add(next);
      current = next;
    }
    if (current !== tokenOut) throw new RangeError('V4 endpoints do not match');
  } else if (input.protocol === 5) {
    const decoded = coder.decode([stepType], path)[0];
    const steps: AtomicDexStep[] = Array.from(decoded, (p: unknown) => {
      const step = p as AtomicDexStep;
      return {
        adapter: step.adapter,
        tokenOut: step.tokenOut,
        data: step.data,
      };
    });
    if (encodeDexSwapRoute(steps) !== path)
      throw new RangeError('Noncanonical adapter route');
    for (const step of steps) {
      const next = address(step.tokenOut);
      if (seen.has(next)) throw new RangeError('Cyclic adapter route');
      seen.add(next);
      current = next;
    }
    if (current !== tokenOut)
      throw new RangeError('Adapter route endpoints do not match');
  } else throw new RangeError('Unsupported route protocol');
  const call = (to: string, data: string) => ({
    to,
    data: data.toLowerCase(),
    value: '0x0' as const,
  });
  const source = sourceVault === ZeroAddress ? tokenIn : sourceVault;
  const approve = (amount: bigint) =>
    call(
      source,
      tokenInterface.encodeFunctionData('approve', [helper, amount]),
    );
  const request = {
    tokenIn,
    tokenOut,
    sourceVault,
    destinationVault,
    amount: input.amount,
    protocol: input.protocol,
    path,
    quote: input.quote,
  };
  return [
    approve(0n),
    approve(input.amount),
    call(
      helper,
      new Interface(atomicVaultSwapAbi).encodeFunctionData('execute', [
        request,
      ]),
    ),
    approve(0n),
  ];
}
