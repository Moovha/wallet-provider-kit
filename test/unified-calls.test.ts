import { describe, it, expect } from 'vitest';
import { Wallet, keccak256 } from 'ethers';
import { randomUUID } from 'node:crypto';
import { approvedCallsFixture } from './helpers/approved-calls.js';
import { executionFixture } from './helpers/execution.js';
import {
  buildApprovedCallIntent,
  buildApprovedCallAction,
  validateApprovedCallAction,
  approvedCallPayload,
  type ApprovedCallPolicy,
  tokenInterface,
  swapInterface,
} from '../src/execution/approved-calls.js';
import {
  runtimeCallPolicy,
  validateRuntimeCalls,
} from '../src/runtime-configuration/authority.js';
import { normalizeRuntimePolicy } from '../src/runtime-configuration/service.js';
import { serviceHash } from '../src/executor/auth.js';
import { verifyAdapterEffects } from '../src/execution/adapter-effects.js';
import { RpcReader } from '../src/execution/chain.js';
function setup() {
  const id = randomUUID(),
    owner = Wallet.createRandom().address,
    f = approvedCallsFixture(id, owner, executionFixture());
  const expiresAt = new Date(Date.now() + 300000).toISOString();
  const recipient = Wallet.createRandom().address;
  f.policy.nativeTransfers = {
    recipients: [
      { address: recipient, codeHash: keccak256('0x'), maximumValueWei: '5' },
    ],
  };
  return { ...f, id, owner, expiresAt, recipient };
}
describe('unified approved calls and optional operation adapters', () => {
  it('binds native value and an explicitly pinned empty-code recipient in the common Safe payload', () => {
    const f = setup();
    const intent = buildApprovedCallIntent(
      f.policy,
      {
        account_id: f.id,
        kind: 'contract-call',
        calls: [{ to: f.recipient, value: '4', data: '0x' }],
      },
      '0',
      f.expiresAt,
    );
    expect(intent.nativeRecipients).toEqual([f.recipient.toLowerCase()]);
    expect(intent.contracts).toEqual([
      { address: f.recipient, codeHash: keccak256('0x') },
    ]);
    expect(approvedCallPayload(intent).message).toMatchObject({
      to: f.recipient,
      value: '4',
      data: '0x',
      operation: '0',
    });
    const action = buildApprovedCallAction(
      intent,
      f.owner,
      f.expiresAt,
      randomUUID(),
    );
    expect(() =>
      validateApprovedCallAction(f.policy, intent, action),
    ).not.toThrow();
    intent.calls[0].value = '5';
    expect(() =>
      validateApprovedCallAction(f.policy, intent, action),
    ).toThrow();
  });
  it.each([
    'disabled',
    'recipient',
    'value',
    'zero',
    'short-data',
    'aggregate',
  ] as const)('denies unapproved native calls: %s', (kind) => {
    const f = setup(),
      call = { to: f.recipient, value: '4', data: '0x' };
    if (kind === 'disabled') delete f.policy.nativeTransfers;
    if (kind === 'recipient') call.to = Wallet.createRandom().address;
    if (kind === 'value') call.value = '6';
    if (kind === 'zero') call.value = '0';
    if (kind === 'short-data') call.data = '0x12';
    const calls = kind === 'aggregate' ? [call, call, call] : [call];
    expect(() =>
      buildApprovedCallIntent(
        f.policy,
        { account_id: f.id, kind: 'contract-call', calls },
        '0',
        f.expiresAt,
      ),
    ).toThrow();
  });
  it.each(['swap', 'vault-deposit'] as const)(
    'retains compatibility calls and protections through generic submission: %s',
    (kind) => {
      const f = setup();
      const old =
        kind === 'swap'
          ? {
              account_id: f.id,
              kind,
              route: 'swap',
              amount_in: '10',
              minimum_out: '9',
              deadline: String(Math.floor(Date.parse(f.expiresAt) / 1000)),
            }
          : {
              account_id: f.id,
              kind,
              route: 'vault',
              assets: '10',
              minimum_shares: '9',
            };
      const legacy = buildApprovedCallIntent(f.policy, old, '0', f.expiresAt);
      f.policy.adapters = { swaps: f.policy.swaps, vaults: f.policy.vaults };
      f.policy.swaps = [];
      f.policy.vaults = [];
      const generic = buildApprovedCallIntent(
        f.policy,
        { account_id: f.id, kind: 'contract-call', calls: legacy.calls },
        '0',
        f.expiresAt,
      );
      expect(generic.calls).toEqual(legacy.calls);
      expect(generic.effects).toEqual(legacy.effects);
      expect(generic.contracts).toEqual(legacy.contracts);
      expect(generic.adapterInput).toEqual(old);
      expect(approvedCallPayload(generic)).toEqual(approvedCallPayload(legacy));
      const withoutCleanup = legacy.calls.slice(0, -1);
      expect(() =>
        buildApprovedCallIntent(
          f.policy,
          { account_id: f.id, kind: 'contract-call', calls: withoutCleanup },
          '0',
          f.expiresAt,
        ),
      ).toThrow();
    },
  );
  it('enforces token recipient, amount and canonical encoding from calldata without an application label', async () => {
    const f = setup(),
      token = f.policy.swaps[0].tokenIn;
    f.policy.adapters = {
      tokenTransfers: [
        { token, recipients: [f.recipient], maximumAmount: '10' },
      ],
    };
    const call = {
      to: token.address,
      value: '0',
      data: tokenInterface
        .encodeFunctionData('transfer', [f.recipient, 10])
        .toLowerCase(),
    };
    const input = {
        account_id: f.id,
        kind: 'contract-call' as const,
        calls: [call],
      },
      intent = buildApprovedCallIntent(f.policy, input, '0', f.expiresAt);
    expect(intent.adapterInput?.kind).toBe('token-transfer');
    expect(intent.effects[0]).toMatchObject({
      minimum: '10',
      maximum: '10',
      to: f.recipient,
    });
    const read = new RpcReader('https://rpc.example.test', (async () => {
      throw new Error('No state reads needed');
    }) as typeof fetch);
    const log = {
      address: token.address,
      ...tokenInterface.encodeEventLog(tokenInterface.getEvent('Transfer')!, [
        intent.account.address,
        f.recipient,
        10,
      ]),
    };
    expect(await verifyAdapterEffects(read, intent, [log], '0x1')).toBe(true);
    expect(await verifyAdapterEffects(read, intent, [], '0x1')).toBe(false);
    for (const data of [
      tokenInterface.encodeFunctionData('transfer', [f.recipient, 11]),
      tokenInterface.encodeFunctionData('transfer', [
        Wallet.createRandom().address,
        10,
      ]),
      call.data + '00',
    ])
      expect(() =>
        buildApprovedCallIntent(
          f.policy,
          { ...input, calls: [{ ...call, data: data.toLowerCase() }] },
          '0',
          f.expiresAt,
        ),
      ).toThrow();
  });
  it('binds optional cumulative token terms to the exact intent and requires a new policy for changes', () => {
    const f = setup(),
      token = f.policy.swaps[0].tokenIn;
    f.policy.adapters = {
      tokenTransfers: [
        {
          token,
          recipients: [f.recipient],
          maximumAmount: '10',
          lifetimeAmount: '20',
        },
      ],
    };
    const input = {
      account_id: f.id,
      kind: 'contract-call' as const,
      calls: [
        {
          to: token.address,
          value: '0',
          data: tokenInterface
            .encodeFunctionData('transfer', [f.recipient, 4])
            .toLowerCase(),
        },
      ],
    };
    const intent = buildApprovedCallIntent(f.policy, input, '0', f.expiresAt),
      action = buildApprovedCallAction(
        intent,
        f.owner,
        f.expiresAt,
        randomUUID(),
      );
    expect(intent.assetBudgets).toEqual([
      { token: token.address, units: '4', maximum: '20' },
    ]);
    f.policy.adapters.tokenTransfers![0].lifetimeAmount = '30';
    expect(() =>
      validateApprovedCallAction(f.policy, intent, action),
    ).toThrow();
    delete f.policy.adapters.tokenTransfers![0].lifetimeAmount;
    expect(
      buildApprovedCallIntent(f.policy, input, '0', f.expiresAt).assetBudgets,
    ).toBeUndefined();
    for (const invalid of ['0', (2n ** 256n).toString()]) {
      f.policy.adapters.tokenTransfers![0].lifetimeAmount = invalid;
      expect(() =>
        buildApprovedCallIntent(f.policy, input, '0', f.expiresAt),
      ).toThrow();
    }
  });
  it('supports adapter configuration independently of compatibility route fields', () => {
    const f = setup(),
      swap = f.policy.swaps[0];
    f.policy.adapters = { swaps: [swap] };
    f.policy.swaps = [];
    const legacy = buildApprovedCallIntent(
      f.policy,
      {
        account_id: f.id,
        kind: 'swap',
        route: swap.id,
        amount_in: '10',
        minimum_out: '9',
        deadline: String(Math.floor(Date.parse(f.expiresAt) / 1000)),
      },
      '0',
      f.expiresAt,
    );
    expect(
      buildApprovedCallIntent(
        f.policy,
        { account_id: f.id, kind: 'contract-call', calls: legacy.calls },
        '0',
        f.expiresAt,
      ).effects,
    ).toEqual(legacy.effects);
  });
  it('requires both a published native permission and the provider native-transfer opt-in', () => {
    const f = setup();
    const policy = normalizeRuntimePolicy({
      expected_revision: '0',
      policy: {
        version: '1',
        enabled: true,
        chain_id: 'eip155:84532',
        contracts: [],
        maximum_calls: 2,
        maximum_native_value_wei: '5',
        max_validity_seconds: 120,
        claim_requirements: [],
        native_transfers: [
          {
            address: f.recipient,
            code_hash: keccak256('0x'),
            maximum_value_wei: '5',
          },
        ],
      },
    }).policy;
    const snapshot = {
      application_id: 'a'.repeat(64),
      revision: '1',
      policy_hash: serviceHash(policy),
      policy,
    };
    const input = {
      account_id: f.id,
      kind: 'contract-call' as const,
      calls: [{ to: f.recipient, value: '4', data: '0x' }],
    };
    expect(() => validateRuntimeCalls(snapshot, input)).not.toThrow();
    expect(
      buildApprovedCallIntent(
        runtimeCallPolicy(f.policy, snapshot),
        input,
        '0',
        f.expiresAt,
      ).calls,
    ).toEqual(input.calls);
    expect(() =>
      serviceHash(runtimeCallPolicy(f.policy, snapshot)),
    ).not.toThrow();
    delete f.policy.nativeTransfers;
    expect(() =>
      buildApprovedCallIntent(
        runtimeCallPolicy(f.policy, snapshot),
        input,
        '0',
        f.expiresAt,
      ),
    ).toThrow();
    expect(() =>
      validateRuntimeCalls(snapshot, {
        ...input,
        calls: [{ ...input.calls[0], value: '6' }],
      }),
    ).toThrow();
  });
  it('does not inherit protocol checks or target permissions from compatibility route settings', () => {
    const f = setup();
    const legacy = buildApprovedCallIntent(
      f.policy,
      {
        account_id: f.id,
        kind: 'swap',
        route: 'swap',
        amount_in: '10',
        minimum_out: '9',
        deadline: String(Math.floor(Date.parse(f.expiresAt) / 1000)),
      },
      '0',
      f.expiresAt,
    );
    const input = {
      account_id: f.id,
      kind: 'contract-call' as const,
      calls: legacy.calls,
    };
    expect(() =>
      buildApprovedCallIntent(f.policy, input, '0', f.expiresAt),
    ).toThrow();
    f.policy.contracts = legacy.contracts
      .filter((pin) => legacy.calls.some((c) => c.to === pin.address))
      .map((pin) => ({
        ...pin,
        maximumValueWei: '0',
        selectors: [
          ...new Set(
            legacy.calls
              .filter((c) => c.to === pin.address)
              .map((c) => c.data.slice(0, 10)),
          ),
        ],
      }));
    const generic = buildApprovedCallIntent(f.policy, input, '0', f.expiresAt);
    expect(generic.effects).toEqual([]);
    expect(generic.adapterInput).toBeUndefined();
  });
  it('does not require compatibility route arrays or any operation adapter for generic calls', () => {
    const f = setup();
    const policy: ApprovedCallPolicy = { ...f.policy };
    delete policy.swaps;
    delete policy.vaults;
    delete policy.adapters;
    const input = {
      account_id: f.id,
      kind: 'contract-call' as const,
      calls: [
        { to: f.policy.contracts[0].address, value: '0', data: '0x12345678' },
      ],
    };
    expect(
      buildApprovedCallIntent(policy, input, '0', f.expiresAt).effects,
    ).toEqual([]);
  });
  it('bounds the total native value to one recipient across repeated calls', () => {
    const f = setup(),
      call = { to: f.recipient, value: '3', data: '0x' };
    expect(() =>
      buildApprovedCallIntent(
        f.policy,
        { account_id: f.id, kind: 'contract-call', calls: [call, call] },
        '0',
        f.expiresAt,
      ),
    ).toThrow();
  });
});
