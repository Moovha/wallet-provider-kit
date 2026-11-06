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

it('shares a verified genesis with state readers while checking the current chain on every selection', async () => {
  const { RpcReader } = await import('../src/execution/chain.js');
  let chain = '0x2105';
  const methods: string[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    methods.push(body.method);
    return Response.json({
      jsonrpc: '2.0',
      id: body.id,
      result: body.method === 'eth_chainId' ? chain : { hash: genesis },
    });
  });
  const options = {
    endpoints: ['https://shared.example.test'],
    request,
    chainId: 8453,
    genesisHash: genesis,
  };
  await verifiedRpcEndpoint(options);
  const reader = new RpcReader(
    options.endpoints[0],
    request,
    4,
    true,
    'endpoint-failover',
  );
  const duplicate = vi.fn(async () => {
    throw new Error('duplicate genesis lookup');
  });
  await reader.verifyGenesis(genesis, duplicate);
  await verifiedRpcEndpoint(options);
  expect(duplicate).not.toHaveBeenCalled();
  expect(
    methods.filter((method) => method === 'eth_getBlockByNumber'),
  ).toHaveLength(1);
  expect(methods.filter((method) => method === 'eth_chainId')).toHaveLength(2);
  chain = '0x1';
  await expect(verifiedRpcEndpoint(options)).rejects.toMatchObject({
    code: 'wallet_provider_configuration',
  });
});
