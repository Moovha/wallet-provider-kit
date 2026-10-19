import {
  ApplicationSafeService,
  applicationAccountNamespace,
} from '../src/provisioning/application.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
} from '../src/runtime-configuration/service.js';
import { ApplicationCredentialCipher } from '../src/runtime-configuration/credentials.js';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { Interface, recoverAddress } from 'ethers';
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
  const executionWire = executionFixture('application');
  const execution = executionWire.configuration;
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
    policy,
    request,
    driver,
    context,
    grant,
    accountId,
    owner,
    config,
    execution,
    executionWire,
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

it('provisions one provider-owned application Safe and preserves two users independent asset and consent authority', async () => {
  const f = await fixture();
  const onboarding = new OnboardingService(
    f.policy,
    f.db.onboardingStore,
    [],
    undefined,
    'actions-v1',
    true,
  );
  const principal = {
    ...f.context.principal,
    scopes: [
      ...f.context.principal.scopes,
      'wallet:configuration:read',
      'wallet:configuration:propose',
      'wallet:sign',
    ],
  };
  const operator = {
    issuer: principal.issuer,
    clientId: 'provider',
    subject: 'provider',
    scopes: ['wallet:configuration:write'],
  };
  const context = () => ({ principal, idempotencyKey: randomUUID() });
  const providerContext = () => ({
    principal: operator,
    idempotencyKey: randomUUID(),
  });
  const resources = new RuntimeConfigurationService(
    onboarding.policy,
    f.db.onboardingStore,
    {
      operators: [
        {
          issuer: operator.issuer,
          clientId: operator.clientId,
          subject: operator.subject,
        },
      ],
    },
    'revision-1',
    undefined,
    undefined,
    new ApplicationCredentialCipher(Buffer.alloc(32, 11).toString('base64')),
  );
  const applicationId = runtimeApplicationId(
    principal.issuer,
    principal.clientId,
  );
  for (const id of ['primary', 'secondary'])
    await resources.writeCredential(context(), id, {
      expected_revision: '0',
      endpoint: 'https://' + id + '.example.test',
    });
  await resources.submitObligation(context(), 'services', {
    expected_revision: '0',
    value: ['primary', 'secondary'].map((id) => ({
      id,
      vendor: id,
      kind: 'rpc-verification' as const,
      credential_reference: id,
      billing_owner: 'application' as const,
    })),
  });
  const sponsor = f.execution.sponsors[0];
  await resources.submitObligation(context(), 'sponsorship', {
    expected_revision: '0',
    value: {
      chain_id: 'eip155:84532',
      funding_agreement: sponsor.fundingAgreement,
      maximum_gas_budget_wei: sponsor.lifetimeBudgetWei,
      account_model: 'provider-controlled-application-safe',
      asset_model: 'individual-user-wallets',
    },
  });
  await resources.submitObligation(context(), 'actions', {
    expected_revision: '0',
    value: [{ name: 'work', description: 'User-bound operation', fields: [] }],
  });
  for (const kind of ['actions', 'services', 'sponsorship'] as const)
    await resources.decideObligation(providerContext(), applicationId, kind, {
      expected_revision: '1',
      expected_decision_revision: '0',
      decision: 'accepted',
    });
  const target = Wallet.createRandom().address,
    abi = new Interface(['function work(address)']);
  await resources.update(providerContext(), applicationId, {
    expected_revision: '0',
    policy: {
      version: '1',
      enabled: true,
      chain_id: 'eip155:84532',
      maximum_calls: 1,
      maximum_native_value_wei: '0',
      max_validity_seconds: 60,
      claim_requirements: [],
      contracts: [
        {
          address: target,
          code_hash: keccak256(offlineCode),
          methods: [
            {
              signature: 'work(address)',
              maximum_value_wei: '0',
              user_address_parameters: [0],
            },
          ],
        },
      ],
    },
  });
  let created = 0,
    service: ApplicationSafeService;
  const raw = {
    provider: 'offline',
    createAccount: async (accountId: string) => {
      created++;
      return { accountId, address: f.owner.address };
    },
    findAccount: async (accountId: string) => ({
      accountId,
      address: f.owner.address,
    }),
    signTypedData: async (
      _account: unknown,
      action: import('../src/domain/signing.js').TypedDataAction,
    ) =>
      f.owner.signTypedData(
        action.payload.domain,
        action.payload.types,
        action.payload.message,
      ),
  };
  const backend = createJournaledWalletProvider(raw, {
    namespace: applicationAccountNamespace,
    journal: f.db.journal,
    authorizeAttempt: (request) => service.authorizeProvision(request),
  });
  const create = () =>
    new ApplicationSafeService(
      resources,
      onboarding,
      f.db,
      backend,
      f.config,
      f.execution,
      f.driver,
      'revision-1',
      true,
      undefined,
      f.request,
    );
  service = create();
  expect((await service.read(principal)).funding_addresses).toEqual([
    sponsor.binding.address,
  ]);
  f.state.balance = '0x0';
  await expect(
    service.provision(providerContext(), applicationId),
  ).rejects.toThrow();
  expect(created).toBe(0);
  f.state.balance = '0xffffffffffffffffffff';
  await expect(service.provision(context(), applicationId)).rejects.toThrow();
  expect(
    (await service.provision(providerContext(), applicationId)).status,
  ).toBe('pending');
  f.state.finalized = true;
  service = create();
  const ready = await service.provision(providerContext(), applicationId);
  expect(ready.status).toBe('ready');
  expect(ready.chain_id).toBe('eip155:84532');
  expect(ready.funding_requirements).toEqual([
    {
      address: sponsor.binding.address,
      minimum_balance_wei: (
        BigInt(sponsor.gasLimit) * BigInt(sponsor.maxFeePerGas) +
        BigInt(sponsor.l1FeeReserveWei)
      ).toString(),
      maximum_gas_budget_wei: sponsor.lifetimeBudgetWei,
      gas_limits: {
        gas_limit: sponsor.gasLimit,
        max_fee_per_gas: sponsor.maxFeePerGas,
        max_priority_fee_per_gas: sponsor.maxPriorityFeePerGas,
        l1_fee_reserve_wei: sponsor.l1FeeReserveWei,
      },
    },
  ]);
  expect(created).toBe(1);
  expect(f.state.submissions).toBe(1);
  f.state.balance = '0x0';
  expect(await service.provision(providerContext(), applicationId)).toEqual(
    ready,
  );
  expect(created).toBe(1);
  expect(f.state.submissions).toBe(1);
  const signer = await f.db.onboardingStore.transaction(
    (s) =>
      s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .applicationSafes![applicationId].account!,
  );
  expect(
    await f.db.onboardingStore.transaction((s) => s.accounts[signer.accountId]),
  ).toBeUndefined();
  const actions = new SupportedActions(
    onboarding,
    f.db,
    undefined,
    'revision-1',
    {
      maxValiditySeconds: 60,
      policy: {
        mechanism: 'safe-1.4.1',
        accounts: [],
        multiSend: {
          address: Wallet.createRandom().address,
          codeHash: keccak256(offlineCode),
        },
        maximumNativeValueWei: '0',
        lifetimeOperations: '10',
        contracts: [],
      },
    },
    undefined,
    f.config,
    true,
  );
  const users = [];
  for (const id of ['alice', 'bob']) {
    const wallet = Wallet.createRandom(),
      terms = await onboarding.applicationAccessPolicy(principal);
    const grant = await onboarding.request(context(), {
      mode: 'create',
      user: {
        id,
        identity: {
          reference: id,
          level: 'verified',
          verified_at: new Date(Date.now() - 1000).toISOString(),
          fields: {},
        },
        consent: {
          reference: id,
          granted_at: new Date(Date.now() - 1000).toISOString(),
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          policy_revision: onboarding.policy.revision,
          action_policy_revision: terms.action_policy_revision!,
        },
      },
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: ['account:read', 'contracts:request'],
        },
      ],
    });
    await f.db.onboardingStore.transaction((s) => {
      s.accounts[grant.account_id!].address = wallet.address;
    });
    users.push({ wallet, grant });
  }
  const financial = f.db.financialAuthority({
    namespace: 'configured-transfers-v1',
    provider: 'offline',
    authorize: (context, approval) => actions.authorize(context, approval),
  });
  const signing = new EmbeddedWalletService(
    { provision: async () => null, sign: financial.authority.sign },
    createJournaledWalletProvider(raw, {
      namespace: 'configured-transfers-v1',
      journal: f.db.journal,
      authorizeAttempt: financial.authorizeAttempt,
    }),
  );
  for (const [index, user] of users.entries()) {
    const input = {
      account_id: user.grant.account_id!,
      kind: 'contract-call' as const,
      application_action: { name: 'work', payload: {} },
      calls: [
        {
          to: target,
          value: '0',
          data: abi.encodeFunctionData('work', [user.wallet.address]),
        },
      ],
    };
    await expect(
      actions.requestCalls(
        context(),
        {
          ...input,
          calls: [
            {
              ...input.calls[0],
              data: abi.encodeFunctionData('work', [f.owner.address]),
            },
          ],
        },
        async () => String(index),
      ),
    ).rejects.toThrow();
    const receipt = await actions.requestCalls(
      context(),
      input,
      async (binding, owner) => {
        expect(binding.address).toBe(ready.address);
        expect(owner).toBe(f.owner.address);
        return String(index);
      },
    );
    const record = await f.db.onboardingStore.transaction(
      (s) => s.supportedActions![receipt.action_id],
    );
    expect(record.approval.account).toEqual(signer);
    expect(record.approval.userAccount).toEqual({
      accountId: user.grant.account_id,
      address: user.wallet.address,
    });
    const signature = await signing.sign(context(), receipt.action_id);
    expect(recoverAddress(receipt.payload_hash, signature)).toBe(
      f.owner.address,
    );
    if (index === 0) {
      const { approvedCallsFixture } =
        await import('./helpers/approved-calls.js');
      const { ApprovedExecutionCoordinator } =
        await import('../src/execution/coordinator.js');
      const { createTransferExecutionProvider } =
        await import('../src/execution/relayer.js');
      const { ApplicationExecutionObserver } =
        await import('../src/runtime-configuration/observer.js');
      const original = f.executionWire;
      original.configuration.sponsors = f.execution.sponsors;
      original.configuration.profile = 'approved-evm-executor-v1';
      const wire = approvedCallsFixture(
        user.grant.account_id!,
        f.owner.address,
        original,
      );
      wire.policy.accounts = [record.intent!.account];
      wire.state.target = ready.address!;
      wire.state.intent = record.intent;
      wire.state.digest = receipt.payload_hash;
      const executionPrincipal = {
        ...principal,
        scopes: [...principal.scopes, 'wallet:execute', 'wallet:execute:read'],
      };
      const coordinator = new ApprovedExecutionCoordinator(
        actions,
        f.db,
        signing,
        original.configuration,
        createTransferExecutionProvider(
          original.configuration,
          'offline-private-relayer-key',
          wire.request,
        ),
        new ApplicationExecutionObserver(
          resources,
          f.db.onboardingStore,
          original.configuration,
          undefined,
          wire.request,
        ),
      );
      try {
        await coordinator.execute(
          { principal: executionPrincipal, idempotencyKey: randomUUID() },
          receipt.action_id,
        );
        expect(wire.state.posts).toBe(1);
        wire.state.included = true;
        await coordinator.read(executionPrincipal, receipt.action_id);
        await coordinator.execute(
          { principal: executionPrincipal, idempotencyKey: randomUUID() },
          receipt.action_id,
        );
        expect(wire.state.posts).toBe(1);
      } finally {
        await coordinator.close();
      }
    }
    await onboarding.revokeApplicationGrant(context(), user.grant.grant_id!);
    await expect(signing.sign(context(), receipt.action_id)).rejects.toThrow();
  }
  expect(created).toBe(1);
  expect(f.state.submissions).toBe(1);
});

it('reconciles an uncertain application sponsor creation and stops submission after credential revocation', async () => {
  const f = await fixture();
  const principal = {
    ...f.context.principal,
    scopes: ['wallet:configuration:read', 'wallet:configuration:propose'],
  };
  const operator = {
    issuer: principal.issuer,
    clientId: 'provider',
    subject: 'provider',
    scopes: ['wallet:configuration:write'],
  };
  const context = () => ({ principal, idempotencyKey: randomUUID() });
  const operatorContext = () => ({
    principal: operator,
    idempotencyKey: randomUUID(),
  });
  const cipher = new ApplicationCredentialCipher(
    Buffer.alloc(32, 13).toString('base64'),
  );
  const resources = new RuntimeConfigurationService(
    f.onboarding.policy,
    f.db.onboardingStore,
    {
      operators: [
        {
          issuer: operator.issuer,
          clientId: operator.clientId,
          subject: operator.subject,
        },
      ],
    },
    'revision-1',
    undefined,
    undefined,
    cipher,
  );
  const id = runtimeApplicationId(principal.issuer, principal.clientId);
  const endpoint = 'https://submission.example.test/private-application-path';
  await resources.writeCredential(context(), 'submission', {
    expected_revision: '0',
    endpoint,
  });
  await resources.submitObligation(context(), 'services', {
    expected_revision: '0',
    value: [
      {
        id: 'submission',
        vendor: 'offline',
        kind: 'rpc-submission',
        credential_reference: 'submission',
        billing_owner: 'application',
      },
    ],
  });
  await resources.submitObligation(context(), 'sponsorship', {
    expected_revision: '0',
    value: {
      chain_id: 'eip155:84532',
      funding_agreement: 'offline-funding',
      maximum_gas_budget_wei: '20000000000000',
      gas_limits: {
        gas_limit: '750000',
        max_fee_per_gas: '10000000',
        max_priority_fee_per_gas: '1000000',
        l1_fee_reserve_wei: '1000000000000',
      },
      account_model: 'provider-controlled-application-safe',
      asset_model: 'individual-user-wallets',
    },
  });
  for (const kind of ['services', 'sponsorship'] as const)
    await resources.decideObligation(operatorContext(), id, kind, {
      expected_revision: '1',
      expected_decision_revision: '0',
      decision: 'accepted',
    });
  let signer: Record<string, unknown> | undefined,
    relayer: Record<string, unknown> | undefined;
  let signerCreates = 0,
    relayerCreates = 0,
    dispatches = 0;
  const patches: unknown[] = [];
  const transport = (async (input, init) => {
    const path = new URL(String(input)).pathname;
    const data = init?.body ? JSON.parse(String(init.body)) : undefined;
    const ok = (value: unknown) =>
      Response.json({ success: true, data: value });
    if (init?.method === 'POST' && path.endsWith('/signers')) {
      signerCreates++;
      expect(data.config.key).toMatch(/^[0-9a-f]{64}$/);
      expect(data.type).toBe('plain');
      signer = {
        id: data.id,
        type: 'local',
        address: new Wallet('0x' + data.config.key).address,
      };
      throw new Error('Offline lost response after creation');
    }
    if (init?.method === 'POST' && path.endsWith('/relayers')) {
      relayerCreates++;
      expect(data.policies.gas_price_cap).toBe(10000000);
      expect(data.custom_rpc_urls).toEqual([{ url: endpoint, weight: 100 }]);
      relayer = { ...data, address: signer!.address };
      return ok(relayer);
    }
    if (init?.method === 'PATCH') {
      patches.push(data);
      return ok(relayer);
    }
    if (path.endsWith('/rpc')) {
      dispatches++;
      return ok({});
    }
    const value = path.includes('/signers/') ? signer : relayer;
    return value ? ok(value) : new Response(null, { status: 404 });
  }) as typeof fetch;
  const { ApplicationSponsorService } =
    await import('../src/provisioning/application-sponsor.js');
  const create = () =>
    new ApplicationSponsorService(
      resources,
      f.db,
      cipher,
      f.execution,
      'revision-1',
      'offline-private-relayer-key',
      transport,
    );
  await expect(create().provision(context(), id)).rejects.toThrow();
  expect(signerCreates).toBe(0);
  await expect(create().provision(operatorContext(), id)).rejects.toThrow();
  expect(signerCreates).toBe(1);
  const service = create();
  const ready = await service.provision(operatorContext(), id);
  expect(ready.status).toBe('ready');
  expect(await create().provision(operatorContext(), id)).toEqual(ready);
  expect(signerCreates).toBe(1);
  expect(relayerCreates).toBe(1);
  const execution = await service.configuration(id);
  expect(execution.sponsors[0].gasLimit).toBe('750000');
  expect(execution.sponsors[0].maxFeePerGas).toBe('10000000');
  const url =
    localExecutionOrigin +
    '/api/v1/relayers/' +
    execution.sponsors[0].binding.relayerId +
    '/rpc';
  await service.request()(url, { method: 'POST', body: '{}' });
  expect(patches).toEqual([
    { custom_rpc_urls: [{ url: endpoint, weight: 100 }] },
  ]);
  expect(dispatches).toBe(1);
  await resources.writeCredential(context(), 'submission', {
    expected_revision: '1',
    endpoint: null,
  });
  await expect(
    service.request()(url, { method: 'POST', body: '{}' }),
  ).rejects.toThrow();
  expect(dispatches).toBe(1);
  expect(patches).toHaveLength(1);
});
