import { describe, expect, it } from 'vitest';
import { Wallet, TypedDataEncoder, id, toBeHex } from 'ethers';
import { randomUUID } from 'node:crypto';
import { approvedCallsFixture } from './helpers/approved-calls.js';
import { executionFixture } from './helpers/execution.js';
import {
  safeInterface,
  approvedCallPayload,
  buildApprovedCallIntent,
  validateApprovedCallAction,
  validateApprovedCallPolicy,
  safeTypes,
  swapInterface,
  tokenInterface,
  vaultRouterInterface,
} from '../src/execution/approved-calls.js';
import type { TypedDataAction } from '../src/domain/signing.js';
function fixture() {
  const owner = Wallet.createRandom(),
    id = randomUUID(),
    f = approvedCallsFixture(id, owner.address, executionFixture());
  const expiresAt = new Date(
    (Math.floor(Date.now() / 1000) + 300) * 1000,
  ).toISOString();
  const input = {
    account_id: id,
    kind: 'contract-call' as const,
    calls: [
      { to: f.policy.contracts[0].address, value: '0', data: '0x12345678' },
    ],
  };
  return { ...f, owner, id, input, expiresAt };
}
describe('approved contract action policy', () => {
  it('hashes the published SafeTx EIP-712 fields and binds an immutable call batch', () => {
    const f = fixture(),
      intent = buildApprovedCallIntent(f.policy, f.input, '0', f.expiresAt),
      payload = approvedCallPayload(intent);
    expect(payload.types).toEqual(safeTypes);
    expect(payload.domain).toEqual({
      chainId: '84532',
      verifyingContract: f.policy.accounts[0].address,
    });
    expect(payload.message).toMatchObject({
      to: f.input.calls[0].to,
      operation: '0',
      data: '0x12345678',
      gasPrice: '0',
      nonce: '0',
    });
    const digest = TypedDataEncoder.hash(
      payload.domain,
      payload.types,
      payload.message,
    );
    const action = {
      payload,
      payload_hash: digest,
      plan_hash: digest,
      expires_at: f.expiresAt,
    } as TypedDataAction;
    expect(() =>
      validateApprovedCallAction(f.policy, intent, action),
    ).not.toThrow();
    intent.calls[0].value = '1';
    expect(() =>
      validateApprovedCallAction(f.policy, intent, action),
    ).toThrow();
  });
  it.each([
    'target',
    'selector',
    'native limit',
    'extra authority',
    'too much data',
    'account substitution',
  ] as const)('rejects %s before an action can be approved', (kind) => {
    const f = fixture(),
      input = structuredClone(f.input);
    if (kind === 'target') input.calls[0].to = Wallet.createRandom().address;
    if (kind === 'selector') input.calls[0].data = '0x87654321';
    if (kind === 'native limit') input.calls[0].value = '11';
    if (kind === 'extra authority') Object.assign(input, { signature: '0x' });
    if (kind === 'too much data') input.calls[0].data += '00'.repeat(2049);
    if (kind === 'account substitution') input.account_id = randomUUID();
    expect(() =>
      buildApprovedCallIntent(f.policy, input, '0', f.expiresAt),
    ).toThrow();
  });
  it('constructs a bounded Uniswap swap with exact approval, recipient, deadline, minimum output and cleanup', () => {
    const f = fixture(),
      input = {
        account_id: f.id,
        kind: 'swap' as const,
        route: 'swap',
        amount_in: '50',
        minimum_out: '40',
        deadline: String(Math.floor(Date.now() / 1000) + 120),
      };
    const intent = buildApprovedCallIntent(f.policy, input, '0', f.expiresAt);
    expect(intent.calls).toHaveLength(4);
    expect(
      tokenInterface.parseTransaction({ data: intent.calls[1].data })!.args
        .amount,
    ).toBe(50n);
    expect(
      tokenInterface.parseTransaction({ data: intent.calls[3].data })!.args
        .amount,
    ).toBe(0n);
    const params = swapInterface.parseTransaction({
      data: intent.calls[2].data,
    })!.args.params;
    expect(params.recipient).toBe(f.policy.accounts[0].address);
    expect(params.amountOutMinimum).toBe(40n);
    expect(params.deadline).toBe(BigInt(input.deadline));
    expect(approvedCallPayload(intent).message.operation).toBe('1');
    expect(() =>
      buildApprovedCallIntent(
        f.policy,
        { ...input, amount_in: '101' },
        '0',
        f.expiresAt,
      ),
    ).toThrow();
    expect(() =>
      buildApprovedCallIntent(
        f.policy,
        { ...input, minimum_out: '0' },
        '0',
        f.expiresAt,
      ),
    ).toThrow();
    expect(() =>
      buildApprovedCallIntent(
        f.policy,
        { ...input, deadline: String(Math.floor(Date.now() / 1000) + 600) },
        '0',
        f.expiresAt,
      ),
    ).toThrow();
  });
  it('constructs an asset-pulling vault deposit with an on-chain minimum share bound and cleans both allowances', () => {
    const f = fixture(),
      intent = buildApprovedCallIntent(
        f.policy,
        {
          account_id: f.id,
          kind: 'vault-deposit',
          route: 'vault',
          assets: '50',
          minimum_shares: '40',
        },
        '0',
        f.expiresAt,
      );
    expect(intent.calls).toHaveLength(6);
    const deposit = vaultRouterInterface.parseTransaction({
      data: intent.calls[3].data,
    })!;
    expect(deposit.name).toBe('depositToVault');
    expect(deposit.args.amount).toBe(50n);
    expect(deposit.args.minSharesOut).toBe(40n);
    expect(deposit.args.to).toBe(f.policy.accounts[0].address);
    expect(
      vaultRouterInterface.parseTransaction({ data: intent.calls[4].data })!
        .args.amount,
    ).toBe(0n);
    expect(
      tokenInterface.parseTransaction({ data: intent.calls[5].data })!.args
        .amount,
    ).toBe(0n);
  });
  it('rejects ambiguous code pins, duplicate account bindings and Safe self-call rules', () => {
    const f = fixture();
    f.policy.contracts.push({
      ...f.policy.contracts[0],
      codeHash: '0x' + '1'.repeat(64),
    });
    expect(() => validateApprovedCallPolicy(f.policy)).toThrow();
    const another = fixture();
    another.policy.accounts.push(structuredClone(another.policy.accounts[0]));
    expect(() => validateApprovedCallPolicy(another.policy)).toThrow();
    const self = fixture();
    self.policy.contracts[0].address = self.policy.accounts[0].address;
    expect(() => validateApprovedCallPolicy(self.policy)).toThrow();
  });
});

it.each(['ExecutionSuccess', 'ExecutionFailure'])(
  'decodes the Safe 1.4.1 indexed %s wire event',
  (name) => {
    const digest = '0x' + 'a'.repeat(64);
    const parsed = safeInterface.parseLog({
      topics: [id(name + '(bytes32,uint256)'), digest],
      data: toBeHex(0, 32),
    });
    expect(parsed?.name).toBe(name);
    expect(parsed?.args.txHash).toBe(digest);
    expect(parsed?.args.payment).toBe(0n);
  },
);
