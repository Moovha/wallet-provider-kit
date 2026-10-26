import { afterAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  Contract,
  ContractFactory,
  Interface,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  type InterfaceAbi,
} from 'ethers';
import { safeSetupInterface } from '../../src/provisioning/safe.js';
import {
  packedUserOperation,
  safeOpPayloadV07,
  safeOpActionV07,
  safeOpSignaturesV07,
  localPaymasterDeployment,
  createLocalPaymasterTransport,
} from '../../src/sponsorship/index.js';
import { localPaymasterAbi } from '../../src/sponsorship/local-paymaster-contract.generated.js';
import { getBytes } from 'ethers';
import {
  initialSafeOwnerPolicy,
  prepareSafeOwnerChange,
} from '../../src/sponsorship/owner-policy.js';
let child: ChildProcess | undefined;
let rpc: JsonRpcProvider | undefined;
afterAll(async () => {
  rpc?.destroy();
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});
async function artifact(name: string) {
  const bytes = await readFile(
    new URL(
      '../../artifacts/integration-contracts/' + name + '.json',
      import.meta.url,
    ),
  );
  const provenance = JSON.parse(
    await readFile(
      new URL('../fixtures/contracts/provenance.json', import.meta.url),
      'utf8',
    ),
  ) as { file: string; fixtureSha256: string }[];
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    provenance.find((r) => r.file === name + '.json')!.fixtureSha256,
  );
  return JSON.parse(bytes.toString()) as {
    abi: InterfaceAbi;
    bytecode: string;
  };
}
it('executes owner changes and exact multi-owner SafeOps against pinned Safe, module, paymaster and EntryPoint contracts', async () => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          '../../node_modules/@foundry-rs/anvil/bin.mjs',
          import.meta.url,
        ),
      ),
      '--silent',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--chain-id',
      '84532',
    ],
    { stdio: 'ignore', env: { ...process.env, TARGET_TOOL: 'anvil' } },
  );
  const origin = 'http://127.0.0.1:' + port;
  for (let i = 0; ; i++) {
    try {
      await fetch(origin, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
      });
      break;
    } catch (error) {
      if (i > 100 || child.exitCode !== null) throw error;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  const provider = (rpc = new JsonRpcProvider(origin, 84532, {
    staticNetwork: true,
    batchMaxCount: 1,
    cacheTimeout: -1,
  }));
  const funder = await provider.getSigner(0);
  const owner = Wallet.createRandom(),
    external = Wallet.createRandom(),
    third = Wallet.createRandom(),
    paymasterSigner = Wallet.createRandom();
  const deploy = async (name: string, args: unknown[] = []) => {
    const a = await artifact(name);
    const c = await new ContractFactory(a.abi, a.bytecode, funder).deploy(
      ...args,
    );
    await c.waitForDeployment();
    return new Contract(await c.getAddress(), a.abi, funder);
  };
  const entry = await deploy('EntryPoint'),
    singleton = await deploy('Safe'),
    factory = await deploy('SafeProxyFactory'),
    setup = await deploy('SafeModuleSetup'),
    module = await deploy('Safe4337Module', [await entry.getAddress()]);
  const entryAddress = await entry.getAddress(),
    moduleAddress = await module.getAddress();
  const initializer = safeSetupInterface.encodeFunctionData('setup', [
    [owner.address],
    1,
    await setup.getAddress(),
    new Interface(['function enableModules(address[])']).encodeFunctionData(
      'enableModules',
      [[moduleAddress]],
    ),
    moduleAddress,
    ZeroAddress,
    0,
    ZeroAddress,
  ]);
  const address: string = await factory.createProxyWithNonce.staticCall(
    await singleton.getAddress(),
    initializer,
    0,
  );
  await (
    await factory.createProxyWithNonce(
      await singleton.getAddress(),
      initializer,
      0,
    )
  ).wait();
  const safe = new Contract(address, (await artifact('Safe')).abi, funder);
  const plan = localPaymasterDeployment(
    entryAddress,
    await funder.getAddress(),
    await funder.getAddress(),
    paymasterSigner.address,
  );
  const paymasterAddress = (await (
    await funder.sendTransaction({ data: plan.data })
  ).wait())!.contractAddress!;
  await (await entry.depositTo(paymasterAddress, { value: 10n ** 18n })).wait();
  const domain = {
    chainId: '0x14a34' as const,
    entryPointVersion: '0.7' as const,
    entryPoint: entryAddress,
  };
  const transport = createLocalPaymasterTransport({
    domain,
    paymaster: paymasterAddress,
    signer: paymasterSigner.address,
    maximumVerificationGas: '0x493e0',
    maximumPostOpGas: '0x186a0',
    maximumCostWei: '100000000000000000',
    l1FeeReserveWei: '0',
    authorize: async () => ({
      validAfter: '0',
      validUntil: String(Math.floor(Date.now() / 1000) + 120),
    }),
    sign: (hash) => paymasterSigner.signMessage(getBytes(hash)),
  });
  const executeAbi = new Interface([
    'function executeUserOp(address,uint256,bytes,uint8)',
  ]);
  let policy = initialSafeOwnerPolicy(owner.address);
  async function operation(to: string, data: string) {
    const unsigned = {
      sender: address,
      nonce: '0x' + BigInt(await entry.getNonce(address, 0)).toString(16),
      callData: executeAbi.encodeFunctionData('executeUserOp', [
        to,
        0,
        data,
        0,
      ]),
      callGasLimit: '0x493e0',
      verificationGasLimit: '0x7a120',
      preVerificationGas: '0x186a0',
      maxFeePerGas: '0x77359400',
      maxPriorityFeePerGas: '0x3b9aca00',
    };
    const response = await transport(
      'https://local-paymaster.wallet-provider-kit.invalid/v07',
      {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'offline',
          method: 'pm_getPaymasterStubData',
          params: [
            unsigned,
            entryAddress,
            domain.chainId,
            {
              applicationId: 'a'.repeat(64),
              policyRevision: '1',
              policyHash: 'b'.repeat(64),
              actionId: randomUUID(),
            },
          ],
        }),
      },
    );
    const body = (await response.json()) as { result: Record<string, string> };
    expect(body.result).toBeDefined();
    const op = {
      ...unsigned,
      paymaster: body.result.paymaster,
      paymasterData: body.result.paymasterData,
      paymasterVerificationGasLimit: body.result.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: body.result.paymasterPostOpGasLimit,
    };
    const until = String(Math.floor(Date.now() / 1000) + 120);
    const payload = safeOpPayloadV07(op, domain, moduleAddress, '0', until);
    const action = safeOpActionV07(
      payload,
      { accountId: randomUUID(), address: owner.address },
      randomUUID(),
      randomUUID(),
    );
    const signers = [owner, external, third]
      .filter((w) => policy.owners.includes(w.address.toLowerCase()))
      .slice(0, policy.threshold);
    const signatures = await Promise.all(
      signers.map(async (w) => ({
        owner: w.address,
        signature: await w.signTypedData(
          payload.domain,
          payload.types,
          payload.message,
        ),
      })),
    );
    return {
      ...op,
      signature: safeOpSignaturesV07(action, policy, signatures),
    };
  }
  async function submit(to: string, data: string) {
    const op = await operation(to, data);
    const receipt = await (
      await entry.handleOps(
        [packedUserOperation(op)],
        await funder.getAddress(),
        { gasLimit: 3000000 },
      )
    ).wait();
    const event = receipt.logs
      .map((l: { topics: string[]; data: string }) => {
        try {
          return entry.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l: { name: string } | null) => l?.name === 'UserOperationEvent');
    expect(event!.args.success).toBe(true);
    return op;
  }
  const added = prepareSafeOwnerChange(policy, {
    type: 'add',
    owner: external.address,
    threshold: 2,
  });
  await submit(address, added.data);
  policy = added.requested;
  expect(await safe.getThreshold()).toBe(2n);
  expect(
    (await safe.getOwners()).map((a: string) => a.toLowerCase()).sort(),
  ).toEqual([...policy.owners].sort());
  const next = prepareSafeOwnerChange(policy, {
    type: 'add',
    owner: third.address,
    threshold: 2,
  });
  const op = await operation(address, next.data);
  // Truncation, duplication and mutation must fail on the actual module/EntryPoint path.
  for (const signature of [
    op.signature.slice(0, 156),
    op.signature.slice(0, 156) + op.signature.slice(26, 156),
  ]) {
    await expect(
      entry.handleOps.staticCall(
        [packedUserOperation({ ...op, signature })],
        await funder.getAddress(),
      ),
    ).rejects.toThrow();
  }
  await expect(
    entry.handleOps.staticCall(
      [
        packedUserOperation({
          ...op,
          callData: executeAbi.encodeFunctionData('executeUserOp', [
            external.address,
            0,
            '0x',
            0,
          ]),
        }),
      ],
      await funder.getAddress(),
    ),
  ).rejects.toThrow();
  await submit(address, next.data);
  policy = next.requested;
  const removed = prepareSafeOwnerChange(policy, {
    type: 'remove',
    owner: third.address,
    threshold: 2,
  });
  await submit(address, removed.data);
  policy = removed.requested;
  expect(await safe.getThreshold()).toBe(2n);
  expect((await safe.getOwners()).length).toBe(2);
  const lowered = prepareSafeOwnerChange(policy, {
    type: 'threshold',
    threshold: 1,
  });
  await submit(address, lowered.data);
  policy = lowered.requested;
  expect(await safe.getThreshold()).toBe(1n);
  await submit(external.address, '0x');
});
