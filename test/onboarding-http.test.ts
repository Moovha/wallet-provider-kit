import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalJWKSet, generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createServer } from '../src/service/server.js';
import {
  createAuthenticator,
  AuthenticationError,
} from '../src/service/auth.js';
import { createFileOnboardingStore } from '../src/onboarding/file-store.js';
import { OnboardingService } from '../src/onboarding/service.js';
import {
  accessType,
  type IdentityAdapter,
  type IdentityEvidence,
} from '../src/onboarding/types.js';
import { createOnboardingJournal } from '../src/onboarding/journal.js';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';

const servers: Awaited<ReturnType<typeof createServer>>[] = [];
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  await Promise.all(
    folders.splice(0).map((f) => rm(f, { recursive: true, force: true })),
  );
});
async function setup(apiExplorerLogin = false) {
  const folder = await mkdtemp(join(tmpdir(), 'wpk-http-'));
  folders.push(folder);
  const store = createFileOnboardingStore(folder);
  const issuer = 'https://apps.example.test';
  const reference = randomUUID();
  const adapter: IdentityAdapter = {
    vendor: 'didit',
    price: { maximumMinor: 0, termsReference: 'test-confirmed-free' },
    importShared: vi.fn(async (_token, id): Promise<IdentityEvidence> => ({
      vendor: 'didit',
      reference,
      correlation: id,
      status: 'review',
      fetchedAt: new Date().toISOString(),
    })),
    read: vi.fn(async (_reference, id): Promise<IdentityEvidence> => ({
      vendor: 'didit',
      reference,
      correlation: id,
      status: 'approved',
      fetchedAt: new Date().toISOString(),
    })),
  };
  const onboarding = new OnboardingService(
    {
      version: '1',
      provider: {
        name: 'Example Wallets',
        origin: 'https://wallet.example.test',
        privacyUrl: 'https://wallet.example.test/privacy',
      },
      applications: [
        {
          issuer,
          clientId: 'moovha',
          name: 'Moovha <script>unsafe</script>',
          funding: { agreement: 'example-contract', monthlyLimitMinor: 0 },
        },
      ],
    },
    store,
    [adapter],
  );
  const keys = await generateKeyPair('ES256');
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'ephemeral',
    alg: 'ES256',
  };
  const authenticate = createAuthenticator(
    { issuer, audience: 'wallet', jwksUrl: issuer + '/jwks' },
    createLocalJWKSet({ keys: [jwk] }),
  );
  async function token(
    scope = 'wallet:access wallet:access:read wallet:provision wallet:account:read wallet:sign',
  ) {
    const now = Math.floor(Date.now() / 1000);
    return (
      'Bearer ' +
      (await new SignJWT({
        iss: issuer,
        aud: 'wallet',
        sub: 'app-service',
        client_id: 'moovha',
        iat: now,
        exp: now + 300,
        jti: randomUUID(),
        scope,
      })
        .setProtectedHeader({ alg: 'ES256', kid: 'ephemeral', typ: 'at+jwt' })
        .sign(keys.privateKey))
    );
  }
  const csrf = randomBytes(32).toString('base64url');
  const login = {
    start: vi.fn(async () => 'https://login.example.test/authorize'),
    finish: vi.fn(async () => ({
      sessionToken: 'a'.repeat(43),
      requestId: 'access',
    })),
    session: vi.fn(async (value: string) => {
      if (!['a'.repeat(43), 'b'.repeat(43)].includes(value))
        throw new AuthenticationError(401);
      return {
        csrf,
        identity: {
          issuer: 'https://provider-id.example.test',
          subject: value.startsWith('a') ? 'alice' : 'reviewer',
          authenticatedAt: Date.now(),
        },
      };
    }),
  };
  const createAccount = vi.fn(async (accountId: string) => ({
    accountId,
    address: '0x1111111111111111111111111111111111111111',
  }));
  const backend = createJournaledWalletProvider(
    {
      provider: 'offline',
      createAccount,
      findAccount: vi.fn(),
      signTypedData: vi.fn(),
    },
    {
      namespace: 'test',
      journal: createOnboardingJournal(store),
      authorizeAttempt: (r) =>
        onboarding.canDispatchProvision(r.attemptId, r.accountId),
    },
  );
  const app = await createServer({
    authenticate,
    service: new EmbeddedWalletService(onboarding.walletAuthority(), backend),
    ready: async () => true,
    onboarding: {
      service: onboarding,
      login,
      apiExplorerLogin,
      reviewers: ['reviewer'],
    },
  });
  servers.push(app);
  const headers = {
    authorization: await token(),
    'idempotency-key': randomUUID(),
  };
  const payload = {
    mode: 'create',
    authorization_details: [
      { type: accessType, actions: ['account:read', 'operations:request'] },
    ],
  };
  const result = await app.inject({
    method: 'POST',
    url: '/v1/access-requests',
    headers,
    payload,
  });
  expect(result.statusCode).toBe(200);
  return {
    app,
    onboarding,
    headers,
    payload,
    csrf,
    receipt: result.json(),
    token,
    createAccount,
    adapter,
    login,
  };
}
function formHeaders(csrfOwner = 'a') {
  return {
    cookie: '__Host-wpk-session=' + csrfOwner.repeat(43),
    origin: 'https://wallet.example.test',
    'content-type': 'application/x-www-form-urlencoded',
  };
}
it('provides a human consent/review flow, then reads and provisions a granted account', async () => {
  const f = await setup();
  const page = await f.app.inject({
    url: '/onboarding/' + f.receipt.request_id,
    headers: { cookie: formHeaders().cookie },
  });
  expect(page.statusCode).toBe(200);
  expect(page.headers['content-type']).toContain('text/html');
  expect(page.body).toContain('Read your wallet address');
  expect(page.body).toContain('&lt;script&gt;');
  expect(page.body).not.toContain('<script>unsafe');
  expect(page.headers['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(page.headers['cache-control']).toBe('no-store');
  const consent = await f.app.inject({
    method: 'POST',
    url: '/onboarding/' + f.receipt.request_id,
    headers: formHeaders(),
    payload: new URLSearchParams({
      csrf: f.csrf,
      decision: 'approve',
    }).toString(),
  });
  expect(consent.statusCode).toBe(302);
  const imported = await f.app.inject({
    method: 'POST',
    url: `/v1/access-requests/${f.receipt.request_id}/identity`,
    headers: f.headers,
    payload: { vendor: 'didit', share_token: 'opaque-secret' },
  });
  expect(imported.statusCode).toBe(200);
  expect(imported.json().status).toBe('provider_review_required');
  const queue = await f.app.inject({
    url: '/onboarding/review',
    headers: { cookie: formHeaders('b').cookie },
  });
  expect(queue.statusCode).toBe(200);
  expect(queue.body).toContain('alice');
  expect(queue.body).not.toContain('opaque-secret');
  const reviewed = await f.app.inject({
    method: 'POST',
    url: '/onboarding/review/' + f.receipt.request_id,
    headers: formHeaders('b'),
    payload: new URLSearchParams({
      csrf: f.csrf,
      vendor: 'didit',
      decision: 'accept',
      identity_matches_owner: 'yes',
      verified_at: new Date().toISOString(),
    }).toString(),
  });
  expect(reviewed.statusCode).toBe(302);
  const polled = await f.app.inject({
    url: '/v1/access-requests/' + f.receipt.request_id,
    headers: f.headers,
  });
  const granted = polled.json();
  expect(granted.status).toBe('granted');
  expect(polled.body).not.toMatch(/alice|reviewer|opaque-secret|reference/);
  const provisioned = await f.app.inject({
    method: 'POST',
    url: `/v1/accounts/${granted.account_id}/provision`,
    headers: f.headers,
    payload: {},
  });
  expect(provisioned.statusCode).toBe(200);
  expect(f.createAccount).toHaveBeenCalledTimes(1);
  const account = await f.app.inject({
    url: `/v1/accounts/${granted.account_id}`,
    headers: f.headers,
  });
  expect(account.json().status).toBe('provisioned');
  const revoked = await f.app.inject({
    method: 'POST',
    url: '/onboarding/access/' + granted.grant_id,
    headers: formHeaders(),
    payload: new URLSearchParams({
      csrf: f.csrf,
      decision: 'revoked',
    }).toString(),
  });
  expect(revoked.statusCode).toBe(302);
  expect(
    (
      await f.app.inject({
        url: `/v1/accounts/${granted.account_id}`,
        headers: f.headers,
      })
    ).statusCode,
  ).toBe(403);
});
it('keeps owner consent separate from requester authentication and rejects CSRF, cross-site and duplicate form fields', async () => {
  const f = await setup();
  const url = '/onboarding/' + f.receipt.request_id;
  for (const [headers, payload] of [
    [
      formHeaders(),
      new URLSearchParams({
        csrf: 'x'.repeat(43),
        decision: 'approve',
      }).toString(),
    ],
    [
      { ...formHeaders(), origin: 'https://attacker.example.test' },
      new URLSearchParams({ csrf: f.csrf, decision: 'approve' }).toString(),
    ],
    [
      { ...formHeaders(), 'sec-fetch-site': 'cross-site' },
      new URLSearchParams({ csrf: f.csrf, decision: 'approve' }).toString(),
    ],
    [formHeaders(), `csrf=${f.csrf}&decision=approve&decision=deny`],
  ] as const) {
    const result = await f.app.inject({
      method: 'POST',
      url,
      headers,
      payload,
    });
    expect([400, 403]).toContain(result.statusCode);
    expect(result.headers['content-type']).toContain('text/html');
  }
  expect(
    (
      await f.app.inject({
        url: '/onboarding/review',
        headers: { cookie: formHeaders().cookie },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: '/v1/access-requests',
        headers: { ...f.headers, authorization: await f.token('wallet:sign') },
        payload: f.payload,
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await f.onboarding.read(
        {
          principal: {
            issuer: 'https://apps.example.test',
            subject: 'app-service',
            clientId: 'moovha',
            scopes: ['wallet:access:read'],
          },
          idempotencyKey: randomUUID(),
        },
        f.receipt.request_id,
      )
    ).status,
  ).toBe('consent_required');
});
it('shows pending requests and lets only their authenticated owner cancel with CSRF protection', async () => {
  const f = await setup();
  await f.app.inject({
    method: 'POST',
    url: '/onboarding/' + f.receipt.request_id,
    headers: formHeaders(),
    payload: new URLSearchParams({
      csrf: f.csrf,
      decision: 'approve',
    }).toString(),
  });
  const page = await f.app.inject({
    url: '/onboarding/access',
    headers: { cookie: formHeaders().cookie },
  });
  expect(page.body).toContain('Cancel request');
  const url = `/onboarding/requests/${f.receipt.request_id}/cancel`;
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url,
        headers: formHeaders('b'),
        payload: new URLSearchParams({ csrf: f.csrf }).toString(),
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url,
        headers: formHeaders(),
        payload: new URLSearchParams({ csrf: 'x'.repeat(43) }).toString(),
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url,
        headers: formHeaders(),
        payload: new URLSearchParams({ csrf: f.csrf }).toString(),
      })
    ).statusCode,
  ).toBe(302);
  const receipt = await f.app.inject({
    url: '/v1/access-requests/' + f.receipt.request_id,
    headers: f.headers,
  });
  expect(receipt.json().status).toBe('denied');
  expect(f.adapter.importShared).not.toHaveBeenCalled();
});

it('opens provider login with a secure browser cookie and rejects an unavailable default profile', async () => {
  const f = await setup();
  const response = await f.app.inject({
    url: '/onboarding/' + f.receipt.request_id,
  });
  expect(response.statusCode).toBe(302);
  expect(response.headers.location).toBe(
    'https://login.example.test/authorize',
  );
  expect(response.headers['set-cookie']).toContain(
    'Secure; HttpOnly; SameSite=Lax',
  );
  const app = await createServer();
  servers.push(app);
  const result = await app.inject({
    method: 'POST',
    url: '/v1/access-requests',
    headers: { 'idempotency-key': randomUUID() },
    payload: f.payload,
  });
  expect(result.statusCode).toBe(503);
  expect((await app.inject({ url: '/onboarding/access' })).statusCode).toBe(
    503,
  );
});

it('allows only the configured fixed explorer login return target', async () => {
  for (const enabled of [false, true]) {
    const fixture = await setup(enabled);
    fixture.login.finish.mockResolvedValue({
      sessionToken: 'a'.repeat(43),
      requestId: 'api-explorer',
    });
    const response = await fixture.app.inject(
      '/onboarding/callback?state=offline',
    );
    expect(response.statusCode).toBe(enabled ? 302 : 403);
    if (enabled) expect(response.headers.location).toBe('/docs/');
  }
});
