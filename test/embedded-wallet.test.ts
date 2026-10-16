import { generateKeyPairSync, verify, createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Wallet, TypedDataEncoder, recoverAddress, Signature } from 'ethers';
import { createCdpWalletProvider } from '../src/providers/cdp.js';
import {
  EmbeddedWalletService,
  type EmbeddedWalletAuthority,
  type SigningAuthority,
} from '../src/domain/embedded-wallet.js';
import type { TypedDataAction } from '../src/domain/signing.js';

const accountId = '10000000-0000-4000-8000-000000000001';
const attemptId = '10000000-0000-4000-8000-000000000002';
const actionId = '10000000-0000-4000-8000-000000000003';
const context = {
  principal: {
    issuer: 'https://identity.example.test',
    subject: 'owner',
    clientId: 'provider-a',
    scopes: ['wallet:provision', 'wallet:sign'],
  },
  idempotencyKey: attemptId,
};

// Ephemeral unfunded keys; no live credentials, wallet balances or network calls.
const signer = Wallet.createRandom();
const apiKeys = generateKeyPairSync('ed25519');
const apiJwk = apiKeys.privateKey.export({ format: 'jwk' });
const walletKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const environment = {
  WALLET_SERVICE_MODE: 'provider',
  WALLET_BACKEND: 'cdp',
  WALLET_CDP_API_KEY_ID: 'test-key-id',
  WALLET_CDP_API_KEY_SECRET: Buffer.concat([
    Buffer.from(apiJwk.d!, 'base64url'),
    Buffer.from(apiJwk.x!, 'base64url'),
  ]).toString('base64'),
  WALLET_CDP_WALLET_SECRET: walletKeys.privateKey
    .export({ format: 'der', type: 'pkcs8' })
    .toString('base64'),
};
const account = { accountId, address: signer.address };
const remoteAccount = {
  name: 'mw-10000000000040008000000000000001',
  address: signer.address,
};

function action(): TypedDataAction {
  const payload = {
    domain: {
      name: 'MoovhaWalletBackendProof',
      version: '1',
      chainId: '84532',
    },
    types: { Proof: [{ name: 'challenge', type: 'string' }] },
    primaryType: 'Proof',
    message: { challenge: 'unfunded-local-lifecycle-proof' },
  };
  return {
    action_id: actionId,
    operation_id: attemptId,
    kind: 'sign_typed_data',
    profile: 'evm_eoa_v1',
    profile_revision: '1',
    status: 'ready',
    chain_id: 'eip155:84532',
    chain_account_id: `eip155:84532:${signer.address}`,
    binding_revision: '1',
    capability_revision: '1',
    plan_revision: '1',
    plan_hash: '0x' + '1'.repeat(64),
    dependencies: [],
    expires_at: new Date(Date.now() + 60000).toISOString(),
    payload,
    payload_hash: TypedDataEncoder.hash(
      payload.domain,
      payload.types,
      payload.message,
    ),
  };
}

function providerFixture() {
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (String(_url).endsWith('/sign/typed-data')) {
      const body = JSON.parse(String(init?.body));
      const { EIP712Domain: _domain, ...types } = body.types;
      return Response.json({
        signature: await signer.signTypedData(body.domain, types, body.message),
      });
    }
    return Response.json(remoteAccount, {
      status: init?.method === 'POST' ? 201 : 200,
    });
  });
  return { request, provider: createCdpWalletProvider(environment, request) };
}

function authorityFixture() {
  const value: SigningAuthority = {
    sessionSubject: 'owner',
    ownerSubject: 'owner',
    currentUserStatus: 'ID VERIFIED',
    accountId,
    attemptId,
    account,
    chainAccountId: `eip155:84532:${signer.address}`,
    bindingRevision: '1',
    capabilityRevision: '1',
    action: action(),
  };
  const authority: EmbeddedWalletAuthority = {
    provision: vi.fn(async () => value),
    sign: vi.fn(async () => value),
  };
  return { authority, value };
}

afterEach(() => vi.restoreAllMocks());

describe('embedded wallet lifecycle behind Moovha authority', () => {
  it('creates an opaque named account, recovers it read-only and verifies an exact signature', async () => {
    const { provider, request } = providerFixture();
    const { authority, value } = authorityFixture();
    const service = new EmbeddedWalletService(authority, provider);
    expect(await service.provision(context, accountId)).toEqual(account);
    expect(await provider.findAccount(accountId)).toEqual(account);
    const signature = await service.sign(context, actionId);
    expect(recoverAddress(value.action.payload_hash, signature)).toBe(
      signer.address,
    );
    expect(request.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'GET',
      'GET',
      'POST',
    ]);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      name: remoteAccount.name,
    });
    // Vendor contract: 2–36 alphanumeric/hyphen characters. A UUID prefix
    // must not make otherwise valid account IDs impossible to provision.
    expect(remoteAccount.name).toMatch(
      /^[A-Za-z0-9][A-Za-z0-9-]{0,34}[A-Za-z0-9]$/,
    );
    expect(request.mock.calls[1][0]).toBe(
      `https://api.cdp.coinbase.com/platform/v2/evm/accounts/by-name/${remoteAccount.name}`,
    );
    expect(authority.sign).toHaveBeenCalledWith(context, actionId);
    expect(JSON.stringify(request.mock.calls)).not.toContain(
      'verified-session',
    );
  });

  it.each(['INCOMPLETE', 'REJECTED', null, 'id verified'])(
    'denies current status %s before provisioning or signing',
    async (status) => {
      const { provider, request } = providerFixture();
      const { authority, value } = authorityFixture();
      value.currentUserStatus = status;
      const service = new EmbeddedWalletService(authority, provider);
      await expect(service.provision(context, accountId)).rejects.toThrow(
        'wallet_authorization_denied',
      );
      await expect(service.sign(context, actionId)).rejects.toThrow(
        'wallet_authorization_denied',
      );
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('rechecks authority every request; an earlier verified request cannot authorize a later one', async () => {
    const { provider, request } = providerFixture();
    const { authority, value } = authorityFixture();
    const service = new EmbeddedWalletService(authority, provider);
    await service.sign(context, actionId);
    value.currentUserStatus = 'REJECTED';
    await expect(service.sign(context, actionId)).rejects.toThrow(
      'wallet_authorization_denied',
    );
    expect(authority.sign).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each(['owner', 'binding', 'capability', 'action', 'account', 'pending'])(
    'rejects mismatched %s authority before provider effects',
    async (kind) => {
      const { provider, request } = providerFixture();
      const { authority, value } = authorityFixture();
      if (kind === 'owner') value.sessionSubject = 'someone-else';
      if (kind === 'binding') value.bindingRevision = '2';
      if (kind === 'capability') value.capabilityRevision = '2';
      if (kind === 'action') value.action.action_id = attemptId;
      if (kind === 'account') value.accountId = attemptId;
      if (kind === 'pending') value.action.status = 'pending';
      await expect(
        new EmbeddedWalletService(authority, provider).sign(context, actionId),
      ).rejects.toThrow('wallet_authorization_denied');
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('fails closed on denied sessions and storage outage', async () => {
    const { provider, request } = providerFixture();
    const authority: EmbeddedWalletAuthority = {
      provision: async () => null,
      sign: async () => {
        throw new Error('storage unavailable');
      },
    };
    const service = new EmbeddedWalletService(authority, provider);
    await expect(service.provision(context, accountId)).rejects.toThrow(
      'wallet_authorization_denied',
    );
    await expect(service.sign(context, actionId)).rejects.toThrow(
      'storage unavailable',
    );
    expect(request).not.toHaveBeenCalled();
  });
});

describe('CDP adapter isolation and validation', () => {
  it.each(Object.keys(environment))(
    'requires explicit %s; no shared credential fallback',
    (key) => {
      expect(() =>
        createCdpWalletProvider({
          ...environment,
          [key]: undefined,
          CDP_API_KEY_SECRET: 'shared',
          CDP_WALLET_SECRET: 'shared',
        }),
      ).toThrow('wallet_provider_configuration');
    },
  );

  it.each([
    { GAE_SERVICE: 'exchange' },
    { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { WALLET_BACKEND: 'other' },
  ])('rejects unsafe configuration %j', (changes) => {
    expect(() =>
      createCdpWalletProvider({ ...environment, ...changes }),
    ).toThrow('wallet_provider_configuration');
  });

  it('signs request-bound vendor authentication with no redirects, automatic retry or secret output', async () => {
    const { provider, request } = providerFixture();
    await provider.createAccount(accountId, attemptId);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('https://api.cdp.coinbase.com/platform/v2/evm/accounts');
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-Idempotency-Key']).toBe(attemptId);
    for (const [token, key, algorithm] of [
      [headers.Authorization.slice(7), apiKeys.publicKey, null],
      [headers['X-Wallet-Auth'], walletKeys.publicKey, 'sha256'],
    ] as const) {
      const [head, payload, signature] = token.split('.');
      expect(
        verify(
          algorithm,
          Buffer.from(`${head}.${payload}`),
          { key, dsaEncoding: 'ieee-p1363' },
          Buffer.from(signature, 'base64url'),
        ),
      ).toBe(true);
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      expect(claims.uris).toEqual([
        'POST api.cdp.coinbase.com/platform/v2/evm/accounts',
      ]);
      if (algorithm)
        expect(claims.reqHash).toBe(
          createHash('sha256').update(String(init?.body)).digest('hex'),
        );
      else expect(claims.exp - claims.iat).toBe(60);
    }
  });

  it.each([
    'digest',
    'chain',
    'account',
    'payload',
    'primary',
    'expiry',
    'domain',
    'number',
    'oversize',
  ])('rejects altered %s before any provider request', async (kind) => {
    const { provider, request } = providerFixture();
    const data = action();
    if (kind === 'digest') data.payload_hash = '0x' + '0'.repeat(64);
    if (kind === 'chain') data.chain_id = 'eip155:8453';
    if (kind === 'account')
      data.chain_account_id = `eip155:84532:${Wallet.createRandom().address}`;
    if (kind === 'payload') data.payload.message.challenge = 'changed';
    if (kind === 'primary') data.payload.primaryType = 'Different';
    if (kind === 'expiry') data.expires_at = new Date(0).toISOString();
    if (kind === 'domain') data.payload.types.EIP712Domain = [];
    if (kind === 'number') data.payload.message.challenge = 123 as never;
    if (kind === 'oversize') data.payload.message.challenge = 'a'.repeat(32769);
    await expect(
      provider.signTypedData(account, data, attemptId),
    ).rejects.toThrow('wallet_provider_input');
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps lookup read-only when missing; never invents a replacement account', async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({}, { status: 404 }),
    );
    const provider = createCdpWalletProvider(environment, request);
    expect(await provider.findAccount(accountId)).toBeNull();
    await expect(
      provider.signTypedData(account, action(), attemptId),
    ).rejects.toThrow('wallet_provider_input');
    expect(request.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(
      true,
    );
  });

  it('rejects a recovered address that differs from the recorded binding', async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({
        ...remoteAccount,
        address: Wallet.createRandom().address,
      }),
    );
    await expect(
      createCdpWalletProvider(environment, request).signTypedData(
        account,
        action(),
        attemptId,
      ),
    ).rejects.toThrow('wallet_provider_input');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([408, 500, 503])(
    'leaves a %s mutation outcome unknown without a retry',
    async (status) => {
      const request = vi.fn<typeof fetch>(async () =>
        Response.json({ errorMessage: 'secret-do-not-echo' }, { status }),
      );
      await expect(
        createCdpWalletProvider(environment, request).createAccount(
          accountId,
          attemptId,
        ),
      ).rejects.toMatchObject({
        code: 'wallet_provider_unavailable',
        outcome: 'unknown',
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it.each([401, 402, 409, 429])(
    'surfaces %s as rejection without retries or provisioning fallbacks',
    async (status) => {
      const request = vi.fn<typeof fetch>(async () =>
        Response.json({ errorMessage: 'secret-do-not-echo' }, { status }),
      );
      await expect(
        createCdpWalletProvider(environment, request).createAccount(
          accountId,
          attemptId,
        ),
      ).rejects.toMatchObject({
        code: 'wallet_provider_rejected',
        outcome: 'rejected',
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('sanitizes credentials, raw upstream errors and malformed or oversized responses', async () => {
    for (const response of [
      new Response('invalid json'),
      new Response('a'.repeat(65537)),
    ]) {
      const request = vi.fn<typeof fetch>(async () => response);
      await expect(
        createCdpWalletProvider(environment, request).createAccount(
          accountId,
          attemptId,
        ),
      ).rejects.toMatchObject({ outcome: 'unknown' });
    }
    const request = vi.fn<typeof fetch>(async () => {
      throw new Error(environment.WALLET_CDP_API_KEY_SECRET);
    });
    try {
      await createCdpWalletProvider(environment, request).createAccount(
        accountId,
        attemptId,
      );
    } catch (error) {
      expect(String(error)).toBe(
        'WalletProviderError: wallet_provider_unavailable',
      );
      expect((error as Error).cause).toBeUndefined();
    }
    const invalid = createCdpWalletProvider(
      { ...environment, WALLET_CDP_WALLET_SECRET: 'bad-secret-do-not-echo' },
      request,
    );
    await expect(invalid.createAccount(accountId, attemptId)).rejects.toThrow(
      'wallet_provider_configuration',
    );
  });

  it('rejects a signature from the wrong account as an unknown outcome', async () => {
    const data = action();
    const wrongSignature = Signature.from(
      Wallet.createRandom().signingKey.sign(data.payload_hash),
    ).serialized;
    const request = vi.fn<typeof fetch>(async (_url, init) =>
      Response.json(
        init?.method === 'GET' ? remoteAccount : { signature: wrongSignature },
      ),
    );
    await expect(
      createCdpWalletProvider(environment, request).signTypedData(
        account,
        data,
        attemptId,
      ),
    ).rejects.toMatchObject({
      code: 'wallet_provider_response',
      outcome: 'unknown',
    });
  });

  it('recovers a lost creation response with the reserved ID without another POST', async () => {
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === 'POST')
        throw new Error('lost response after creation');
      return Response.json(remoteAccount);
    });
    await expect(
      createCdpWalletProvider(environment, request).createAccount(
        accountId,
        attemptId,
      ),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    const restarted = createCdpWalletProvider(environment, request);
    expect(await restarted.findAccount(accountId)).toEqual(account);
    expect(request.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'GET',
    ]);
  });

  it('does not sign when the action expires during account lookup', async () => {
    const data = action();
    const request = vi.fn<typeof fetch>(async () => {
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse(data.expires_at));
      return Response.json(remoteAccount);
    });
    await expect(
      createCdpWalletProvider(environment, request).signTypedData(
        account,
        data,
        attemptId,
      ),
    ).rejects.toThrow('wallet_provider_input');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'wrong-account' },
    { address: '0x' + '0'.repeat(40) },
    { address: 'not-an-address' },
  ])('rejects invalid account responses %j', async (override) => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ ...remoteAccount, ...override }),
    );
    await expect(
      createCdpWalletProvider(environment, request).createAccount(
        accountId,
        attemptId,
      ),
    ).rejects.toMatchObject({
      code: 'wallet_provider_response',
      outcome: 'unknown',
    });
  });

  it('rejects identifiers that could expose identity or alter the request path', async () => {
    const { request, provider } = providerFixture();
    await expect(
      provider.createAccount('phone-number', attemptId),
    ).rejects.toThrow('wallet_provider_input');
    await expect(provider.findAccount('../accounts')).rejects.toThrow(
      'wallet_provider_input',
    );
    await expect(
      provider.createAccount(accountId, 'new-attempt-per-retry'),
    ).rejects.toThrow('wallet_provider_input');
    expect(request).not.toHaveBeenCalled();
  });

  it('snapshots authorized bytes across asynchronous provider work', async () => {
    const data = action();
    const expectedDigest = data.payload_hash;
    const { provider } = providerFixture();
    const pending = provider.signTypedData(account, data, attemptId);
    data.payload.message.challenge = 'unauthorized-after-dispatch';
    expect(recoverAddress(expectedDigest, await pending)).toBe(signer.address);
  });
});
