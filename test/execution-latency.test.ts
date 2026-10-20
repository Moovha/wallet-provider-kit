import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Wallet, id } from 'ethers';
import { RpcReader, QuorumExecutionObserver } from '../src/execution/chain.js';
import { executionFixture } from './helpers/execution.js';
import { approvedCallsFixture } from './helpers/approved-calls.js';
import {
  buildApprovedCallIntent,
  buildApprovedCallAction,
  approvedCallData,
} from '../src/execution/approved-calls.js';
import { createTransferExecutionProvider } from '../src/execution/relayer.js';
import { serviceHash } from '../src/executor/auth.js';
import type { RuntimePolicy } from '../src/runtime-configuration/service.js';
afterEach(() => vi.restoreAllMocks());

it('shares overlapping identical RPC reads across readers without retaining responses or sharing mutable objects', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = vi.fn(async () => {
    await gate;
    return Response.json({ jsonrpc: '2.0', id: 1, result: { value: '0x1' } });
  });
  const readers = [0, 1].map(
    () => new RpcReader('https://primary.example.test', request, 4, true),
  );
  const reads = readers.map((reader) =>
    reader.call('eth_getBalance', ['0x1', 'latest']),
  );
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  release();
  const [a, b] = (await Promise.all(reads)) as { value: string }[];
  a.value = 'changed';
  expect(b.value).toBe('0x1');
  await readers[0].call('eth_getBalance', ['0x1', 'latest']);
  expect(request).toHaveBeenCalledTimes(2);
});

it('clears failed shared reads and keeps distinct parameters and endpoints separate', async () => {
  const request = vi.fn(async () => new Response('', { status: 400 }));
  const a = new RpcReader('https://primary.example.test', request, 4, true);
  const b = new RpcReader('https://secondary.example.test', request, 4, true);
  expect(
    (
      await Promise.allSettled([
        a.call('eth_chainId', []),
        a.call('eth_chainId', []),
      ])
    ).every((r) => r.status === 'rejected'),
  ).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
  request.mockImplementation(async () =>
    Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' }),
  );
  await Promise.all([
    a.call('eth_getBalance', ['0x1', 'latest']),
    a.call('eth_getBalance', ['0x2', 'latest']),
    b.call('eth_getBalance', ['0x1', 'latest']),
  ]);
  expect(request).toHaveBeenCalledTimes(4);
});

async function includedFixture() {
  const original = executionFixture(),
    owner = Wallet.createRandom(),
    accountId = randomUUID();
  const f = approvedCallsFixture(accountId, owner.address, original);
  const selector = id('ping()').slice(0, 10);
  f.policy.contracts[0].selectors = [selector];
  const expiry = new Date(Date.now() + 120000).toISOString();
  const intent = buildApprovedCallIntent(
    f.policy,
    {
      account_id: accountId,
      kind: 'contract-call',
      calls: [
        { to: f.policy.contracts[0].address, value: '0', data: selector },
      ],
    },
    '0',
    expiry,
  );
  const action = buildApprovedCallAction(
    intent,
    owner.address,
    expiry,
    randomUUID(),
  );
  const signature = await owner.signTypedData(
    action.payload.domain,
    action.payload.types,
    action.payload.message,
  );
  const policy: RuntimePolicy = {
    version: '1',
    enabled: true,
    chain_id: 'eip155:84532',
    maximum_calls: 1,
    maximum_native_value_wei: '0',
    max_validity_seconds: 120,
    contracts: [
      {
        address: f.policy.contracts[0].address,
        code_hash: f.policy.contracts[0].codeHash,
        methods: [{ signature: 'ping()', maximum_value_wei: '0' }],
      },
    ],
    claim_requirements: [],
  };
  const plan = {
    ...(await original.plan()),
    profile: 'approved-evm-executor-v1' as const,
    action,
    intent,
    data: approvedCallData(action, signature),
    runtimePolicy: {
      application_id: 'a'.repeat(64),
      revision: '1',
      policy_hash: serviceHash(policy),
      policy,
    },
  };
  Object.assign(f.state, {
    included: true,
    target: intent.account.address,
    digest: action.payload_hash,
    data: plan.data,
    intent,
  });
  const methods: string[] = [];
  const request = (async (input, init) => {
    methods.push(JSON.parse(String(init?.body)).method);
    return f.request(input, init);
  }) as typeof fetch;
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test'],
    original.configuration.rpc.genesisHash,
    10000,
    request,
    undefined,
    'single',
    true,
  );
  return { original, f, plan, methods, observer };
}

it('reuses an immutable inclusion proof only after fresh canonical block verification, and rebuilds it after a reorg', async () => {
  const t = await includedFixture();
  expect(
    await t.observer.observe(
      t.plan,
      [t.original.transactionHash],
      t.original.transactionHash,
    ),
  ).toMatchObject({ outcome: 'succeeded', verification: 'rpc-single' });
  const first = t.methods.filter((m) => m === 'eth_call').length;
  expect(first).toBeGreaterThan(0);
  t.methods.length = 0;
  expect(
    await t.observer.observe(
      t.plan,
      [t.original.transactionHash],
      t.original.transactionHash,
    ),
  ).toMatchObject({ outcome: 'succeeded' });
  expect(t.methods).not.toContain('eth_call');
  expect(t.methods).not.toContain('eth_getTransactionReceipt');
  expect(t.methods).toContain('eth_getBlockByNumber');
  t.f.state.mutate = (method, result, _origin, params) =>
    method === 'eth_getBlockByNumber' && params[0] === '0x65'
      ? { ...(result as object), hash: '0x' + '9'.repeat(64) }
      : result;
  expect(
    await t.observer.observe(
      t.plan,
      [t.original.transactionHash],
      t.original.transactionHash,
    ),
  ).toMatchObject({ chain_status: 'reorged', verification: 'unverified' });
  t.f.state.mutate = undefined;
  t.methods.length = 0;
  expect(
    await t.observer.observe(
      t.plan,
      [t.original.transactionHash],
      t.original.transactionHash,
    ),
  ).toMatchObject({ outcome: 'succeeded' });
  expect(t.methods).toContain('eth_getTransactionReceipt');
});

it('expires cached proofs and never uses one for a changed signed plan', async () => {
  const t = await includedFixture();
  await t.observer.observe(
    t.plan,
    [t.original.transactionHash],
    t.original.transactionHash,
  );
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + 60001);
  t.methods.length = 0;
  await t.observer.observe(
    t.plan,
    [t.original.transactionHash],
    t.original.transactionHash,
  );
  expect(t.methods).toContain('eth_getTransactionReceipt');
  t.methods.length = 0;
  const changed = structuredClone(t.plan);
  changed.data += '00';
  expect(
    await t.observer.observe(
      changed,
      [t.original.transactionHash],
      t.original.transactionHash,
    ),
  ).toMatchObject({ verification: 'unverified' });
  expect(t.methods).toContain('eth_getTransactionReceipt');
});

it('reads a nonce for an unsigned intent but still rejects a changed Safe owner before signing', async () => {
  const t = await includedFixture();
  t.f.state.included = false;
  expect(await t.observer.actionNonce(t.plan.intent.account)).toBe('0');
  t.f.state.owner = Wallet.createRandom().address;
  await expect(t.observer.preflightUnsigned(t.plan)).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
});

it('checks only the selected sponsor capability and rejects an unconfigured sponsor', async () => {
  const f = executionFixture();
  const sponsor = f.configuration.sponsors[0];
  f.configuration.sponsors.push({
    ...sponsor,
    accountId: randomUUID(),
    binding: { ...sponsor.binding, relayerId: 'other-relayer' },
  });
  const reads: string[] = [];
  const request = (async (input, init) => {
    const path = new URL(String(input)).pathname;
    reads.push(path);
    const r = await f.request(input, init);
    if (path.endsWith('/sponsor-relayer')) {
      const v = (await r.json()) as { data: { policies: unknown } };
      v.data.policies = {
        gas_limit_estimation: false,
        eip1559_pricing: true,
        gas_price_cap: Number(sponsor.maxFeePerGas),
      };
      return Response.json(v, {
        headers: { 'x-wpk-relayer-contract': 'wpk-fee-only-replacement-v1' },
      });
    }
    return r;
  }) as typeof fetch;
  const provider = createTransferExecutionProvider(
    f.configuration,
    'offline-relayer-key',
    request,
  );
  expect(await provider.supportsReplacement!(sponsor)).toBe(true);
  expect(reads.some((p) => p.includes('other-relayer'))).toBe(false);
  expect(
    await provider.supportsReplacement!({
      ...sponsor,
      accountId: randomUUID(),
    }),
  ).toBe(false);
});

it('checks quoted gas costs during Safe simulation rather than requiring the entire operator fee ceiling', async () => {
  const t = await includedFixture();
  t.f.state.included = false;
  t.plan.networkFees = {
    maxFeePerGas: '10',
    maxPriorityFeePerGas: '1',
    baseFeePerGas: '4',
    quotedAt: new Date().toISOString(),
  };
  const required =
    BigInt(t.plan.sponsor.gasLimit) * 10n +
    BigInt(t.plan.sponsor.l1FeeReserveWei);
  let balance = required;
  t.f.state.mutate = (method, result) =>
    method === 'eth_getBalance' ? '0x' + balance.toString(16) : result;
  await expect(t.observer.preflightUnsigned(t.plan)).resolves.toBeUndefined();
  await expect(t.observer.preflight(t.plan)).resolves.toBeUndefined();
  balance--;
  await expect(t.observer.preflight(t.plan)).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
});

it('falls back to full Safe reads only when state overrides are explicitly unsupported', async () => {
  const t = await includedFixture();
  t.f.state.included = false;
  let overrides = 0;
  let views = 0;
  const request = (async (input, init) => {
    const call = JSON.parse(String(init?.body));
    if (call.method === 'eth_call' && call.params.length === 3) {
      overrides++;
      return Response.json({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'State overrides unsupported' },
      });
    }
    if (call.method === 'eth_call') views++;
    if (call.method === 'eth_getStorageAt')
      return Response.json({
        jsonrpc: '2.0',
        id: 1,
        result: '0x' + '0'.repeat(64),
      });
    return t.f.request(input, init);
  }) as typeof fetch;
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test'],
    t.original.configuration.rpc.genesisHash,
    10000,
    request,
    undefined,
    'single',
    true,
    true,
  );
  expect(
    await observer.contractNonce(
      t.plan.intent.account,
      t.plan.action.chain_account_id.split(':')[2],
    ),
  ).toBe('0');
  expect(overrides).toBe(1);
  expect(views).toBeGreaterThan(0);
  await observer.contractNonce(
    t.plan.intent.account,
    t.plan.action.chain_account_id.split(':')[2],
  );
  expect(overrides).toBe(1);
  t.f.state.owner = Wallet.createRandom().address;
  await expect(
    observer.contractNonce(
      t.plan.intent.account,
      t.plan.action.chain_account_id.split(':')[2],
    ),
  ).rejects.toThrow();
});
it('never falls back after the aggregated Safe validator reports a rejected proof', async () => {
  const t = await includedFixture();
  let views = 0;
  const request = (async (input, init) => {
    const call = JSON.parse(String(init?.body));
    if (call.method === 'eth_call') {
      if (call.params.length === 3)
        return Response.json({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32000, message: 'execution reverted' },
        });
      views++;
    }
    return t.f.request(input, init);
  }) as typeof fetch;
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test'],
    t.original.configuration.rpc.genesisHash,
    10000,
    request,
    undefined,
    'single',
    true,
    true,
  );
  await expect(
    observer.contractNonce(
      t.plan.intent.account,
      t.plan.action.chain_account_id.split(':')[2],
    ),
  ).rejects.toThrow();
  expect(views).toBe(0);
});

it('overlaps known receipt and historical state reads while waiting for canonical heads, and withholds success until every check completes', async () => {
  const t = await includedFixture();
  let releaseHead!: () => void, releaseBlock!: () => void;
  const headGate = new Promise<void>((r) => {
      releaseHead = r;
    }),
    blockGate = new Promise<void>((r) => {
      releaseBlock = r;
    });
  let receiptStarted = false,
    stateStarted = false,
    complete = false;
  const request = (async (input, init) => {
    const { method, params } = JSON.parse(String(init?.body));
    if (method === 'eth_getBlockByNumber' && params[0] === 'latest')
      await headGate;
    if (method === 'eth_getBlockByNumber' && params[0] === '0x65')
      await blockGate;
    if (method === 'eth_getTransactionReceipt') receiptStarted = true;
    if (method === 'eth_call') stateStarted = true;
    return t.f.request(input, init);
  }) as typeof fetch;
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test'],
    t.original.configuration.rpc.genesisHash,
    10000,
    request,
    undefined,
    'single',
    true,
  );
  const pending = observer
    .observe(t.plan, [t.original.transactionHash], t.original.transactionHash)
    .then((r) => {
      complete = true;
      return r;
    });
  try {
    await vi.waitFor(() => expect(receiptStarted).toBe(true));
    expect(complete).toBe(false);
    releaseHead();
    await vi.waitFor(() => expect(stateStarted).toBe(true));
    expect(complete).toBe(false);
    releaseBlock();
    expect(await pending).toMatchObject({
      verification: 'rpc-single',
      outcome: 'succeeded',
    });
  } finally {
    releaseHead();
    releaseBlock();
    await pending;
  }
});
it('checks submission RPC identity without reading an unused head and still rejects a changed chain', async () => {
  const t = await includedFixture();
  await t.observer.verifyNetwork();
  t.methods.length = 0;
  await t.observer.verifyNetwork();
  expect(t.methods).toEqual(['eth_chainId']);
  t.f.state.mutate = (method, result) =>
    method === 'eth_chainId' ? '0x1' : result;
  await expect(t.observer.verifyNetwork()).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
});

it('reuses only the immutable genesis pin while checking the current chain ID and head on every operation', async () => {
  const t = await includedFixture();
  let genesis = 0,
    chains = 0,
    wrong = false;
  const request = (async (input, init) => {
    const { method, params } = JSON.parse(String(init?.body));
    if (method === 'eth_getBlockByNumber' && params[0] === '0x0') genesis++;
    if (method === 'eth_chainId') {
      chains++;
      if (wrong) return Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' });
    }
    return t.f.request(input, init);
  }) as typeof fetch;
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test'],
    t.original.configuration.rpc.genesisHash,
    10000,
    request,
    undefined,
    'single',
    true,
  );
  await observer.anchor();
  await observer.anchor();
  expect(genesis).toBe(1);
  expect(chains).toBe(2);
  wrong = true;
  await expect(observer.anchor()).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
  expect(chains).toBe(3);
  expect(genesis).toBe(1);
});

it('keeps both preflights fresh without wrapping them in sequential block snapshots', async () => {
  const t = await includedFixture();
  t.f.state.included = false;
  const calls: { method: string; params: unknown[] }[] = [];
  const request = (async (input, init) => {
    calls.push(JSON.parse(String(init?.body)));
    await new Promise((resolve) => setTimeout(resolve, 25));
    return t.f.request(input, init);
  }) as typeof fetch;
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test'],
    t.original.configuration.rpc.genesisHash,
    10000,
    request,
    undefined,
    'single',
    true,
  );
  await observer.anchor();
  calls.length = 0;
  const started = performance.now();
  await observer.preflightUnsigned(t.plan);
  await observer.preflight(t.plan);
  const snapshots = calls.filter(
    (call) => call.method === 'eth_getBlockByNumber',
  );
  if (process.env.WPK_RPC_DIAGNOSTICS === '1')
    console.info(
      JSON.stringify({
        scenario: 'two-preflights',
        rpcCalls: calls.length,
        snapshotReads: snapshots.length,
        elapsedMs: Math.round(performance.now() - started),
        simulatedRpcMs: 25,
      }),
    );
  expect(snapshots).toHaveLength(0);
  expect(calls.filter((call) => call.method === 'eth_chainId')).toHaveLength(2);
  expect(calls.filter((call) => call.method === 'eth_getBalance')).toHaveLength(
    2,
  );
  const unsigned = calls.filter((call) => call.method === 'eth_call').length;
  expect(unsigned).toBeGreaterThan(2);
  t.f.state.owner = Wallet.createRandom().address;
  await expect(observer.preflight(t.plan)).rejects.toMatchObject({
    code: 'wallet_provider_unavailable',
  });
});

it('restores a trusted persisted full inclusion proof after restart but freshly rejects a changed canonical block', async () => {
  const t = await includedFixture();
  const prior = await t.observer.observe(
    t.plan,
    [t.original.transactionHash],
    t.original.transactionHash,
  );
  const methods: string[] = [];
  const request = (async (input, init) => {
    methods.push(JSON.parse(String(init?.body)).method);
    return t.f.request(input, init);
  }) as typeof fetch;
  const restarted = new QuorumExecutionObserver(
    ['https://primary.example.test'],
    t.original.configuration.rpc.genesisHash,
    10000,
    request,
    undefined,
    'single',
    true,
  );
  expect(
    await restarted.recheckInclusion(t.plan, prior, t.original.transactionHash),
  ).toMatchObject({ outcome: 'succeeded', verification: 'rpc-single' });
  expect(methods).toContain('eth_chainId');
  expect(methods).not.toContain('eth_getTransactionReceipt');
  expect(methods).not.toContain('eth_getTransactionByHash');
  expect(methods).not.toContain('eth_call');
  t.f.state.mutate = (method, result, _origin, params) =>
    method === 'eth_getBlockByNumber' && params[0] === '0x65'
      ? { ...(result as object), hash: '0x' + 'f'.repeat(64) }
      : result;
  expect(
    await restarted.recheckInclusion(t.plan, prior, t.original.transactionHash),
  ).toMatchObject({ verification: 'unverified', chain_status: 'reorged' });
});

it('keeps a newly accepted known hash on a cheap unverified receipt path, then fully verifies the first visible receipt', async () => {
  const t = await includedFixture();
  t.plan.networkFees = {
    maxFeePerGas: t.plan.sponsor.maxFeePerGas,
    maxPriorityFeePerGas: t.plan.sponsor.maxPriorityFeePerGas,
    baseFeePerGas: '1000000000',
    quotedAt: new Date().toISOString(),
  };
  t.f.state.included = false;
  t.methods.length = 0;
  expect(
    await t.observer.observe(
      t.plan,
      [t.original.transactionHash],
      t.original.transactionHash,
    ),
  ).toMatchObject({
    chain_status: 'pending',
    verification: 'unverified',
    outcome: 'unknown',
  });
  expect(t.methods).toEqual(['eth_getTransactionReceipt']);
  t.f.state.included = true;
  t.methods.length = 0;
  expect(
    await t.observer.observe(
      t.plan,
      [t.original.transactionHash],
      t.original.transactionHash,
    ),
  ).toMatchObject({ verification: 'rpc-single', outcome: 'succeeded' });
  expect(
    t.methods.filter((method) => method === 'eth_getTransactionReceipt'),
  ).toHaveLength(1);
  expect(t.methods).toContain('eth_chainId');
  expect(t.methods).toContain('eth_call');
});
