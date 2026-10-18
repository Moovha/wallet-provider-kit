import { hashRelayerTransaction } from '../src/domain/relayer-execution.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Wallet,
  Interface,
  keccak256,
  zeroPadValue,
  TypedDataEncoder,
  recoverAddress,
} from 'ethers';
import { afterEach, describe, it, expect } from 'vitest';
import {
  openProviderDatabase,
  type ProviderDatabase,
} from '../src/storage/index.js';
import { OnboardingService } from '../src/onboarding/service.js';
import { SupportedActions } from '../src/deployment/actions.js';
import { RuntimeConfigurationService } from '../src/runtime-configuration/service.js';
import { fingerprint } from '../src/onboarding/policy.js';
import {
  safeInterface,
  buildApprovedCallIntent,
  type ApprovedCallPolicy,
} from '../src/execution/approved-calls.js';
import {
  Safe4337SigningService,
  safeUserOperationCallData,
  safeOpPayloadV07,
  safeOpActionV07,
  safeOpSignatureV07,
  type Safe4337SigningConfiguration,
} from '../src/sponsorship/index.js';
import type { AuthorityContext } from '../src/domain/principal.js';
import type { WalletSigningProvider } from '../src/domain/signing.js';

const dirs: string[] = [],
  dbs: ProviderDatabase[] = [];
afterEach(async () => {
  for (const db of dbs.splice(0)) db.close();
  for (const directory of dirs.splice(0))
    await rm(directory, { recursive: true, force: true });
});
const denied = { code: 'wallet_authorization_denied' },
  conflict = { code: 'wallet_attempt_conflict' };
const code = '0x6001600055',
  codeHash = keccak256(code);
const iface = new Interface(['function work(uint256)']);
const moduleInterface = new Interface([
  'function SUPPORTED_ENTRYPOINT() view returns(address)',
]);
const entryInterface = new Interface([
  'function getNonce(address,uint192) view returns(uint256)',
]);
const pin = () => ({ address: Wallet.createRandom().address, codeHash });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-as2-'));
  dirs.push(directory);
  let db = openProviderDatabase({ directory, initialize: true });
  dbs.push(db);
  const wallet = Wallet.createRandom();
  const principal = {
    issuer: 'https://issuer.example.test',
    subject: 'service',
    clientId: 'application',
    scopes: [
      'wallet:access',
      'wallet:actions',
      'wallet:sign',
      'wallet:configuration:read',
      'wallet:configuration:propose',
      'wallet:configuration:write',
    ],
  };
  const operator = {
    issuer: principal.issuer,
    subject: 'provider',
    clientId: 'operator',
  };
  const operatorContext = {
    principal: { ...operator, scopes: ['wallet:configuration:write'] },
    idempotencyKey: randomUUID(),
  };
  const context: AuthorityContext = { principal, idempotencyKey: randomUUID() };
  const state = {
    posts: 0,
    signs: 0,
    consent: true,
    consentHook: undefined as undefined | (() => Promise<void>),
    lostPaymaster: false,
    lostSign: false,
    finalStub: false,
    wrongSignature: false,
    hook: undefined as undefined | (() => Promise<void>),
    mutate: undefined as
      | undefined
      | ((
          method: string,
          result: unknown,
          params: unknown[],
          origin: string,
        ) => unknown),
  };
  const backend: WalletSigningProvider = {
    provider: 'offline',
    createAccount: async () => {
      throw new Error('Not used');
    },
    findAccount: async (accountId) => ({ accountId, address: wallet.address }),
    signTypedData: async (_account, action) => {
      state.signs++;
      if (state.lostSign) throw new Error('Offline response loss');
      return (
        state.wrongSignature ? Wallet.createRandom() : wallet
      ).signTypedData(
        action.payload.domain,
        action.payload.types,
        action.payload.message,
      );
    },
  };
  const policy = {
    version: '1',
    provider: {
      name: 'Offline',
      origin: 'https://wallet.example.test',
      privacyUrl: 'https://wallet.example.test/privacy',
    },
    access: { mode: 'application' as const },
    identity: {
      application: {
        verificationLevel: 'verified',
        requiredFields: ['country'],
      },
    },
    applications: [
      {
        issuer: principal.issuer,
        clientId: principal.clientId,
        name: 'Offline application',
        assertionTrust: { agreement: 'offline' },
        permissions: ['account:read', 'contracts:request'] as (
          'account:read' | 'contracts:request'
        )[],
      },
    ],
  };
  let onboarding = new OnboardingService(
    policy,
    db.onboardingStore,
    [],
    backend,
    'financial-terms',
    true,
  );
  await db.onboardingStore.transaction((s) => {
    s.deploymentBindings = {
      'service-v1': {
        origin: policy.provider.origin,
        provider: 'offline',
        binding: 'offline',
        activeRevision: 'active-1',
      },
    };
  });
  let runtime = new RuntimeConfigurationService(
    onboarding.policy,
    db.onboardingStore,
    { operators: [operator] },
    'active-1',
  );
  const target = pin();
  const proposal = await runtime.propose(context, {
    expected_revision: '0',
    policy: {
      version: '1',
      enabled: true,
      chain_id: 'eip155:84532',
      maximum_calls: 2,
      maximum_native_value_wei: '10',
      max_validity_seconds: 120,
      contracts: [
        {
          address: target.address,
          code_hash: codeHash,
          methods: [{ signature: 'work(uint256)', maximum_value_wei: '10' }],
        },
      ],
      claim_requirements: [
        { name: 'country', allowed_values: ['ZA'], max_age_seconds: 300 },
      ],
    },
  });
  await runtime.publish(operatorContext, proposal.proposal_id, '0');
  const access = await onboarding.applicationAccessPolicy(principal);
  const grant = await onboarding.request(
    { ...context, idempotencyKey: randomUUID() },
    {
      mode: 'create',
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: ['account:read', 'contracts:request'],
        },
      ],
      user: {
        id: 'owner',
        identity: {
          reference: 'offline',
          level: 'verified',
          verified_at: new Date(Date.now() - 1000).toISOString(),
          fields: { country: 'ZA' },
        },
        consent: {
          reference: 'contract-consent',
          granted_at: new Date(Date.now() - 1000).toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          policy_revision: access.policy_revision,
          action_policy_revision: access.action_policy_revision,
        },
      },
    },
  );
  const accountId = grant.account_id!;
  await db.onboardingStore.transaction((s) => {
    s.accounts[accountId].address = wallet.address;
  });
  const basePolicy: ApprovedCallPolicy = {
    mechanism: 'safe-1.4.1',
    accounts: [{ ...pin(), accountId, singleton: pin() }],
    multiSend: pin(),
    contracts: [
      {
        ...target,
        selectors: [iface.getFunction('work')!.selector],
        maximumValueWei: '10',
      },
    ],
    maximumNativeValueWei: '10',
    lifetimeOperations: '3',
    swaps: [],
    vaults: [],
  };
  const config: Safe4337SigningConfiguration = {
    acceptance: {
      profile: 'safe-4337-module-0.3.0-v07',
      domain: {
        chainId: '0x14a34',
        entryPointVersion: '0.7',
        entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      },
      entryPoint: {
        address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
        codeHash,
      },
      module: pin(),
      paymaster: pin(),
      rpcUrls: [
        'https://primary.example.test',
        'https://secondary.example.test',
      ],
      genesisHash: '0x' + 'a'.repeat(64),
    },
    basePolicy,
    sponsors: [{ clientId: principal.clientId, lifetimeBudgetWei: '10000000' }],
    maxValiditySeconds: 120,
    paymaster: {
      url: 'https://paymaster.example.test/rpc',
      maximumVerificationGas: '0x9c40',
      maximumPostOpGas: '0x7530',
      l1FeeReserveWei: '10',
    },
  };
  const input = {
    account_id: accountId,
    kind: 'contract-call' as const,
    calls: [
      {
        to: target.address,
        value: '2',
        data: iface.encodeFunctionData('work', [42]),
      },
    ],
  };
  const operation = {
    sender: basePolicy.accounts[0].address,
    nonce: '0x0',
    callData: safeUserOperationCallData(
      buildApprovedCallIntent(
        basePolicy,
        input,
        '0',
        new Date(Date.now() + 60000).toISOString(),
      ),
    ),
    callGasLimit: '0x186a0',
    verificationGasLimit: '0xc350',
    preVerificationGas: '0x5208',
    maxFeePerGas: '0x14',
    maxPriorityFeePerGas: '0x2',
  };
  const request = (async (url, options) => {
    const body = JSON.parse(String(options?.body)),
      { method, params } = body;
    const origin = new URL(String(url)).origin;
    let result: unknown;
    if (origin === 'https://paymaster.example.test') {
      state.posts++;
      if (state.hook) await state.hook();
      if (state.lostPaymaster) throw new Error('Offline response loss');
      result = {
        paymaster: config.acceptance.paymaster.address,
        paymasterData: method === 'pm_getPaymasterStubData' ? '0x01' : '0x02',
        paymasterVerificationGasLimit: '0x9c40',
        paymasterPostOpGasLimit: '0x7530',
        ...(method === 'pm_getPaymasterStubData'
          ? { isFinal: state.finalStub }
          : {}),
      };
    } else if (method === 'eth_chainId') result = '0x14a34';
    else if (method === 'eth_getBlockByNumber')
      result = {
        number: params[0] === 'latest' ? '0x64' : params[0],
        hash:
          params[0] === '0x0'
            ? config.acceptance.genesisHash
            : '0x' + 'b'.repeat(64),
      };
    else if (method === 'eth_getCode') result = code;
    else if (method === 'eth_getStorageAt')
      result =
        params[1] ===
        keccak256(new TextEncoder().encode('fallback_manager.handler.address'))
          ? zeroPadValue(config.acceptance.module.address, 32).toLowerCase()
          : zeroPadValue('0x00', 32);
    else if (method === 'eth_call') {
      const data = params[0].data;
      if (data === moduleInterface.encodeFunctionData('SUPPORTED_ENTRYPOINT'))
        result = moduleInterface.encodeFunctionResult('SUPPORTED_ENTRYPOINT', [
          config.acceptance.domain.entryPoint,
        ]);
      else if (
        data.startsWith(entryInterface.getFunction('getNonce')!.selector)
      )
        result = entryInterface.encodeFunctionResult('getNonce', [0]);
      else if (data === safeInterface.encodeFunctionData('getOwners'))
        result = safeInterface.encodeFunctionResult('getOwners', [
          [wallet.address],
        ]);
      else if (data === safeInterface.encodeFunctionData('getThreshold'))
        result = safeInterface.encodeFunctionResult('getThreshold', [1]);
      else if (data === safeInterface.encodeFunctionData('VERSION'))
        result = safeInterface.encodeFunctionResult('VERSION', ['1.4.1']);
      else if (data === safeInterface.encodeFunctionData('masterCopy'))
        result = safeInterface.encodeFunctionResult('masterCopy', [
          basePolicy.accounts[0].singleton.address,
        ]);
      else if (
        data.startsWith(
          safeInterface.getFunction('getModulesPaginated')!.selector,
        )
      )
        result = safeInterface.encodeFunctionResult('getModulesPaginated', [
          [config.acceptance.module.address],
          '0x0000000000000000000000000000000000000001',
        ]);
      else throw new Error('Unknown fixture call');
    } else throw new Error('Unknown fixture RPC');
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: state.mutate
          ? state.mutate(method, result, params, origin)
          : result,
      }),
    );
  }) as typeof fetch;
  let actions = new SupportedActions(onboarding, db, undefined, 'active-1', {
    policy: basePolicy,
    maxValiditySeconds: 120,
  });
  const compose = () =>
    new Safe4337SigningService(
      actions,
      db,
      config,
      {
        backend,
        authorization: async () => 'Bearer offline-fixture',
        authorizeSponsorship: async (_context, terms) => {
          await state.consentHook?.();
          return state.consent
            ? {
                termsHash: fingerprint(terms),
                consentReference: 'safe4337-consent',
              }
            : null;
        },
      },
      request,
    );
  let service = compose();
  async function restart() {
    db.close();
    db = openProviderDatabase({ directory });
    dbs.push(db);
    onboarding = new OnboardingService(
      policy,
      db.onboardingStore,
      [],
      backend,
      'financial-terms',
      true,
    );
    actions = new SupportedActions(onboarding, db, undefined, 'active-1', {
      policy: basePolicy,
      maxValiditySeconds: 120,
    });
    runtime = new RuntimeConfigurationService(
      onboarding.policy,
      db.onboardingStore,
      { operators: [operator] },
      'active-1',
    );
    service = compose();
  }
  const source = () => actions.requestCalls(context, input, async () => '0');
  const relay = (connection = db) =>
    connection.financialAuthority({
      namespace: 'relay-signing',
      provider: 'offline',
      authorize: (c, a) => actions.authorize(c, a),
    });
  return {
    directory,
    get db() {
      return db;
    },
    get actions() {
      return actions;
    },
    get service() {
      return service;
    },
    get runtime() {
      return runtime;
    },
    get onboarding() {
      return onboarding;
    },
    context,
    operatorContext,
    grant,
    state,
    operation,
    input,
    config,
    wallet,
    backend,
    source,
    relay,
    restart,
    request,
  };
}

describe('durable SafeOp sponsorship and single mechanism admission', () => {
  it('cannot reset an admitted operation by changing signing backend provider identity', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    const other = new Safe4337SigningService(
      f.actions,
      f.db,
      f.config,
      {
        backend: { ...f.backend, provider: 'other-backend' },
        authorization: async () => 'Bearer offline-fixture',
        authorizeSponsorship: async (_c, terms) => ({
          termsHash: fingerprint(terms),
          consentReference: 'safe4337-consent',
        }),
      },
      f.request,
    );
    await expect(
      other.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject(denied);
    await expect(
      other.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.signs).toBe(0);
    expect(f.state.posts).toBe(0);
  });
  it.each(['relayer-first', 'sponsorship-first'])(
    'also fences direct relayer submission authority: %s',
    async (order) => {
      const f = await fixture(),
        source = await f.source();
      const sourceRecord = await f.actions.withAuthorizedTransfer(
        f.context.principal,
        source.action_id,
        (_s, r) => r,
      );
      const transaction = {
        to: f.input.calls[0].to,
        value: '0',
        data: f.input.calls[0].data,
        gasLimit: '100000',
        maxFeePerGas: '20',
        maxPriorityFeePerGas: '2',
      };
      const hash = hashRelayerTransaction(transaction);
      const action = {
        actionId: randomUUID(),
        operationId: source.action_id,
        kind: 'relay_transaction' as const,
        profile: 'oz_relayer_evm_v1' as const,
        profileRevision: '1' as const,
        status: 'ready' as const,
        chainId: 'eip155:84532' as const,
        chainAccountId: sourceRecord.approval.action.chain_account_id,
        bindingRevision: '1',
        capabilityRevision: '1',
        planRevision: '1',
        planHash: hash,
        payloadHash: hash,
        expiresAt: sourceRecord.approval.action.expires_at,
        transaction,
      };
      const approval = { ...sourceRecord.approval, action };
      await f.db.approveAction(approval);
      const authority = f.db.financialAuthority({
        namespace: 'direct-relay',
        provider: 'offline',
        authorize: async () => {
          await f.actions.withAuthorizedTransfer(
            f.context.principal,
            source.action_id,
            () => true,
          );
          return {
            ownerSubject: approval.ownerSubject,
            accountId: approval.account.accountId,
            address: approval.account.address,
            chainAccountId: action.chainAccountId,
            currentUserStatus: 'ID VERIFIED',
            grantId: approval.grantId,
            consentReference: approval.consentReference,
            policyRevision: approval.policyRevision,
            bindingRevision: '1',
            capabilityRevision: '1',
            planRevision: '1',
            planHash: hash,
            expiresAt: action.expiresAt,
          };
        },
      });
      if (order === 'relayer-first') {
        expect(
          await authority.executionAuthority.execution(
            f.context,
            action.actionId,
            'submit',
          ),
        ).not.toBeNull();
        await expect(
          f.service.admit(f.context, source.action_id, f.operation),
        ).rejects.toMatchObject(conflict);
      } else {
        await f.service.admit(f.context, source.action_id, f.operation);
        await expect(
          authority.executionAuthority.execution(
            f.context,
            action.actionId,
            'submit',
          ),
        ).rejects.toMatchObject(conflict);
      }
      expect(f.state.posts).toBe(0);
      expect(f.state.signs).toBe(0);
    },
  );

  it('rechecks the fenced lease after authority reads before paymaster contact', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    f.state.consentHook = async () => {
      await f.db.onboardingStore.transaction((s) => {
        const phase = s.sponsorships![source.action_id].phases.stub;
        if (phase) phase.expiresAt = Date.now() - 1;
      });
    };
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.state.posts).toBe(0);
    expect(
      (await f.db.budget(f.db.sponsorship.load(source.action_id)!.gasBudgetId))
        ?.reserved,
    ).toBe('4820010');
  });

  it('requires the shared transaction for phase claims and sanitizes access after storage closes', async () => {
    const f = await fixture(),
      source = await f.source();
    expect(() =>
      f.db.sponsorship.claim(
        source.action_id,
        'stub',
        fingerprint(f.operation),
      ),
    ).toThrow('wallet_attempt_unavailable');
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
    f.db.close();
    expect(() =>
      f.db.sponsorship.claim(
        source.action_id,
        'stub',
        fingerprint(f.operation),
      ),
    ).toThrow('wallet_attempt_unavailable');
  });
  it('fences late paymaster responses after lease expiry without another request', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    f.state.hook = async () => {
      await f.db.onboardingStore.transaction((s) => {
        s.sponsorships![source.action_id].phases.stub!.expiresAt =
          Date.now() - 1;
      });
    };
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject({
      code: 'wallet_attempt_unavailable',
      outcome: 'unknown',
    });
    await f.restart();
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.state.posts).toBe(1);
    expect(
      (await f.db.budget(f.db.sponsorship.load(source.action_id)!.gasBudgetId))
        ?.reserved,
    ).toBe('4820010');
  });
  it('reuses the same idempotent operation through the sponsorship and relayer request interfaces', async () => {
    const f = await fixture();
    const admitted = await f.service.requestCalls(
      f.context,
      f.input,
      f.operation,
    );
    const source = await f.source();
    expect(admitted.operation_id).toBe(source.action_id);
    await expect(
      f.relay().authority.sign(f.context, source.action_id),
    ).rejects.toMatchObject(conflict);
    const repeated = await f.service.requestCalls(
      f.context,
      f.input,
      f.operation,
    );
    expect(repeated).toEqual(admitted);
    expect(
      (
        await f.db.budget(
          f.db.sponsorship.load(source.action_id)!.source.budgetId,
        )
      )?.reserved,
    ).toBe('1');
  });
  it('rolls back operation admission when another relayer attempt has consumed the shared gas allowance', async () => {
    const f = await fixture(),
      source = await f.source();
    const gasId = fingerprint([
      'execution-gas',
      f.onboarding.policy.provider.origin,
      f.context.principal.issuer,
      f.context.principal.clientId,
    ]);
    await f.db.setBudget(gasId, '10000000', 'active-1');
    const request = createWalletAttemptRequest(
      'other-operation',
      'offline',
      'relay_transaction',
      f.input.account_id,
      randomUUID(),
      randomUUID(),
      { fixture: 'relayer' },
    );
    await f.db.admitAttempt({ request, budgetId: gasId, units: '6000000' });
    await f.db.journal.claim(request);
    await expect(
      f.service.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject(denied);
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
    expect(
      (
        await f.db.onboardingStore.transaction((s) =>
          Object.values(s.executionBindings ?? {}),
        )
      ).length,
    ).toBe(0);
    const record = await f.actions.withAuthorizedTransfer(
      f.context.principal,
      source.action_id,
      (_s, r) => r,
    );
    expect((await f.db.budget(record.approval.budgetId))?.reserved).toBe('0');
    expect((await f.db.budget(gasId))?.reserved).toBe('6000000');
    expect(
      await f.relay().authority.sign(f.context, source.action_id),
    ).not.toBeNull();
    expect(f.state.posts).toBe(0);
  });
  it('detects historical relayer admissions that predate mechanism bindings', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.relay().authority.sign(f.context, source.action_id);
    await f.db.onboardingStore.transaction((s) => {
      s.executionBindings = {};
    });
    await f.restart();
    await expect(
      f.service.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject(conflict);
    expect(f.state.posts).toBe(0);
  });
  it('rechecks runtime claim freshness on quote replay before contacting the paymaster', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.db.onboardingStore.transaction((s) => {
      const request = s.requests[f.grant.request_id];
      request.input.user!.identity.verified_at = new Date(
        Date.now() - 301000,
      ).toISOString();
    });
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.posts).toBe(0);
  });
  it('denies changed caller identity and zero estimates without financial admission', async () => {
    const f = await fixture(),
      source = await f.source();
    await expect(
      f.service.admit(
        {
          ...f.context,
          principal: { ...f.context.principal, clientId: 'other' },
        },
        source.action_id,
        f.operation,
      ),
    ).rejects.toMatchObject(denied);
    await expect(
      f.service.admit(f.context, source.action_id, {
        ...f.operation,
        maxFeePerGas: '0x0',
        maxPriorityFeePerGas: '0x0',
      }),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
    expect(f.state.posts).toBe(0);
  });

  it('uses real runtime/grant checks, reserves both caps once and signs the exact SafeOp after durable paymaster phases', async () => {
    const f = await fixture(),
      source = await f.source();
    const admitted = await f.service.admit(
      f.context,
      source.action_id,
      f.operation,
    );
    expect(admitted.maximum_cost_wei).toBe('4820010');
    const record = f.db.sponsorship.load(source.action_id)!;
    expect(await f.db.budget(record.gasBudgetId)).toEqual({
      maximum: '10000000',
      reserved: '4820010',
    });
    expect((await f.db.budget(record.source.budgetId))?.reserved).toBe('1');
    await f.service.sponsor(f.context, source.action_id);
    const signed = await f.service.sign(f.context, source.action_id);
    expect(signed.signature.length).toBe(156);
    expect(f.state.posts).toBe(2);
    expect(f.state.signs).toBe(1);
    expect(signed.signature.slice(0, 14)).toBe('0x000000000000');
    await f.restart();
    expect(await f.service.sponsor(f.context, source.action_id)).toMatchObject({
      paymasterData: '0x02',
    });
    expect(await f.service.sign(f.context, source.action_id)).toEqual(signed);
    expect(f.state.posts).toBe(2);
    expect(f.state.signs).toBe(1);
    expect((await f.db.budget(record.source.budgetId))?.reserved).toBe('1');
    await expect(
      f.relay().authority.sign(f.context, source.action_id),
    ).rejects.toMatchObject(conflict);
  });
  it('denies ERC-4337 when a relayer signature was admitted, across backend namespaces and restart', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.relay().authority.sign(f.context, source.action_id);
    await f.restart();
    await expect(
      f.service.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject(conflict);
    expect(f.state.posts).toBe(0);
    expect(f.state.signs).toBe(0);
  });
  it('atomically selects one path under concurrent relayer and ERC-4337 admission', async () => {
    const f = await fixture(),
      source = await f.source();
    const other = openProviderDatabase({ directory: f.directory });
    dbs.push(other);
    const results = await Promise.allSettled([
      f.service.admit(f.context, source.action_id, f.operation),
      f.relay(other).authority.sign(f.context, source.action_id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(f.state.posts).toBe(0);
  });
  it('shares one reservation across concurrent identical admission and successful final stubs', async () => {
    const f = await fixture();
    f.state.finalStub = true;
    const source = await f.source();
    await Promise.all([
      f.service.admit(f.context, source.action_id, f.operation),
      f.service.admit(f.context, source.action_id, f.operation),
    ]);
    const results = await Promise.allSettled([
      f.service.sponsor(f.context, source.action_id),
      f.service.sponsor(f.context, source.action_id),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(f.state.posts).toBe(1);
    expect(
      (
        await f.db.budget(
          f.db.sponsorship.load(source.action_id)!.source.budgetId,
        )
      )?.reserved,
    ).toBe('1');
  });
  it('retains gas and mechanism after lost sponsorship responses without retrying after restart', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    f.state.lostPaymaster = true;
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    await f.restart();
    f.state.lostPaymaster = false;
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    await expect(
      f.relay().authority.sign(f.context, source.action_id),
    ).rejects.toMatchObject(conflict);
    expect(f.state.posts).toBe(1);
    expect(
      (await f.db.budget(f.db.sponsorship.load(source.action_id)!.gasBudgetId))
        ?.reserved,
    ).toBe('4820010');
  });
  it('checks fresh grant revocation between stub and final before another paymaster effect', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    f.state.hook = async () => {
      await f.db.onboardingStore.transaction((s) => {
        s.grants[f.grant.grant_id!].state = 'revoked';
      });
    };
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.posts).toBe(1);
    expect(f.state.signs).toBe(0);
  });
  it('requires separate current sponsorship consent and denies current runtime publication changes', async () => {
    const f = await fixture(),
      source = await f.source();
    f.state.consent = false;
    await expect(
      f.service.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject(denied);
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
    f.state.consent = true;
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.service.sponsor(f.context, source.action_id);
    f.state.consent = false;
    await expect(
      f.service.sign(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    f.state.consent = true;
    const application = await f.runtime.read(f.context.principal);
    await f.runtime.update(f.operatorContext, application.application_id, {
      expected_revision: '1',
      policy: { ...application.publication!.policy, enabled: false },
    });
    await expect(
      f.service.sign(f.context, source.action_id),
    ).rejects.toMatchObject(denied);
    expect(f.state.signs).toBe(0);
  });
  it('does not redispatch an uncertain signing attempt or switch back to the relayer', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.service.sponsor(f.context, source.action_id);
    f.state.lostSign = true;
    await expect(
      f.service.sign(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    await f.restart();
    f.state.lostSign = false;
    await expect(
      f.service.sign(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.state.signs).toBe(1);
    await expect(
      f.relay().authority.sign(f.context, source.action_id),
    ).rejects.toMatchObject(conflict);
  });
  it('rejects altered quotes and wrong signing keys while retaining financial reservations', async () => {
    const f = await fixture(),
      source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await expect(
      f.service.admit(f.context, source.action_id, {
        ...f.operation,
        maxFeePerGas: '0x15',
      }),
    ).rejects.toMatchObject(conflict);
    await f.service.sponsor(f.context, source.action_id);
    f.state.wrongSignature = true;
    await expect(
      f.service.sign(f.context, source.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.state.signs).toBe(1);
  });
});

describe('accepted Safe4337 account and operation signatures', () => {
  it('matches an independent viem 2.57.7 SafeOp digest vector for the accepted module type', () => {
    const payload = safeOpPayloadV07(
      {
        sender: '0x1111111111111111111111111111111111111111',
        nonce: '0x1',
        callData: '0x12345678',
        verificationGasLimit: '0xc350',
        callGasLimit: '0x186a0',
        preVerificationGas: '0x5208',
        maxPriorityFeePerGas: '0x2',
        maxFeePerGas: '0x14',
        paymaster: '0x2222222222222222222222222222222222222222',
        paymasterVerificationGasLimit: '0x9c40',
        paymasterPostOpGasLimit: '0x7530',
        paymasterData: '0xabcdef',
      },
      {
        chainId: '0x14a34',
        entryPointVersion: '0.7',
        entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      },
      '0x3333333333333333333333333333333333333333',
      '0',
      '2000000000',
    );
    expect(
      TypedDataEncoder.hash(payload.domain, payload.types, payload.message),
    ).toBe(
      '0x4e419557335470be90838b0ab4d6ff65c38c54606560fcc1cc00afa408523a75',
    );
  });

  it.each([
    'wrong-chain',
    'code',
    'owner',
    'module',
    'handler',
    'guard',
    'nonce',
    'quorum',
  ])('denies %s before gas reservation or paymaster contact', async (fault) => {
    const f = await fixture(),
      source = await f.source();
    f.state.mutate = (method, result, params, origin) => {
      if (fault === 'wrong-chain' && method === 'eth_chainId') return '0x1';
      if (fault === 'code' && method === 'eth_getCode') return '0x00';
      if (
        fault === 'handler' &&
        method === 'eth_getStorageAt' &&
        params[1] ===
          keccak256(
            new TextEncoder().encode('fallback_manager.handler.address'),
          )
      )
        return zeroPadValue('0x00', 32);
      if (
        fault === 'guard' &&
        method === 'eth_getStorageAt' &&
        params[1] ===
          keccak256(new TextEncoder().encode('guard_manager.guard.address'))
      )
        return zeroPadValue('0x01', 32);
      if (
        fault === 'quorum' &&
        method === 'eth_getBlockByNumber' &&
        params[0] !== '0x0' &&
        origin === 'https://secondary.example.test'
      )
        return { ...(result as object), hash: '0x' + 'c'.repeat(64) };
      if (method === 'eth_call') {
        if (
          fault === 'owner' &&
          (params[0] as { data: string }).data ===
            safeInterface.encodeFunctionData('getOwners')
        )
          return safeInterface.encodeFunctionResult('getOwners', [
            [Wallet.createRandom().address],
          ]);
        if (
          fault === 'module' &&
          (params[0] as { data: string }).data.startsWith(
            safeInterface.getFunction('getModulesPaginated')!.selector,
          )
        )
          return safeInterface.encodeFunctionResult('getModulesPaginated', [
            [],
            '0x0000000000000000000000000000000000000001',
          ]);
        if (
          fault === 'nonce' &&
          (params[0] as { data: string }).data.startsWith(
            entryInterface.getFunction('getNonce')!.selector,
          )
        )
          return entryInterface.encodeFunctionResult('getNonce', [1]);
      }
      return result;
    };
    await expect(
      f.service.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject(denied);
    expect(f.state.posts).toBe(0);
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
  });
  it('binds the SafeOp domain, fee, paymaster and validity into a strict single-owner signature', async () => {
    const f = await fixture(),
      until = String(Math.floor(Date.now() / 1000) + 60);
    const operation = {
      ...f.operation,
      paymaster: f.config.acceptance.paymaster.address,
      paymasterData: '0x02',
      paymasterVerificationGasLimit: '0x9c40',
      paymasterPostOpGasLimit: '0x7530',
    };
    const payload = safeOpPayloadV07(
      operation,
      f.config.acceptance.domain,
      f.config.acceptance.module.address,
      '0',
      until,
    );
    const action = safeOpActionV07(
      payload,
      { accountId: randomUUID(), address: f.wallet.address },
      randomUUID(),
      randomUUID(),
    );
    const signature = await f.wallet.signTypedData(
      payload.domain,
      payload.types,
      payload.message,
    );
    expect(recoverAddress(action.payload_hash, signature)).toBe(
      f.wallet.address,
    );
    expect(
      safeOpSignatureV07(action, f.wallet.address, signature),
    ).toHaveLength(156);
    expect(() =>
      safeOpSignatureV07(
        {
          ...action,
          payload: {
            ...payload,
            message: { ...payload.message, maxFeePerGas: '21' },
          },
        },
        f.wallet.address,
        signature,
      ),
    ).toThrow();
    expect(() =>
      safeOpSignatureV07(action, f.wallet.address, signature + '00'),
    ).toThrow();
    expect(() =>
      safeOpPayloadV07(
        operation,
        f.config.acceptance.domain,
        f.config.acceptance.module.address,
        '0',
        '0',
      ),
    ).toThrow();
  });
});
