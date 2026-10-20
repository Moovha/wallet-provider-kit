import { expect, it } from 'vitest';
import { RpcReader, QuorumExecutionObserver } from '../src/execution/chain.js';
import { approvedCallsFixture } from './helpers/approved-calls.js';
import {
  buildApprovedCallIntent,
  buildApprovedCallAction,
  approvedCallData,
} from '../src/execution/approved-calls.js';
import { createTransferExecutionProvider } from '../src/execution/relayer.js';
import { Wallet } from 'ethers';
import { randomUUID } from 'node:crypto';
import { quoteNetworkFees } from '../src/execution/network-fees.js';
import { initialFees } from '../src/execution/replacement.js';
import { executionFixture } from './helpers/execution.js';

const limits = { maxFeePerGas: '1000000000', maxPriorityFeePerGas: '10000000' };
it('requires the bounded provider contract before handing a quoted plan to a Relayer', async () => {
  const f = executionFixture(),
    plan = await f.plan();
  plan.networkFees = {
    maxFeePerGas: '3',
    maxPriorityFeePerGas: '1',
    baseFeePerGas: '1',
    quotedAt: new Date().toISOString(),
  };
  await expect(
    createTransferExecutionProvider(
      f.configuration,
      'offline-relayer-key',
      f.request,
    ).prepare(plan),
  ).rejects.toMatchObject({ code: 'wallet_provider_configuration' });
  expect(f.state.posts).toBe(0);
});
it.each([
  ['type', '0x0'],
  ['gas', '0x1'],
  ['maxFeePerGas', '0xffffffffff'],
  ['maxPriorityFeePerGas', '0xffffffffff'],
])(
  'rejects Safe inclusion evidence outside the sponsor %s allowance',
  async (field, value) => {
    const original = executionFixture(),
      owner = Wallet.createRandom(),
      accountId = randomUUID(),
      f = approvedCallsFixture(accountId, owner.address, original),
      expiry = new Date(Date.now() + 60000).toISOString();
    const intent = buildApprovedCallIntent(
      f.policy,
      {
        account_id: accountId,
        kind: 'contract-call',
        calls: [
          { to: f.policy.contracts[0].address, value: '0', data: '0x12345678' },
        ],
      },
      '0',
      expiry,
    );
    const action = buildApprovedCallAction(
      intent,
      owner.address,
      expiry,
      randomUUID(),
    );
    const signature = await owner.signTypedData(
      action.payload.domain,
      action.payload.types,
      action.payload.message,
    );
    const plan = {
      ...(await original.plan()),
      profile: 'approved-evm-executor-v1' as const,
      action,
      intent,
      data: approvedCallData(action, signature),
    };
    Object.assign(f.state, {
      included: true,
      target: intent.account.address,
      digest: action.payload_hash,
      data: plan.data,
      intent,
    });
    const observer = new QuorumExecutionObserver(
      ['https://primary.example.test', 'https://secondary.example.test'],
      original.configuration.rpc.genesisHash,
      10000,
      f.request,
    );
    expect(
      await observer.observe(
        plan,
        [original.transactionHash],
        original.transactionHash,
      ),
    ).toMatchObject({ verification: 'rpc-quorum', outcome: 'succeeded' });
    f.state.mutate = (method, result) =>
      method === 'eth_getTransactionByHash'
        ? { ...(result as object), [field]: value }
        : result;
    await expect(
      observer.observe(
        plan,
        [original.transactionHash],
        original.transactionHash,
      ),
    ).rejects.toMatchObject({ code: 'wallet_provider_unavailable' });
  },
);
function reader(base = '0x4c4b40', tip = '0xf4240', malformed = false) {
  return new RpcReader(
    'https://rpc.example.test',
    (async (_url, init) => {
      const { method } = JSON.parse(String(init?.body));
      return Response.json({
        jsonrpc: '2.0',
        id: 1,
        result:
          method === 'eth_feeHistory'
            ? {
                baseFeePerGas: Array(malformed ? 5 : 6).fill(base),
                reward: Array.from({ length: 5 }, () => [tip]),
              }
            : tip,
      });
    }) as typeof fetch,
    4,
  );
}
it('offers network base fee with headroom and a network tip rather than the policy maximum', async () => {
  const quote = await quoteNetworkFees(reader(), limits);
  expect(quote).toMatchObject({
    baseFeePerGas: '5000000',
    maxFeePerGas: '11000000',
    maxPriorityFeePerGas: '1000000',
  });
  const plan = await executionFixture().plan();
  plan.sponsor = { ...plan.sponsor, ...limits };
  plan.networkFees = quote;
  expect(initialFees(plan)).toEqual({
    maxFeePerGas: '11000000',
    maxPriorityFeePerGas: '1000000',
  });
});
it('clips only optional headroom while covering the current network price', async () => {
  expect(
    await quoteNetworkFees(reader(), { ...limits, maxFeePerGas: '8000000' }),
  ).toMatchObject({ maxFeePerGas: '8000000', maxPriorityFeePerGas: '1000000' });
});
it('pauses before signing when the accepted ceiling cannot cover the network minimum', async () => {
  await expect(
    quoteNetworkFees(reader(), { ...limits, maxFeePerGas: '5999999' }),
  ).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
    outcome: 'not_dispatched',
  });
});
it('does not use malformed or negative RPC fee estimates', async () => {
  await expect(
    quoteNetworkFees(reader('0x1', '0x1', true), limits),
  ).rejects.toThrow();
  await expect(quoteNetworkFees(reader('-1'), limits)).rejects.toThrow();
});

it('bounds a recommended tip without treating it as a mandatory minimum', async () => {
  expect(
    await quoteNetworkFees(reader('0x4c4b40', '0x2faf080'), limits),
  ).toMatchObject({
    baseFeePerGas: '5000000',
    maxFeePerGas: '20000000',
    maxPriorityFeePerGas: '10000000',
  });
  await expect(
    quoteNetworkFees(reader('0x4c4b40', '0x2faf080'), {
      ...limits,
      maxFeePerGas: '14999999',
    }),
  ).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
    outcome: 'not_dispatched',
  });
});
