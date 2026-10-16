import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  rm,
  readFile,
  mkdir,
  writeFile,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingService, ownerKey } from '../src/onboarding/service.js';
import { createFileOnboardingStore } from '../src/onboarding/file-store.js';
import {
  defineOnboardingPolicy,
  fingerprint,
} from '../src/onboarding/policy.js';
import {
  accessType,
  type IdentityAdapter,
  type IdentityEvidence,
  type OnboardingPolicy,
  type OwnerIdentity,
} from '../src/onboarding/types.js';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
import { createOnboardingJournal } from '../src/onboarding/journal.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import type { AuthorityContext } from '../src/domain/principal.js';
import { WalletProviderError } from '../src/domain/signing.js';

const folders: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    folders.splice(0).map((f) => rm(f, { recursive: true, force: true })),
  );
});
const issuer = 'https://apps.example.test';
const policy: OnboardingPolicy = {
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
      name: 'Moovha',
      funding: { agreement: 'signed-example-contract', monthlyLimitMinor: 100 },
    },
  ],
};
function context(): AuthorityContext {
  return {
    principal: {
      issuer,
      subject: 'app-service',
      clientId: 'moovha',
      scopes: ['wallet:access', 'wallet:access:read', 'wallet:provision'],
    },
    idempotencyKey: randomUUID(),
  };
}
const staff = {
  issuer: 'https://provider-id.example.test',
  subject: 'reviewer',
  clientId: 'review',
  scopes: ['wallet:review'],
};
function owner(subject = 'alice'): OwnerIdentity {
  return {
    issuer: 'https://provider-id.example.test',
    subject,
    authenticatedAt: Date.now(),
  };
}
const input = () =>
  ({
    mode: 'create' as const,
    authorization_details: [
      { type: accessType, actions: ['account:read', 'operations:request'] },
    ],
  }) as const;
function requestInput() {
  return structuredClone(input()) as unknown as Parameters<
    OnboardingService['request']
  >[1];
}
async function setup() {
  const folder = await mkdtemp(join(tmpdir(), 'wpk-onboarding-'));
  folders.push(folder);
  const store = createFileOnboardingStore(folder);
  const reference = randomUUID();
  const evidence = (correlation: string): IdentityEvidence => ({
    vendor: 'didit',
    reference,
    correlation,
    status: 'approved',
    fetchedAt: new Date().toISOString(),
  });
  const adapter: IdentityAdapter = {
    vendor: 'didit',
    price: { maximumMinor: 10, termsReference: 'confirmed-contract' },
    importShared: vi.fn(async (_token, id) => evidence(id)),
    read: vi.fn(async (_reference, id) => evidence(id)),
  };
  const service = new OnboardingService(policy, store, [adapter]);
  const ctx = context();
  const identity = owner();
  const receipt = await service.request(ctx, requestInput());
  return { folder, store, adapter, service, ctx, identity, receipt, evidence };
}
async function accept(f: Awaited<ReturnType<typeof setup>>) {
  await f.service.consent(f.receipt.request_id, f.identity, true);
  await f.service.importIdentity(
    f.ctx,
    f.receipt.request_id,
    'didit',
    'opaque-share-token',
  );
  return f.service.review(staff, f.receipt.request_id, {
    decision: 'accept',
    identity_matches_owner: true,
    verified_at: new Date(Date.now() - 1000).toISOString(),
  });
}

describe('provider onboarding and access', () => {
  it('uses compact documented defaults, rejects typos and freezes configuration', () => {
    const resolved = defineOnboardingPolicy(policy);
    expect(resolved.identity.maxAgeDays).toBe(365);
    expect(resolved.access.maxAgeDays).toBe(30);
    expect(() => {
      resolved.applications[0].enabled = false;
    }).toThrow();
    expect(() =>
      defineOnboardingPolicy({
        ...policy,
        permissive: true,
      } as OnboardingPolicy),
    ).toThrow('wallet_provider_configuration');
    expect(() =>
      defineOnboardingPolicy({
        ...policy,
        applications: [
          {
            ...policy.applications[0],
            funding: { agreement: 'x', monthlyLimitMinor: -1 },
          },
        ],
      }),
    ).toThrow();
  });
  it('completes owner consent, recipient review and restricted access, then provisions only once', async () => {
    const f = await setup();
    expect(f.receipt.status).toBe('consent_required');
    expect(f.receipt).not.toHaveProperty('account_id');
    await expect(
      f.service.importIdentity(f.ctx, f.receipt.request_id, 'didit', 'opaque'),
    ).rejects.toThrow('wallet_authorization_denied');
    const granted = await accept(f);
    expect(granted.status).toBe('granted');
    expect(granted.permissions).toEqual(['account:read', 'operations:request']);
    expect(Date.parse(granted.expires_at!) - Date.now()).toBeLessThanOrEqual(
      30 * 86400000,
    );
    const backend = {
      provider: 'offline',
      createAccount: vi.fn(async (accountId: string) => ({
        accountId,
        address: '0x1111111111111111111111111111111111111111',
      })),
      findAccount: vi.fn(),
      signTypedData: vi.fn(),
    };
    const journaled = createJournaledWalletProvider(backend, {
      namespace: 'test',
      journal: createOnboardingJournal(f.store),
      authorizeAttempt: (r) =>
        f.service.canDispatchProvision(r.attemptId, r.accountId),
    });
    const wallets = new EmbeddedWalletService(
      f.service.walletAuthority(),
      journaled,
    );
    await wallets.provision(f.ctx, granted.account_id!);
    await wallets.provision(
      { ...f.ctx, idempotencyKey: randomUUID() },
      granted.account_id!,
    );
    expect(backend.createAccount).toHaveBeenCalledTimes(1);
    expect(
      await f.service.account(f.ctx.principal, granted.account_id!),
    ).toHaveProperty('address');
    await expect(wallets.sign(f.ctx, randomUUID())).rejects.toThrow(
      'wallet_authorization_denied',
    );
    expect(backend.signTypedData).not.toHaveBeenCalled();
  });
  it('requires provider review even when the vendor approves; owner login is separate from KYC', async () => {
    const f = await setup();
    await f.service.consent(f.receipt.request_id, f.identity, true);
    expect(
      (
        await f.service.importIdentity(
          f.ctx,
          f.receipt.request_id,
          'didit',
          'opaque',
        )
      ).status,
    ).toBe('provider_review_required');
    await expect(
      f.service.authorize(f.ctx.principal, randomUUID(), 'account:read'),
    ).rejects.toThrow();
    await expect(
      f.service.review(staff, f.receipt.request_id, {
        decision: 'accept',
        identity_matches_owner: false,
        verified_at: new Date().toISOString(),
      }),
    ).rejects.toThrow('wallet_authorization_denied');
    await expect(
      f.service.review(staff, f.receipt.request_id, {
        decision: 'accept',
        identity_matches_owner: true,
      }),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(await f.store.transaction((s) => Object.keys(s.grants))).toEqual([]);
  });
  it('isolates clients and subjects, requires recent owner authentication, and binds consent once', async () => {
    const f = await setup();
    const other = {
      ...f.ctx,
      principal: { ...f.ctx.principal, subject: 'other-app-service' },
    };
    await expect(f.service.read(other, f.receipt.request_id)).rejects.toThrow();
    await expect(
      f.service.request(
        { ...f.ctx, principal: { ...f.ctx.principal, clientId: 'unknown' } },
        requestInput(),
      ),
    ).rejects.toThrow();
    await expect(
      f.service.consent(
        f.receipt.request_id,
        { ...f.identity, authenticatedAt: Date.now() - 301000 },
        true,
      ),
    ).rejects.toThrow();
    await f.service.consent(f.receipt.request_id, f.identity, true);
    await expect(
      f.service.consent(f.receipt.request_id, owner('bob'), true),
    ).rejects.toThrow();
    await expect(
      f.service.consentView(f.receipt.request_id, owner('bob')),
    ).rejects.toThrow();
  });
  it('makes exact requests idempotent across restart and rejects changed requests', async () => {
    const f = await setup();
    const restored = new OnboardingService(
      policy,
      createFileOnboardingStore(f.folder),
      [f.adapter],
    );
    expect(await restored.request(f.ctx, requestInput())).toEqual(f.receipt);
    const changed = requestInput();
    changed.authorization_details[0].actions = ['account:read'];
    await expect(restored.request(f.ctx, changed)).rejects.toThrow(
      'wallet_attempt_conflict',
    );
    const raw = await readFile(join(f.folder, 'state.json'), 'utf8');
    expect(raw).not.toContain('opaque-share-token');
  });
  it('does not enumerate existing accounts and converges concurrent create requests on one owner account', async () => {
    const f = await setup();
    const grant = await accept(f);
    const second = await f.service.request(
      { ...f.ctx, idempotencyKey: randomUUID() },
      requestInput(),
    );
    const secondGrant = await f.service.consent(
      second.request_id,
      f.identity,
      true,
    );
    expect(secondGrant.account_id).toBe(grant.account_id);
    const connect = requestInput();
    connect.mode = 'connect';
    connect.account_id = grant.account_id;
    const requested = await f.service.request(
      { ...f.ctx, idempotencyKey: randomUUID() },
      connect,
    );
    expect(requested.status).toBe('consent_required');
    await expect(
      f.service.consentView(requested.request_id, owner('bob')),
    ).rejects.toThrow();
    expect(
      (await f.service.consent(requested.request_id, f.identity, true)).status,
    ).toBe('granted');
    expect(
      await f.store.transaction((s) => Object.keys(s.accounts).length),
    ).toBe(1);
  });
  it.each(['missing-price', 'missing-agreement', 'over-budget'])(
    'does not contact the vendor when funding is %s',
    async (mode) => {
      const f = await setup();
      const adapter = {
        ...f.adapter,
        ...(mode === 'missing-price' ? { price: undefined } : {}),
      };
      const selected = structuredClone(policy);
      if (mode === 'missing-agreement') delete selected.applications[0].funding;
      if (mode === 'over-budget')
        selected.applications[0].funding!.monthlyLimitMinor = 9;
      const service = new OnboardingService(selected, f.store, [adapter]);
      const receipt = await service.request(
        { ...f.ctx, idempotencyKey: randomUUID() },
        requestInput(),
      );
      await service.consent(receipt.request_id, f.identity, true);
      expect(
        (
          await service.importIdentity(
            f.ctx,
            receipt.request_id,
            'didit',
            'opaque',
          )
        ).status,
      ).toBe('funding_approval_required');
      expect(adapter.importShared).not.toHaveBeenCalled();
    },
  );
  it('atomically reserves the monthly cap for concurrent imports and never stores share tokens', async () => {
    const f = await setup();
    const selected = structuredClone(policy);
    selected.applications[0].funding!.monthlyLimitMinor = 10;
    const service = new OnboardingService(selected, f.store, [f.adapter]);
    const a = await service.request(
      { ...f.ctx, idempotencyKey: randomUUID() },
      requestInput(),
    );
    const b = await service.request(
      { ...f.ctx, idempotencyKey: randomUUID() },
      requestInput(),
    );
    await service.consent(a.request_id, f.identity, true);
    await service.consent(b.request_id, owner('bob'), true);
    const results = await Promise.all([
      service.importIdentity(
        { ...f.ctx, idempotencyKey: randomUUID() },
        a.request_id,
        'didit',
        'secret-a',
      ),
      service.importIdentity(
        { ...f.ctx, idempotencyKey: randomUUID() },
        b.request_id,
        'didit',
        'secret-b',
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      'funding_approval_required',
      'provider_review_required',
    ]);
    expect(f.adapter.importShared).toHaveBeenCalledTimes(1);
    expect(await readFile(join(f.folder, 'state.json'), 'utf8')).not.toContain(
      'secret-',
    );
  });
  it('holds uncertain imports across restart and recovers with a correlated recipient reference', async () => {
    const f = await setup();
    vi.mocked(f.adapter.importShared).mockRejectedValueOnce(
      new Error('vendor response containing secret'),
    );
    await f.service.consent(f.receipt.request_id, f.identity, true);
    await expect(
      f.service.importIdentity(
        f.ctx,
        f.receipt.request_id,
        'didit',
        'opaque-share-token',
      ),
    ).rejects.toThrow('wallet_identity_unavailable');
    const restored = new OnboardingService(
      policy,
      createFileOnboardingStore(f.folder),
      [f.adapter],
    );
    expect(
      (
        await restored.importIdentity(
          f.ctx,
          f.receipt.request_id,
          'didit',
          'opaque-share-token',
        )
      ).status,
    ).toBe('reconciliation_required');
    expect(f.adapter.importShared).toHaveBeenCalledTimes(1);
    const result = await restored.review(staff, f.receipt.request_id, {
      decision: 'accept',
      identity_matches_owner: true,
      reference: f.evidence(f.receipt.request_id).reference,
      verified_at: new Date().toISOString(),
    });
    expect(result.status).toBe('granted');
    expect(await f.store.transaction((s) => Object.values(s.budgets))).toEqual([
      10,
    ]);
  });
  it('rejects stale, future and rejected evidence and prevents reuse across different owners', async () => {
    const f = await setup();
    await f.service.consent(f.receipt.request_id, f.identity, true);
    await f.service.importIdentity(
      f.ctx,
      f.receipt.request_id,
      'didit',
      'opaque',
    );
    for (const time of [Date.now() - 366 * 86400000, Date.now() + 60000])
      await expect(
        f.service.review(staff, f.receipt.request_id, {
          decision: 'accept',
          identity_matches_owner: true,
          verified_at: new Date(time).toISOString(),
        }),
      ).rejects.toThrow();
    await f.service.review(staff, f.receipt.request_id, {
      decision: 'accept',
      identity_matches_owner: true,
      verified_at: new Date().toISOString(),
    });
    const second = await f.service.request(
      { ...f.ctx, idempotencyKey: randomUUID() },
      requestInput(),
    );
    await f.service.consent(second.request_id, owner('bob'), true);
    await f.service.importIdentity(
      { ...f.ctx, idempotencyKey: randomUUID() },
      second.request_id,
      'didit',
      'opaque-b',
    );
    await expect(
      f.service.review(staff, second.request_id, {
        decision: 'accept',
        identity_matches_owner: true,
        verified_at: new Date().toISOString(),
      }),
    ).rejects.toThrow('wallet_authorization_denied');
  });
  it('revokes access immediately, applies policy changes and expires grants without extending them on reads', async () => {
    const f = await setup();
    const granted = await accept(f);
    await f.service.changeGrant(granted.grant_id!, 'revoked', f.identity);
    await expect(
      f.service.authorize(f.ctx.principal, granted.account_id!, 'account:read'),
    ).rejects.toThrow();
    expect((await f.service.read(f.ctx, f.receipt.request_id)).status).toBe(
      'revoked',
    );
    const revised = new OnboardingService(
      { ...policy, version: '2' },
      f.store,
      [f.adapter],
    );
    await expect(
      revised.authorize(f.ctx.principal, granted.account_id!, 'account:read'),
    ).rejects.toThrow();
    expect((await revised.read(f.ctx, f.receipt.request_id)).status).toBe(
      'policy_changed',
    );
    expect(ownerKey(f.identity)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('checks revocation after the journal claim before contacting the wallet backend', async () => {
    const f = await setup();
    const granted = await accept(f);
    const journal = createOnboardingJournal(f.store);
    const claim = journal.claim;
    journal.claim = async (r) => {
      const result = await claim(r);
      await f.service.changeGrant(granted.grant_id!, 'revoked', f.identity);
      return result;
    };
    const createAccount = vi.fn();
    const wrapped = createJournaledWalletProvider(
      {
        provider: 'offline',
        createAccount,
        findAccount: vi.fn(),
        signTypedData: vi.fn(),
      },
      {
        namespace: 'test',
        journal,
        authorizeAttempt: (r) =>
          f.service.canDispatchProvision(r.attemptId, r.accountId),
      },
    );
    await expect(
      new EmbeddedWalletService(f.service.walletAuthority(), wrapped).provision(
        f.ctx,
        granted.account_id!,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(createAccount).not.toHaveBeenCalled();
  });
  it('starts fresh verification only once under an agreed cap', async () => {
    const f = await setup();
    const adapter = {
      ...f.adapter,
      verificationPrice: {
        maximumMinor: 33,
        termsReference: 'confirmed-fresh-cost',
      },
      startVerification: vi.fn(async () => ({
        url: 'https://verify.didit.me/session/test',
        reference: randomUUID(),
      })),
    };
    const service = new OnboardingService(policy, f.store, [adapter]);
    await service.consent(f.receipt.request_id, f.identity, true);
    const a = await service.startVerification(
      f.receipt.request_id,
      f.identity,
      'didit',
    );
    const b = await service.startVerification(
      f.receipt.request_id,
      f.identity,
      'didit',
    );
    expect(a.url).toBe(b.url);
    expect(adapter.startVerification).toHaveBeenCalledTimes(1);
    expect(await f.store.transaction((s) => Object.values(s.budgets))).toEqual([
      33,
    ]);
    expect(
      (await service.consentView(f.receipt.request_id, f.identity))
        .verificationUrl,
    ).toBe(a.url);
    await expect(
      service.consentView(f.receipt.request_id, owner('bob')),
    ).rejects.toThrow();
    const changedPolicy = new OnboardingService(
      { ...policy, version: '2' },
      f.store,
      [adapter],
    );
    await expect(
      changedPolicy.consentView(f.receipt.request_id, f.identity),
    ).rejects.toThrow();
    await f.store.transaction((state) => {
      state.requests[f.receipt.request_id].expiresAt = Date.now() - 1;
    });
    expect(
      await service.consentView(f.receipt.request_id, f.identity),
    ).not.toHaveProperty('verificationUrl');
  });
});

describe('access renewal and recovery', () => {
  it('finishes delayed identity review without granting expired access and reuses it on a fresh request', async () => {
    const f = await setup();
    await f.service.consent(f.receipt.request_id, f.identity, true);
    await f.service.importIdentity(
      f.ctx,
      f.receipt.request_id,
      'didit',
      'opaque',
    );
    await f.store.transaction((s) => {
      s.requests[f.receipt.request_id].expiresAt = Date.now() - 1;
    });
    expect((await f.service.reviews(staff)).map((r) => r.requestId)).toContain(
      f.receipt.request_id,
    );
    const reviewed = await f.service.review(staff, f.receipt.request_id, {
      decision: 'accept',
      identity_matches_owner: true,
      verified_at: new Date().toISOString(),
    });
    expect(reviewed.status).toBe('expired');
    expect(reviewed).not.toHaveProperty('grant_id');
    expect(await f.store.transaction((s) => Object.keys(s.grants))).toEqual([]);
    const fresh = await f.service.request(
      { ...f.ctx, idempotencyKey: randomUUID() },
      requestInput(),
    );
    expect(
      (await f.service.consent(fresh.request_id, f.identity, true)).status,
    ).toBe('granted');
    expect(f.adapter.importShared).toHaveBeenCalledTimes(1);
  });
  it('lets the owner cancel an expired pending review and rejects another owner', async () => {
    const f = await setup();
    await f.service.consent(f.receipt.request_id, f.identity, true);
    await f.store.transaction((s) => {
      s.requests[f.receipt.request_id].expiresAt = Date.now() - 1;
    });
    expect(
      (await f.service.ownerRequests(f.identity)).map((r) => r.id),
    ).toContain(f.receipt.request_id);
    await expect(
      f.service.cancelPending(f.receipt.request_id, owner('bob')),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(
      (await f.service.cancelPending(f.receipt.request_id, f.identity)).status,
    ).toBe('denied');
    expect(await f.service.ownerRequests(f.identity)).toEqual([]);
    expect(await f.service.reviews(staff)).toEqual([]);
    await expect(
      f.service.review(staff, f.receipt.request_id, {
        decision: 'accept',
        identity_matches_owner: true,
      }),
    ).rejects.toThrow('wallet_authorization_denied');
  });
  it('retains an in-flight import result without creating access after owner cancellation', async () => {
    const f = await setup();
    let finish!: () => void;
    let started!: () => void;
    const dispatchStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const responseReady = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.mocked(f.adapter.importShared).mockImplementation(async (_token, id) => {
      started();
      await responseReady;
      return f.evidence(id);
    });
    await f.service.consent(f.receipt.request_id, f.identity, true);
    const pending = f.service.importIdentity(
      f.ctx,
      f.receipt.request_id,
      'didit',
      'opaque',
    );
    await dispatchStarted;
    await f.service.cancelPending(f.receipt.request_id, f.identity);
    finish();
    expect((await pending).status).toBe('denied');
    expect(await f.store.transaction((s) => Object.keys(s.grants))).toEqual([]);
    expect(await f.service.reviews(staff)).toEqual([]);
  });
  it('cannot replace a stale vendor verification date with the time of import or review', async () => {
    const f = await setup();
    vi.mocked(f.adapter.read).mockImplementation(async (_ref, id) => ({
      ...f.evidence(id),
      verifiedAt: new Date(Date.now() - 366 * 86400000).toISOString(),
    }));
    await f.service.consent(f.receipt.request_id, f.identity, true);
    await f.service.importIdentity(
      f.ctx,
      f.receipt.request_id,
      'didit',
      'opaque',
    );
    await expect(
      f.service.review(staff, f.receipt.request_id, {
        decision: 'accept',
        identity_matches_owner: true,
        verified_at: new Date().toISOString(),
      }),
    ).rejects.toThrow('wallet_provider_input');
    await expect(
      f.service.review(staff, f.receipt.request_id, {
        decision: 'accept',
        identity_matches_owner: true,
      }),
    ).rejects.toThrow('wallet_authorization_denied');
  });
  it('supersedes the previous grant on renewal and expiry never renews access implicitly', async () => {
    const f = await setup();
    const first = await accept(f);
    const second = await f.service.request(
      { ...f.ctx, idempotencyKey: randomUUID() },
      {
        mode: 'connect',
        account_id: first.account_id,
        authorization_details: [
          { type: accessType, actions: ['account:read'] },
        ],
      },
    );
    const renewed = await f.service.consent(
      second.request_id,
      f.identity,
      true,
    );
    expect(renewed.grant_id).not.toBe(first.grant_id);
    expect(
      await f.store.transaction((s) => s.grants[first.grant_id!].state),
    ).toBe('revoked');
    await expect(
      f.service.authorize(
        f.ctx.principal,
        first.account_id!,
        'operations:request',
      ),
    ).rejects.toThrow();
    await f.store.transaction((s) => {
      s.grants[renewed.grant_id!].expiresAt = Date.now() - 1;
    });
    await expect(
      f.service.authorize(f.ctx.principal, first.account_id!, 'account:read'),
    ).rejects.toThrow();
    expect((await f.service.read(f.ctx, second.request_id)).status).toBe(
      'expired',
    );
  });
  it('provider suspension revokes every application grant and cannot be bypassed by owner login', async () => {
    const f = await setup();
    const granted = await accept(f);
    await f.service.suspendAccount(staff, granted.account_id!);
    await expect(
      f.service.authorize(f.ctx.principal, granted.account_id!, 'account:read'),
    ).rejects.toThrow();
    expect(
      await f.store.transaction((s) => s.grants[granted.grant_id!].state),
    ).toBe('revoked');
    const request = await f.service.request(
      { ...f.ctx, idempotencyKey: randomUUID() },
      requestInput(),
    );
    expect(
      (await f.service.consent(request.request_id, f.identity, true)).status,
    ).toBe('verification_required');
    await expect(
      f.service.suspendAccount({ ...staff, scopes: [] }, granted.account_id!),
    ).rejects.toThrow();
  });
  it('recovers lost wallet creation through read-only lookup and returns the original journal result', async () => {
    const f = await setup();
    const backend = {
      provider: 'offline',
      createAccount: vi.fn(async () => {
        throw new Error('lost response');
      }),
      findAccount: vi.fn(async (accountId: string) => ({
        accountId,
        address: '0x1111111111111111111111111111111111111111',
      })),
      signTypedData: vi.fn(),
    };
    const service = new OnboardingService(
      policy,
      f.store,
      [f.adapter],
      backend,
    );
    const granted = await accept({ ...f, service });
    const wrapped = createJournaledWalletProvider(backend, {
      namespace: 'test',
      journal: createOnboardingJournal(f.store),
      authorizeAttempt: (r) =>
        service.canDispatchProvision(r.attemptId, r.accountId),
    });
    const wallets = new EmbeddedWalletService(
      service.walletAuthority(),
      wrapped,
    );
    await expect(
      wallets.provision(f.ctx, granted.account_id!),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(await service.reconcileAccount(staff, granted.account_id!)).toEqual({
      status: 'reconciled',
    });
    expect((await wallets.provision(f.ctx, granted.account_id!)).address).toBe(
      '0x1111111111111111111111111111111111111111',
    );
    expect(backend.createAccount).toHaveBeenCalledTimes(1);
    expect(backend.findAccount).toHaveBeenCalledTimes(1);
  });
  it('holds a crash-interrupted identity dispatch and binds mutation keys across resources', async () => {
    const f = await setup();
    await f.service.consent(f.receipt.request_id, f.identity, true);
    await f.service.importIdentity(
      f.ctx,
      f.receipt.request_id,
      'didit',
      'opaque',
    );
    await f.store.transaction((s) => {
      const a = s.requests[f.receipt.request_id].importAttempt!;
      a.state = 'pending';
      a.startedAt = Date.now() - 31000;
      delete s.requests[f.receipt.request_id].evidence;
    });
    expect(
      (
        await f.service.importIdentity(
          f.ctx,
          f.receipt.request_id,
          'didit',
          'opaque',
        )
      ).status,
    ).toBe('reconciliation_required');
    expect(f.adapter.importShared).toHaveBeenCalledTimes(1);
    const other = await f.service.request(
      { ...f.ctx, idempotencyKey: randomUUID() },
      requestInput(),
    );
    await f.service.consent(other.request_id, owner('bob'), true);
    await expect(
      f.service.importIdentity(f.ctx, other.request_id, 'didit', 'opaque'),
    ).rejects.toThrow('wallet_attempt_conflict');
  });
  it('rejects invalid calendar dates and applies workflow changes to existing grants', async () => {
    const f = await setup();
    await f.service.consent(f.receipt.request_id, f.identity, true);
    await f.service.importIdentity(
      f.ctx,
      f.receipt.request_id,
      'didit',
      'opaque',
    );
    await expect(
      f.service.review(staff, f.receipt.request_id, {
        decision: 'accept',
        identity_matches_owner: true,
        verified_at: '2026-02-30T12:00:00Z',
      }),
    ).rejects.toThrow('wallet_authorization_denied');
    const granted = await f.service.review(staff, f.receipt.request_id, {
      decision: 'accept',
      identity_matches_owner: true,
      verified_at: new Date().toISOString(),
    });
    const revised = new OnboardingService(policy, f.store, [
      { ...f.adapter, policyFingerprint: 'changed-workflow' },
    ]);
    await expect(
      revised.authorize(f.ctx.principal, granted.account_id!, 'account:read'),
    ).rejects.toThrow();
  });
});

describe('private file reference store', () => {
  it('serializes independent store instances and rolls back a thrown transaction', async () => {
    const f = await setup();
    const other = createFileOnboardingStore(f.folder);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? f.store : other).transaction((s) => {
          s.budgets.test = (s.budgets.test ?? 0) + 1;
        }),
      ),
    );
    await expect(
      f.store.transaction((s) => {
        s.budgets.test = 999;
        throw new WalletProviderError('wallet_attempt_conflict');
      }),
    ).rejects.toThrow('wallet_attempt_conflict');
    expect(await other.transaction((s) => s.budgets.test)).toBe(20);
  });
  it('fails closed on corrupt state and permissive directory permissions', async () => {
    const f = await setup();
    await writeFile(join(f.folder, 'state.json'), 'invalid');
    await expect(f.store.transaction(() => true)).rejects.toThrow(
      'wallet_onboarding_unavailable',
    );
    await chmod(f.folder, 0o755);
    await expect(f.store.transaction(() => true)).rejects.toThrow(
      'wallet_onboarding_unavailable',
    );
    await chmod(f.folder, 0o700);
  });
  it('does not steal a crash-left lock or redispatch an expired wallet claim', async () => {
    const f = await setup();
    const granted = await accept(f);
    const authority = await f.service
      .walletAuthority()
      .provision(f.ctx, granted.account_id!);
    const journal = createOnboardingJournal(f.store);
    const attempt = {
      namespace: 'test',
      provider: 'offline',
      attemptId: authority!.attemptId,
      kind: 'provision' as const,
      accountId: granted.account_id!,
      resourceKey: fingerprint('resource'),
      requestHash: fingerprint('request'),
    };
    expect((await journal.claim(attempt)).state).toBe('dispatch');
    await f.store.transaction((s) => {
      Object.values(s.attempts)[0].expiresAt = Date.now() - 1;
    });
    expect(
      (
        await createOnboardingJournal(
          createFileOnboardingStore(f.folder),
        ).claim(attempt)
      ).state,
    ).toBe('unknown');
    await mkdir(join(f.folder, 'transaction.lock'));
    await expect(f.store.transaction(() => true)).rejects.toThrow(
      'wallet_onboarding_unavailable',
    );
  });
});
