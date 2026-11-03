import { expect, it, vi } from 'vitest';
import { verifiedRpcEndpoint } from '../src/execution/verified-rpc-endpoint.js';
const genesis = '0x' + 'ab'.repeat(32);
it('selects a chain-verified configured fallback after a 429 using read calls only', async () => {
  const request = vi.fn<typeof fetch>(async (url, init) => {
    const body = JSON.parse(String(init?.body));
    return String(url).includes('primary')
      ? new Response('{}', { status: 429, headers: { 'retry-after': '30' } })
      : new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result:
              body.method === 'eth_chainId' ? '0x2105' : { hash: genesis },
          }),
        );
  });
  expect(
    await verifiedRpcEndpoint({
      endpoints: [
        'https://primary.example.test',
        'https://fallback.example.test',
      ],
      request,
      chainId: 8453,
      genesisHash: genesis,
    }),
  ).toBe('https://fallback.example.test');
  expect(
    request.mock.calls.every(([, init]) =>
      ['eth_chainId', 'eth_getBlockByNumber'].includes(
        JSON.parse(String(init?.body)).method,
      ),
    ),
  ).toBe(true);
  const prior = request.mock.calls.filter(([url]) =>
    String(url).includes('primary'),
  ).length;
  await verifiedRpcEndpoint({
    endpoints: [
      'https://primary.example.test',
      'https://fallback.example.test',
    ],
    request,
    chainId: 8453,
    genesisHash: genesis,
  });
  expect(
    request.mock.calls.filter(([url]) => String(url).includes('primary'))
      .length,
  ).toBe(prior);
});
it('rejects wrong identity without treating it as an availability failure', async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: body.method === 'eth_chainId' ? '0x1' : { hash: genesis },
      }),
    );
  });
  await expect(
    verifiedRpcEndpoint({
      endpoints: ['https://wrong.example.test', 'https://other.example.test'],
      request,
      chainId: 8453,
      genesisHash: genesis,
    }),
  ).rejects.toMatchObject({ code: 'wallet_provider_configuration' });
  expect(
    request.mock.calls.some(([url]) => String(url).includes('other')),
  ).toBe(false);
});
