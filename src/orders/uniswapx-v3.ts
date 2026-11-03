import { validSolverPricePolicy } from './price-policy.js';
import { fiatPairDirection } from './usd-zar-fx.js';
import { WalletProviderError } from '../domain/signing.js';
import {
  assessUniswapXV3Outputs,
  validSolverOutputFeePolicy,
} from './output-fee.js';
import { ethers } from 'ethers';

export const baseDutchV3Reactor = '0x000000008a8330B5d1F43A62Bf4C673A49f27ba0';
export const uniswapXPermit2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
// Canonical ABI and witness fields from Uniswap's V3DutchOrderLib and SDK.
export const dutchV3OrderAbi =
  'tuple(tuple(address reactor,address swapper,uint256 nonce,uint256 deadline,address additionalValidationContract,bytes additionalValidationData) info,address cosigner,uint256 startingBaseFee,tuple(address token,uint256 startAmount,tuple(uint256 relativeBlocks,int256[] relativeAmounts) curve,uint256 maxAmount,uint256 adjustmentPerGweiBaseFee) baseInput,tuple(address token,uint256 startAmount,tuple(uint256 relativeBlocks,int256[] relativeAmounts) curve,address recipient,uint256 minAmount,uint256 adjustmentPerGweiBaseFee)[] baseOutputs,tuple(uint256 decayStartBlock,address exclusiveFiller,uint256 exclusivityOverrideBps,uint256 inputAmount,uint256[] outputAmounts) cosignerData,bytes cosignature)';

const witnessTypes = {
  V3DutchOrder: [
    { name: 'info', type: 'OrderInfo' },
    { name: 'cosigner', type: 'address' },
    { name: 'startingBaseFee', type: 'uint256' },
    { name: 'baseInput', type: 'V3DutchInput' },
    { name: 'baseOutputs', type: 'V3DutchOutput[]' },
  ],
  OrderInfo: [
    { name: 'reactor', type: 'address' },
    { name: 'swapper', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'additionalValidationContract', type: 'address' },
    { name: 'additionalValidationData', type: 'bytes' },
  ],
  V3DutchInput: [
    { name: 'token', type: 'address' },
    { name: 'startAmount', type: 'uint256' },
    { name: 'curve', type: 'NonlinearDutchDecay' },
    { name: 'maxAmount', type: 'uint256' },
    { name: 'adjustmentPerGweiBaseFee', type: 'uint256' },
  ],
  V3DutchOutput: [
    { name: 'token', type: 'address' },
    { name: 'startAmount', type: 'uint256' },
    { name: 'curve', type: 'NonlinearDutchDecay' },
    { name: 'recipient', type: 'address' },
    { name: 'minAmount', type: 'uint256' },
    { name: 'adjustmentPerGweiBaseFee', type: 'uint256' },
  ],
  NonlinearDutchDecay: [
    { name: 'relativeBlocks', type: 'uint256' },
    { name: 'relativeAmounts', type: 'int256[]' },
  ],
};

export interface UniswapXV3Digests {
  /** Canonical EIP-712 witness hash emitted in the reactor Fill event. */
  witnessHash: string;
  /** Permit2 spend digest, distinct from the quote observation fingerprint. */
  permit2Digest: string;
  /** Digest Safe owners sign for the exact Safe's ERC-1271 verification. */
  safeMessageDigest: string;
  /** Cosigner data is outside the user's witness but separately authenticated. */
  cosignerDigest: string;
}

/**
 * Pure hashing utility, not spending authorization. Callers must independently
 * enforce owner/KYC/grant/consent, economics, expiry, cosigner and nonce policy.
 * No signature, signable action or raw order is returned to market consumers.
 */
export function hashBaseUniswapXV3Order(
  encodedOrder: string,
  expectedSafe: string,
): UniswapXV3Digests {
  try {
    if (
      !/^0x(?:[a-fA-F0-9]{2})+$/.test(encodedOrder) ||
      encodedOrder.length > 32770 ||
      !ethers.isAddress(expectedSafe) ||
      BigInt(expectedSafe) === 0n
    )
      throw new Error();
    const [order] = ethers.AbiCoder.defaultAbiCoder().decode(
      [dutchV3OrderAbi],
      encodedOrder,
    );
    if (
      ethers.AbiCoder.defaultAbiCoder()
        .encode([dutchV3OrderAbi], [order])
        .toLowerCase() !== encodedOrder.toLowerCase() ||
      order.info.reactor.toLowerCase() !== baseDutchV3Reactor.toLowerCase() ||
      order.info.swapper.toLowerCase() !== expectedSafe.toLowerCase()
    )
      throw new Error();
    const witnessHash = ethers.TypedDataEncoder.hashStruct(
      'V3DutchOrder',
      witnessTypes,
      order,
    );
    const permit2Digest = ethers.TypedDataEncoder.hash(
      { name: 'Permit2', chainId: 8453, verifyingContract: uniswapXPermit2 },
      {
        ...witnessTypes,
        TokenPermissions: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        PermitWitnessTransferFrom: [
          { name: 'permitted', type: 'TokenPermissions' },
          { name: 'spender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'witness', type: 'V3DutchOrder' },
        ],
      },
      {
        permitted: {
          token: order.baseInput.token,
          amount: order.baseInput.maxAmount,
        },
        spender: baseDutchV3Reactor,
        nonce: order.info.nonce,
        deadline: order.info.deadline,
        witness: order,
      },
    );
    return {
      witnessHash,
      permit2Digest,
      safeMessageDigest: ethers.TypedDataEncoder.hash(
        { chainId: 8453, verifyingContract: expectedSafe },
        { SafeMessage: [{ name: 'message', type: 'bytes' }] },
        { message: permit2Digest },
      ),
      cosignerDigest: ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'bytes'],
        [
          witnessHash,
          8453,
          ethers.AbiCoder.defaultAbiCoder().encode(
            [
              'tuple(uint256 decayStartBlock,address exclusiveFiller,uint256 exclusivityOverrideBps,uint256 inputAmount,uint256[] outputAmounts)',
            ],
            [order.cosignerData],
          ),
        ],
      ),
    };
  } catch {
    throw new Error('uniswapx_order_hash_invalid');
  }
}

export interface UniswapXOrderPolicy {
  profile: 'uniswapx-v3-order-v1';
  pricePolicy: import('./price-policy.js').SolverPricePolicy;
  maximumValiditySeconds: number;
  reactorCodeHash: string;
  cosigner: string;
  fee: { basisPoints: number; recipient: string };
  routes: {
    tokenIn: import('../execution/approved-calls.js').PinnedContract;
    tokenOut: import('../execution/approved-calls.js').PinnedContract;
    maximumInputUnits: string;
    maximumLifetimeInputUnits: string;
  }[];
}
export interface UniswapXOrderReview extends UniswapXV3Digests {
  profile: 'uniswapx-v3-order-v1';
  swapper: string;
  nonce: string;
  tokenIn: string;
  tokenOut: string;
  amountInUnits: string;
  minimumAmountOutUnits: string;
  deadline: number;
  fee: import('./output-fee.js').SolverOutputFee;
}
const sameAddress = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();
const positiveUnits = (value: string) =>
  /^[1-9][0-9]{0,38}$/.test(value) && BigInt(value) < 2n ** 128n;
export function validateUniswapXOrderPolicy(policy: UniswapXOrderPolicy): void {
  try {
    if (
      policy.profile !== 'uniswapx-v3-order-v1' ||
      !validSolverPricePolicy(policy.pricePolicy) ||
      !Number.isInteger(policy.maximumValiditySeconds) ||
      policy.maximumValiditySeconds < 30 ||
      policy.maximumValiditySeconds > 600 ||
      !/^0x[a-f0-9]{64}$/.test(policy.reactorCodeHash) ||
      !ethers.isAddress(policy.cosigner) ||
      BigInt(policy.cosigner) === 0n ||
      !validSolverOutputFeePolicy(policy.fee) ||
      !Array.isArray(policy.routes) ||
      !policy.routes.length ||
      policy.routes.length > 4
    )
      throw new Error();
    const routes = new Set<string>();
    for (const route of policy.routes) {
      if (policy.pricePolicy.profile === 'solver-fiat-fx-v1')
        fiatPairDirection(route.tokenIn.address, route.tokenOut.address);
      for (const token of [route.tokenIn, route.tokenOut]) {
        if (
          !ethers.isAddress(token.address) ||
          BigInt(token.address) === 0n ||
          !/^0x[a-f0-9]{64}$/.test(token.codeHash)
        )
          throw new Error();
        if (
          token.implementation &&
          (!ethers.isAddress(token.implementation.address) ||
            BigInt(token.implementation.address) === 0n ||
            !/^0x[a-f0-9]{64}$/.test(token.implementation.codeHash) ||
            (token.implementation.storageLayout !== undefined &&
              !['eip1967', 'zeppelinos'].includes(
                token.implementation.storageLayout,
              )))
        )
          throw new Error();
      }
      const pair = (
        route.tokenIn.address + route.tokenOut.address
      ).toLowerCase();
      if (
        routes.has(pair) ||
        sameAddress(route.tokenIn.address, route.tokenOut.address) ||
        !positiveUnits(route.maximumInputUnits) ||
        !positiveUnits(route.maximumLifetimeInputUnits) ||
        BigInt(route.maximumInputUnits) >
          BigInt(route.maximumLifetimeInputUnits)
      )
        throw new Error();
      routes.add(pair);
    }
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
}

/** Independent host review of the actual witness. No caller-supplied digest,
 * token identity, amount, recipient, domain or typed-data payload is trusted. */
export function reviewUniswapXV3Order(
  encodedOrder: string,
  safe: string,
  policy: UniswapXOrderPolicy,
  now = Math.floor(Date.now() / 1000),
): UniswapXOrderReview {
  try {
    validateUniswapXOrderPolicy(policy);
    const digests = hashBaseUniswapXV3Order(encodedOrder, safe);
    const [order] = ethers.AbiCoder.defaultAbiCoder().decode(
      [dutchV3OrderAbi],
      encodedOrder,
    );
    const input = order.baseInput;
    const route = policy.routes.find(
      (route) =>
        sameAddress(route.tokenIn.address, input.token) &&
        order.baseOutputs.every((output: { token: string }) =>
          sameAddress(route.tokenOut.address, output.token),
        ),
    );
    const deadline = Number(order.info.deadline);
    if (
      !route ||
      !Number.isSafeInteger(deadline) ||
      deadline <= now ||
      deadline > now + policy.maximumValiditySeconds ||
      order.info.additionalValidationContract !== ethers.ZeroAddress ||
      order.info.additionalValidationData !== '0x' ||
      !sameAddress(order.cosigner, policy.cosigner) ||
      input.startAmount <= 0n ||
      input.startAmount !== input.maxAmount ||
      input.startAmount > BigInt(route.maximumInputUnits) ||
      input.adjustmentPerGweiBaseFee !== 0n ||
      input.curve.relativeAmounts.length > 16 ||
      input.curve.relativeAmounts.some((amount: bigint) => amount !== 0n) ||
      order.cosignerData.inputAmount !== 0n ||
      order.cosignature !== '0x' ||
      order.cosignerData.outputAmounts.length > order.baseOutputs.length ||
      order.cosignerData.outputAmounts.some((amount: bigint) => amount !== 0n)
    )
      throw new Error();
    // Only the user witness is signed. Labs later cosigns a separately bounded
    // envelope; an unsigned quote's zero placeholders are not executable data.
    const economics = assessUniswapXV3Outputs({
      outputs: order.baseOutputs,
      cosignerOutputAmounts: order.baseOutputs.map(() => 0n),
      tokenOut: route.tokenOut.address,
      recipient: safe,
      feePolicy: policy.fee,
    });
    if (!economics.outputFee) throw new Error();
    return {
      ...digests,
      profile: 'uniswapx-v3-order-v1',
      swapper: ethers.getAddress(safe),
      nonce: order.info.nonce.toString(),
      tokenIn: ethers.getAddress(input.token),
      tokenOut: ethers.getAddress(route.tokenOut.address),
      amountInUnits: input.maxAmount.toString(),
      minimumAmountOutUnits: economics.minimumAmountOutUnits,
      deadline,
      fee: economics.outputFee,
    };
  } catch {
    throw new WalletProviderError('wallet_provider_input');
  }
}
