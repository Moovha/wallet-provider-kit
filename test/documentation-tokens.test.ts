import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createServer } from '../src/service/server.js';
import { AuthenticationError } from '../src/service/auth.js';
import type { DocumentationTokenOptions } from '../src/service/documentation-tokens.js';
const servers: Awaited<ReturnType<typeof createServer>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
});
async function fixture(enabled = true) {
  const csrf = randomBytes(32).toString('base64url');
  const token = randomBytes(32).toString('base64url');
  const issue = vi.fn(async () => ({
    access_token: 'offline-fixture-token',
    expires_at: Date.now() + 600000,
    scope: 'wallet:account:read',
  }));
  let allowed = true;
  const identity = {
    issuer: 'https://login.example.test',
    subject: 'operator',
    authenticatedAt: Date.now(),
  };
  const options: DocumentationTokenOptions = {
    origin: 'https://wallet.example.test',
    issuer: identity.issuer,
    operators: ['operator'],
    applications: [
      {
        clientId: 'application',
        name: 'Example',
        scopes: ['wallet:account:read'],
      },
    ],
    currentConfiguration: async () => allowed,
    login: {
      start: vi.fn(async () => 'https://login.example.test/authorize'),
      finish: vi.fn(),
      session: vi.fn(async (value) => {
        if (value !== token) throw new AuthenticationError(401);
        return { csrf, identity };
      }),
    },
    issue,
  };
  const app = await createServer({
    documentation: enabled,
    documentationTokens: options,
  });
  servers.push(app);
  const headers = {
    host: 'wallet.example.test',
    origin: options.origin,
    cookie: `__Host-wpk-session=${token}`,
    'sec-fetch-site': 'same-origin',
  };
  const body = {
    client_id: 'application',
    scopes: ['wallet:account:read'],
    csrf,
  };
  return {
    app,
    headers,
    body,
    options,
    identity,
    issue,
    fence: () => {
      allowed = false;
    },
  };
}
describe('operator-only application token broker', () => {
  it('requires a fresh listed operator, exact host/origin/CSRF and permitted client/scopes before issuer calls', async () => {
    const f = await fixture();
    let address = 1;
    for (const extra of [
      { cookie: '' },
      { origin: 'https://foreign.example' },
      { host: 'foreign.example' },
      { 'sec-fetch-site': 'cross-site' },
    ]) {
      const reply = await f.app.inject({
        method: 'POST',
        remoteAddress: `127.0.0.${address++}`,
        url: '/docs/operator/token',
        headers: { ...f.headers, ...extra },
        payload: f.body,
      });
      expect([401, 403]).toContain(reply.statusCode);
    }
    for (const extra of [
      { csrf: 'x'.repeat(43) },
      { client_id: 'unlisted' },
      { scopes: ['wallet:sign'] },
    ]) {
      expect(
        (
          await f.app.inject({
            method: 'POST',
            remoteAddress: `127.0.0.${address++}`,
            url: '/docs/operator/token',
            headers: f.headers,
            payload: { ...f.body, ...extra },
          })
        ).statusCode,
      ).toBe(403);
    }
    f.identity.subject = 'reviewer';
    expect(
      (
        await f.app.inject({
          url: '/docs/operator/session',
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(403);
    f.identity.subject = 'operator';
    f.identity.issuer = 'https://wrong.example';
    expect(
      (
        await f.app.inject({
          url: '/docs/operator/session',
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(403);
    f.identity.issuer = f.options.issuer;
    f.identity.authenticatedAt = Date.now() - 301000;
    expect(
      (
        await f.app.inject({
          url: '/docs/operator/session',
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(403);
    expect(f.issue).not.toHaveBeenCalled();
  });
  it('lists only safe metadata, issues/renews on explicit POST, clears the browser cookie and fences old instances', async () => {
    const f = await fixture();
    const session = await f.app.inject({
      url: '/docs/operator/session',
      headers: f.headers,
    });
    expect(session.statusCode).toBe(200);
    expect(session.headers['cache-control']).toBe('no-store');
    expect(session.json()).toEqual({
      csrf: f.body.csrf,
      applications: f.options.applications,
    });
    expect(session.body).not.toContain('access_token');
    for (let count = 0; count < 2; count++) {
      const response = await f.app.inject({
        method: 'POST',
        url: '/docs/operator/token',
        headers: f.headers,
        payload: f.body,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().access_token).toBe('offline-fixture-token');
    }
    expect(f.issue).toHaveBeenCalledTimes(2);
    const logout = await f.app.inject({
      method: 'POST',
      url: '/docs/operator/logout',
      headers: f.headers,
      payload: { csrf: f.body.csrf },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
    f.fence();
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/docs/operator/token',
          headers: f.headers,
          payload: f.body,
        })
      ).statusCode,
    ).toBe(403);
    expect(f.issue).toHaveBeenCalledTimes(2);
  });
  it('limits repeated issuance without adding further issuer calls', async () => {
    const f = await fixture();
    for (let count = 0; count < 6; count++) {
      const response = await f.app.inject({
        method: 'POST',
        url: '/docs/operator/token',
        headers: f.headers,
        payload: f.body,
      });
      expect(response.statusCode).toBe(count < 5 ? 200 : 429);
    }
    expect(f.issue).toHaveBeenCalledTimes(5);
  });
  it('keeps token endpoints hidden/disabled when docs are disabled and sanitizes issuer failures', async () => {
    const disabled = await fixture(false);
    expect(
      (
        await disabled.app.inject({
          url: '/docs/operator/session',
          headers: disabled.headers,
        })
      ).statusCode,
    ).toBe(404);
    const f = await fixture();
    f.issue.mockRejectedValue(new Error('sensitive issuer response'));
    const failure = await f.app.inject({
      method: 'POST',
      url: '/docs/operator/token',
      headers: f.headers,
      payload: f.body,
    });
    expect(failure.statusCode).toBe(503);
    expect(failure.body).not.toContain('sensitive');
    expect((await f.app.inject('/openapi.json')).body).not.toContain(
      '/docs/operator',
    );
    const login = await f.app.inject({
      url: '/docs/operator/login',
      headers: f.headers,
    });
    expect(login.statusCode).toBe(302);
    expect(f.options.login.start).toHaveBeenCalledWith(
      'api-explorer',
      expect.any(String),
    );
  });
});
