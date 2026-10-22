import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Interface, id } from 'ethers';
import { describe, expect, it, vi } from 'vitest';
import { openProviderDatabase } from '../src/storage/index.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { fingerprint } from '../src/onboarding/policy.js';
import {
  runtimeApplicationId,
  normalizeRuntimePolicy,
} from '../src/runtime-configuration/service.js';
import { canonicalHash } from '../src/domain/canonical.js';
import {
  buildApprovedCallIntent,
  type ApprovedCallPolicy,
  type ApprovedCallInput,
} from '../src/execution/approved-calls.js';
import {
  applicationGasBudgetId,
  applicationGasBudgetLimit,
  normalizeUserOperationV07,
  userOperationHashV07,
  maximumUserOperationCostV07,
  safeUserOperationCallData,
  prepareRuntimeUserOperationV07,
  createPaymasterClientV07,
  type UserOperationV07,
  type PaymasterClientOptionsV07,
  type RuntimeUserOperationPreparationOptions,
} from '../src/sponsorship/index.js';

const domain = {
  entryPointVersion: '0.7' as const,
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  chainId: '0x14a34' as const,
};
const sender = '0x1111111111111111111111111111111111111111';
const paymaster = '0x2222222222222222222222222222222222222222';
const operation = (): UserOperationV07 => ({
  sender,
  nonce: '0x1',
  callData: '0x12345678',
  callGasLimit: '0x186a0',
  verificationGasLimit: '0xc350',
  preVerificationGas: '0x5208',
  maxFeePerGas: '0x14',
  maxPriorityFeePerGas: '0x2',
});
const sponsored = () => ({
  ...operation(),
  paymaster,
  paymasterVerificationGasLimit: '0x9c40',
  paymasterPostOpGasLimit: '0x7530',
  paymasterData: '0xabcdef',
});
const context = () => ({
  applicationId: 'a'.repeat(64),
  policyHash: 'b'.repeat(64),
  policyRevision: '1',
  actionId: randomUUID(),
});
const responseData = () => ({
  paymaster,
  paymasterData: '0xabcdef',
  paymasterVerificationGasLimit: '0x9c40',
  paymasterPostOpGasLimit: '0x7530',
});
function clientOptions(): PaymasterClientOptionsV07 {
  return {
    url: 'https://paymaster.example.test/rpc',
    domain,
    paymaster,
    maximumVerificationGas: '0x9c40',
    maximumPostOpGas: '0x7530',
    maximumCostWei: '10000000',
    l1FeeReserveWei: '10',
    authorization: async () => 'Bearer offline-fixture',
    authorizeRequest: async () => true,
  };
}
function fixture(): RuntimeUserOperationPreparationOptions {
  const accountId = randomUUID();
  const base: ApprovedCallPolicy = {
    mechanism: 'safe-1.4.1',
    accounts: [
      {
        accountId,
        address: sender,
        codeHash: '0x' + '1'.repeat(64),
        singleton: {
          address: '0x3333333333333333333333333333333333333333',
          codeHash: '0x' + '1'.repeat(64),
        },
      },
    ],
    multiSend: {
      address: '0x4444444444444444444444444444444444444444',
      codeHash: '0x' + '1'.repeat(64),
    },
    maximumNativeValueWei: '10',
    lifetimeOperations: '10',
    contracts: [
      {
        address: '0x5555555555555555555555555555555555555555',
        codeHash: '0x' + '1'.repeat(64),
        selectors: [id('work(uint256)').slice(0, 10)],
        maximumValueWei: '5',
      },
    ],
    swaps: [],
    vaults: [],
  };
  const policy = normalizeRuntimePolicy({
    expected_revision: '0',
    policy: {
      version: '1',
      enabled: true,
      chain_id: 'eip155:84532',
      maximum_calls: 2,
      maximum_native_value_wei: '5',
      max_validity_seconds: 120,
      claim_requirements: [
        { name: 'country', allowed_values: ['ZA'], max_age_seconds: 60 },
      ],
      contracts: [
        {
          address: base.contracts[0].address,
          code_hash: base.contracts[0].codeHash,
          methods: [{ signature: 'work(uint256)', maximum_value_wei: '5' }],
        },
      ],
    },
  }).policy;
  const principal = {
    issuer: 'https://issuer.example.test',
    clientId: 'application',
  };
  const input: ApprovedCallInput = {
    account_id: accountId,
    kind: 'contract-call',
    calls: [
      {
        to: base.contracts[0].address,
        value: '2',
        data: new Interface(['function work(uint256)']).encodeFunctionData(
          'work',
          [42],
        ),
      },
    ],
  };
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  const intent = buildApprovedCallIntent(base, input, '1', expiresAt);
  return {
    providerOrigin: 'https://wallet.example.test',
    principal,
    domain,
    runtimePolicy: {
      application_id: runtimeApplicationId(
        principal.issuer,
        principal.clientId,
      ),
      revision: '1',
      policy_hash: canonicalHash(policy),
      policy,
    },
    basePolicy: base,
    input,
    operation: { ...sponsored(), callData: safeUserOperationCallData(intent) },
    sponsors: [
      {
        clientId: principal.clientId,
        lifetimeBudgetWei: '10000000',
      },
    ],
    expiresAt,
    maxValiditySeconds: 120,
    l1FeeReserveWei: '10',
  };
}

describe('pinned ERC-4337 v0.7 preparation', () => {
  it('matches frozen independent viem 2.57.7 UserOperation hash vectors with and without a paymaster', () => {
    expect(userOperationHashV07(operation(), domain)).toBe(
      '0x99b89c54b10302bc2eff064b892f85a85e8126045eecfd9a6ec7806ada25fe1c',
    );
    expect(userOperationHashV07(sponsored(), domain)).toBe(
      '0x66a9039c27c52ee1992a47588ebf8d10f9ba7da2bf1ce7c8569d7686a6cbe40c',
    );
    expect(maximumUserOperationCostV07(sponsored(), '10')).toBe('4820010');
    expect(
      userOperationHashV07({ ...sponsored(), nonce: '0x2' }, domain),
    ).not.toBe(userOperationHashV07(sponsored(), domain));
    expect(() =>
      userOperationHashV07(operation(), {
        ...domain,
        chainId: '0x2' as '0x14a34',
      }),
    ).toThrow();
    expect(() =>
      userOperationHashV07(operation(), {
        ...domain,
        entryPointVersion: '0.8' as '0.7',
      }),
    ).toThrow();
  });
  it.each([
    { nonce: '0x01' },
    { callGasLimit: '0x' + '1' + '0'.repeat(30) },
    { maxPriorityFeePerGas: '0x15' },
    { callData: '0x123' },
    { paymaster },
    { signature: '0x' },
    { factory: paymaster },
    { sender: '0x' + '0'.repeat(40) },
  ])('rejects malformed or unsupported operation fields %j', (change) => {
    expect(() =>
      normalizeUserOperationV07({ ...operation(), ...change }),
    ).toThrow();
  });
  it('reuses runtime methods, exact ordered calls and the application gas budget without granting authority', () => {
    const options = fixture(),
      prepared = prepareRuntimeUserOperationV07(options);
    expect(prepared).toMatchObject({
      authorizes_spending: false,
      authorizes_sponsorship: false,
      budget: {
        id: applicationGasBudgetId(
          options.providerOrigin,
          options.principal.issuer,
          options.principal.clientId,
        ),
        maximum: '10000000',
        maximumCostWei: '4820010',
      },
    });
    expect(prepared.runtimePolicy).toEqual(options.runtimePolicy);
    expect(() =>
      prepareRuntimeUserOperationV07({
        ...options,
        principal: { ...options.principal, clientId: 'other' },
      }),
    ).toThrow();
    expect(() =>
      prepareRuntimeUserOperationV07({
        ...options,
        operation: {
          ...options.operation,
          callData: options.operation.callData + '00',
        },
      }),
    ).toThrow();
    expect(() =>
      prepareRuntimeUserOperationV07({
        ...options,
        operation: { ...options.operation, sender: paymaster },
      }),
    ).toThrow();
    expect(() =>
      prepareRuntimeUserOperationV07({
        ...options,
        expiresAt: new Date(Date.now() + 180000).toISOString(),
      }),
    ).toThrow();
    const excessive = structuredClone(options);
    if (excessive.input.kind === 'contract-call')
      excessive.input.calls[0].value = '6';
    expect(() => prepareRuntimeUserOperationV07(excessive)).toThrow();
    const denied = structuredClone(options);
    if (denied.input.kind === 'contract-call')
      denied.input.calls[0].data = '0x12345678';
    expect(() => prepareRuntimeUserOperationV07(denied)).toThrow();
    options.input.kind === 'contract-call' &&
      options.input.calls.push(options.input.calls[0]);
    expect(() => prepareRuntimeUserOperationV07(options)).toThrow();
  });
  it('encodes atomic multi-call intent in order and preserves the lower provider aggregate native-value ceiling', () => {
    const options = fixture();
    if (options.input.kind !== 'contract-call') throw new Error();
    options.input.calls.push({ ...options.input.calls[0] });
    const intent = buildApprovedCallIntent(
      options.basePolicy,
      options.input,
      '1',
      options.expiresAt,
    );
    options.operation.callData = safeUserOperationCallData(intent);
    expect(prepareRuntimeUserOperationV07(options).intent.calls).toHaveLength(
      2,
    );
    options.basePolicy.maximumNativeValueWei = '3';
    expect(() => prepareRuntimeUserOperationV07(options)).toThrow();
  });
});

describe('ERC-7677 trusted paymaster transport', () => {
  it('binds exact RPC context, reserves a conservative liability before either method and preserves stub gas fields in final data', async () => {
    const options = clientOptions(),
      authorized = vi.fn(options.authorizeRequest);
    options.authorizeRequest = authorized;
    const network = vi.fn<typeof fetch>(async (_url, init) => {
      expect(authorized).toHaveBeenCalled();
      const body = JSON.parse(String(init?.body));
      expect(init).toMatchObject({
        redirect: 'error',
        credentials: 'omit',
        headers: { authorization: 'Bearer offline-fixture' },
      });
      expect(body.params[1]).toBe(domain.entryPoint);
      expect(body.params[2]).toBe(domain.chainId);
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result:
          body.method === 'pm_getPaymasterStubData'
            ? {
                ...responseData(),
                isFinal: true,
                sponsor: { name: 'Example sponsor' },
              }
            : { paymaster, paymasterData: '0x1234' },
      });
    });
    const client = createPaymasterClientV07(options, network),
      supplied = context();
    const stub = await client.stub(operation(), supplied);
    expect(stub.isFinal).toBe(true);
    expect(authorized.mock.calls[0][0]).toMatchObject({
      method: 'pm_getPaymasterStubData',
      maximumCostWei: '4820010',
      context: supplied,
    });
    const final = await client.data(
      { ...operation(), ...responseData() },
      supplied,
    );
    expect(final).toMatchObject({
      paymasterData: '0x1234',
      paymasterVerificationGasLimit: '0x9c40',
      paymasterPostOpGasLimit: '0x7530',
      isFinal: true,
    });
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('denies wrong paymaster, excessive gas, malformed context, missing authority and excessive cost before contacting a provider', async () => {
    const network = vi.fn<typeof fetch>(),
      options = clientOptions(),
      client = createPaymasterClientV07(options, network);
    await expect(
      client.stub({ ...sponsored(), paymaster: sender }, context()),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    await expect(
      client.stub(
        { ...sponsored(), paymasterPostOpGasLimit: '0x7531' },
        context(),
      ),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    await expect(
      client.stub(operation(), { ...context(), policyRevision: '0' }),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
    await expect(
      createPaymasterClientV07(
        { ...options, maximumCostWei: '1' },
        network,
      ).stub(operation(), context()),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    await expect(
      createPaymasterClientV07(
        { ...options, authorizeRequest: async () => false },
        network,
      ).stub(operation(), context()),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(network).not.toHaveBeenCalled();
  });
  it.each([
    'wrong-id',
    'wrong-paymaster',
    'oversized-gas',
    'oversized-data',
    'invalid-rpc',
    'sponsor-url',
    'rpc-error',
    'oversized-response',
  ])(
    'retains uncertainty and sanitizes a %s response without retrying',
    async (failure) => {
      const network = vi.fn<typeof fetch>(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const result: Record<string, unknown> = responseData();
        if (failure === 'wrong-paymaster') result.paymaster = sender;
        if (failure === 'oversized-gas')
          result.paymasterPostOpGasLimit = '0x100000';
        if (failure === 'oversized-data')
          result.paymasterData = '0x' + '01'.repeat(4097);
        if (failure === 'sponsor-url')
          result.sponsor = {
            name: 'Sponsor',
            icon: 'https://untrusted.example.test/icon.svg',
          };
        if (failure === 'oversized-response')
          return new Response(' '.repeat(32769));
        return Response.json({
          jsonrpc: failure === 'invalid-rpc' ? '1.0' : '2.0',
          id: failure === 'wrong-id' ? 'other' : body.id,
          ...(failure === 'rpc-error'
            ? { error: { code: -32501, message: 'private vendor details' } }
            : { result }),
        });
      });
      await expect(
        createPaymasterClientV07(clientOptions(), network).stub(
          operation(),
          context(),
        ),
      ).rejects.toMatchObject({
        message: 'wallet_provider_response',
        outcome: 'unknown',
      });
      expect(network).toHaveBeenCalledTimes(1);
    },
  );
  it('rechecks authority for final data and sanitizes credential or authority dependency failures', async () => {
    let allowed = true;
    const network = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: responseData(),
      });
    });
    const options = {
      ...clientOptions(),
      authorizeRequest: async () => allowed,
    };
    const client = createPaymasterClientV07(options, network);
    await client.stub(operation(), context());
    allowed = false;
    await expect(client.data(sponsored(), context())).rejects.toMatchObject({
      code: 'wallet_authorization_denied',
    });
    expect(network).toHaveBeenCalledTimes(1);
    await expect(
      createPaymasterClientV07(
        {
          ...clientOptions(),
          authorization: async () => {
            throw new Error('private dependency details');
          },
        },
        network,
      ).stub(operation(), context()),
    ).rejects.toMatchObject({
      message: 'wallet_provider_configuration',
      outcome: 'not_dispatched',
    });
    await expect(
      createPaymasterClientV07(
        {
          ...clientOptions(),
          authorizeRequest: async () => {
            throw new Error('private authority details');
          },
        },
        network,
      ).stub(operation(), context()),
    ).rejects.toMatchObject({
      message: 'wallet_attempt_unavailable',
      outcome: 'not_dispatched',
    });
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('does not follow redirects or retry a lost sponsorship response', async () => {
    const network = vi.fn<typeof fetch>(async () => {
      throw new Error('private provider details');
    });
    await expect(
      createPaymasterClientV07(clientOptions(), network).data(
        sponsored(),
        context(),
      ),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(network).toHaveBeenCalledTimes(1);
    const options = clientOptions();
    expect(() =>
      createPaymasterClientV07({
        ...options,
        url: 'http://paymaster.example.test',
      }),
    ).toThrow();
    expect(() =>
      createPaymasterClientV07({
        ...options,
        url: 'https://paymaster.example.test/?credential=fixture',
      }),
    ).toThrow();
  });
});

describe('one durable application gas budget', () => {
  it('requires decimal currency strings rather than lossy numeric inputs', () => {
    expect(() =>
      applicationGasBudgetLimit(
        [{ clientId: 'app', lifetimeBudgetWei: 1 as unknown as string }],
        'app',
      ),
    ).toThrow();
    expect(() =>
      maximumUserOperationCostV07(operation(), 1 as unknown as string),
    ).toThrow();
    expect(() =>
      createPaymasterClientV07({
        ...clientOptions(),
        maximumCostWei: 10000000 as unknown as string,
      }),
    ).toThrow();
  });
  it('binds the application gas budget and its most restrictive accepted limit', () => {
    expect(
      applicationGasBudgetId(
        'https://wallet.example.test',
        'https://issuer.example.test',
        'app',
      ),
    ).toBe(
      fingerprint([
        'execution-gas',
        'https://wallet.example.test',
        'https://issuer.example.test',
        'app',
      ]),
    );
    expect(
      applicationGasBudgetLimit(
        [
          { clientId: 'app', lifetimeBudgetWei: '100' },
          { clientId: 'other', lifetimeBudgetWei: '1' },
          { clientId: 'app', lifetimeBudgetWei: '90' },
        ],
        'app',
      ),
    ).toBe('90');
    expect(() => applicationGasBudgetLimit([], 'app')).toThrow();
  });
  it('enforces one SQLite cap across concurrent infrastructure attempts and retains a dispatched reservation after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wpk-shared-gas-'));
    let db = openProviderDatabase({ directory, initialize: true });
    try {
      const budgetId = applicationGasBudgetId(
        'https://wallet.example.test',
        'https://issuer.example.test',
        'app',
      );
      await db.setBudget(budgetId, '100');
      const accountId = randomUUID();
      const firstAttempt = createWalletAttemptRequest(
        'sponsorship-fixture',
        'first-attempt',
        'infrastructure_transaction',
        accountId,
        randomUUID(),
        'firstAttempt-operation',
        { mechanism: 'safe-infrastructure' },
      );
      const userOp = createWalletAttemptRequest(
        'sponsorship-fixture',
        'useroperation',
        'infrastructure_transaction',
        accountId,
        randomUUID(),
        'different-operation',
        { mechanism: '4337' },
      );
      await db.admitAttempt({ request: firstAttempt, budgetId, units: '60' });
      await db.admitAttempt({ request: userOp, budgetId, units: '50' });
      const results = await Promise.allSettled([
        db.journal.claim(firstAttempt),
        db.journal.claim(userOp),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { code: 'wallet_authorization_denied' } });
      expect((await db.budget(budgetId))?.reserved).toBe('60');
      await db.close();
      db = openProviderDatabase({ directory });
      expect((await db.journal.claim(firstAttempt)).state).not.toBe('dispatch');
      expect((await db.budget(budgetId))?.reserved).toBe('60');
    } finally {
      await db.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
