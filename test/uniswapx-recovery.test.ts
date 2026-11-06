import { Interface, zeroPadValue } from 'ethers';
import { describe, expect, it } from 'vitest';
import {
  recoverUniswapXFill,
  verifyOrderFillReceipt,
} from '../src/orders/recovery.js';
import {
  baseDutchV3Reactor,
  reviewUniswapXV3Order,
  uniswapXPermit2,
} from '../src/orders/uniswapx-v3.js';
import type { OrderRpc } from '../src/orders/price-policy.js';
import { blockHash, genesisHash, orderFixture } from './helpers/uniswapx.js';
const reactor = new Interface([
  'event Fill(bytes32 indexed orderHash,address indexed filler,address indexed swapper,uint256 nonce)',
]);
const token = new Interface([
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const permit = new Interface([
  'event UnorderedNonceInvalidation(address indexed owner,uint256 word,uint256 mask)',
  'function nonceBitmap(address,uint256) view returns(uint256)',
]);
const tx = '0x' + 'ef'.repeat(32),
  filler = '0x6666666666666666666666666666666666666666';
function fixture(recipient?: string) {
  const f = orderFixture();
  if (recipient) {
    f.policy.recipientPolicy = 'bound-transfer';
    f.order.baseOutputs[0].recipient = recipient;
  }
  const review = reviewUniswapXV3Order(
    f.encode(),
    f.safe,
    f.policy,
    undefined,
    recipient,
  );
  const event = (
    abi: Interface,
    name: string,
    args: unknown[],
    address: string,
  ) => ({
    address,
    ...abi.encodeEventLog(abi.getEvent(name)!, args),
    transactionHash: tx,
    blockHash,
    blockNumber: '0x64',
  });
  const fill = () =>
    event(
      reactor,
      'Fill',
      [review.witnessHash, filler, f.safe, review.nonce],
      baseDutchV3Reactor,
    );
  const receipt = {
    status: '0x1',
    transactionHash: tx,
    blockHash,
    blockNumber: '0x64',
    logs: [
      event(
        token,
        'Transfer',
        [f.safe, filler, review.amountInUnits],
        review.tokenIn,
      ),
      event(
        token,
        'Transfer',
        [filler, recipient ?? f.safe, '990000'],
        review.tokenOut,
      ),
      event(
        token,
        'Transfer',
        [filler, review.fee.recipient, '10000'],
        review.tokenOut,
      ),
      fill(),
    ],
  };
  const state = {
    logs: [fill()],
    bitmap: 0n,
    safeTime: review.deadline - 1,
    safeNumber: 102,
    reorg: false,
    cancellation: false,
  };
  const methods: string[] = [];
  const rpc: OrderRpc = {
    async call(method, params) {
      methods.push(method);
      if (method === 'eth_chainId') return '0x2105';
      if (method === 'eth_getBlockByNumber') {
        const number =
          params[0] === 'safe'
            ? state.safeNumber
            : Number(BigInt(String(params[0])));
        return {
          number: '0x' + number.toString(16),
          hash:
            number === 0
              ? genesisHash
              : state.reorg && params[0] === '0x66'
                ? '0x' + '12'.repeat(32)
                : blockHash,
          timestamp:
            '0x' +
            (number === state.safeNumber
              ? state.safeTime
              : review.deadline - 1
            ).toString(16),
        };
      }
      if (method === 'eth_getLogs')
        return (params[0] as { address: string }).address === baseDutchV3Reactor
          ? state.logs
          : state.cancellation
            ? [
                event(
                  permit,
                  'UnorderedNonceInvalidation',
                  [
                    f.safe,
                    BigInt(review.nonce) >> 8n,
                    1n << (BigInt(review.nonce) & 255n),
                  ],
                  uniswapXPermit2,
                ),
              ]
            : [];
      if (method === 'eth_getTransactionReceipt')
        return state.cancellation
          ? {
              ...receipt,
              logs: [
                event(
                  permit,
                  'UnorderedNonceInvalidation',
                  [
                    f.safe,
                    BigInt(review.nonce) >> 8n,
                    1n << (BigInt(review.nonce) & 255n),
                  ],
                  uniswapXPermit2,
                ),
              ],
            }
          : receipt;
      if (method === 'eth_call')
        return permit.encodeFunctionResult('nonceBitmap', [state.bitmap]);
      throw new Error('unexpected RPC');
    },
  };
  return { f, review, event, fill, receipt, state, rpc, methods };
}
describe('receipt effects and read-only fill recovery', () => {
  it('proves exact input, self output, proportional fee and safe-block receipt', async () => {
    const f = fixture();
    expect(verifyOrderFillReceipt(f.review, f.receipt)?.outputAmountUnits).toBe(
      '990000',
    );
    expect(
      await recoverUniswapXFill(f.rpc, f.review, 100, genesisHash),
    ).toMatchObject({
      state: 'filled',
      proof: {
        transactionHash: tx,
        inputAmountUnits: '1000000',
        finality: 'base-safe',
      },
    });
    expect(f.methods.every((method) => !method.startsWith('eth_send'))).toBe(
      true,
    );
  });
  for (const mutation of [
    'nonce',
    'fee',
    'input',
    'second fill',
    'removed',
    'failed',
    'block number',
  ])
    it('rejects ' + mutation + ' effects', () => {
      const f = fixture();
      if (mutation === 'nonce')
        f.review.nonce = (BigInt(f.review.nonce) + 1n).toString();
      if (mutation === 'fee')
        f.receipt.logs[2] = f.event(
          token,
          'Transfer',
          [filler, f.review.fee.recipient, '20000'],
          f.review.tokenOut,
        );
      if (mutation === 'input')
        f.receipt.logs[0] = f.event(
          token,
          'Transfer',
          [f.f.safe, filler, '1000001'],
          f.review.tokenIn,
        );
      if (mutation === 'second fill') f.receipt.logs.push(f.fill());
      if (mutation === 'removed')
        Object.assign(f.receipt.logs[0], { removed: true });
      if (mutation === 'failed') f.receipt.status = '0x0';
      if (mutation === 'block number') f.receipt.blockNumber = '-1';
      expect(verifyOrderFillReceipt(f.review, f.receipt)).toBeNull();
    });
  it('holds an unexplained consumed nonce instead of declaring fill or refund', async () => {
    const f = fixture();
    f.state.logs = [];
    f.state.bitmap = 1n << (BigInt(f.review.nonce) & 255n);
    f.state.safeTime = f.review.deadline + 1;
    expect(
      await recoverUniswapXFill(f.rpc, f.review, 100, genesisHash),
    ).toEqual({ state: 'needs_review' });
  });
  it('proves nonce cancellation independently of API status', async () => {
    const f = fixture();
    f.state.logs = [];
    f.state.cancellation = true;
    expect(
      await recoverUniswapXFill(f.rpc, f.review, 100, genesisHash),
    ).toMatchObject({ state: 'cancelled', transactionHash: tx });
  });
  it('distinguishes pending from safely expired without a new dispatch', async () => {
    const f = fixture();
    f.state.logs = [];
    expect(
      await recoverUniswapXFill(f.rpc, f.review, 100, genesisHash),
    ).toEqual({ state: 'pending' });
    f.state.safeTime = f.review.deadline + 1;
    expect(
      await recoverUniswapXFill(f.rpc, f.review, 100, genesisHash),
    ).toMatchObject({ state: 'expired' });
  });
  it('rejects a safe-checkpoint reorg', async () => {
    const f = fixture();
    f.state.reorg = true;
    expect(
      await recoverUniswapXFill(f.rpc, f.review, 100, genesisHash),
    ).toEqual({ state: 'needs_review' });
  });
  it('holds multiple matching logs and a wrong chain', async () => {
    const f = fixture();
    f.state.logs.push(f.fill());
    expect(
      await recoverUniswapXFill(f.rpc, f.review, 100, genesisHash),
    ).toEqual({ state: 'needs_review' });
    await expect(
      recoverUniswapXFill(
        { call: async () => '0x1' },
        f.review,
        100,
        genesisHash,
      ),
    ).rejects.toThrow('wallet_provider_unavailable');
  });
});

it('proves direct delivery to the signed recipient and rejects self delivery, diversion or recipient debits', async () => {
  const recipient = '0x7777777777777777777777777777777777777777';
  const f = fixture(recipient);
  const review = f.review;
  const event = (from: string, to: string, amount: string) => ({
    address: review.tokenOut,
    ...token.encodeEventLog(token.getEvent('Transfer')!, [from, to, amount]),
    transactionHash: tx,
    blockHash,
    blockNumber: '0x64',
  });
  const receipt = structuredClone(f.receipt);
  receipt.logs[1] = event(filler, recipient, '990000');
  expect(verifyOrderFillReceipt(review, receipt)?.outputAmountUnits).toBe(
    '990000',
  );
  const selfDelivered = structuredClone(receipt);
  selfDelivered.logs[1] = event(filler, review.swapper, '990000');
  expect(verifyOrderFillReceipt(review, selfDelivered)).toBeNull();
  expect(
    await recoverUniswapXFill(f.rpc, review, 100, genesisHash),
  ).toMatchObject({ state: 'filled' });
  for (const extra of [
    event(recipient, filler, '1'),
    event(filler, review.swapper, '1'),
  ]) {
    const invalid = structuredClone(receipt);
    invalid.logs.splice(2, 0, extra);
    expect(verifyOrderFillReceipt(review, invalid)).toBeNull();
  }
  expect(
    verifyOrderFillReceipt({ ...review, recipient: filler }, receipt),
  ).toBeNull();
});
it('attributes a shared recipient to the target fill window in a batched settlement', () => {
  const recipient = '0x7777777777777777777777777777777777777777';
  const value = fixture(recipient);
  const before = [
    value.event(
      token,
      'Transfer',
      [filler, recipient, '5000000'],
      value.review.tokenOut,
    ),
    value.event(
      token,
      'Transfer',
      [filler, value.review.fee.recipient, '50000'],
      value.review.tokenOut,
    ),
    value.event(
      reactor,
      'Fill',
      [
        '0x' + '12'.repeat(32),
        filler,
        '0x8888888888888888888888888888888888888888',
        2,
      ],
      baseDutchV3Reactor,
    ),
  ];
  value.receipt.logs.splice(1, 0, ...before);
  expect(
    verifyOrderFillReceipt(value.review, value.receipt)?.outputAmountUnits,
  ).toBe('990000');
});
