import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AbiCoder, Interface, Wallet, keccak256, zeroPadValue } from 'ethers';
import { vi } from 'vitest';
import golden from '../fixtures/uniswapx-v3-digests.json' with { type: 'json' };
import permitRuntime from '../fixtures/permit2-runtime.json' with { type: 'json' };
import { openProviderDatabase } from '../../src/storage/index.js';
import { OnboardingService } from '../../src/onboarding/service.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
} from '../../src/runtime-configuration/service.js';
import { ApplicationCredentialCipher } from '../../src/runtime-configuration/credentials.js';
import { UniswapXOrderService } from '../../src/orders/service.js';
import {
  dutchV3OrderAbi,
  hashBaseUniswapXV3Order,
  uniswapXPermit2,
  type UniswapXOrderPolicy,
} from '../../src/orders/uniswapx-v3.js';
import type { OnboardingPolicy } from '../../src/onboarding/types.js';
import type { WalletSigningProvider } from '../../src/domain/signing.js';

export const code = '0x6000';
export const codeHash = keccak256(code);
export const blockHash = '0x' + 'ab'.repeat(32);
export const genesisHash = '0x' + 'cd'.repeat(32);
export const feeRecipient = '0x5555555555555555555555555555555555555555';
export const poolInterface = new Interface([
  'function token0() view returns(address)',
  'function token1() view returns(address)',
  'function liquidity() view returns(uint128)',
  'function slot0() view returns(uint160)',
  'function observe(uint32[]) view returns(int56[],uint160[])',
]);
const safeInterface = new Interface([
  'function VERSION() view returns(string)',
  'function masterCopy() view returns(address)',
  'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)',
  'function isValidSignature(bytes32,bytes) view returns(bytes4)',
]);
const tokenInterface = new Interface([
  'function balanceOf(address) view returns(uint256)',
  'function allowance(address,address) view returns(uint256)',
  'function nonceBitmap(address,uint256) view returns(uint256)',
]);
export function orderFixture() {
  const order = structuredClone(golden.order);
  order.info.deadline = Math.floor(Date.now() / 1000) + 300;
  order.baseInput.startAmount = order.baseInput.maxAmount = 1000000;
  order.baseOutputs[0] = {
    ...order.baseOutputs[0],
    startAmount: '990000',
    minAmount: '980100',
    curve: { relativeBlocks: 4, relativeAmounts: ['9900'] as never },
  };
  order.baseOutputs.push({
    ...order.baseOutputs[0],
    recipient: feeRecipient,
    startAmount: '10000',
    minAmount: '9900',
    curve: { relativeBlocks: 4, relativeAmounts: ['100'] as never },
  });
  order.cosignerData.outputAmounts = [0];
  const policy: UniswapXOrderPolicy = {
    profile: 'uniswapx-v3-order-v1',
    maximumValiditySeconds: 600,
    reactorCodeHash: codeHash,
    cosigner: order.cosigner,
    fee: { recipient: feeRecipient, basisPoints: 100 },
    pricePolicy: {
      profile: 'solver-twap-benchmark-v1',
      pool: { address: feeRecipient, codeHash },
      lookbackSeconds: 1800,
      maximumLossBps: 200,
      maximumSpotDivergenceBps: 100,
    },
    routes: [
      {
        tokenIn: { address: order.baseInput.token, codeHash },
        tokenOut: { address: order.baseOutputs[0].token, codeHash },
        maximumInputUnits: '1000000',
        maximumLifetimeInputUnits: '1000000',
      },
    ],
  };
  const encode = () =>
    AbiCoder.defaultAbiCoder().encode([dutchV3OrderAbi], [order]);
  const quote = () => ({
    encodedOrder: encode(),
    orderId: hashBaseUniswapXV3Order(encode(), golden.safe).witnessHash,
    orderInfo: { chainId: 8453 },
  });
  return { order, policy, encode, quote, safe: golden.safe };
}

export async function serviceFixture(orderPermission = true, fx = false) {
  const f = orderFixture();
  if (fx) {
    f.policy.pricePolicy = {
      profile: 'solver-fiat-fx-v1',
      source: 'exchangerate-api-open',
      maximumLossBps: 1000,
      cacheSeconds: 3600,
      maximumRateAgeSeconds: 129600,
    };
    f.order.baseOutputs.forEach((output) => {
      output.token = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';
      output.startAmount = (
        BigInt(output.startAmount) *
        17n *
        10n ** 12n
      ).toString();
      output.minAmount = (
        BigInt(output.minAmount) *
        17n *
        10n ** 12n
      ).toString();
      output.curve.relativeAmounts = output.curve.relativeAmounts.map(
        (amount) => (BigInt(amount) * 17n * 10n ** 12n).toString(),
      ) as never;
    });
    f.policy.routes[0].tokenOut.address = f.order.baseOutputs[0].token;
  }
  const directory = await mkdtemp(join(tmpdir(), 'wpk-orders-'));
  let db = openProviderDatabase({ directory, initialize: true });
  const owner = Wallet.createRandom();
  const singleton = { address: Wallet.createRandom().address, codeHash };
  const module = { address: Wallet.createRandom().address, codeHash };
  const principal = {
    issuer: 'https://issuer.example.test',
    subject: 'service',
    clientId: 'offline',
    scopes: [
      'wallet:access',
      'wallet:access:read',
      'wallet:actions',
      'wallet:sign',
      'wallet:execute:read',
      'wallet:configuration:propose',
    ],
  };
  const context = { principal, idempotencyKey: randomUUID() };
  const applicationId = runtimeApplicationId(
    principal.issuer,
    principal.clientId,
  );
  const operator = {
    issuer: principal.issuer,
    subject: 'operator',
    clientId: 'operator',
  };
  const onboardingPolicy: OnboardingPolicy = {
    version: '1',
    provider: {
      name: 'Offline',
      origin: 'https://wallet.example.test',
      privacyUrl: 'https://wallet.example.test/privacy',
    },
    access: { mode: 'application' },
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
        name: 'Offline',
        assertionTrust: { agreement: 'offline' },
        permissions: ['account:read', 'contracts:request', 'orders:authorize'],
      },
    ],
  };
  const onboarding = new OnboardingService(
    onboardingPolicy,
    db.onboardingStore,
    [],
    undefined,
    'financial-terms',
    false,
    false,
    undefined,
    undefined,
    f.policy,
  );
  await db.onboardingStore.transaction((state) => {
    state.deploymentBindings = {
      'service-v1': {
        origin: onboardingPolicy.provider.origin,
        provider: 'offline',
        binding: 'offline',
        activeRevision: 'active-1',
      },
    };
  });
  const runtime = new RuntimeConfigurationService(
    onboarding.policy,
    db.onboardingStore,
    { operators: [operator] },
    'active-1',
    undefined,
    'base',
  );
  const proposal = await runtime.propose(context, {
    expected_revision: '0',
    policy: {
      version: '1',
      enabled: true,
      chain_id: 'eip155:8453',
      maximum_calls: 1,
      maximum_native_value_wei: '0',
      max_validity_seconds: 300,
      contracts: [
        {
          address: f.order.baseInput.token,
          code_hash: codeHash,
          methods: [
            { signature: 'approve(address,uint256)', maximum_value_wei: '0' },
          ],
        },
      ],
      claim_requirements: [
        { name: 'country', allowed_values: ['ZA'], max_age_seconds: 300 },
      ],
    },
  });
  await runtime.publish(
    {
      principal: { ...operator, scopes: ['wallet:configuration:write'] },
      idempotencyKey: randomUUID(),
    },
    proposal.proposal_id,
    '0',
  );
  const receipt = await onboarding.request(
    { ...context, idempotencyKey: randomUUID() },
    {
      mode: 'create',
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: [
            'account:read',
            orderPermission ? 'orders:authorize' : 'contracts:request',
          ],
        },
      ],
      user: {
        id: 'offline-user',
        identity: {
          reference: 'offline',
          level: 'verified',
          verified_at: new Date(Date.now() - 1000).toISOString(),
          fields: { country: 'ZA' },
        },
        consent: {
          ...(orderPermission
            ? {
                action_policy_revision:
                  onboarding.accessPolicy(principal).order_policy_revision,
              }
            : {}),
          granted_at: new Date(Date.now() - 1000).toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    },
  );
  const accountId = receipt.account_id!;
  await db.onboardingStore.transaction((state) => {
    state.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.safeWalletAccounts = {
      [accountId]: {
        accountId,
        applicationId,
        owner: state.accounts[accountId].owner,
        signer: { accountId: randomUUID(), address: owner.address },
        binding: { accountId, address: f.safe, codeHash, singleton },
        status: 'ready',
      },
    };
  });
  const state = {
    allowance: 1000000n,
    posts: 0,
    rpc: 0,
    postFails: false,
    nonce: 0n,
    safeBlock: 98,
    signs: 0,
    fxFails: false,
    poolReads: 0,
  };
  const send = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url) === 'https://open.er-api.com/v6/latest/USD') {
      if (state.fxFails) throw new Error('offline');
      const now = Math.floor(Date.now() / 1000);
      return new Response(
        JSON.stringify({
          result: 'success',
          base_code: 'USD',
          rates: { USD: 1, ZAR: 17 },
          time_last_update_unix: now - 100,
          time_next_update_unix: now + 86300,
        }),
      );
    }
    if (String(url).startsWith('https://trade-api.gateway.uniswap.org/')) {
      state.posts++;
      if (state.postFails) throw new Error('offline lost response');
      return new Response(
        JSON.stringify({ orderId: f.quote().orderId, orderStatus: 'open' }),
        { status: 201 },
      );
    }
    state.rpc++;
    const request = JSON.parse(String(init?.body));
    const { method, params } = request;
    let result: unknown;
    if (method === 'eth_chainId') result = '0x2105';
    else if (method === 'eth_getBlockByNumber') {
      const number =
        params[0] === '0x0'
          ? 0
          : params[0] === 'safe'
            ? state.safeBlock
            : params[0] === 'finalized'
              ? 90
              : params[0] === 'latest'
                ? 100
                : Number(BigInt(params[0]));
      result = {
        number: '0x' + number.toString(16),
        hash: number === 0 ? genesisHash : blockHash,
        timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16),
      };
    } else if (method === 'eth_getCode')
      result =
        params[0].toLowerCase() === uniswapXPermit2.toLowerCase()
          ? permitRuntime.code
          : code;
    else if (method === 'eth_getStorageAt')
      result =
        params[1] ===
        keccak256(new TextEncoder().encode('fallback_manager.handler.address'))
          ? zeroPadValue(module.address, 32)
          : '0x' + '0'.repeat(64);
    else if (method === 'eth_getLogs') result = [];
    else if (method === 'eth_call') {
      const data = params[0].data;
      const interfaces = [safeInterface, tokenInterface, poolInterface];
      const abi = interfaces.find((abi) => abi.getFunction(data.slice(0, 10)));
      if (!abi) throw new Error('unexpected function');
      const name = abi.getFunction(data.slice(0, 10))!.name;
      if (['token0', 'token1', 'liquidity', 'slot0', 'observe'].includes(name))
        state.poolReads++;
      const values: Record<string, unknown[]> = {
        VERSION: ['1.4.1'],
        masterCopy: [singleton.address],
        getOwners: [[owner.address]],
        getThreshold: [1],
        isValidSignature: ['0x1626ba7e'],
        balanceOf: [1000000],
        allowance: [state.allowance],
        nonceBitmap: [state.nonce],
        token0: [f.order.baseInput.token],
        token1: [f.order.baseOutputs[0].token],
        liquidity: [1000000],
        slot0: [1n << 96n],
        observe: [
          [0, 0],
          [0, 0],
        ],
      };
      result = abi.encodeFunctionResult(name, values[name]);
    } else throw new Error('unexpected RPC');
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: request.id, result }),
    );
  });
  vi.spyOn(runtime, 'rpcEndpoints').mockResolvedValue([
    'https://rpc.example.test',
  ]);
  const backend: WalletSigningProvider = {
    provider: 'offline',
    createAccount: async () => {
      throw new Error('not provisioned here');
    },
    findAccount: async () => null,
    signTypedData: vi.fn(async (_account, action) => {
      state.signs++;
      return owner.signTypedData(
        action.payload.domain,
        action.payload.types,
        action.payload.message,
      );
    }),
  };
  const cipher = new ApplicationCredentialCipher(
    randomBytes(32).toString('base64'),
  );
  const options = {
    policy: f.policy,
    module,
    genesisHash,
    authorityRevision: 'active-1',
    apiKey: () => 'offline-placeholder-key',
    active: () => true,
    fetch: send,
  };
  let service = new UniswapXOrderService(
    onboarding,
    db,
    runtime,
    backend,
    cipher,
    options,
  );
  await service.initialize();
  return {
    ...f,
    directory,
    get db() {
      return db;
    },
    onboarding,
    runtime,
    context,
    accountId,
    state,
    backend,
    send,
    get service() {
      return service;
    },
    async restart() {
      await service.close();
      db.close();
      db = openProviderDatabase({ directory });
      const next = new OnboardingService(
        onboardingPolicy,
        db.onboardingStore,
        [],
        undefined,
        'financial-terms',
        false,
        false,
        undefined,
        undefined,
        f.policy,
      );
      service = new UniswapXOrderService(
        next,
        db,
        runtime,
        backend,
        cipher,
        options,
      );
      await service.initialize();
    },
    async close() {
      await service.close();
      db.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
