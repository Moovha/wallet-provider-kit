import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transaction, Wallet, toQuantity } from 'ethers';
import {
  openProviderDatabase,
  type ProviderDatabase,
} from '../src/storage/index.js';
import { ApplicationFundingService } from '../src/provisioning/application-funding.js';
import { ApplicationCredentialCipher } from '../src/runtime-configuration/credentials.js';
import {
  runtimeApplicationId,
  type RuntimeConfigurationService,
} from '../src/runtime-configuration/service.js';
import { applicationGasBudgetId } from '../src/sponsorship/budget.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { randomUUID } from 'node:crypto';
import { fingerprint } from '../src/onboarding/policy.js';
import { RpcEndpointPool } from '../src/execution/rpc-pool.js';
const paths: string[] = [],
  databases: ProviderDatabase[] = [];
afterEach(async () => {
  databases.splice(0).forEach((d) => d.close());
  await Promise.all(
    paths.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture(singleRpc = false) {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-funding-'));
  paths.push(directory);
  const db = openProviderDatabase({ directory, initialize: true });
  databases.push(db);
  const id = runtimeApplicationId('https://issuer.example.test', 'app');
  const gas = {
    gasLimit: '100000',
    maxFeePerGas: '10000000',
    maxPriorityFeePerGas: '1000000',
    l1FeeReserveWei: '1000000000000',
  };
  const agreement = {
    chain_id: 'eip155:8453',
    funding_agreement: 'offline-funding',
    maximum_gas_budget_wei: '100000000000000',
    gas_limits: {
      gas_limit: gas.gasLimit,
      max_fee_per_gas: gas.maxFeePerGas,
      max_priority_fee_per_gas: gas.maxPriorityFeePerGas,
      l1_fee_reserve_wei: gas.l1FeeReserveWei,
    },
  };
  let accepted = true,
    disagreement = false,
    revert = false,
    included = false,
    lostResponse = false;
  const sponsors = Array.from({ length: 5 }, (_, i) => ({
    applicationId: id,
    poolIndex: i,
    status: 'ready',
    sponsor: {
      ...gas,
      accountId: Wallet.createRandom().address,
      clientId: 'app',
      binding: { address: Wallet.createRandom().address },
      fundingAgreement: agreement.funding_agreement,
    },
  }));
  await db.onboardingStore.transaction((s) => {
    s.deploymentBindings = {
      'service-v1': {
        activeRevision: 'offline',
        origin: 'https://wallet.example.test',
        provider: 'offline',
        binding: 'offline',
        runtimeConfiguration: {
          heads: {},
          proposals: {},
          revisions: {},
          idempotency: {},
          applicationSponsors: Object.fromEntries(
            sponsors.map((s, i) => [String(i), s]),
          ),
        },
      },
    } as never;
  });
  const resources = {
    rpcVerification: singleRpc ? 'single' : 'quorum',
    withSubmissionRpc: async (
      _id: string,
      work: (endpoint: string) => Promise<unknown>,
    ) =>
      singleRpc
        ? submissionPool.run(work)
        : work('https://submit.example.test'),
    withRpc: async (
      _id: string,
      work: (endpoints: string[]) => Promise<unknown>,
    ) =>
      work(
        singleRpc
          ? ['https://first.example.test']
          : ['https://first.example.test', 'https://second.example.test'],
      ),
    onboardingPolicy: {
      provider: { origin: 'https://wallet.example.test' },
      applications: [
        { issuer: 'https://issuer.example.test', clientId: 'app' },
      ],
    },
    acceptedSponsorship: async () => {
      if (!accepted) throw Error('revoked');
      return { decision: 'accepted', value: agreement };
    },
    poolConfiguration: async () => ({ safeCount: 5, sponsorCount: 5 }),
    rpcEndpoints: async (_: string, kind: string) =>
      kind === 'rpc-submission'
        ? ['https://submit.example.test']
        : ['https://first.example.test', 'https://second.example.test'],
    readObligations: async () => ({ application_id: id }),
  } as unknown as RuntimeConfigurationService;
  const raw: string[] = [];
  let funding = '',
    nonce = 0;
  const genesis = '0x' + '1'.repeat(64);
  let blockHash = '0x' + '2'.repeat(64);
  let receiptNumber = '0x10';
  const transport = (async (url, init) => {
    const call = JSON.parse(String(init?.body));
    let result: unknown;
    switch (call.method) {
      case 'eth_feeHistory':
        result = {
          baseFeePerGas: Array(6).fill('0xf4240'),
          reward: Array.from({ length: 5 }, () => ['0xf4240']),
        };
        break;
      case 'eth_maxPriorityFeePerGas':
        result = '0xf4240';
        break;
      case 'eth_chainId':
        result = '0x2105';
        break;
      case 'eth_getCode':
        result = '0x';
        break;
      case 'eth_getBlockByNumber':
        result = {
          number: /^0x/.test(call.params[0]) ? call.params[0] : '0x10',
          hash: call.params[0] === '0x0' ? genesis : blockHash,
        };
        break;
      case 'eth_getBalance':
        result =
          call.params[0].toLowerCase() === funding.toLowerCase()
            ? '0x100000000000000'
            : disagreement && String(url).includes('second')
              ? '0x1'
              : '0x0';
        break;
      case 'eth_getTransactionCount':
        result = toQuantity(nonce);
        break;
      case 'eth_getTransactionReceipt':
        result = included
          ? {
              transactionHash: call.params[0],
              blockHash,
              blockNumber: receiptNumber,
              status: revert ? '0x0' : '0x1',
            }
          : null;
        break;
      case 'eth_sendRawTransaction':
        raw.push(call.params[0]);
        if (singleRpc && String(url) === 'https://submit-primary.example.test')
          return new Response('', { status: 503 });
        if (lostResponse) throw Error('lost response');
        result = Transaction.from(call.params[0]).hash;
        break;
      default:
        throw Error('unexpected RPC');
    }
    return Response.json({ jsonrpc: '2.0', id: 1, result });
  }) as typeof fetch;
  const submissionPool = new RpcEndpointPool(
    [
      'https://submit-primary.example.test',
      'https://submit-secondary.example.test',
    ],
    transport,
  );
  const cipher = new ApplicationCredentialCipher(
    Buffer.alloc(32, 1).toString('base64'),
  );
  const create = () =>
    new ApplicationFundingService(
      resources,
      db,
      cipher,
      'offline',
      genesis,
      transport,
      'base',
    );
  funding = await create().ensure(id);
  return {
    db,
    id,
    create,
    raw,
    sponsors,
    funding,
    setGasLimits: (limits: typeof agreement.gas_limits) =>
      (agreement.gas_limits = limits),
    setAccepted: (v: boolean) => (accepted = v),
    setDisagreement: (v: boolean) => (disagreement = v),
    setLost: (v: boolean) => (lostResponse = v),
    setIncluded: (v: boolean) => {
      included = v;
      nonce = v ? 1 : 0;
    },
    setReceiptNumber: (v: string) => {
      receiptNumber = v;
    },
    setRevert: (v: boolean) => (revert = v),
    setCheckpointReorg: () => {
      blockHash = '0x' + '3'.repeat(64);
    },
  };
}
it('applies accepted fee-policy updates while retaining the funding address and original sponsor bindings', async () => {
  const f = await fixture();
  f.setGasLimits({
    gas_limit: '50000',
    max_fee_per_gas: '20000000',
    max_priority_fee_per_gas: '5000000',
    l1_fee_reserve_wei: '1000000000000',
  });
  expect(await f.create().ensure(f.id)).toBe(f.funding);
  await f.create().distribute(f.id);
  const tx = Transaction.from(f.raw[0]);
  expect(tx.to).toBe(f.sponsors[0].sponsor.binding.address);
  expect(tx.maxFeePerGas).toBe(3000000n);
  expect(tx.value).toBe(2200000000000n);
});
it('fails over funding submission with identical bytes and one gas admission under single-source verification', async () => {
  const f = await fixture(true);
  await f.create().distribute(f.id);
  expect(f.raw).toHaveLength(2);
  expect(f.raw[1]).toBe(f.raw[0]);
  expect(
    await f.db.budget(
      applicationGasBudgetId(
        'https://wallet.example.test',
        'https://issuer.example.test',
        'app',
      ),
    ),
  ).toMatchObject({ reserved: '1210000000000' });
});
it('retains one funding address across five sponsors and only signs a bounded sponsor top-up', async () => {
  const f = await fixture();
  expect(await f.create().ensure(f.id)).toBe(f.funding);
  expect(f.sponsors.some((s) => s.sponsor.binding.address === f.funding)).toBe(
    false,
  );
  await f.create().distribute(f.id);
  expect(f.raw).toHaveLength(1);
  const tx = Transaction.from(f.raw[0]);
  expect(tx.from).toBe(f.funding);
  expect(tx.to).toBe(f.sponsors[0].sponsor.binding.address);
  expect(tx.data).toBe('0x');
  expect(tx.value).toBe(2200000000000n);
  expect(tx.nonce).toBe(0);
  expect(tx.gasLimit).toBe(21000n);
});
it('retries exactly the retained signed bytes after an uncertain send, including after restart', async () => {
  const f = await fixture();
  f.setLost(true);
  await expect(f.create().distribute(f.id)).rejects.toThrow();
  f.setLost(false);
  await f.create().distribute(f.id);
  expect(f.raw).toHaveLength(2);
  expect(f.raw[1]).toBe(f.raw[0]);
  expect(
    await f.db.budget(
      applicationGasBudgetId(
        'https://wallet.example.test',
        'https://issuer.example.test',
        'app',
      ),
    ),
  ).toMatchObject({ reserved: '1210000000000' });
  const count = await f.db.onboardingStore.transaction(
    (s) =>
      s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .applicationFunding![f.id].transfers.length,
  );
  expect(count).toBe(1);
});
it('blocks sends on revoked sponsorship or inconsistent balances', async () => {
  const f = await fixture();
  f.setAccepted(false);
  await expect(f.create().distribute(f.id)).rejects.toThrow();
  f.setAccepted(true);
  f.setDisagreement(true);
  await expect(f.create().distribute(f.id)).rejects.toThrow();
  expect(f.raw).toHaveLength(0);
});
it('does not advance the funding nonce through a failed transfer', async () => {
  const f = await fixture();
  await f.create().distribute(f.id);
  f.setIncluded(true);
  f.setRevert(true);
  await expect(f.create().distribute(f.id)).rejects.toThrow();
  expect(f.raw).toHaveLength(1);
});
it('coalesces concurrent funding writers into one retained transaction and one fee reservation', async () => {
  const f = await fixture();
  await Promise.allSettled([
    f.create().distribute(f.id),
    f.create().distribute(f.id),
  ]);
  expect(new Set(f.raw).size).toBe(1);
  const saved = await f.db.onboardingStore.transaction(
    (s) =>
      s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .applicationFunding![f.id],
  );
  expect(saved.transfers).toHaveLength(1);
  expect(fingerprint(saved.transfers[0].raw)).not.toContain(f.raw[0]);
});

it('compacts finalized routing history without resetting the EOA nonce, routed value or shared fee allowance', async () => {
  const f = await fixture();
  await f.create().distribute(f.id);
  f.setIncluded(true);
  await f.create().distribute(f.id);
  const saved = await f.db.onboardingStore.transaction(
    (s) =>
      s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .applicationFunding![f.id],
  );
  expect(saved.transfers).toHaveLength(1);
  expect(saved.transfers[0].nonce).toBe(1);
  expect(saved.nextNonce).toBe(2);
  expect(saved.totalDistributedWei).toBe('4400000000000');
  expect(saved.finalizedCheckpoint?.blockNumber).toBe('0x10');
  expect(Transaction.from(f.raw[1]).nonce).toBe(1);
  expect(
    await f.db.budget(
      applicationGasBudgetId(
        'https://wallet.example.test',
        'https://issuer.example.test',
        'app',
      ),
    ),
  ).toMatchObject({ reserved: '2420000000000' });
});
it('pauses when a retained finalized checkpoint changes canonical block hash', async () => {
  const f = await fixture();
  await f.create().distribute(f.id);
  f.setIncluded(true);
  await f.create().distribute(f.id);
  const count = f.raw.length;
  f.setCheckpointReorg();
  await expect(f.create().distribute(f.id)).rejects.toThrow();
  expect(f.raw).toHaveLength(count);
});

it('retains the same routing nonce and stops before broadcast when the shared allowance is exhausted', async () => {
  const f = await fixture();
  const budgetId = applicationGasBudgetId(
    'https://wallet.example.test',
    'https://issuer.example.test',
    'app',
  );
  await f.db.setBudget(budgetId, '100000000000000', 'offline');
  const request = createWalletAttemptRequest(
    'offline-exhaustion',
    'offline-exhaustion',
    'relay_transaction',
    randomUUID(),
    randomUUID(),
    'offline-capacity',
    { offline: true },
  );
  await f.db.admitAttempt({ request, budgetId, units: '100000000000000' });
  await f.db.journal.claim(request);
  await expect(f.create().distribute(f.id)).rejects.toThrow();
  await expect(f.create().distribute(f.id)).rejects.toThrow();
  expect(f.raw).toHaveLength(0);
  const saved = await f.db.onboardingStore.transaction(
    (s) =>
      s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .applicationFunding![f.id],
  );
  expect(saved.transfers).toHaveLength(1);
  expect(saved.nextNonce).toBe(1);
  expect(await f.db.budget(budgetId)).toMatchObject({
    reserved: '100000000000000',
  });
});
it('exposes paused funding health without retaining upstream errors or credentials', async () => {
  const f = await fixture();
  f.setAccepted(false);
  const service = f.create();
  service.start();
  try {
    await service.tick();
  } finally {
    await service.close();
  }
  const saved = await f.db.onboardingStore.transaction(
    (s) =>
      s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .applicationFunding![f.id],
  );
  expect(saved.health).toEqual({
    state: 'paused',
    checked_at: expect.any(String),
  });
  expect(f.raw).toHaveLength(0);
});

it('does not duplicate a sponsor top-up when its receipt is newer than the captured balance snapshot', async () => {
  const f = await fixture();
  await f.create().distribute(f.id);
  f.setIncluded(true);
  f.setReceiptNumber('0x11');
  expect(await f.create().distribute(f.id)).toBe('routing');
  expect(f.raw).toHaveLength(1);
  const saved = await f.db.onboardingStore.transaction(
    (state) =>
      state.deploymentBindings!['service-v1'].runtimeConfiguration!
        .applicationFunding![f.id],
  );
  expect(saved.nextNonce).toBe(1);
  expect(saved.transfers).toHaveLength(1);
});
