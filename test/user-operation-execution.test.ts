import { WalletProviderError } from '../src/domain/signing.js';
import type { UserOperationV07 } from '../src/sponsorship/user-operation.js';
import { NetworkFeeLimitError } from '../src/execution/network-fees.js';
import { describe, it, expect, vi } from 'vitest';
import { Wallet, toQuantity, ZeroAddress } from 'ethers';
import { fixture } from './helpers/safe-4337.js';
import { WalletCallsService } from '../src/wallet-calls/service.js';
import {
  UserOperationExecutionCoordinator,
  UserOperationWalletCallsDriver,
  userOperationExecutionBinding,
  packedUserOperation,
  signedUserOperationHash,
  type SignedUserOperationV07,
  type BundlerConfigurationV07,
} from '../src/sponsorship/index.js';
import {
  UserOperationReceiptObserver,
  entryPointV07Interface as ep,
} from '../src/sponsorship/receipts.js';

const bundler: BundlerConfigurationV07 = {
  profile: 'safe4337-bundler-v07',
  url: 'https://bundler.example.test/rpc',
  maxLogRange: 100,
};
const txHash = '0x' + 'c'.repeat(64),
  blockHash = '0x' + 'b'.repeat(64);
async function setup(
  lifetimeBudgetWei = '10000000',
  native = false,
  single = false,
  networkFees?: () => Promise<{
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  }>,
  estimate?: (operation: UserOperationV07) => Promise<UserOperationV07>,
) {
  const nativeRecipient = native ? Wallet.createRandom().address : undefined;
  const f = await fixture((c) => {
    c.submissionBinding = userOperationExecutionBinding(bundler);
    if (single) {
      c.acceptance.rpcVerification = 'single';
      c.acceptance.rpcUrls = [c.acceptance.rpcUrls[0]];
    }
    c.sponsors[0].lifetimeBudgetWei = lifetimeBudgetWei;
  }, nativeRecipient);
  (f.context.principal.scopes as string[]).push(
    'wallet:execute',
    'wallet:execute:read',
  );
  const s = {
    sends: 0,
    lost: false,
    included: false,
    success: true,
    finalized: false,
    reorg: false,
    badPayload: false,
    badCost: false,
    mismatch: false,
    hint: false,
    aggregated: false,
    noEvent: false,
    recoveryRequest: undefined as typeof fetch | undefined,
    operation: undefined as SignedUserOperationV07 | undefined,
  };
  const from = Wallet.createRandom().address,
    other = Wallet.createRandom().address;
  function evidence() {
    const op = s.operation!,
      hash = signedUserOperationHash(op, f.config.acceptance.domain);
    const common = {
      transactionHash: txHash,
      blockHash,
      blockNumber: '0x64',
      removed: false,
    };
    const event = (h: string, sender: string, nonce = op.nonce) => ({
      address: f.config.acceptance.entryPoint.address,
      ...ep.encodeEventLog(ep.getEvent('UserOperationEvent')!, [
        h,
        sender,
        op.paymaster,
        nonce,
        s.success,
        s.badCost ? 1000000000 : 1000,
        100,
      ]),
    });
    const previous = { ...op, sender: other },
      next = { ...op, sender: other, nonce: '0x1' };
    const logs = [
      {
        address: f.config.acceptance.entryPoint.address,
        ...ep.encodeEventLog(ep.getEvent('BeforeExecution')!, []),
      },
      { address: other, topics: [], data: '0x1111' },
      event(
        signedUserOperationHash(previous, f.config.acceptance.domain),
        other,
      ),
      { address: f.input.calls[0].to, topics: [], data: '0x2222' },
      event(s.noEvent ? '0x' + 'f'.repeat(64) : hash, op.sender),
      { address: other, topics: [], data: '0x3333' },
      event(
        signedUserOperationHash(next, f.config.acceptance.domain),
        other,
        next.nonce,
      ),
    ].map((l, i) => ({ ...l, ...common, logIndex: toQuantity(i) }));
    const packed = packedUserOperation(op);
    if (s.badPayload) packed.signature = '0x' + '00'.repeat(77);
    const operations = [
      packedUserOperation(previous),
      packed,
      packedUserOperation(next),
    ];
    return {
      logs,
      receipt: {
        ...common,
        to: f.config.acceptance.entryPoint.address,
        from,
        status: '0x1',
        gasUsed: '0xffff',
        logs,
      },
      tx: {
        hash: txHash,
        blockHash,
        blockNumber: '0x64',
        to: f.config.acceptance.entryPoint.address,
        from,
        chainId: '0x14a34',
        value: '0x0',
        input: s.aggregated
          ? ep.encodeFunctionData('handleAggregatedOps', [
              [
                {
                  userOps: operations,
                  aggregator: ZeroAddress,
                  signature: '0x',
                },
              ],
              from,
            ])
          : ep.encodeFunctionData('handleOps', [operations, from]),
      },
    };
  }
  const request = (async (url, options) => {
    const body = JSON.parse(String(options?.body)),
      { method, params } = body;
    const origin = new URL(String(url)).origin;
    let result: unknown;
    if (origin === 'https://bundler.example.test') {
      if (method === 'eth_chainId') result = '0x14a34';
      else if (method === 'eth_supportedEntryPoints')
        result = [f.config.acceptance.domain.entryPoint];
      else if (method === 'eth_sendUserOperation') {
        s.sends++;
        s.operation = params[0];
        if (s.lost) throw new Error('Lost reply');
        result = signedUserOperationHash(
          s.operation!,
          f.config.acceptance.domain,
        );
      } else if (method === 'eth_getUserOperationReceipt')
        result = s.hint
          ? { userOpHash: params[0], receipt: { transactionHash: txHash } }
          : null;
      else throw new Error('Unexpected bundler method');
    } else if (s.recoveryRequest) return s.recoveryRequest(url, options);
    else if (
      method === 'eth_getBlockByNumber' &&
      ['safe', 'finalized'].includes(params[0])
    )
      result = { number: s.finalized ? '0x64' : '0x63', hash: blockHash };
    else if (
      method === 'eth_getBlockByNumber' &&
      params[0] === '0x64' &&
      s.reorg
    )
      result = { number: '0x64', hash: '0x' + 'f'.repeat(64) };
    else if (method === 'eth_getLogs')
      result = s.included
        ? [
            {
              transactionHash: txHash,
              address: f.config.acceptance.entryPoint.address,
              topics: [
                ep.getEvent('UserOperationEvent')!.topicHash,
                signedUserOperationHash(
                  s.operation!,
                  f.config.acceptance.domain,
                ),
              ],
            },
          ]
        : [];
    else if (method === 'eth_getTransactionReceipt')
      result = s.included ? evidence().receipt : null;
    else if (method === 'eth_getTransactionByHash')
      result = s.included ? evidence().tx : null;
    else return f.request(url, options);
    if (
      s.mismatch &&
      origin === 'https://secondary.example.test' &&
      method === 'eth_getTransactionReceipt'
    )
      (result as { logs: { data: string }[] }).logs[3].data = '0x4444';
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
    );
  }) as typeof fetch;
  const compose = () => {
    const execution = new UserOperationExecutionCoordinator(
      f.actions,
      f.db,
      f.service,
      bundler,
      async () => 'Bearer offline',
      request,
    );
    const {
      callGasLimit,
      verificationGasLimit,
      preVerificationGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    } = f.operation;
    const driver = new UserOperationWalletCallsDriver(
      f.actions,
      f.db,
      execution,
      {
        gas: {
          callGasLimit,
          verificationGasLimit,
          preVerificationGas,
          maxFeePerGas,
          maxPriorityFeePerGas,
        },
        maxDepthPerSafe: 3,
        maxWaitSeconds: 60,
        pollIntervalSeconds: 5,
      },
      networkFees,
      undefined,
      estimate,
    );
    return {
      execution,
      driver,
      calls: new WalletCallsService(f.actions, driver),
    };
  };
  let ports = compose();
  const submit = (id = 'batch') =>
    ports.calls.request(
      f.context.principal,
      f.input.account_id,
      'wallet_sendCalls',
      [
        {
          id,
          version: '2.0.0',
          atomicRequired: true,
          capabilities: { applicationAction: f.input.application_action },
          chainId: '0x14a34',
          calls: (nativeRecipient
            ? [{ to: nativeRecipient, value: '4', data: '0x' }]
            : f.input.calls
          ).map((c) => ({
            ...c,
            value: toQuantity(c.value),
          })),
        },
      ],
    );
  const status = () =>
    ports.calls.request(
      f.context.principal,
      f.input.account_id,
      'wallet_getCallsStatus',
      ['batch'],
    );
  return {
    f,
    s,
    request,
    get ports() {
      return ports;
    },
    submit,
    status,
    async restart() {
      await f.restart();
      ports = compose();
    },
  };
}

describe('ERC-4337 wallet calls durable submission and independent receipt recovery', () => {
  it('verifies the complete operation with one explicitly configured RPC source', async () => {
    const t = await setup('10000000', false, true);
    t.s.mismatch = true;
    await t.submit();
    await t.ports.driver.runOnce();
    t.s.included = true;
    expect(await t.status()).toMatchObject({ status: 200 });
    t.s.badCost = true;
    expect(await t.status()).toMatchObject({ status: 100 });
    expect(t.s.sends).toBe(1);
  });
  it('advertises the accepted server paymaster and queues without financial effects', async () => {
    const t = await setup();
    expect(
      await t.ports.calls.request(
        t.f.context.principal,
        t.f.input.account_id,
        'wallet_getCapabilities',
        [t.f.config.basePolicy.accounts[0].address],
      ),
    ).toMatchObject({ '0x14a34': { paymasterService: { supported: true } } });
    await t.submit();
    expect(await t.status()).toMatchObject({ status: 100 });
    expect(t.s.sends + t.f.state.posts + t.f.state.signs).toBe(0);
    await expect(t.submit()).rejects.toMatchObject({ code: 5720 });
    expect(() =>
      t.ports.driver.acceptPaymaster({ url: 'https://attacker.example.test' }),
    ).toThrow();
    expect(() =>
      t.ports.driver.acceptPaymaster({
        url: t.f.config.paymaster.url,
        context: { owner: 'private' },
      }),
    ).toThrow();
    expect(() =>
      t.ports.driver.acceptPaymaster({
        url: t.f.config.paymaster.url,
        context: {},
      }),
    ).not.toThrow();
  });
  it('dispatches once, recovers a lost reply across restart and isolates per-operation logs', async () => {
    const t = await setup();
    t.s.lost = true;
    await t.submit();
    await t.ports.driver.runOnce();
    expect(t.s.sends).toBe(1);
    expect(t.f.state.posts).toBe(2);
    expect(t.f.state.signs).toBe(1);
    expect(await t.status()).toMatchObject({ status: 100 });
    await t.restart();
    await t.ports.driver.runOnce();
    expect(t.s.sends).toBe(1);
    t.s.included = true;
    expect(await t.status()).toMatchObject({
      status: 200,
      receipts: [{ gasUsed: '0x64', logs: [{ data: '0x2222' }] }],
    });
    const result = (await t.status()) as { receipts: { logs: unknown[] }[] };
    expect(result.receipts[0].logs).toHaveLength(1);
    t.s.finalized = true;
    await t.ports.driver.runOnce();
    const plans = await t.f.onboarding.store.transaction((s) =>
      Object.values(s.userOperationExecutions ?? {}),
    );
    expect(plans[0].observation.state).toBe('finalized');
    expect(plans[0].dispatch?.state).toBe('unknown');
    expect(plans[0].observation.actualGasCost).toBe('1000');
    expect(t.s.sends).toBe(1);
  });
  it('uses UserOperationEvent failure even when the outer bundle succeeded', async () => {
    const t = await setup();
    await t.submit();
    await t.ports.driver.runOnce();
    t.s.included = true;
    t.s.success = false;
    expect(await t.status()).toMatchObject({
      status: 500,
      receipts: [{ status: '0x0' }],
    });
  });
  it.each(['badPayload', 'badCost', 'mismatch'] as const)(
    'does not confirm invalid independent evidence: %s',
    async (key) => {
      const t = await setup();
      await t.submit();
      await t.ports.driver.runOnce();
      t.s.included = true;
      t.s[key] = true;
      expect(await t.status()).toMatchObject({ status: 100 });
      expect(t.s.sends).toBe(1);
      t.s[key] = false;
      expect(await t.status()).toMatchObject({ status: 200 });
    },
  );
  it('demotes a reorged receipt and recovers without another submission', async () => {
    const t = await setup();
    await t.submit();
    await t.ports.driver.runOnce();
    t.s.included = true;
    expect(await t.status()).toMatchObject({ status: 200 });
    t.s.reorg = true;
    expect(await t.status()).toMatchObject({ status: 100 });
    t.s.reorg = false;
    expect(await t.status()).toMatchObject({ status: 200 });
    expect(t.s.sends).toBe(1);
  });
  it('does not sign, sponsor or submit again when workers overlap', async () => {
    const t = await setup();
    await t.submit();
    await Promise.all([t.ports.driver.runOnce(), t.ports.driver.runOnce()]);
    await t.ports.driver.runOnce();
    expect(t.s.sends).toBe(1);
    expect(t.f.state.signs).toBe(1);
    expect(t.f.state.posts).toBe(2);
  });
  it('releases FIFO at canonical inclusion and blocks status access from a different subject', async () => {
    const t = await setup();
    await t.submit();
    await t.submit('second');
    await t.ports.driver.runOnce();
    await t.ports.driver.runOnce();
    expect(t.s.sends).toBe(1);
    await expect(
      t.ports.calls.request(
        { ...t.f.context.principal, subject: 'stranger' },
        t.f.input.account_id,
        'wallet_getCallsStatus',
        ['batch'],
      ),
    ).rejects.toBeDefined();
    t.s.included = true;
    await t.ports.driver.runOnce();
    const first = await t.f.onboarding.store.transaction((s) =>
      Object.values(s.userOperationBatches ?? {}).find(
        (e) => e.metadata.id === 'batch',
      ),
    );
    expect(first?.stage).toBe('included');
    expect(t.s.finalized).toBe(false);
    expect(await t.status()).toMatchObject({ status: 200 });
    // Removing the predecessor's canonical receipt prevents the next account nonce from dispatching.
    t.s.reorg = true;
    await t.ports.driver.runOnce();
    expect(t.s.sends).toBe(1);
  });
  it('accepts the exact operation inside handleAggregatedOps with no aggregator', async () => {
    const t = await setup();
    await t.submit();
    await t.ports.driver.runOnce();
    t.s.included = true;
    t.s.aggregated = true;
    expect(await t.status()).toMatchObject({ status: 200 });
  });
  it('does not trust a bundler receipt hint without the exact on-chain operation event', async () => {
    const t = await setup();
    await t.submit();
    await t.ports.driver.runOnce();
    t.s.hint = true;
    expect(await t.status()).toMatchObject({ status: 100 });
    t.s.included = true;
    t.s.noEvent = true;
    expect(await t.status()).toMatchObject({ status: 100 });
    expect(t.s.sends).toBe(1);
  });
  it('keeps shared reservations and the mechanism lock after uncertain dispatch and reversion', async () => {
    const t = await setup();
    t.s.lost = true;
    await t.submit();
    await t.ports.driver.runOnce();
    const before = await t.f.onboarding.store.transaction((s) => s.budgets);
    t.s.included = true;
    t.s.success = false;
    t.s.finalized = true;
    expect(await t.status()).toMatchObject({ status: 500 });
    expect(await t.f.onboarding.store.transaction((s) => s.budgets)).toEqual(
      before,
    );
    expect(t.s.sends).toBe(1);
  });
  it('recovers existing evidence after financial consent is withdrawn, but denies a revoked read grant', async () => {
    const t = await setup();
    await t.submit();
    await t.ports.driver.runOnce();
    t.f.state.consent = false;
    t.s.included = true;
    expect(await t.status()).toMatchObject({ status: 200 });
    await t.ports.driver.runOnce();
    expect(t.s.sends).toBe(1);
    await t.f.onboarding.store.transaction((s) => {
      s.grants[t.f.grant.grant_id!].state = 'revoked';
    });
    await expect(t.status()).rejects.toBeDefined();
  });
  it('denies missing current sponsorship consent before financial effects', async () => {
    const t = await setup();
    await t.submit();
    t.f.state.consent = false;
    await t.ports.driver.runOnce();
    expect(t.s.sends + t.f.state.signs + t.f.state.posts).toBe(0);
    expect(await t.status()).toMatchObject({ status: 100 });
  });
  it.each([false, true])(
    'expires a lost paymaster quote only when no user-signing attempt exists (signing exposure: %s)',
    async (signingExposure) => {
      const t = await setup();
      await t.submit();
      t.f.state.lostPaymaster = !signingExposure;
      t.f.state.lostSign = signingExposure;
      await t.ports.driver.runOnce();
      const entry = await t.f.onboarding.store.transaction(
        (s) => Object.values(s.userOperationBatches!)[0],
      );
      const record = t.f.db.sponsorship.load(entry.operationId!)!;
      const before = t.f.db.budget(record.gasBudgetId);
      expect(t.f.db.hasActionAttempts(record.signingActionId)).toBe(
        signingExposure,
      );
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(Number(record.validUntil) * 1000 + 5000));
        await t.ports.driver.runOnce();
        expect(
          await t.f.onboarding.store.transaction(
            (s) => Object.values(s.userOperationBatches!)[0].stage,
          ),
        ).toBe(signingExposure ? 'blocked' : 'expired');
        expect(t.f.db.budget(record.gasBudgetId)).toEqual(before);
        expect(t.s.sends).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it('does not reclaim an expired dispatch after a crash or lose the source operation link', async () => {
    const t = await setup();
    await t.submit();
    await t.ports.driver.runOnce();
    await t.f.onboarding.store.transaction((s) => {
      const plan = Object.values(s.userOperationExecutions!)[0];
      plan.dispatch!.state = 'dispatch';
      plan.dispatch!.expiresAt = Date.now() - 1;
      delete Object.values(s.userOperationBatches!)[0].operationId;
    });
    await t.restart();
    await t.ports.driver.runOnce();
    t.s.included = true;
    expect(await t.status()).toMatchObject({ status: 200 });
    expect(t.s.sends).toBe(1);
    expect(t.f.state.posts).toBe(2);
    expect(t.f.state.signs).toBe(1);
  });
  it('keeps a budget-denied source operation readable as a blocked batch', async () => {
    const t = await setup('1');
    await t.submit();
    await t.ports.driver.runOnce();
    await t.ports.driver.runOnce();
    expect(await t.status()).toMatchObject({ status: 100 });
    expect(t.s.sends + t.f.state.posts + t.f.state.signs).toBe(0);
  });
  it('submits a native transfer through wallet calls with shared runtime authority and durable SafeOp signing', async () => {
    const t = await setup('10000000', true);
    await t.submit();
    await t.ports.driver.runOnce();
    expect(t.s.sends).toBe(1);
    expect(t.f.state.posts).toBe(2);
    expect(t.f.state.signs).toBe(1);
    const plans = await t.f.onboarding.store.transaction((s) =>
      Object.values(s.userOperationExecutions!),
    );
    expect(plans[0].intent.calls[0]).toMatchObject({ value: '4', data: '0x' });
    expect(plans[0].intent.nativeRecipients).toHaveLength(1);
    t.s.included = true;
    expect(await t.status()).toMatchObject({ status: 200 });
  });
  it('denies a native recipient whose accepted empty-code pin changed before sponsorship', async () => {
    const t = await setup('10000000', true),
      recipient = t.f.config.basePolicy.nativeTransfers!.recipients[0].address;
    t.f.state.mutate = (method, result, params) =>
      method === 'eth_getCode' &&
      String(params[0]).toLowerCase() === recipient.toLowerCase()
        ? '0x6001'
        : result;
    await t.submit();
    await t.ports.driver.runOnce();
    expect(t.s.sends + t.f.state.posts + t.f.state.signs).toBe(0);
  });
});

it('reuses an exact receipt proof while checking canonicality and isolating changed budgets', async () => {
  const t = await setup('10000000', false, true);
  await t.submit();
  await t.ports.driver.runOnce();
  t.s.included = true;
  const plans = await t.f.onboarding.store.transaction((s) =>
    Object.values(s.userOperationExecutions ?? {}),
  );
  const plan = plans[0];
  const methods: string[] = [];
  const request: typeof fetch = async (input, init) => {
    methods.push(JSON.parse(String(init?.body)).method);
    return t.request(input, init);
  };
  const observer = new UserOperationReceiptObserver(
    { ...t.f.config.acceptance, aggregateReads: true },
    100,
    request,
  );
  const first = await observer.observe(plan, '10000000', txHash);
  expect(first.receipt).toBeDefined();
  methods.length = 0;
  expect((await observer.observe(plan, '10000000', txHash)).receipt).toEqual(
    first.receipt,
  );
  expect(methods).not.toContain('eth_getTransactionReceipt');
  expect(methods).not.toContain('eth_getTransactionByHash');
  expect(methods).toContain('eth_getBlockByNumber');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 121000);
  try {
    methods.length = 0;
    expect((await observer.observe(plan, '10000000', txHash)).receipt).toEqual(
      first.receipt,
    );
    expect(methods).not.toContain('eth_getTransactionReceipt');
    expect(methods).not.toContain('eth_getTransactionByHash');
    expect(methods).toContain('eth_getBlockByNumber');
  } finally {
    clock.mockRestore();
  }
  await expect(observer.observe(plan, '1', txHash)).rejects.toThrow();
  t.s.reorg = true;
  expect(
    (await observer.observe(plan, '10000000', txHash)).receipt,
  ).toBeUndefined();
});

it('retries a failed final preflight without recording a dispatch or sending twice', async () => {
  const t = await setup();
  const original = t.f.service.authorizeSubmission.bind(t.f.service);
  let unavailable = true;
  vi.spyOn(t.f.service, 'authorizeSubmission').mockImplementation(
    async (context, id, verifyChain = true) => {
      if (verifyChain && unavailable) {
        unavailable = false;
        throw new Error('Offline preflight unavailable');
      }
      return original(context, id, verifyChain);
    },
  );
  await t.submit();
  await t.ports.driver.runOnce();
  expect(t.s.sends).toBe(0);
  const plans = await t.f.onboarding.store.transaction((s) =>
    Object.values(s.userOperationExecutions ?? {}),
  );
  expect(plans).toHaveLength(1);
  expect(plans[0].dispatch).toBeUndefined();
  await t.ports.driver.runOnce();
  expect(t.s.sends).toBe(1);
});

it('keeps aggregate receipt proofs independent across quorum sources', async () => {
  const t = await setup();
  await t.submit();
  await t.ports.driver.runOnce();
  t.s.included = true;
  t.s.mismatch = true;
  const plans = await t.f.onboarding.store.transaction((s) =>
    Object.values(s.userOperationExecutions ?? {}),
  );
  const observer = new UserOperationReceiptObserver(
    { ...t.f.config.acceptance, aggregateReads: true },
    100,
    t.request,
  );
  await expect(
    observer.observe(plans[0], '10000000', txHash),
  ).rejects.toThrow();
});

it.each([
  'complete',
  'not-finalized',
  'event-in-later-page',
  'reorg',
  'outage',
])(
  'retains uncertain dispatch and reservations while expiry recovery is %s',
  async (outcome) => {
    const t = await setup();
    t.s.lost = true;
    await t.submit();
    await t.ports.driver.runOnce();
    const plans = await t.f.onboarding.store.transaction((s) =>
      Object.values(s.userOperationExecutions!),
    );
    const plan = plans[0];
    expect(plan.dispatch?.state).toBe('unknown');
    const sponsorship = t.f.db.sponsorship.load(plan.operationId)!;
    const budget = await t.f.db.budget(sponsorship.gasBudgetId);
    const until = BigInt('0x' + plan.operation.signature.slice(14, 26));
    const ranges: [bigint, bigint][] = [];
    let expiryAnchorReads = 0;
    t.s.recoveryRequest = async (url, options) => {
      const body = JSON.parse(String(options?.body));
      const { method, params } = body;
      let result: unknown;
      if (method === 'eth_getBlockByNumber' && params[0] !== '0x0') {
        const number =
          params[0] === 'latest' || params[0] === 'safe'
            ? '0x164'
            : params[0] === 'finalized'
              ? '0x163'
              : params[0];
        if (params[0] === '0x163') expiryAnchorReads++;
        result = {
          number,
          hash:
            outcome === 'reorg' && expiryAnchorReads > 1
              ? '0x' + 'f'.repeat(64)
              : blockHash,
          timestamp: toQuantity(
            until + (outcome === 'not-finalized' ? 0n : 1n),
          ),
        };
      } else if (method === 'eth_getLogs') {
        const from = BigInt(params[0].fromBlock),
          to = BigInt(params[0].toBlock);
        ranges.push([from, to]);
        if (outcome === 'outage') throw Error('Offline recovery outage');
        result =
          outcome === 'event-in-later-page' && from >= 300n
            ? [{ transactionHash: txHash }]
            : [];
      } else return t.f.request(url, options);
      return Response.json({ jsonrpc: '2.0', id: body.id, result });
    };
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Number(until + 10n) * 1000);
    try {
      await t.ports.driver.runOnce();
      const latest = await t.ports.execution.load(plan.operationId);
      expect(latest?.dispatch).toEqual(plan.dispatch);
      expect(await t.f.db.budget(sponsorship.gasBudgetId)).toEqual(budget);
      expect(t.s.sends).toBe(1);
      expect(t.f.state.signs).toBe(1);
      if (outcome === 'complete') {
        expect(latest?.observation).toMatchObject({
          state: 'expired',
          expiry: {
            validUntil: until.toString(),
            finalizedBlock: '355',
            blockHash,
          },
        });
        expect(ranges).toContainEqual([100n, 199n]);
        expect(ranges).toContainEqual([200n, 299n]);
        expect(ranges).toContainEqual([300n, 355n]);
        expect(await t.status()).toMatchObject({ status: 400 });
      } else expect(latest?.observation.state).not.toBe('expired');
    } finally {
      now.mockRestore();
    }
  },
);

it('retries a known fee-ceiling wait before account reads and retains only a stable failure code', async () => {
  const fees = vi
    .fn<() => Promise<{ maxFeePerGas: string; maxPriorityFeePerGas: string }>>()
    .mockRejectedValue(new NetworkFeeLimitError());
  const t = await setup('10000000', false, false, fees);
  let nonceReads = 0;
  t.f.state.mutate = (method, result) => {
    if (method === 'eth_call') nonceReads++;
    return result;
  };
  await t.submit();
  await t.ports.driver.runOnce();
  const first = nonceReads;
  expect(first).toBeGreaterThan(0);
  await t.ports.driver.runOnce();
  expect(nonceReads).toBe(first);
  const batches = await t.f.onboarding.store.transaction((s) =>
    Object.values(s.userOperationBatches!),
  );
  expect(batches[0]).toMatchObject({
    stage: 'blocked',
    retryCount: 2,
    lastFailure: { code: 'network_fee_limit' },
  });
  expect(t.s.sends + t.f.state.posts + t.f.state.signs).toBe(0);
  fees.mockResolvedValue({
    maxFeePerGas: t.f.operation.maxFeePerGas,
    maxPriorityFeePerGas: t.f.operation.maxPriorityFeePerGas,
  });
  await t.ports.driver.runOnce();
  expect(t.s.sends).toBe(1);
});

it('makes a known pre-admission execution revert terminal without reserving a nonce or blocking the next batch', async () => {
  let rejected = false;
  const t = await setup(
    '10000000',
    false,
    false,
    undefined,
    async (operation) => {
      if (!rejected) {
        rejected = true;
        throw new WalletProviderError(
          'wallet_provider_rejected',
          'not_dispatched',
        );
      }
      return operation;
    },
  );
  await t.submit();
  await t.ports.driver.runOnce();
  expect(await t.status()).toMatchObject({ status: 500 });
  expect(t.s.sends + t.f.state.posts + t.f.state.signs).toBe(0);
  await t.submit('next');
  await t.ports.driver.runOnce();
  expect(t.s.sends).toBe(1);
});
it('retains uncertain estimator failures as retryable without signing', async () => {
  const t = await setup('10000000', false, false, undefined, async () => {
    throw new WalletProviderError(
      'wallet_provider_unavailable',
      'not_dispatched',
    );
  });
  await t.submit();
  await t.ports.driver.runOnce();
  expect(await t.status()).toMatchObject({ status: 100 });
  expect(t.s.sends + t.f.state.posts + t.f.state.signs).toBe(0);
});
