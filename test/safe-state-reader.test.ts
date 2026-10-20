import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  JsonRpcProvider,
  Interface,
  ContractFactory,
  keccak256,
  type BaseContract,
  type InterfaceAbi,
} from 'ethers';
import solc from 'solc';
import { RpcReader } from '../src/execution/chain.js';
import { readSafe4337State } from '../src/execution/safe-state-reader.js';
import type { SafeAccountBinding } from '../src/execution/approved-calls.js';
let processHandle: ChildProcess,
  provider: JsonRpcProvider,
  contract: BaseContract,
  binding: SafeAccountBinding,
  owner: string,
  reader: RpcReader,
  entryPointFixture: BaseContract,
  moduleFixture: BaseContract;
beforeAll(async () => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((r) => socket.close(() => r()));
  const executable = fileURLToPath(
    new URL('../node_modules/@foundry-rs/anvil/bin.mjs', import.meta.url),
  );
  processHandle = spawn(
    process.execPath,
    [executable, '--silent', '--host', '127.0.0.1', '--port', String(port)],
    { stdio: 'ignore', env: { ...process.env, TARGET_TOOL: 'anvil' } },
  );
  const origin = 'http://127.0.0.1:' + port;
  for (let attempt = 0; ; attempt++) {
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
      expect(((await r.json()) as { result: string }).result).toBe('0x7a69');
      break;
    } catch (error) {
      if (attempt > 100 || processHandle.exitCode !== null) throw error;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  provider = new JsonRpcProvider(origin, 31337, {
    staticNetwork: true,
    batchMaxCount: 1,
    cacheTimeout: -1,
  });
  const source = await readFile(
    new URL('./helpers/solidity/MockReadSafe.sol', import.meta.url),
    'utf8',
  );
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources: { 'Mock.sol': { content: source } },
        settings: {
          evmVersion: 'paris',
          outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
        },
      }),
    ),
  ) as {
    contracts: Record<
      string,
      Record<
        string,
        { abi: InterfaceAbi; evm: { bytecode: { object: string } } }
      >
    >;
  };
  const signer = await provider.getSigner();
  owner = await signer.getAddress();
  const singleton = output.contracts['Mock.sol'].ReadSingletonFixture;
  const implementation = await new ContractFactory(
    singleton.abi,
    '0x' + singleton.evm.bytecode.object,
    signer,
  ).deploy();
  await implementation.waitForDeployment();
  const entry = output.contracts['Mock.sol'].ReadEntryPointFixture;
  entryPointFixture = await new ContractFactory(
    entry.abi,
    '0x' + entry.evm.bytecode.object,
    signer,
  ).deploy();
  await entryPointFixture.waitForDeployment();
  const module = output.contracts['Mock.sol'].ReadModuleFixture;
  moduleFixture = await new ContractFactory(
    module.abi,
    '0x' + module.evm.bytecode.object,
    signer,
  ).deploy(await entryPointFixture.getAddress());
  await moduleFixture.waitForDeployment();
  const safe = output.contracts['Mock.sol'].ReadSafeFixture;
  contract = await new ContractFactory(
    safe.abi,
    '0x' + safe.evm.bytecode.object,
    signer,
  ).deploy(owner, await implementation.getAddress());
  await contract.waitForDeployment();
  binding = {
    accountId: randomUUID(),
    address: await contract.getAddress(),
    codeHash: keccak256(await provider.getCode(await contract.getAddress())),
    singleton: {
      address: await implementation.getAddress(),
      codeHash: keccak256(
        await provider.getCode(await implementation.getAddress()),
      ),
    },
  };
  reader = new RpcReader(
    'https://offline.example.test',
    (async (_input, init) => fetch(origin, init)) as typeof fetch,
    4,
  );
}, 15000);
afterAll(async () => {
  provider?.destroy();
  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill('SIGTERM');
    await once(processHandle, 'exit');
  }
});
it('checks the complete ERC-4337 Safe authority and nonce in one read-only call and rejects each changed authority field', async () => {
  const pin = async (contract: BaseContract) => ({
    address: await contract.getAddress(),
    codeHash: keccak256(await provider.getCode(await contract.getAddress())),
  });
  const profile = {
    entryPoint: await pin(entryPointFixture),
    module: await pin(moduleFixture),
  };
  const pins = [binding, binding.singleton, profile.entryPoint, profile.module];
  await (
    await contract.getFunction('configureModule')(profile.module.address)
  ).wait();
  const inspect = (ownerAddress = owner, expected = pins) =>
    readSafe4337State(
      reader,
      binding,
      ownerAddress,
      profile,
      expected,
      'latest',
    );
  try {
    expect(await inspect()).toBe('42');
    for (const fault of [1, 2, 3, 4, 5, 6, 7, 8]) {
      await (await contract.getFunction('configure')(fault)).wait();
      await expect(inspect()).rejects.toThrow();
      await (await contract.getFunction('configure')(0)).wait();
    }
    await expect(
      inspect('0x0000000000000000000000000000000000000010'),
    ).rejects.toThrow();
    await expect(
      inspect(owner, [
        { ...binding, codeHash: '0x' + '1'.repeat(64) },
        ...pins.slice(1),
      ]),
    ).rejects.toThrow();
    await (await entryPointFixture.getFunction('configure')(2n ** 64n)).wait();
    await expect(inspect()).rejects.toThrow();
    await (await entryPointFixture.getFunction('configure')(42)).wait();
    expect(await inspect()).toBe('42');
  } finally {
    await (
      await contract.getFunction('configureModule')(
        '0x0000000000000000000000000000000000000000',
      )
    ).wait();
  }
});

it.each(['owner', 'code'])(
  'batches ten fixed-block inspections and isolates rejected %s evidence without deploying the helper',
  async (fault) => {
    const pin = async (c: BaseContract) => ({
      address: await c.getAddress(),
      codeHash: keccak256(await provider.getCode(await c.getAddress())),
    });
    const profile = {
      entryPoint: await pin(entryPointFixture),
      module: await pin(moduleFixture),
    };
    const pins = [
      binding,
      binding.singleton,
      profile.entryPoint,
      profile.module,
    ];
    await (
      await contract.getFunction('configureModule')(profile.module.address)
    ).wait();
    const tag = '0x' + (await provider.getBlockNumber()).toString(16);
    const spy = vi.spyOn(reader, 'call');
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, index) =>
          readSafe4337State(
            reader,
            binding,
            index === 4 && fault === 'owner'
              ? '0x0000000000000000000000000000000000000010'
              : owner,
            profile,
            index === 4 && fault === 'code'
              ? [
                  { ...binding, codeHash: '0x' + '1'.repeat(64) },
                  ...pins.slice(1),
                ]
              : pins,
            tag,
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(9);
      expect(results[4]).toMatchObject({
        status: 'rejected',
        reason: { code: 'wallet_authorization_denied' },
      });
      for (let i = 0; i < results.length; i++)
        if (i !== 4)
          expect(results[i]).toEqual({ status: 'fulfilled', value: '42' });
      expect(spy).toHaveBeenCalledTimes(1);
      const call = spy.mock.calls[0];
      expect(call[0]).toBe('eth_call');
      expect(call[1][1]).toBe(tag);
      expect(await provider.getCode((call[1][0] as { to: string }).to)).toBe(
        '0x',
      );
      expect(await contract.getFunction('nonce')()).toBe(42n);
    } finally {
      spy.mockRestore();
      await (
        await contract.getFunction('configureModule')(
          '0x0000000000000000000000000000000000000000',
        )
      ).wait();
    }
  },
);

it('keeps distinct block tags in separate inspection RPCs', async () => {
  const pin = async (c: BaseContract) => ({
    address: await c.getAddress(),
    codeHash: keccak256(await provider.getCode(await c.getAddress())),
  });
  const profile = {
    entryPoint: await pin(entryPointFixture),
    module: await pin(moduleFixture),
  };
  const pins = [binding, binding.singleton, profile.entryPoint, profile.module];
  await (
    await contract.getFunction('configureModule')(profile.module.address)
  ).wait();
  const tag = '0x' + (await provider.getBlockNumber()).toString(16);
  const spy = vi.spyOn(reader, 'call');
  try {
    expect(
      await Promise.all(
        ['latest', tag].map((block) =>
          readSafe4337State(reader, binding, owner, profile, pins, block),
        ),
      ),
    ).toEqual(['42', '42']);
    expect(spy).toHaveBeenCalledTimes(2);
  } finally {
    spy.mockRestore();
    await (
      await contract.getFunction('configureModule')(
        '0x0000000000000000000000000000000000000000',
      )
    ).wait();
  }
});

it('rejects a truncated batch result for every caller', async () => {
  const profile = { entryPoint: binding.singleton, module: binding.singleton };
  const abi = new Interface([
    'function inspect4337Batch() view returns(bool[] valid,uint256[] nonces)',
  ]);
  const spy = vi
    .spyOn(reader, 'call')
    .mockResolvedValue(
      abi.encodeFunctionResult('inspect4337Batch', [[true], [42]]),
    );
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        readSafe4337State(reader, binding, owner, profile, [binding], '0x1234'),
      ),
    );
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
  }
});

it('never shares an inspection across different RPC endpoint identities', async () => {
  const request = vi.fn(async () =>
    Response.json({
      jsonrpc: '2.0',
      id: 1,
      result: '0x' + 42n.toString(16).padStart(64, '0'),
    }),
  );
  const readers = ['a', 'b'].map(
    (host) =>
      new RpcReader(
        'https://' + host + '.example.test',
        request as typeof fetch,
        4,
      ),
  );
  const profile = { entryPoint: binding.singleton, module: binding.singleton };
  expect(
    await Promise.all(
      readers.map((r) =>
        readSafe4337State(r, binding, owner, profile, [binding], '0x1234'),
      ),
    ),
  ).toEqual(['42', '42']);
  expect(request).toHaveBeenCalledTimes(2);
});
