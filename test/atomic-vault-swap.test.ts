import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  JsonRpcProvider,
  ContractFactory,
  Contract,
  type InterfaceAbi,
  ZeroAddress,
  ZeroHash,
  keccak256,
} from 'ethers';
import solc from 'solc';
import {
  atomicVaultSwapCalls,
  encodeDexSwapRoute,
  encodeV3AdapterData,
  encodeV4AdapterData,
  encodeSlipstreamAdapterData,
  encodeAerodromeAdapterData,
  type AtomicDexStep,
  atomicSwapQuote,
  atomicSwapMinimum,
  encodeV3SwapPath,
  encodeV4SwapPath,
  type AtomicSwapRequest,
  type AtomicV4Pool,
} from '../src/execution/atomic-vault-swap.js';
let child: ChildProcess,
  provider: JsonRpcProvider,
  input: Contract,
  output: Contract,
  middle: Contract,
  source: Contract,
  destination: Contract,
  middleVault: Contract,
  permit: Contract,
  router: Contract,
  helper: Contract,
  owner: string,
  snapshot: string;
let adapters: Contract[], longTokens: Contract[];
let deploy: (name: string, args?: unknown[]) => Promise<Contract>;
beforeAll(async () => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((r) => socket.close(() => r()));
  child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/@foundry-rs/anvil/bin.mjs', import.meta.url),
      ),
      '--silent',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { stdio: 'ignore', env: { ...process.env, TARGET_TOOL: 'anvil' } },
  );
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(origin, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
      });
      if (((await r.json()) as { result?: unknown }).result !== '0x7a69')
        throw Error('Wrong fixture chain');
      break;
    } catch (e) {
      if (i >= 100) throw e;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  provider = new JsonRpcProvider(origin, 31337, {
    staticNetwork: true,
    cacheTimeout: -1,
    pollingInterval: 20,
  });
  const sources: Record<string, { content: string }> = {};
  for (const [name, path] of [
    ['AtomicVaultSwap.sol', '../contracts/AtomicVaultSwap.sol'],
    ['DexAdapters.sol', '../contracts/DexAdapters.sol'],
    ['vendor/Math.sol', '../contracts/vendor/Math.sol'],
    ['Mock.sol', './helpers/solidity/MockVaultSwap.sol'],
  ])
    sources[name] = {
      content: await readFile(new URL(path, import.meta.url), 'utf8'),
    };
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: 'cancun',
          outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
        },
      }),
    ),
  ) as {
    errors?: { severity: string }[];
    contracts: Record<
      string,
      Record<
        string,
        { abi: InterfaceAbi; evm: { bytecode: { object: string } } }
      >
    >;
  };
  expect(compiled.errors?.filter((e) => e.severity === 'error') ?? []).toEqual(
    [],
  );
  const signer = await provider.getSigner();
  owner = await signer.getAddress();
  deploy = async (name, args = []) => {
    const a = Object.values(compiled.contracts).find((cs) => cs[name])![name];
    const c = await new ContractFactory(
      a.abi,
      '0x' + a.evm.bytecode.object,
      signer,
    ).deploy(...args);
    await c.waitForDeployment();
    return new Contract(await c.getAddress(), a.abi, signer);
  };
  input = await deploy('VaultSwapTokenFixture');
  output = await deploy('VaultSwapTokenFixture');
  middle = await deploy('VaultSwapTokenFixture');
  source = await deploy('VaultSwapVaultFixture', [await input.getAddress()]);
  destination = await deploy('VaultSwapVaultFixture', [
    await output.getAddress(),
  ]);
  middleVault = await deploy('VaultSwapVaultFixture', [
    await middle.getAddress(),
  ]);
  permit = await deploy('VaultSwapPermitFixture');
  router = await deploy('VaultSwapRouterFixture', [await permit.getAddress()]);
  helper = await deploy('AtomicVaultSwap', [
    await router.getAddress(),
    await router.getAddress(),
    await permit.getAddress(),
    200,
    120,
  ]);
  adapters = [];
  for (const name of [
    'UniswapV3DexAdapter',
    'UniswapV4DexAdapter',
    'AerodromeSlipstreamDexAdapter',
    'AerodromeClassicDexAdapter',
  ]) {
    const adapter = await deploy(
      name,
      name === 'UniswapV4DexAdapter'
        ? [router.target, permit.target]
        : [router.target],
    );
    adapters.push(adapter);
    await (
      await helper.getFunction('configureAdapter')(
        adapter.target,
        keccak256(await provider.getCode(adapter.target as string)),
      )
    ).wait();
  }
  longTokens = [input];
  for (let i = 0; i < 11; i++)
    longTokens.push(await deploy('VaultSwapTokenFixture'));
  longTokens.push(output);
  for (const c of longTokens.slice(1, -1)) {
    await (await c.getFunction('mint')(router.target, 100000n)).wait();
    await (await c.getFunction('mint')(helper.target, 13n)).wait();
    for (const a of adapters)
      await (await c.getFunction('mint')(a.target, 7n)).wait();
  }
  for (const a of adapters) {
    await (await input.getFunction('mint')(a.target, 7n)).wait();
    await (await output.getFunction('mint')(a.target, 9n)).wait();
  }
  for (const [c, who, n] of [
    [source, owner, 1000n],
    [source, await helper.getAddress(), 11n],
    [input, await source.getAddress(), 10000n],
    [input, owner, 1000n],
    [input, await helper.getAddress(), 17n],
    [output, await helper.getAddress(), 19n],
    ...[input, output, middle].map((c) => [c, router.target, 100000n] as const),
  ] as const)
    await (await (c as Contract).getFunction('mint')(who, n)).wait();
  for (const c of [input, source])
    await (
      await c.getFunction('approve')(await helper.getAddress(), 10000n)
    ).wait();
}, 60000);
beforeEach(async () => {
  snapshot = await provider.send('evm_snapshot', []);
});
afterEach(async () => {
  await provider.send('evm_revert', [snapshot]);
});
afterAll(async () => {
  provider?.destroy();
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});
async function pool(a: Contract, b: Contract): Promise<AtomicV4Pool> {
  const [currency0, currency1] = [
    await a.getAddress(),
    await b.getAddress(),
  ].sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : 1));
  return { currency0, currency1, fee: 3000, tickSpacing: 60 };
}
async function request(
  protocol: 3 | 4 = 4,
  direct = false,
): Promise<AtomicSwapRequest> {
  const now = (await provider.getBlock('latest'))!.timestamp;
  return {
    tokenIn: await input.getAddress(),
    tokenOut: await output.getAddress(),
    sourceVault: direct ? undefined : await source.getAddress(),
    destinationVault: direct ? undefined : await destination.getAddress(),
    amount: 100n,
    protocol,
    path:
      protocol === 3
        ? encodeV3SwapPath(
            [await input.getAddress(), await output.getAddress()],
            [3000],
          )
        : encodeV4SwapPath([await pool(input, output)]),
    quote: atomicSwapQuote({
      assetsIn: direct ? 100n : 200n,
      assetsOut: direct ? 300n : 600n,
      amountOut: 300n,
      slippageBps: 100,
      quotedAt: BigInt(now),
      ttlSeconds: 120,
    }),
  };
}
function tuple(r: AtomicSwapRequest) {
  return {
    ...r,
    sourceVault: r.sourceVault ?? ZeroAddress,
    destinationVault: r.destinationVault ?? ZeroAddress,
  };
}
async function execute(r: AtomicSwapRequest) {
  return (
    await helper.getFunction('execute')(tuple(r), { gasLimit: 2500000 })
  ).wait();
}
async function unchanged() {
  expect(await source.getFunction('balanceOf')(owner)).toBe(1000n);
  expect(await destination.getFunction('balanceOf')(owner)).toBe(0n);
  expect(await input.getFunction('balanceOf')(await helper.getAddress())).toBe(
    17n,
  );
  expect(await output.getFunction('balanceOf')(await helper.getAddress())).toBe(
    19n,
  );
  expect(
    await source.getFunction('allowance')(owner, await helper.getAddress()),
  ).toBe(10000n);
}
it.each([3, 4] as const)(
  'chains actual amounts and cleans approvals for v%s',
  async (protocol) => {
    const r = await request(protocol);
    const receipt = await execute(r);
    const e = receipt.logs
      .map((l: { topics: string[]; data: string }) => {
        try {
          return helper.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e: { name: string } | null) => e?.name === 'AtomicSwap');
    expect(e.args.assetsIn).toBe(200n);
    expect(e.args.assetsOut).toBe(600n);
    expect(e.args.amountOut).toBe(300n);
    expect(
      await source.getFunction('balanceOf')(await helper.getAddress()),
    ).toBe(11n);
    expect(
      await input.getFunction('balanceOf')(await helper.getAddress()),
    ).toBe(17n);
    expect(
      await output.getFunction('balanceOf')(await helper.getAddress()),
    ).toBe(19n);
    expect(await destination.getFunction('balanceOf')(owner)).toBe(300n);
    for (const spender of [
      await router.getAddress(),
      await permit.getAddress(),
    ])
      expect(
        await input.getFunction('allowance')(
          await helper.getAddress(),
          spender,
        ),
      ).toBe(0n);
    expect(
      await permit.getFunction('allowance')(
        await helper.getAddress(),
        await input.getAddress(),
        await router.getAddress(),
      ),
    ).toBe(0n);
    expect(
      await output.getFunction('allowance')(
        await helper.getAddress(),
        await destination.getAddress(),
      ),
    ).toBe(0n);
  },
);
it.each([3, 4] as const)(
  'supports direct ERC20 inputs and outputs for v%s',
  async (protocol) => {
    await execute(await request(protocol, true));
    expect(await input.getFunction('balanceOf')(owner)).toBe(900n);
    expect(await output.getFunction('balanceOf')(owner)).toBe(300n);
  },
);
it.each([3, 4] as const)(
  'routes through a third asset in v%s without spending intermediate dust',
  async (protocol) => {
    const r = await request(protocol);
    r.tokenOut = await middle.getAddress();
    r.destinationVault = await middleVault.getAddress();
    r.path =
      protocol === 3
        ? encodeV3SwapPath(
            [
              await input.getAddress(),
              await output.getAddress(),
              await middle.getAddress(),
            ],
            [3000, 500],
          )
        : encodeV4SwapPath([
            await pool(input, output),
            await pool(output, middle),
          ]);
    r.quote.assetsOut = 1800n;
    r.quote.amountOut = 900n;
    await execute(r);
    expect(await middleVault.getFunction('balanceOf')(owner)).toBe(900n);
    expect(
      await output.getFunction('balanceOf')(await helper.getAddress()),
    ).toBe(19n);
  },
);
it.each([
  'redemption',
  'swap',
  'deposit',
  'scaled swap',
  'scaled deposit',
  'expired',
  'future',
  'old quote',
  'tolerance',
  'route',
  'partial input',
  'reentry',
])('reverts every effect on %s protection failure', async (failure) => {
  const r = await request();
  if (failure === 'redemption')
    await (await source.getFunction('setRates')(9800, 10000)).wait();
  if (failure === 'swap')
    await (await router.getFunction('setRate')(29000)).wait();
  if (failure === 'deposit')
    await (await destination.getFunction('setRates')(10000, 9800)).wait();
  if (failure === 'scaled swap') {
    await (await source.getFunction('setRates')(12000, 10000)).wait();
    await (await router.getFunction('setRate')(29000)).wait();
  }
  if (failure === 'scaled deposit') {
    await (await router.getFunction('setRate')(40000)).wait();
    await (await destination.getFunction('setRates')(10000, 8000)).wait();
  }
  if (failure === 'expired') {
    r.quote.quotedAt = 1n;
    r.quote.deadline = 2n;
  }
  if (failure === 'future') {
    r.quote.quotedAt += 1000n;
    r.quote.deadline += 1000n;
  }
  if (failure === 'old quote') r.quote.deadline += 1n;
  if (failure === 'tolerance') r.quote.slippageBps = 201;
  if (failure === 'route') r.tokenOut = await middle.getAddress();
  if (failure === 'partial input')
    await (await router.getFunction('setPartialInput')(true)).wait();
  if (failure === 'reentry')
    await (await router.getFunction('setReenter')(true)).wait();
  await expect(execute(r)).rejects.toThrow();
  await unchanged();
  expect(
    await permit.getFunction('allowance')(
      await helper.getAddress(),
      await input.getAddress(),
      await router.getAddress(),
    ),
  ).toBe(0n);
});
it('accepts favorable redemption changes while scaling the swap and deposit floors', async () => {
  await (await source.getFunction('setRates')(12000, 10000)).wait();
  await execute(await request());
  expect(await destination.getFunction('balanceOf')(owner)).toBe(360n);
});
it('uses full precision above 256-bit multiplication and rounds floors upward', async () => {
  const max = 2n ** 128n - 1n;
  await (await input.getFunction('mint')(owner, max)).wait();
  await (
    await output.getFunction('mint')(await router.getAddress(), max)
  ).wait();
  await (
    await input.getFunction('approve')(await helper.getAddress(), max)
  ).wait();
  await (await router.getFunction('setRate')(10000)).wait();
  const r = await request(3, true);
  r.amount = max;
  r.quote.assetsIn = max;
  r.quote.assetsOut = max;
  r.quote.amountOut = max;
  await execute(r);
  expect(await output.getFunction('balanceOf')(owner)).toBe(max);
  expect(atomicSwapMinimum(1n, 1n, 3n, 100)).toBe(1n);
});
it('limits execution to the caller funds', async () => {
  await expect(
    helper.connect(await provider.getSigner(1)).getFunction('execute')(
      tuple(await request()),
    ),
  ).rejects.toThrow();
  await unchanged();
});
it('builds canonical wallet calls and rejects disconnected, cyclic, oversized and mismatched quote paths', async () => {
  const r = await request();
  const calls = atomicVaultSwapCalls({
    ...r,
    helper: await helper.getAddress(),
  });
  expect(calls).toHaveLength(4);
  expect(
    helper.interface.decodeFunctionData('execute', calls[2].data)[0].amount,
  ).toBe(100n);
  expect(() =>
    atomicVaultSwapCalls({
      ...r,
      helper: helper.target as string,
      tokenOut: middle.target as string,
    }),
  ).toThrow();
  expect(() =>
    encodeV3SwapPath(
      [input.target as string, output.target as string, input.target as string],
      [3000, 3000],
    ),
  ).toThrow();
  expect(() =>
    atomicSwapQuote({
      assetsIn: 1n,
      assetsOut: 1n,
      amountOut: 1n,
      slippageBps: 1001,
    }),
  ).toThrow();
  expect(() =>
    atomicVaultSwapCalls({ ...r, helper: helper.target as string, amount: 0n }),
  ).toThrow();
});

it.each([3, 4] as const)(
  'supports source-only and destination-only wrappers in v%s',
  async (protocol) => {
    const sourceOnly = await request(protocol);
    sourceOnly.destinationVault = undefined;
    sourceOnly.quote.amountOut = sourceOnly.quote.assetsOut;
    await execute(sourceOnly);
    expect(await output.getFunction('balanceOf')(owner)).toBe(600n);
    const destinationOnly = await request(protocol, true);
    destinationOnly.destinationVault = await destination.getAddress();
    destinationOnly.quote.amountOut = 150n;
    await execute(destinationOnly);
    expect(await destination.getFunction('balanceOf')(owner)).toBe(150n);
  },
);

async function adapterData(index: number, a: Contract, b: Contract) {
  if (index === 0) return encodeV3AdapterData(3000);
  if (index === 1) return encodeV4AdapterData(await pool(a, b));
  if (index === 2) return encodeSlipstreamAdapterData(10);
  return encodeAerodromeAdapterData(true, router.target as string);
}
async function mixedRequest(hops: number) {
  await (await router.getFunction('setRate')(10000)).wait();
  const tokens = [input, ...longTokens.slice(1, hops), output];
  const steps: AtomicDexStep[] = [];
  for (let i = 0; i < hops; i++) {
    const index = i % adapters.length;
    steps.push({
      adapter: adapters[index].target as string,
      tokenOut: tokens[i + 1].target as string,
      data: await adapterData(index, tokens[i], tokens[i + 1]),
    });
  }
  const r = await request();
  r.protocol = 5;
  r.path = encodeDexSwapRoute(steps);
  r.quote.assetsOut = 200n;
  r.quote.amountOut = 100n;
  return { r, steps, tokens };
}
it.each([0, 1, 2, 3])(
  'executes approved DEX adapter %s and preserves adapter dust',
  async (index) => {
    const r = await request();
    r.protocol = 5;
    r.path = encodeDexSwapRoute([
      {
        adapter: adapters[index].target as string,
        tokenOut: output.target as string,
        data: await adapterData(index, input, output),
      },
    ]);
    await execute(r);
    expect(await destination.getFunction('balanceOf')(owner)).toBe(300n);
    expect(await input.getFunction('balanceOf')(adapters[index].target)).toBe(
      7n,
    );
    expect(await output.getFunction('balanceOf')(adapters[index].target)).toBe(
      9n,
    );
    for (const spender of [router.target, permit.target])
      expect(
        await input.getFunction('allowance')(adapters[index].target, spender),
      ).toBe(0n);
    expect(
      await input.getFunction('allowance')(
        helper.target,
        adapters[index].target,
      ),
    ).toBe(0n);
    if (index === 3) {
      expect(await router.getFunction('lastStable')()).toBe(true);
      expect(await router.getFunction('lastFactory')()).toBe(router.target);
    }
  },
);
it.each([6, 12])(
  'executes %s mixed DEX hops atomically with actual amounts and no residual allowances',
  async (hops) => {
    const { r, steps, tokens } = await mixedRequest(hops);
    const calls = atomicVaultSwapCalls({
      ...r,
      helper: helper.target as string,
    });
    if (hops === 12)
      expect((calls[2].data.length - 2) / 2).toBeLessThanOrEqual(4096);
    const receipt = await execute(r);
    expect(receipt.status).toBe(1);
    console.log(
      JSON.stringify({
        routeHops: hops,
        network: 'local EVM fixture',
        gasUsed: receipt.gasUsed.toString(),
        calldataBytes: (calls[2].data.length - 2) / 2,
      }),
    );
    expect(await router.getFunction('callCount')()).toBe(BigInt(hops));
    expect(await destination.getFunction('balanceOf')(owner)).toBe(100n);
    for (let i = 0; i < hops; i++) {
      expect(
        await tokens[i].getFunction('allowance')(
          helper.target,
          steps[i].adapter,
        ),
      ).toBe(0n);
      expect(
        await tokens[i].getFunction('allowance')(
          steps[i].adapter,
          router.target,
        ),
      ).toBe(0n);
      expect(
        await tokens[i].getFunction('allowance')(
          steps[i].adapter,
          permit.target,
        ),
      ).toBe(0n);
      expect(
        await permit.getFunction('allowance')(
          steps[i].adapter,
          tokens[i].target,
          router.target,
        ),
      ).toBe(0n);
    }
    for (const token of tokens.slice(1, -1)) {
      expect(await token.getFunction('balanceOf')(helper.target)).toBe(13n);
      for (const a of adapters)
        expect(await token.getFunction('balanceOf')(a.target)).toBe(7n);
    }
  },
);
it.each([3, 4] as const)(
  'removes the fixed hop cap from existing v%s routes',
  async (protocol) => {
    await (await router.getFunction('setRate')(10000)).wait();
    const tokens = [input, ...longTokens.slice(1, 6), output];
    const r = await request(protocol);
    r.path =
      protocol === 3
        ? encodeV3SwapPath(
            tokens.map((t) => t.target as string),
            Array(6).fill(3000),
          )
        : encodeV4SwapPath(
            await Promise.all(
              tokens.slice(0, -1).map((t, i) => pool(t, tokens[i + 1])),
            ),
          );
    r.quote.assetsOut = 200n;
    r.quote.amountOut = 100n;
    atomicVaultSwapCalls({ ...r, helper: helper.target as string });
    await execute(r);
    expect(await destination.getFunction('balanceOf')(owner)).toBe(100n);
  },
);
it.each([
  'unapproved',
  'revoked',
  'changed adapter',
  'changed router',
  'changed permit2',
  'malformed data',
  'cycle',
  'wrong output',
  'final swap',
  'deposit',
  'partial input',
  'reentry',
])('rolls back a long mixed route on %s', async (failure) => {
  const { r, steps } = await mixedRequest(6);
  if (failure === 'unapproved') steps[4].adapter = router.target as string;
  if (failure === 'revoked')
    await (
      await helper.getFunction('configureAdapter')(adapters[0].target, ZeroHash)
    ).wait();
  if (failure === 'changed adapter')
    await provider.send('anvil_setCode', [adapters[0].target, '0x00']);
  if (failure === 'changed router')
    await provider.send('anvil_setCode', [router.target, '0x00']);
  if (failure === 'changed permit2')
    await provider.send('anvil_setCode', [permit.target, '0x00']);
  if (failure === 'malformed data') steps[4].data = '0x00';
  if (failure === 'cycle') steps[4].tokenOut = input.target as string;
  if (failure === 'wrong output') r.tokenOut = middle.target as string;
  if (failure === 'final swap') {
    r.quote.assetsOut = 300n;
    r.quote.amountOut = 150n;
  }
  if (failure === 'deposit')
    await (await destination.getFunction('setRates')(10000, 9800)).wait();
  if (failure === 'partial input')
    await (await router.getFunction('setPartialInput')(true)).wait();
  if (failure === 'reentry') {
    await (await router.getFunction('setReentryTarget')(helper.target)).wait();
    await (await router.getFunction('setReenter')(true)).wait();
  }
  // Encode directly to exercise contract validation even when the SDK would reject the request.
  const { AbiCoder } = await import('ethers');
  r.path = AbiCoder.defaultAbiCoder().encode(
    ['tuple(address adapter,address tokenOut,bytes data)[]'],
    [steps],
  );
  if (failure === 'reentry')
    await expect(
      helper.getFunction('execute').staticCall(tuple(r)),
    ).rejects.toThrow('Reentered');
  await expect(execute(r)).rejects.toThrow();
  await unchanged();
  if (failure !== 'changed router')
    expect(await router.getFunction('callCount')()).toBe(0n);
  for (const token of longTokens.slice(1, -1))
    expect(await token.getFunction('balanceOf')(helper.target)).toBe(13n);
});
it('restricts adapter approvals to the deployment administrator and validates exact code hashes', async () => {
  await expect(
    helper.connect(await provider.getSigner(1)).getFunction('configureAdapter')(
      adapters[0].target,
      ZeroHash,
    ),
  ).rejects.toThrow();
  await expect(
    helper.getFunction('configureAdapter')(
      adapters[0].target,
      '0x' + '11'.repeat(32),
    ),
  ).rejects.toThrow();
  await expect(
    helper.getFunction('configureAdapter')(owner, keccak256('0x')),
  ).rejects.toThrow();
  await (
    await helper.getFunction('configureAdapter')(adapters[0].target, ZeroHash)
  ).wait();
  expect(await helper.getFunction('approvedAdapters')(adapters[0].target)).toBe(
    ZeroHash,
  );
});

it.each([0, 1, 2, 3])(
  'rejects malformed protocol-specific data for adapter %s with full rollback',
  async (index) => {
    const r = await request();
    r.protocol = 5;
    const { AbiCoder } = await import('ethers');
    const coder = AbiCoder.defaultAbiCoder();
    const data =
      index === 0
        ? coder.encode(['uint24'], [0])
        : index === 1
          ? encodeV4AdapterData(await pool(input, middle))
          : index === 2
            ? coder.encode(['int24'], [-1])
            : coder.encode(['bool', 'address'], [false, owner]);
    r.path = encodeDexSwapRoute([
      {
        adapter: adapters[index].target as string,
        tokenOut: output.target as string,
        data,
      },
    ]);
    await expect(execute(r)).rejects.toThrow();
    await unchanged();
  },
);
it('does not let a stranger spend adapter dust or bypass expired deadlines', async () => {
  const adapter = adapters[0].connect(await provider.getSigner(1));
  const now = (await provider.getBlock('latest'))!.timestamp;
  await expect(
    adapter.getFunction('swap')(
      input.target,
      output.target,
      1,
      1,
      now + 60,
      encodeV3AdapterData(3000),
    ),
  ).rejects.toThrow();
  await expect(
    adapters[0].getFunction('swap')(
      input.target,
      output.target,
      1,
      1,
      1,
      encodeV3AdapterData(3000),
    ),
  ).rejects.toThrow();
  expect(await input.getFunction('balanceOf')(adapters[0].target)).toBe(7n);
  expect(await output.getFunction('balanceOf')(adapters[0].target)).toBe(9n);
});
