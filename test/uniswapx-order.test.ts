import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { AbiCoder, ZeroAddress } from 'ethers';
import golden from './fixtures/uniswapx-v3-digests.json' with { type: 'json' };
import {
  hashBaseUniswapXV3Order,
  reviewUniswapXV3Order,
  dutchV3OrderAbi,
  type UniswapXOrderPolicy,
} from '../src/orders/uniswapx-v3.js';
const coder = AbiCoder.defaultAbiCoder();
const feeRecipient = '0x5555555555555555555555555555555555555555';
function fixture() {
  const order = structuredClone(golden.order);
  order.baseOutputs[0] = {
    ...order.baseOutputs[0],
    startAmount: '5940000000000000000',
    minAmount: '5880600000000000000',
    curve: {
      relativeBlocks: 4,
      relativeAmounts: ['59400000000000000'] as never,
    },
  };
  order.baseOutputs.push({
    ...order.baseOutputs[0],
    recipient: feeRecipient,
    startAmount: '60000000000000000',
    minAmount: '59400000000000000',
    curve: { relativeBlocks: 4, relativeAmounts: ['600000000000000'] as never },
  });
  order.cosignerData.outputAmounts = [0];
  const policy: UniswapXOrderPolicy = {
    profile: 'uniswapx-v3-order-v1',
    pricePolicy: {
      profile: 'solver-twap-benchmark-v1',
      lookbackSeconds: 1800,
      maximumLossBps: 200,
      maximumSpotDivergenceBps: 100,
      pool: { address: feeRecipient, codeHash: '0x' + '66'.repeat(32) },
    },
    maximumValiditySeconds: 600,
    reactorCodeHash: '0x' + '99'.repeat(32),
    cosigner: order.cosigner,
    fee: { basisPoints: 100, recipient: feeRecipient },
    routes: [
      {
        tokenIn: {
          address: order.baseInput.token,
          codeHash: '0x' + '88'.repeat(32),
        },
        tokenOut: {
          address: order.baseOutputs[0].token,
          codeHash: '0x' + '77'.repeat(32),
        },
        maximumInputUnits: '500000',
        maximumLifetimeInputUnits: '1000000',
      },
    ],
  };
  return {
    order,
    policy,
    encode: () => coder.encode([dutchV3OrderAbi], [order]),
    now: order.info.deadline - 300,
  };
}
describe('narrow Base UniswapX V3 witness review', () => {
  it('matches the official SDK digest fixture on the independent provider runtime', () => {
    assert.deepEqual(
      hashBaseUniswapXV3Order(
        coder.encode([dutchV3OrderAbi], [golden.order]),
        golden.safe,
      ),
      golden.expected,
    );
  });
  it('derives economics and signing hashes from the canonical order with no caller digest', () => {
    const f = fixture();
    const result = reviewUniswapXV3Order(
      f.encode(),
      golden.safe,
      f.policy,
      f.now,
    );
    assert.equal(result.amountInUnits, '500000');
    assert.equal(result.minimumAmountOutUnits, '5880600000000000000');
    assert.equal(result.fee.minimumAmountUnits, '59400000000000000');
    assert.equal(result.swapper, golden.safe);
    assert.notEqual(result.safeMessageDigest, result.permit2Digest);
  });
  for (const name of [
    'account',
    'reactor',
    'cosigner',
    'extra validator',
    'input cap',
    'input token',
    'input gas',
    'output gas',
    'fee recipient',
    'fee rate',
    'expiry',
    'variable input',
    'cosigned input',
  ]) {
    it('rejects ' + name + ' substitution', () => {
      const f = fixture();
      let safe = golden.safe;
      if (name === 'account') safe = feeRecipient;
      if (name === 'reactor') f.order.info.reactor = feeRecipient;
      if (name === 'cosigner') f.order.cosigner = feeRecipient;
      if (name === 'extra validator')
        f.order.info.additionalValidationContract = feeRecipient;
      if (name === 'input cap')
        f.order.baseInput.startAmount = f.order.baseInput.maxAmount = 500001;
      if (name === 'input token') f.order.baseInput.token = feeRecipient;
      if (name === 'input gas') f.order.baseInput.adjustmentPerGweiBaseFee = 1;
      if (name === 'output gas')
        f.order.baseOutputs[0].adjustmentPerGweiBaseFee = 1;
      if (name === 'fee recipient')
        f.order.baseOutputs[1].recipient = golden.safe;
      if (name === 'fee rate') f.policy.fee.basisPoints = 200;
      if (name === 'expiry') f.order.info.deadline = f.now - 1;
      if (name === 'variable input')
        f.order.baseInput.curve.relativeAmounts = [1] as never;
      if (name === 'cosigned input') f.order.cosignerData.inputAmount = 1;
      assert.throws(
        () => reviewUniswapXV3Order(f.encode(), safe, f.policy, f.now),
        /wallet_provider_input/,
      );
    });
  }
  it('refuses a pre-cosigned payload instead of trusting it as an unsigned authorization request', () => {
    const f = fixture();
    f.order.cosignature = '0x' + '11'.repeat(65);
    assert.throws(
      () => reviewUniswapXV3Order(f.encode(), golden.safe, f.policy, f.now),
      /wallet_provider_input/,
    );
  });
  it('rejects missing/zero fee policy', () => {
    const f = fixture();
    f.policy.fee.recipient = ZeroAddress;
    assert.throws(
      () => reviewUniswapXV3Order(f.encode(), golden.safe, f.policy, f.now),
      /wallet_provider_input/,
    );
  });
});
