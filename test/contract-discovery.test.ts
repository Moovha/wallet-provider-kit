import { describe, expect, it, vi } from 'vitest';
import { keccak256 } from 'ethers';
import { discoverContract, parseAbi } from '../setup-ui/contract-discovery.js';
const address = '0x1111111111111111111111111111111111111111';
const implementation = '0x2222222222222222222222222222222222222222';
const abi = [
  'function deposit(uint256,address) payable',
  'function withdraw(uint256)',
  'function withdraw(address,uint256)',
  'function balanceOf(address) view returns (uint256)',
  'event Deposit(address indexed owner)',
];
const metadata = (overrides = {}) => ({
  chainId: '84532',
  address,
  runtimeMatch: 'exact_match',
  runtimeBytecode: { onchainBytecode: '0x6001600055' },
  abi,
  proxyResolution: { isProxy: false },
  ...overrides,
});

describe('contract method discovery', () => {
  it('retains overloads and canonical tuple signatures, excludes non-functions and accepts compiler artifacts', () => {
    expect(
      parseAbi(
        JSON.stringify({
          abi: [...abi, 'function put(tuple(uint,address)[] values)'],
        }),
      ).map((method) => method.signature),
    ).toEqual([
      'balanceOf(address)',
      'deposit(uint256,address)',
      'put((uint256,address)[])',
      'withdraw(address,uint256)',
      'withdraw(uint256)',
    ]);
    expect(
      parseAbi(JSON.stringify(abi)).find((method) =>
        method.signature.startsWith('deposit'),
      )?.mutability,
    ).toBe('payable');
  });
  it('rejects malformed, oversized and ambiguous ABIs instead of silently selecting partial methods', () => {
    for (const input of [
      'not JSON',
      '{}',
      '[]',
      JSON.stringify(['event E()']),
      JSON.stringify([
        'function valid()',
        { type: 'function', name: 'invalid', inputs: [{ type: 'unknown' }] },
      ]),
      JSON.stringify([
        'function burn(uint256)',
        'function collate_propagate_storage(bytes16)',
      ]),
    ])
      expect(() => parseAbi(input)).toThrow();
    expect(() => parseAbi(' '.repeat(512 * 1024 + 1))).toThrow(/512 KiB/);
  });
  it('fetches only fixed Base Sepolia metadata without credentials, redirects or referrers', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(metadata()));
    const result = await discoverContract(address, fetcher);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      `https://sourcify.dev/server/v2/contract/84532/${address}?fields=abi,runtimeBytecode.onchainBytecode,proxyResolution`,
    );
    expect(options).toMatchObject({
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    expect(options?.headers).toBeUndefined();
    expect(options?.body).toBeUndefined();
    expect(result).toMatchObject({
      code_hash: keccak256('0x6001600055'),
      methods: expect.arrayContaining([
        {
          signature: 'deposit(uint256,address)',
          selector: '0x6e553f65',
          mutability: 'payable',
        },
      ]),
    });
  });
  it('imports a single EIP-1967 implementation with separate proxy and implementation bytecode pins', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          metadata({
            abi: ['function admin() view returns (address)'],
            proxyResolution: {
              isProxy: true,
              proxyType: 'EIP1967Proxy',
              implementations: [{ address: implementation }],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          metadata({
            address: implementation,
            runtimeBytecode: { onchainBytecode: '0x6002' },
          }),
        ),
      );
    const result = await discoverContract(address, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.implementation).toEqual({
      address: implementation,
      code_hash: keccak256('0x6002'),
    });
    expect(result.methods.map((method) => method.signature)).toContain(
      'admin()',
    );
    expect(result.methods.map((method) => method.signature)).toContain(
      'deposit(uint256,address)',
    );
  });
  it.each([
    { chainId: '1' },
    { address: implementation },
    { runtimeMatch: null },
    { runtimeBytecode: { onchainBytecode: '0x' } },
    { proxyResolution: null },
    { proxyResolution: { isProxy: false, error: 'RPC unavailable' } },
    {
      proxyResolution: {
        isProxy: true,
        proxyType: 'DiamondProxy',
        implementations: [{ address: implementation }],
      },
    },
  ])(
    'rejects incomplete or unsupported metadata %j without following external references',
    async (override) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        Response.json(metadata(override)),
      );
      await expect(discoverContract(address, fetcher)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('bounds response size and handles unavailable verification without guessing a method list', async () => {
    await expect(
      discoverContract(
        address,
        async () => new Response(null, { status: 404 }),
      ),
    ).rejects.toThrow(/No Sourcify verification/);
    await expect(
      discoverContract(address, async () =>
        Response.json(metadata(), { headers: { 'content-length': '524289' } }),
      ),
    ).rejects.toThrow(/512 KiB/);
    await expect(
      discoverContract(address, async () => new Response(' '.repeat(524289))),
    ).rejects.toThrow(/512 KiB/);
    await expect(
      discoverContract('https://example.test', vi.fn()),
    ).rejects.toThrow(/address/);
  });
});
