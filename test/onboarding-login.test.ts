import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createOwnerLogin } from '../src/onboarding/login.js';
import { createFileOnboardingStore } from '../src/onboarding/file-store.js';

const issuer = 'https://login.example.test';
const origin = 'https://wallet.example.test';
const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    folders.splice(0).map((f) => rm(f, { recursive: true, force: true })),
  );
});
async function setup(mode = 'valid') {
  const folder = await mkdtemp(join(tmpdir(), 'wpk-login-'));
  folders.push(folder);
  const keys = await generateKeyPair('ES256');
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'ephemeral',
    alg: 'ES256',
  };
  let nonce = '';
  const tokenCalls: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (target: string | URL | Request, init?: RequestInit) => {
      const url = String(target);
      const json = (value: unknown) =>
        new Response(JSON.stringify(value), {
          headers: { 'content-type': 'application/json' },
        });
      if (url.endsWith('/.well-known/openid-configuration'))
        return json({
          issuer,
          authorization_endpoint: issuer + '/authorize',
          token_endpoint: issuer + '/token',
          jwks_uri: issuer + '/jwks',
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['ES256'],
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          code_challenge_methods_supported: ['S256'],
        });
      if (url === issuer + '/jwks') return json({ keys: [jwk] });
      if (url !== issuer + '/token')
        throw new Error('Unexpected offline request');
      tokenCalls.push(init!);
      const now = Math.floor(Date.now() / 1000);
      const signing =
        mode === 'signature' ? await generateKeyPair('ES256') : keys;
      const token = await new SignJWT({
        iss: mode === 'issuer' ? 'https://other.example.test' : issuer,
        sub: 'alice',
        aud: mode === 'audience' ? 'requesting-app' : 'provider-login',
        nonce: mode === 'nonce' ? 'other-nonce' : nonce,
        auth_time: mode === 'stale-auth' ? now - 400 : now,
        iat: now,
        exp: mode === 'expired' ? now - 20 : now + 300,
      })
        .setProtectedHeader({
          alg: 'ES256',
          kid: 'ephemeral',
          typ: mode === 'token-type' ? 'at+jwt' : 'JWT',
        })
        .sign(signing.privateKey);
      return json({
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: token,
      });
    }),
  );
  const store = createFileOnboardingStore(folder);
  const login = await createOwnerLogin(
    {
      issuer,
      clientId: 'provider-login',
      clientSecret: randomUUID(),
      idTokenAlgorithm: 'ES256',
    },
    origin,
    store,
  );
  const browser = randomBytes(32).toString('base64url');
  const requestId = randomUUID();
  const authorize = new URL(await login.start(requestId, browser));
  nonce = authorize.searchParams.get('nonce')!;
  const callback = new URL(origin + '/onboarding/callback');
  callback.searchParams.set('state', authorize.searchParams.get('state')!);
  callback.searchParams.set('code', 'offline-code');
  return { login, browser, requestId, authorize, callback, tokenCalls, store };
}
it('performs signed OIDC code/PKCE login with nonce, one-use browser-bound state and a private short session', async () => {
  const f = await setup();
  expect(f.authorize.searchParams.get('code_challenge_method')).toBe('S256');
  expect(f.authorize.searchParams.get('max_age')).toBe('300');
  const complete = await f.login.finish(f.callback, f.browser);
  const session = await f.login.session(complete.sessionToken);
  expect(session.identity.subject).toBe('alice');
  expect(complete.requestId).toBe(f.requestId);
  expect(session.csrf).toHaveLength(43);
  const body = new URLSearchParams(f.tokenCalls[0].body as URLSearchParams);
  expect(body.get('code_verifier')).toBeTruthy();
  expect(body.get('redirect_uri')).toBe(origin + '/onboarding/callback');
  await expect(f.login.finish(f.callback, f.browser)).rejects.toThrow(
    'invalid_token',
  );
  expect(f.tokenCalls).toHaveLength(1);
  expect(
    await f.store.transaction((s) => JSON.stringify(s.sessions)),
  ).not.toContain(complete.sessionToken);
});
it.each([
  'nonce',
  'audience',
  'issuer',
  'expired',
  'stale-auth',
  'signature',
  'token-type',
])('rejects %s confusion without creating a session', async (mode) => {
  const f = await setup(mode);
  await expect(f.login.finish(f.callback, f.browser)).rejects.toThrow(
    'invalid_token',
  );
  expect(await f.store.transaction((s) => Object.keys(s.sessions))).toEqual([]);
});
it('rejects another browser, foreign callback origins and expired sessions', async () => {
  const f = await setup();
  await expect(
    f.login.finish(f.callback, randomBytes(32).toString('base64url')),
  ).rejects.toThrow('invalid_token');
  const other = new URL(f.callback);
  other.hostname = 'other.example.test';
  await expect(f.login.finish(other, f.browser)).rejects.toThrow(
    'invalid_token',
  );
  expect(f.tokenCalls).toHaveLength(0);
  const result = await f.login.finish(f.callback, f.browser);
  await f.store.transaction((s) => {
    Object.values(s.sessions)[0].expiresAt = Date.now() - 1;
  });
  await expect(f.login.session(result.sessionToken)).rejects.toThrow(
    'invalid_token',
  );
});
