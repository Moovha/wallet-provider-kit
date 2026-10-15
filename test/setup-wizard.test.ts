import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupWarnings } from '../src/deployment/setup-readiness.js';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import type { FastifyInstance } from 'fastify';
import { createSetupServer } from '../src/deployment/setup-server.js';

let directory: string;
let app: FastifyInstance;
const token = 'ephemeral-test-session';
const origin = 'http://127.0.0.1:0';
const headers = {
  host: '127.0.0.1:0',
  origin,
  authorization: `Bearer ${token}`,
};
let example: Record<string, any>;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'provider-setup-test-'));
  await writeFile(
    join(directory, 'index.html'),
    '<!doctype html><title>Setup</title>',
  );
  example = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.example.json', import.meta.url),
      'utf8',
    ),
  );
  app = await createSetupServer({ token, assetDirectory: directory });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
  await rm(directory, { recursive: true, force: true });
});

describe('local operator setup boundary', () => {
  it('serves bundled assets with restrictive browser headers and rejects traversal', async () => {
    const page = await app.inject({ url: '/', headers });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.headers['cache-control']).toBe('no-store');
    const missing = await app.inject({ url: '/package.json', headers });
    expect(missing.statusCode).toBe(404);
    expect(
      (
        await app.inject({
          url: '/%2e%2e/docs/provider.config.example.json',
          headers,
        })
      ).statusCode,
    ).toBe(404);
  });
  it.each([
    { ...headers, host: 'attacker.example:0' },
    { ...headers, origin: 'https://attacker.example' },
    { ...headers, authorization: 'Bearer wrong-session' },
    { host: headers.host, origin },
    { ...headers, 'sec-fetch-site': 'cross-site' },
  ])(
    'rejects foreign hosts, origins and unauthenticated local API access',
    async (requestHeaders) => {
      expect(
        (await app.inject({ url: '/api/template', headers: requestHeaders }))
          .statusCode,
      ).toBe(403);
    },
  );
  it('requires an exact browser Origin for POST and never enables CORS', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/validate',
      headers: { host: headers.host, authorization: headers.authorization },
      payload: example,
    });
    expect(reply.statusCode).toBe(403);
    expect(reply.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('expires local API access after one hour', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_600_001);
    expect(
      (await app.inject({ url: '/api/template', headers })).statusCode,
    ).toBe(403);
  });
  it('validates the existing configuration without loading credentials or activating integrations', async () => {
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network forbidden'));
    const reply = await app.inject({
      method: 'POST',
      url: '/api/validate',
      headers,
      payload: example,
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.json().config).toEqual(example);
    expect(reply.json().environment).toContain('PROVIDER_LOGIN_SECRET');
    expect(reply.json().acceptance).toBe('not_verified');
    expect(network).not.toHaveBeenCalled();
  });
  it('uses semantic validation for mismatched application issuers and financial bounds', async () => {
    example.policy.applications[0].issuer = 'https://different.example.com';
    const reply = await app.inject({
      method: 'POST',
      url: '/api/validate',
      headers,
      payload: example,
    });
    expect(reply.statusCode).toBe(422);
    expect(reply.json().issues.join()).toContain('issuers must match');
  });
  it('rejects custom modules, plaintext credentials, oversized and malformed input without reflecting values', async () => {
    const custom = {
      ...example,
      backend: {
        kind: 'custom',
        binding: 'advanced',
        module: './must-never-load.mjs',
      },
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/validate',
          headers,
          payload: custom,
        })
      ).statusCode,
    ).toBe(422);
    example.ownerLogin.clientSecret = 'do-not-reflect-this-value';
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/validate',
      headers,
      payload: example,
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.body).not.toContain('do-not-reflect-this-value');
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/validate',
      headers,
      payload: { value: 'x'.repeat(65536) },
    });
    expect(oversized.statusCode).toBe(400);
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/validate',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: '{invalid',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toContain('{invalid');
  });
  it('keeps the provider and deployment APIs unavailable in the setup process', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/actions/anything/sign',
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/deploy',
          headers,
          payload: example,
        })
      ).statusCode,
    ).toBe(404);
  });
});

it('distinguishes valid configuration from usable new-user identity and financial paths', () => {
  let config = validateProviderConfiguration(example);
  expect(setupWarnings(config).join()).toContain(
    'new hosted identity verification is blocked',
  );
  expect(setupWarnings(config).join()).toContain('funding agreement');
  config.activation = {
    enabled: true,
    backendAcceptance: 'review/backend',
    recoveryAcceptance: 'review/recovery',
  };
  config.identity.didit!.verificationPrice = {
    maximumMinor: 0,
    termsReference: 'agreed-free-verification',
  };
  config.identity.didit!.importPrice = {
    maximumMinor: 10,
    termsReference: 'agreed-import',
  };
  config.policy.applications[0].funding = {
    agreement: 'reimbursement',
    monthlyLimitMinor: 10,
  };
  expect(setupWarnings(config)).toEqual([]);
  config.policy.applications[0].funding.monthlyLimitMinor = 5;
  expect(setupWarnings(config).join()).toContain('smaller than');
});
