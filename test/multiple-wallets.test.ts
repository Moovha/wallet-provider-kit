import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OnboardingService } from '../src/onboarding/service.js';
import { createFileOnboardingStore } from '../src/onboarding/file-store.js';
import { createServer } from '../src/service/server.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import type {
  AccessRequestInput,
  OnboardingPolicy,
  Permission,
} from '../src/onboarding/types.js';
import type { VerifiedPrincipal } from '../src/domain/principal.js';
import { createWalletsClient } from '../src/wallets/client.js';

const folders: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const issuer = 'https://apps.example.test';
const principal = (app = 'app-a', grant?: string): VerifiedPrincipal => ({
  issuer,
  subject: app,
  clientId: app,
  scopes: [
    'wallet:access',
    'wallet:access:read',
    'wallet:account:read',
    'wallet:provision',
  ],
  ...(grant ? { accessGrantId: grant } : {}),
});
const ctx = (app = 'app-a', grant?: string) => ({
  principal: principal(app, grant),
  idempotencyKey: randomUUID(),
});
const actionRevision = 'f'.repeat(64);
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-multiple-wallets-'));
  folders.push(directory);
  const policy: OnboardingPolicy = {
    version: 'offline-wallets',
    provider: {
      name: 'Offline',
      origin: 'https://wallet.example.test',
      privacyUrl: 'https://wallet.example.test/privacy',
    },
    applications: ['app-a', 'app-b'].map((clientId) => ({
      issuer,
      clientId,
      name: clientId,
      assertionTrust: { agreement: 'offline-user-checks' },
      permissions: [
        'account:read',
        'operations:request',
        'contracts:request',
        'members:manage',
      ],
      ...(clientId === 'app-a'
        ? {
            walletSharing: {
              applications: ['app-b'],
              matchingFields: [
                'identity_number',
                'document_type',
                'issuing_country',
              ],
              agreement: 'offline-sharing',
            },
          }
        : {}),
    })),
    identity: {
      maxAgeDays: 90,
      application: {
        requiredFields: ['identity_number', 'document_type', 'issuing_country'],
        verificationLevel: 'verified',
      },
    },
    access: { mode: 'application', maxAgeDays: 7 },
  };
  const applications = structuredClone(policy.applications);
  const store = createFileOnboardingStore(directory);
  const construct = () =>
    new OnboardingService(
      policy,
      store,
      [],
      undefined,
      actionRevision,
      false,
      false,
      {
        list: () => structuredClone(applications),
        current: (p) => {
          const app = applications.find(
            (a) =>
              a.clientId === p.clientId &&
              a.issuer === p.issuer &&
              a.enabled !== false,
          );
          if (!app) throw new Error('Unknown application');
          return structuredClone(app);
        },
      },
    );
  let service = construct();
  function input(
    id = 'owner',
    permissions: Permission[] = ['account:read'],
  ): AccessRequestInput {
    return {
      mode: 'create',
      user: {
        id,
        identity: {
          reference: 'proof-' + id,
          level: 'verified',
          verified_at: new Date(Date.now() - 1000).toISOString(),
          fields: {
            identity_number: id === 'owner' ? '0000000000001' : '0000000000002',
            document_type: 'national_id',
            issuing_country: 'ZA',
          },
        },
        consent: {
          reference: randomUUID(),
          granted_at: new Date(Date.now() - 1000).toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          policy_revision: service.policy.revision,
          ...(permissions.includes('contracts:request')
            ? { action_policy_revision: actionRevision }
            : {}),
        },
      },
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: permissions,
        },
      ],
    };
  }
  function extra(
    reference: string,
    kind: 'personal' | 'shared' = 'personal',
    permissions: Permission[] = ['account:read'],
  ) {
    const value = input('owner', permissions);
    delete value.user!.identity;
    value.wallet = {
      reference,
      name: reference === 'family' ? 'Family expenses' : 'Holiday savings',
      kind,
    };
    value.user!.consent.wallet_reference = reference;
    return value;
  }
  function joinInput(
    accountId: string,
    revision: number,
    permissions: Permission[] = ['account:read'],
    id = 'member',
  ) {
    const value = input(id, permissions);
    value.mode = 'connect';
    value.account_id = accountId;
    value.user!.consent.account_id = accountId;
    value.user!.consent.membership_revision = revision;
    return value;
  }
  return {
    store,
    policy,
    applications,
    input,
    extra,
    join: joinInput,
    get service() {
      return service;
    },
    restart() {
      service = construct();
    },
  };
}
it('keeps the existing personal wallet as default and creates repeatable named wallets without repeating identity checks', async () => {
  const f = await fixture();
  const personal = await f.service.request(ctx(), f.input());
  const proof = await f.store.transaction(
    (s) => s.verifiedUsers![s.accounts[personal.account_id!].owner],
  );
  const key = ctx(),
    value = f.extra('holiday');
  const additional = await f.service.request(key, value);
  expect(additional.account_id).not.toBe(personal.account_id);
  expect(await f.service.request(key, value)).toEqual(additional);
  expect((await f.service.request(ctx(), f.extra('holiday'))).account_id).toBe(
    additional.account_id,
  );
  const defaultRenewal = f.input();
  delete defaultRenewal.user!.identity;
  expect((await f.service.request(ctx(), defaultRenewal)).account_id).toBe(
    personal.account_id,
  );
  const listed = await f.service.wallets(ctx(), 'owner');
  expect(listed.accounts).toHaveLength(2);
  expect(listed.accounts[0]).toMatchObject({
    account_id: personal.account_id,
    is_default: true,
    wallet: { name: 'Personal', kind: 'personal' },
  });
  expect(listed.accounts[1].is_default).toBe(false);
  const after = await f.store.transaction((s) =>
    Object.values(s.verifiedUsers!),
  );
  expect(after).toHaveLength(1);
  expect(after[0].acceptedUntil).toBe(proof.acceptedUntil);
  f.restart();
  expect((await f.service.wallets(ctx(), 'owner')).accounts).toEqual(
    listed.accounts,
  );
});
it('binds consent to the chosen wallet and does not reuse a consent reference across wallets', async () => {
  const f = await fixture(),
    first = f.input();
  await f.service.request(ctx(), first);
  const wrong = f.extra('holiday');
  delete wrong.user!.consent.wallet_reference;
  await expect(f.service.request(ctx(), wrong)).rejects.toThrow();
  wrong.user!.consent.wallet_reference = 'holiday';
  wrong.user!.consent.reference = first.user!.consent.reference;
  await expect(f.service.request(ctx(), wrong)).rejects.toThrow();
  const added = await f.service.request(ctx(), f.extra('holiday'));
  const mismatchedDefault = f.input();
  mismatchedDefault.user!.consent.account_id = added.account_id;
  await expect(f.service.request(ctx(), mismatchedDefault)).rejects.toThrow();
  delete mismatchedDefault.user!.consent.account_id;
  mismatchedDefault.user!.consent.wallet_reference = 'holiday';
  await expect(f.service.request(ctx(), mismatchedDefault)).rejects.toThrow();
  const connect = f.input();
  delete connect.user!.identity;
  connect.mode = 'connect';
  connect.account_id = added.account_id;
  await expect(f.service.request(ctx(), connect)).rejects.toThrow();
  connect.user!.consent.account_id = added.account_id;
  expect((await f.service.request(ctx(), connect)).account_id).toBe(
    added.account_id,
  );
});
it('rejects identity reuse for a different user or app, expired evidence and changed wallet-reference meaning', async () => {
  const f = await fixture();
  await f.service.request(ctx(), f.input());
  const another = f.extra('holiday');
  another.user!.id = 'someone-else';
  await expect(f.service.request(ctx(), another)).rejects.toThrow();
  await expect(
    f.service.request(ctx('app-b'), f.extra('holiday')),
  ).rejects.toThrow();
  await f.service.request(ctx(), f.extra('holiday'));
  const changed = f.extra('holiday', 'shared');
  await expect(f.service.request(ctx(), changed)).rejects.toMatchObject({
    code: 'wallet_attempt_conflict',
  });
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 91 * 86400000);
  await expect(f.service.request(ctx(), f.extra('later'))).rejects.toThrow();
});
it('serializes concurrent creation by user and wallet reference while retaining legacy accounts without migration', async () => {
  const f = await fixture();
  const original = await f.service.request(ctx(), f.input());
  await f.store.transaction((s) => {
    delete s.verifiedUsers;
    delete s.accounts[original.account_id!].wallet;
  });
  const ids = await Promise.all(
    Array.from({ length: 3 }, () =>
      f.service.request(ctx(), f.extra('holiday')),
    ),
  );
  expect(new Set(ids.map((x) => x.account_id)).size).toBe(1);
  expect((await f.service.request(ctx(), f.input())).account_id).toBe(
    original.account_id,
  );
  expect(
    await f.store.transaction((s) => Object.keys(s.accounts)),
  ).toHaveLength(2);
});
it('invites members without granting access and requires their own wallet consent and explicit grant selector', async () => {
  const f = await fixture();
  await f.service.request(ctx(), f.input());
  const owner = await f.service.request(
    ctx(),
    f.extra('family', 'shared', [
      'account:read',
      'contracts:request',
      'members:manage',
    ]),
  );
  const accountId = owner.account_id!,
    ownerContext = ctx('app-a', owner.grant_id);
  const invited = await f.service.saveMember(ownerContext, accountId, {
    expected_revision: 0,
    user_id: 'member',
    name: 'Alex',
    enabled: true,
    permissions: ['account:read'],
  });
  expect(invited.members[0].status).toBe('invited');
  await expect(f.service.account(principal(), accountId)).rejects.toThrow();
  const wrong = f.join(accountId, 1);
  delete wrong.user!.consent.account_id;
  await expect(f.service.request(ctx(), wrong)).rejects.toThrow();
  const joined = await f.service.request(ctx(), f.join(accountId, 1));
  expect(joined.permissions).toEqual(['account:read']);
  expect(
    await f.service.account(principal('app-a', joined.grant_id), accountId),
  ).toMatchObject({ wallet: { kind: 'shared', name: 'Family expenses' } });
  await expect(
    f.service.authorize(
      principal('app-a', joined.grant_id),
      accountId,
      'contracts:request',
    ),
  ).rejects.toThrow();
  await expect(
    f.service.members(principal('app-a', joined.grant_id), accountId),
  ).rejects.toThrow();
  expect(
    await f.service.authorize(
      principal('app-a', owner.grant_id),
      accountId,
      'contracts:request',
    ),
  ).toBeDefined();
  expect(
    (await f.service.wallets(ctx(), 'member')).accounts.map(
      (a) => a.account_id,
    ),
  ).toEqual([accountId]);
  expect((await f.service.wallets(ctx(), 'someone-else')).accounts).toEqual([]);
});
it('requires fresh member consent after permission changes and leaves other wallets and people untouched', async () => {
  const f = await fixture();
  await f.service.request(ctx(), f.input());
  const personal = await f.service.request(ctx(), f.input('member'));
  const owner = await f.service.request(
      ctx(),
      f.extra('family', 'shared', ['account:read', 'members:manage']),
    ),
    id = owner.account_id!,
    manager = ctx('app-a', owner.grant_id);
  await f.service.saveMember(manager, id, {
    expected_revision: 0,
    user_id: 'member',
    enabled: true,
    permissions: ['account:read'],
  });
  const first = await f.service.request(ctx(), f.join(id, 1));
  const upgrade = await f.service.saveMember(
    { ...manager, idempotencyKey: randomUUID() },
    id,
    {
      expected_revision: 1,
      user_id: 'member',
      enabled: true,
      permissions: ['account:read', 'contracts:request'],
    },
  );
  await expect(
    f.service.account(principal('app-a', first.grant_id), id),
  ).rejects.toThrow();
  await expect(f.service.request(ctx(), f.join(id, 1))).rejects.toThrow();
  const next = await f.service.request(
    ctx(),
    f.join(id, upgrade.members[0].membership_revision, [
      'account:read',
      'contracts:request',
    ]),
  );
  expect(
    await f.service.authorize(
      principal('app-a', next.grant_id),
      id,
      'contracts:request',
    ),
  ).toBeDefined();
  await f.service.revokeApplicationGrant(ctx(), next.grant_id!);
  expect(
    await f.service.account(principal('app-a', owner.grant_id), id),
  ).toBeDefined();
  expect(
    await f.service.account(principal(), personal.account_id!),
  ).toBeDefined();
});
it('removes members immediately, fences stale management revisions and replay, and preserves the owner', async () => {
  const f = await fixture();
  await f.service.request(ctx(), f.input());
  const owner = await f.service.request(
      ctx(),
      f.extra('family', 'shared', ['account:read', 'members:manage']),
    ),
    id = owner.account_id!,
    manager = ctx('app-a', owner.grant_id);
  const body = {
    expected_revision: 0,
    user_id: 'member',
    enabled: true,
    permissions: ['account:read'] as Permission[],
  };
  const invitation = await f.service.saveMember(manager, id, body);
  expect(await f.service.saveMember(manager, id, body)).toEqual(invitation);
  await expect(
    f.service.saveMember(manager, id, { ...body, name: 'Changed' }),
  ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
  const joined = await f.service.request(ctx(), f.join(id, 1));
  await expect(
    f.service.saveMember(ctx('app-a', owner.grant_id), id, body),
  ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
  const removed = await f.service.saveMember(ctx('app-a', owner.grant_id), id, {
    expected_revision: 1,
    member_id: invitation.members[0].member_id,
    enabled: false,
    permissions: ['account:read'],
  });
  expect(removed.members[0].status).toBe('removed');
  await expect(
    f.service.account(principal('app-a', joined.grant_id), id),
  ).rejects.toThrow();
  await expect(f.service.request(ctx(), f.join(id, 1))).rejects.toThrow();
  expect(
    await f.service.account(principal('app-a', owner.grant_id), id),
  ).toBeDefined();
  await expect(
    f.service.saveMember(ctx('app-a', owner.grant_id), id, {
      expected_revision: 2,
      user_id: 'owner',
      enabled: true,
      permissions: ['account:read'],
    }),
  ).rejects.toThrow();
});
it('keeps cross-app default connections stable and requires explicit selection and consent for another wallet', async () => {
  const f = await fixture();
  const first = await f.service.request(ctx(), f.input());
  const other = await f.service.request(ctx(), f.extra('holiday'));
  const terms = await f.service.applicationAccessPolicy(
    principal('app-b'),
    'app-a',
  );
  const request = f.input();
  request.mode = 'connect_from_application';
  request.source_application_id = 'app-a';
  Object.assign(request.user!.consent, {
    source_application_id: 'app-a',
    sharing_revision: terms.wallet_sharing!.revision,
  });
  expect((await f.service.request(ctx('app-b'), request)).account_id).toBe(
    first.account_id,
  );
  request.user!.consent.reference = randomUUID();
  request.source_account_id = other.account_id;
  await expect(f.service.request(ctx('app-b'), request)).rejects.toThrow();
  request.user!.consent.account_id = other.account_id;
  expect((await f.service.request(ctx('app-b'), request)).account_id).toBe(
    other.account_id,
  );
});
it('allows independent invited users in an approved second app and rechecks the app-sharing relationship', async () => {
  const f = await fixture();
  await f.service.request(ctx(), f.input());
  const shared = await f.service.request(
    ctx(),
    f.extra('family', 'shared', ['account:read', 'members:manage']),
  );
  const terms = await f.service.applicationAccessPolicy(
    principal('app-b'),
    'app-a',
  );
  const value = f.input('owner', ['account:read', 'members:manage']);
  value.mode = 'connect_from_application';
  value.source_application_id = 'app-a';
  value.source_account_id = shared.account_id;
  Object.assign(value.user!.consent, {
    source_application_id: 'app-a',
    sharing_revision: terms.wallet_sharing!.revision,
    account_id: shared.account_id,
  });
  const b = await f.service.request(ctx('app-b'), value);
  await f.service.saveMember(ctx('app-b', b.grant_id), shared.account_id!, {
    expected_revision: 0,
    user_id: 'member',
    enabled: true,
    permissions: ['account:read'],
  });
  const member = await f.service.request(
    ctx('app-b'),
    f.join(shared.account_id!, 1),
  );
  expect(
    await f.service.account(
      principal('app-b', member.grant_id),
      shared.account_id!,
    ),
  ).toBeDefined();
  f.applications[0].walletSharing = undefined;
  await expect(
    f.service.account(principal('app-b', member.grant_id), shared.account_id!),
  ).rejects.toThrow();
});
it('serves the app integration over HTTP, and the SDK keeps each selected wallet grant on requests', async () => {
  const f = await fixture();
  await f.service.request(ctx(), f.input());
  const owner = await f.service.request(
    ctx(),
    f.extra('family', 'shared', ['account:read', 'members:manage']),
  );
  const app = await createServer({
    onboarding: { service: f.service, reviewers: [] },
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
    authenticate: async () => principal(),
    ready: async () => true,
    documentation: false,
  });
  const seen: Record<string, string>[] = [];
  const send = (async (url, init) => {
    seen.push(Object.fromEntries(new Headers(init?.headers)));
    const response = await app.inject({
      method: init?.method as 'POST' | 'GET',
      url: new URL(String(url)).pathname,
      headers: Object.fromEntries(new Headers(init?.headers)),
      ...(init?.body ? { payload: String(init.body) } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const client = createWalletsClient({
    url: 'https://wallet.example.test',
    authorization: async () => 'Bearer offline',
    fetch: send,
  });
  try {
    const wallets = await client.listWallets('owner');
    expect(wallets.accounts).toHaveLength(2);
    expect(wallets.accounts[0].is_default).toBe(true);
    const members = await client.members(owner.account_id!, owner.grant_id!);
    expect(members.revision).toBe(0);
    expect(seen.at(-1)!['wallet-grant-id']).toBe(owner.grant_id);
    const saved = await client.saveMember(
      owner.account_id!,
      owner.grant_id!,
      {
        expected_revision: 0,
        user_id: 'guest',
        enabled: true,
        permissions: ['account:read'],
      },
      randomUUID(),
    );
    expect(saved.members[0].status).toBe('invited');
    const bad = await app.inject({
      url: '/v1/accounts/' + owner.account_id + '/members',
      headers: { 'wallet-grant-id': randomUUID() },
    });
    expect(bad.statusCode).toBe(403);
    const missing = await app.inject({
      url: '/v1/accounts/' + owner.account_id + '/members',
    });
    expect(missing.statusCode).toBe(403);
    const revoked = await client.revokeAccess(owner.grant_id!, randomUUID());
    expect(revoked.status).toBe('revoked');
    await expect(
      client.members(owner.account_id!, owner.grant_id!),
    ).rejects.toMatchObject({ status: 403 });
    const remaining = await client.listWallets('owner');
    expect(remaining.accounts).toHaveLength(1);
    expect(remaining.accounts[0].is_default).toBe(true);
  } finally {
    await app.close();
  }
});

it('pins shared-wallet provisioning to the creator grant and rejects member provisioning', async () => {
  const f = await fixture();
  await f.service.request(ctx(), f.input());
  const owner = await f.service.request(
    ctx(),
    f.extra('family', 'shared', ['account:read', 'members:manage']),
  );
  const id = owner.account_id!;
  const authority = f.service.walletAuthority();
  const admission = await authority.provision(ctx('app-a', owner.grant_id), id);
  expect(await f.service.canDispatchProvision(admission!.attemptId, id)).toBe(
    true,
  );
  await f.service.saveMember(ctx('app-a', owner.grant_id), id, {
    expected_revision: 0,
    user_id: 'member',
    enabled: true,
    permissions: ['account:read'],
  });
  const member = await f.service.request(ctx(), f.join(id, 1));
  await expect(
    authority.provision(ctx('app-a', member.grant_id), id),
  ).rejects.toThrow();
  await f.service.revokeApplicationGrant(ctx(), owner.grant_id!);
  expect(await f.service.canDispatchProvision(admission!.attemptId, id)).toBe(
    false,
  );
});

it('reads only the selected wallet grant when unrelated people have active grants', async () => {
  const f = await fixture();
  await f.service.request(ctx(), f.input());
  const shared = await f.service.request(
    ctx(),
    f.extra('family', 'shared', ['account:read', 'members:manage']),
  );
  for (let i = 0; i < 8; i++)
    await f.service.request(ctx(), f.input('other-person-' + i));
  const transact = f.store.transaction.bind(f.store);
  let grantReads = 0;
  f.store.transaction = (work) =>
    transact((state) => {
      const grants = state.grants;
      state.grants = new Proxy(grants, {
        get(target, key, receiver) {
          if (typeof key === 'string' && Object.hasOwn(target, key))
            grantReads++;
          return Reflect.get(target, key, receiver);
        },
      });
      try {
        return work(state);
      } finally {
        state.grants = grants;
      }
    });
  await expect(
    f.service.account(principal('app-a', shared.grant_id), shared.account_id!),
  ).resolves.toMatchObject({ account_id: shared.account_id });
  expect(grantReads).toBe(1);
  await expect(
    f.service.account(principal('app-b', shared.grant_id), shared.account_id!),
  ).rejects.toThrow();
});

it.each([
  ['base', '0x2105'],
  ['ethereum-sepolia', '0xaa36a7'],
] as const)(
  'keeps %s when the wallets client creates a transaction adapter',
  async (network, chainId) => {
    const grantId = randomUUID(),
      accountId = randomUUID();
    const client = createWalletsClient({
      url: 'https://wallet.example.test',
      network,
      authorization: async () => 'Bearer offline',
      fetch: async (_url, init) => {
        expect(new Headers(init?.headers).get('Wallet-Grant-Id')).toBe(grantId);
        const body = JSON.parse(String(init?.body));
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            version: '2.0.0',
            id: 'batch',
            chainId,
            status: 100,
            atomic: true,
          },
        });
      },
    });
    const provider = client.walletProvider({
      account_id: accountId,
      grant_id: grantId,
      is_default: true,
      wallet: { reference: 'personal', name: 'Personal', kind: 'personal' },
      role: 'owner',
      permissions: ['account:read', 'contracts:request'],
      expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    expect(
      await provider.request({
        method: 'wallet_getCallsStatus',
        params: ['batch'],
      }),
    ).toMatchObject({ chainId, status: 100 });
  },
);
