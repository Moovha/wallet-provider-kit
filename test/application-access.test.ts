import {
  defineOnboardingPolicy,
  fingerprint,
} from '../src/onboarding/policy.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { OnboardingService } from '../src/onboarding/service.js';
import { createFileOnboardingStore } from '../src/onboarding/file-store.js';
import { createServer } from '../src/service/server.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
import { createOnboardingJournal } from '../src/onboarding/journal.js';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import type {
  AccessInput,
  AccessRequestInput,
  OnboardingPolicy,
} from '../src/onboarding/types.js';

const folders: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    folders
      .splice(0)
      .map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
const policy: OnboardingPolicy = {
  version: 'app-access-1',
  provider: {
    name: 'Example',
    origin: 'https://wallet.example.test',
    privacyUrl: 'https://wallet.example.test/privacy',
  },
  applications: ['app-a', 'app-b'].map((clientId) => ({
    issuer: 'https://apps.example.test',
    clientId,
    name: clientId,
    assertionTrust: { agreement: 'reviewed-test-agreement' },
    permissions: ['account:read', 'operations:request', 'contracts:request'],
  })),
  access: { mode: 'application', maxAgeDays: 7 },
  identity: {
    maxAgeDays: 90,
    application: { verificationLevel: 'verified', requiredFields: ['country'] },
  },
};
function context(clientId = 'app-a') {
  return {
    principal: {
      issuer: 'https://apps.example.test',
      subject: clientId,
      clientId,
      scopes: [
        'wallet:access',
        'wallet:access:read',
        'wallet:account:read',
        'wallet:provision',
        'wallet:sign',
      ],
    },
    idempotencyKey: randomUUID(),
  };
}
async function fixture(transferRevision?: string) {
  const folder = await mkdtemp(join(tmpdir(), 'wpk-app-access-'));
  folders.push(folder);
  const store = createFileOnboardingStore(folder);
  const service = new OnboardingService(
    policy,
    store,
    [],
    undefined,
    transferRevision,
  );
  function input(id = 'user-1'): AccessInput {
    return {
      mode: 'create',
      user: {
        id,
        identity: {
          reference: 'identity-' + id,
          level: 'verified',
          verified_at: new Date(Date.now() - 1000).toISOString(),
          fields: { country: 'ZA' },
        },
        consent: {
          reference: randomUUID(),
          granted_at: new Date(Date.now() - 1000).toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          policy_revision: service.policy.revision,
        },
      },
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: ['account:read', 'operations:request'],
        },
      ],
    };
  }
  return { service, store, input };
}
it('grants trusted application access without login or review and preserves one wallet across retries and renewal', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  const f = await fixture();
  const ctx = context();
  const input = f.input();
  const receipt = await f.service.request(ctx, input);
  expect(receipt.status).toBe('granted');
  expect(receipt).not.toHaveProperty('consent_url');
  expect(f.service.accessPolicy(ctx.principal)).toMatchObject({
    flow: 'application',
    source: 'application_attestation',
    provider_login_required: false,
    provider_review_required: false,
  });
  expect(await f.service.request(ctx, input)).toEqual(receipt);
  const other = await f.service.request(context(), input);
  expect(other.account_id).toBe(receipt.account_id);
  expect(
    await f.store.transaction((state) => Object.keys(state.accounts)),
  ).toHaveLength(1);
  const raw = {
    provider: 'offline',
    createAccount: vi.fn(async (accountId: string) => ({
      accountId,
      address: '0x1111111111111111111111111111111111111111',
    })),
    findAccount: vi.fn(
      async (): Promise<
        import('../src/domain/signing.js').EmbeddedAccount | null
      > => null,
    ),
    signTypedData: vi.fn(async () => {
      throw new Error('No signing in this fixture');
    }),
  };
  const backend = createJournaledWalletProvider(raw, {
    namespace: 'test-app-access',
    journal: createOnboardingJournal(f.store),
    authorizeAttempt: (request) =>
      f.service.canDispatchProvision(request.attemptId, request.accountId),
  });
  const wallet = new EmbeddedWalletService(
    f.service.walletAuthority(),
    backend,
  );
  const provision = context();
  const result = await wallet.provision(provision, receipt.account_id!);
  expect(await wallet.provision(provision, receipt.account_id!)).toEqual(
    result,
  );
  expect(raw.createAccount).toHaveBeenCalledTimes(1);
  await f.service.revokeApplicationGrant(ctx, other.grant_id!);
  await expect(
    wallet.provision(provision, receipt.account_id!),
  ).rejects.toThrow();
  await expect(f.service.request(context(), input)).rejects.toThrow();
  vi.advanceTimersByTime(1);
  const renewedInput = f.input();
  renewedInput.user!.consent.granted_at = new Date().toISOString();
  const renewed = await f.service.request(context(), renewedInput);
  expect(renewed.account_id).toBe(receipt.account_id);
  expect(renewed.status).toBe('granted');
  const originalAdmission = await f.store.transaction((state) =>
    structuredClone(Object.entries(state.admissions)[0]),
  );
  expect(
    await f.service.canDispatchProvision(
      originalAdmission[0],
      receipt.account_id!,
    ),
  ).toBe(false);
  raw.findAccount.mockImplementation(async () => result);
  expect(await wallet.provision(context(), receipt.account_id!)).toEqual(
    result,
  );
  expect(raw.createAccount).toHaveBeenCalledTimes(1);
  expect(
    await f.store.transaction((state) => Object.entries(state.admissions)[0]),
  ).toEqual(originalAdmission);
  raw.findAccount.mockResolvedValueOnce(null);
  await expect(
    wallet.provision(context(), receipt.account_id!),
  ).rejects.toMatchObject({ code: 'wallet_provider_unavailable' });
  raw.findAccount.mockImplementationOnce(async () => {
    await f.service.revokeApplicationGrant(context(), renewed.grant_id!);
    return result;
  });
  await expect(
    wallet.provision(context(), receipt.account_id!),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(raw.createAccount).toHaveBeenCalledTimes(1);
});
it('keeps uncertain creation bound to its original grant after permission renewal', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  const f = await fixture();
  const ctx = context();
  const granted = await f.service.request(ctx, f.input());
  const raw = {
    provider: 'offline',
    createAccount: vi.fn(async (): Promise<never> => {
      throw new Error('Lost fixture response');
    }),
    findAccount: vi.fn(async (accountId: string) => ({
      accountId,
      address: '0x1111111111111111111111111111111111111111',
    })),
    signTypedData: vi.fn(),
  };
  const backend = createJournaledWalletProvider(raw, {
    namespace: 'test-app-access',
    journal: createOnboardingJournal(f.store),
    authorizeAttempt: (request) =>
      f.service.canDispatchProvision(request.attemptId, request.accountId),
  });
  const wallet = new EmbeddedWalletService(
    f.service.walletAuthority(),
    backend,
  );
  await expect(
    wallet.provision(context(), granted.account_id!),
  ).rejects.toMatchObject({ outcome: 'unknown' });
  const before = await f.store.transaction((state) =>
    structuredClone({ admissions: state.admissions, attempts: state.attempts }),
  );
  await f.service.revokeApplicationGrant(context(), granted.grant_id!);
  vi.advanceTimersByTime(1);
  const input = f.input();
  input.user!.consent.granted_at = new Date().toISOString();
  const renewed = await f.service.request(context(), input);
  expect(renewed.account_id).toBe(granted.account_id);
  await expect(
    wallet.provision(context(), renewed.account_id!),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(raw.createAccount).toHaveBeenCalledTimes(1);
  expect(raw.findAccount).not.toHaveBeenCalled();
  expect(
    await f.store.transaction((state) => ({
      admissions: state.admissions,
      attempts: state.attempts,
    })),
  ).toEqual(before);
});
it('isolates application user IDs, wallet connections, evidence references and grant revocation', async () => {
  const f = await fixture();
  const a = await f.service.request(context(), f.input());
  const b = await f.service.request(context('app-b'), f.input());
  expect(a.account_id).not.toBe(b.account_id);
  await expect(
    f.service.request(context('app-b'), {
      ...f.input(),
      mode: 'connect',
      account_id: a.account_id,
    }),
  ).rejects.toThrow();
  await expect(
    f.service.revokeApplicationGrant(context('app-b'), a.grant_id!),
  ).rejects.toThrow();
  const revoke = context();
  await f.service.revokeApplicationGrant(revoke, a.grant_id!);
  const secondUser = await f.service.request(
    context(),
    f.input('another-user'),
  );
  await expect(
    f.service.revokeApplicationGrant(revoke, secondUser.grant_id!),
  ).rejects.toThrow('wallet_attempt_conflict');
  const impersonation = f.input('different-user');
  impersonation.user!.identity.reference = 'identity-user-1';
  await expect(f.service.request(context(), impersonation)).rejects.toThrow();
});
it.each([
  'old-identity',
  'future-identity',
  'wrong-level',
  'missing-field',
  'old-policy',
  'expired-consent',
  'future-consent',
  'long-consent',
  'missing-user',
])('denies %s before creating authority', async (reason) => {
  const f = await fixture();
  const input = f.input();
  if (reason === 'old-identity')
    input.user!.identity.verified_at = new Date(
      Date.now() - 91 * 86400000,
    ).toISOString();
  if (reason === 'future-identity')
    input.user!.identity.verified_at = new Date(
      Date.now() + 60000,
    ).toISOString();
  if (reason === 'wrong-level') input.user!.identity.level = 'pending';
  if (reason === 'missing-field') input.user!.identity.fields = {};
  if (reason === 'old-policy') input.user!.consent.policy_revision = 'old';
  if (reason === 'expired-consent')
    input.user!.consent.expires_at = new Date(Date.now() - 1000).toISOString();
  if (reason === 'future-consent')
    input.user!.consent.granted_at = new Date(Date.now() + 60000).toISOString();
  if (reason === 'long-consent')
    input.user!.consent.expires_at = new Date(
      Date.now() + 8 * 86400000,
    ).toISOString();
  if (reason === 'missing-user') delete input.user;
  await expect(f.service.request(context(), input)).rejects.toThrow();
  expect(
    await f.store.transaction((state) => Object.keys(state.grants)),
  ).toHaveLength(0);
});
it('requires explicit application trust and binds contract delegation to the exact action policy', async () => {
  const f = await fixture('action-policy-1');
  const input = f.input();
  input.authorization_details[0].actions.push('contracts:request');
  input.user!.consent.action_policy_revision = 'stale-action-policy';
  await expect(f.service.request(context(), input)).rejects.toThrow();
  input.user!.consent.action_policy_revision = 'action-policy-1';
  const granted = await f.service.request(context(), input);
  expect(
    (
      await f.service.authorize(
        context().principal,
        granted.account_id!,
        'contracts:request',
      )
    ).owner,
  ).toBeTruthy();
  const changed = new OnboardingService(
    policy,
    f.store,
    [],
    undefined,
    'action-policy-2',
  );
  await expect(
    changed.authorize(
      context().principal,
      granted.account_id!,
      'contracts:request',
    ),
  ).rejects.toThrow();
  const untrusted = structuredClone(policy);
  delete untrusted.applications[0].assertionTrust;
  expect(() => new OnboardingService(untrusted, f.store)).toThrow();
});
it('rechecks expiry and changed policy before granting access to saved accounts', async () => {
  const f = await fixture();
  const receipt = await f.service.request(context(), f.input());
  const changed = new OnboardingService({ ...policy, version: '2' }, f.store);
  await expect(
    changed.account(context().principal, receipt.account_id!),
  ).rejects.toThrow();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 86400001);
  await expect(
    f.service.account(context().principal, receipt.account_id!),
  ).rejects.toThrow();
});
it('serves the application-led HTTP contract without an owner login and denies hosted UI and foreign callers', async () => {
  const f = await fixture();
  const app = await createServer({
    service: new EmbeddedWalletService(f.service.walletAuthority(), {
      provider: 'offline',
      createAccount: async (accountId) => ({
        accountId,
        address: '0x1111111111111111111111111111111111111111',
      }),
      findAccount: async () => null,
      signTypedData: async () => {
        throw new Error('Unavailable');
      },
    }),
    ready: async () => true,
    authenticate: async (_authorization, scope) => {
      const principal = context().principal;
      if (!principal.scopes.includes(scope)) throw new Error();
      return principal;
    },
    onboarding: { service: f.service, reviewers: [] },
  });
  try {
    const accessPolicy = await app.inject({ url: '/v1/access-policy' });
    expect(accessPolicy.json()).toMatchObject({
      flow: 'application',
      provider_review_required: false,
    });
    const minimal: AccessRequestInput = f.input();
    delete minimal.user!.identity!.level;
    delete minimal.user!.consent.reference;
    delete minimal.user!.consent.policy_revision;
    const receipt = await app.inject({
      method: 'POST',
      url: '/v1/access-requests',
      headers: { 'idempotency-key': randomUUID() },
      payload: minimal,
    });
    expect(receipt.statusCode).toBe(200);
    expect(receipt.json().status).toBe('granted');
    expect(receipt.json().consent).toMatchObject({
      reference: expect.stringMatching(/^provider-consent-[a-f0-9]{64}$/),
      policy_revision: f.service.policy.revision,
    });
    expect(receipt.json()).not.toHaveProperty('consent_url');
    const revoked = await app.inject({
      method: 'POST',
      url: `/v1/access-grants/${receipt.json().grant_id}/revoke`,
      headers: { 'idempotency-key': randomUUID() },
      payload: {},
    });
    expect(revoked.statusCode).toBe(200);
    expect((await app.inject({ url: '/onboarding/access' })).statusCode).toBe(
      404,
    );
  } finally {
    await app.close();
  }
});
it('validates the standard example without owner login, reviewers or vendor credentials', async () => {
  const config = validateProviderConfiguration(
    JSON.parse(
      await readFile('docs/provider.config.safe.example.json', 'utf8'),
    ),
  );
  expect(config.policy.access?.mode).toBe('application');
  expect(config.ownerLogin).toBeUndefined();
  expect(config.reviewers).toBeUndefined();
  expect(config.identity).toEqual({});
});

it('preserves legacy hosted policy revisions when access mode was omitted', () => {
  const legacy: OnboardingPolicy = {
    version: 'legacy-1',
    provider: policy.provider,
    applications: [
      {
        issuer: 'https://apps.example.test',
        clientId: 'legacy',
        name: 'Legacy',
      },
    ],
  };
  const expected = fingerprint({
    ...legacy,
    identity: { maxAgeDays: 365 },
    access: { maxAgeDays: 30 },
  });
  expect(defineOnboardingPolicy(legacy)).toMatchObject({
    revision: expected,
    access: { mode: 'hosted', maxAgeDays: 30 },
  });
});

it('serializes concurrent access requests for a new application user into one account and one active grant', async () => {
  const f = await fixture();
  const input = f.input('concurrent-user');
  const receipts = await Promise.all(
    Array.from({ length: 4 }, () => f.service.request(context(), input)),
  );
  expect(new Set(receipts.map((receipt) => receipt.account_id)).size).toBe(1);
  const stored = await f.store.transaction((state) => ({
    accounts: Object.keys(state.accounts),
    grants: Object.values(state.grants).filter(
      (grant) => grant.state === 'active',
    ),
  }));
  expect(stored.accounts).toHaveLength(1);
  expect(stored.grants).toHaveLength(1);
  expect(stored.grants[0].accountId).toBe(receipts[0].account_id);
  const rotated = context();
  rotated.principal.subject = 'rotated-service-caller';
  await f.service.request(rotated, input);
  // A withdrawal using an older receipt also invalidates its superseding consent grant.
  await f.service.revokeApplicationGrant(context(), receipts[0].grant_id!);
  await expect(
    f.service.account(context().principal, receipts[0].account_id!),
  ).rejects.toThrow();
  await expect(f.service.request(context(), input)).rejects.toThrow();
  await expect(
    f.service.account(rotated.principal, receipts[0].account_id!),
  ).rejects.toThrow();
});

it('binds contract delegation to the action-policy consent revision and rejects a changed consent revision', async () => {
  const f = await fixture(),
    configured = structuredClone(policy),
    revision = 'a'.repeat(64);
  const service = new OnboardingService(
    configured,
    f.store,
    [],
    undefined,
    revision,
  );
  const input = f.input();
  input.authorization_details[0].actions = [
    'account:read',
    'contracts:request',
  ];
  input.user!.consent.policy_revision = service.policy.revision;
  input.user!.consent.action_policy_revision = revision;
  const granted = await service.request(context(), input);
  expect(
    (
      await service.authorize(
        context().principal,
        granted.account_id!,
        'contracts:request',
      )
    ).owner,
  ).toBeTruthy();
  input.user!.consent.action_policy_revision = 'b'.repeat(64);
  await expect(service.request(context(), input)).rejects.toThrow();
});

it('resolves omitted assertion labels, returns saved consent metadata and preserves retries across restart', async () => {
  const f = await fixture('action-policy-1');
  const input: AccessRequestInput = f.input();
  delete input.user!.identity!.level;
  delete input.user!.consent.reference;
  delete input.user!.consent.policy_revision;
  input.authorization_details[0].actions.push('contracts:request');
  const caller = context();
  const granted = await f.service.request(caller, input);
  expect(granted.status).toBe('granted');
  expect(granted.consent).toMatchObject({
    reference: expect.stringMatching(/^provider-consent-[a-f0-9]{64}$/),
    policy_revision: f.service.policy.revision,
    action_policy_revision: 'action-policy-1',
  });
  expect(input.user!.consent.reference).toBeUndefined();
  const saved = await f.store.transaction(
    (state) => state.requests[granted.request_id],
  );
  expect(saved.input.user!.identity.level).toBe('verified');
  expect(saved.input.user!.consent).toMatchObject(granted.consent!);
  const restarted = new OnboardingService(
    policy,
    f.store,
    [],
    undefined,
    'action-policy-1',
  );
  expect(await restarted.request(caller, input)).toEqual(granted);
  const other: AccessRequestInput = f.input('user-2');
  delete other.user!.consent.reference;
  delete other.user!.consent.policy_revision;
  const second = await restarted.request(context(), other);
  expect(second.consent!.reference).not.toBe(granted.consent!.reference);
});

it('keeps withdrawal fences and policy changes effective when assertion labels are omitted', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const f = await fixture('action-policy-1');
  const input: AccessRequestInput = f.input();
  delete input.user!.identity!.level;
  delete input.user!.consent.reference;
  delete input.user!.consent.policy_revision;
  input.authorization_details[0].actions.push('contracts:request');
  const caller = context();
  const first = await f.service.request(caller, input);
  vi.setSystemTime(Date.now() + 1000);
  await f.service.revokeApplicationGrant(context(), first.grant_id!);
  await expect(f.service.request(context(), input)).rejects.toThrow(
    'wallet_authorization_denied',
  );
  vi.advanceTimersByTime(1);
  const renewed = structuredClone(input);
  renewed.user!.consent.granted_at = new Date().toISOString();
  const second = await f.service.request(context(), renewed);
  expect(second.account_id).toBe(first.account_id);
  expect(second.grant_id).not.toBe(first.grant_id);
  const changed = new OnboardingService(
    policy,
    f.store,
    [],
    undefined,
    'action-policy-2',
  );
  expect((await changed.read(context(), second.request_id)).status).toBe(
    'policy_changed',
  );
  await expect(
    changed.authorize(
      context().principal,
      second.account_id!,
      'contracts:request',
    ),
  ).rejects.toThrow();
});

it.each([
  'reference',
  'policy_revision',
  'action_policy_revision',
  'level',
] as const)(
  'rejects explicit empty or conflicting %s instead of replacing it',
  async (field) => {
    const f = await fixture('action-policy-1');
    for (const value of ['', null, 'conflicting-value']) {
      const input = f.input();
      input.authorization_details[0].actions.push('contracts:request');
      if (field === 'level')
        (input.user!.identity as Record<string, unknown>)[field] = value;
      else (input.user!.consent as Record<string, unknown>)[field] = value;
      if (field === 'reference' && value === 'conflicting-value') continue;
      await expect(f.service.request(context(), input)).rejects.toThrow();
    }
    expect(
      await f.store.transaction((state) => Object.keys(state.grants)),
    ).toHaveLength(0);
  },
);
