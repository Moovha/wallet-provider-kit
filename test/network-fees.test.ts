import { expect, it } from 'vitest';
import { RpcReader } from '../src/execution/chain.js';
import { quoteNetworkFees } from '../src/execution/network-fees.js';
const limits = { maxFeePerGas: '1000000000', maxPriorityFeePerGas: '10000000' };
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

it('pauses rather than lowering a network tip to the configured limit', async () => {
  await expect(
    quoteNetworkFees(reader('0x4c4b40', '0x2faf080'), limits),
  ).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
    outcome: 'not_dispatched',
    reason: 'network_fee_limit',
  });
  expect(
    await quoteNetworkFees(reader('0x4c4b40', '0x2faf080'), {
      maxFeePerGas: '1000000000',
      maxPriorityFeePerGas: '50000000',
    }),
  ).toMatchObject({
    baseFeePerGas: '5000000',
    maxFeePerGas: '60000000',
    maxPriorityFeePerGas: '50000000',
  });
});
