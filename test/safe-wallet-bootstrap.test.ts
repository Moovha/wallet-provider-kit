import { currentRuntimePolicy } from '../src/runtime-configuration/authority.js';
import { fingerprint } from '../src/onboarding/policy.js';
import { Safe4337Verifier } from '../src/sponsorship/verifier.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Transaction, Wallet, keccak256 } from 'ethers';
import { expect, it, vi, afterEach } from 'vitest';
import { fixture } from './helpers/safe-4337.js';
import { SafeWalletRuntime } from '../src/sponsorship/safe-wallet.js';
import { ApplicationCredentialCipher } from '../src/runtime-configuration/credentials.js';
import { runtimeApplicationId } from '../src/runtime-configuration/service.js';
import { applicationGasBudgetId } from '../src/sponsorship/budget.js';
import type { ProviderConfiguration } from '../src/deployment/config.js';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function bootstrap(
  maximum: string,
  invisibleBlocks = 0,
  observationErrors = 0,
  receiptStatus = '0x1',
  acknowledge = false,
  pendingLookup = false,
  fundingBalance = '0xde0b6b3a7640000',
) {
  const f = await fixture();
  const applicationId = runtimeApplicationId(
    f.context.principal.issuer,
    f.context.principal.clientId,
  );
  const genesis = '0x' + '12'.repeat(32),
    code = '0x6001600055';
  await f.db.onboardingStore.transaction((s) => {
    const r = s.deploymentBindings!['service-v1'].runtimeConfiguration!;
    (r.obligations ??= { records: {}, receipts: {} }).records[
      applicationId + ':services'
    ] = {
      application_id: applicationId,
      kind: 'services',
      revision: '1',
      value: [],
      submitted_at: new Date().toISOString(),
      decision: 'accepted',
      decision_revision: '1',
    };
    (r.obligations ??= { records: {}, receipts: {} }).records[
      applicationId + ':sponsorship'
    ] = {
      application_id: applicationId,
      kind: 'sponsorship',
      revision: '1',
      decision: 'accepted',
      decision_revision: '1',
      submitted_at: new Date().toISOString(),
      value: {
        chain_id: 'eip155:84532',
        funding_agreement: 'offline-bootstrap',
        maximum_gas_budget_wei: maximum,
        account_model: 'provider-controlled-user-safe',
        maximum_execution_accounts: 10,
        asset_model: 'individual-user-wallets',
        gas_limits: {
          gas_limit: '500000',
          max_fee_per_gas: '100',
          max_priority_fee_per_gas: '10',
          l1_fee_reserve_wei: '10',
        },
      },
    };
  });
  f.runtime.rpcEndpoints = async (_id, kind) =>
    kind === 'rpc-observation' ? [] : ['https://rpc.example.test'];
  f.runtime.withRpc = async (_id, work) => work(['https://rpc.example.test']);
  const config = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  ) as ProviderConfiguration;
  config.network = 'base-sepolia';
  config.policy = f.onboarding.policy;
  config.activation.enabled = true;
  config.safeWallet = {
    profile: 'safe-only-4337-v1',
    genesisHash: genesis,
    entryPoint: {
      address: Wallet.createRandom().address,
      codeHash: keccak256(code),
    },
    module: {
      address: Wallet.createRandom().address,
      codeHash: keccak256(code),
    },
    bundlerAuthorization: { env: 'OFFLINE_BUNDLER' },
    runtimeDirectory: '.provider-data/bundler',
    maximumSetupCostWei: '10000000000',
    executorBalanceWei: '10',
    paymasterDepositWei: '10',
  };
  const submitted: Transaction[] = [];
  let broadcasts = 0,
    included = false;
  let dispatched!: () => void;
  const didDispatch = new Promise<void>((r) => {
    dispatched = r;
  });
  const request = (async (_url, init) => {
    const b = JSON.parse(String(init?.body));
    let result: unknown;
    switch (b.method) {
      case 'eth_chainId':
        result = '0x14a34';
        break;
      case 'eth_getBlockByNumber':
        if (included && b.params[0] !== '0x0' && observationErrors > 0) {
          observationErrors--;
          return Response.json({
            jsonrpc: '2.0',
            id: b.id,
            error: { code: -32603, message: 'Offline observation failure' },
          });
        }
        if (included && b.params[0] !== '0x0' && invisibleBlocks > 0) {
          invisibleBlocks--;
          result = null;
          break;
        }
        result = {
          hash: b.params[0] === '0x0' ? genesis : '0x' + '34'.repeat(32),
          number: '0x1',
        };
        break;
      case 'eth_call':
        result = '0x' + 100n.toString(16).padStart(64, '0');
        break;
      case 'eth_getCode':
        result = code;
        break;
      case 'eth_feeHistory':
        result = {
          baseFeePerGas: Array(6).fill('0xa'),
          reward: Array(5).fill(['0x1']),
        };
        break;
      case 'eth_estimateGas':
        result = '0x186a0';
        break;
      case 'eth_getBalance':
        result = fundingBalance;
        break;
      case 'eth_getTransactionCount':
        result = '0x0';
        break;
      case 'eth_getTransactionReceipt':
        result = included
          ? {
              status: receiptStatus,
              blockNumber: '0x1',
              blockHash: '0x' + '34'.repeat(32),
            }
          : null;
        break;
      case 'eth_getTransactionByHash': {
        const tx = submitted.find((tx) => tx.hash === b.params[0]);
        result =
          pendingLookup && tx
            ? {
                hash: tx.hash,
                from: tx.from,
                nonce: '0x' + tx.nonce.toString(16),
              }
            : null;
        break;
      }
      case 'eth_sendRawTransaction':
        submitted.push(Transaction.from(b.params[0]));
        broadcasts++;
        dispatched();
        if (acknowledge)
          return Response.json({
            jsonrpc: '2.0',
            id: b.id,
            result: submitted.at(-1)!.hash,
          });
        return Response.json({
          jsonrpc: '2.0',
          id: b.id,
          error: { code: -32603, message: 'Offline lost response' },
        });
      default:
        throw Error('Unexpected offline method');
    }
    return Response.json({ jsonrpc: '2.0', id: b.id, result });
  }) as typeof fetch;
  const createRuntime = () =>
    new SafeWalletRuntime(
      config,
      f.db,
      f.runtime,
      f.onboarding,
      f.actions,
      f.backend,
      new ApplicationCredentialCipher(Buffer.alloc(32, 7).toString('base64')),
      f.directory,
      'offline-bundler-authorization-with-32-characters',
      request,
    );
  const runtime = createRuntime();
  const stored = () =>
    f.db.onboardingStore.transaction(
      (s) =>
        s.deploymentBindings!['service-v1'].runtimeConfiguration!
          .safeWalletInfrastructure?.[applicationId],
    );
  const budget = () =>
    f.db.budget(
      applicationGasBudgetId(
        f.onboarding.policy.provider.origin,
        f.context.principal.issuer,
        f.context.principal.clientId,
      ),
    );
  return {
    f,
    config,
    runtime,
    createRuntime,
    applicationId,
    stored,
    budget,
    didDispatch,
    submitted,
    get broadcasts() {
      return broadcasts;
    },
    include() {
      included = true;
    },
  };
}
it('prepares a stable encrypted fee address while execution is disabled without chain access or spending', async () => {
  const t = await bootstrap('10000000');
  t.config.activation.enabled = false;
  const rpc = vi
    .spyOn(t.f.runtime, 'rpcEndpoints')
    .mockRejectedValue(new Error('No chain access permitted'));
  const first = await t.runtime.prepareFundingAddress(
    t.f.operatorContext,
    t.applicationId,
  );
  const retry = await t
    .createRuntime()
    .prepareFundingAddress(
      { ...t.f.operatorContext, idempotencyKey: randomUUID() },
      t.applicationId,
    );
  expect(first.status).toBe('needs-funding');
  expect(first.funding_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  expect(retry.funding_address).toBe(first.funding_address);
  const saved = (await t.stored())!;
  expect(saved.transactions).toEqual([]);
  expect(saved.fundingKey).not.toContain('privateKey');
  expect(JSON.stringify(first)).not.toContain(saved.fundingKey);
  expect(rpc).not.toHaveBeenCalled();
  expect(t.broadcasts).toBe(0);
  expect(t.config.activation.enabled).toBe(false);
});
it('denies fee-address creation for an application caller or without accepted sponsorship', async () => {
  const t = await bootstrap('10000000');
  await expect(
    t.runtime.prepareFundingAddress(t.f.context, t.applicationId),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  await t.f.db.onboardingStore.transaction((s) => {
    s.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.obligations!.records[
      t.applicationId + ':sponsorship'
    ].decision = 'pending';
  });
  await expect(
    t.runtime.prepareFundingAddress(t.f.operatorContext, t.applicationId),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(await t.stored()).toBeUndefined();
  expect(t.broadcasts).toBe(0);
});
it('prepares provider-offered funding before application acceptance but blocks setup and spending', async () => {
  const t = await bootstrap('10000000');
  await t.f.db.onboardingStore.transaction((s) => {
    const terms =
      s.deploymentBindings!['service-v1'].runtimeConfiguration!.obligations!
        .records[t.applicationId + ':sponsorship'];
    terms.proposed_by = 'provider';
    terms.decision = 'pending';
  });
  const rpc = vi
    .spyOn(t.f.runtime, 'rpcEndpoints')
    .mockRejectedValue(new Error('No chain access permitted'));
  const first = await t.runtime.prepareFundingAddress(
    t.f.operatorContext,
    t.applicationId,
  );
  expect(first.funding_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  await expect(
    t.runtime.ensure(t.f.operatorContext, t.applicationId),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(rpc).not.toHaveBeenCalled();
  expect(t.broadcasts).toBe(0);
  expect((await t.stored())!.transactions).toEqual([]);
});
it('enforces the operator-confirmed preparation ceiling before any broadcast', async () => {
  const t = await bootstrap('10000000');
  t.config.activation.enabled = false;
  await expect(
    t.runtime.ensure(t.f.operatorContext, t.applicationId, '1'),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(t.broadcasts).toBe(0);
  expect((await t.stored())?.transactions[0]?.raw).toBeUndefined();
  expect((await t.stored())?.setup?.phase).toBe('attention');
});
it('rechecks operator authority after asynchronous connection reads before setup effects', async () => {
  const t = await bootstrap('10000000');
  t.config.activation.enabled = false;
  let revoked = false,
    reads = 0;
  const original = t.f.runtime.assertOperator.bind(t.f.runtime);
  vi.spyOn(t.f.runtime, 'assertOperator').mockImplementation((principal) => {
    if (revoked)
      throw Object.assign(new Error('Offline revoked operator'), {
        code: 'wallet_authorization_denied',
      });
    original(principal);
  });
  vi.spyOn(t.f.runtime, 'rpcEndpoints').mockImplementation(async () => {
    if (++reads === 2) revoked = true;
    return ['https://rpc.example.test'];
  });
  await expect(
    t.runtime.ensure(t.f.operatorContext, t.applicationId),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(t.broadcasts).toBe(0);
  expect(t.config.activation.enabled).toBe(false);
  expect((await t.stored())?.setup?.phase).toBe('attention');
});
it('finishes preparation while execution stays disabled and invalidates success when connections change', async () => {
  const t = await bootstrap('10000000');
  t.config.activation.enabled = false;
  await t.runtime.prepareFundingAddress(t.f.operatorContext, t.applicationId);
  await t.f.db.onboardingStore.transaction((s) => {
    s.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.safeWalletInfrastructure![
      t.applicationId
    ].paymaster = {
      address: Wallet.createRandom().address,
      codeHash: t.config.safeWallet!.module.codeHash,
    };
  });
  const result = await t.runtime.ensure(t.f.operatorContext, t.applicationId);
  expect(result.setup).toMatchObject({
    phase: 'ready',
    running: false,
    execution_enabled: false,
  });
  expect(t.config.activation.enabled).toBe(false);
  await expect(
    t.runtime.driver(t.applicationId, randomUUID()),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  await t.f.db.onboardingStore.transaction((s) => {
    s.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.obligations!.records[
      t.applicationId + ':services'
    ].revision = '2';
  });
  expect(
    (await t.runtime.read(t.f.operatorContext.principal, t.applicationId)).setup
      .phase,
  ).toBe('attention');
  expect(t.broadcasts).toBe(0);
});
it('denies preparation without a current operator or accepted connections while leaving user execution disabled', async () => {
  const t = await bootstrap('10000000');
  t.config.activation.enabled = false;
  await expect(
    t.runtime.ensure(t.f.context, t.applicationId),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  await t.f.db.onboardingStore.transaction((s) => {
    s.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.obligations!.records[
      t.applicationId + ':services'
    ].decision = 'pending';
  });
  await expect(
    t.runtime.ensure(t.f.operatorContext, t.applicationId),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(t.broadcasts).toBe(0);
  expect(t.config.activation.enabled).toBe(false);
});
it('retains an unsigned setup plan and stable infrastructure identities when the shared allowance cannot cover setup', async () => {
  const t = await bootstrap('1');
  await expect(
    t.runtime.ensure(t.f.operatorContext, t.applicationId),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  const first = (await t.stored())!;
  expect(first.transactions).toHaveLength(1);
  expect(first.transactions[0].raw).toBeUndefined();
  expect(first.transactions[0].unsigned.sealed).toBeTruthy();
  expect(t.broadcasts).toBe(0);
  expect((await t.budget())?.reserved).toBe('0');
  await expect(
    t.runtime.ensure(
      { ...t.f.operatorContext, idempotencyKey: randomUUID() },
      t.applicationId,
    ),
  ).rejects.toThrow();
  const again = (await t.stored())!;
  expect(again.fundingAddress).toBe(first.fundingAddress);
  expect(again.paymasterSigner).toEqual(first.paymasterSigner);
  expect(again.transactions[0].id).toBe(first.transactions[0].id);
  expect(t.broadcasts).toBe(0);
});
it('reserves setup gas once and recovers an included original transaction after a lost broadcast response without another nonce or broadcast', async () => {
  const t = await bootstrap('10000000');
  t.config.activation.enabled = false;
  vi.useFakeTimers();
  const running = t.runtime.ensure(t.f.operatorContext, t.applicationId);
  const rejected = running.then(
    () => ({ code: 'unexpected-success' }),
    (error) => error,
  );
  await Promise.race([
    t.didDispatch,
    rejected.then((error) => {
      throw error;
    }),
  ]);
  const first = (await t.stored())!;
  const before = await t.budget();
  expect(BigInt(before!.reserved)).toBeGreaterThan(0n);
  expect(first.transactions[0].raw?.sealed).toBeTruthy();
  await vi.advanceTimersByTimeAsync(31000);
  expect(await rejected).toMatchObject({ code: 'wallet_attempt_pending' });
  vi.useRealTimers();
  t.include();
  // The offline receipt is found, then intentionally mismatched paymaster bytecode prevents activation.
  await expect(
    t.runtime.ensure(t.f.operatorContext, t.applicationId),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  const after = (await t.stored())!;
  expect(after.transactions).toHaveLength(1);
  expect(after.transactions[0].hash).toBe(first.transactions[0].hash);
  expect(after.transactions[0].nonce).toBe(first.transactions[0].nonce);
  expect(after.transactions[0].included).toBe(true);
  // Returning to the real clock leaves the original lease active; observation does not steal its fence.
  expect(
    await t.f.db.journal.read(after.transactions[0].request),
  ).toMatchObject({ state: 'pending' });
  expect(t.broadcasts).toBe(1);
  expect((await t.budget())!.reserved).toBe(before!.reserved);
});

it('rejects an application attempting provider bootstrap before creating infrastructure keys or financial effects', async () => {
  const t = await bootstrap('10000000');
  await expect(
    t.runtime.ensure(t.f.context, t.applicationId),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(await t.stored()).toBeUndefined();
  expect(t.broadcasts).toBe(0);
  expect((await t.budget())?.reserved ?? '0').toBe('0');
});

it('waits through a transient canonical lookup failure and receipt-before-block visibility without another setup transaction', async () => {
  const t = await bootstrap('10000000', 2, 1);
  vi.useFakeTimers();
  const running = t.runtime.ensure(t.f.operatorContext, t.applicationId);
  const result = running.then(
    () => ({ code: 'unexpected-success' }),
    (error) => error,
  );
  await Promise.race([
    t.didDispatch,
    result.then((error) => {
      throw error;
    }),
  ]);
  t.include();
  await vi.advanceTimersByTimeAsync(3000);
  // The canonical receipt is reconciled, then the fixture's deliberately wrong runtime pin denies activation.
  expect(await result).toMatchObject({ code: 'wallet_authorization_denied' });
  expect((await t.stored())!.transactions[0].included).toBe(true);
  expect(t.broadcasts).toBe(1);
});

it('shares one batch snapshot while a stalled account leaves other account workers free to progress', async () => {
  const t = await bootstrap('10000000000');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = {
    runOnce: vi.fn(() => gate),
    settleOnce: vi.fn(async () => false),
    stop: async () => {},
  };
  const fast = {
    runOnce: vi.fn(async () => {}),
    settleOnce: vi.fn(async () => false),
    stop: async () => {},
  };
  const worker = t.runtime as unknown as {
    drivers: Map<string, unknown>;
    runWallets(): Promise<void>;
  };
  worker.drivers.set('slow', slow);
  worker.drivers.set('fast', fast);
  try {
    await worker.runWallets();
    expect(slow.runOnce).toHaveBeenCalledOnce();
    expect(fast.runOnce).toHaveBeenCalledOnce();
    expect(slow.runOnce.mock.calls[0]).toEqual(fast.runOnce.mock.calls[0]);
    await Promise.resolve();
    await worker.runWallets();
    expect(slow.runOnce).toHaveBeenCalledOnce();
    expect(fast.runOnce).toHaveBeenCalledTimes(2);
  } finally {
    release();
    await t.runtime.close();
  }
});

it('lets a queued account recover the included transaction after the preceding setup times out without signing or rebroadcasting', async () => {
  const t = await bootstrap('10000000');
  vi.useFakeTimers();
  const running = t.runtime
    .ensure(t.f.operatorContext, t.applicationId)
    .catch((error) => error);
  await t.didDispatch;
  const original = (await t.stored())!.transactions[0];
  const reserved = (await t.budget())!.reserved;
  const observer = t.runtime as unknown as {
    recoverSetup(applicationId: string): Promise<void>;
    exclusive<T>(
      applicationId: string,
      operation: () => Promise<T>,
    ): Promise<T>;
  };
  const queued = observer.exclusive(t.applicationId, async () => {
    t.include();
    await observer.recoverSetup(t.applicationId);
  });
  await vi.advanceTimersByTimeAsync(31000);
  expect(await running).toMatchObject({ code: 'wallet_attempt_pending' });
  await queued;
  const current = (await t.stored())!.transactions[0];
  expect(current.hash).toBe(original.hash);
  expect(current.nonce).toBe(original.nonce);
  expect(current.included).toBe(true);
  expect(current.settled).toBe(true);
  expect(await t.f.db.journal.read(current.request)).toMatchObject({
    state: 'succeeded',
  });
  expect((await t.budget())!.reserved).toBe(reserved);
  expect(t.broadcasts).toBe(1);
  expect(t.f.state.signs).toBe(0);
});

it('revalidates a ready legacy Safe without repeating setup reads or signing, and checks authority after its proof', async () => {
  const t = await bootstrap('1');
  await t.runtime
    .ensure(t.f.operatorContext, t.applicationId)
    .catch(() => undefined);
  await t.f.db.onboardingStore.transaction((s) => {
    const infra =
      s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .safeWalletInfrastructure![t.applicationId];
    infra.transactions = [];
    infra.paymaster = t.f.config.acceptance.paymaster;
    const snapshot = currentRuntimePolicy(s, t.f.context.principal);
    const revision = fingerprint(['financial-terms', snapshot]);
    for (const grant of Object.values(s.grants)) {
      grant.actionPolicyRevision = revision;
      const request = s.requests[grant.requestId];
      request.actionPolicyRevision = revision;
      request.runtimePolicy = snapshot;
    }
  });
  const internal = t.runtime as unknown as {
    configureAccount(...args: unknown[]): Promise<void>;
    publishBundler(applicationId: string): Promise<void>;
  };
  const configure = vi.spyOn(internal, 'configureAccount');
  vi.spyOn(internal, 'publishBundler').mockResolvedValue();
  const verify = vi
    .spyOn(Safe4337Verifier.prototype, 'verify')
    .mockResolvedValue('0');
  const result = await t.runtime.provision(t.f.context, t.f.grant.account_id!);
  expect(result.address).toBe(t.f.operation.sender);
  expect(configure).not.toHaveBeenCalled();
  expect(verify).toHaveBeenCalledOnce();
  expect(t.broadcasts).toBe(0);
  verify.mockImplementationOnce(async () => {
    await t.f.db.onboardingStore.transaction((s) => {
      s.grants[t.f.grant.grant_id!].state = 'revoked';
    });
    return '0';
  });
  await expect(
    t.runtime.provision(t.f.context, t.f.grant.account_id!),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(t.broadcasts).toBe(0);
});

it('preserves completed historical setup records without admitting their retired attempt kind', async () => {
  const t = await bootstrap('1');
  await t.runtime
    .ensure(t.f.operatorContext, t.applicationId)
    .catch(() => undefined);
  await t.f.db.onboardingStore.transaction((s) => {
    const tx =
      s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .safeWalletInfrastructure![t.applicationId].transactions[0];
    tx.included = true;
    tx.hash = '0x' + '11'.repeat(32);
    (tx.request as unknown as { kind: string }).kind = 'relay_transaction';
  });
  const before = await t.stored();
  const observer = t.runtime as unknown as {
    recoverSetup(applicationId: string): Promise<void>;
  };
  await observer.recoverSetup(t.applicationId);
  expect(await t.stored()).toEqual(before);
  expect(t.broadcasts).toBe(0);
  await t.f.db.onboardingStore.transaction((s) => {
    s.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.safeWalletInfrastructure![
      t.applicationId
    ].transactions[0].included = false;
  });
  await expect(observer.recoverSetup(t.applicationId)).rejects.toMatchObject({
    code: 'wallet_attempt_pending',
  });
});

it('does not advance the funding queue or release gas reservations for a reverted setup receipt', async () => {
  const t = await bootstrap('10000000', 0, 0, '0x0');
  vi.useFakeTimers();
  const running = t.runtime
    .ensure(t.f.operatorContext, t.applicationId)
    .catch((error) => error);
  await t.didDispatch;
  const reserved = (await t.budget())!.reserved;
  t.include();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await running).toMatchObject({ code: 'wallet_authorization_denied' });
  const tx = (await t.stored())!.transactions[0];
  expect(tx.included).not.toBe(true);
  expect(tx.settled).not.toBe(true);
  expect((await t.budget())!.reserved).toBe(reserved);
  expect(t.broadcasts).toBe(1);
});

it('broadcasts consecutive durable nonces before either receipt arrives, even when the RPC pending nonce is stale', async () => {
  const t = await bootstrap('1000000000', 0, 0, '0x1', true);
  vi.useFakeTimers();
  const first = t.runtime
    .ensure(t.f.operatorContext, t.applicationId)
    .catch((error) => error);
  await t.didDispatch;
  const internal = t.runtime as unknown as {
    send(
      applicationId: string,
      purpose: string,
      tx: { to: string; value: string },
      authorize: () => Promise<void>,
    ): Promise<unknown>;
  };
  const authority = vi.fn(async () => {});
  const second = internal.send(
    t.applicationId,
    'safe-deployment-' + randomUUID(),
    { to: Wallet.createRandom().address, value: '0' },
    authority,
  );
  await vi.waitFor(() => expect(t.broadcasts).toBe(2));
  const rows = (await t.stored())!.transactions;
  expect(rows.map((t) => t.nonce)).toEqual([0, 1]);
  expect(t.submitted.map((t) => t.nonce)).toEqual([0, 1]);
  expect(rows.every((t) => t.submitted && !t.included)).toBe(true);
  expect(authority).toHaveBeenCalledTimes(2);
  expect((await t.budget())!.reserved).toBe(
    rows.reduce((n, t) => n + BigInt(t.feeReserveWei), 0n).toString(),
  );
  t.include();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await first).toMatchObject({ code: 'wallet_authorization_denied' });
  await second;
  expect(
    (await t.stored())!.transactions.every((t) => t.included && t.settled),
  ).toBe(true);
  expect(t.broadcasts).toBe(2);
});

it.each([false, true])(
  'requires exact pending-hash observation to advance after a lost acknowledgement (visible=%s)',
  async (visible) => {
    const t = await bootstrap('1000000000', 0, 0, '0x1', false, visible);
    vi.useFakeTimers();
    const first = t.runtime
      .ensure(t.f.operatorContext, t.applicationId)
      .catch((error) => error);
    await t.didDispatch;
    const internal = t.runtime as unknown as {
      send(
        applicationId: string,
        purpose: string,
        tx: { to: string; value: string },
        authorize: () => Promise<void>,
      ): Promise<unknown>;
    };
    const authority = vi.fn(async () => {});
    const next = internal
      .send(
        t.applicationId,
        'safe-deployment-' + randomUUID(),
        { to: Wallet.createRandom().address, value: '0' },
        authority,
      )
      .catch((error) => error);
    if (visible) {
      await vi.waitFor(() => expect(t.broadcasts).toBe(2));
      t.include();
      await vi.advanceTimersByTimeAsync(1000);
      await first;
      await next;
      expect((await t.stored())!.transactions).toHaveLength(2);
    } else {
      expect(await next).toMatchObject({ code: 'wallet_attempt_pending' });
      expect(authority).not.toHaveBeenCalled();
      expect((await t.stored())!.transactions).toHaveLength(1);
      t.include();
      await vi.advanceTimersByTimeAsync(1000);
      await first;
      expect(t.broadcasts).toBe(1);
    }
  },
);

it.each([
  { limit: 1, balance: '0xde0b6b3a7640000', code: 'wallet_attempt_pending' },
  { limit: 10, balance: '0x2dc6c0', code: 'wallet_provider_unavailable' },
])(
  'bounds pending setup by accepted capacity and aggregate funding ($code)',
  async ({ limit, balance, code }) => {
    const t = await bootstrap('1000000000', 0, 0, '0x1', true, false, balance);
    await t.f.db.onboardingStore.transaction((s) => {
      const terms = s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .obligations!.records[t.applicationId + ':sponsorship'].value as {
        maximum_in_flight_per_sponsor?: number;
      };
      terms.maximum_in_flight_per_sponsor = limit;
    });
    vi.useFakeTimers();
    const first = t.runtime
      .ensure(t.f.operatorContext, t.applicationId)
      .catch((error) => error);
    await t.didDispatch;
    await vi.waitFor(() => expect(t.submitted).toHaveLength(1));
    const internal = t.runtime as unknown as {
      send(
        applicationId: string,
        purpose: string,
        tx: { to: string; value: string },
      ): Promise<unknown>;
    };
    const reservation = (await t.budget())!.reserved;
    await expect(
      internal.send(t.applicationId, 'safe-deployment-' + randomUUID(), {
        to: Wallet.createRandom().address,
        value: '0',
      }),
    ).rejects.toMatchObject({ code });
    expect((await t.stored())!.transactions).toHaveLength(1);
    expect((await t.budget())!.reserved).toBe(reservation);
    expect(t.broadcasts).toBe(1);
    t.include();
    await vi.advanceTimersByTimeAsync(1000);
    await first;
  },
);

it('publishes concurrent readiness updates atomically without temporary-file collisions or missing ready accounts', async () => {
  const t = await bootstrap('1');
  await t.runtime
    .ensure(t.f.operatorContext, t.applicationId)
    .catch(() => undefined);
  const secondId = randomUUID(),
    secondAddress = Wallet.createRandom().address;
  await t.f.db.onboardingStore.transaction((s) => {
    const r = s.deploymentBindings!['service-v1'].runtimeConfiguration!;
    r.safeWalletInfrastructure![t.applicationId].paymaster =
      t.f.config.acceptance.paymaster;
    const first = Object.values(r.safeWalletAccounts!)[0];
    r.safeWalletAccounts![secondId] = {
      ...first,
      accountId: secondId,
      binding: {
        ...first.binding,
        accountId: secondId,
        address: secondAddress,
      },
    };
  });
  const internal = t.runtime as unknown as {
    publishBundler(applicationId: string): Promise<void>;
  };
  await Promise.all(
    Array.from({ length: 10 }, () => internal.publishBundler(t.applicationId)),
  );
  const config = JSON.parse(
    await readFile(
      resolve(
        t.f.directory,
        '.provider-data/bundler',
        t.applicationId + '.json',
      ),
      'utf8',
    ),
  );
  expect(config.accounts).toHaveLength(2);
  expect(config.accounts).toContain(t.f.operation.sender);
  expect(config.accounts).toContain(secondAddress);
  expect(t.broadcasts).toBe(0);
});

it('retains the acknowledged nonce tail across a database and service restart', async () => {
  const t = await bootstrap('1000000000', 0, 0, '0x1', true);
  vi.useFakeTimers();
  const first = t.runtime
    .ensure(t.f.operatorContext, t.applicationId)
    .catch((error) => error);
  await t.didDispatch;
  await vi.advanceTimersByTimeAsync(31000);
  expect(await first).toMatchObject({ code: 'wallet_attempt_pending' });
  const before = (await t.stored())!.transactions[0];
  expect(before.submitted).toBe(true);
  await t.f.restart();
  t.f.runtime.rpcEndpoints = async (_id, kind) =>
    kind === 'rpc-observation' ? [] : ['https://rpc.example.test'];
  t.f.runtime.withRpc = async (_id, work) => work(['https://rpc.example.test']);
  const restored = t.createRuntime() as unknown as {
    send(
      applicationId: string,
      purpose: string,
      tx: { to: string; value: string },
    ): Promise<unknown>;
  };
  const second = restored.send(
    t.applicationId,
    'safe-deployment-' + randomUUID(),
    { to: Wallet.createRandom().address, value: '0' },
  );
  await vi.waitFor(() => expect(t.broadcasts).toBe(2));
  expect(t.submitted.map((t) => t.nonce)).toEqual([0, 1]);
  expect((await t.stored())!.transactions[0].hash).toBe(before.hash);
  t.include();
  await vi.advanceTimersByTimeAsync(1000);
  await second;
  expect(t.broadcasts).toBe(2);
});

it('retains the complete original deployment recipe before attempting its transaction and fences later configuration changes', async () => {
  const t = await bootstrap('1');
  await t.runtime
    .ensure(t.f.operatorContext, t.applicationId)
    .catch(() => undefined);
  const historicalSetup = structuredClone((await t.stored())!.transactions[0]);
  await t.f.db.onboardingStore.transaction((s) => {
    const r = s.deploymentBindings!['service-v1'].runtimeConfiguration!;
    r.safeWalletInfrastructure![t.applicationId].transactions = [];
    r.safeWalletInfrastructure![t.applicationId].paymaster =
      t.f.config.acceptance.paymaster;
    delete r.safeWalletAccounts![t.f.grant.account_id!];
    const snapshot = currentRuntimePolicy(s, t.f.context.principal);
    const revision = fingerprint(['financial-terms', snapshot]);
    for (const grant of Object.values(s.grants)) {
      grant.actionPolicyRevision = revision;
      s.requests[grant.requestId].actionPolicyRevision = revision;
      s.requests[grant.requestId].runtimePolicy = snapshot;
    }
  });
  const { safeFactoryInterface } = await import('../src/provisioning/safe.js');
  const { predictSafeAddress } =
    await import('../src/provisioning/recovery.js');
  const internal = t.runtime as unknown as {
    pin(...args: unknown[]): Promise<void>;
    reader(
      ...args: unknown[]
    ): Promise<{ call(...args: unknown[]): Promise<unknown> }>;
    send(...args: unknown[]): Promise<void>;
  };
  vi.spyOn(internal, 'pin').mockResolvedValue();
  vi.spyOn(internal, 'reader').mockResolvedValue({
    call: async () =>
      safeFactoryInterface.encodeFunctionResult('proxyCreationCode', [
        '0x6001',
      ]),
  });
  vi.spyOn(internal, 'send').mockRejectedValue(
    new Error('Offline pre-broadcast stop'),
  );
  await expect(
    t.runtime.provision(t.f.context, t.f.grant.account_id!),
  ).rejects.toThrow('Offline pre-broadcast stop');
  const manifest = await t.runtime.recoveryManifest(
    t.f.context,
    t.f.grant.account_id!,
  );
  expect(predictSafeAddress(manifest)).toBe(manifest.address);
  expect(manifest.saltNonce).toBe(
    BigInt(
      '0x' +
        fingerprint(['safe-wallet', t.applicationId, t.f.grant.account_id!]),
    ).toString(),
  );
  const { sealed: _sealed, ...metadata } = historicalSetup.unsigned;
  historicalSetup.purpose = 'safe-deployment-' + t.f.grant.account_id!;
  historicalSetup.unsigned = new ApplicationCredentialCipher(
    Buffer.alloc(32, 7).toString('base64'),
  ).seal(
    metadata,
    JSON.stringify({
      to: manifest.factory.address,
      data: safeFactoryInterface.encodeFunctionData('createProxyWithNonce', [
        manifest.singleton.address,
        manifest.initializer,
        manifest.saltNonce,
      ]),
    }),
  );
  await t.f.db.onboardingStore.transaction((s) => {
    const r = s.deploymentBindings!['service-v1'].runtimeConfiguration!;
    delete r.safeWalletAccounts![t.f.grant.account_id!].recovery;
    r.safeWalletInfrastructure![t.applicationId].transactions = [];
  });
  await expect(
    t.runtime.recoveryManifest(t.f.context, t.f.grant.account_id!),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  await t.f.db.onboardingStore.transaction((s) => {
    s.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.safeWalletInfrastructure![
      t.applicationId
    ].transactions.push(historicalSetup);
  });
  expect(
    await t.runtime.recoveryManifest(t.f.context, t.f.grant.account_id!),
  ).toEqual(manifest);
  const originalOwner = manifest.owner;
  manifest.owner = Wallet.createRandom().address;
  expect(
    (await t.runtime.recoveryManifest(t.f.context, t.f.grant.account_id!))
      .owner,
  ).toBe(originalOwner);
  await t.f.db.onboardingStore.transaction((s) => {
    s.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.safeWalletAccounts![
      t.f.grant.account_id!
    ].recovery!.proxyCodeHash = '0x' + '00'.repeat(32);
  });
  await expect(
    t.runtime.provision(t.f.context, t.f.grant.account_id!),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  await t.f.db.onboardingStore.transaction((s) => {
    s.grants[t.f.grant.grant_id!].state = 'revoked';
  });
  await expect(
    t.runtime.recoveryManifest(t.f.context, t.f.grant.account_id!),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(t.broadcasts).toBe(0);
});

it('bounds historical observation batches without blocking admission and rotates to the remaining wallets', async () => {
  const t = await bootstrap('10000000000');
  let release!: () => void;
  const gate = new Promise<boolean>((resolve) => {
    release = () => resolve(true);
  });
  const drivers = Array.from({ length: 12 }, (_, index) => ({
    runOnce: vi.fn(async () => {}),
    settleOnce: vi.fn(() => (index === 0 ? gate : Promise.resolve(true))),
    stop: async () => {},
  }));
  const worker = t.runtime as unknown as {
    drivers: Map<string, unknown>;
    runWallets(): Promise<void>;
    settlement?: Promise<void>;
  };
  drivers.forEach((driver, index) => worker.drivers.set(String(index), driver));
  try {
    await worker.runWallets();
    await worker.runWallets();
    for (const driver of drivers)
      expect(driver.runOnce).toHaveBeenCalledTimes(2);
    for (const driver of drivers.slice(0, 10))
      expect(driver.settleOnce).toHaveBeenCalledOnce();
    for (const driver of drivers.slice(10))
      expect(driver.settleOnce).not.toHaveBeenCalled();
    release();
    await worker.settlement;
    await worker.runWallets();
    await worker.settlement;
    for (const driver of drivers.slice(10))
      expect(driver.settleOnce).toHaveBeenCalledOnce();
    expect(drivers[0].runOnce.mock.calls[0]).toEqual([
      expect.any(Array),
      false,
    ]);
  } finally {
    release();
    await t.runtime.close();
  }
});
