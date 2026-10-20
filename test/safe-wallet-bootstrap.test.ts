import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Wallet, keccak256 } from 'ethers';
import { expect, it, vi, afterEach } from 'vitest';
import { fixture } from './helpers/safe-4337.js';
import { SafeWalletRuntime } from '../src/sponsorship/safe-wallet.js';
import { ApplicationCredentialCipher } from '../src/runtime-configuration/credentials.js';
import { runtimeApplicationId } from '../src/runtime-configuration/service.js';
import { applicationGasBudgetId } from '../src/sponsorship/budget.js';
import type { ProviderConfiguration } from '../src/deployment/config.js';
afterEach(() => vi.useRealTimers());
async function bootstrap(maximum: string, invisibleBlocks = 0) {
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
  f.runtime.rpcEndpoints = async () => ['https://rpc.example.test'];
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
        result = '0xde0b6b3a7640000';
        break;
      case 'eth_getTransactionCount':
        result = '0x0';
        break;
      case 'eth_getTransactionReceipt':
        result = included
          ? {
              status: '0x1',
              blockNumber: '0x1',
              blockHash: '0x' + '34'.repeat(32),
            }
          : null;
        break;
      case 'eth_sendRawTransaction':
        broadcasts++;
        dispatched();
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
  const runtime = new SafeWalletRuntime(
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
    runtime,
    applicationId,
    stored,
    budget,
    didDispatch,
    get broadcasts() {
      return broadcasts;
    },
    include() {
      included = true;
    },
  };
}
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

it('waits through receipt-before-block visibility without rejecting or broadcasting a second setup transaction', async () => {
  const t = await bootstrap('10000000', 2);
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
  await vi.advanceTimersByTimeAsync(2000);
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
  const slow = { runOnce: vi.fn(() => gate), stop: async () => {} };
  const fast = { runOnce: vi.fn(async () => {}), stop: async () => {} };
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
