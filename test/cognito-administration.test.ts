import { afterEach, expect, it, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import Fastify from 'fastify';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createCognitoAdministration } from '../src/management/cognito.js';
import { AuthenticationError } from '../src/service/auth.js';
import type { VerifiedPrincipal } from '../src/domain/principal.js';
import { ManagementService } from '../src/management/service.js';
import type {
  OnboardingStore,
  ProviderState,
} from '../src/onboarding/types.js';

afterEach(() => vi.unstubAllGlobals());
const origin = 'https://wallet.example.test';
const domain = 'https://offline-admin.auth.eu-north-1.amazoncognito.com';
const issuer =
  'https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_Offline';
async function fixture(mode = 'valid', bootstrap = true) {
  const policy = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  ).policy;
  let state = {
    format: 'moovha-onboarding-1',
    grants: {},
    audit: [],
  } as unknown as ProviderState;
  const store: OnboardingStore = {
    async transaction(operation) {
      const next = structuredClone(state);
      const result = operation(next);
      state = next;
      return structuredClone(result);
    },
  };
  const service = new ManagementService(
    store,
    () => structuredClone(state.management?.provider),
    origin + '/oauth',
    policy,
  );
  await service.initialize(randomBytes(48).toString('base64url'));
  const key = await generateKeyPair('RS256');
  const jwk = {
    ...(await exportJWK(key.publicKey)),
    kid: 'offline',
    alg: 'RS256',
  };
  let nonce = '';
  const calls: URLSearchParams[] = [];
  const verificationCalls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (target: string | URL | Request, init?: RequestInit) => {
      const json = (value: unknown) =>
        new Response(JSON.stringify(value), {
          headers: { 'content-type': 'application/json' },
        });
      if (String(target) === 'https://cognito-idp.eu-north-1.amazonaws.com/') {
        const operation = new Headers(init?.headers).get('x-amz-target') ?? '';
        verificationCalls.push(operation);
        const body = JSON.parse(String(init?.body));
        if (body.Code === '000000') return new Response('{}', { status: 400 });
        return json({});
      }
      if (String(target) === issuer + '/.well-known/jwks.json')
        return json({ keys: [jwk] });
      if (String(target) !== domain + '/oauth2/token')
        throw new Error('Unexpected offline request');
      calls.push(new URLSearchParams(init?.body as URLSearchParams));
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: mode === 'issuer' ? issuer + 'Other' : issuer,
        aud: mode === 'audience' ? 'anotherclient' : 'offlineclient',
        sub: 'offline-subject',
        nonce: mode === 'nonce' ? 'wrong' : nonce,
        token_use: mode === 'access' ? 'access' : 'id',
        auth_time: mode === 'stale-auth' ? now - 400 : now,
        email_verified: mode !== 'unverified',
        'cognito:groups':
          mode === 'group' ? ['Other'] : ['ProviderAdministrators'],
        iat: mode === 'stale' ? now - 700 : now,
        exp:
          mode === 'expired'
            ? now - 20
            : mode === 'lifetime'
              ? now + 3600
              : now + 300,
      };
      const signing =
        mode === 'signature' ? await generateKeyPair('RS256') : key;
      return json({
        access_token: 'unused-offline-token',
        scope: 'openid email aws.cognito.signin.user.admin',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: await new SignJWT(claims)
          .setProtectedHeader({
            alg: 'RS256',
            kid: 'offline',
            typ: mode === 'type' ? 'at+jwt' : 'JWT',
          })
          .sign(signing.privateKey),
      });
    }),
  );
  const issue = vi.fn(async (_principal: VerifiedPrincipal) => ({
    access_token: 'ephemeral-provider-session',
    token_type: 'Bearer',
    expires_in: 300,
    scope: 'provider:manage',
  }));
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) =>
    reply
      .code(error instanceof AuthenticationError ? error.status : 500)
      .send({ message: 'Sign-in denied' }),
  );
  createCognitoAdministration(
    {
      userPoolId: 'eu-north-1_Offline',
      clientId: 'offlineclient',
      domain,
      administratorGroup: 'ProviderAdministrators',
      bootstrap,
    },
    origin,
    service,
    issue,
  ).register(app);
  const start = await app.inject({ url: '/admin/auth/start' });
  const authorize = new URL(start.headers.location!);
  nonce = authorize.searchParams.get('nonce')!;
  const cookie = String(start.headers['set-cookie']).split(';')[0];
  const callback =
    '/admin/auth/callback?' +
    new URLSearchParams({
      code: 'offline-code',
      state: authorize.searchParams.get('state')!,
    });
  return {
    app,
    service,
    issue,
    calls,
    verificationCalls,
    cookie,
    callback,
    authorize,
    start,
    store,
    snapshot: () => structuredClone(state.management?.provider),
  };
}
it('binds code/PKCE sign-in to a browser and approves only the configured Cognito group', async () => {
  const f = await fixture();
  try {
    expect(f.start.headers['set-cookie']).toContain(
      'Secure; HttpOnly; SameSite=Lax',
    );
    expect(f.authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const complete = await f.app.inject({
      url: f.callback,
      headers: { cookie: f.cookie },
    });
    expect(complete.headers.location).toBe('/admin/');
    expect(f.calls[0].get('code_verifier')).toBeTruthy();
    expect(f.calls[0].get('redirect_uri')).toBe(
      origin + '/admin/auth/callback',
    );
    expect(f.snapshot()?.claimed).toBe(true);
    expect(f.snapshot()?.claimHash).toBe('');
    const cookie = String(complete.headers['set-cookie']).split(';')[0];
    const csrf = await f.app.inject({
      method: 'POST',
      url: '/admin/auth/session',
      headers: { cookie, origin: 'https://attacker.example.test' },
      payload: {},
    });
    expect(csrf.statusCode).toBe(403);
    const session = await f.app.inject({
      method: 'POST',
      url: '/admin/auth/session',
      headers: { cookie, origin },
      payload: {},
    });
    expect(session.json().access_token).toBe('ephemeral-provider-session');
    const replay = await f.app.inject({
      method: 'POST',
      url: '/admin/auth/session',
      headers: { cookie, origin },
      payload: {},
    });
    expect(replay.statusCode).toBe(401);
    expect(f.issue).toHaveBeenCalledTimes(1);
    const principal = f.issue.mock.calls[0]?.[0];
    expect(principal?.clientId).toMatch(/^operator-cognito-/);
    expect(principal).toBeDefined();
    f.service.currentPrincipal(principal!);
    await expect(
      f.service.verifyCredentials(
        principal!.clientId,
        randomBytes(32).toString('base64url'),
        ['provider:manage'],
      ),
    ).rejects.toThrow();
    await f.store.transaction((s) => {
      s.management!.provider.identities[principal!.clientId].enabled = false;
    });
    expect(() => f.service.currentPrincipal(principal!)).toThrow();
    await expect(
      f.service.federatedAdministrator(issuer, 'offline-subject', true),
    ).rejects.toThrow();
    const again = await f.app.inject({
      url: f.callback,
      headers: { cookie: f.cookie },
    });
    expect(again.headers.location).toBe('/admin/?signin=failed');
    expect(f.calls).toHaveLength(1);
  } finally {
    await f.app.close();
  }
});
it.each([
  'stale-auth',
  'issuer',
  'audience',
  'nonce',
  'access',
  'group',
  'stale',
  'expired',
  'lifetime',
  'signature',
  'type',
])('rejects %s without claiming or creating an administrator', async (mode) => {
  const f = await fixture(mode);
  try {
    const response = await f.app.inject({
      url: f.callback,
      headers: { cookie: f.cookie },
    });
    expect(response.headers.location).toBe('/admin/?signin=failed');
    expect(f.snapshot()?.claimed).toBe(false);
    expect(Object.keys(f.snapshot()?.identities ?? {})).toHaveLength(0);
    expect(f.issue).not.toHaveBeenCalled();
  } finally {
    await f.app.close();
  }
});
it('requires the browser cookie and explicit bootstrap authority', async () => {
  const f = await fixture('valid', false);
  try {
    expect(
      (await f.app.inject({ url: f.callback, headers: { cookie: f.cookie } }))
        .headers.location,
    ).toBe('/admin/?signin=failed');
    expect(f.snapshot()?.claimed).toBe(false);
  } finally {
    await f.app.close();
  }
  const other = await fixture();
  try {
    expect(
      (await other.app.inject({ url: other.callback })).headers.location,
    ).toBe('/admin/?signin=failed');
    expect(other.calls).toHaveLength(0);
  } finally {
    await other.app.close();
  }
});

it('verifies an approved directory account email without creating provider authority or exposing its token', async () => {
  const f = await fixture('unverified');
  try {
    const complete = await f.app.inject({
      url: f.callback,
      headers: { cookie: f.cookie },
    });
    expect(complete.headers.location).toBe('/admin/');
    const cookie = String(complete.headers['set-cookie']).split(';')[0];
    const options = await f.app.inject({
      url: '/admin/auth/options',
      headers: { cookie },
    });
    expect(options.json()).toEqual({
      cognito: true,
      sessionAvailable: false,
      verifyEmail: true,
    });
    expect(options.body).not.toContain('unused-offline-token');
    expect(f.issue).not.toHaveBeenCalled();
    const csrf = await f.app.inject({
      method: 'POST',
      url: '/admin/auth/email/send',
      headers: { cookie, origin: 'https://attacker.example.test' },
      payload: {},
    });
    expect(csrf.statusCode).toBe(403);
    expect(f.verificationCalls).toHaveLength(0);
    const sent = await f.app.inject({
      method: 'POST',
      url: '/admin/auth/email/send',
      headers: { cookie, origin },
      payload: {},
    });
    expect(sent.json()).toEqual({ sent: true });
    const wrong = await f.app.inject({
      method: 'POST',
      url: '/admin/auth/email/verify',
      headers: { cookie, origin },
      payload: { code: '000000' },
    });
    expect(wrong.statusCode).toBe(401);
    const verified = await f.app.inject({
      method: 'POST',
      url: '/admin/auth/email/verify',
      headers: { cookie, origin },
      payload: { code: '123456' },
    });
    expect(verified.json()).toEqual({ url: '/admin/auth/start' });
    const replay = await f.app.inject({
      method: 'POST',
      url: '/admin/auth/email/send',
      headers: { cookie, origin },
      payload: {},
    });
    expect(replay.statusCode).toBe(401);
    expect(f.issue).not.toHaveBeenCalled();
    expect(f.snapshot()?.claimed).toBe(false);
    expect(f.verificationCalls).toHaveLength(3);
  } finally {
    await f.app.close();
  }
});
