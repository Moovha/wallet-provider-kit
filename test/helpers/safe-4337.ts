import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet, Interface, keccak256, zeroPadValue } from 'ethers';
import { afterEach } from 'vitest';
import {
  openProviderDatabase,
  type ProviderDatabase,
} from '../../src/storage/index.js';
import { OnboardingService } from '../../src/onboarding/service.js';
import { SupportedActions } from '../../src/deployment/actions.js';
import { RuntimeConfigurationService } from '../../src/runtime-configuration/service.js';
import { fingerprint } from '../../src/onboarding/policy.js';
import {
  safeInterface,
  buildApprovedCallIntent,
  tokenInterface,
  type ApprovedCallPolicy,
} from '../../src/execution/approved-calls.js';
import {
  Safe4337SigningService,
  safeUserOperationCallData,
  type Safe4337SigningConfiguration,
} from '../../src/sponsorship/index.js';
import type { AuthorityContext } from '../../src/domain/principal.js';
import type { WalletSigningProvider } from '../../src/domain/signing.js';

const dirs: string[] = [];
export const dbs: ProviderDatabase[] = [];
afterEach(async () => {
  for (const db of dbs.splice(0)) db.close();
  for (const directory of dirs.splice(0))
    await rm(directory, { recursive: true, force: true });
});
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
export async function fixture(
  configure?: (config: Safe4337SigningConfiguration) => void,
  nativeRecipient?: string,
  assetBudget?: { maximumAmount: string; lifetimeAmount?: string },
  selectTokenAdapter = true,
) {
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
  const recipient = Wallet.createRandom().address;
  const adapters =
    assetBudget && selectTokenAdapter
      ? {
          tokenTransfers: [
            { token: target, recipients: [recipient], ...assetBudget },
          ],
        }
      : undefined;
  const proposal = await runtime.propose(context, {
    expected_revision: '0',
    policy: {
      version: '1',
      enabled: true,
      chain_id: 'eip155:84532',
      ...(nativeRecipient
        ? {
            native_transfers: [
              {
                address: nativeRecipient,
                code_hash: keccak256('0x'),
                maximum_value_wei: '5',
              },
            ],
          }
        : {}),
      ...(adapters ? { call_adapters: adapters } : {}),
      maximum_calls: 2,
      maximum_native_value_wei: '10',
      max_validity_seconds: 120,
      contracts: [
        {
          address: target.address,
          code_hash: codeHash,
          methods: [
            {
              signature: assetBudget
                ? 'transfer(address,uint256)'
                : 'work(uint256)',
              maximum_value_wei: '10',
            },
          ],
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
    ...(adapters ? { adapters } : {}),
    accounts: [{ ...pin(), accountId, singleton: pin() }],
    multiSend: pin(),
    contracts: [
      {
        ...target,
        selectors: [
          assetBudget
            ? tokenInterface.getFunction('transfer')!.selector
            : iface.getFunction('work')!.selector,
        ],
        maximumValueWei: '10',
      },
    ],
    ...(nativeRecipient
      ? {
          nativeTransfers: {
            recipients: [
              {
                address: nativeRecipient,
                codeHash: keccak256('0x'),
                maximumValueWei: '5',
              },
            ],
          },
        }
      : {}),
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
  configure?.(config);
  const input = {
    account_id: accountId,
    kind: 'contract-call' as const,
    calls: [
      {
        to: target.address,
        value: assetBudget ? '0' : '2',
        data: assetBudget
          ? tokenInterface
              .encodeFunctionData('transfer', [recipient, 4])
              .toLowerCase()
          : iface.encodeFunctionData('work', [42]),
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
    else if (method === 'eth_getCode')
      result =
        nativeRecipient &&
        params[0].toLowerCase() === nativeRecipient.toLowerCase()
          ? '0x'
          : code;
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
