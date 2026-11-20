import { expect, it } from 'vitest';
import { RpcReader } from '../src/execution/chain.js';
const filter = {
  address: '0x' + '1'.repeat(40),
  fromBlock: '0x64',
  toBlock: '0x15f',
  topics: ['0x' + 'a'.repeat(64)],
};
function fixture(failPage = false, rangeError = true) {
  const seen: Record<string, unknown>[] = [];
  const transport = (async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    expect(body.method).toBe('eth_getLogs');
    const f = body.params[0];
    seen.push(f);
    const from = BigInt(f.fromBlock),
      to = BigInt(f.toBlock);
    if (to - from + 1n > 100n)
      return Response.json(
        {
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: 35,
            message: rangeError
              ? 'Free block range restriction'
              : 'Other upstream failure',
          },
        },
        { status: 400 },
      );
    if (failPage && from === 200n)
      return Response.json(
        {
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32000, message: 'Unavailable' },
        },
        { status: 400 },
      );
    return Response.json({
      jsonrpc: '2.0',
      id: 1,
      result: [
        { blockNumber: f.fromBlock, address: f.address, topics: f.topics },
      ],
    });
  }) as typeof fetch;
  return {
    seen,
    reader: () =>
      new RpcReader(
        'https://rpc.example.test',
        transport,
        4,
        true,
        'endpoint-failover',
      ),
  };
}
it('covers every original block exactly and shares the learned page bound across readers', async () => {
  const f = fixture();
  const result = await f.reader().call('eth_getLogs', [filter]);
  expect(result).toHaveLength(3);
  expect(f.seen.map((v) => [v.fromBlock, v.toBlock])).toEqual([
    ['0x64', '0x15f'],
    ['0x64', '0xc7'],
    ['0xc8', '0x12b'],
    ['0x12c', '0x15f'],
  ]);
  expect(
    f.seen.every(
      (v) =>
        v.address === filter.address &&
        JSON.stringify(v.topics) === JSON.stringify(filter.topics),
    ),
  ).toBe(true);
  await f.reader().call('eth_getLogs', [filter]);
  expect(f.seen).toHaveLength(7);
});
it('fails the whole scan when a later page fails, without returning partial absence evidence', async () => {
  const f = fixture(true);
  await expect(f.reader().call('eth_getLogs', [filter])).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
  expect(f.seen).toHaveLength(3);
});
it('does not subdivide unrelated errors or unbounded requests', async () => {
  const f = fixture(false, false);
  await expect(f.reader().call('eth_getLogs', [filter])).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
  expect(f.seen).toHaveLength(1);
  const bounded = fixture();
  await expect(
    bounded
      .reader()
      .call('eth_getLogs', [
        { ...filter, fromBlock: '0x0', toBlock: '0x10000' },
      ]),
  ).rejects.toMatchObject({ code: 'wallet_provider_unavailable' });
  expect(bounded.seen).toHaveLength(1);
});
