import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TypedDataEncoder } from 'ethers';
import { evmTypedDataPayload } from '../src/providers/evm-typed-data.js';
import type { TypedDataAction } from '../src/domain/signing.js';
it('reuses exact encoding without accepting changed payloads, caller mutations, account bindings or expiry', () => {
  const account = { accountId: randomUUID(), address: '0x' + '1'.repeat(40) };
  const payload = {
    domain: { name: 'Offline encoding', chainId: '84532' },
    types: { Proof: [{ name: 'amount', type: 'uint256' }] },
    primaryType: 'Proof',
    message: { amount: '5' },
  };
  const action: TypedDataAction = {
    action_id: randomUUID(),
    operation_id: randomUUID(),
    kind: 'sign_typed_data',
    profile: 'safe_owner_v1',
    profile_revision: '1',
    status: 'ready',
    chain_id: 'eip155:84532',
    chain_account_id: 'eip155:84532:' + account.address,
    binding_revision: '1',
    capability_revision: '1',
    plan_revision: '1',
    plan_hash: '0x' + '1'.repeat(64),
    dependencies: [],
    expires_at: new Date(Date.now() + 120000).toISOString(),
    payload,
    payload_hash: TypedDataEncoder.hash(
      payload.domain,
      payload.types,
      payload.message,
    ),
  };
  const hash = vi.spyOn(TypedDataEncoder, 'hash');
  try {
    const first = evmTypedDataPayload(account, action);
    (first.domain as { chainId: number }).chainId = 1;
    expect(evmTypedDataPayload(account, action).domain).toMatchObject({
      chainId: 84532,
    });
    expect(hash).toHaveBeenCalledOnce();
    const changed = structuredClone(action);
    changed.payload.message.amount = '6';
    expect(() => evmTypedDataPayload(account, changed)).toThrow();
    expect(() =>
      evmTypedDataPayload(
        { ...account, address: '0x' + '2'.repeat(40) },
        action,
      ),
    ).toThrow();
    expect(() => evmTypedDataPayload(account, action, 'base')).toThrow();
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse(action.expires_at));
    try {
      expect(() => evmTypedDataPayload(account, action)).toThrow();
    } finally {
      now.mockRestore();
    }
  } finally {
    hash.mockRestore();
  }
});
