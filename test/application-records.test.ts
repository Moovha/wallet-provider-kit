import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingService } from '../src/onboarding/service.js';
import { createFileOnboardingStore } from '../src/onboarding/file-store.js';
import { defineOnboardingPolicy } from '../src/onboarding/policy.js';
import type {
  AccessInput,
  ApplicationIdentityRecord,
  OnboardingPolicy,
  IdentityAdapter,
} from '../src/onboarding/types.js';
import {
  validateProviderConfiguration,
  type ProviderConfiguration,
} from '../src/deployment/config.js';
import { createServer } from '../src/service/server.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
import { createOnboardingJournal } from '../src/onboarding/journal.js';

const folders: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    folders
      .splice(0)
      .map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
const issuer = 'https://applications.example.test';
const policy: OnboardingPolicy = {
  version: '1',
  provider: {
    name: 'Offline evaluation',
    origin: 'https://wallet.example.test',
    privacyUrl: 'https://wallet.example.test/privacy',
  },
  applications: ['a', 'b'].map((clientId) => ({
    issuer,
    clientId,
    name: 'Application ' + clientId,
    permissions: ['account:read'],
  })),
  identity: {
    maxAgeDays: 7,
    records: { requiredFields: ['display_name', 'country'] },
  },
  access: { maxAgeDays: 1 },
};
const principal = {
  issuer,
  subject: 'application-worker',
  clientId: 'a',
  scopes: [
    'wallet:access',
    'wallet:access:read',
    'wallet:account:read',
    'wallet:provision',
  ],
};
const context = () => ({ principal, idempotencyKey: randomUUID() });
const owner = (subject = 'owner-a') => ({
  issuer: 'https://login.example.test',
  subject,
  authenticatedAt: Date.now(),
});
const reviewer = {
  issuer: 'https://login.example.test',
  subject: 'reviewer',
  clientId: 'staff',
  scopes: ['wallet:review'],
};
const record = (reference = 'test-record-a'): ApplicationIdentityRecord => ({
  reference,
  fields: { display_name: 'Fictional evaluation record', country: 'ZA' },
});
const input = (identity_record = record()): AccessInput => ({
  mode: 'create' as const,
  identity_record,
  authorization_details: [
    {
      type: 'https://moovha.com/wallet/account-access',
      actions: ['account:read'],
    },
  ],
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-application-records-'));
  folders.push(directory);
  const store = createFileOnboardingStore(directory);
  const service = new OnboardingService(policy, store);
  const createAccount = vi.fn(async (accountId: string) => ({
    accountId,
    address: '0x1111111111111111111111111111111111111111',
  }));
  const backend = createJournaledWalletProvider(
    {
      provider: 'offline-record-evaluation',
      createAccount,
      findAccount: async () => null,
      signTypedData: async () => {
        throw new Error('Unexpected signing');
      },
    },
    {
      namespace: 'offline-record-evaluation',
      journal: createOnboardingJournal(store),
      authorizeAttempt: (attempt) =>
        attempt.kind === 'provision'
          ? service.canDispatchProvision(attempt.attemptId, attempt.accountId)
          : Promise.resolve(false),
    },
  );
  return {
    directory,
    store,
    service,
    createAccount,
    wallets: new EmbeddedWalletService(service.walletAuthority(), backend),
  };
}

describe('application record evaluation', () => {
  it('resumes a batch after interruption between item commits', async () => {
    const f = await fixture();
    let transactions = 0;
    const interrupted = new OnboardingService(policy, {
      transaction: async (work) => {
        if (++transactions === 3) throw new Error('Offline interrupted batch');
        return f.store.transaction(work);
      },
    });
    const ctx = context();
    const records = [record('partial-a'), record('partial-b')];
    await expect(interrupted.submitRecords(ctx, records)).rejects.toThrow(
      'Offline interrupted batch',
    );
    const original = await f.store.transaction((state) =>
      Object.keys(state.requests),
    );
    expect(original).toHaveLength(1);
    const resumed = await new OnboardingService(
      policy,
      createFileOnboardingStore(f.directory),
    ).submitRecords(ctx, records);
    expect(resumed.results[0]).toMatchObject({
      status: 'submitted',
      receipt: { request_id: original[0] },
    });
    expect(
      await f.store.transaction((state) => Object.keys(state.requests)),
    ).toHaveLength(2);
    expect(f.createAccount).not.toHaveBeenCalled();
  });
  it('submits complete records, reports incomplete items and durably replays a concurrent batch', async () => {
    const f = await fixture();
    const ctx = context();
    const records = [
      record(),
      {
        reference: 'incomplete',
        fields: { display_name: 'Fictional incomplete record' },
      },
      record('test-record-b'),
    ];
    const [first, concurrent] = await Promise.all([
      f.service.submitRecords(ctx, records),
      new OnboardingService(
        policy,
        createFileOnboardingStore(f.directory),
      ).submitRecords(ctx, records),
    ]);
    expect(first.results.map((item) => item.status)).toEqual([
      'submitted',
      'invalid',
      'submitted',
    ]);
    expect(concurrent).toEqual(first);
    expect(
      await new OnboardingService(
        policy,
        createFileOnboardingStore(f.directory),
      ).submitRecords(ctx, records),
    ).toEqual(first);
    expect(first.results[1]).toEqual({
      index: 1,
      status: 'invalid',
      required_fields: ['country', 'display_name'],
    });
    expect(
      await f.store.transaction((state) => Object.keys(state.requests)),
    ).toHaveLength(2);
    expect(
      await f.store.transaction((state) => Object.keys(state.grants)),
    ).toHaveLength(0);
    expect(f.createAccount).not.toHaveBeenCalled();
    await expect(
      f.service.submitRecords(ctx, [record('changed-batch')]),
    ).rejects.toThrow('wallet_attempt_conflict');
  });

  it('requires owner consent and provider acceptance before provisioning and denies revoked replay', async () => {
    const f = await fixture();
    const receipt = await f.service.request(context(), input());
    expect(receipt.status).toBe('consent_required');
    await expect(
      f.service.review(reviewer, receipt.request_id, {
        decision: 'accept',
        identity_matches_owner: true,
      }),
    ).rejects.toThrow();
    const consent = await f.service.consent(receipt.request_id, owner(), true);
    expect(consent.status).toBe('provider_review_required');
    await expect(
      f.wallets.provision(context(), consent.account_id ?? randomUUID()),
    ).rejects.toThrow();
    expect(f.createAccount).not.toHaveBeenCalled();
    await expect(
      f.service.review(reviewer, receipt.request_id, {
        decision: 'accept',
        identity_matches_owner: false,
      }),
    ).rejects.toThrow();
    const grant = await f.service.review(reviewer, receipt.request_id, {
      decision: 'accept',
      identity_matches_owner: true,
    });
    expect(grant.status).toBe('granted');
    expect(await f.service.account(principal, grant.account_id!)).toMatchObject(
      {
        status: 'accepted',
        identity_source: 'application_record',
        evaluation_only: true,
      },
    );
    const provision = context();
    const original = await f.wallets.provision(provision, grant.account_id!);
    expect(await f.wallets.provision(provision, grant.account_id!)).toEqual(
      original,
    );
    expect(f.createAccount).toHaveBeenCalledTimes(1);
    await f.service.changeGrant(grant.grant_id!, 'revoked', owner());
    await expect(
      f.service.account(principal, grant.account_id!),
    ).rejects.toThrow();
    await expect(
      f.wallets.provision(provision, grant.account_id!),
    ).rejects.toThrow();
    expect(f.createAccount).toHaveBeenCalledTimes(1);
  });

  it('does not let admission, another caller or a reused record reference impersonate an owner', async () => {
    const f = await fixture();
    const request = await f.service.request(context(), input());
    await f.service.consent(request.request_id, owner(), true);
    await expect(
      f.service.consentView(request.request_id, owner('owner-b')),
    ).rejects.toThrow();
    await expect(
      f.service.read(
        { ...context(), principal: { ...principal, clientId: 'b' } },
        request.request_id,
      ),
    ).rejects.toThrow();
    const granted = await f.service.review(reviewer, request.request_id, {
      decision: 'accept',
      identity_matches_owner: true,
    });
    await expect(
      f.service.account({ ...principal, clientId: 'b' }, granted.account_id!),
    ).rejects.toThrow();
    const duplicate = await f.service.request(context(), input());
    await f.service.consent(duplicate.request_id, owner('owner-b'), true);
    await expect(
      f.service.review(reviewer, duplicate.request_id, {
        decision: 'accept',
        identity_matches_owner: true,
      }),
    ).rejects.toThrow();
    expect(f.createAccount).not.toHaveBeenCalled();
  });

  it.each<ApplicationIdentityRecord>([
    { reference: 'missing-fields', fields: { display_name: 'Fictional' } },
    { reference: 'blank-fields', fields: { display_name: ' ', country: 'ZA' } },
    {
      reference: 'oversized-fields',
      fields: { display_name: 'x'.repeat(513), country: 'ZA' },
    },
  ])(
    'rejects incomplete or invalid record values without an access request',
    async (value) => {
      const f = await fixture();
      await expect(f.service.request(context(), input(value))).rejects.toThrow(
        'wallet_provider_input',
      );
      expect(
        await f.store.transaction((state) => Object.keys(state.requests)),
      ).toHaveLength(0);
    },
  );

  it('retains only policy-required fields and never treats extra approval claims as authority', async () => {
    const f = await fixture();
    const submitted = {
      ...record(),
      fields: {
        ...record().fields,
        kyc_status: 'approved',
        reviewer_role: 'administrator',
      },
    };
    const receipt = await f.service.request(context(), input(submitted));
    expect(receipt.status).toBe('consent_required');
    expect(
      await f.store.transaction(
        (state) => state.requests[receipt.request_id].input.identity_record,
      ),
    ).toEqual(record());
    await f.service.consent(receipt.request_id, owner(), true);
    expect((await f.service.read(context(), receipt.request_id)).status).toBe(
      'provider_review_required',
    );
    expect(
      await f.store.transaction((state) => Object.keys(state.grants)),
    ).toHaveLength(0);
    expect(f.createAccount).not.toHaveBeenCalled();
  });

  it('keeps submitted records immutable and requires a new review after reconnection or policy change', async () => {
    const f = await fixture();
    const ctx = context();
    const receipt = await f.service.request(ctx, input());
    await expect(
      f.service.request(ctx, input(record('different-record'))),
    ).rejects.toThrow('wallet_attempt_conflict');
    await f.service.consent(receipt.request_id, owner(), true);
    const granted = await f.service.review(reviewer, receipt.request_id, {
      decision: 'accept',
      identity_matches_owner: true,
    });
    const renewal = await f.service.request(context(), {
      ...input(),
      mode: 'connect',
      account_id: granted.account_id!,
    });
    expect(
      (await f.service.consent(renewal.request_id, owner(), true)).status,
    ).toBe('provider_review_required');
    const changed = new OnboardingService({ ...policy, version: '2' }, f.store);
    await expect(
      changed.account(principal, granted.account_id!),
    ).rejects.toThrow();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 86400001);
    await expect(
      f.service.account(principal, granted.account_id!),
    ).rejects.toThrow();
  });

  it('cannot combine record evaluation with vendor approval, operational permissions or financial authority', async () => {
    const f = await fixture();
    expect(
      () => new OnboardingService(policy, f.store, [{} as IdentityAdapter]),
    ).toThrow('wallet_provider_configuration');
    expect(
      () =>
        new OnboardingService(
          policy,
          f.store,
          [],
          undefined,
          'financial-policy',
        ),
    ).toThrow('wallet_provider_configuration');
    expect(() =>
      defineOnboardingPolicy({
        ...policy,
        applications: [
          { ...policy.applications[0], permissions: ['operations:request'] },
        ],
      }),
    ).toThrow('wallet_provider_configuration');
    const template = JSON.parse(
      await readFile('docs/provider.config.safe.example.json', 'utf8'),
    ) as ProviderConfiguration;
    expect(validateProviderConfiguration(template).identity).toEqual({});
    expect(() =>
      validateProviderConfiguration({
        ...template,
        identity: {
          didit: {
            apiKey: { env: 'OFFLINE_FIXTURE' },
            workflowId: randomUUID(),
          },
        },
      }),
    ).toThrow();
  });

  it('serves required fields only to admitted callers and submits records through the supplied HTTP routes', async () => {
    const f = await fixture();
    let caller = principal;
    const app = await createServer({
      service: f.wallets,
      authenticate: async () => caller,
      ready: async () => true,
      onboarding: {
        service: f.service,
        reviewers: ['reviewer'],
        login: {
          start: async () => {
            throw new Error('Unexpected login');
          },
          finish: async () => {
            throw new Error('Unexpected callback');
          },
          session: async () => {
            throw new Error('Unexpected browser session');
          },
        },
      },
    });
    try {
      const discovered = await app.inject({
        method: 'GET',
        url: '/v1/access-policy',
      });
      expect(discovered.statusCode).toBe(200);
      expect(discovered.json()).toMatchObject({
        source: 'application_record',
        evaluation_only: true,
        required_fields: ['country', 'display_name'],
        provider_review_required: true,
        owner_consent_required: true,
      });
      const request = {
        method: 'POST' as const,
        url: '/v1/access-records',
        headers: { 'idempotency-key': randomUUID() },
        payload: {
          records: [
            record(),
            { reference: 'incomplete', fields: { display_name: 'Fictional' } },
          ],
        },
      };
      const response = await app.inject(request);
      expect(response.statusCode).toBe(200);
      expect(
        response.json().results.map((item: { status: string }) => item.status),
      ).toEqual(['submitted', 'invalid']);
      expect((await app.inject(request)).json()).toEqual(response.json());
      caller = { ...principal, clientId: 'not-admitted' };
      expect(
        (await app.inject({ method: 'GET', url: '/v1/access-policy' }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            ...request,
            headers: { 'idempotency-key': randomUUID() },
          })
        ).statusCode,
      ).toBe(403);
      expect(f.createAccount).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
