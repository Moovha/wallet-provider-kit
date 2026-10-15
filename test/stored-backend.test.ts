import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { TypedDataEncoder, Wallet } from 'ethers';
import {
  createStoredWalletBackend,
  createDurableSigningService,
  type StoredAccountRecord,
  type StoredAccountResult,
  type StoredSigningDispatch,
  type StoredSigningResult,
} from '../src/backend.js';
import {
  WalletProviderError,
  type TypedDataAction,
} from '../src/domain/signing.js';

function fixture() {
  const wallet = Wallet.createRandom();
  const record: StoredAccountRecord = {
    accountId: randomUUID(),
    attemptId: randomUUID(),
    leaseToken: randomUUID(),
    state: 'admitted',
    address: null,
  };
  const context = { owner: 'offline-owner' };
  const payload = {
    domain: { name: 'Offline stored backend', chainId: '84532' },
    types: { Proof: [{ name: 'challenge', type: 'string' }] },
    primaryType: 'Proof',
    message: { challenge: 'offline' },
  };
  const action: TypedDataAction = {
    action_id: randomUUID(),
    operation_id: randomUUID(),
    chain_id: 'eip155:84532',
    chain_account_id: `eip155:84532:${wallet.address}`,
    kind: 'sign_typed_data',
    profile: 'evm_eoa_v1',
    profile_revision: '1',
    status: 'ready',
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
  let result: StoredSigningResult = {
    attemptId: randomUUID(),
    state: 'admitted',
    signature: null,
  };
  const dispatch: StoredSigningDispatch = {
    attemptId: result.attemptId,
    leaseToken: randomUUID(),
    accountId: record.accountId,
    address: wallet.address,
    action,
  };
  const signingAuthority = {
    admit: vi.fn(async () => structuredClone(result)),
    dispatch: vi.fn(async () => {
      result.state = 'dispatching';
      return structuredClone(dispatch);
    }),
    finish: vi.fn(
      async (
        _dispatch: StoredSigningDispatch,
        state: StoredSigningResult['state'],
        signature?: string,
      ) => {
        result = {
          attemptId: result.attemptId,
          state,
          signature: signature ?? null,
        };
        return structuredClone(result);
      },
    ),
  };
  const accountAuthority = {
    reserve: vi.fn(async () => structuredClone(record)),
    claim: vi.fn(async () => {
      record.state = 'dispatching';
      return structuredClone(record);
    }),
    finish: vi.fn(
      async (
        _record: StoredAccountRecord,
        address: string | null,
      ): Promise<StoredAccountResult> => {
        record.state = address ? 'bound' : 'unknown';
        record.address = address;
        return { accountId: record.accountId, address, state: record.state };
      },
    ),
  };
  const provider = {
    provider: 'offline-fixture',
    createAccount: vi.fn(async (accountId: string) => ({
      accountId,
      address: wallet.address,
    })),
    findAccount: vi.fn(
      async (
        accountId: string,
      ): Promise<{ accountId: string; address: string } | null> => ({
        accountId,
        address: wallet.address,
      }),
    ),
    signTypedData: vi.fn(async (_account: unknown, stored: TypedDataAction) =>
      wallet.signTypedData(
        stored.payload.domain,
        stored.payload.types,
        stored.payload.message,
      ),
    ),
  };
  const configuration = {
    enabled: true,
    provider,
    signingAuthority,
    accountAuthority,
  };
  const backend = createStoredWalletBackend(configuration);
  return {
    wallet,
    record,
    context,
    action,
    dispatch,
    signingAuthority,
    accountAuthority,
    provider,
    configuration,
    backend,
  };
}

describe('supplied stored wallet backend', () => {
  it('requires opt-in and complete trusted adapters without invoking a provider', () => {
    const f = fixture();
    for (const configuration of [
      undefined,
      { ...f.configuration, enabled: false },
      { ...f.configuration, accountAuthority: undefined },
      { ...f.configuration, signingAuthority: undefined },
    ]) {
      expect(() => createStoredWalletBackend(configuration as never)).toThrow(
        'wallet_provider_configuration',
      );
    }
    expect(f.provider.createAccount).not.toHaveBeenCalled();
    expect(f.provider.signTypedData).not.toHaveBeenCalled();
  });
  it('commits dispatch before signing and persists a verified result', async () => {
    const f = fixture();
    f.provider.signTypedData.mockImplementationOnce(
      async (_account, action) => {
        expect(f.signingAuthority.dispatch).toHaveBeenCalledOnce();
        expect(f.signingAuthority.finish).not.toHaveBeenCalled();
        return f.wallet.signTypedData(
          action.payload.domain,
          action.payload.types,
          action.payload.message,
        );
      },
    );
    const result = await f.backend.sign(f.context, f.action.action_id);
    expect(result.state).toBe('succeeded');
    expect(f.signingAuthority.finish).toHaveBeenCalledWith(
      f.dispatch,
      'succeeded',
      result.signature,
    );
    expect(
      await createStoredWalletBackend(f.configuration).sign(
        f.context,
        f.action.action_id,
      ),
    ).toEqual(result);
    expect(f.provider.signTypedData).toHaveBeenCalledOnce();
  });
  it.each(['admit', 'dispatch'] as const)(
    'denies a failed %s before provider effects',
    async (method) => {
      const f = fixture();
      f.signingAuthority[method].mockRejectedValueOnce(
        new Error('current policy denied'),
      );
      await expect(
        f.backend.sign(f.context, f.action.action_id),
      ).rejects.toThrow('current policy denied');
      expect(f.provider.signTypedData).not.toHaveBeenCalled();
    },
  );
  it.each(['timeout', 'bad signature', 'wrong signer', 'mutated action'])(
    'handles %s without changing stored authority or redispatching',
    async (failure) => {
      const f = fixture();
      f.provider.signTypedData.mockImplementationOnce(
        async (_account, action) => {
          if (failure === 'timeout') throw Error('dummy sensitive response');
          if (failure === 'bad signature') return '0x00';
          if (failure === 'mutated action')
            action.payload_hash = '0x' + '0'.repeat(64);
          const wallet =
            failure === 'wrong signer' ? Wallet.createRandom() : f.wallet;
          return wallet.signTypedData(
            action.payload.domain,
            action.payload.types,
            action.payload.message,
          );
        },
      );
      const result = await f.backend.sign(f.context, f.action.action_id);
      // Mutation cannot change the stored completion action; the valid signature still verifies.
      expect(result.state).toBe(
        failure === 'mutated action' ? 'succeeded' : 'unknown',
      );
      expect(await f.backend.sign(f.context, f.action.action_id)).toEqual(
        result,
      );
      expect(f.provider.signTypedData).toHaveBeenCalledOnce();
      expect(JSON.stringify(result)).not.toContain('sensitive');
    },
  );
  it('never repeats a signature after an uncertain completion commit', async () => {
    const f = fixture();
    f.signingAuthority.finish.mockRejectedValueOnce(
      Error('lost storage response'),
    );
    await expect(f.backend.sign(f.context, f.action.action_id)).rejects.toThrow(
      'lost storage response',
    );
    expect((await f.backend.sign(f.context, f.action.action_id)).state).toBe(
      'dispatching',
    );
    expect(f.provider.signTypedData).toHaveBeenCalledOnce();
  });
  it.each(['chain', 'digest', 'identity'] as const)(
    'rejects a malformed dispatch %s without signing',
    async (mismatch) => {
      const f = fixture();
      if (mismatch === 'chain') f.dispatch.action.chain_id = 'eip155:8453';
      if (mismatch === 'digest')
        f.dispatch.action.payload_hash = '0x' + '0'.repeat(64);
      if (mismatch === 'identity') f.dispatch.attemptId = randomUUID();
      expect((await f.backend.sign(f.context, f.action.action_id)).state).toBe(
        'unknown',
      );
      expect(f.provider.signTypedData).not.toHaveBeenCalled();
    },
  );
  it('checks fresh authority before returning a stored result', async () => {
    const f = fixture();
    await f.backend.sign(f.context, f.action.action_id);
    f.signingAuthority.admit.mockRejectedValueOnce(
      new WalletProviderError('wallet_authorization_denied'),
    );
    await expect(
      f.backend.sign(f.context, f.action.action_id),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(f.provider.signTypedData).toHaveBeenCalledOnce();
  });
  it('captures configured adapters and caller context before asynchronous work', async () => {
    const f = fixture();
    const pending = f.backend.sign(f.context, f.action.action_id);
    f.context.owner = 'changed';
    f.configuration.provider.signTypedData = vi.fn();
    expect((await pending).state).toBe('succeeded');
    expect(f.signingAuthority.dispatch).toHaveBeenCalledWith(
      { owner: 'offline-owner' },
      f.dispatch.attemptId,
    );
  });
  it('uses the supplied dispatch service without an account adapter for an existing host', async () => {
    const f = fixture();
    const service = createDurableSigningService(f.signingAuthority, {
      provider: f.provider.provider,
      signTypedData: (record) => f.provider.signTypedData(null, record.action),
    });
    expect((await service.sign(f.context, f.action.action_id)).state).toBe(
      'succeeded',
    );
  });
  it('reserves and claims the original account before creation and persists its binding', async () => {
    const f = fixture();
    f.provider.createAccount.mockImplementationOnce(async (accountId) => {
      expect(f.accountAuthority.claim).toHaveBeenCalledOnce();
      return { accountId, address: f.wallet.address };
    });
    const result = await f.backend.account(f.context);
    expect(result).toEqual({
      accountId: f.record.accountId,
      address: f.wallet.address.toLowerCase(),
      state: 'bound',
    });
    expect(f.provider.createAccount).toHaveBeenCalledWith(
      f.record.accountId,
      f.record.attemptId,
    );
    expect(
      await createStoredWalletBackend(f.configuration).account(f.context),
    ).toEqual(result);
    expect(f.provider.createAccount).toHaveBeenCalledOnce();
  });
  it.each(['reserve', 'claim'] as const)(
    'does not create after %s uncertainty',
    async (method) => {
      const f = fixture();
      f.accountAuthority[method].mockRejectedValueOnce(
        Error('storage unavailable'),
      );
      await expect(f.backend.account(f.context)).rejects.toThrow(
        'storage unavailable',
      );
      expect(f.provider.createAccount).not.toHaveBeenCalled();
    },
  );
  it('recovers unknown creation only by lookup of the original identity', async () => {
    const f = fixture();
    f.provider.createAccount.mockRejectedValueOnce(Error('lost response'));
    expect((await f.backend.account(f.context)).state).toBe('unknown');
    f.provider.findAccount.mockResolvedValueOnce(null);
    expect((await f.backend.account(f.context, true)).state).toBe('unknown');
    expect(
      (
        await createStoredWalletBackend(f.configuration).account(
          f.context,
          true,
        )
      ).state,
    ).toBe('bound');
    expect(f.provider.createAccount).toHaveBeenCalledOnce();
    expect(f.provider.findAccount).toHaveBeenNthCalledWith(
      1,
      f.record.accountId,
    );
    expect(f.provider.findAccount).toHaveBeenNthCalledWith(
      2,
      f.record.accountId,
    );
  });
  it.each(['outage', 'wrong identity', 'zero address'])(
    'fails recovery closed on %s',
    async (failure) => {
      const f = fixture();
      f.record.state = 'unknown';
      if (failure === 'outage')
        f.provider.findAccount.mockRejectedValueOnce(Error('sensitive'));
      if (failure === 'wrong identity')
        f.provider.findAccount.mockResolvedValueOnce({
          accountId: randomUUID(),
          address: f.wallet.address,
        });
      if (failure === 'zero address')
        f.provider.findAccount.mockResolvedValueOnce({
          accountId: f.record.accountId,
          address: '0x' + '0'.repeat(40),
        });
      await expect(f.backend.account(f.context, true)).rejects.toMatchObject({
        code: 'wallet_provider_unavailable',
        outcome: 'unknown',
      });
      expect(f.provider.createAccount).not.toHaveBeenCalled();
      expect(f.accountAuthority.finish).not.toHaveBeenCalled();
    },
  );
  it('does not create again after an uncertain binding completion', async () => {
    const f = fixture();
    f.accountAuthority.finish.mockRejectedValueOnce(
      Error('lost storage commit'),
    );
    await expect(f.backend.account(f.context)).rejects.toThrow(
      'lost storage commit',
    );
    await expect(f.backend.account(f.context)).rejects.toMatchObject({
      outcome: 'unknown',
    });
    expect(f.provider.createAccount).toHaveBeenCalledOnce();
  });
  it('never creates with an identity changed by the claim', async () => {
    const f = fixture();
    f.accountAuthority.claim.mockResolvedValueOnce({
      ...f.record,
      state: 'dispatching',
      accountId: randomUUID(),
    });
    await expect(f.backend.account(f.context)).rejects.toMatchObject({
      outcome: 'unknown',
    });
    expect(f.provider.createAccount).not.toHaveBeenCalled();
  });
});
