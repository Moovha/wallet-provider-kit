import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Permission, ProviderState } from '../src/onboarding/types.js';
import * as financialStorage from '../src/storage/financial.js';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  Wallet,
  TypedDataEncoder,
  recoverAddress,
  keccak256,
  concat,
} from 'ethers';
import { generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportedActions } from '../src/deployment/actions.js';
import { createConfiguredProvider } from '../src/deployment/provider.js';
import {
  validateProviderConfiguration,
  type ProviderConfiguration,
} from '../src/deployment/config.js';
import { openProviderDatabase } from '../src/storage/index.js';
import { AuthenticationError } from '../src/service/auth.js';
import type { OwnerLogin } from '../src/onboarding/login.js';
import type { WalletSigningProvider } from '../src/domain/signing.js';
import type { JWTVerifyGetKey } from 'jose';

const injected = vi.hoisted(() => ({
  backend: undefined as WalletSigningProvider | undefined,
  login: undefined as OwnerLogin | undefined,
  keys: undefined as JWTVerifyGetKey | undefined,
}));
vi.mock('../src/providers/cdp.js', () => ({
  createCdpWalletProvider: () => injected.backend,
}));
vi.mock('../src/onboarding/login.js', () => ({
  createOwnerLogin: async () => injected.login,
}));
vi.mock('../src/service/auth.js', async (original) => {
  const actual = await original<typeof import('../src/service/auth.js')>();
  return {
    ...actual,
    createAuthenticator: (
      config: Parameters<typeof actual.createAuthenticator>[0],
    ) => actual.createAuthenticator(config, injected.keys),
  };
});
vi.mock('../src/onboarding/vendors.js', () => ({
  createDiditIdentityAdapter: () => ({
    vendor: 'didit',
    policyFingerprint: 'offline',
    price: { maximumMinor: 0, termsReference: 'fixture' },
    importShared: async (_token: string, id: string) => ({
      vendor: 'didit',
      reference: id,
      correlation: id,
      status: 'approved',
      fetchedAt: new Date().toISOString(),
    }),
    read: async (reference: string, id: string) => ({
      vendor: 'didit',
      reference,
      correlation: id,
      status: 'approved',
      fetchedAt: new Date().toISOString(),
    }),
  }),
  createSumsubIdentityAdapter: vi.fn(),
}));
const folders: string[] = [];
const servers: Awaited<ReturnType<typeof createConfiguredProvider>>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await Promise.all(
    folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
beforeEach(() => {
  for (const env of [
    'PROVIDER_LOGIN_SECRET',
    'DIDIT_API_KEY',
    'WALLET_CDP_API_KEY_ID',
    'WALLET_CDP_API_KEY_SECRET',
    'WALLET_CDP_WALLET_SECRET',
  ])
    vi.stubEnv(env, 'ephemeral-offline-fixture');
});
async function template() {
  return validateProviderConfiguration(
    JSON.parse(await readFile('docs/provider.config.example.json', 'utf8')),
  );
}
async function folder() {
  const dir = await mkdtemp(join(tmpdir(), 'wpk-configured-'));
  folders.push(dir);
  return dir;
}
function cli(args: string[], cwd: string) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      createRequire(import.meta.url).resolve('tsx'),
      join(process.cwd(), 'src/main.ts'),
      ...args,
    ],
    {
      cwd,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
}
async function fixture(
  backend?: ProviderConfiguration['backend'],
  accessPermissions: Permission[] = ['account:read', 'transfers:request'],
) {
  const config = await template();
  config.policy.applications[0].permissions = [
    'account:read',
    'operations:request',
    'transfers:request',
  ];
  if (backend) config.backend = backend;
  config.storage.directory = await folder();
  config.activation = {
    enabled: true,
    backendAcceptance: 'offline-fixture',
    recoveryAcceptance: 'offline-fixture',
    tokenAcceptance: 'offline-fixture',
  };
  config.policy.applications[0].funding = {
    agreement: 'fixture',
    monthlyLimitMinor: 0,
  };
  const recipient = Wallet.createRandom().address;
  config.financial = {
    profile: 'provider-authorized-erc3009-v1',
    token: {
      address: Wallet.createRandom().address,
      name: 'Test Token',
      version: '1',
      symbol: 'TEST',
      decimals: 6,
    },
    recipients: [recipient],
    maximumAmount: '100',
    lifetimeAmount: '150',
    maxValiditySeconds: 300,
  };
  const database = openProviderDatabase({
    directory: config.storage.directory,
    initialize: true,
  });
  database.close();
  const wallet = Wallet.createRandom();
  injected.backend = {
    provider: 'offline',
    createAccount: vi.fn(async (id) => ({
      accountId: id,
      address: wallet.address,
    })),
    findAccount: vi.fn(async () => null),
    signTypedData: vi.fn(async (_account, action) =>
      wallet.signTypedData(
        action.payload.domain,
        action.payload.types,
        action.payload.message,
      ),
    ),
  };
  const csrf = 'c'.repeat(43);
  injected.login = {
    start: vi.fn(async () => 'https://login.example.com/authorize'),
    finish: vi.fn(async () => ({
      sessionToken: 'a'.repeat(43),
      requestId: 'access',
    })),
    session: async (token) => {
      if (!['a'.repeat(43), 'b'.repeat(43), 'd'.repeat(43)].includes(token))
        throw new AuthenticationError(401);
      return {
        csrf,
        identity: {
          issuer: config.ownerLogin.issuer,
          subject:
            token[0] === 'a'
              ? 'owner'
              : token[0] === 'b'
                ? config.reviewers[0]
                : 'other-owner',
          authenticatedAt: Date.now(),
        },
      };
    },
  };
  const keys = await generateKeyPair('ES256');
  injected.keys = async () => keys.publicKey;
  async function token(
    scope = 'wallet:access wallet:access:read wallet:provision wallet:account:read wallet:actions wallet:actions:read wallet:sign',
    client = config.policy.applications[0].clientId,
  ) {
    return (
      'Bearer ' +
      (await new SignJWT({ client_id: client, scope })
        .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt' })
        .setIssuer(config.oauth.issuer)
        .setAudience(config.oauth.audience)
        .setSubject('application-service')
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(keys.privateKey))
    );
  }
  const authorization = await token();
  let app = await createConfiguredProvider(config);
  servers.push(app);
  const api = (url: string, body: object, key: string = randomUUID()) =>
    app.inject({
      method: 'POST',
      url,
      headers: { authorization, 'idempotency-key': key },
      payload: body,
    });
  const form = (
    url: string,
    body: Record<string, string>,
    who = 'a',
    origin = config.policy.provider.origin,
  ) =>
    app.inject({
      method: 'POST',
      url,
      headers: {
        cookie: '__Host-wpk-session=' + who.repeat(43),
        origin,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({ csrf, ...body }).toString(),
    });
  const request = await api('/v1/access-requests', {
    mode: 'create',
    authorization_details: [
      {
        type: 'https://moovha.com/wallet/account-access',
        actions: accessPermissions,
      },
    ],
  });
  expect(request.statusCode).toBe(200);
  const requestId = request.json().request_id;
  if (accessPermissions.includes('transfers:request')) {
    const consentPage = await app.inject({
      url: '/onboarding/' + requestId,
      headers: { cookie: '__Host-wpk-session=' + 'a'.repeat(43) },
    });
    expect(consentPage.body).toContain(
      'without asking you to approve each transfer again',
    );
    expect(consentPage.body).toContain(recipient);
    expect(consentPage.body).toContain('0.0001 TEST');
  }
  expect(
    (await form('/onboarding/' + requestId, { decision: 'approve' }))
      .statusCode,
  ).toBe(302);
  expect(
    (
      await api(`/v1/access-requests/${requestId}/identity`, {
        vendor: 'didit',
        share_token: 'ephemeral-share',
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await form(
        '/onboarding/review/' + requestId,
        {
          vendor: 'didit',
          decision: 'accept',
          identity_matches_owner: 'yes',
          verified_at: new Date(Date.now() - 1000).toISOString(),
        },
        'b',
      )
    ).statusCode,
  ).toBe(302);
  const grant = (
    await app.inject({
      url: '/v1/access-requests/' + requestId,
      headers: { authorization },
    })
  ).json();
  expect(
    (await api('/v1/accounts/' + grant.account_id + '/provision', {}))
      .statusCode,
  ).toBe(200);
  return {
    config,
    wallet,
    recipient,
    api,
    form,
    token,
    grant,
    get app() {
      return app;
    },
    async restart(next = config) {
      await app.close();
      const index = servers.indexOf(app);
      if (index >= 0) servers.splice(index, 1);
      app = await createConfiguredProvider(next);
      servers.push(app);
    },
    async request(amount = '100', key?: string) {
      return api(
        '/v1/transfer-authorizations',
        { account_id: grant.account_id, recipient, amount },
        key,
      );
    },
  };
}

describe('configuration convention and CLI', () => {
  it('initializes without overwriting, validates offline, explicitly creates storage and diagnoses without activating', async () => {
    const dir = await folder();
    const init = cli(['init'], dir);
    expect(init.status, init.stderr).toBe(0);
    expect(cli(['init'], dir).status).toBe(1);
    expect(
      cli(['validate', '--config', 'provider.config.json'], dir).status,
    ).toBe(0);
    expect(
      cli(['doctor', '--config', 'provider.config.json'], dir).status,
    ).toBe(1);
    expect(
      cli(['init-storage', '--config', 'provider.config.json'], dir).status,
    ).toBe(0);
    const doctor = cli(['doctor', '--config', 'provider.config.json'], dir);
    expect(doctor.stdout).toContain('storage:catalog-and-integrity');
    expect(doctor.stdout).toContain('not_verified');
    const config = await template();
    (config.ownerLogin as unknown as { clientSecret: string }).clientSecret =
      'do-not-disclose';
    await writeFile(join(dir, 'invalid.json'), JSON.stringify(config));
    const invalid = cli(['validate', '--config', 'invalid.json'], dir);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).not.toContain('do-not-disclose');
  }, 30000);
  it('rejects unknown fields, arbitrary profiles, missing acceptance and unsafe addresses', async () => {
    const config = await template();
    expect(() =>
      validateProviderConfiguration({ ...config, unexpected: true }),
    ).toThrow();
    expect(() =>
      validateProviderConfiguration({ ...config, profile: 'generic-signing' }),
    ).toThrow();
    expect(() =>
      validateProviderConfiguration({
        ...config,
        activation: { enabled: true },
      }),
    ).toThrow();
    expect(() =>
      validateProviderConfiguration({
        ...config,
        backend: {
          kind: 'custom',
          module: 'https://untrusted.example/adapter.js',
        },
      }),
    ).toThrow();
    expect(() =>
      validateProviderConfiguration({
        ...config,
        storage: { ...config.storage, initialize: true },
      }),
    ).toThrow();
  });
});

describe('configured API and provider transfer authorization', () => {
  it('loads only versioned local custom adapters at run time', async () => {
    const config = await template();
    const dir = await folder();
    config.storage.directory = dir;
    const db = openProviderDatabase({ directory: dir, initialize: true });
    db.close();
    config.backend = {
      kind: 'custom',
      binding: 'offline-custom',
      module: './adapter.mjs',
    };
    await writeFile(
      join(dir, 'adapter.mjs'),
      "export const adapterVersion=2; export const createWalletBackend=()=>{throw new Error('must not run incompatible adapter')};",
    );
    validateProviderConfiguration(config);
    await expect(createConfiguredProvider(config, dir)).rejects.toThrow(
      'Invalid provider configuration',
    );
    await writeFile(
      join(dir, 'valid.mjs'),
      "export const adapterVersion=1; export const createWalletBackend=()=>({provider:'offline-custom',createAccount:async()=>{},findAccount:async()=>null,signTypedData:async()=>''});",
    );
    config.backend.module = './valid.mjs';
    const f = await fixture();
    const app = await createConfiguredProvider(config, dir);
    servers.push(app);
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
    expect(injected.backend!.createAccount).toHaveBeenCalledTimes(1);
    expect(f.config.backend.kind).toBe('cdp');
  });

  it('authorizes the application request under policy without another owner prompt, signs once and replays after restart', async () => {
    const f = await fixture();
    const key = randomUUID();
    const receipt = (await f.request('100', key)).json();
    expect(receipt.status).toBe('authorized');
    expect(receipt).not.toHaveProperty('approval_url');
    expect((await f.request('100', key)).json()).toEqual(receipt);
    expect((await f.request('99', key)).statusCode).toBe(409);
    const signPath = '/v1/actions/' + receipt.action_id + '/sign';
    expect(
      (await f.app.inject('/onboarding/actions/' + receipt.action_id))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await f.form('/onboarding/actions/' + receipt.action_id, {
          decision: 'approve',
        })
      ).statusCode,
    ).toBe(404);
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const saved = await db.onboardingStore.transaction(
      (state) => state.supportedActions![receipt.action_id],
    );
    expect(saved.approval.consentReference).toBe(f.grant.request_id);
    expect(saved.approval.caller.subject).toBe('application-service');
    expect(saved.approval.ownerSubject).not.toBe('application-service');
    db.close();
    const signed = await f.api(signPath, {});
    expect(signed.statusCode, signed.body).toBe(200);
    expect(recoverAddress(receipt.payload_hash, signed.json().signature)).toBe(
      f.wallet.address,
    );
    expect(receipt.payload.primaryType).toBe('TransferWithAuthorization');
    expect(
      TypedDataEncoder.hash(
        receipt.payload.domain,
        receipt.payload.types,
        receipt.payload.message,
      ),
    ).toBe(receipt.payload_hash);
    await f.restart();
    expect((await f.api(signPath, {})).json()).toEqual(signed.json());
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  });
  it('does not turn a request-only access grant or an OAuth scope into transfer delegation', async () => {
    const f = await fixture(undefined, ['account:read', 'operations:request']);
    expect((await f.request('1')).statusCode).toBe(403);
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
    const old = structuredClone(f.config);
    (old.financial as unknown as { profile: string }).profile =
      'owner-approved-erc3009-v1';
    expect(() => validateProviderConfiguration(old)).toThrow(
      'Invalid provider configuration',
    );
  });
  it.each([
    'consent',
    'delegation terms',
    'grant expiry',
    'KYC expiry',
    'owner binding',
    'paused access',
    'caller binding',
  ])(
    'denies new requests and signing when current %s is invalid',
    async (condition) => {
      const f = await fixture();
      const receipt = (await f.request('1')).json();
      const db = openProviderDatabase({
        directory: f.config.storage.directory,
      });
      await db.onboardingStore.transaction((state: ProviderState) => {
        const grant = state.grants[f.grant.grant_id];
        const source = state.requests[grant.requestId];
        const account = state.accounts[grant.accountId];
        switch (condition) {
          case 'consent':
            delete source.consent;
            break;
          case 'delegation terms':
            grant.transferPolicyRevision = 'superseded';
            break;
          case 'grant expiry':
            grant.expiresAt = Date.now() - 1;
            break;
          case 'KYC expiry':
            account.acceptedUntil = Date.now() - 1;
            break;
          case 'owner binding':
            account.owner = 'another-owner';
            break;
          case 'paused access':
            grant.state = 'suspended';
            break;
          case 'caller binding':
            source.caller = {
              ...source.caller,
              subject: 'another-application-subject',
            };
            break;
        }
      });
      db.close();
      expect((await f.request('1')).statusCode).toBe(403);
      expect(
        (await f.api('/v1/actions/' + receipt.action_id + '/sign', {}))
          .statusCode,
      ).toBe(403);
      expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
    },
  );
  it('resumes an interrupted authorization with the same immutable action before signing', async () => {
    const f = await fixture();
    const key = randomUUID();
    const store = financialStorage.storeApproval;
    vi.spyOn(financialStorage, 'storeApproval').mockImplementationOnce(
      (connection, approval) => {
        store(connection, approval);
        throw new Error('interrupted after durable approval');
      },
    );
    expect((await f.request('1', key)).statusCode).toBe(500);
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const partial = await db.onboardingStore.transaction(
      (state) => Object.values(state.supportedActions!)[0],
    );
    expect(partial.status).toBe('authorizing');
    expect(
      (
        await f.api(
          '/v1/actions/' + partial.approval.action.action_id + '/sign',
          {},
        )
      ).statusCode,
    ).toBe(403);
    const receipt = (await f.request('1', key)).json();
    expect(receipt.status).toBe('authorized');
    expect(receipt.action_id).toBe(partial.approval.action.action_id);
    expect(receipt.payload_hash).toBe(partial.approval.action.payload_hash);
    expect(
      (await f.api('/v1/actions/' + receipt.action_id + '/sign', {}))
        .statusCode,
    ).toBe(200);
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
    db.close();
  });
  it('coalesces concurrent application requests and records one provider authorization', async () => {
    const f = await fixture();
    const key = randomUUID();
    const receipts = await Promise.all([
      f.request('1', key),
      f.request('1', key),
    ]);
    expect(receipts.every((r) => r.statusCode === 200)).toBe(true);
    expect(receipts[0].json()).toEqual(receipts[1].json());
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const events = await db.onboardingStore.transaction((state) =>
      state.audit.filter((e) => e.event === 'action_provider_authorized'),
    );
    expect(events).toHaveLength(1);
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
    db.close();
  });
  it('requires new transfer consent after changed policy terms and reuses current accepted KYC', async () => {
    const f = await fixture();
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const before = await db.onboardingStore.transaction(
      (state) => state.accounts[f.grant.account_id],
    );
    const changed = structuredClone(f.config);
    changed.financial!.maximumAmount = '99';
    await f.restart(changed);
    expect((await f.request('1')).statusCode).toBe(403);
    const request = (
      await f.api('/v1/access-requests', {
        mode: 'connect',
        account_id: f.grant.account_id,
        authorization_details: [
          {
            type: 'https://moovha.com/wallet/account-access',
            actions: ['account:read', 'transfers:request'],
          },
        ],
      })
    ).json();
    expect(request.status).toBe('consent_required');
    expect(
      (
        await f.form('/onboarding/' + request.request_id, {
          decision: 'approve',
        })
      ).statusCode,
    ).toBe(302);
    const after = await db.onboardingStore.transaction(
      (state) => state.accounts[f.grant.account_id],
    );
    expect(after).toEqual(before);
    const receipt = (await f.request('1')).json();
    expect(receipt.status).toBe('authorized');
    expect(
      (await f.api('/v1/actions/' + receipt.action_id + '/sign', {}))
        .statusCode,
    ).toBe(200);
    db.close();
  });
  it('denies changed payload fields, unapproved recipients, exceeded amount/lifetime caps and scope-only callers', async () => {
    const f = await fixture();
    expect(
      (
        await f.api('/v1/transfer-authorizations', {
          account_id: f.grant.account_id,
          recipient: f.recipient,
          amount: '1',
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.api('/v1/transfer-authorizations', {
          account_id: f.grant.account_id,
          recipient: Wallet.createRandom().address,
          amount: '1',
        })
      ).statusCode,
    ).toBe(403);
    expect((await f.request('101')).statusCode).toBe(403);
    const body = {
      account_id: f.grant.account_id,
      recipient: f.recipient,
      amount: '1',
    };
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/v1/transfer-authorizations',
          headers: {
            authorization: await f.token('wallet:actions', 'unregistered'),
            'idempotency-key': randomUUID(),
          },
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    for (const count of [1, 2]) {
      const id = (await f.request()).json().action_id;
      expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
        count === 1 ? 200 : 503,
      );
    }
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  });
  it('blocks replay after grant revocation and invalidates approvals after policy changes', async () => {
    const f = await fixture();
    const id = (await f.request()).json().action_id;
    expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
      200,
    );
    const changed = structuredClone(f.config);
    changed.financial!.maximumAmount = '99';
    await f.restart(changed);
    expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
      403,
    );
    await f.restart();
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    await db.onboardingStore.transaction((state) => {
      state.grants[f.grant.grant_id].state = 'revoked';
    });
    db.close();
    expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
      403,
    );
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  });
  it('retains unknown attempts across restart and never dispatches another signature', async () => {
    const f = await fixture();
    const id = (await f.request()).json().action_id;
    injected.backend!.signTypedData = vi.fn(async () => {
      throw new Error('lost response');
    });
    expect(
      (await f.api('/v1/actions/' + id + '/sign', {})).json().outcome,
    ).toBe('unknown');
    await f.restart();
    expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
      503,
    );
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  });
  it('keeps configured deployments disabled without explicit acceptance and onboarding-only deployments deny signing', async () => {
    const f = await fixture();
    const id = (await f.request()).json().action_id;
    await f.restart({ ...f.config, activation: { enabled: false } });
    expect((await f.app.inject('/health/ready')).statusCode).toBe(503);
    expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
      503,
    );
    const config = structuredClone(f.config);
    delete config.financial;
    await f.restart(config);
    expect((await f.app.inject('/health/ready')).statusCode).toBe(200);
    expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
      403,
    );
  });
  it('preserves action records, denies expired/revoked work and prevents database reuse with another provider binding', async () => {
    const f = await fixture();
    const receipt = (await f.request('1')).json();
    const capabilities = (await f.app.inject('/v1/capabilities')).json();
    expect(capabilities.configuration_profile).toBe('provider-service-v1');
    expect(capabilities.action_profiles).toEqual([
      'provider-authorized-erc3009-v1',
    ]);
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    await db.revokeAction(receipt.action_id);
    db.close();
    await f.restart();
    const read = await f.app.inject({
      url: '/v1/transfer-authorizations/' + receipt.action_id,
      headers: { authorization: await f.token() },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().status).toBe('authorized');
    expect(
      (await f.api('/v1/actions/' + receipt.action_id + '/sign', {}))
        .statusCode,
    ).toBe(403);
    const expired = (await f.request('1')).json();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(expired.expires_at) + 1);
    expect(
      (await f.api('/v1/actions/' + expired.action_id + '/sign', {}))
        .statusCode,
    ).toBe(422);
    vi.restoreAllMocks();
    await expect(
      f.restart({
        ...f.config,
        backend: {
          ...f.config.backend,
          binding: 'different-provider-environment',
        },
      }),
    ).rejects.toThrow('Invalid provider configuration');
    await f.restart();
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  });
  it('allows one signature dispatch under concurrent API calls', async () => {
    const f = await fixture();
    const id = (await f.request('1')).json().action_id;
    const responses = await Promise.all([
      f.api('/v1/actions/' + id + '/sign', {}),
      f.api('/v1/actions/' + id + '/sign', {}),
    ]);
    expect(responses.some((r) => r.statusCode === 200)).toBe(true);
    expect(responses.every((r) => [200, 409].includes(r.statusCode))).toBe(
      true,
    );
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  });
  it('rechecks revocation after durable claim before calling the signer', async () => {
    const f = await fixture();
    const id = (await f.request('1')).json().action_id;
    const authorize = SupportedActions.prototype.authorize;
    let checks = 0;
    vi.spyOn(SupportedActions.prototype, 'authorize').mockImplementation(
      async function (this: SupportedActions, context, approval) {
        if (++checks === 3) {
          const db = openProviderDatabase({
            directory: f.config.storage.directory,
          });
          await db.onboardingStore.transaction((state) => {
            state.grants[f.grant.grant_id].state = 'revoked';
          });
          db.close();
        }
        return authorize.call(this, context, approval);
      },
    );
    expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
      403,
    );
    expect(checks).toBeGreaterThanOrEqual(3);
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  });
  it('fences stale configured budget writers in the same transaction as the budget update', async () => {
    const f = await fixture();
    const receipt = (await f.request('1')).json();
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const previous = await db.onboardingStore.transaction((state) => ({
      revision: state.deploymentBindings!['service-v1'].activeRevision!,
      budgetId: state.supportedActions![receipt.action_id].approval.budgetId,
    }));
    const next = structuredClone(f.config);
    next.financial!.maximumAmount = '99';
    next.financial!.lifetimeAmount = '100';
    await f.restart(next);
    const revision = await db.onboardingStore.transaction(
      (state) => state.deploymentBindings!['service-v1'].activeRevision!,
    );
    await db.setBudget(previous.budgetId, '100', revision);
    // A request admitted by the older instance may still reach its budget write.
    await expect(
      db.setBudget(previous.budgetId, '150', previous.revision),
    ).rejects.toThrow();
    expect(await db.budget(previous.budgetId)).toEqual({
      maximum: '100',
      reserved: '0',
    });
    expect(
      (await f.api('/v1/actions/' + receipt.action_id + '/sign', {}))
        .statusCode,
    ).toBe(403);
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
    db.close();
  });
  it('fences older running configurations and does not revive approvals on policy rollback', async () => {
    const f = await fixture();
    const id = (await f.request('1')).json().action_id;
    const next = structuredClone(f.config);
    next.financial!.maximumAmount = '99';
    const replacement = await createConfiguredProvider(next);
    servers.push(replacement);
    expect((await f.app.inject('/health/ready')).statusCode).toBe(503);
    expect((await replacement.inject('/health/ready')).statusCode).toBe(200);
    expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
      503,
    );
    await f.restart();
    expect((await f.app.inject('/health/ready')).statusCode).toBe(200);
    expect((await replacement.inject('/health/ready')).statusCode).toBe(503);
    expect((await f.api('/v1/actions/' + id + '/sign', {})).statusCode).toBe(
      403,
    );
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  });
  it('configures OWS without host code, signs offline and preserves its result after restart', async () => {
    vi.stubEnv(
      'OWS_OWNER_PASSPHRASE',
      'offline-owner-passphrase-for-ephemeral-vault',
    );
    const vault = await folder();
    const f = await fixture({
      kind: 'ows',
      binding: 'offline-ows',
      vaultDirectory: vault,
      passphrase: { env: 'OWS_OWNER_PASSPHRASE' },
    });
    const receipt = (await f.request('1')).json();
    const signed = await f.api(
      '/v1/actions/' + receipt.action_id + '/sign',
      {},
    );
    expect(signed.statusCode, signed.body).toBe(200);
    expect(
      recoverAddress(
        receipt.payload_hash,
        signed.json().signature,
      ).toLowerCase(),
    ).toBe(String(receipt.payload.message.from).toLowerCase());
    await f.restart();
    expect(
      (await f.api('/v1/actions/' + receipt.action_id + '/sign', {})).json(),
    ).toEqual(signed.json());
    expect(injected.backend!.createAccount).not.toHaveBeenCalled();
  }, 15000);
  it('configures a Relayer pool with durable unique assignments and no signer creation API', async () => {
    const wallet = Wallet.createRandom();
    const signer = {
      relayerId: 'offline-relayer',
      signerId: 'offline-signer',
      address: wallet.address,
      bindingRevision: '1',
    };
    vi.stubEnv('RELAYER_API_KEY', 'offline-relayer-credential');
    const request = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/sign-typed-data') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        const hash = keccak256(
          concat(['0x1901', body.domain_separator, body.hash_struct_message]),
        );
        return Response.json({
          success: true,
          data: { sig: wallet.signingKey.sign(hash).serialized },
        });
      }
      expect(init?.method).toBe('GET');
      return Response.json({
        success: true,
        data: path.includes('/networks/')
          ? {
              id: 'evm:base-sepolia',
              name: 'base-sepolia',
              network_type: 'evm',
              chain_id: 84532,
              is_testnet: true,
            }
          : {
              id: signer.relayerId,
              signer_id: signer.signerId,
              address: wallet.address,
              network: 'base-sepolia',
              network_type: 'evm',
              paused: false,
              system_disabled: false,
            },
      });
    });
    vi.stubGlobal('fetch', request);
    const f = await fixture({
      kind: 'openzeppelin-relayer',
      binding: 'offline-relayer-environment',
      url: 'https://relayer.example.test',
      apiKey: { env: 'RELAYER_API_KEY' },
      signers: [signer],
    });
    const receipt = (await f.request('1')).json();
    const signed = await f.api(
      '/v1/actions/' + receipt.action_id + '/sign',
      {},
    );
    expect(signed.statusCode, signed.body).toBe(200);
    expect(recoverAddress(receipt.payload_hash, signed.json().signature)).toBe(
      wallet.address,
    );
    await f.restart();
    expect(
      (await f.api('/v1/actions/' + receipt.action_id + '/sign', {})).json(),
    ).toEqual(signed.json());
    expect(
      request.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const assignment = await db.onboardingStore.transaction(
      (state) => state.backendAccounts![f.grant.account_id],
    );
    expect(assignment.signer).toEqual(signer);
    const another = randomUUID();
    await db.onboardingStore.transaction((state) => {
      state.accounts[another] = {
        ...state.accounts[f.grant.account_id],
        id: another,
      };
      const old = state.grants[f.grant.grant_id];
      const grantId = randomUUID();
      state.grants[grantId] = { ...old, id: grantId, accountId: another };
    });
    expect(
      (await f.api('/v1/accounts/' + another + '/provision', {})).statusCode,
    ).toBe(403);
    expect(
      await db.onboardingStore.transaction(
        (state) => state.backendAccounts![another],
      ),
    ).toBeUndefined();
    db.close();
    expect(
      request.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
  it('requires a migration before adopting a database containing an existing host journal or budget', async () => {
    const f = await fixture();
    const dir = await folder();
    const db = openProviderDatabase({ directory: dir, initialize: true });
    expect(await db.hasStoredRecords()).toBe(false);
    await db.setBudget('existing-host', '1');
    expect(await db.hasStoredRecords()).toBe(true);
    await expect(
      createConfiguredProvider({
        ...f.config,
        storage: { kind: 'sqlite', directory: dir },
      }),
    ).rejects.toThrow('Invalid provider configuration');
    expect(await db.budget('existing-host')).toEqual({
      maximum: '1',
      reserved: '0',
    });
    db.close();
  });
});
