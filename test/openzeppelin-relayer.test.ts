import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  concat,
  keccak256,
  recoverAddress,
  TypedDataEncoder,
  Wallet,
} from 'ethers';
import {
  createOpenZeppelinRelayerExecutor,
  createOpenZeppelinRelayerWalletProvider,
  hashRelayerTransaction,
  RelayerExecutionService,
  type RelayerExecutionAction,
  type RelayerAttemptJournal,
  type RelayerExecutionAuthorityRecord,
} from '../src/providers/openzeppelin-relayer.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import type { TypedDataAction } from '../src/domain/signing.js';
import type {
  WalletAttemptRequest,
  WalletAttemptClaim,
} from '../src/domain/attempt-journal.js';
import { TestJournal } from './helpers/journal.js';

class RelayerTestJournal extends TestJournal implements RelayerAttemptJournal {
  async read(
    request: WalletAttemptRequest,
  ): Promise<WalletAttemptClaim | null> {
    const record = this.records.get(
      [request.namespace, request.provider, request.attemptId].join(':'),
    );
    if (!record) return null;
    const identity = {
      attemptId: record.request.attemptId,
      resourceKey: record.request.resourceKey,
      requestHash: record.request.requestHash,
    };
    if (record.state === 'succeeded')
      return {
        ...identity,
        state: 'succeeded',
        result: structuredClone(record.result!),
      };
    return { ...identity, state: 'pending' };
  }
}

/** Independent v1.8.0 HTTP contract fixture with real EIP-712 cryptography, not a Relayer daemon. */
function fixture() {
  const wallet = Wallet.createRandom();
  const account = { accountId: randomUUID(), address: wallet.address };
  const binding = {
    relayerId: 'owner-relayer',
    signerId: 'owner-signer',
    address: wallet.address,
    bindingRevision: '1',
  };
  const connection = {
    url: 'https://relayer.example.test',
    apiKey: 'offline-test-bearer-token',
    resolveAccount: vi.fn(async () => ({ ...binding })),
  };
  const journal = new RelayerTestJournal();
  const authorizeAttempt = vi.fn(async () => true);
  const authorizeStatus = vi.fn(async () => true);
  const options = {
    namespace: 'relayer-offline-test',
    journal,
    authorizeAttempt,
    authorizeStatus,
  };
  const transactionId = randomUUID();
  const metadata = {
    id: binding.relayerId,
    signer_id: binding.signerId,
    address: wallet.address,
    network: 'base-sepolia',
    network_type: 'evm',
    paused: false,
    system_disabled: false,
    policies: { gas_limit_estimation: false, gas_price_cap: 1000000000 },
  };
  const network = {
    id: 'evm:base-sepolia',
    name: 'base-sepolia',
    network_type: 'evm',
    chain_id: 84532,
    is_testnet: true,
  };
  const transaction = {
    to: Wallet.createRandom().address,
    value: ((1n << 256n) - 1n).toString(),
    data: '0x1234',
    gasLimit: '50000',
    maxFeePerGas: '1000000000',
    maxPriorityFeePerGas: '1000000',
  };
  const action: RelayerExecutionAction = {
    actionId: randomUUID(),
    operationId: randomUUID(),
    kind: 'relay_transaction',
    profile: 'oz_relayer_evm_v1',
    profileRevision: '1',
    status: 'ready',
    chainId: 'eip155:84532',
    chainAccountId: `eip155:84532:${wallet.address}`,
    bindingRevision: '1',
    capabilityRevision: '1',
    planRevision: '1',
    planHash: '0x' + '1'.repeat(64),
    payloadHash: hashRelayerTransaction(transaction),
    expiresAt: new Date(Date.now() + 120000).toISOString(),
    transaction,
  };
  const attemptId = randomUUID();
  const result = {
    id: transactionId,
    relayer_id: binding.relayerId,
    from: wallet.address,
    to: transaction.to,
    value: '0x' + BigInt(transaction.value).toString(16),
    data: transaction.data,
    gas_limit: Number(transaction.gasLimit),
    max_fee_per_gas: transaction.maxFeePerGas,
    status: 'pending',
    hash: null,
  };
  const mutations: { path: string; body: Record<string, unknown> }[] = [];
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(connection.url);
    expect(init?.redirect).toBe('error');
    expect(init?.credentials).toBe('omit');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${connection.apiKey}`,
    );
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      mutations.push({ path: url.pathname, body });
      if (url.pathname.endsWith('/sign-typed-data')) {
        const digest = keccak256(
          concat(['0x1901', body.domain_separator, body.hash_struct_message]),
        );
        const signature = wallet.signingKey.sign(digest);
        return Response.json({
          success: true,
          data: {
            r: signature.r.slice(2),
            s: signature.s.slice(2),
            v: signature.v,
            sig: signature.serialized.slice(2),
          },
        });
      }
      expect(url.pathname).toBe(
        `/api/v1/relayers/${binding.relayerId}/transactions`,
      );
      return Response.json({ success: true, data: result });
    }
    if (url.pathname.includes('/networks/'))
      return Response.json({ success: true, data: network });
    if (url.pathname.includes('/transactions/'))
      return Response.json({ success: true, data: result });
    return Response.json({ success: true, data: metadata });
  });
  const provider = createOpenZeppelinRelayerWalletProvider(
    connection,
    options,
    request,
  );
  const executor = createOpenZeppelinRelayerExecutor(
    connection,
    options,
    request,
  );
  const authorityRecord: RelayerExecutionAuthorityRecord = {
    sessionSubject: 'owner',
    ownerSubject: 'owner',
    currentUserStatus: 'ID VERIFIED',
    accountId: account.accountId,
    attemptId,
    account,
    bindingRevision: '1',
    capabilityRevision: '1',
    action,
  };
  const authority = {
    execution: vi.fn(async () => structuredClone(authorityRecord)),
  };
  const service = new RelayerExecutionService(authority, executor);
  const context = {
    principal: {
      issuer: 'https://identity.example.test',
      subject: 'owner',
      clientId: 'client',
      scopes: ['wallet:sign'],
    },
    idempotencyKey: randomUUID(),
  };
  function typedAction(): TypedDataAction {
    const payload = {
      domain: { name: 'Offline Relayer proof', chainId: '84532' },
      types: { Proof: [{ name: 'amount', type: 'uint256' }] },
      primaryType: 'Proof',
      message: { amount: transaction.value },
    };
    return {
      action_id: randomUUID(),
      operation_id: randomUUID(),
      kind: 'sign_typed_data',
      profile: 'evm_eoa_v1',
      profile_revision: '1',
      status: 'ready',
      chain_id: 'eip155:84532',
      chain_account_id: action.chainAccountId,
      binding_revision: '1',
      capability_revision: '1',
      plan_revision: '1',
      plan_hash: action.planHash,
      dependencies: [],
      expires_at: action.expiresAt,
      payload_hash: TypedDataEncoder.hash(
        payload.domain,
        payload.types,
        payload.message,
      ),
      payload,
    };
  }
  return {
    wallet,
    account,
    binding,
    connection,
    journal,
    authorizeAttempt,
    authorizeStatus,
    options,
    transactionId,
    metadata,
    network,
    transaction,
    action,
    attemptId,
    result,
    mutations,
    request,
    provider,
    executor,
    authorityRecord,
    authority,
    service,
    context,
    typedAction,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('OpenZeppelin Relayer v1.8.0 signing boundary', () => {
  it('binds an existing configured account read-only and signs the approved digest with upstream hash fields', async () => {
    const f = fixture();
    expect(
      await f.provider.createAccount(f.account.accountId, randomUUID()),
    ).toEqual(f.account);
    expect(f.mutations).toHaveLength(0);
    const action = f.typedAction();
    const attemptId = randomUUID();
    const signature = await f.provider.signTypedData(
      f.account,
      action,
      attemptId,
    );
    expect(recoverAddress(action.payload_hash, signature)).toBe(
      f.account.address,
    );
    expect(f.mutations).toHaveLength(1);
    expect(Object.keys(f.mutations[0].body).sort()).toEqual([
      'domain_separator',
      'hash_struct_message',
    ]);
    expect(await f.provider.signTypedData(f.account, action, attemptId)).toBe(
      signature,
    );
    expect(f.mutations).toHaveLength(1);
  });

  it.each(['kyc', 'owner', 'grant'])(
    'denies %s before provider requests',
    async (reason) => {
      const f = fixture();
      const action = f.typedAction();
      const authority = {
        provision: async () => null,
        sign: async () =>
          reason === 'grant'
            ? null
            : {
                sessionSubject: 'owner',
                ownerSubject: reason === 'owner' ? 'other' : 'owner',
                currentUserStatus: reason === 'kyc' ? 'PENDING' : 'ID VERIFIED',
                accountId: f.account.accountId,
                attemptId: f.attemptId,
                account: f.account,
                chainAccountId: action.chain_account_id,
                bindingRevision: '1',
                capabilityRevision: '1',
                action,
              },
      };
      await expect(
        new EmbeddedWalletService(authority, f.provider).sign(
          f.context,
          action.action_id,
        ),
      ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
      expect(f.request).not.toHaveBeenCalled();
    },
  );

  it('rechecks current policy after remote metadata reads', async () => {
    const f = fixture();
    f.authorizeAttempt
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    await expect(
      f.provider.signTypedData(f.account, f.typedAction(), f.attemptId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(f.mutations).toHaveLength(0);
  });

  it('rejects a signature from another key and keeps its outcome unknown', async () => {
    const f = fixture();
    const action = f.typedAction();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (url, init) =>
      init?.method === 'POST'
        ? Response.json({
            success: true,
            data: {
              sig: Wallet.createRandom()
                .signingKey.sign(action.payload_hash)
                .serialized.slice(2),
            },
          })
        : original(url, init),
    );
    await expect(
      f.provider.signTypedData(f.account, action, f.attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_provider_response',
      outcome: 'unknown',
    });
  });
});

describe('OpenZeppelin Relayer host-owned transaction authority', () => {
  it('submits once, preserves a uint256 value, leaves nonce selection upstream and replays acceptance after restart', async () => {
    const f = fixture();
    expect(await f.service.submit(f.context, f.action.actionId)).toEqual({
      transactionId: f.transactionId,
    });
    expect(f.authority.execution).toHaveBeenCalledWith(
      f.context,
      f.action.actionId,
      'submit',
    );
    expect(f.mutations).toHaveLength(1);
    expect(f.mutations[0].body).toEqual({
      to: f.transaction.to,
      value: '0x' + BigInt(f.transaction.value).toString(16),
      data: f.transaction.data,
      gas_limit: 50000,
      max_fee_per_gas: 1000000000,
      max_priority_fee_per_gas: 1000000,
      valid_until: f.action.expiresAt,
    });
    const restarted = createOpenZeppelinRelayerExecutor(
      f.connection,
      f.options,
      f.request,
    );
    expect(await restarted.submit(f.account, f.action, f.attemptId)).toEqual({
      transactionId: f.transactionId,
    });
    expect(f.mutations).toHaveLength(1);
    const before = f.journal.records.size;
    expect(
      await f.service.status(f.context, f.action.actionId, f.transactionId),
    ).toEqual({ transactionId: f.transactionId, status: 'pending' });
    expect(f.journal.records.size).toBe(before);
    expect(f.authority.execution).toHaveBeenLastCalledWith(
      f.context,
      f.action.actionId,
      'status',
    );
  });

  it.each(['owner', 'kyc', 'action', 'binding', 'capability'])(
    'denies altered host %s before any remote call',
    async (change) => {
      const f = fixture();
      if (change === 'owner') f.authorityRecord.ownerSubject = 'other';
      if (change === 'kyc') f.authorityRecord.currentUserStatus = 'PENDING';
      if (change === 'action') f.authorityRecord.action.actionId = randomUUID();
      if (change === 'binding') f.authorityRecord.bindingRevision = '2';
      if (change === 'capability') f.authorityRecord.capabilityRevision = '2';
      await expect(
        f.service.submit(
          f.context,
          change === 'action' ? randomUUID() : f.action.actionId,
        ),
      ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
      expect(f.request).not.toHaveBeenCalled();
    },
  );

  it.each([
    'chain',
    'expired',
    'hash',
    'nonce',
    'number',
    'fee-overflow',
    'calldata',
  ])(
    'rejects invalid %s before journal or provider dispatch',
    async (change) => {
      const f = fixture();
      if (change === 'chain') f.action.chainId = 'eip155:1' as never;
      if (change === 'expired') f.action.expiresAt = new Date(0).toISOString();
      if (change === 'hash') f.action.payloadHash = '0x' + '2'.repeat(64);
      if (change === 'nonce')
        (f.action.transaction as unknown as Record<string, unknown>).nonce =
          '1';
      if (change === 'number') f.action.transaction.value = 1 as never;
      if (change === 'fee-overflow')
        f.action.transaction.maxFeePerGas = '9007199254740992';
      if (change === 'calldata') f.action.transaction.data = '0x1';
      await expect(
        f.executor.submit(f.account, f.action, f.attemptId),
      ).rejects.toMatchObject({ code: 'wallet_provider_input' });
      expect(f.journal.records.size).toBe(0);
      expect(f.request).not.toHaveBeenCalled();
    },
  );

  it.each([
    'signer',
    'address',
    'network',
    'paused',
    'disabled',
    'chain',
    'gas-estimation',
    'gas-cap',
  ])('denies unsafe Relayer %s configuration before a POST', async (change) => {
    const f = fixture();
    if (change === 'signer') f.metadata.signer_id = 'other';
    if (change === 'address')
      f.metadata.address = Wallet.createRandom().address;
    if (change === 'network') f.metadata.network = 'base';
    if (change === 'paused') f.metadata.paused = true;
    if (change === 'disabled') f.metadata.system_disabled = true;
    if (change === 'chain') f.network.chain_id = 8453;
    if (change === 'gas-estimation')
      f.metadata.policies.gas_limit_estimation = true;
    if (change === 'gas-cap') f.metadata.policies.gas_price_cap = 2000000000;
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toBeDefined();
    expect(f.mutations).toHaveLength(0);
  });

  it('denies cached acceptance and status reads after current authority revocation', async () => {
    const f = fixture();
    await f.executor.submit(f.account, f.action, f.attemptId);
    f.authorizeAttempt.mockResolvedValue(false);
    f.authorizeStatus.mockResolvedValue(false);
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    await expect(
      f.executor.status(f.account, f.action, f.attemptId, f.transactionId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(f.mutations).toHaveLength(1);
  });

  it('never retries a POST after a lost provider response, including after wrapper restart', async () => {
    const f = fixture();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (url, init) => {
      const response = await original(url, init);
      if (init?.method === 'POST')
        throw new Error('offline lost response with dummy sensitive data');
      return response;
    });
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_provider_unavailable',
      outcome: 'unknown',
    });
    const restarted = createOpenZeppelinRelayerExecutor(
      f.connection,
      f.options,
      f.request,
    );
    await expect(
      restarted.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.mutations).toHaveLength(1);
  });

  it('keeps a lost result commit pending and recovers committed acceptance without another POST', async () => {
    const f = fixture();
    const complete = f.journal.complete.bind(f.journal);
    vi.spyOn(f.journal, 'complete').mockImplementationOnce(async (...args) => {
      await complete(...args);
      throw new Error('offline lost commit response');
    });
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_attempt_unavailable',
      outcome: 'unknown',
    });
    expect(await f.executor.submit(f.account, f.action, f.attemptId)).toEqual({
      transactionId: f.transactionId,
    });
    expect(f.mutations).toHaveLength(1);
  });

  it.each([
    'relayer',
    'from',
    'to',
    'value',
    'data',
    'gas',
    'fee',
    'id',
    'hash',
  ])(
    'rejects unbound response %s after dispatch as unknown',
    async (change) => {
      const f = fixture();
      if (change === 'relayer') f.result.relayer_id = 'other';
      if (change === 'from') f.result.from = Wallet.createRandom().address;
      if (change === 'to') f.result.to = Wallet.createRandom().address;
      if (change === 'value') f.result.value = '0x0';
      if (change === 'data') f.result.data = '0xab';
      if (change === 'gas') f.result.gas_limit = 50001;
      if (change === 'fee') f.result.max_fee_per_gas = '2000000000';
      if (change === 'id') f.result.id = 'invalid' as never;
      if (change === 'hash') f.result.hash = 'fake' as never;
      await expect(
        f.executor.submit(f.account, f.action, f.attemptId),
      ).rejects.toMatchObject({
        code: 'wallet_provider_response',
        outcome: 'unknown',
      });
    },
  );

  it('binds status to the stored provider ID and rejects cross-relayer data even on a valid URL', async () => {
    const f = fixture();
    await f.executor.submit(f.account, f.action, f.attemptId);
    const before = f.request.mock.calls.length;
    await expect(
      f.executor.status(f.account, f.action, f.attemptId, randomUUID()),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(f.request).toHaveBeenCalledTimes(before);
    f.result.relayer_id = 'other';
    await expect(
      f.executor.status(f.account, f.action, f.attemptId, f.transactionId),
    ).rejects.toMatchObject({ code: 'wallet_provider_response' });
    expect(f.mutations).toHaveLength(1);
  });

  it('allows read-only status after dispatch expiry but denies any new submission', async () => {
    const f = fixture();
    await f.executor.submit(f.account, f.action, f.attemptId);
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(f.action.expiresAt) + 1);
    expect(
      await f.executor.status(
        f.account,
        f.action,
        f.attemptId,
        f.transactionId,
      ),
    ).toMatchObject({ status: 'pending' });
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
    expect(f.mutations).toHaveLength(1);
  });

  it('serializes concurrent dispatch and conflicts on changed immutable plans', async () => {
    const f = fixture();
    const outcomes = await Promise.allSettled([
      f.executor.submit(f.account, f.action, f.attemptId),
      f.executor.submit(f.account, f.action, f.attemptId),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(f.mutations).toHaveLength(1);
    f.action.planRevision = '2';
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
    expect(f.mutations).toHaveLength(1);
  });
});

describe('Relayer HTTP configuration and failure handling', () => {
  it('rejects corrupt stored acceptance without another provider call', async () => {
    const f = fixture();
    await f.executor.submit(f.account, f.action, f.attemptId);
    [...f.journal.records.values()][0].result = null as never;
    const count = f.request.mock.calls.length;
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({
      code: 'wallet_provider_response',
      outcome: 'unknown',
    });
    expect(f.request).toHaveBeenCalledTimes(count);
  });

  it('rejects credentials embedded in the configured origin', () => {
    const f = fixture();
    const url = new URL(f.connection.url);
    url.username = 'fixture-user';
    url.password = 'fixture-password';
    expect(() =>
      createOpenZeppelinRelayerExecutor(
        { ...f.connection, url: url.href },
        f.options,
        f.request,
      ),
    ).toThrow('wallet_provider_configuration');
  });

  it('allows authorized status while the relayer is paused without admitting a new submission', async () => {
    const f = fixture();
    await f.executor.submit(f.account, f.action, f.attemptId);
    f.metadata.paused = true;
    expect(
      await f.executor.status(
        f.account,
        f.action,
        f.attemptId,
        f.transactionId,
      ),
    ).toMatchObject({ status: 'pending' });
    const next = { ...f.action, actionId: randomUUID() };
    await expect(
      f.executor.submit(f.account, next, randomUUID()),
    ).rejects.toMatchObject({ code: 'wallet_provider_response' });
    expect(f.mutations).toHaveLength(1);
  });

  it('snapshots approved input before asynchronous policy and metadata work', async () => {
    const f = fixture();
    const target = f.transaction.to;
    const call = f.executor.submit(f.account, f.action, f.attemptId);
    f.action.transaction.to = Wallet.createRandom().address;
    await call;
    expect(f.mutations[0].body.to).toBe(target);
  });

  it('denies a binding that changes during remote metadata reads', async () => {
    const f = fixture();
    f.connection.resolveAccount
      .mockResolvedValueOnce({ ...f.binding })
      .mockResolvedValue({ ...f.binding, bindingRevision: '2' });
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(f.mutations).toHaveLength(0);
  });

  it('does not repeat dispatch when result storage fails before committing', async () => {
    const f = fixture();
    vi.spyOn(f.journal, 'complete').mockRejectedValue(
      new Error('offline journal outage'),
    );
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({ code: 'wallet_attempt_unavailable' });
    await expect(
      f.executor.submit(f.account, f.action, f.attemptId),
    ).rejects.toMatchObject({ code: 'wallet_attempt_pending' });
    expect(f.mutations).toHaveLength(1);
  });

  it('requires separate status authorization and read-only journal support', () => {
    const f = fixture();
    expect(() =>
      createOpenZeppelinRelayerExecutor(
        f.connection,
        { ...f.options, authorizeStatus: undefined as never },
        f.request,
      ),
    ).toThrow('wallet_provider_configuration');
    expect(() =>
      createOpenZeppelinRelayerExecutor(
        f.connection,
        { ...f.options, journal: new TestJournal() as never },
        f.request,
      ),
    ).toThrow('wallet_provider_configuration');
  });

  it('denies status when the bound record is absent and sanitizes journal read failures', async () => {
    const f = fixture();
    await expect(
      f.executor.status(f.account, f.action, f.attemptId, f.transactionId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(f.request).not.toHaveBeenCalled();
    vi.spyOn(f.journal, 'read').mockRejectedValue(
      new Error('dummy private storage information'),
    );
    const error = await f.executor
      .status(f.account, f.action, f.attemptId, f.transactionId)
      .catch((value) => value);
    expect(error.code).toBe('wallet_attempt_unavailable');
    expect(String(error)).not.toMatch(/dummy|private|storage/);
  });

  it.each([
    'http://relayer.example.test',
    'https://relayer.example.test/path',
    'https://relayer.example.test/?token=bad',
    'https://relayer.example.test/#bad',
  ])('rejects unsafe origin %s', (url) => {
    const f = fixture();
    expect(() =>
      createOpenZeppelinRelayerExecutor(
        { ...f.connection, url },
        f.options,
        f.request,
      ),
    ).toThrow('wallet_provider_configuration');
  });

  it.each([400, 401, 429, 500])(
    'treats POST HTTP %s as uncertain and never repeats it',
    async (status) => {
      const f = fixture();
      const original = f.request.getMockImplementation()!;
      f.request.mockImplementation(async (url, init) =>
        init?.method === 'POST'
          ? new Response('dummy upstream error', { status })
          : original(url, init),
      );
      await expect(
        f.executor.submit(f.account, f.action, f.attemptId),
      ).rejects.toMatchObject({ outcome: 'unknown' });
      const count = f.request.mock.calls.length;
      await expect(
        f.executor.submit(f.account, f.action, f.attemptId),
      ).rejects.toMatchObject({ outcome: 'unknown' });
      expect(f.request).toHaveBeenCalledTimes(count);
    },
  );

  it.each(['malformed', 'oversized', 'failure-envelope'])(
    'bounds and sanitizes a %s response',
    async (mode) => {
      const f = fixture();
      f.request.mockResolvedValue(
        mode === 'malformed'
          ? new Response('dummy invalid JSON')
          : mode === 'oversized'
            ? new Response('x'.repeat(65537))
            : Response.json({
                success: false,
                error: 'dummy sensitive upstream message',
              }),
      );
      const error = await f.executor
        .submit(f.account, f.action, f.attemptId)
        .catch((x) => x);
      expect(String(error)).not.toMatch(/dummy|sensitive|upstream/);
      expect(error.cause).toBeUndefined();
      expect(f.mutations).toHaveLength(0);
    },
  );
});
