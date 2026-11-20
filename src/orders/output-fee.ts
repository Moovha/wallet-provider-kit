import { ethers } from 'ethers';

export interface SolverOutputFeePolicy {
  basisPoints: number;
  recipient: string;
}
export interface SolverOutputFee {
  policy: 'uniswapx_output_fee_v1';
  token: string;
  recipient: string;
  basisPoints: number;
  /** Signed minimum; the quoted start is an estimate, not a hard upper bound.
   * A later cosigner can improve outputs without changing the user witness. */
  minimumAmountUnits: string;
  quotedStartAmountUnits: string;
}
export interface DutchV3Output {
  token: string;
  startAmount: bigint;
  minAmount: bigint;
  recipient: string;
  adjustmentPerGweiBaseFee: bigint;
  curve: {
    relativeBlocks: bigint;
    relativeAmounts: bigint[];
  };
}
const same = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();
const nonzeroAddress = (value: string) =>
  ethers.isAddress(value) && BigInt(value) !== 0n;

export function validSolverOutputFeePolicy(
  policy: SolverOutputFeePolicy,
): boolean {
  return (
    !!policy &&
    typeof policy === 'object' &&
    Number.isInteger(policy.basisPoints) &&
    policy.basisPoints > 0 &&
    policy.basisPoints <= 500 &&
    nonzeroAddress(policy.recipient)
  );
}

interface OutputCurve {
  start: bigint;
  minimum: bigint;
  points: { block: number; delta: bigint }[];
}
function checkedCurve(output: DutchV3Output, override: bigint): OutputCurve {
  const start = BigInt(
    (override === 0n ? output.startAmount : override).toString(),
  );
  const minimum = BigInt(output.minAmount.toString());
  if (
    output.adjustmentPerGweiBaseFee !== 0n ||
    start < BigInt(output.startAmount.toString()) ||
    minimum <= 0n ||
    start >= 2n ** 128n ||
    minimum > BigInt(output.startAmount.toString()) ||
    output.curve.relativeAmounts.length > 16
  )
    throw new Error();
  let packed = BigInt(output.curve.relativeBlocks.toString());
  const points: OutputCurve['points'] = [];
  let previousBlock = 0;
  let previousDelta = 0n;
  for (const amount of output.curve.relativeAmounts) {
    const block = Number(packed & 65535n);
    packed >>= 16n;
    const delta = BigInt(amount.toString());
    if (
      block <= previousBlock ||
      delta < previousDelta ||
      delta > BigInt(output.startAmount.toString())
    )
      throw new Error();
    points.push({ block, delta });
    previousBlock = block;
    previousDelta = delta;
  }
  if (packed !== 0n) throw new Error();
  return { start, minimum, points };
}
// Matches the reactor's nonnegative, monotone output decay: subtract an
// interpolated delta rounded down, then clamp to the signed minimum.
function outputAt(curve: OutputCurve, block: number): bigint {
  let previous = { block: 0, delta: 0n };
  for (const point of curve.points) {
    if (block <= point.block) {
      const delta =
        previous.delta +
        ((point.delta - previous.delta) * BigInt(block - previous.block)) /
          BigInt(point.block - previous.block);
      const amount = curve.start - delta;
      return amount < curve.minimum ? curve.minimum : amount;
    }
    previous = point;
  }
  const amount = curve.start - previous.delta;
  return amount < curve.minimum ? curve.minimum : amount;
}

/** Validate the fee at EVERY possible integer auction block, including clamp
 * boundaries. Endpoint checks alone miss differently shaped intermediate fees.
 * Packed uint16 curve blocks bound this to at most 65,536 evaluations. */
export function assessUniswapXV3Outputs(input: {
  outputs: DutchV3Output[];
  cosignerOutputAmounts: bigint[];
  tokenOut: string;
  recipient: string;
  feePolicy?: SolverOutputFeePolicy;
}): {
  amountOutUnits: string;
  minimumAmountOutUnits: string;
  outputFee?: SolverOutputFee;
} {
  try {
    const policy = input.feePolicy;
    if (
      policy &&
      (!validSolverOutputFeePolicy(policy) ||
        same(policy.recipient, input.recipient))
    )
      throw new Error();
    if (
      input.outputs.length !== (policy ? 2 : 1) ||
      input.cosignerOutputAmounts.length !== input.outputs.length ||
      input.outputs.some((output) => !same(output.token, input.tokenOut))
    )
      throw new Error();
    const userIndex = input.outputs.findIndex((output) =>
      same(output.recipient, input.recipient),
    );
    const feeIndex = policy
      ? input.outputs.findIndex((output) =>
          same(output.recipient, policy.recipient),
        )
      : -1;
    if (userIndex < 0 || (policy && feeIndex < 0)) throw new Error();
    const user = checkedCurve(
      input.outputs[userIndex],
      input.cosignerOutputAmounts[userIndex],
    );
    if (!policy)
      return {
        amountOutUnits: user.start.toString(),
        minimumAmountOutUnits: user.minimum.toString(),
      };
    const fee = checkedCurve(
      input.outputs[feeIndex],
      input.cosignerOutputAmounts[feeIndex],
    );
    const lastBlock = Math.max(
      user.points.at(-1)?.block ?? 0,
      fee.points.at(-1)?.block ?? 0,
    );
    const checkRate = (userAmount: bigint, feeAmount: bigint) => {
      const expected =
        ((userAmount + feeAmount) * BigInt(policy.basisPoints)) / 10000n;
      // Separately rounded user and fee curves can differ by one base unit.
      if (feeAmount < expected - 1n || feeAmount > expected + 1n)
        throw new Error();
    };
    checkRate(user.minimum, fee.minimum);
    for (let block = 0; block <= lastBlock; block++)
      checkRate(outputAt(user, block), outputAt(fee, block));
    return {
      amountOutUnits: user.start.toString(),
      minimumAmountOutUnits: user.minimum.toString(),
      outputFee: {
        policy: 'uniswapx_output_fee_v1',
        token: input.tokenOut,
        recipient: policy.recipient,
        basisPoints: policy.basisPoints,
        minimumAmountUnits: fee.minimum.toString(),
        quotedStartAmountUnits: fee.start.toString(),
      },
    };
  } catch {
    throw new Error('uniswapx_output_fee_invalid');
  }
}
