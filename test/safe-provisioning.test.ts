import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Wallet,
  keccak256,
  getCreate2Address,
  solidityPacked,
  concat,
  toBeHex,
  ZeroAddress,
} from 'ethers';
import { afterEach, expect, it } from 'vitest';
import { openProviderDatabase } from '../src/storage/index.js';
import { OnboardingService } from '../src/onboarding/service.js';
import type { OnboardingPolicy } from '../src/onboarding/types.js';
import {
  SafeProvisioningService,
  safeFactoryInterface,
  safeSetupInterface,
  type SafeProvisioningConfiguration,
  type SafeDeploymentPlan,
  type SafeDeploymentDriver,
} from '../src/provisioning/safe.js';
import { executionFixture, offlineCode } from './helpers/execution.js';
import {
  safeInterface,
  type ApprovedCallPolicy,
} from '../src/execution/approved-calls.js';
import { WalletProviderError } from '../src/domain/signing.js';
import { SupportedActions } from '../src/deployment/actions.js';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import {
  defaultLocalExecution,
  localExecutionOrigin,
  localSponsorIds,
} from '../src/deployment/local-execution-contract.js';

const folders: string[] = [],
  dbs: ReturnType<typeof openProviderDatabase>[] = [];
afterEach(async () => {
  for (const d of dbs.splice(0)) d.close();
  await Promise.all(
    folders.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-safe-provision-'));
  folders.push(directory);
  const db = openProviderDatabase({ directory, initialize: true });
  dbs.push(db);
  const context = {
    principal: {
      issuer: 'https://app.example.test',
      subject: 'application',
      clientId: 'application',
      scopes: [
        'wallet:access',
        'wallet:provision',
        'wallet:account:read',
        'wallet:actions',
      ],
    },
    idempotencyKey: randomUUID(),
  };
  const policy: OnboardingPolicy = {
    version: '1',
    provider: {
      name: 'Offline provider',
      origin: 'https://wallet.example.test',
      privacyUrl: 'https://wallet.example.test/privacy',
    },
    access: { mode: 'application' },
    identity: {
      application: { verificationLevel: 'verified', requiredFields: [] },
    },
    applications: [
      {
        issuer: context.principal.issuer,
        clientId: 'application',
        name: 'Offline application',
        assertionTrust: { agreement: 'offline-test' },
        permissions: [
          'account:read',
          'operations:request',
          'contracts:request',
        ],
      },
    ],
  };
  const onboarding = new OnboardingService(
    policy,
    db.onboardingStore,
    [],
    undefined,
    'actions-v1',
  );
  const grant = await onboarding.request(context, {
    mode: 'create',
    user: {
      id: 'test-owner',
      identity: {
        reference: 'test-evidence',
        level: 'verified',
        verified_at: new Date(Date.now() - 1000).toISOString(),
        fields: {},
      },
      consent: {
        reference: 'test-consent',
        granted_at: new Date(Date.now() - 1000).toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        policy_revision: onboarding.policy.revision,
        action_policy_revision: 'actions-v1',
      },
    },
    authorization_details: [
      {
        type: 'https://moovha.com/wallet/account-access',
        actions: ['account:read', 'operations:request', 'contracts:request'],
      },
    ],
  });
  const accountId = grant.account_id!,
    owner = Wallet.createRandom();
  await db.onboardingStore.transaction((s) => {
    s.accounts[accountId].address = owner.address;
    s.deploymentBindings = {
      'service-v1': {
        origin: policy.provider.origin,
        provider: 'offline',
        binding: 'offline',
        activeRevision: 'revision-1',
      },
    };
  });
  const config: SafeProvisioningConfiguration = {
    profile: 'safe-1.4.1',
    factory: {
      address: Wallet.createRandom().address,
      codeHash: keccak256(offlineCode),
    },
    singleton: {
      address: Wallet.createRandom().address,
      codeHash: keccak256(offlineCode),
    },
    proxyCodeHash: keccak256(offlineCode),
    maxValiditySeconds: 300,
  };
  const execution = executionFixture('application').configuration;
  const state = {
    submissions: 0,
    deployed: false,
    finalized: false,
    lost: false,
    badFactory: false,
    badOwner: false,
    badGuard: false,
    disagreement: false,
    balance: '0xffffffffffffffffffff',
    beforeEffect: undefined as undefined | (() => Promise<void>),
    plan: undefined as SafeDeploymentPlan | undefined,
  };
  const creation = '0x6002600055';
  const request = (async (
    input: string | URL | Request,
    options?: RequestInit,
  ) => {
    const body = JSON.parse(String(options?.body)),
      method = body.method,
      params = body.params;
    let result: unknown;
    if (method === 'eth_chainId') result = '0x14a34';
    else if (method === 'eth_getBlockByNumber')
      result = {
        number: params[0] === '0x0' ? '0x0' : '0x64',
        hash:
          params[0] === '0x0'
            ? execution.rpc.genesisHash
            : '0x' + '2'.repeat(64),
      };
    else if (method === 'eth_getBalance') result = state.balance;
    else if (method === 'eth_getStorageAt')
      result = '0x' + '0'.repeat(63) + (state.badGuard ? '1' : '0');
    else if (method === 'eth_getCode') {
      if (params[0].toLowerCase() === config.factory.address.toLowerCase())
        result = state.badFactory ? '0x6002' : offlineCode;
      else if (
        params[0].toLowerCase() === config.singleton.address.toLowerCase()
      )
        result = offlineCode;
      else
        result =
          state.deployed && (params[1] === 'latest' || state.finalized)
            ? offlineCode
            : '0x';
      if (state.disagreement && String(input).includes('secondary'))
        result = '0x6003';
    } else if (method === 'eth_call') {
      const data = params[0].data;
      if (params[0].to.toLowerCase() === config.factory.address.toLowerCase()) {
        if (
          data === safeFactoryInterface.encodeFunctionData('proxyCreationCode')
        )
          result = safeFactoryInterface.encodeFunctionResult(
            'proxyCreationCode',
            [creation],
          );
        else {
          const decoded = safeFactoryInterface.decodeFunctionData(
            'createProxyWithNonce',
            data,
          );
          const address = getCreate2Address(
            config.factory.address,
            keccak256(
              solidityPacked(
                ['bytes32', 'uint256'],
                [keccak256(decoded[1]), decoded[2]],
              ),
            ),
            keccak256(concat([creation, toBeHex(decoded[0], 32)])),
          );
          result = safeFactoryInterface.encodeFunctionResult(
            'createProxyWithNonce',
            [address],
          );
        }
      } else {
        const parsed = safeInterface.parseTransaction({ data })!;
        const value: Record<string, unknown[]> = {
          masterCopy: [config.singleton.address],
          getOwners: [
            [state.badOwner ? Wallet.createRandom().address : owner.address],
          ],
          getThreshold: [1],
          VERSION: ['1.4.1'],
          nonce: [0],
          getModulesPaginated: [
            [],
            '0x0000000000000000000000000000000000000001',
          ],
        };
        result = safeInterface.encodeFunctionResult(
          parsed.name,
          value[parsed.name],
        );
      }
    } else throw new Error('Unexpected offline RPC method');
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
      { headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const driver: SafeDeploymentDriver = {
    prepare: async () => {},
    submit: async (plan, authorize) => {
      await state.beforeEffect?.();
      await authorize();
      state.submissions++;
      state.plan = structuredClone(plan);
      state.deployed = true;
      if (state.lost)
        throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
      return randomUUID();
    },
  };
  const create = () =>
    new SafeProvisioningService(
      onboarding,
      db,
      config,
      execution,
      'revision-1',
      driver,
      ['https://primary.example.test', 'https://secondary.example.test'],
      undefined,
      request,
    );
  return {
    db,
    onboarding,
    context,
    grant,
    accountId,
    owner,
    config,
    execution,
    state,
    create,
  };
}
it('automatically prepares one exact owner-only Safe, shares the gas ledger, finalizes and replays across service restarts', async () => {
  const f = await fixture(),
    s = f.create();
  expect((await s.provision(f.context, f.accountId)).status).toBe('pending');
  const plan = f.state.plan!,
    args = safeFactoryInterface.decodeFunctionData(
      'createProxyWithNonce',
      plan.data,
    ),
    setup = safeSetupInterface.decodeFunctionData('setup', args[1]);
  expect([...setup[0]]).toEqual([f.owner.address]);
  expect(setup[1]).toBe(1n);
  expect([...setup].slice(2)).toEqual([
    ZeroAddress,
    '0x',
    ZeroAddress,
    ZeroAddress,
    0n,
    ZeroAddress,
  ]);
  expect(
    (
      await f
        .create()
        .provision({ ...f.context, idempotencyKey: randomUUID() }, f.accountId)
    ).address,
  ).toBe(plan.address);
  expect(f.state.submissions).toBe(1);
  f.state.finalized = true;
  const ready = await f.create().provision(f.context, f.accountId);
  expect(ready.status).toBe('ready');
  expect(await f.create().read(f.context, f.accountId)).toEqual(ready);
  const budgetId = (
    await import('../src/sponsorship/budget.js')
  ).applicationGasBudgetId(
    f.onboarding.policy.provider.origin,
    f.context.principal.issuer,
    'application',
  );
  expect((await f.db.budget(budgetId))!.reserved).toBe(
    (
      BigInt(plan.sponsor.gasLimit) * BigInt(plan.sponsor.maxFeePerGas) +
      BigInt(plan.sponsor.l1FeeReserveWei)
    ).toString(),
  );
  const policy: ApprovedCallPolicy = {
    mechanism: 'safe-1.4.1',
    accounts: [],
    multiSend: {
      address: Wallet.createRandom().address,
      codeHash: keccak256(offlineCode),
    },
    maximumNativeValueWei: '0',
    lifetimeOperations: '5',
    contracts: [
      {
        address: Wallet.createRandom().address,
        codeHash: keccak256(offlineCode),
        selectors: ['0x12345678'],
        maximumValueWei: '0',
      },
    ],
  };
  const actions = new SupportedActions(
    f.onboarding,
    f.db,
    undefined,
    'revision-1',
    { policy, maxValiditySeconds: 60 },
    undefined,
    f.config,
  );
  await actions.requestCalls(
    { ...f.context, idempotencyKey: randomUUID() },
    {
      account_id: f.accountId,
      kind: 'contract-call',
      calls: [
        { to: policy.contracts[0].address, value: '0', data: '0x12345678' },
      ],
    },
    async (binding, owner) => {
      expect(binding.address).toBe(plan.address);
      expect(owner).toBe(f.owner.address);
      return '0';
    },
  );
  await f.onboarding.revokeApplicationGrant(
    { ...f.context, idempotencyKey: randomUUID() },
    f.grant.grant_id!,
  );
  await expect(s.provision(f.context, f.accountId)).rejects.toMatchObject({
    code: 'wallet_authorization_denied',
  });
  expect(f.state.submissions).toBe(1);
});
it('never repeats an uncertain mutation and recovers only from finalized matching state', async () => {
  const f = await fixture();
  f.state.lost = true;
  expect((await f.create().provision(f.context, f.accountId)).status).toBe(
    'unknown',
  );
  expect((await f.create().provision(f.context, f.accountId)).status).toBe(
    'unknown',
  );
  expect((await f.create().read(f.context, f.accountId)).status).toBe(
    'unknown',
  );
  f.state.finalized = true;
  expect((await f.create().provision(f.context, f.accountId)).status).toBe(
    'ready',
  );
  expect(f.state.submissions).toBe(1);
});
it('serializes concurrent provisioning even when callers change their idempotency keys', async () => {
  const f = await fixture();
  await Promise.all([
    f.create().provision(f.context, f.accountId),
    f
      .create()
      .provision({ ...f.context, idempotencyKey: randomUUID() }, f.accountId),
  ]);
  expect(f.state.submissions).toBe(1);
});
it.each(['factory', 'balance', 'disagreement', 'revoked'] as const)(
  'denies %s before provider effects',
  async (condition) => {
    const f = await fixture();
    if (condition === 'factory') f.state.badFactory = true;
    if (condition === 'balance') f.state.balance = '0x0';
    if (condition === 'disagreement') f.state.disagreement = true;
    if (condition === 'revoked')
      f.state.beforeEffect = async () => {
        await f.onboarding.revokeApplicationGrant(
          { ...f.context, idempotencyKey: randomUUID() },
          f.grant.grant_id!,
        );
      };
    await expect(
      f.create().provision(f.context, f.accountId),
    ).rejects.toThrow();
    expect(f.state.submissions).toBe(0);
  },
);
it.each(['owner', 'guard'] as const)(
  'rejects matching proxy code with an unexpected %s',
  async (condition) => {
    const f = await fixture();
    await f.create().provision(f.context, f.accountId);
    f.state.finalized = true;
    if (condition === 'owner') f.state.badOwner = true;
    else f.state.badGuard = true;
    await expect(
      f.create().provision(f.context, f.accountId),
    ).rejects.toThrow();
  },
);
it('requires configured local execution and explicit activation acceptance while retaining empty binding templates', async () => {
  const c = JSON.parse(
    await readFile('docs/provider.config.contracts.example.json', 'utf8'),
  );
  c.localExecution = defaultLocalExecution();
  delete c.execution.service;
  c.execution.local = true;
  c.execution.relayer = {
    url: localExecutionOrigin,
    apiKey: c.localExecution.apiKey,
  };
  for (const sponsor of c.execution.sponsors)
    sponsor.binding = {
      ...localSponsorIds(sponsor.accountId),
      address: 'managed',
      bindingRevision: '1',
    };
  const f = await fixture();
  c.safeProvisioning = f.config;
  c.approvedCalls.policy.accounts = [];
  c.activation.enabled = false;
  expect(validateProviderConfiguration(c).safeProvisioning).toEqual(f.config);
  const missing = structuredClone(c);
  delete missing.safeProvisioning;
  expect(() => validateProviderConfiguration(missing)).toThrow();
});
