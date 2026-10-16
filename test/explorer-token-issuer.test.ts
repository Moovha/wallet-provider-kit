import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createExplorerTokenIssuer } from '../src/deployment/explorer-tokens.js';
import {
  secretReferences,
  validateProviderConfiguration,
} from '../src/deployment/config.js';
import { createAuthenticator } from '../src/service/auth.js';
const sample = JSON.parse(
  await readFile(
    new URL('../docs/provider.config.hosted.example.json', import.meta.url),
    'utf8',
  ),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function fixture() {
  const input = structuredClone(sample);
  input.http = { documentation: true };
  input.apiExplorer = {
    operators: ['operator-subject'],
    clients: [
      {
        clientId: input.policy.applications[0].clientId,
        clientSecret: { env: 'OFFLINE_EXPLORER_CLIENT_SECRET' },
        scopes: ['wallet:account:read'],
      },
    ],
  };
  return input;
}
it('validates opt-in, registered clients, explicit operators/scopes and secret references offline', () => {
  const config = validateProviderConfiguration(fixture());
  expect(secretReferences(config)).toContainEqual({
    env: 'OFFLINE_EXPLORER_CLIENT_SECRET',
  });
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Forbidden'));
  for (const mutate of [
    (value: any) => {
      value.http.documentation = false;
    },
    (value: any) => {
      value.apiExplorer.operators = [];
    },
    (value: any) => {
      value.apiExplorer.clients[0].clientId = 'unregistered';
    },
    (value: any) => {
      value.apiExplorer.clients[0].scopes = ['unlisted'];
    },
    (value: any) => {
      value.apiExplorer.clients.push(value.apiExplorer.clients[0]);
    },
    (value: any) => {
      value.policy.applications[0].enabled = false;
    },
  ]) {
    const value = fixture();
    mutate(value);
    expect(() => validateProviderConfiguration(value)).toThrow();
  }
  expect(network).not.toHaveBeenCalled();
});
it('uses the maintained client-credentials exchange server-side and verifies exact client, JWT profile and scope limits', async () => {
  const config = validateProviderConfiguration(fixture());
  const entry = config.apiExplorer!.clients[0];
  vi.stubEnv(entry.clientSecret.env, 'offline-fixture-value');
  const keys = await generateKeyPair('ES256');
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'fixture',
    alg: 'ES256',
  };
  const authenticate = createAuthenticator(
    config.oauth,
    createLocalJWKSet({ keys: [jwk] }),
  );
  let overrides: Record<string, unknown> = {};
  let algorithmType = 'at+jwt';
  const tokenEndpoint = config.oauth.issuer.replace(/\/$/, '') + '/oauth/token';
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url, options) => {
      expect(options?.redirect).toBe('error');
      if (String(url) === tokenEndpoint) {
        const body = new URLSearchParams(String(options?.body));
        expect(body.get('client_secret')).toBe('offline-fixture-value');
        expect(body.get('client_id')).toBe(entry.clientId);
        expect(body.get('grant_type')).toBe('client_credentials');
        expect(body.get('audience')).toBe(config.oauth.audience);
        expect(body.get('scope')).toBe('wallet:account:read');
        const now = Math.floor(Date.now() / 1000);
        const jwt = await new SignJWT({
          iss: config.oauth.issuer,
          aud: config.oauth.audience,
          sub: entry.clientId,
          client_id: entry.clientId,
          jti: randomUUID(),
          iat: now,
          exp: now + 600,
          scope: 'wallet:account:read',
          ...overrides,
        })
          .setProtectedHeader({
            alg: 'ES256',
            kid: 'fixture',
            typ: algorithmType,
          })
          .sign(keys.privateKey);
        return new Response(
          JSON.stringify({
            access_token: jwt,
            token_type: 'Bearer',
            expires_in: 600,
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          issuer: config.oauth.issuer,
          token_endpoint: tokenEndpoint,
          jwks_uri: config.oauth.jwksUrl,
          authorization_endpoint:
            config.oauth.issuer.replace(/\/$/, '') + '/authorize',
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    });
  const issue = createExplorerTokenIssuer(config, authenticate);
  await expect(issue(entry.clientId, entry.scopes)).resolves.toMatchObject({
    scope: 'wallet:account:read',
    expires_at: expect.any(Number),
  });
  await expect(issue(entry.clientId, ['wallet:sign'])).rejects.toThrow(
    'token_request_denied',
  );
  for (const changes of [
    { client_id: 'different' },
    { scope: 'wallet:account:read wallet:sign' },
    { exp: Math.floor(Date.now() / 1000) + 3600 },
  ]) {
    overrides = changes;
    await expect(issue(entry.clientId, entry.scopes)).rejects.toThrow(
      'token_issuance_failed',
    );
  }
  overrides = {};
  algorithmType = 'JWT';
  await expect(issue(entry.clientId, entry.scopes)).rejects.toThrow(
    'token_issuance_failed',
  );
  expect(fetch).toHaveBeenCalledTimes(6);
});
