import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TypedDataEncoder, Wallet, recoverAddress } from 'ethers';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
import {
  EmbeddedWalletService,
  type SigningAuthority,
} from '../src/domain/embedded-wallet.js';
import { createServer } from '../src/service/server.js';
import {
  WalletProviderError,
  type TypedDataAction,
  type WalletSigningProvider,
} from '../src/domain/signing.js';

import { TestJournal } from './helpers/journal.js';

function fixture(journal = new TestJournal()) {
  const wallet = Wallet.createRandom();
  const account = { accountId: randomUUID(), address: wallet.address };
  const attemptId = randomUUID();
  const payload = {
    domain: { name: 'Offline provider journal fixture', chainId: '84532' },
    types: { Proof: [{ name: 'amount', type: 'uint256' }] },
    primaryType: 'Proof',
    message: {
      amount:
        '115792089237316195423570985008687907853269984665640564039457584007913129639935',
    },
  };
  const action: TypedDataAction = {
    action_id: randomUUID(),
    operation_id: randomUUID(),
    kind: 'sign_typed_data',
    profile: 'safe_owner_v1',
    profile_revision: '1',
    status: 'ready',
    chain_id: 'eip155:84532',
    chain_account_id: `eip155:84532:${account.address}`,
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
  const backend: WalletSigningProvider = {
    provider: 'offline-fixture',
    createAccount: vi.fn(async () => ({ ...account })),
    findAccount: vi.fn(async () => ({ ...account })),
    signTypedData: vi.fn(async (_account, stored) => {
      const { EIP712Domain: _domain, ...types } = stored.payload.types;
      return wallet.signTypedData(
        stored.payload.domain,
        types,
        stored.payload.message,
      );
    }),
  };
  const authorizeAttempt = vi.fn(async () => true);
  const options = { namespace: 'offline-test', journal, authorizeAttempt };
  const provider = createJournaledWalletProvider(backend, options);
  return {
    wallet,
    account,
    attemptId,
    action,
    backend,
    journal,
    authorizeAttempt,
    options,
    provider,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('journal-backed provider lifecycle', () => {
  it.each(['', 'https://example.test', 'UPPERCASE', undefined])(
    'requires an explicit safe namespace %s',
    (namespace) => {
      const { backend, options } = fixture();
      expect(() =>
        createJournaledWalletProvider(backend, {
          ...options,
          namespace: namespace as string,
        }),
      ).toThrow('wallet_provider_configuration');
    },
  );

  it('requires the journal and current-policy implementation at construction', () => {
    const { backend, options } = fixture();
    expect(() =>
      createJournaledWalletProvider(backend, {
        ...options,
        journal: undefined as never,
      }),
    ).toThrow('wallet_provider_configuration');
    expect(() =>
      createJournaledWalletProvider(backend, {
        ...options,
        authorizeAttempt: undefined as never,
      }),
    ).toThrow('wallet_provider_configuration');
    expect(() =>
      createJournaledWalletProvider(
        { ...backend, provider: undefined as never },
        options,
      ),
    ).toThrow('wallet_provider_configuration');
  });

  it('does not allocate an attempt for malformed account/attempt IDs', async () => {
    const { provider, backend, account, attemptId, journal } = fixture();
    await expect(
      provider.createAccount('../accounts', attemptId),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
    await expect(
      provider.createAccount(account.accountId, 'new-attempt-per-retry'),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
    expect(journal.records.size).toBe(0);
    expect(backend.createAccount).not.toHaveBeenCalled();
  });

  it('rejects account creation with a new attempt for a previously bound account resource', async () => {
    const { provider, backend, account, attemptId } = fixture();
    await provider.createAccount(account.accountId, attemptId);
    await expect(
      provider.createAccount(account.accountId, randomUUID()),
    ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
    expect(backend.createAccount).toHaveBeenCalledOnce();
  });

  it('rejects reuse of a provision attempt for signing', async () => {
    const { provider, backend, account, action, attemptId } = fixture();
    await provider.createAccount(account.accountId, attemptId);
    await expect(
      provider.signTypedData(account, action, attemptId),
    ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
    expect(backend.signTypedData).not.toHaveBeenCalled();
  });

  it('rechecks current authorization after waiting for a cached result', async () => {
    const { provider, backend, account, action, attemptId, authorizeAttempt } =
      fixture();
    await provider.signTypedData(account, action, attemptId);
    authorizeAttempt.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(
      provider.signTypedData(account, action, attemptId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(backend.signTypedData).toHaveBeenCalledOnce();
  });

  it('sanitizes a failed read-only account lookup', async () => {
    const { provider, backend, account, journal } = fixture();
    vi.mocked(backend.findAccount).mockRejectedValue(
      new Error('dummy sensitive provider credential'),
    );
    const error = await provider
      .findAccount(account.accountId)
      .catch((value) => value);
    expect(error).toMatchObject({
      code: 'wallet_provider_unavailable',
      outcome: 'not_dispatched',
    });
    expect(String(error)).not.toContain('credential');
    expect(error.cause).toBeUndefined();
    expect(journal.records.size).toBe(0);
  });

  it('replays a created account after wrapper restart without creating another account', async () => {
    const { backend, provider, options, account, attemptId, journal } =
      fixture();
    expect(await provider.createAccount(account.accountId, attemptId)).toEqual(
      account,
    );
    const restarted = createJournaledWalletProvider(backend, options);
    expect(await restarted.createAccount(account.accountId, attemptId)).toEqual(
      account,
    );
    expect(backend.createAccount).toHaveBeenCalledOnce();
    expect(journal.records.size).toBe(1);
  });

  it('persists and replays the verified signature with the same immutable attempt', async () => {
    const { provider, backend, account, action, attemptId, authorizeAttempt } =
      fixture();
    const signature = await provider.signTypedData(account, action, attemptId);
    expect(recoverAddress(action.payload_hash, signature)).toBe(
      account.address,
    );
    expect(await provider.signTypedData(account, action, attemptId)).toBe(
      signature,
    );
    expect(backend.signTypedData).toHaveBeenCalledOnce();
    expect(authorizeAttempt).toHaveBeenCalledTimes(4);
  });

  it('admits one of two concurrent identical calls and reports the other as pending', async () => {
    const { provider, backend, account, action, attemptId } = fixture();
    let finish!: (signature: string) => void;
    const completed = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const sign = vi.mocked(backend.signTypedData).getMockImplementation()!;
    vi.mocked(backend.signTypedData).mockImplementation(() => completed);
    const calls = [
      provider.signTypedData(account, action, attemptId),
      provider.signTypedData(account, action, attemptId),
    ];
    const pending = await Promise.race(
      calls.map((call) => call.catch((error) => error)),
    );
    expect(pending).toMatchObject({
      code: 'wallet_attempt_pending',
      outcome: 'unknown',
    });
    finish(await sign(account, action, attemptId));
    const outcomes = await Promise.allSettled(calls);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(backend.signTypedData).toHaveBeenCalledOnce();
  });

  it.each([
    'resource',
    'new-attempt',
    'plan',
    'binding',
    'capability',
    'expiry',
  ])('conflicts on changed %s after successful signing', async (change) => {
    const { provider, backend, account, action, attemptId } = fixture();
    await provider.signTypedData(account, action, attemptId);
    const altered = structuredClone(action);
    if (change === 'resource') altered.action_id = randomUUID();
    if (change === 'plan') altered.plan_revision = '2';
    if (change === 'binding') altered.binding_revision = '2';
    if (change === 'capability') altered.capability_revision = '2';
    if (change === 'expiry')
      altered.expires_at = new Date(Date.now() + 60000).toISOString();
    await expect(
      provider.signTypedData(
        account,
        altered,
        change === 'new-attempt' ? randomUUID() : attemptId,
      ),
    ).rejects.toMatchObject({
      code: 'wallet_attempt_conflict',
      outcome: 'not_dispatched',
    });
    expect(backend.signTypedData).toHaveBeenCalledOnce();
  });

  it('uses a deterministic fingerprint for reordered object properties', async () => {
    const { provider, backend, account, action, attemptId } = fixture();
    const signed = await provider.signTypedData(account, action, attemptId);
    action.payload.domain = {
      chainId: '84532',
      name: 'Offline provider journal fixture',
    };
    expect(await provider.signTypedData(account, action, attemptId)).toBe(
      signed,
    );
    expect(backend.signTypedData).toHaveBeenCalledOnce();
  });

  it('keeps namespace/backend identities separate', async () => {
    const { backend, options, account, attemptId } = fixture();
    const first = createJournaledWalletProvider(backend, options);
    const second = createJournaledWalletProvider(backend, {
      ...options,
      namespace: 'other-test-environment',
    });
    await first.createAccount(account.accountId, attemptId);
    await second.createAccount(account.accountId, attemptId);
    expect(backend.createAccount).toHaveBeenCalledTimes(2);
  });

  it('does not call the provider on a denied policy or policy-store outage', async () => {
    const { provider, backend, account, attemptId, authorizeAttempt, journal } =
      fixture();
    authorizeAttempt.mockResolvedValue(false);
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    authorizeAttempt.mockRejectedValue(
      new Error('dummy secret authority error'),
    );
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({ code: 'wallet_provider_unavailable' });
    expect(journal.records.size).toBe(0);
    expect(backend.createAccount).not.toHaveBeenCalled();
  });

  it('rechecks revocation after the journal wait and records a nondispatched failure', async () => {
    const { provider, backend, account, attemptId, authorizeAttempt, journal } =
      fixture();
    authorizeAttempt.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_authorization_denied',
      outcome: 'not_dispatched',
    });
    expect([...journal.records.values()][0]).toMatchObject({
      state: 'failed',
      failure: {
        code: 'wallet_authorization_denied',
        outcome: 'not_dispatched',
      },
    });
    expect(backend.createAccount).not.toHaveBeenCalled();
  });

  it('denies cached signature retrieval when current authorization is revoked', async () => {
    const { provider, backend, account, action, attemptId, authorizeAttempt } =
      fixture();
    await provider.signTypedData(account, action, attemptId);
    authorizeAttempt.mockResolvedValue(false);
    await expect(
      provider.signTypedData(account, action, attemptId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(backend.signTypedData).toHaveBeenCalledOnce();
  });

  it('does not dispatch when a claim commit response is lost', async () => {
    const { provider, backend, account, attemptId, journal } = fixture();
    const claim = journal.claim.bind(journal);
    vi.spyOn(journal, 'claim').mockImplementation(async (request) => {
      await claim(request);
      throw new Error('dummy lost claim');
    });
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_attempt_unavailable',
      outcome: 'unknown',
    });
    vi.mocked(journal.claim).mockRestore();
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({ code: 'wallet_attempt_pending' });
    expect(backend.createAccount).not.toHaveBeenCalled();
  });

  it('recovers a committed result after losing its commit response without another dispatch', async () => {
    const { provider, backend, account, action, attemptId, journal } =
      fixture();
    const complete = journal.complete.bind(journal);
    vi.spyOn(journal, 'complete').mockImplementation(async (...args) => {
      await complete(...args);
      throw new Error('dummy lost result response');
    });
    await expect(
      provider.signTypedData(account, action, attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_attempt_unavailable',
      outcome: 'unknown',
    });
    expect(
      recoverAddress(
        action.payload_hash,
        await provider.signTypedData(account, action, attemptId),
      ),
    ).toBe(account.address);
    expect(backend.signTypedData).toHaveBeenCalledOnce();
  });

  it('does not repeat a dispatched mutation if result persistence failed before commit', async () => {
    const { provider, backend, account, attemptId, journal } = fixture();
    vi.spyOn(journal, 'complete').mockRejectedValue(
      new Error('dummy unavailable result storage'),
    );
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_attempt_unavailable',
      outcome: 'unknown',
    });
    expect([...journal.records.values()][0].state).toBe('dispatch');
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({ code: 'wallet_attempt_pending' });
    expect(backend.createAccount).toHaveBeenCalledOnce();
  });

  it('keeps a crashed dispatch unknown after lease expiry and wrapper restart', async () => {
    const { backend, account, attemptId, journal, options, provider } =
      fixture();
    vi.spyOn(journal, 'complete').mockRejectedValue(new Error('dummy crash'));
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    const record = [...journal.records.values()][0];
    record.expiresAt = 0;
    const restarted = createJournaledWalletProvider(backend, options);
    await expect(
      restarted.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_provider_unavailable',
      outcome: 'unknown',
    });
    expect(record.state).toBe('unknown');
    expect(backend.createAccount).toHaveBeenCalledOnce();
  });

  it.each(['rejected', 'not_dispatched', 'unknown'] as const)(
    'persists the sanitized provider failure %s without replaying',
    async (outcome) => {
      const { provider, backend, account, attemptId, journal } = fixture();
      vi.mocked(backend.createAccount).mockRejectedValue(
        new WalletProviderError('wallet_provider_rejected', outcome),
      );
      await expect(
        provider.createAccount(account.accountId, attemptId),
      ).rejects.toMatchObject({ code: 'wallet_provider_rejected', outcome });
      await expect(
        provider.createAccount(account.accountId, attemptId),
      ).rejects.toMatchObject({ outcome });
      expect(backend.createAccount).toHaveBeenCalledOnce();
      expect([...journal.records.values()][0].failure).toEqual({
        code: 'wallet_provider_rejected',
        outcome,
      });
    },
  );

  it('sanitizes generic provider exceptions and an unavailable failure journal', async () => {
    const { provider, backend, account, attemptId, journal } = fixture();
    vi.mocked(backend.createAccount).mockRejectedValue(
      new Error('dummy-sensitive-headers-and-password'),
    );
    vi.spyOn(journal, 'fail').mockRejectedValue(
      new Error('dummy-sensitive-sql'),
    );
    const error = await provider
      .createAccount(account.accountId, attemptId)
      .catch((value) => value);
    expect(error).toMatchObject({
      code: 'wallet_attempt_unavailable',
      outcome: 'unknown',
    });
    expect(String(error)).not.toMatch(/sensitive|password|sql/);
    expect(error.cause).toBeUndefined();
    expect(backend.createAccount).toHaveBeenCalledOnce();
  });

  it('rejects a mismatched claim binding before provider effects', async () => {
    const { provider, backend, account, attemptId, journal } = fixture();
    vi.spyOn(journal, 'claim').mockImplementation(async (request) => ({
      ...request,
      requestHash: 'wrong',
      state: 'dispatch',
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 30000).toISOString(),
    }));
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({ code: 'wallet_attempt_unavailable' });
    expect(backend.createAccount).not.toHaveBeenCalled();
  });

  it('verifies the provider signature independently before persistence', async () => {
    const { provider, backend, account, action, attemptId, journal } =
      fixture();
    vi.mocked(backend.signTypedData).mockResolvedValue(
      Wallet.createRandom().signingKey.sign(action.payload_hash).serialized,
    );
    await expect(
      provider.signTypedData(account, action, attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_provider_response',
      outcome: 'unknown',
    });
    expect([...journal.records.values()][0].state).toBe('unknown');
  });

  it('rejects corrupt persisted signatures without another signing call', async () => {
    const { provider, backend, account, action, attemptId, journal } =
      fixture();
    await provider.signTypedData(account, action, attemptId);
    [...journal.records.values()][0].result = {
      kind: 'sign_typed_data',
      signature: 'invalid',
    };
    await expect(
      provider.signTypedData(account, action, attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_provider_response',
      outcome: 'unknown',
    });
    expect(backend.signTypedData).toHaveBeenCalledOnce();
  });

  it('rejects wrong account identities and zero addresses before persisting results', async () => {
    for (const response of [
      { accountId: randomUUID(), address: Wallet.createRandom().address },
      { accountId: 'same', address: '0x' + '0'.repeat(40) },
    ]) {
      const { provider, backend, account, attemptId } = fixture();
      vi.mocked(backend.createAccount).mockResolvedValue({
        ...response,
        accountId:
          response.accountId === 'same'
            ? account.accountId
            : response.accountId,
      });
      await expect(
        provider.createAccount(account.accountId, attemptId),
      ).rejects.toMatchObject({
        code: 'wallet_provider_response',
        outcome: 'unknown',
      });
    }
  });

  it('snapshots the action before asynchronous policy/storage work', async () => {
    const { provider, account, action, attemptId } = fixture();
    const digest = action.payload_hash;
    const pending = provider.signTypedData(account, action, attemptId);
    action.payload.message.amount = '2';
    expect(recoverAddress(digest, await pending)).toBe(account.address);
  });

  it('does not dispatch after a lease expires during the second authorization check', async () => {
    const { provider, backend, account, attemptId, authorizeAttempt, journal } =
      fixture();
    authorizeAttempt
      .mockResolvedValueOnce(true)
      .mockImplementation(async () => {
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);
        return true;
      });
    vi.spyOn(journal, 'fail').mockResolvedValue(undefined);
    await expect(
      provider.createAccount(account.accountId, attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_attempt_unavailable',
      outcome: 'unknown',
    });
    expect(backend.createAccount).not.toHaveBeenCalled();
  });

  it('does not sign an action that expires while waiting for admission', async () => {
    const { provider, backend, account, action, attemptId, journal } =
      fixture();
    action.expires_at = new Date(Date.now() + 1000).toISOString();
    const claim = journal.claim.bind(journal);
    vi.spyOn(journal, 'claim').mockImplementation(async (request) => {
      const result = await claim(request);
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse(action.expires_at));
      return result;
    });
    // Let the fixture record the expired action's nondispatched terminal failure.
    vi.spyOn(journal, 'fail').mockResolvedValue(undefined);
    await expect(
      provider.signTypedData(account, action, attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_provider_input',
      outcome: 'not_dispatched',
    });
    expect(backend.signTypedData).not.toHaveBeenCalled();
  });

  it.each(['digest', 'chain', 'number', 'expired', 'profile'])(
    'rejects invalid action %s before journal/provider effects',
    async (change) => {
      const { provider, backend, account, action, attemptId, journal } =
        fixture();
      if (change === 'digest') action.payload_hash = '0x' + '2'.repeat(64);
      if (change === 'chain') action.chain_id = 'eip155:8453';
      if (change === 'number') action.payload.message.amount = 1 as never;
      if (change === 'expired') action.expires_at = new Date(0).toISOString();
      if (change === 'profile') action.profile = 'unsupported' as never;
      await expect(
        provider.signTypedData(account, action, attemptId),
      ).rejects.toMatchObject({ code: 'wallet_provider_input' });
      expect(journal.records.size).toBe(0);
      expect(backend.signTypedData).not.toHaveBeenCalled();
    },
  );

  it('keeps account recovery read-only without creating or completing an attempt', async () => {
    const { provider, backend, account, journal } = fixture();
    expect(await provider.findAccount(account.accountId)).toEqual(account);
    expect(backend.findAccount).toHaveBeenCalledOnce();
    expect(backend.createAccount).not.toHaveBeenCalled();
    expect(journal.records.size).toBe(0);
  });
});
