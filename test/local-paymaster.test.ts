import { beforeAll, afterAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Contract, JsonRpcProvider, Wallet, getBytes, keccak256 } from 'ethers';
import {
  createLocalPaymasterTransport,
  localPaymasterDeployment,
  localPaymasterHashV07,
  localPaymasterUrl,
} from '../src/sponsorship/local-paymaster.js';
import { localPaymasterAbi } from '../src/sponsorship/local-paymaster-contract.generated.js';
import { createPaymasterClientV07 } from '../src/sponsorship/paymaster.js';
import { packedUserOperation } from '../src/sponsorship/bundler.js';

let child: ChildProcess, rpc: JsonRpcProvider, paymaster: Contract;
let entryPoint: string;
const signingWallet = Wallet.createRandom();
beforeAll(async () => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
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
      '--chain-id',
      '84532',
    ],
    { stdio: 'ignore', env: { ...process.env, TARGET_TOOL: 'anvil' } },
  );
  const origin = 'http://127.0.0.1:' + port;
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(origin, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
      });
      expect(((await response.json()) as { result: string }).result).toBe(
        '0x14a34',
      );
      break;
    } catch (error) {
      if (attempt > 100 || child.exitCode !== null) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  rpc = new JsonRpcProvider(origin, 84532, {
    staticNetwork: true,
    batchMaxCount: 1,
    cacheTimeout: -1,
  });
  const owner = await rpc.getSigner(0);
  entryPoint = await (await rpc.getSigner(1)).getAddress();
  const plan = localPaymasterDeployment(
    entryPoint,
    await owner.getAddress(),
    await owner.getAddress(),
    signingWallet.address,
  );
  const receipt = await (
    await owner.sendTransaction({ data: plan.data })
  ).wait();
  expect(receipt?.contractAddress).toBeTruthy();
  const address = receipt!.contractAddress!;
  expect(keccak256(await rpc.getCode(address))).toBe(plan.runtimeCodeHash);
  paymaster = new Contract(address, localPaymasterAbi, await rpc.getSigner(1));
  expect(await paymaster.entryPoint()).toBe(entryPoint);
  expect(
    await paymaster.hasRole(
      await paymaster.DEFAULT_ADMIN_ROLE(),
      await owner.getAddress(),
    ),
  ).toBe(true);
  expect(
    await paymaster.hasRole(
      await paymaster.MANAGER_ROLE(),
      await owner.getAddress(),
    ),
  ).toBe(true);
  expect(await paymaster.signers(signingWallet.address)).toBe(true);
}, 20000);
afterAll(async () => {
  rpc?.destroy();
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});

function fixture() {
  let allowed = true,
    signs = 0,
    fallbackCalls = 0;
  const domain = {
    entryPointVersion: '0.7' as const,
    entryPoint,
    chainId: '0x14a34' as const,
  };
  const bounds = {
    maximumVerificationGas: '0x186a0',
    maximumPostOpGas: '0x2710',
    maximumCostWei: '10000000',
    l1FeeReserveWei: '10',
  };
  const transport = createLocalPaymasterTransport(
    {
      ...bounds,
      domain,
      paymaster: paymaster.target.toString(),
      signer: signingWallet.address,
      authorize: async () =>
        allowed
          ? {
              validAfter: '0',
              validUntil: String(Math.floor(Date.now() / 1000) + 60),
            }
          : null,
      sign: async (hash) => {
        signs++;
        return signingWallet.signMessage(getBytes(hash));
      },
    },
    (async () => {
      fallbackCalls++;
      throw Error('Offline transport');
    }) as typeof fetch,
  );
  const client = createPaymasterClientV07(
    {
      ...bounds,
      domain,
      paymaster: paymaster.target.toString(),
      url: localPaymasterUrl,
      authorization: async () => 'Bearer offline-internal',
      authorizeRequest: async () => true,
    },
    transport,
  );
  const operation = {
    sender: Wallet.createRandom().address,
    nonce: '0x0',
    callData: '0x12345678',
    callGasLimit: '0xc350',
    verificationGasLimit: '0xc350',
    preVerificationGas: '0x5208',
    maxFeePerGas: '0xa',
    maxPriorityFeePerGas: '0x1',
  };
  const context = {
    applicationId: 'a'.repeat(64),
    policyHash: 'b'.repeat(64),
    policyRevision: '1',
    actionId: randomUUID(),
  };
  return {
    client,
    operation,
    context,
    domain,
    get signs() {
      return signs;
    },
    get fallbackCalls() {
      return fallbackCalls;
    },
    revoke() {
      allowed = false;
    },
  };
}
it('issues one durable-host-authorized final quote without a vendor request and matches the deployed upstream hash and validator', async () => {
  const f = fixture();
  const quote = await f.client.stub(f.operation, f.context);
  expect(quote.isFinal).toBe(true);
  expect(f.signs).toBe(1);
  expect(f.fallbackCalls).toBe(0);
  const { isFinal: _final, sponsor: _sponsor, ...data } = quote;
  const operation = { ...f.operation, ...data };
  const packed = packedUserOperation({
    ...operation,
    signature: '0x' + '00'.repeat(77),
  });
  const hash = localPaymasterHashV07(operation, f.domain.chainId);
  expect(await paymaster.getHash(0, packed)).toBe(hash);
  const [context, validation] =
    await paymaster.validatePaymasterUserOp.staticCall(
      packed,
      '0x' + '0'.repeat(64),
      1000,
    );
  expect(context).toBe('0x');
  expect(BigInt(validation) & ((1n << 160n) - 1n)).toBe(0n);
  const altered = { ...packed, callData: '0x87654321' };
  const [, invalid] = await paymaster.validatePaymasterUserOp.staticCall(
    altered,
    '0x' + '0'.repeat(64),
    1000,
  );
  expect(BigInt(invalid) & ((1n << 160n) - 1n)).toBe(1n);
});
it('rechecks local sponsorship authority before any usable authorization', async () => {
  const f = fixture();
  f.revoke();
  await expect(f.client.stub(f.operation, f.context)).rejects.toThrow();
  await expect(f.client.data(f.operation, f.context)).rejects.toThrow();
  expect(f.signs).toBe(0);
  expect(f.fallbackCalls).toBe(0);
});
it('rejects an over-budget quote before the infrastructure signer', async () => {
  const f = fixture();
  await expect(
    f.client.stub({ ...f.operation, maxFeePerGas: '0xffffff' }, f.context),
  ).rejects.toThrow();
  expect(f.signs).toBe(0);
});
