import { expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type {
  OnboardingStore,
  ProviderState,
} from '../src/onboarding/types.js';
import {
  ManagementService,
  managementScopes,
} from '../src/management/service.js';
import { createManagementAuthorizationServer } from '../src/management/authorization.js';
import { createServer } from '../src/service/server.js';
import { generateDeploymentSecrets } from '../src/deployment/deployment-secrets.js';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import { runtimeApplicationId } from '../src/runtime-configuration/service.js';
import { defineOnboardingPolicy } from '../src/onboarding/policy.js';

async function fixture() {
  const config = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  );
  config.policy.applications = [];
  config.oauth = {
    issuer: config.policy.provider.origin + '/oauth',
    audience: config.policy.provider.origin + '/api',
    jwksUrl: config.policy.provider.origin + '/oauth/jwks',
  };
  config.runtimeConfiguration.operators = [];
  config.authorizationServer = {
    signingKey: { env: 'OFFLINE_MANAGEMENT_KEY' },
    clients: [],
  };
  config.management = { claim: { env: 'OFFLINE_MANAGEMENT_CLAIM' } };
  const checked = validateProviderConfiguration(config);
  let state = {
    format: 'moovha-onboarding-1',
    grants: {},
    audit: [],
  } as unknown as ProviderState;
  const store: OnboardingStore = {
    async transaction(operation) {
      const next = structuredClone(state);
      const value = operation(next);
      const result = structuredClone(value);
      state = next;
      return result;
    },
  };
  let now = Date.now();
  const service = new ManagementService(
    store,
    () => structuredClone(state.management?.provider),
    checked.oauth.issuer,
    checked.policy,
    () => now,
  );
  const claim = randomBytes(48).toString('base64url');
  await service.initialize(claim);
  return {
    config: checked,
    service,
    claim,
    store,
    snapshot: () => structuredClone(state.management?.provider),
    expire: () => {
      now += 31 * 60_000;
    },
  };
}
const password = () => randomBytes(32).toString('base64url');

it('supports an empty installation and claims exactly once across reinitialization and concurrency', async () => {
  const f = await fixture();
  expect(defineOnboardingPolicy(f.config.policy).applications).toEqual([]);
  const input = { claim: f.claim, username: 'admin', password: password() };
  const results = await Promise.allSettled([
    f.service.claim(input),
    f.service.claim(input),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const restarted = new ManagementService(
    f.store,
    f.snapshot,
    f.config.oauth.issuer,
    f.config.policy,
  );
  await restarted.initialize(randomBytes(48).toString('base64url'));
  await expect(restarted.claim(input)).rejects.toThrow();
  expect(f.snapshot()?.claimHash).toBe('');
});
it('rejects expired claims without resetting expiry on initialization', async () => {
  const f = await fixture();
  f.expire();
  await f.service.initialize(f.claim);
  await expect(
    f.service.claim({
      claim: f.claim,
      username: 'admin',
      password: password(),
    }),
  ).rejects.toThrow();
});
it('fences stale credentials, revokes grants and does not expose secret verifiers or replay secrets', async () => {
  const f = await fixture(),
    adminPassword = password();
  await f.service.claim({
    claim: f.claim,
    username: 'admin',
    password: adminPassword,
  });
  const operator = await f.service.verifyCredentials(
    'operator-admin',
    adminPassword,
    managementScopes,
  );
  const key = randomUUID();
  const input = {
    name: 'Offline application',
    role: 'application' as const,
    scopes: ['wallet:access', 'wallet:configuration:propose'],
  };
  const created = (await f.service.mutate(operator, key, 'create', input)) as {
    id: string;
    client_secret: string;
  };
  expect(JSON.stringify(created)).not.toMatch(/verifier|salt/);
  expect(
    (await f.service.mutate(operator, key, 'create', input)) as object,
  ).not.toHaveProperty('client_secret');
  await expect(
    f.service.mutate(operator, key, 'create', { ...input, name: 'changed' }),
  ).rejects.toThrow();
  const app = await f.service.verifyCredentials(
    created.id,
    created.client_secret,
    ['wallet:access'],
  );
  expect(() => f.service.assertOperator(app)).toThrow();
  expect(() => f.service.application(app)).toThrow();
  const trusted = (await f.service.mutate(operator, randomUUID(), 'update', {
    id: created.id,
    expected_revision: 1,
    trust_agreement: 'offline agreement',
    scopes: ['wallet:access'],
    permissions: ['account:read'],
  })) as { revision: number };
  expect(() => f.service.currentPrincipal(app)).toThrow();
  await expect(
    f.service.verifyCredentials(created.id, created.client_secret, [
      'wallet:configuration:propose',
    ]),
  ).rejects.toThrow();
  const fresh = await f.service.verifyCredentials(
    created.id,
    created.client_secret,
    ['wallet:access'],
  );
  expect(f.service.application(fresh).assertionTrust?.agreement).toBe(
    'offline agreement',
  );
  await f.store.transaction((state) => {
    state.grants.offline = { caller: fresh, state: 'active' } as never;
  });
  const renamed = (await f.service.mutate(operator, randomUUID(), 'update', {
    id: created.id,
    expected_revision: trusted.revision,
    name: 'Renamed application',
  })) as { revision: number };
  expect(() => f.service.currentPrincipal(fresh)).not.toThrow();
  expect(await f.store.transaction((state) => state.grants.offline.state)).toBe(
    'active',
  );

  const rotated = (await f.service.mutate(operator, randomUUID(), 'rotate', {
    id: created.id,
    expected_revision: renamed.revision,
  })) as { client_secret: string; revision: number };
  expect(() => f.service.currentPrincipal(fresh)).toThrow();
  await expect(
    f.service.verifyCredentials(created.id, created.client_secret, [
      'wallet:access',
    ]),
  ).rejects.toThrow();
  expect(await f.store.transaction((s) => s.grants.offline.state)).toBe(
    'active',
  );
  const current = await f.service.verifyCredentials(
    created.id,
    rotated.client_secret,
    ['wallet:access'],
  );
  await f.service.mutate(operator, randomUUID(), 'update', {
    id: created.id,
    expected_revision: rotated.revision,
    enabled: false,
  });
  expect(() => f.service.application(current)).toThrow();
  expect(await f.store.transaction((s) => s.grants.offline.state)).toBe(
    'revoked',
  );
  expect(f.service.applications()).toEqual([]);
  expect(runtimeApplicationId(f.config.oauth.issuer, created.id)).toHaveLength(
    64,
  );
});
it('serves protected management with execution disabled and rejects application privilege escalation', async () => {
  const f = await fixture(),
    adminPassword = password();
  const values = generateDeploymentSecrets(f.config, {});
  const previous = process.env.OFFLINE_MANAGEMENT_KEY;
  process.env.OFFLINE_MANAGEMENT_KEY = values.OFFLINE_MANAGEMENT_KEY;
  const issuer = await createManagementAuthorizationServer(f.config, f.service);
  const app = await createServer({
    management: f.service,
    authenticate: issuer.authenticate,
    authorizationServer: issuer,
    managementReady: async () => true,
    ready: async () => false,
    providerOrigin: f.config.policy.provider.origin,
    documentation: false,
  });
  try {
    expect((await app.inject('/health/management')).statusCode).toBe(200);
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
    expect((await app.inject('/v1/provider/status')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/provider/claim',
          payload: {
            claim: f.claim,
            username: 'admin',
            password: adminPassword,
          },
          headers: { origin: 'https://untrusted.example.test' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/provider/claim',
          payload: {
            claim: f.claim,
            username: 'admin',
            password: adminPassword,
          },
        })
      ).statusCode,
    ).toBe(200);
    const issued = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'operator-admin',
        client_secret: adminPassword,
        scope: managementScopes.join(' '),
      }).toString(),
    });
    expect(issued.statusCode).toBe(200);
    const excessive = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'client_credentials',
        client_id: 'operator-admin',
        client_secret: adminPassword,
        scope: 'wallet:sign',
      },
    });
    expect(excessive.statusCode).toBe(400);
    expect(excessive.json()).toEqual({ error: 'invalid_scope' });

    const headers = {
      authorization: 'Bearer ' + issued.json().access_token,
      'idempotency-key': randomUUID(),
    };
    const status = await app.inject({ url: '/v1/provider/status', headers });
    expect(status.json()).toMatchObject({
      applications: [],
      wallet_operations_enabled: false,
      management_available: true,
    });
    const registered = await app.inject({
      method: 'POST',
      url: '/v1/provider/identities',
      headers,
      payload: {
        name: '<script>offline</script>',
        role: 'application',
        scopes: ['wallet:access'],
      },
    });
    expect(registered.statusCode).toBe(200);
    expect((await app.inject('/admin/')).body).toContain(
      'Set up administrator',
    );
    const identity = registered.json();
    const token = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'client_credentials',
        client_id: identity.id,
        client_secret: identity.client_secret,
        scope: 'wallet:access',
      },
    });
    expect(token.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: '/v1/provider/status',
          headers: { authorization: 'Bearer ' + token.json().access_token },
        })
      ).statusCode,
    ).toBe(403);
    await app.inject({
      method: 'POST',
      url: '/v1/provider/identities/' + identity.id + '/credentials',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { expected_revision: 1 },
    });
    await expect(
      issuer.authenticate(
        'Bearer ' + token.json().access_token,
        'wallet:access',
      ),
    ).rejects.toThrow();
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.OFFLINE_MANAGEMENT_KEY;
    else process.env.OFFLINE_MANAGEMENT_KEY = previous;
  }
});

it('keeps other application revisions stable and denies pending authority after trust changes', async () => {
  const f = await fixture(),
    secret = password();
  await f.service.claim({
    claim: f.claim,
    username: 'admin',
    password: secret,
  });
  const operator = await f.service.verifyCredentials(
    'operator-admin',
    secret,
    managementScopes,
  );
  const { OnboardingService } = await import('../src/onboarding/service.js');
  const { application } = await import('../src/onboarding/policy.js');
  const onboarding = new OnboardingService(
    f.config.policy,
    f.store,
    [],
    undefined,
    undefined,
    false,
    false,
    {
      list: () => f.service.applications(),
      current: (principal) => f.service.application(principal),
    },
  );
  const revision = onboarding.policy.revision;
  const first = (await f.service.mutate(operator, randomUUID(), 'create', {
    role: 'application',
    name: 'First',
  })) as { id: string; client_secret: string };
  await f.service.mutate(operator, randomUUID(), 'update', {
    id: first.id,
    expected_revision: 1,
    trust_agreement: 'First agreement',
  });
  const principal = await f.service.verifyCredentials(
    first.id,
    first.client_secret,
    ['wallet:access'],
  );
  expect(application(onboarding.policy, principal).name).toBe('First');
  await f.store.transaction((s) => {
    s.requests = { pending: { caller: principal } as never };
  });
  const second = (await f.service.mutate(operator, randomUUID(), 'create', {
    role: 'application',
    name: 'Second',
  })) as { id: string };
  await f.service.mutate(operator, randomUUID(), 'update', {
    id: second.id,
    expected_revision: 1,
    trust_agreement: 'Second agreement',
  });
  expect(onboarding.policy.revision).toBe(revision);
  expect(application(onboarding.policy, principal).name).toBe('First');
  await f.service.mutate(operator, randomUUID(), 'update', {
    id: first.id,
    expected_revision: 2,
    trust_agreement: null,
  });
  expect(() => application(onboarding.policy, principal)).toThrow();
  expect(await f.store.transaction((s) => s.requests.pending.denied)).toBe(
    true,
  );
});

it('requires private host recovery for expired claims and administrator recovery, without activating wallets', async () => {
  const f = await fixture();
  f.expire();
  const renewed = randomBytes(48).toString('base64url');
  await f.service.renewUnclaimedInstallation(renewed);
  await expect(
    f.service.claim({
      claim: f.claim,
      username: 'admin',
      password: password(),
    }),
  ).rejects.toThrow();
  await f.service.claim({
    claim: renewed,
    username: 'admin',
    password: password(),
  });
  await expect(f.service.renewUnclaimedInstallation(renewed)).rejects.toThrow();
  const recovered = password();
  await f.service.recoverAdministrator(recovered);
  expect(
    (
      await f.service.verifyCredentials(
        'operator-recovery',
        recovered,
        managementScopes,
      )
    ).clientId,
  ).toBe('operator-recovery');
  const recovery = await f.service.verifyCredentials(
    'operator-recovery',
    recovered,
    managementScopes,
  );
  await f.service.mutate(recovery, randomUUID(), 'update', {
    id: 'operator-admin',
    expected_revision: 1,
    enabled: false,
  });
  await expect(
    f.service.mutate(recovery, randomUUID(), 'update', {
      id: 'operator-recovery',
      expected_revision: 1,
      enabled: false,
    }),
  ).rejects.toThrow();
  expect(f.config.activation.enabled).toBe(false);
});

it('fails closed when management records disappear from a bound installation', async () => {
  const f = await fixture(),
    id = f.snapshot()!.installationId;
  await f.store.transaction((s) => {
    s.deploymentBindings = {
      'service-v1': {
        origin: f.config.policy.provider.origin,
        provider: 'offline',
        binding: 'offline',
        managementInstallationId: id,
      },
    };
    delete s.management!.provider;
  });
  await expect(f.service.initialize(f.claim)).rejects.toThrow();
});
