import { expect, it, vi } from 'vitest';
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
    expect(issued.json().expires_in).toBe(1800);
    const tokenTime = Date.now();
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(tokenTime + 29 * 60_000);
      await expect(
        issuer.authenticate(
          'Bearer ' + issued.json().access_token,
          'provider:manage',
        ),
      ).resolves.toBeDefined();
      vi.setSystemTime(tokenTime + 30 * 60_000 + 6_000);
      await expect(
        issuer.authenticate(
          'Bearer ' + issued.json().access_token,
          'provider:manage',
        ),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      vi.useRealTimers();
    }
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
    expect((await app.inject('/admin/')).body).toContain('First-time setup');
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
    expect(token.json().expires_in).toBe(300);
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 6 * 60_000);
      await expect(
        issuer.authenticate(
          'Bearer ' + token.json().access_token,
          'wallet:access',
        ),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      vi.useRealTimers();
    }
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

it('rejects debug logging before reading issuer secrets for a managed installation', async () => {
  const f = await fixture(),
    previous = process.env.DEBUG;
  const privateValue = randomBytes(32).toString('hex');
  process.env.DEBUG = privateValue;
  try {
    await expect(
      createManagementAuthorizationServer(f.config, f.service),
    ).rejects.toMatchObject({
      issues: [
        '/authorizationServer: disable DEBUG logging before running the bundled issuer',
      ],
    });
  } finally {
    if (previous === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = previous;
  }
});

it('updates shared user checks durably, fences old consent and preserves approvals on identical saves', async () => {
  const { OnboardingService } = await import('../src/onboarding/service.js');
  const f = await fixture(),
    adminPassword = password();
  await f.service.claim({
    claim: f.claim,
    username: 'checks-admin',
    password: adminPassword,
  });
  const operator = await f.service.verifyCredentials(
    'operator-checks-admin',
    adminPassword,
    managementScopes,
  );
  const created = await f.service.mutate(operator, randomUUID(), 'create', {
    name: 'Offline application',
    role: 'application',
  });
  if (!('id' in created) || !created.client_secret)
    throw new Error('Expected new application');
  await f.service.mutate(operator, randomUUID(), 'update', {
    id: created.id,
    expected_revision: created.revision,
    trust_agreement: 'offline-reviewed-agreement',
    permissions: ['account:read'],
  });
  const caller = await f.service.verifyCredentials(
    created.id,
    created.client_secret!,
    ['wallet:access', 'wallet:access:read', 'wallet:provision'],
  );
  await f.store.transaction((s) => {
    s.requests = {};
    s.accounts = {};
    s.evidenceOwners = {};
    s.idempotency = {};
    s.admissions = {};
  });
  const onboard = () =>
    new OnboardingService(
      { ...f.config.policy, applications: [] },
      f.store,
      [],
      undefined,
      undefined,
      false,
      true,
      {
        list: () => f.service.applications(),
        current: (p) => f.service.application(p),
        userChecks: () => f.service.currentUserChecks(),
      },
    );
  const onboarding = onboard();
  const context = () => ({ principal: caller, idempotencyKey: randomUUID() });
  const originalPolicy = onboarding.accessPolicy(caller);
  const input = {
    mode: 'create' as const,
    user: {
      id: 'offline-user',
      identity: {
        reference: 'offline-evidence',
        level: 'verified',
        verified_at: new Date(Date.now() - 1000).toISOString(),
        fields: { country: 'ZA' } as Record<string, string>,
      },
      consent: {
        reference: 'offline-consent',
        granted_at: new Date(Date.now() - 1000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        policy_revision: originalPolicy.policy_revision,
      },
    },
    authorization_details: [
      {
        type: 'https://moovha.com/wallet/account-access' as const,
        actions: ['account:read' as const],
      },
    ] as [
      {
        type: 'https://moovha.com/wallet/account-access';
        actions: ['account:read'];
      },
    ],
  };
  const access = await onboarding.request(context(), input);
  const admitted = await onboarding
    .walletAuthority()
    .provision(context(), access.account_id!);
  const {
    available: _available,
    revision,
    ...initial
  } = await f.service.readUserChecks(operator);
  await f.service.saveUserChecks(operator, randomUUID(), {
    ...initial,
    expected_revision: revision,
  });
  expect(
    await onboarding.canDispatchProvision(
      admitted!.attemptId!,
      access.account_id!,
    ),
  ).toBe(true);
  await expect(
    f.service.saveUserChecks(caller, randomUUID(), {
      ...initial,
      expected_revision: revision,
    }),
  ).rejects.toThrow();
  for (const change of [
    { max_access_days: 0 },
    { max_identity_age_days: 366 },
    { required_fields: ['constructor'] },
    { required_fields: ['country', 'country'] },
  ])
    await expect(
      f.service.saveUserChecks(operator, randomUUID(), {
        ...initial,
        ...change,
        expected_revision: revision,
      }),
    ).rejects.toThrow();
  const key = randomUUID();
  const update = {
    ...initial,
    expected_revision: revision,
    required_fields: ['given_name', 'country'],
    max_identity_age_days: 30,
    max_access_days: 2,
  };
  const saved = await f.service.saveUserChecks(operator, key, update);
  expect(saved.revision).toBe(revision + 1);
  expect(saved.required_fields).toEqual(['country', 'given_name']);
  expect(await f.service.saveUserChecks(operator, key, update)).toEqual(saved);
  await expect(
    f.service.saveUserChecks(operator, key, { ...update, max_access_days: 3 }),
  ).rejects.toThrow();
  await expect(
    f.service.saveUserChecks(operator, randomUUID(), update),
  ).rejects.toThrow();
  expect(
    await onboarding.canDispatchProvision(
      admitted!.attemptId!,
      access.account_id!,
    ),
  ).toBe(false);
  await expect(
    onboarding.authorize(caller, access.account_id!, 'account:read'),
  ).rejects.toThrow();
  await expect(onboarding.request(context(), input)).rejects.toThrow();
  const changedPolicy = onboarding.accessPolicy(caller);
  expect(changedPolicy.policy_revision).not.toBe(
    originalPolicy.policy_revision,
  );
  expect(changedPolicy.required_fields).toEqual(['country', 'given_name']);
  expect(onboard().accessPolicy(caller)).toEqual(changedPolicy);
  expect(onboard().installationPolicyRevision).toBe(
    onboarding.installationPolicyRevision,
  );
  input.user.consent.policy_revision = changedPolicy.policy_revision;
  await expect(onboarding.request(context(), input)).rejects.toThrow();
  input.user.identity.fields.given_name = 'Example';
  const renewed = await onboarding.request(context(), input);
  expect(renewed.account_id).toBe(access.account_id);
  expect(
    await onboarding.authorize(caller, renewed.account_id!, 'account:read'),
  ).toBeDefined();
  const reloaded = new ManagementService(
    f.store,
    f.snapshot,
    f.config.oauth.issuer,
    f.config.policy,
  );
  expect(await reloaded.readUserChecks(operator)).toEqual(saved);
  await f.service.saveUserChecks(operator, randomUUID(), {
    ...update,
    expected_revision: saved.revision,
  });
  expect(onboarding.accessPolicy(caller).policy_revision).toBe(
    changedPolicy.policy_revision,
  );
  expect(
    await onboarding.authorize(caller, renewed.account_id!, 'account:read'),
  ).toBeDefined();
  await f.service.saveUserChecks(operator, randomUUID(), {
    ...initial,
    expected_revision: saved.revision,
  });
  expect(onboarding.accessPolicy(caller).policy_revision).not.toBe(
    originalPolicy.policy_revision,
  );
  input.user.consent.policy_revision = originalPolicy.policy_revision;
  await expect(onboarding.request(context(), input)).rejects.toThrow();
});

it('gives a new application the scopes needed to submit approved Safe wallet calls without granting provider administration', async () => {
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
  const created = (await f.service.mutate(operator, randomUUID(), 'create', {
    name: 'Wallet application',
    role: 'application',
  })) as { id: string; client_secret: string; scopes: string[] };
  expect(created.scopes).toEqual(
    expect.arrayContaining([
      'wallet:actions',
      'wallet:sign',
      'wallet:execute',
      'wallet:execute:read',
    ]),
  );
  expect(created.scopes).not.toContain('provider:manage');
  const app = await f.service.verifyCredentials(
    created.id,
    created.client_secret,
    created.scopes,
  );
  expect(() => f.service.assertOperator(app)).toThrow();
  expect(() => f.service.application(app)).toThrow();
});

it('keeps user-check settings readable after live applications enable matching fields added after installation', async () => {
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
  const initial = await f.service.readUserChecks(operator);
  const fields = [
    'country',
    'identity_number',
    'document_type',
    'issuing_country',
  ];
  const saved = await f.service.saveUserChecks(operator, randomUUID(), {
    expected_revision: initial.revision,
    required_fields: fields,
    verification_level: 'verified',
    max_identity_age_days: 90,
    max_access_days: 7,
  });
  const apps = [] as { id: string; revision: number }[];
  for (const name of ['Source', 'Requesting']) {
    const a = (await f.service.mutate(operator, randomUUID(), 'create', {
      name,
      role: 'application',
    })) as { id: string; revision: number };
    apps.push(
      (await f.service.mutate(operator, randomUUID(), 'update', {
        id: a.id,
        expected_revision: a.revision,
        trust_agreement: 'Offline identity checks',
      })) as { id: string; revision: number },
    );
  }
  await f.service.mutate(operator, randomUUID(), 'update', {
    id: apps[0].id,
    expected_revision: apps[0].revision,
    wallet_sharing: {
      applications: [apps[1].id],
      matchingFields: fields.slice(1),
      agreement: 'Offline sharing',
    },
  });
  Object.defineProperty(f.config.policy, 'applications', {
    enumerable: true,
    get: () => f.service.applications(),
  });
  expect(await f.service.readUserChecks(operator)).toEqual(saved);
  expect(
    await f.service.saveUserChecks(operator, randomUUID(), {
      ...saved,
      expected_revision: saved.revision,
    }),
  ).toEqual(saved);
});

it('paginates application-scoped users and protects private KYC and wallet detail', async () => {
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
  const { userOwner } = await import('../src/onboarding/wallets.js');
  const profiles = ['first', 'second', 'third']
    .map((clientId) => ({
      id: userOwner({ issuer: operator.issuer, clientId }, 'same-user'),
      issuer: operator.issuer,
      clientId,
      userId: 'same-user',
      identity: {
        reference: 'offline-check',
        level: 'verified',
        verified_at: '2025-01-01T00:00:00.000Z',
        fields: { country: 'ZA' },
      },
      acceptedUntil: 1,
      evidenceHash: 'private-evidence-hash',
      revision: 'old-policy',
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const accountId = randomUUID();
  await f.store.transaction((state) => {
    state.verifiedUsers = Object.fromEntries(profiles.map((p) => [p.id, p]));
    state.accounts = {
      [accountId]: {
        id: accountId,
        owner: profiles[0].id,
        linkedOwners: [profiles[1].id],
        status: 'suspended',
        acceptedUntil: 1,
        acceptanceRevision: 'old-policy',
        evidenceHash: 'private',
        members: {
          [profiles[2].id]: {
            id: profiles[2].id,
            issuer: operator.issuer,
            clientId: profiles[2].clientId,
            userId: 'same-user',
            permissions: ['account:read'],
            revision: 1,
            state: 'invited',
          },
        },
      },
    };
  });
  const { AuthenticationError } = await import('../src/service/auth.js');
  const app = await createServer({
    management: f.service,
    authenticate: async (header) => {
      if (!header) throw new AuthenticationError(401);
      return header === 'Bearer operator'
        ? operator
        : { ...operator, clientId: 'application' };
    },
  });
  try {
    for (const url of [
      '/v1/provider/users',
      '/v1/provider/users/' + profiles[0].id,
    ]) {
      expect((await app.inject({ url })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            url,
            headers: { authorization: 'Bearer application' },
          })
        ).statusCode,
      ).toBe(403);
    }
    const get = (url: string) =>
      app.inject({ url, headers: { authorization: 'Bearer operator' } });
    const first = await get('/v1/provider/users?limit=2');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.json().users.map((u: { id: string }) => u.id)).toEqual(
      profiles.slice(0, 2).map((p) => p.id),
    );
    expect(first.body).not.toContain('fields');
    expect(first.body).not.toContain('private-evidence-hash');
    const last = await get(
      '/v1/provider/users?limit=2&after=' + first.json().next_cursor,
    );
    expect(last.json()).toMatchObject({
      users: [{ id: profiles[2].id }],
      next_cursor: null,
    });
    expect(
      (
        await get('/v1/provider/users?application_id=' + profiles[1].clientId)
      ).json().users,
    ).toHaveLength(1);
    expect(
      (await get('/v1/provider/users?application_id=unknown')).json(),
    ).toEqual({ users: [], next_cursor: null });
    for (const query of ['limit=0', 'limit=101', 'after=invalid'])
      expect((await get('/v1/provider/users?' + query)).statusCode).toBe(400);
    for (const [index, role] of ['owner', 'owner', 'member'].entries()) {
      const detail = await get('/v1/provider/users/' + profiles[index].id);
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        user_id: 'same-user',
        application_id: profiles[index].clientId,
        kyc: { source: 'application_attestation', fields: { country: 'ZA' } },
        wallets: [{ account_id: accountId, role, status: 'suspended' }],
      });
      expect(detail.body).not.toContain('evidenceHash');
    }
    await f.store.transaction((state) => {
      state.accounts[accountId].members![profiles[2].id].state = 'removed';
    });
    expect(
      (await get('/v1/provider/users/' + profiles[2].id)).json().wallets,
    ).toEqual([]);
    expect((await get('/v1/provider/users/' + '0'.repeat(64))).statusCode).toBe(
      404,
    );
    expect((await get('/v1/provider/users/bad')).statusCode).toBe(400);
    await f.store.transaction((state) => {
      state.management!.provider.identities[operator.clientId].enabled = false;
    });
    expect((await get('/v1/provider/users')).statusCode).toBe(403);
  } finally {
    await app.close();
  }
});

it('preserves missing-user responses and detached directory records with SQLite storage', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { openProviderDatabase } = await import('../src/storage/index.js');
  const f = await fixture();
  const directory = await mkdtemp(join(tmpdir(), 'wpk-user-directory-'));
  const db = openProviderDatabase({ directory, initialize: true });
  const service = new ManagementService(
    db.onboardingStore,
    () => db.managementSnapshot(),
    f.config.oauth.issuer,
    f.config.policy,
  );
  try {
    const claim = randomBytes(48).toString('base64url'),
      secret = password();
    await service.initialize(claim);
    await service.claim({ claim, username: 'admin', password: secret });
    const principal = await service.verifyCredentials(
      'operator-admin',
      secret,
      managementScopes,
    );
    await expect(service.user(principal, '0'.repeat(64))).rejects.toMatchObject(
      { statusCode: 404 },
    );
    expect(await service.users(principal)).toEqual({
      users: [],
      next_cursor: null,
    });
    await db.onboardingStore.transaction((s) => {
      s.verifiedUsers = {
        ['a'.repeat(64)]: {
          id: 'a'.repeat(64),
          issuer: principal.issuer,
          clientId: 'offline-app',
          userId: 'offline-user',
          identity: {
            reference: 'offline-check',
            level: 'verified',
            verified_at: '2026-01-01T00:00:00.000Z',
            fields: { country: 'ZA' },
          },
          evidenceHash: 'offline-hash',
          acceptedUntil: 1,
          revision: 'offline-policy',
        },
      };
    });
    const detail = await service.user(principal, 'a'.repeat(64));
    expect(detail).toMatchObject({
      kyc: { fields: { country: 'ZA' } },
      wallets: [],
    });
    detail.kyc.fields.country = 'changed';
    expect(
      (await service.user(principal, 'a'.repeat(64))).kyc.fields.country,
    ).toBe('ZA');
    expect((await service.users(principal)).users).toHaveLength(1);
    expect(await db.ready()).toBe(true);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it('requires current operator authority and evidence for per-network execution, fencing revisions and replay', async () => {
  const f = await fixture();
  const secret = password();
  await f.service.claim({
    claim: f.claim,
    username: 'admin',
    password: secret,
  });
  const admin = await f.service.verifyCredentials(
    'operator-admin',
    secret,
    managementScopes,
  );
  const defaults = { enabled: false };
  expect(f.service.executionSettings(admin, 'base', defaults)).toMatchObject({
    enabled: false,
    revision: 1,
  });
  await expect(
    f.service.saveExecution(
      { ...admin, clientId: 'unknown' },
      randomUUID(),
      'base',
      {
        expected_revision: 1,
        enabled: true,
        backendAcceptance: 'checked',
        recoveryAcceptance: 'tested',
        mainnet_confirmed: true,
      },
      defaults,
    ),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  await expect(
    f.service.saveExecution(
      admin,
      randomUUID(),
      'base',
      {
        expected_revision: 1,
        enabled: true,
        backendAcceptance: 'checked',
        recoveryAcceptance: 'tested',
      },
      defaults,
    ),
  ).rejects.toMatchObject({ code: 'wallet_provider_input' });
  await expect(
    f.service.saveExecution(
      admin,
      randomUUID(),
      'base-sepolia',
      { expected_revision: 1, enabled: true },
      defaults,
    ),
  ).rejects.toMatchObject({ code: 'wallet_provider_input' });
  const input = {
    expected_revision: 1,
    enabled: true,
    backendAcceptance: 'checked',
    recoveryAcceptance: 'tested',
    mainnet_confirmed: true,
  };
  const key = randomUUID();
  const saved = await f.service.saveExecution(
    admin,
    key,
    'base',
    input,
    defaults,
  );
  expect(saved).toMatchObject({ revision: 2, enabled: true });
  expect(
    await f.service.saveExecution(admin, key, 'base', input, defaults),
  ).toEqual(saved);
  expect(
    f.service.executionSettings(admin, 'base-sepolia', defaults),
  ).toMatchObject({ revision: 1, enabled: false });
  await expect(
    f.service.saveExecution(admin, randomUUID(), 'base', input, defaults),
  ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
  await expect(
    f.service.saveExecution(
      admin,
      key,
      'base',
      { expected_revision: 2, enabled: false },
      defaults,
    ),
  ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
  expect(
    await f.service.saveExecution(
      admin,
      randomUUID(),
      'base',
      { expected_revision: 2, enabled: false },
      defaults,
    ),
  ).toMatchObject({ revision: 3, enabled: false });
});

it.each([
  { kind: 'personal' as const, persistedChecks: false },
  { kind: 'shared' as const, persistedChecks: false },
  { kind: 'personal' as const, persistedChecks: true },
  { kind: 'shared' as const, persistedChecks: true },
])(
  'preserves $kind wallet authority across additions and relaxations (stored checks: $persistedChecks)',
  async ({ kind, persistedChecks }) => {
    const { OnboardingService } = await import('../src/onboarding/service.js');
    const f = await fixture(),
      adminPassword = password();
    await f.service.claim({
      claim: f.claim,
      username: 'checks-admin',
      password: adminPassword,
    });
    const operator = await f.service.verifyCredentials(
      'operator-checks-admin',
      adminPassword,
      managementScopes,
    );
    const created = await f.service.mutate(operator, randomUUID(), 'create', {
      name: 'Offline application',
      role: 'application',
    });
    if (!('id' in created) || !created.client_secret)
      throw new Error('Expected new application');
    await f.service.mutate(operator, randomUUID(), 'update', {
      id: created.id,
      expected_revision: created.revision,
      trust_agreement: 'offline-reviewed-agreement',
      permissions: ['account:read'],
    });
    const caller = await f.service.verifyCredentials(
      created.id,
      created.client_secret!,
      ['wallet:access', 'wallet:access:read', 'wallet:provision'],
    );
    await f.store.transaction((s) => {
      s.requests = {};
      s.accounts = {};
      s.evidenceOwners = {};
      s.idempotency = {};
      s.admissions = {};
    });
    if (persistedChecks) {
      const {
        available: _available,
        revision,
        ...checks
      } = await f.service.readUserChecks(operator);
      await f.service.saveUserChecks(operator, randomUUID(), {
        ...checks,
        expected_revision: revision,
        max_access_days: checks.max_access_days - 1,
      });
    }
    const onboard = () =>
      new OnboardingService(
        { ...f.config.policy, applications: [] },
        f.store,
        [],
        undefined,
        undefined,
        false,
        true,
        {
          list: () => f.service.applications(),
          current: (p) => f.service.application(p),
          userChecks: () => f.service.currentUserChecks(),
        },
      );
    const onboarding = onboard();
    const context = () => ({ principal: caller, idempotencyKey: randomUUID() });
    const originalPolicy = onboarding.accessPolicy(caller);
    const input = {
      mode: 'create' as const,
      wallet: { reference: 'offline-wallet', name: 'Offline wallet', kind },
      user: {
        id: 'offline-user',
        identity: {
          reference: 'offline-evidence',
          level: 'verified',
          verified_at: new Date(Date.now() - 1000).toISOString(),
          fields: { country: 'ZA' } as Record<string, string>,
        },
        consent: {
          reference: 'offline-consent',
          wallet_reference: 'offline-wallet',
          granted_at: new Date(Date.now() - 1000).toISOString(),
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          policy_revision: originalPolicy.policy_revision,
        },
      },
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access' as const,
          actions: ['account:read' as const],
        },
      ] as [
        {
          type: 'https://moovha.com/wallet/account-access';
          actions: ['account:read'];
        },
      ],
    };
    const access = await onboarding.request(context(), input);
    const admitted = await onboarding.walletAuthority().provision(
      {
        ...context(),
        principal: { ...caller, accessGrantId: access.grant_id },
      },
      access.account_id!,
    );
    const originalGrant = await f.store.transaction((state) =>
      structuredClone(Object.values(state.grants)[0]),
    );
    const application = f.service
      .identities(operator)
      .find((i) => i.id === created.id)!;
    const expanded = await f.service.mutate(operator, randomUUID(), 'update', {
      id: created.id,
      expected_revision: application.revision,
      permissions: ['account:read', 'members:manage', 'owners:manage'],
    });
    expect(() => f.service.currentPrincipal(caller)).not.toThrow();
    for (const service of [onboarding, onboard()]) {
      expect(
        await service.canDispatchProvision(
          admitted!.attemptId!,
          access.account_id!,
        ),
      ).toBe(true);
      expect(service.accessPolicy(caller).policy_revision).toBe(
        originalPolicy.policy_revision,
      );
    }
    expect(
      await f.store.transaction((state) => state.grants[originalGrant.id]),
    ).toEqual(originalGrant);
    expect(originalGrant.permissions).toEqual(['account:read']);
    await expect(
      onboarding.members(
        { ...caller, accessGrantId: access.grant_id },
        access.account_id!,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
    const checks = await f.service.readUserChecks(operator);
    await f.service.saveUserChecks(operator, randomUUID(), {
      expected_revision: checks.revision,
      required_fields: [],
      verification_level: checks.verification_level,
      max_identity_age_days: checks.max_identity_age_days + 1,
      max_access_days: checks.max_access_days + 1,
    });
    for (const service of [onboarding, onboard()]) {
      expect(
        await service.canDispatchProvision(
          admitted!.attemptId!,
          access.account_id!,
        ),
      ).toBe(true);
      expect(service.accessPolicy(caller).policy_revision).toBe(
        originalPolicy.policy_revision,
      );
    }
    expect(
      await f.store.transaction((state) => state.grants[originalGrant.id]),
    ).toEqual(originalGrant);
    expect(
      await f.store.transaction((state) =>
        state.audit
          .filter((event) => event.impact)
          .slice(-2)
          .map((event) => event.impact?.revokedGrants),
      ),
    ).toEqual([0, 0]);
    await f.service.mutate(operator, randomUUID(), 'update', {
      id: created.id,
      expected_revision: 'revision' in expanded ? expanded.revision : 0,
      permissions: ['members:manage'],
    });
    expect(
      await onboard().canDispatchProvision(
        admitted!.attemptId!,
        access.account_id!,
      ),
    ).toBe(false);
    expect(
      await f.store.transaction(
        (state) => state.grants[originalGrant.id].state,
      ),
    ).toBe('revoked');
    const current = f.service
      .identities(operator)
      .find((i) => i.id === created.id)!;
    await f.service.mutate(operator, randomUUID(), 'update', {
      id: created.id,
      expected_revision: current.revision,
      permissions: ['account:read', 'members:manage'],
    });
    expect(
      await f.store.transaction(
        (state) => state.grants[originalGrant.id].state,
      ),
    ).toBe('revoked');
  },
);
