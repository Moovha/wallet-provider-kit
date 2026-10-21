import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { OnboardingService } from '../src/onboarding/service.js';
import { createFileOnboardingStore } from '../src/onboarding/file-store.js';
import {
  ManagementService,
  managementScopes,
} from '../src/management/service.js';
import { runtimeApplicationId } from '../src/runtime-configuration/service.js';
import { createServer } from '../src/service/server.js';
import type {
  AccessInput,
  OnboardingPolicy,
  ProviderState,
} from '../src/onboarding/types.js';

const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const fields = ['identity_number', 'document_type', 'issuing_country'];
const base: OnboardingPolicy = {
  version: 'offline-sharing',
  provider: {
    name: 'Offline',
    origin: 'https://wallet.example.test',
    privacyUrl: 'https://wallet.example.test/privacy',
  },
  applications: [],
  access: { mode: 'application', maxAgeDays: 7 },
  identity: {
    maxAgeDays: 90,
    application: { requiredFields: fields, verificationLevel: 'verified' },
  },
};
const principal = (id: string) => ({
  issuer: base.provider.origin + '/oauth',
  clientId: id,
  subject: id,
  scopes: ['wallet:access', 'wallet:access:read', 'wallet:account:read'],
});
const context = (id: string) => ({
  principal: principal(id),
  idempotencyKey: randomUUID(),
});
async function fixture(matchName = false) {
  const policy = structuredClone(base);
  if (matchName)
    policy.identity!.application!.requiredFields.push('given_name');
  const directory = await mkdtemp(join(tmpdir(), 'wpk-sharing-'));
  directories.push(directory);
  const store = createFileOnboardingStore(directory);
  let snapshot:
    import('../src/management/service.js').ManagementState | undefined;
  const updateSnapshot = async () => {
    snapshot = await store.transaction((s) =>
      structuredClone(s.management?.provider),
    );
  };
  const management = new ManagementService(
    store,
    () => structuredClone(snapshot),
    principal('app').issuer,
    policy,
  );
  const claim = 'o'.repeat(64);
  await management.initialize(claim);
  await updateSnapshot();
  await management.claim({
    claim,
    username: 'admin',
    password: 'offline-fixture-password-only',
  });
  await updateSnapshot();
  const operator = await management.verifyCredentials(
    'operator-admin',
    'offline-fixture-password-only',
    managementScopes,
  );
  async function mutate(id: string, input: Record<string, unknown>) {
    const record = management.identities(operator).find((i) => i.id === id)!;
    const result = await management.mutate(operator, randomUUID(), 'update', {
      id,
      expected_revision: record.revision,
      ...input,
    });
    await updateSnapshot();
    return result;
  }
  const apps: string[] = [];
  for (const name of ['A', 'B', 'C']) {
    const created = (await management.mutate(operator, randomUUID(), 'create', {
      name,
      role: 'application',
    })) as { id: string };
    await updateSnapshot();
    apps.push(created.id);
    await mutate(created.id, {
      trust_agreement: 'offline-identity-consent',
      permissions: ['account:read', 'contracts:request'],
    });
  }
  const [a, b, c] = apps;
  const settings = {
    applications: [b],
    matchingFields: [...fields, ...(matchName ? ['given_name'] : [])],
    agreement: 'offline-cross-app-identity-and-consent',
  };
  await mutate(a, { wallet_sharing: settings });
  function service() {
    return new OnboardingService(
      policy,
      createFileOnboardingStore(directory),
      [],
      undefined,
      'a'.repeat(64),
      false,
      false,
      {
        list: () => management.applications(),
        current: (p) => management.application(p),
        userChecks: () => management.currentUserChecks(),
      },
    );
  }
  let onboarding = service();
  function input(id = 'person-1', number = '0000000000001'): AccessInput {
    return {
      mode: 'create',
      user: {
        id,
        identity: {
          reference: 'identity-' + id,
          level: 'verified',
          verified_at: new Date(Date.now() - 1000).toISOString(),
          fields: {
            identity_number: number,
            document_type: 'national_id',
            issuing_country: 'ZA',
            ...(matchName ? { given_name: 'Alex' } : {}),
          },
        },
        consent: {
          reference: randomUUID(),
          granted_at: new Date(Date.now() - 1000).toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          policy_revision: onboarding.policy.revision,
        },
      },
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: ['account:read'],
        },
      ],
    };
  }
  async function shared(id = 'different-id-in-b') {
    const value = input(id);
    const terms = (await onboarding.applicationAccessPolicy(principal(b), a))
      .wallet_sharing!;
    value.mode = 'connect_from_application';
    value.source_application_id = a;
    Object.assign(value.user!.consent, {
      source_application_id: a,
      sharing_revision: terms.revision,
    });
    return value;
  }
  return {
    store,
    management,
    operator,
    mutate,
    settings,
    input,
    shared,
    a,
    b,
    c,
    get service() {
      return onboarding;
    },
    restart() {
      onboarding = service();
    },
  };
}
it('links B to the existing wallet durably, with independent consent, permissions and revocation', async () => {
  const f = await fixture();
  const original = f.input();
  // Equal references in separate applications must never couple withdrawals.
  original.user!.consent.reference = 'separate-app-record';
  const a = await f.service.request(context(f.a), original);
  const input = await f.shared();
  input.user!.consent.reference = original.user!.consent.reference;
  const ctx = context(f.b);
  const b = await f.service.request(ctx, input);
  expect(b).toMatchObject({
    status: 'granted',
    account_id: a.account_id,
    permissions: ['account:read'],
  });
  expect(b.grant_id).not.toBe(a.grant_id);
  expect(
    await f.store.transaction((s) => Object.keys(s.accounts)),
  ).toHaveLength(1);
  const owner = await f.store.transaction(
    (s) => s.accounts[a.account_id!].owner,
  );
  f.restart();
  expect(await f.service.request(ctx, input)).toEqual(b);
  expect(await f.service.account(principal(f.b), a.account_id!)).toMatchObject({
    account_id: a.account_id,
  });
  await expect(
    f.service.authorize(principal(f.b), a.account_id!, 'contracts:request'),
  ).rejects.toThrow();
  await f.service.revokeApplicationGrant(context(f.b), b.grant_id!);
  await expect(
    f.service.account(principal(f.b), a.account_id!),
  ).rejects.toThrow();
  await expect(f.service.request(context(f.b), input)).rejects.toThrow();
  expect(await f.service.account(principal(f.a), a.account_id!)).toBeDefined();
  expect(
    await f.store.transaction((s) => s.accounts[a.account_id!].owner),
  ).toBe(owner);
});
it('does not allow missing consent, wrong fields, unknown source, reverse sharing or an unselected application', async () => {
  const f = await fixture();
  await f.service.request(context(f.a), f.input());
  const valid = await f.shared();
  for (const change of [
    (v: AccessInput) => {
      delete v.user!.consent.sharing_revision;
    },
    (v: AccessInput) => {
      v.user!.consent.source_application_id = f.c;
    },
    (v: AccessInput) => {
      v.user!.identity.fields.identity_number = '1';
    },
    (v: AccessInput) => {
      v.user!.identity.fields.document_type = 'passport';
    },
    (v: AccessInput) => {
      v.source_application_id = f.c;
    },
    (v: AccessInput) => {
      v.account_id = randomUUID();
    },
  ]) {
    const v = structuredClone(valid);
    change(v);
    await expect(f.service.request(context(f.b), v)).rejects.toThrow();
  }
  await expect(f.service.request(context(f.c), valid)).rejects.toThrow();
  await expect(
    f.service.applicationAccessPolicy(principal(f.a), f.b),
  ).rejects.toThrow();
  await expect(
    f.service.applicationAccessPolicy(principal(f.b), 'unknown'),
  ).rejects.toThrow();
});
it('rejects ambiguous owners and prevents rebinding a B user who already owns another account', async () => {
  const f = await fixture();
  await f.service.request(context(f.a), f.input());
  await f.service.request(context(f.a), f.input('another-person'));
  await expect(
    f.service.request(context(f.b), await f.shared()),
  ).rejects.toThrow();
  const g = await fixture();
  await g.service.request(context(g.a), g.input());
  await g.service.request(
    context(g.b),
    g.input('different-id-in-b', '0000000000002'),
  );
  await expect(
    g.service.request(context(g.b), await g.shared()),
  ).rejects.toThrow();
});
it('ends dependent B approvals when sharing changes and never restores old consent on re-enable', async () => {
  const f = await fixture();
  const a = await f.service.request(context(f.a), f.input());
  const input = await f.shared(),
    ctx = context(f.b);
  const b = await f.service.request(ctx, input);
  await f.mutate(f.a, { wallet_sharing: null });
  await expect(
    f.service.account(principal(f.b), a.account_id!),
  ).rejects.toThrow();
  expect((await f.service.request(ctx, input)).status).toBe('denied');
  expect(await f.service.account(principal(f.a), a.account_id!)).toBeDefined();
  await f.mutate(f.a, { wallet_sharing: f.settings });
  await expect(f.service.request(context(f.b), input)).rejects.toThrow();
  expect(
    (await f.service.request(context(f.b), await f.shared())).grant_id,
  ).not.toBe(b.grant_id);
});
it('keeps B approval independent when A withdraws and enforces current checks for both apps', async () => {
  const f = await fixture();
  const a = await f.service.request(context(f.a), f.input());
  await f.service.request(context(f.b), await f.shared());
  await f.service.revokeApplicationGrant(context(f.a), a.grant_id!);
  expect(await f.service.account(principal(f.b), a.account_id!)).toBeDefined();
  await f.mutate(f.a, { enabled: false });
  await expect(
    f.service.account(principal(f.b), a.account_id!),
  ).rejects.toThrow();
});
it('checks B transaction consent independently and rechecks expiry before infrastructure access', async () => {
  const f = await fixture();
  const a = await f.service.request(context(f.a), f.input());
  const shared = await f.shared();
  shared.authorization_details[0].actions = [
    'account:read',
    'contracts:request',
  ];
  await expect(f.service.request(context(f.b), shared)).rejects.toThrow();
  shared.user!.consent.action_policy_revision = (
    await f.service.applicationAccessPolicy(principal(f.b))
  ).action_policy_revision;
  await f.service.request(context(f.b), shared);
  const applicationId = runtimeApplicationId(principal(f.b).issuer, f.b);
  expect(
    await f.store.transaction((s) =>
      f.service.hasSharedWalletAccess(s, applicationId, a.account_id!),
    ),
  ).toBe(true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 2 * 86400000);
  expect(
    await f.store.transaction((s) =>
      f.service.hasSharedWalletAccess(s, applicationId, a.account_id!),
    ),
  ).toBe(false);
});
it('exposes sharing requirements through the existing policy route and accepts the new mode over HTTP', async () => {
  const f = await fixture();
  const a = await f.service.request(context(f.a), f.input());
  const app = await createServer({
    ready: async () => true,
    authenticate: async () => principal(f.b),
    service: new EmbeddedWalletService(f.service.walletAuthority(), {
      provider: 'offline',
      createAccount: async () => {
        throw new Error('No effects');
      },
      findAccount: async () => null,
      signTypedData: async () => {
        throw new Error('No signing');
      },
    }),
    onboarding: { service: f.service, reviewers: [] },
    documentation: false,
  });
  try {
    const terms = await app.inject({
      method: 'GET',
      url: '/v1/access-policy?source_application_id=' + f.a,
    });
    expect(terms.statusCode).toBe(200);
    expect(terms.json().wallet_sharing.matching_fields).toEqual(
      [...fields].sort(),
    );
    const result = await app.inject({
      method: 'POST',
      url: '/v1/access-requests',
      headers: { 'idempotency-key': randomUUID() },
      payload: await f.shared(),
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().account_id).toBe(a.account_id);
  } finally {
    await app.close();
  }
});
it('rejects weak match settings, self sharing, unknown targets and non-operator changes', async () => {
  const f = await fixture();
  for (const settings of [
    { ...f.settings, matchingFields: ['issuing_country'] },
    { ...f.settings, applications: [f.a] },
    { ...f.settings, applications: ['unknown'] },
  ])
    await expect(f.mutate(f.a, { wallet_sharing: settings })).rejects.toThrow();
  await expect(
    f.management.mutate(principal(f.b), randomUUID(), 'update', {
      id: f.a,
      expected_revision: 3,
      wallet_sharing: f.settings,
    }),
  ).rejects.toThrow();
});

it('keeps identical sharing saves stable and permits disabling sharing after identity trust is removed', async () => {
  const f = await fixture();
  const a = await f.service.request(context(f.a), f.input());
  await f.service.request(context(f.b), await f.shared());
  const before = (await f.service.applicationAccessPolicy(principal(f.b), f.a))
    .wallet_sharing!.revision;
  await f.mutate(f.a, {
    wallet_sharing: {
      agreement: f.settings.agreement,
      matchingFields: [...fields].reverse(),
      applications: [f.b],
    },
  });
  expect(
    (await f.service.applicationAccessPolicy(principal(f.b), f.a))
      .wallet_sharing!.revision,
  ).toBe(before);
  expect(await f.service.account(principal(f.b), a.account_id!)).toBeDefined();
  await f.mutate(f.a, { trust_agreement: null });
  await f.mutate(f.a, { wallet_sharing: null });
  expect(
    f.management.identities(f.operator).find((i) => i.id === f.a)!.policy
      ?.walletSharing,
  ).toBeUndefined();
});
it('requires reconnection after source evidence changes and never lets create bypass a permanent shared-user binding', async () => {
  const f = await fixture();
  const input = f.input();
  const a = await f.service.request(context(f.a), input);
  const b = await f.service.request(context(f.b), await f.shared());
  await expect(
    f.service.request(context(f.b), f.input('different-id-in-b')),
  ).rejects.toThrow();
  const renewed = f.input();
  renewed.user!.identity.reference = 'renewed-offline-checks';
  await f.service.request(context(f.a), renewed);
  await expect(
    f.service.account(principal(f.b), a.account_id!),
  ).rejects.toThrow();
  expect(
    (await f.service.request(context(f.b), await f.shared())).grant_id,
  ).not.toBe(b.grant_id);
  expect(
    await f.store.transaction((s) => Object.keys(s.accounts)),
  ).toHaveLength(1);
});

it('requires every optional matching field and does not permit onward sharing through B', async () => {
  const f = await fixture(true);
  const a = await f.service.request(context(f.a), f.input());
  const input = await f.shared();
  input.user!.identity.fields.given_name = 'Another';
  await expect(f.service.request(context(f.b), input)).rejects.toThrow();
  input.user!.identity.fields.given_name = 'Alex';
  expect((await f.service.request(context(f.b), input)).account_id).toBe(
    a.account_id,
  );
  await f.mutate(f.b, {
    wallet_sharing: { ...f.settings, applications: [f.c] },
  });
  const terms = await f.service.applicationAccessPolicy(principal(f.c), f.b);
  const onward = f.input('person-in-c');
  onward.mode = 'connect_from_application';
  onward.source_application_id = f.b;
  Object.assign(onward.user!.consent, {
    source_application_id: f.b,
    sharing_revision: terms.wallet_sharing!.revision,
  });
  await expect(f.service.request(context(f.c), onward)).rejects.toThrow();
});

it('propagates storage uncertainty instead of treating an unreadable candidate as a nonmatch', async () => {
  const f = await fixture();
  await f.service.request(context(f.a), f.input());
  const input = await f.shared();
  const original = f.service.store.transaction.bind(f.service.store);
  const interrupted = vi
    .spyOn(f.service.store, 'transaction')
    .mockImplementation((work) =>
      original((state) => {
        const source = Object.values(state.requests)[0];
        const copy = structuredClone(source);
        let unread = true;
        Object.defineProperty(copy, 'input', {
          enumerable: true,
          get() {
            if (unread) {
              unread = false;
              throw new Error('Offline candidate read unavailable');
            }
            return source.input;
          },
        });
        state.requests['offline-unreadable-candidate'] = copy;
        return work(state);
      }),
    );
  await expect(f.service.request(context(f.b), input)).rejects.toMatchObject({
    code: 'wallet_onboarding_unavailable',
  });
  interrupted.mockRestore();
  expect(
    await f.store.transaction((state) =>
      Object.values(state.grants).filter(
        (grant) => grant.caller.clientId === f.b,
      ),
    ),
  ).toHaveLength(0);
});
