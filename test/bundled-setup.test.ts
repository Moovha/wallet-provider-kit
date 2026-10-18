import { readFile, mkdtemp, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBundledAuthorizationServer } from '../src/deployment/authorization-server.js';
import { generateDeploymentSecrets } from '../src/deployment/deployment-secrets.js';
import {
  bundledOAuth,
  initialApplicationScopes,
} from '../src/deployment/authorization-contract.js';
import {
  validateProviderConfiguration,
  type ProviderConfiguration,
} from '../src/deployment/config.js';
import { createServer } from '../src/service/server.js';
import { createSetupExecutor } from '../src/deployment/setup-executor.js';
import {
  emptyConfiguration,
  synchronizeBundledServices,
} from '../setup-ui/model.js';

let config: ProviderConfiguration;
const closers: (() => Promise<void>)[] = [];
beforeEach(async () => {
  config = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.example.json', import.meta.url),
      'utf8',
    ),
  );
  config.oauth = bundledOAuth(config.policy.provider.origin);
  for (const app of config.policy.applications)
    app.issuer = config.oauth.issuer;
  config.authorizationServer = {
    signingKey: { env: 'OFFLINE_ISSUER_KEY' },
    clients: config.policy.applications.map((app, i) => ({
      clientId: app.clientId,
      clientSecret: { env: `OFFLINE_CLIENT_${i}_SECRET` },
      scopes: [...initialApplicationScopes],
    })),
  };
});
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  vi.unstubAllEnvs();
});
function secrets() {
  const values = generateDeploymentSecrets(config, {});
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
  return values;
}
async function server() {
  const issuer = createBundledAuthorizationServer(config);
  const app = await createServer({
    authorizationServer: issuer,
    authenticate: issuer.authenticate,
    documentation: false,
  });
  closers.push(() => app.close());
  return { app, issuer };
}
async function token(
  app: Awaited<ReturnType<typeof server>>['app'],
  extra: Record<string, string | undefined> = {},
) {
  const client = config.authorizationServer!.clients[0];
  return app.inject({
    method: 'POST',
    url: '/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: client.clientId,
      client_secret: process.env[client.clientSecret.env]!,
      scope: 'wallet:access',
      ...Object.fromEntries(
        Object.entries(extra).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
    }).toString(),
  });
}

it('issues the strict access-token profile, publishes public-only keys, pins discovery and retains verification across restart', async () => {
  secrets();
  const { app, issuer } = await server();
  const discovery = await app.inject({
    url: '/oauth/.well-known/openid-configuration',
    headers: {
      host: 'attacker.invalid',
      'x-forwarded-host': 'attacker.invalid',
      'x-forwarded-proto': 'http',
    },
  });
  expect(discovery.statusCode).toBe(200);
  expect(discovery.json()).toMatchObject({
    issuer: config.oauth.issuer,
    token_endpoint: config.oauth.issuer + '/token',
    jwks_uri: config.oauth.jwksUrl,
    grant_types_supported: ['client_credentials'],
  });
  const jwks = (await app.inject('/oauth/jwks')).json();
  expect(jwks.keys[0].d).toBeUndefined();
  expect(jwks.keys[0].alg).toBe('RS256');
  const response = await token(app);
  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.expires_in).toBe(300);
  const principal = await issuer.authenticate(
    `Bearer ${body.access_token}`,
    'wallet:access',
  );
  expect(principal.clientId).toBe(
    config.authorizationServer!.clients[0].clientId,
  );
  const restarted = createBundledAuthorizationServer(config);
  await expect(
    restarted.authenticate(`Bearer ${body.access_token}`, 'wallet:access'),
  ).resolves.toEqual(principal);
  await expect(
    issuer.authenticate(`Bearer ${body.access_token}`, 'wallet:sign'),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/accounts/00000000-0000-4000-8000-000000000000/provision',
        headers: { authorization: `Bearer ${body.access_token}` },
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
});

it('denies invalid secrets, unregistered clients, elevated scopes, foreign resources, interactive grants and registration', async () => {
  secrets();
  const { app } = await server();
  for (const extra of [
    { client_secret: 'incorrect' },
    { client_id: 'unregistered' },
    { scope: 'wallet:sign' },
    { scope: 'staff:review' },
    { resource: 'https://elsewhere.invalid/api' },
    { grant_type: 'password' },
    { grant_type: 'refresh_token' },
  ])
    expect(
      (await token(app, extra)).statusCode,
      JSON.stringify(extra),
    ).toBeGreaterThanOrEqual(400);
  for (const url of ['/oauth/auth', '/oauth/reg', '/oauth/session/end'])
    expect((await app.inject(url)).statusCode).toBe(404);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/oauth/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'x'.repeat(60000),
      })
    ).statusCode,
  ).toBeGreaterThanOrEqual(400);
});

it('rejects stale tokens after application removal or scope reduction and rejects missing or weak retained credentials', async () => {
  const values = secrets();
  const { app } = await server();
  const issued = (await token(app)).json().access_token;
  config.authorizationServer!.clients[0].scopes = ['wallet:account:read'];
  await expect(
    createBundledAuthorizationServer(config).authenticate(
      `Bearer ${issued}`,
      'wallet:access',
    ),
  ).rejects.toMatchObject({ status: 401 });
  vi.stubEnv(config.authorizationServer!.clients[0].clientSecret.env, 'weak');
  expect(() => createBundledAuthorizationServer(config)).toThrow();
  for (const value of [
    '',
    '{}',
    JSON.stringify({ kty: 'oct', k: 'invalid' }),
  ]) {
    vi.stubEnv(config.authorizationServer!.signingKey.env, value);
    expect(() => createBundledAuthorizationServer(config)).toThrow();
  }
  expect(generateDeploymentSecrets(config, values)).toEqual(values);
});

it('requires exact issuer binding, unique credentials and an enabled application for each registration', () => {
  expect(validateProviderConfiguration(config)).toEqual(config);
  for (const alter of [
    (c: ProviderConfiguration) => {
      c.oauth.issuer = 'https://other.invalid';
    },
    (c: ProviderConfiguration) => {
      c.authorizationServer!.clients[0].clientId = 'unknown';
    },
    (c: ProviderConfiguration) => {
      c.authorizationServer!.clients[0].clientSecret =
        c.authorizationServer!.signingKey;
    },
    (c: ProviderConfiguration) => {
      c.policy.applications[0].enabled = false;
    },
    (c: ProviderConfiguration) => {
      c.authorizationServer!.clients[0].scopes.push('staff:review');
    },
  ]) {
    const changed = structuredClone(config);
    alter(changed);
    expect(() => validateProviderConfiguration(changed)).toThrow();
  }
});

it('defaults to the bundled issuer and OWS, synchronizes registrations without replacing retained secret references', () => {
  const draft = emptyConfiguration(config);
  expect(draft.backend.kind).toBe('ows');
  expect(draft.authorizationServer).toBeDefined();
  const secret = draft.authorizationServer!.clients[0].clientSecret;
  draft.policy.provider.origin = 'https://wallet.example.test';
  synchronizeBundledServices(draft);
  expect(draft.oauth).toEqual(bundledOAuth('https://wallet.example.test'));
  expect(draft.authorizationServer!.clients[0].clientSecret).toEqual(secret);
  expect(draft.authorizationServer!.clients[0].scopes).not.toContain(
    'wallet:sign',
  );
});

it('creates a private retained vault and generated secrets without returning secrets in plans, progress or command arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wpk-bundle-'));
  closers.push(() => rm(root, { recursive: true, force: true }));
  config.http = { ...config.http, ingress: 'caddy' };
  config.backend = {
    kind: 'ows',
    binding: 'bundled-offline',
    vaultDirectory: 'native-vault',
    passphrase: { env: 'OFFLINE_VAULT_PASSPHRASE' },
  };
  const calls: string[][] = [];
  const run = createSetupExecutor({
    root: join(root, 'deployments'),
    environment: {},
    command: async (args) => {
      calls.push(args);
      if (args[0] === 'context') return 'unix:///offline/docker.sock';
      if (args.includes('version')) return '2.40.0';
      if (args.includes('info')) return 'linux';
      return '';
    },
  });
  const plan = await run.prepare(config);
  expect(plan.secrets.every((entry) => entry.generated)).toBe(true);
  run.start(plan.id, {});
  await run.settled();
  expect(run.status().state).toBe('complete');
  const values = parseEnv(
    await readFile(join(plan.directory, 'provider.env'), 'utf8'),
  );
  for (const value of Object.values(values))
    expect(JSON.stringify([plan, run.status(), calls])).not.toContain(value);
  expect(
    (await lstat(join(plan.directory, '.provider-vault'))).mode & 0o777,
  ).toBe(0o700);
  const compose = JSON.parse(
    await readFile(join(plan.directory, 'compose.json'), 'utf8'),
  );
  expect(
    compose.services.api.volumes.some(
      (entry: { target: string }) => entry.target === '/config/.provider-vault',
    ),
  ).toBe(true);
  expect(compose.services.https.profiles).toEqual(['https']);
  expect(compose.services.https.image).toContain('@sha256:');
  expect(
    compose.services.https.volumes.some(
      (entry: { target: string }) => entry.target === '/secrets/provider.env',
    ),
  ).toBe(false);
  expect(
    (await lstat(join(plan.directory, '.provider-tls'))).mode & 0o777,
  ).toBe(0o700);
  const caddy = JSON.parse(
    await readFile(join(plan.directory, 'caddy.json'), 'utf8'),
  );
  expect(caddy.admin.disabled).toBe(true);
  expect(caddy.apps.http.servers.provider.routes[0].match[0].host).toEqual([
    new URL(config.policy.provider.origin).hostname,
  ]);
  expect(calls.find((args) => args.includes('up'))).not.toContain('--profile');
  await run.stop();
  expect(
    parseEnv(await readFile(join(plan.directory, 'provider.env'), 'utf8')),
  ).toEqual(values);
});

it('refuses issuer diagnostic logging that could disclose token request data', () => {
  secrets();
  vi.stubEnv('DEBUG', 'oidc-provider:*');
  expect(() => createBundledAuthorizationServer(config)).toThrow();
});

it('isolates client credentials and denies a valid provisioning token while the wallet service is unconfigured', async () => {
  const original = config.authorizationServer!.clients[0];
  config.policy.applications.push({
    ...structuredClone(config.policy.applications[0]),
    clientId: 'second-server',
  });
  config.authorizationServer!.clients.push({
    clientId: 'second-server',
    clientSecret: { env: 'OFFLINE_SECOND_CLIENT_SECRET' },
    scopes: ['wallet:account:read'],
  });
  secrets();
  const { app } = await server();
  expect(
    (
      await token(app, {
        client_id: 'second-server',
        scope: 'wallet:account:read',
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await token(app, {
        client_id: 'second-server',
        client_secret: process.env.OFFLINE_SECOND_CLIENT_SECRET,
        scope: 'wallet:access',
      })
    ).statusCode,
  ).toBe(400);
  const response = await token(app, { scope: 'wallet:provision' });
  expect(response.statusCode).toBe(200);
  const result = await app.inject({
    method: 'POST',
    url: '/v1/accounts/00000000-0000-4000-8000-000000000000/provision',
    headers: {
      authorization: `Bearer ${response.json().access_token}`,
      'idempotency-key': '00000000-0000-4000-8000-000000000001',
    },
    payload: {},
  });
  expect(result.statusCode).toBe(503);
  expect(original.clientSecret.env).not.toBe('OFFLINE_SECOND_CLIENT_SECRET');
});

it('issues administration tokens only to separately configured provider service operators', async () => {
  config.runtimeConfiguration = {
    operators: [
      {
        issuer: config.oauth.issuer,
        clientId: 'provider-operator',
        subject: 'provider-operator',
      },
    ],
  };
  config.authorizationServer!.operatorClients = [
    {
      clientId: 'provider-operator',
      clientSecret: { env: 'OFFLINE_OPERATOR_SECRET' },
    },
  ];
  expect(validateProviderConfiguration(config)).toEqual(config);
  secrets();
  const { app, issuer } = await server();
  expect(
    (await token(app, { scope: 'wallet:configuration:write' })).statusCode,
  ).toBe(400);
  expect(
    (
      await token(app, {
        client_id: 'provider-operator',
        scope: 'wallet:configuration:write',
      })
    ).statusCode,
  ).toBe(401);
  const response = await token(app, {
    client_id: 'provider-operator',
    client_secret: process.env.OFFLINE_OPERATOR_SECRET,
    scope: 'wallet:configuration:write',
  });
  expect(response.statusCode).toBe(200);
  await expect(
    issuer.authenticate(
      `Bearer ${response.json().access_token}`,
      'wallet:configuration:write',
    ),
  ).resolves.toMatchObject({
    clientId: 'provider-operator',
    subject: 'provider-operator',
  });
  expect(
    (
      await token(app, {
        client_id: 'provider-operator',
        client_secret: process.env.OFFLINE_OPERATOR_SECRET,
        scope: 'wallet:sign',
      })
    ).statusCode,
  ).toBe(400);
  config.authorizationServer!.operatorClients[0].clientId =
    config.authorizationServer!.clients[0].clientId;
  expect(() => validateProviderConfiguration(config)).toThrow();
});
