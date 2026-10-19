import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createAuthenticator } from '../src/service/auth.js';
import { createServer } from '../src/service/server.js';
import {
  EmbeddedWalletService,
  type SigningAuthority,
} from '../src/domain/embedded-wallet.js';
import {
  WalletProviderError,
  type WalletSigningProvider,
} from '../src/domain/signing.js';

const accountId = '10000000-0000-4000-8000-000000000001';
const attemptId = '10000000-0000-4000-8000-000000000002';
const configuration = {
  issuer: 'https://identity.example.test',
  audience: 'wallet-provider-test',
  jwksUrl: 'https://identity.example.test/jwks',
};
const keys = await generateKeyPair('ES256');
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: 'test-key',
  alg: 'ES256',
};
const authenticate = createAuthenticator(
  configuration,
  createLocalJWKSet({ keys: [jwk] }),
);
async function token(overrides: Record<string, unknown> = {}, typ = 'at+jwt') {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: configuration.issuer,
    aud: configuration.audience,
    sub: 'owner-a',
    client_id: 'client-a',
    iat: now,
    exp: now + 300,
    jti: crypto.randomUUID(),
    scope: 'wallet:provision wallet:sign',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ })
    .sign(keys.privateKey);
}
const servers: Awaited<ReturnType<typeof createServer>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function fixture(status: string | null = 'ID VERIFIED') {
  const provider: WalletSigningProvider = {
    provider: 'offline-fixture',
    createAccount: vi.fn(async (id) => ({
      accountId: id,
      address: '0x' + '1'.repeat(40),
    })),
    findAccount: vi.fn(async () => null),
    signTypedData: vi.fn(async () => '0x' + '1'.repeat(130)),
  };
  const provision = vi.fn(async (context, id) => {
    if (
      context.principal.clientId !== 'client-a' ||
      context.principal.subject !== 'owner-a' ||
      id !== accountId
    )
      return null;
    return {
      sessionSubject: 'owner-a',
      ownerSubject: 'owner-a',
      currentUserStatus: status,
      accountId: id,
      attemptId,
    };
  });
  const service = new EmbeddedWalletService(
    { provision, sign: async () => null },
    provider,
  );
  const app = await createServer({
    authenticate,
    service,
    ready: async () => true,
  });
  servers.push(app);
  const headers = {
    authorization: `Bearer ${await token()}`,
    'idempotency-key': attemptId,
  };
  return { app, provider, provision, headers };
}

describe('OAuth RFC 9068 resource server', () => {
  it('verifies issuer, audience, type and scopes', async () => {
    expect(
      await authenticate(`Bearer ${await token()}`, 'wallet:sign'),
    ).toMatchObject({ clientId: 'client-a', subject: 'owner-a' });
  });
  it.each([
    { iss: 'https://untrusted.example.test' },
    { aud: 'other-api' },
    { exp: 1 },
    { iat: Math.floor(Date.now() / 1000) + 600 },
    { client_id: null },
    { cnf: { jkt: 'unsupported-token-binding' } },
    { cnf: { 'x5t#S256': 'unsupported-certificate-binding' } },
    { jti: '' },
    { scope: ['wallet:sign'] },
    { exp: Math.floor(Date.now() / 1000) + 3600 },
  ])('denies invalid token claims %j', async (overrides) => {
    await expect(
      authenticate(`Bearer ${await token(overrides)}`, 'wallet:sign'),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('denies ID tokens and insufficient scopes', async () => {
    await expect(
      authenticate(`Bearer ${await token({}, 'JWT')}`, 'wallet:sign'),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticate(
        `Bearer ${await token({ scope: 'wallet:read' })}`,
        'wallet:sign',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('rejects unsafe configuration before any key fetch', () => {
    expect(() =>
      createAuthenticator({
        ...configuration,
        jwksUrl: 'http://localhost/jwks',
      }),
    ).toThrow();
    expect(() =>
      createAuthenticator({
        ...configuration,
        issuer: 'https://user:password@example.test',
      }),
    ).toThrow();
  });
});

describe('provider HTTP boundary', () => {
  it('boots with Swagger and discovery but fails readiness and signing closed', async () => {
    const app = await createServer();
    servers.push(app);
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
    expect((await app.inject('/v1/capabilities')).json()).toMatchObject({
      configured: false,
      status: 'experimental',
    });
    expect((await app.inject('/docs/')).body).toContain('swagger-ui');
    expect((await app.inject('/openapi.json')).json().paths).toHaveProperty(
      '/v1/actions/{actionId}/sign',
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/accounts/${accountId}/provision`,
          payload: {},
        })
      ).statusCode,
    ).toBe(503);
  });
  it('serves a configured live explorer without changing the canonical contract and can disable it', async () => {
    const app = await createServer({
      configurationProfile: 'provider-service-v1',
      documentation: true,
    });
    servers.push(app);
    const live = (await app.inject('/docs/json')).json();
    expect(Object.keys(live.paths)).toEqual(Object.keys(app.swagger().paths!));
    expect(live.paths['/v1/enrollments'].post.summary).toContain(
      '[Not enabled]',
    );
    expect(live.paths['/v1/actions/{actionId}/sign'].post.summary).toContain(
      '[Not enabled]',
    );
    expect(live.servers).toEqual([{ url: '/' }]);
    expect(live.info.description).toContain('Execute sends a real request');
    expect(
      live.paths['/v1/accounts/{accountId}/provision'].post.description,
    ).toContain('wallet:provision');
    const canonical = (await app.inject('/openapi.json')).json();
    expect(canonical.paths).toHaveProperty('/v1/actions/{actionId}/sign');
    expect(canonical.info.title).toBe('Moovha Wallet Provider Service');
    const initializer = (
      await app.inject('/docs/static/swagger-initializer.js')
    ).body;
    expect(initializer).toContain('liveRequestInterceptor');
    expect(initializer).toContain('persistAuthorization');
    const disabled = await createServer({ documentation: false });
    servers.push(disabled);
    expect((await disabled.inject('/docs/')).statusCode).toBe(404);
  });
  it('passes verified identity and idempotency context, never body authority', async () => {
    const { app, headers, provision, provider } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: `/v1/accounts/${accountId}/provision`,
      headers,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(provision).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: expect.objectContaining({
          clientId: 'client-a',
          subject: 'owner-a',
        }),
        idempotencyKey: attemptId,
      }),
      accountId,
    );
    expect(provider.createAccount).toHaveBeenCalledWith(accountId, attemptId);
  });
  it.each(['INCOMPLETE', 'REJECTED', null])(
    'denies stored KYC %s before side effects',
    async (status) => {
      const { app, headers, provider } = await fixture(status);
      const response = await app.inject({
        method: 'POST',
        url: `/v1/accounts/${accountId}/provision`,
        headers,
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(provider.createAccount).not.toHaveBeenCalled();
    },
  );
  it.each([{ sub: 'owner-b' }, { client_id: 'client-b' }])(
    'isolates account access for %j',
    async (claims) => {
      const { app, headers, provider } = await fixture();
      headers.authorization = `Bearer ${await token(claims)}`;
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/v1/accounts/${accountId}/provision`,
            headers,
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
      expect(provider.createAccount).not.toHaveBeenCalled();
    },
  );
  it('rejects malformed authorization before parsing the body or consulting authority', async () => {
    const { app, headers, provision } = await fixture();
    headers.authorization = 'Bearer invalid';
    const response = await app.inject({
      method: 'POST',
      url: `/v1/accounts/${accountId}/provision`,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: '{invalid',
    });
    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toContain('invalid_token');
    expect(provision).not.toHaveBeenCalled();
  });
  it.each([
    { user_status: 'ID VERIFIED' },
    { payload: 'sign arbitrary bytes' },
    { address: 'untrusted' },
  ])('rejects unknown financial fields %j', async (payload) => {
    const { app, headers, provision } = await fixture();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/accounts/${accountId}/provision`,
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(400);
    expect(provision).not.toHaveBeenCalled();
  });
  it('rejects missing idempotency keys, wrong resource IDs and oversized bodies', async () => {
    const { app, headers, provision } = await fixture();
    const request = {
      method: 'POST' as const,
      url: `/v1/accounts/${accountId}/provision`,
      headers,
      payload: {},
    };
    expect(
      (
        await app.inject({
          ...request,
          headers: { authorization: headers.authorization },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ ...request, url: '/v1/accounts/other/provision' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ ...request, payload: { x: 'x'.repeat(1100) } }))
        .statusCode,
    ).toBe(413);
    expect(provision).not.toHaveBeenCalled();
  });
  it('retains unknown provider outcome without leaking exceptions', async () => {
    const { app, headers, provider } = await fixture();
    vi.mocked(provider.createAccount).mockRejectedValue(
      new WalletProviderError('wallet_provider_unavailable', 'unknown'),
    );
    const response = await app.inject({
      method: 'POST',
      url: `/v1/accounts/${accountId}/provision`,
      headers,
      payload: {},
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      outcome: 'unknown',
      code: 'wallet_provider_unavailable',
    });
    expect(response.body).not.toContain('stack');
  });
  it('signs only the stored approved action after successful authorization', async () => {
    const { headers, provider } = await fixture();
    const stored: SigningAuthority = {
      sessionSubject: 'owner-a',
      ownerSubject: 'owner-a',
      currentUserStatus: 'ID VERIFIED',
      accountId,
      attemptId,
      account: { accountId, address: '0x' + '1'.repeat(40) },
      chainAccountId: 'eip155:84532:0x' + '1'.repeat(40),
      bindingRevision: '1',
      capabilityRevision: '1',
      action: {
        action_id: accountId,
        operation_id: attemptId,
        kind: 'sign_typed_data',
        profile: 'evm_eoa_v1',
        profile_revision: '1',
        status: 'ready',
        chain_id: 'eip155:84532',
        chain_account_id: 'eip155:84532:0x' + '1'.repeat(40),
        binding_revision: '1',
        capability_revision: '1',
        plan_revision: '1',
        plan_hash: '0x' + '1'.repeat(64),
        dependencies: [],
        expires_at: new Date(Date.now() + 60000).toISOString(),
        payload_hash: '0x' + '2'.repeat(64),
        payload: {
          domain: { chainId: '84532' },
          types: { Proof: [{ name: 'challenge', type: 'string' }] },
          primaryType: 'Proof',
          message: { challenge: 'offline-route-fixture' },
        },
      },
    };
    const sign = vi.fn(async () => stored);
    const service = new EmbeddedWalletService(
      { provision: async () => null, sign },
      provider,
    );
    const app = await createServer({
      authenticate,
      service,
      ready: async () => true,
    });
    servers.push(app);
    const response = await app.inject({
      method: 'POST',
      url: `/v1/actions/${accountId}/sign`,
      headers,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ signature: '0x' + '1'.repeat(130) });
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: attemptId }),
      accountId,
    );
    expect(provider.signTypedData).toHaveBeenCalledWith(
      stored.account,
      stored.action,
      attemptId,
    );
  });

  it('does not dispatch when the readiness check fails or throws', async () => {
    const { headers, provider } = await fixture();
    const service = new EmbeddedWalletService(
      { provision: async () => null, sign: async () => null },
      provider,
    );
    for (const ready of [
      async () => false,
      async () => {
        throw new Error('unavailable');
      },
    ]) {
      const app = await createServer({ authenticate, service, ready });
      servers.push(app);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/v1/accounts/${accountId}/provision`,
            headers,
            payload: {},
          })
        ).statusCode,
      ).toBe(503);
    }
    expect(provider.createAccount).not.toHaveBeenCalled();
  });

  it('denies signing when authoritative action is absent', async () => {
    const { app, headers, provider } = await fixture();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/actions/${accountId}/sign`,
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(provider.signTypedData).not.toHaveBeenCalled();
  });
  it('fails closed when a dependency becomes unavailable', async () => {
    const { headers, provider } = await fixture();
    const service = new EmbeddedWalletService(
      {
        provision: async () => {
          throw new Error('credential-bearing-storage-error');
        },
        sign: async () => null,
      },
      provider,
    );
    const app = await createServer({
      authenticate,
      service,
      ready: async () => true,
    });
    servers.push(app);
    const response = await app.inject({
      method: 'POST',
      url: `/v1/accounts/${accountId}/provision`,
      headers,
      payload: {},
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('credential-bearing-storage-error');
    expect(provider.createAccount).not.toHaveBeenCalled();
  });
});
