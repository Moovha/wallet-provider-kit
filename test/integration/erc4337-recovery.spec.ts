import { afterAll, expect, it } from 'vitest';
import solc from 'solc';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  Contract,
  ContractFactory,
  Interface,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  keccak256,
  getBytes,
  type InterfaceAbi,
} from 'ethers';
import { fixture } from '../helpers/safe-4337.js';
import { bundlerStoreImage } from '../../src/sponsorship/images.js';
import {
  localPaymasterDeployment,
  localPaymasterUrl,
  createLocalPaymasterTransport,
} from '../../src/sponsorship/local-paymaster.js';
import { localPaymasterAbi } from '../../src/sponsorship/local-paymaster-contract.generated.js';
import {
  UserOperationExecutionCoordinator,
  UserOperationWalletCallsDriver,
  userOperationExecutionBinding,
  packedUserOperation,
} from '../../src/sponsorship/index.js';
import { WalletCallsService } from '../../src/wallet-calls/service.js';
import { safeSetupInterface } from '../../src/provisioning/safe.js';

const execute = promisify(execFile);
const docker = (...args: string[]) =>
  execute('docker', args, { timeout: 120000, maxBuffer: 1024 * 1024 });
const prefix = 'wpk-e2e-' + randomUUID();
const directory = await mkdtemp(join(tmpdir(), 'wpk-e2e-'));
let anvil: ChildProcess | undefined;
let rpc: JsonRpcProvider | undefined;
const containers: string[] = [];
let networkCreated = false;
let volumeCreated = false;
afterAll(async () => {
  rpc?.destroy();
  if (anvil && anvil.exitCode === null) {
    anvil.kill('SIGTERM');
    await once(anvil, 'exit');
  }
  for (const name of containers.reverse())
    await docker('rm', '--force', name).catch(() => undefined);
  if (networkCreated) await docker('network', 'rm', prefix);
  if (volumeCreated) await docker('volume', 'rm', prefix);
  await rm(directory, { recursive: true, force: true });
});
async function availablePort() {
  const server = createServer();
  server.listen(0, '0.0.0.0');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}
async function eventually(check: () => Promise<void>, timeout = 45000) {
  const until = Date.now() + timeout;
  for (;;) {
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() >= until) throw error;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
async function artifact(name: string) {
  const root = new URL('../fixtures/contracts/', import.meta.url);
  const records = JSON.parse(
    await readFile(new URL('provenance.json', root), 'utf8'),
  ) as { file: string; fixtureSha256: string }[];
  const bytes = await readFile(
    new URL(
      '../../artifacts/integration-contracts/' + name + '.json',
      import.meta.url,
    ),
  );
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    records.find((r) => r.file === name + '.json')?.fixtureSha256,
  );
  return JSON.parse(bytes.toString()) as {
    abi: InterfaceAbi;
    bytecode: string;
  };
}

it('executes a real Safe operation through Alto and Valkey, then recovers a lost response across provider, bundler and queue restarts without repeating the effect', async () => {
  await docker('info', '--format', '{{.ServerVersion}}');
  const port = await availablePort();
  anvil = spawn(
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
      '0.0.0.0',
      '--port',
      String(port),
      '--chain-id',
      '84532',
      '--base-fee',
      '0',
      '--gas-price',
      '1',
    ],
    { stdio: 'ignore', env: { ...process.env, TARGET_TOOL: 'anvil' } },
  );
  const origin = 'http://127.0.0.1:' + port;
  await eventually(async () => {
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
    expect(((await r.json()) as { result: string }).result).toBe('0x14a34');
  });
  rpc = new JsonRpcProvider(origin, 84532, {
    staticNetwork: true,
    batchMaxCount: 1,
    cacheTimeout: -1,
  });
  const provider = rpc;
  const funder = await provider.getSigner(0);
  const owner = Wallet.createRandom();
  const executor = Wallet.createRandom();
  const paymasterSigner = Wallet.createRandom();
  async function deploy(name: string, args: unknown[] = []) {
    const a = await artifact(name);
    const contract = await new ContractFactory(
      a.abi,
      a.bytecode,
      funder,
    ).deploy(...args);
    await contract.waitForDeployment();
    return new Contract(await contract.getAddress(), a.abi, funder);
  }
  const counterSource = await readFile(
    new URL('../helpers/solidity/ExecutionCounter.sol', import.meta.url),
    'utf8',
  );
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources: { 'ExecutionCounter.sol': { content: counterSource } },
        settings: {
          evmVersion: 'paris',
          outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
        },
      }),
    ),
  );
  expect(
    (compiled.errors ?? []).filter(
      (error: { severity: string }) => error.severity === 'error',
    ),
  ).toEqual([]);
  const counterArtifact =
    compiled.contracts['ExecutionCounter.sol'].ExecutionCounter;
  const counterDeployment = await new ContractFactory(
    counterArtifact.abi,
    '0x' + counterArtifact.evm.bytecode.object,
    funder,
  ).deploy();
  await counterDeployment.waitForDeployment();
  const counter = new Contract(
    await counterDeployment.getAddress(),
    counterArtifact.abi,
    funder,
  );
  const entryPoint = await deploy('EntryPoint');
  const entryAddress = await entryPoint.getAddress();
  const singleton = await deploy('Safe');
  const factory = await deploy('SafeProxyFactory');
  const multiSend = await deploy('MultiSendCallOnly');
  const setup = await deploy('SafeModuleSetup');
  const module = await deploy('Safe4337Module', [entryAddress]);
  const moduleAddress = await module.getAddress();
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
  const singletonAddress = await singleton.getAddress();
  const safeAddress: string = await factory.createProxyWithNonce.staticCall(
    singletonAddress,
    initializer,
    0,
  );
  await (
    await factory.createProxyWithNonce(singletonAddress, initializer, 0)
  ).wait();
  const paymasterPlan = localPaymasterDeployment(
    entryAddress,
    await funder.getAddress(),
    await funder.getAddress(),
    paymasterSigner.address,
  );
  const receipt = await (
    await funder.sendTransaction({ data: paymasterPlan.data })
  ).wait();
  const paymasterAddress = receipt!.contractAddress!;
  const paymaster = new Contract(paymasterAddress, localPaymasterAbi, funder);
  await (
    await entryPoint.depositTo(paymasterAddress, { value: 10n ** 17n })
  ).wait();
  await (
    await funder.sendTransaction({ to: executor.address, value: 10n ** 18n })
  ).wait();
  await (
    await funder.sendTransaction({ to: safeAddress, value: 10n ** 15n })
  ).wait();
  const recipient = Wallet.createRandom().address;
  const pin = async (address: string) => ({
    address,
    codeHash: keccak256(await provider.getCode(address)),
  });
  const genesis = (await provider.getBlock(0))!.hash!;
  await docker('network', 'create', '--internal', prefix);
  networkCreated = true;
  await docker('volume', 'create', prefix);
  volumeCreated = true;
  containers.push(prefix + '-store');
  await docker(
    'run',
    '--detach',
    '--name',
    prefix + '-store',
    '--network',
    prefix,
    '--mount',
    'type=volume,src=' + prefix + ',dst=/data',
    bundlerStoreImage,
    'valkey-server',
    '--appendonly',
    'yes',
    '--appendfsync',
    'always',
  );
  const { stdout: gateway } = await docker(
    'network',
    'inspect',
    '--format',
    '{{(index .IPAM.Config 0).Gateway}}',
    prefix,
  );
  const config = {
    entrypoints: entryAddress,
    'executor-private-keys': executor.privateKey,
    'utility-private-key': executor.privateKey,
    'rpc-url': 'http://host.docker.internal:' + port,
    port: 3000,
    'bundle-mode': 'manual',
    'safe-mode': false,
    'refilling-wallets': false,
    'chain-type': 'default',
    'block-time': 1000,
    'min-bundle-interval': 100,
    'max-bundle-interval': 100,
    'block-polling-interval': 100,
    'gas-price-refresh-interval': 1,
    'enable-horizontal-scaling': true,
    'enable-redis-receipt-cache': true,
    'redis-endpoint': 'redis://' + prefix + '-store:6379',
    'redis-key-prefix': prefix,
    'mempool-pop-batch-size': 10,
    'max-bundle-count': 1,
    'max-resubmits': 3,
    'log-level': 'fatal',
    'flush-stuck-transactions-during-startup': false,
  };
  await writeFile(join(directory, 'alto.json'), JSON.stringify(config), {
    mode: 0o600,
  });
  containers.push(prefix + '-bundler');
  await docker(
    'run',
    '--detach',
    '--name',
    prefix + '-bundler',
    '--network',
    prefix,
    '--add-host',
    'host.docker.internal:' + gateway.trim(),
    '--mount',
    'type=bind,src=' + directory + ',dst=/fixture,readonly',
    '--entrypoint',
    'node',
    'wallet-provider-kit-bundler:integration',
    '/app/src/esm/cli/alto.js',
    'run',
    '--config',
    '/fixture/alto.json',
  );
  const { stdout: bundlerIp } = await docker(
    'inspect',
    '--format',
    '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
    prefix + '-bundler',
  );
  const bundlerUrl = 'http://' + bundlerIp.trim() + ':3000';
  async function bundlerRpc(method: string, params: unknown[]) {
    const r = await fetch(bundlerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = (await r.json()) as { error?: unknown; result: string[] };
    expect(body.error).toBeUndefined();
    return body.result;
  }
  try {
    await eventually(async () =>
      expect(await bundlerRpc('eth_supportedEntryPoints', [])).toContain(
        entryAddress,
      ),
    );
  } catch {
    const { stdout: state } = await docker(
      'inspect',
      '--format',
      '{{.State.Status}}/{{.State.ExitCode}}',
      prefix + '-bundler',
    );
    throw new Error(
      'Offline bundler did not become ready; runtime state ' + state.trim(),
    );
  }
  const bundler = {
    profile: 'safe4337-bundler-v07' as const,
    url: 'https://bundler.example.test/rpc',
    maxLogRange: 100,
  };
  let sends = 0;
  let f: Awaited<ReturnType<typeof fixture>>;
  const transport: typeof fetch = async (url, init) => {
    const selected = String(url);
    if (selected === bundler.url) {
      const body = JSON.parse(String(init?.body));
      const result = await fetch(bundlerUrl, init);
      if (body.method === 'eth_sendUserOperation') {
        expect(result.ok).toBe(true);
        const accepted = (await result.json()) as { error?: unknown };
        expect(accepted.error).toBeUndefined();
        sends++;
        // Acceptance reached the real durable mempool; lose only the client reply.
        await docker('kill', '--signal', 'KILL', prefix + '-bundler');
        throw new Error('Offline submission response lost');
      }
      return result;
    }
    if (selected === 'https://primary.example.test') return fetch(origin, init);
    throw new Error('Unexpected external transport');
  };
  const budget = '100000000000000000';
  let sponsorshipSigns = 0;
  const localTransport = createLocalPaymasterTransport(
    {
      domain: {
        chainId: '0x14a34',
        entryPointVersion: '0.7',
        entryPoint: entryAddress,
      },
      paymaster: paymasterAddress,
      signer: paymasterSigner.address,
      maximumVerificationGas: '0x493e0',
      maximumPostOpGas: '0x186a0',
      maximumCostWei: budget,
      l1FeeReserveWei: '0',
      authorize: (request) => f.service.authorizeLocalPaymaster(request),
      sign: (hash) => {
        sponsorshipSigns++;
        return paymasterSigner.signMessage(getBytes(hash));
      },
    },
    transport,
  );
  const entryPin = await pin(entryAddress);
  const modulePin = await pin(moduleAddress);
  const paymasterPin = await pin(paymasterAddress);
  f = await fixture(
    (c) => {
      c.submissionBinding = userOperationExecutionBinding(bundler);
      c.acceptance = {
        profile: 'safe-4337-module-0.3.0-v07',
        domain: {
          chainId: '0x14a34',
          entryPointVersion: '0.7',
          entryPoint: entryAddress,
        },
        entryPoint: entryPin,
        module: modulePin,
        paymaster: paymasterPin,
        genesisHash: genesis,
        rpcUrls: ['https://primary.example.test'],
        rpcVerification: 'single',
      };
      c.sponsors[0].lifetimeBudgetWei = budget;
      c.paymaster = {
        url: localPaymasterUrl,
        maximumVerificationGas: '0x493e0',
        maximumPostOpGas: '0x186a0',
        l1FeeReserveWei: '0',
      };
    },
    recipient,
    undefined,
    true,
    false,
    false,
    {
      wallet: owner,
      target: await pin(await counter.getAddress()),
      account: {
        ...(await pin(safeAddress)),
        singleton: await pin(singletonAddress),
      },
      multiSend: await pin(await multiSend.getAddress()),
      request: localTransport,
      maximumGasBudgetWei: budget,
    },
  );
  function compose() {
    const execution = new UserOperationExecutionCoordinator(
      f.actions,
      f.db,
      f.service,
      bundler,
      async () => 'Bearer offline',
      transport,
    );
    const driver = new UserOperationWalletCallsDriver(
      f.actions,
      f.db,
      execution,
      {
        gas: {
          callGasLimit: '0x493e0',
          verificationGasLimit: '0x7a120',
          preVerificationGas: '0x186a0',
          maxFeePerGas: '0x3b9aca00',
          maxPriorityFeePerGas: '0x3b9aca00',
        },
        maxDepthPerSafe: 3,
        maxWaitSeconds: 60,
        pollIntervalSeconds: 1,
      },
    );
    return {
      execution,
      driver,
      calls: new WalletCallsService(f.actions, driver),
    };
  }
  (f.context.principal.scopes as string[]).push(
    'wallet:execute',
    'wallet:execute:read',
  );
  let ports = compose();
  await ports.calls.request(
    f.context.principal,
    f.input.account_id,
    'wallet_sendCalls',
    [
      {
        id: 'offline-transfer',
        version: '2.0.0',
        atomicRequired: true,
        capabilities: { applicationAction: f.input.application_action },
        chainId: '0x14a34',
        calls: [
          ...f.input.calls.map((call) => ({ ...call, value: '0x2' })),
          { to: recipient, value: '0x4', data: '0x' },
        ],
      },
    ],
  );
  await ports.driver.runOnce();
  const progress = await f.onboarding.store.transaction((s) =>
    Object.values(s.userOperationBatches ?? {}).map((batch) => ({
      stage: batch.stage,
      code: batch.lastFailure?.code,
      origin: batch.lastFailure?.origin,
    })),
  );
  expect(sends, JSON.stringify(progress)).toBe(1);
  const executions = await f.onboarding.store.transaction((s) =>
    Object.values(s.userOperationExecutions ?? {}),
  );
  expect(executions).toHaveLength(1);
  const plan = executions[0];
  expect(plan.userOperationHash).toBe(
    await entryPoint.getUserOpHash(packedUserOperation(plan.operation)),
  );
  await entryPoint.handleOps.staticCall(
    [packedUserOperation(plan.operation)],
    executor.address,
  );
  await expect(
    entryPoint.handleOps.staticCall(
      [
        packedUserOperation({
          ...plan.operation,
          callData: plan.operation.callData + '00',
        }),
      ],
      executor.address,
    ),
  ).rejects.toThrow();
  const { stdout: queueKeys } = await docker(
    'exec',
    prefix + '-store',
    'valkey-cli',
    '--raw',
    'KEYS',
    prefix + ':*:outstanding:userop-hash',
  );
  const keys = queueKeys.trim().split('\n').filter(Boolean);
  expect(keys).toHaveLength(1);
  const queued = async () => {
    const { stdout } = await docker(
      'exec',
      prefix + '-store',
      'valkey-cli',
      '--raw',
      'HEXISTS',
      keys[0],
      plan.userOperationHash,
    );
    expect(stdout.trim()).toBe('1');
  };
  await queued();
  const signs = f.state.signs;
  expect(signs).toBe(1);
  expect(await provider.getBalance(recipient)).toBe(0n);
  expect(await counter.calls()).toBe(0n);
  expect(await entryPoint.getNonce(safeAddress, 0)).toBe(0n);
  await f.restart();
  config['bundle-mode'] = 'auto';
  await writeFile(join(directory, 'alto.json'), JSON.stringify(config), {
    mode: 0o600,
  });
  await docker('restart', prefix + '-store');
  await queued();
  await docker('start', prefix + '-bundler');
  ports = compose();
  await eventually(async () => {
    await ports.execution.refresh(plan.operationId);
    expect(
      (await ports.execution.load(plan.operationId))?.observation?.state,
    ).toMatch(/^(included|safe|finalized)$/);
  });
  expect(await provider.getBalance(recipient)).toBe(4n);
  expect(await counter.calls()).toBe(1n);
  expect(await counter.lastValue()).toBe(42n);
  expect(await entryPoint.getNonce(safeAddress, 0)).toBe(1n);
  for (let i = 0; i < 3; i++) await ports.driver.runOnce();
  expect(f.state.signs).toBe(signs);
  expect(sponsorshipSigns).toBe(1);
  expect(sends).toBe(1);
  expect(await provider.getBalance(recipient)).toBe(4n);
  expect(await entryPoint.balanceOf(paymasterAddress)).toBeLessThan(10n ** 17n);
  expect(await paymaster.entryPoint()).toBe(entryAddress);
});
