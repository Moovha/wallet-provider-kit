import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { Wallet, TypedDataEncoder, recoverAddress } from 'ethers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openProviderDatabase,
  type ProviderDatabase,
  type FinancialApproval,
  type FinancialAuthorization,
} from '../src/storage/index.js';
import type { AuthorityContext } from '../src/domain/principal.js';
import type {
  TypedDataAction,
  WalletSigningProvider,
} from '../src/domain/signing.js';
import type { WalletAttemptRequest } from '../src/domain/attempt-journal.js';
import type { EnrollmentChallenge } from '../src/domain/enrollment.js';
import type { VerifiedIdentity } from '../src/identity/oidc.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { OnboardingService } from '../src/onboarding/service.js';
import { createOnboardingJournal } from '../src/onboarding/journal.js';
import { accessType } from '../src/onboarding/types.js';
import { AuthenticationError } from '../src/service/auth.js';

const directories: string[] = [];
const databases: ProviderDatabase[] = [];
const exec = promisify(execFile);
const moduleUrl = new URL('../src/storage/index.ts', import.meta.url).href;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const database of databases.splice(0)) database.close();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function folder() {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-sqlite-'));
  directories.push(directory);
  return directory;
}
function open(directory: string, initialize = false) {
  const db = openProviderDatabase({ directory, initialize });
  databases.push(db);
  return db;
}
async function fixture() {
  const directory = await folder();
  const db = open(directory, true);
  const wallet = Wallet.createRandom();
  const account = { accountId: randomUUID(), address: wallet.address };
  const payload = {
    domain: { name: 'Offline SQLite proof', chainId: '84532' },
    types: { SafeCallIntent: [{ name: 'challenge', type: 'string' }] },
    primaryType: 'SafeCallIntent',
    message: { challenge: 'unfunded' },
  };
  const action: TypedDataAction = {
    action_id: randomUUID(),
    operation_id: randomUUID(),
    chain_id: 'eip155:84532',
    chain_account_id: `eip155:84532:${wallet.address}`,
    kind: 'sign_typed_data',
    profile: 'safe_owner_v1',
    profile_revision: '1',
    status: 'ready',
    binding_revision: '1',
    capability_revision: '1',
    plan_revision: '1',
    plan_hash: '0x' + '1'.repeat(64),
    dependencies: [],
    expires_at: new Date(Date.now() + 120000).toISOString(),
    payload,
    payload_hash: TypedDataEncoder.hash(
      payload.domain,
      payload.types,
      payload.message,
    ),
  };
  const context: AuthorityContext = {
    principal: {
      issuer: 'https://apps.example.test',
      subject: 'app-service',
      clientId: 'application',
      scopes: ['wallet:sign'],
    },
    idempotencyKey: randomUUID(),
  };
  const approval: FinancialApproval = {
    ownerSubject: 'verified-owner',
    caller: {
      issuer: context.principal.issuer,
      subject: context.principal.subject,
      clientId: context.principal.clientId,
    },
    grantId: randomUUID(),
    consentReference: 'exact-action-consent',
    policyRevision: 'policy-1',
    account,
    action,
    budgetId: 'owner-limit',
    units: '1',
  };
  const current: FinancialAuthorization = {
    ownerSubject: approval.ownerSubject,
    accountId: account.accountId,
    address: account.address,
    chainAccountId: action.chain_account_id,
    currentUserStatus: 'ID VERIFIED',
    grantId: approval.grantId,
    consentReference: approval.consentReference,
    policyRevision: approval.policyRevision,
    bindingRevision: '1',
    capabilityRevision: '1',
    planRevision: '1',
    planHash: action.plan_hash,
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  };
  const authorize = vi.fn(async () => structuredClone(current));
  const provider: WalletSigningProvider = {
    provider: 'offline',
    createAccount: vi.fn(async () => account),
    findAccount: vi.fn(async () => account),
    signTypedData: vi.fn(async (_account, value) =>
      wallet.signTypedData(
        value.payload.domain,
        value.payload.types,
        value.payload.message,
      ),
    ),
  };
  await db.setBudget(approval.budgetId, '2');
  await db.approveAction(approval);
  const options = {
    namespace: 'sqlite-test',
    provider: provider.provider,
    authorize,
  };
  const financial = db.financialAuthority(options);
  const service = new EmbeddedWalletService(
    financial.authority,
    createJournaledWalletProvider(provider, {
      namespace: options.namespace,
      journal: financial.journal,
      authorizeAttempt: financial.authorizeAttempt,
    }),
  );
  return {
    directory,
    db,
    wallet,
    account,
    action,
    approval,
    current,
    context,
    authorize,
    provider,
    options,
    financial,
    service,
  };
}

function request(kind: WalletAttemptRequest['kind'] = 'provision') {
  const accountId = randomUUID();
  return createWalletAttemptRequest(
    'sqlite-journal',
    'offline',
    kind,
    accountId,
    randomUUID(),
    accountId,
    { accountId },
  );
}

describe('toolkit-owned SQLite storage', () => {
  it('requires explicit initialization, verifies the catalog and fails closed for unsupported files', async () => {
    const directory = await folder();
    expect(() => open(directory)).toThrow('wallet_provider_configuration');
    const db = open(directory, true);
    expect(await db.ready()).toBe(true);
    const inspect = new DatabaseSync(join(directory, 'provider.sqlite'), {
      readOnly: true,
    });
    expect(inspect.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(
      inspect
        .prepare('PRAGMA table_info(attempts)')
        .all()
        .map((row) => row.name),
    ).toContain('lease_token');
    expect(
      inspect
        .prepare('PRAGMA index_list(admissions)')
        .all()
        .filter((row) => row.unique === 1),
    ).toHaveLength(2);
    expect(
      inspect
        .prepare("SELECT name FROM sqlite_schema WHERE type='trigger'")
        .all(),
    ).toEqual([]);
    inspect.close();
    db.close();
    expect(await db.ready()).toBe(false);
    await chmod(join(directory, 'provider.sqlite'), 0o644);
    expect(() => open(directory)).toThrow('wallet_provider_configuration');
    await chmod(join(directory, 'provider.sqlite'), 0o600);
    const unknown = new DatabaseSync(join(directory, 'provider.sqlite'));
    unknown.exec('PRAGMA user_version=999');
    unknown.close();
    expect(() => open(directory, true)).toThrow(
      'wallet_provider_configuration',
    );
  });

  it('rejects symlink directories and schema drift without adopting or upgrading them', async () => {
    const directory = await folder();
    const link = join(await folder(), 'linked');
    await symlink(directory, link);
    expect(() => open(link, true)).toThrow('wallet_provider_configuration');
    const db = open(directory, true);
    db.close();
    const changed = new DatabaseSync(join(directory, 'provider.sqlite'));
    changed.exec('DROP INDEX attempts_state');
    changed.close();
    expect(() => open(directory, true)).toThrow(
      'wallet_provider_configuration',
    );
  });

  it('rolls back exceptions and rejects async callbacks and audit-history changes', async () => {
    const db = open(await folder(), true);
    await db.onboardingStore.transaction((state) => {
      state.budgets.example = 1;
      state.audit.push({
        at: 1,
        event: 'test',
        resource: 'offline',
        revision: '1',
      });
    });
    await expect(
      db.onboardingStore.transaction((state) => {
        state.budgets.example = 2;
        throw new Error('private detail');
      }),
    ).rejects.toThrow('wallet_attempt_unavailable');
    await expect(
      db.onboardingStore.transaction(async (state) => {
        state.budgets.example = 3;
      }),
    ).rejects.toThrow('wallet_attempt_unavailable');
    await expect(
      db.onboardingStore.transaction((state) => {
        state.audit.length = 0;
      }),
    ).rejects.toThrow('wallet_attempt_unavailable');
    expect(
      await db.onboardingStore.transaction((state) => state.budgets.example),
    ).toBe(1);
    const denied = new AuthenticationError(403);
    await expect(
      db.onboardingStore.transaction(() => {
        throw denied;
      }),
    ).rejects.toBe(denied);
    await expect(
      db.onboardingStore.transaction((state) => {
        Object.assign(state, { unsupportedCollection: {} });
      }),
    ).rejects.toThrow('wallet_attempt_unavailable');
  });

  it('runs consent, KYC review, wallet provisioning and revocation on SQLite across restart', async () => {
    const directory = await folder();
    const db = open(directory, true);
    const policy = {
      version: '1',
      provider: {
        name: 'Offline',
        origin: 'https://wallet.example.test',
        privacyUrl: 'https://wallet.example.test/privacy',
      },
      applications: [
        {
          issuer: 'https://apps.example.test',
          clientId: 'application',
          name: 'Application',
          funding: { agreement: 'fixture', monthlyLimitMinor: 10 },
        },
      ],
    };
    const owner = {
      issuer: 'https://owner.example.test',
      subject: 'owner',
      authenticatedAt: Date.now(),
    };
    const ctx = {
      principal: {
        issuer: policy.applications[0].issuer,
        subject: 'app-service',
        clientId: 'application',
        scopes: ['wallet:access', 'wallet:access:read', 'wallet:provision'],
      },
      idempotencyKey: randomUUID(),
    };
    const vendor = {
      vendor: 'didit' as const,
      price: { maximumMinor: 1, termsReference: 'fixture' },
      importShared: vi.fn(async (_token: string, correlation: string) => ({
        vendor: 'didit' as const,
        reference: 'opaque-vendor-reference',
        correlation,
        status: 'approved' as const,
        fetchedAt: new Date().toISOString(),
      })),
      read: vi.fn(async (_reference: string, correlation: string) => ({
        vendor: 'didit' as const,
        reference: 'opaque-vendor-reference',
        correlation,
        status: 'approved' as const,
        fetchedAt: new Date().toISOString(),
      })),
    };
    const service = new OnboardingService(policy, db.onboardingStore, [vendor]);
    const receipt = await service.request(ctx, {
      mode: 'create',
      authorization_details: [
        { type: accessType, actions: ['account:read', 'operations:request'] },
      ],
    });
    await service.consent(receipt.request_id, owner, true);
    await service.importIdentity(
      ctx,
      receipt.request_id,
      'didit',
      'not-persisted-share-token',
    );
    const accepted = await service.review(
      {
        issuer: 'https://owner.example.test',
        subject: 'reviewer',
        clientId: 'review',
        scopes: ['wallet:review'],
      },
      receipt.request_id,
      {
        decision: 'accept',
        identity_matches_owner: true,
        verified_at: new Date(Date.now() - 1000).toISOString(),
      },
    );
    const accountId = accepted.account_id!;
    const backend: WalletSigningProvider = {
      provider: 'offline',
      createAccount: vi.fn(async (id) => ({
        accountId: id,
        address: Wallet.createRandom().address,
      })),
      findAccount: vi.fn(async () => null),
      signTypedData: vi.fn(),
    };
    const wallets = new EmbeddedWalletService(
      service.walletAuthority(),
      createJournaledWalletProvider(backend, {
        namespace: 'sqlite-onboarding',
        journal: createOnboardingJournal(db.onboardingStore),
        authorizeAttempt: (r) =>
          service.canDispatchProvision(r.attemptId, r.accountId),
      }),
    );
    const account = await wallets.provision(ctx, accountId);
    db.close();
    const restarted = new OnboardingService(
      policy,
      open(directory).onboardingStore,
      [vendor],
    );
    expect((await restarted.account(ctx.principal, accountId)).address).toBe(
      account.address,
    );
    await restarted.changeGrant(accepted.grant_id!, 'revoked', owner);
    await expect(restarted.account(ctx.principal, accountId)).rejects.toThrow(
      'wallet_authorization_denied',
    );
    expect(backend.createAccount).toHaveBeenCalledTimes(1);
  });
});

describe('SQLite financial approvals and journals', () => {
  it.each([
    ['ownerSubject', 'another-owner'],
    ['accountId', randomUUID()],
    ['address', Wallet.createRandom().address],
    ['chainAccountId', 'eip155:1:0x0000000000000000000000000000000000000001'],
    ['currentUserStatus', 'INCOMPLETE'],
    ['grantId', randomUUID()],
    ['consentReference', 'different-consent'],
    ['policyRevision', 'changed'],
    ['bindingRevision', '2'],
    ['capabilityRevision', '2'],
    ['planRevision', '2'],
    ['planHash', '0x' + '2'.repeat(64)],
    ['expiresAt', new Date(0).toISOString()],
  ])(
    'denies changed current %s before a financial effect',
    async (field, value) => {
      const f = await fixture();
      Object.assign(f.current, { [field]: value });
      await expect(
        f.service.sign(f.context, f.action.action_id),
      ).rejects.toThrow('wallet_authorization_denied');
      expect(f.provider.signTypedData).not.toHaveBeenCalled();
      expect(await f.db.budget(f.approval.budgetId)).toEqual({
        maximum: '2',
        reserved: '0',
      });
    },
  );

  it('denies policy-store errors and missing signing scope before admission', async () => {
    const f = await fixture();
    f.authorize.mockRejectedValueOnce(new Error('private policy error'));
    await expect(f.service.sign(f.context, f.action.action_id)).rejects.toThrow(
      'wallet_attempt_unavailable',
    );
    await expect(
      f.service.sign(
        { ...f.context, principal: { ...f.context.principal, scopes: [] } },
        f.action.action_id,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(f.provider.signTypedData).not.toHaveBeenCalled();
  });

  it('signs once and replays the persisted signature after restart with a stable attempt and reservation', async () => {
    const f = await fixture();
    const signature = await f.service.sign(f.context, f.action.action_id);
    expect(recoverAddress(f.action.payload_hash, signature)).toBe(
      f.wallet.address,
    );
    f.db.close();
    const db = open(f.directory);
    const financial = db.financialAuthority(f.options);
    const service = new EmbeddedWalletService(
      financial.authority,
      createJournaledWalletProvider(f.provider, {
        namespace: f.options.namespace,
        journal: financial.journal,
        authorizeAttempt: financial.authorizeAttempt,
      }),
    );
    expect(
      await service.sign(
        { ...f.context, idempotencyKey: randomUUID() },
        f.action.action_id,
      ),
    ).toBe(signature);
    expect(f.provider.signTypedData).toHaveBeenCalledTimes(1);
    expect(await db.budget(f.approval.budgetId)).toEqual({
      maximum: '2',
      reserved: '1',
    });
  });

  it('rejects changed approvals, idempotency reuse, other clients, stale policy and revoked success replay', async () => {
    const f = await fixture();
    await expect(
      f.db.approveAction({ ...f.approval, units: '2' }),
    ).rejects.toThrow('wallet_attempt_conflict');
    await expect(
      f.service.sign(
        {
          ...f.context,
          principal: { ...f.context.principal, clientId: 'another-app' },
        },
        f.action.action_id,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
    f.current.policyRevision = 'changed';
    await expect(f.service.sign(f.context, f.action.action_id)).rejects.toThrow(
      'wallet_authorization_denied',
    );
    f.current.policyRevision = f.approval.policyRevision;
    await f.service.sign(f.context, f.action.action_id);
    const second = structuredClone(f.approval);
    if (second.action.kind !== 'sign_typed_data') throw new Error();
    second.action.action_id = randomUUID();
    await f.db.approveAction(second);
    await expect(
      f.service.sign(f.context, second.action.action_id),
    ).rejects.toThrow('wallet_attempt_conflict');
    await f.db.revokeAction(f.action.action_id);
    await expect(f.service.sign(f.context, f.action.action_id)).rejects.toThrow(
      'wallet_authorization_denied',
    );
    expect(f.provider.signTypedData).toHaveBeenCalledTimes(1);
  });

  it('rechecks current permission after claiming dispatch and does not call the backend after revocation', async () => {
    const f = await fixture();
    const claim = f.financial.journal.claim;
    f.financial.journal.claim = async (r) => {
      const result = await claim(r);
      await f.db.revokeAction(f.action.action_id);
      return result;
    };
    await expect(f.service.sign(f.context, f.action.action_id)).rejects.toThrow(
      'wallet_authorization_denied',
    );
    expect(f.provider.signTypedData).not.toHaveBeenCalled();
    expect(await f.db.budget(f.approval.budgetId)).toEqual({
      maximum: '2',
      reserved: '1',
    });
  });

  it('allows one dispatch across two independent processes and keeps exact large integer reservations', async () => {
    const directory = await folder();
    const db = open(directory, true);
    const value = request();
    const large = '900719925474099312345';
    await db.setBudget('shared', large);
    await db.admitAttempt({ request: value, budgetId: 'shared', units: large });
    const code = `import {openProviderDatabase} from ${JSON.stringify(moduleUrl)}; const db=openProviderDatabase({directory:${JSON.stringify(directory)}}); console.log(JSON.stringify(await db.journal.claim(${JSON.stringify(value)}))); db.close();`;
    const results = await Promise.all(
      [1, 2].map(() =>
        exec(
          process.execPath,
          ['--import', 'tsx', '--input-type=module', '-e', code],
          { cwd: process.cwd() },
        ),
      ),
    );
    expect(results.map((r) => JSON.parse(r.stdout).state).sort()).toEqual([
      'dispatch',
      'pending',
    ]);
    expect(await db.budget('shared')).toEqual({
      maximum: large,
      reserved: large,
    });
    const second = request();
    await db.admitAttempt({ request: second, budgetId: 'shared', units: '1' });
    await expect(db.journal.claim(second)).rejects.toThrow(
      'wallet_authorization_denied',
    );
    await expect(
      db.admitAttempt({
        request: { ...value, attemptId: randomUUID() },
        budgetId: 'shared',
        units: large,
      }),
    ).rejects.toThrow('wallet_attempt_conflict');
  });

  it('preserves unknown effects after restart, fences expired/wrong leases and reconciles only with verified evidence', async () => {
    const directory = await folder();
    let db = open(directory, true);
    const value = request();
    await db.setBudget('shared', '1');
    await db.admitAttempt({ request: value, budgetId: 'shared', units: '1' });
    const claim = await db.journal.claim(value);
    if (claim.state !== 'dispatch') throw new Error();
    const result = {
      kind: 'provision' as const,
      account: {
        accountId: value.accountId,
        address: Wallet.createRandom().address,
      },
    };
    await expect(
      db.journal.complete(value, randomUUID(), result),
    ).rejects.toThrow('wallet_attempt_unavailable');
    db.close();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(claim.leaseExpiresAt) + 1);
    db = open(directory);
    const inspect = new DatabaseSync(join(directory, 'provider.sqlite'), {
      readOnly: true,
    });
    const before = inspect.prepare('SELECT * FROM attempts').all();
    expect((await db.journal.read(value))?.state).toBe('unknown');
    expect(inspect.prepare('SELECT * FROM attempts').all()).toEqual(before);
    inspect.close();
    expect((await db.journal.claim(value)).state).toBe('unknown');
    await expect(
      db.journal.complete(value, claim.leaseToken, result),
    ).rejects.toThrow('wallet_attempt_unavailable');
    await expect(
      db.reconcileAttempt(
        value,
        result,
        'read-only-receipt',
        async () => false,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
    await db.reconcileAttempt(
      value,
      result,
      'read-only-receipt',
      async () => true,
    );
    expect((await db.journal.read(value))?.state).toBe('succeeded');
    await expect(
      db.reconcileAttempt(value, result, 'read-only-receipt', async () => true),
    ).rejects.toThrow('wallet_attempt_unavailable');
    expect(await db.budget('shared')).toEqual({ maximum: '1', reserved: '1' });
  });

  it('recovers a process crash with an open WAL and never reclaims its committed dispatch', async () => {
    const directory = await folder();
    const db = open(directory, true);
    const value = request();
    await db.setBudget('crash-limit', '1');
    await db.admitAttempt({
      request: value,
      budgetId: 'crash-limit',
      units: '1',
    });
    db.close();
    const code = `import {openProviderDatabase} from ${JSON.stringify(moduleUrl)}; const db=openProviderDatabase({directory:${JSON.stringify(directory)}}); const claim=await db.journal.claim(${JSON.stringify(value)}); console.log(JSON.stringify(claim)); process.exit(23);`;
    const result = await exec(process.execPath, [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      code,
    ]).then(
      () => {
        throw new Error('Expected abrupt exit');
      },
      (error: { code: number; stdout: string }) => error,
    );
    expect(result.code).toBe(23);
    const claim = JSON.parse(result.stdout);
    expect(claim.state).toBe('dispatch');
    db.close();
    const restarted = open(directory);
    expect((await restarted.journal.claim(value)).state).toBe('pending');
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(claim.leaseExpiresAt) + 1);
    expect((await restarted.journal.claim(value)).state).toBe('unknown');
    expect(await restarted.budget('crash-limit')).toEqual({
      maximum: '1',
      reserved: '1',
    });
  });

  it('does not commit a corrupt signature or its success audit event', async () => {
    const f = await fixture();
    const admitted = await f.financial.authority.sign(
      f.context,
      f.action.action_id,
    );
    if (!admitted) throw new Error();
    const value = createWalletAttemptRequest(
      f.options.namespace,
      f.provider.provider,
      'sign_typed_data',
      f.account.accountId,
      admitted.attemptId,
      f.action.action_id,
      {
        account: {
          accountId: f.account.accountId,
          address: f.account.address.toLowerCase(),
        },
        action: f.action,
      },
    );
    const claim = await f.db.journal.claim(value);
    if (claim.state !== 'dispatch') throw new Error();
    const inspect = new DatabaseSync(join(f.directory, 'provider.sqlite'), {
      readOnly: true,
    });
    const before = inspect.prepare('SELECT * FROM financial_audit').all();
    const wrong = Wallet.createRandom().signingKey.sign(
      f.action.payload_hash,
    ).serialized;
    await expect(
      f.db.journal.complete(value, claim.leaseToken, {
        kind: 'sign_typed_data',
        signature: wrong,
      }),
    ).rejects.toThrow('wallet_attempt_unavailable');
    expect(inspect.prepare('SELECT * FROM financial_audit').all()).toEqual(
      before,
    );
    expect((await f.db.journal.read(value))?.state).toBe('pending');
    inspect.close();
  });

  it('fails closed on database contention without consuming a dispatch or a reservation', async () => {
    const directory = await folder();
    const db = open(directory, true);
    const value = request();
    await db.setBudget('lock-limit', '1');
    await db.admitAttempt({
      request: value,
      budgetId: 'lock-limit',
      units: '1',
    });
    const lock = new DatabaseSync(join(directory, 'provider.sqlite'));
    lock.exec('BEGIN IMMEDIATE');
    try {
      await expect(db.journal.claim(value)).rejects.toThrow(
        'wallet_attempt_unavailable',
      );
    } finally {
      lock.exec('ROLLBACK');
      lock.close();
    }
    expect(await db.budget('lock-limit')).toEqual({
      maximum: '1',
      reserved: '0',
    });
    expect(await db.journal.read(value)).toBeNull();
    expect((await db.journal.claim(value)).state).toBe('dispatch');
  });

  it('recovers a committed result after a lost completion response without repeating signing', async () => {
    const f = await fixture();
    const complete = f.financial.journal.complete;
    f.financial.journal.complete = async (...args) => {
      await complete(...args);
      throw new Error('lost response');
    };
    await expect(f.service.sign(f.context, f.action.action_id)).rejects.toThrow(
      'wallet_attempt_unavailable',
    );
    expect(await f.service.sign(f.context, f.action.action_id)).toMatch(/^0x/);
    expect(f.provider.signTypedData).toHaveBeenCalledTimes(1);
  });

  it('keeps a crash before dispatch completion pending and never redispatches signing', async () => {
    const f = await fixture();
    f.provider.signTypedData = vi.fn(async () => {
      throw new Error('provider response lost');
    });
    const service = new EmbeddedWalletService(
      f.financial.authority,
      createJournaledWalletProvider(f.provider, {
        namespace: f.options.namespace,
        journal: f.financial.journal,
        authorizeAttempt: f.financial.authorizeAttempt,
      }),
    );
    await expect(
      service.sign(f.context, f.action.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    f.db.close();
    const financial = open(f.directory).financialAuthority(f.options);
    const restarted = new EmbeddedWalletService(
      financial.authority,
      createJournaledWalletProvider(f.provider, {
        namespace: f.options.namespace,
        journal: financial.journal,
        authorizeAttempt: financial.authorizeAttempt,
      }),
    );
    await expect(
      restarted.sign(f.context, f.action.action_id),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(f.provider.signTypedData).toHaveBeenCalledTimes(1);
  });

  it('restores a SQLite online backup with the same approval, signature and reservation', async () => {
    const f = await fixture();
    const signature = await f.service.sign(f.context, f.action.action_id);
    const destination = await folder();
    const source = new DatabaseSync(join(f.directory, 'provider.sqlite'), {
      readOnly: true,
    });
    await backup(source, join(destination, 'provider.sqlite'));
    source.close();
    await chmod(join(destination, 'provider.sqlite'), 0o600);
    f.db.close();
    const restored = open(destination);
    const financial = restored.financialAuthority(f.options);
    const service = new EmbeddedWalletService(
      financial.authority,
      createJournaledWalletProvider(f.provider, {
        namespace: f.options.namespace,
        journal: financial.journal,
        authorizeAttempt: financial.authorizeAttempt,
      }),
    );
    expect(await service.sign(f.context, f.action.action_id)).toBe(signature);
    expect(f.provider.signTypedData).toHaveBeenCalledTimes(1);
  });
});

describe('SQLite optional enrollment and execution profiles', () => {
  it('stores enrollment references, isolates clients, consumes nonces and preserves revocation', async () => {
    const db = open(await folder(), true);
    const context: AuthorityContext = {
      principal: {
        issuer: 'https://apps.example.test',
        subject: 'app',
        clientId: 'application',
        scopes: [],
      },
      idempotencyKey: randomUUID(),
    };
    const proposal: EnrollmentChallenge = {
      enrollmentId: randomUUID(),
      accountId: randomUUID(),
      nonce: randomUUID(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      caller: context.principal,
      identityIssuer: 'https://owner.example.test',
      identityClientId: 'login',
      identitySubject: 'owner',
    };
    const identity: VerifiedIdentity = {
      issuer: proposal.identityIssuer,
      subject: proposal.identitySubject,
      proofHash: 'a'.repeat(64),
      verifiedAt: new Date().toISOString(),
      authenticatedAt: new Date().toISOString(),
      verifiedClaims: {
        verification: {
          trust_framework: 'offline',
          time: new Date().toISOString(),
          verification_process: 'offline',
        },
        claims: { name: 'must-not-persist' },
      },
    };
    const options = {
      authorize: vi.fn(async () => true),
      decide: vi.fn(async () => ({
        status: 'accepted' as const,
        decision: {
          proofHash: identity.proofHash,
          identityIssuer: identity.issuer,
          identitySubject: identity.subject,
          verifiedAt: identity.verifiedAt,
          policyRevision: '1',
          ownerSubject: 'owner-key',
          consentReference: 'provider-consent',
          acceptanceExpiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      })),
    };
    const authority = db.enrollmentAuthority(options);
    expect(await authority.begin(context, proposal)).toMatchObject({
      status: 'awaiting_identity',
    });
    expect(
      (
        await authority.begin(context, {
          ...proposal,
          enrollmentId: randomUUID(),
          accountId: randomUUID(),
          nonce: randomUUID(),
        })
      )?.enrollmentId,
    ).toBe(proposal.enrollmentId);
    const submit = { ...context, idempotencyKey: randomUUID() };
    const accepted = await authority.decide(submit, proposal, identity);
    expect(accepted.status).toBe('accepted');
    expect(await authority.decide(submit, proposal, identity)).toEqual(
      accepted,
    );
    expect(options.decide).toHaveBeenCalledTimes(1);
    await expect(
      authority.decide(submit, proposal, {
        ...identity,
        proofHash: 'b'.repeat(64),
      }),
    ).rejects.toThrow('wallet_attempt_conflict');
    expect(await authority.forAccount(context, proposal.accountId)).toEqual(
      accepted,
    );
    expect(
      await authority.load(
        {
          ...context,
          principal: { ...context.principal, clientId: 'another' },
        },
        proposal.enrollmentId,
      ),
    ).toBeNull();
    await db.revokeEnrollment(proposal.enrollmentId);
    expect(await authority.forAccount(context, proposal.accountId)).toBeNull();
    const bytes = await readFile(
      join(directories.at(-1)!, 'provider.sqlite-wal'),
    );
    expect(bytes.includes(Buffer.from('must-not-persist'))).toBe(false);
  });
});

describe('additional asset budgets at the financial dispatch boundary', () => {
  async function additional(
    f: Awaited<ReturnType<typeof fixture>>,
    amount: string,
    operationId = randomUUID(),
    maximum = '9',
  ) {
    const action = {
      ...f.action,
      action_id: randomUUID(),
      operation_id: operationId,
    };
    const approval = {
      ...f.approval,
      action,
      additionalBudgets: [
        { budgetId: 'shared-token-allowance', units: amount, maximum },
      ],
    };
    await f.db.approveAction(approval);
    return approval;
  }
  it('combines old allowance usage and generic asset usage and rolls back the operation charge on denial', async () => {
    const f = await fixture();
    await f.db.setBudget('shared-token-allowance', '9');
    const old = {
      ...f.approval,
      action: { ...f.action, action_id: randomUUID() },
      budgetId: 'shared-token-allowance',
      units: '5',
    };
    await f.db.approveAction(old);
    await f.service.sign(
      { ...f.context, idempotencyKey: randomUUID() },
      old.action.action_id,
    );
    const generic = await additional(f, '4');
    await f.service.sign(
      { ...f.context, idempotencyKey: randomUUID() },
      generic.action.action_id,
    );
    const denied = await additional(f, '1');
    await expect(
      f.service.sign(
        { ...f.context, idempotencyKey: randomUUID() },
        denied.action.action_id,
      ),
    ).rejects.toThrow('wallet_attempt_unavailable');
    expect(await f.db.budget('shared-token-allowance')).toEqual({
      maximum: '9',
      reserved: '9',
    });
    expect(await f.db.budget(f.approval.budgetId)).toEqual({
      maximum: '2',
      reserved: '1',
    });
    expect(f.provider.signTypedData).toHaveBeenCalledTimes(2);
  });
  it('charges the asset once for the same operation across signer namespaces, including uncertain signing', async () => {
    const f = await fixture();
    await f.db.setBudget('shared-token-allowance', '9');
    const generic = await additional(f, '4');
    f.provider.signTypedData = vi.fn(async () => {
      throw new Error('Offline response loss');
    });
    await expect(
      f.service.sign(
        { ...f.context, idempotencyKey: randomUUID() },
        generic.action.action_id,
      ),
    ).rejects.toThrow();
    const other = f.db.financialAuthority({
      ...f.options,
      namespace: 'other-signer',
    });
    const service = new EmbeddedWalletService(
      other.authority,
      createJournaledWalletProvider(f.provider, {
        namespace: 'other-signer',
        journal: other.journal,
        authorizeAttempt: other.authorizeAttempt,
      }),
    );
    await expect(
      service.sign(f.context, generic.action.action_id),
    ).rejects.toThrow();
    expect(await f.db.budget('shared-token-allowance')).toEqual({
      maximum: '9',
      reserved: '4',
    });
  });
  it('honors a narrower approval ceiling without raising the existing allowance', async () => {
    const f = await fixture();
    await f.db.setBudget('shared-token-allowance', '9');
    const one = await additional(f, '4', undefined, '5');
    await f.service.sign(
      { ...f.context, idempotencyKey: randomUUID() },
      one.action.action_id,
    );
    const two = await additional(f, '2', undefined, '5');
    await expect(
      f.service.sign(
        { ...f.context, idempotencyKey: randomUUID() },
        two.action.action_id,
      ),
    ).rejects.toThrow('wallet_attempt_unavailable');
    expect(await f.db.budget('shared-token-allowance')).toEqual({
      maximum: '9',
      reserved: '4',
    });
  });
  it('rejects duplicate, primary and missing asset budgets before approval', async () => {
    const f = await fixture();
    for (const charges of [
      [{ budgetId: f.approval.budgetId, units: '1', maximum: '2' }],
      [{ budgetId: 'missing', units: '1', maximum: '2' }],
      [
        { budgetId: 'a', units: '1', maximum: '2' },
        { budgetId: 'a', units: '1', maximum: '2' },
      ],
    ])
      await expect(
        f.db.approveAction({
          ...f.approval,
          action: { ...f.action, action_id: randomUUID() },
          additionalBudgets: charges,
        }),
      ).rejects.toThrow();
    expect(f.provider.signTypedData).not.toHaveBeenCalled();
  });
});
