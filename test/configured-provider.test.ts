import { approvedCallsFixture } from './helpers/approved-calls.js';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { createRequire } from 'node:module';
import type { Permission, ProviderState } from '../src/onboarding/types.js';
import * as financialStorage from '../src/storage/financial.js';
import { mkdtemp, rm, readFile, writeFile, chmod } from 'node:fs/promises';
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
import { generateKeyPair, SignJWT, exportPKCS8, exportSPKI } from 'jose';
import {
  canonicalServiceJson,
  createServiceIdentity,
} from '../src/executor/auth.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { createExecutionService } from '../src/executor/service.js';
import type { ExecutionServiceConfiguration } from '../src/executor/config.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executionFixture } from './helpers/execution.js';
import { fingerprint } from '../src/onboarding/policy.js';
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
    JSON.parse(
      await readFile('docs/provider.config.hosted.example.json', 'utf8'),
    ),
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
  enableExecution = false,
  executionBudget?: string,
  configureExecution?: (
    config: ProviderConfiguration,
    execution: ReturnType<typeof executionFixture>,
  ) => Promise<void>,
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
  const execution = enableExecution
    ? executionFixture(
        config.policy.applications[0].clientId,
        config.financial.token.address,
        config.financial.token.name,
        config.financial.token.version,
      )
    : undefined;
  if (execution) {
    if (executionBudget)
      execution.configuration.sponsors[0].lifetimeBudgetWei = executionBudget;
    config.execution = execution.configuration;
    config.activation.executionAcceptance =
      'ephemeral-offline-execution-evidence';
    vi.stubEnv('EXECUTION_RELAYER_API_KEY', 'ephemeral-offline-api-token');
    vi.stubEnv('EXECUTION_RPC_PRIMARY_URL', 'https://primary.example.test');
    vi.stubEnv('EXECUTION_RPC_SECONDARY_URL', 'https://secondary.example.test');
    vi.stubGlobal('fetch', execution.request);
  }
  if (execution && configureExecution)
    await configureExecution(config, execution);
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
          issuer: config.ownerLogin!.issuer,
          subject:
            token[0] === 'a'
              ? 'owner'
              : token[0] === 'b'
                ? config.reviewers![0]
                : 'other-owner',
          authenticatedAt: Date.now(),
        },
      };
    },
  };
  const keys = await generateKeyPair('ES256');
  injected.keys = async () => keys.publicKey;
  async function token(
    scope = 'wallet:access wallet:access:read wallet:provision wallet:account:read wallet:actions wallet:actions:read wallet:sign wallet:events wallet:events:read wallet:execute wallet:execute:read',
    client = config.policy.applications[0].clientId,
    subject = 'application-service',
  ) {
    return (
      'Bearer ' +
      (await new SignJWT({ client_id: client, scope })
        .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt' })
        .setIssuer(config.oauth.issuer)
        .setAudience(config.oauth.audience)
        .setSubject(subject)
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
      headers: {
        authorization,
        'idempotency-key': key,
        ...(url.endsWith('/execute')
          ? {
              'execution-profile':
                config.execution?.profile ?? 'erc3009-relayer-v1',
              'execution-profile-revision': '1',
            }
          : {}),
      },
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
    execution,
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

async function designatedFixture() {
  for (const name of ['WALLET', 'EXECUTOR']) {
    const pair = await generateKeyPair('ES256', { extractable: true });
    vi.stubEnv(name + '_SERVICE_PRIVATE', await exportPKCS8(pair.privateKey));
    vi.stubEnv(name + '_SERVICE_PUBLIC', await exportSPKI(pair.publicKey));
  }
  let walletApp: Awaited<ReturnType<typeof createConfiguredProvider>>;
  let executor: Awaited<ReturnType<typeof createExecutionService>>;
  let executorConfig: ExecutionServiceConfiguration;
  let bridge: typeof fetch;
  const state = {
    loseBeforeHandoff: false,
    loseAfterHandoff: false,
    authorityCalls: 0,
    beforeAuthority: undefined as (() => Promise<void>) | undefined,
  };
  const f = await fixture(
    undefined,
    undefined,
    true,
    undefined,
    async (config, execution) => {
      const legacy = structuredClone(config.execution!);
      const serviceOrigin = 'https://executor.example.test';
      const walletOrigin = config.policy.provider.origin;
      config.execution = {
        ...legacy,
        profile: 'erc3009-executor-v1',
        service: {
          url: serviceOrigin,
          providerId: 'sponsor',
          providerRevision: '1',
          signing: {
            id: 'wallet-key',
            privateKey: { env: 'WALLET_SERVICE_PRIVATE' },
          },
          keys: [
            {
              id: 'executor-key',
              publicKey: { env: 'EXECUTOR_SERVICE_PUBLIC' },
            },
          ],
        },
        sponsors: legacy.sponsors.map((sponsor) => ({
          ...sponsor,
          binding: {
            address: sponsor.binding.address,
            bindingRevision: sponsor.binding.bindingRevision,
          },
        })),
      };
      delete config.execution.relayer;
      const directory = await folder();
      const db = openProviderDatabase({ directory, initialize: true });
      db.close();
      executorConfig = {
        configVersion: 1,
        profile: 'execution-service-v1',
        origin: serviceOrigin,
        binding: 'offline-executor',
        storage: { kind: 'sqlite', directory },
        signing: {
          id: 'executor-key',
          privateKey: { env: 'EXECUTOR_SERVICE_PRIVATE' },
        },
        callers: [
          {
            origin: walletOrigin,
            keys: [
              { id: 'wallet-key', publicKey: { env: 'WALLET_SERVICE_PUBLIC' } },
            ],
            providers: ['sponsor'],
          },
        ],
        providers: [
          {
            id: 'sponsor',
            revision: '1',
            kind: 'openzeppelin-relayer',
            relayer: legacy.relayer,
            rpc: legacy.rpc,
            token: config.financial!.token,
            sponsors: legacy.sponsors,
          },
        ],
        activation: {
          enabled: true,
          providerAcceptance: 'offline-provider',
          recoveryAcceptance: 'offline-recovery',
          authenticationAcceptance: 'offline-auth',
        },
      };
      bridge = (async (input, options) => {
        const url = new URL(String(input));
        if ([walletOrigin, serviceOrigin].includes(url.origin)) {
          const handoff =
            url.origin === serviceOrigin && options?.method === 'POST';
          if (handoff && state.loseBeforeHandoff)
            throw new Error(
              'Offline transport loss before executor acceptance',
            );
          if (url.origin === walletOrigin) {
            state.authorityCalls++;
            await state.beforeAuthority?.();
          }
          const server = url.origin === walletOrigin ? walletApp : executor;
          const response = await server.inject({
            method: options?.method as 'GET' | 'POST',
            url: url.pathname,
            headers: Object.fromEntries(new Headers(options?.headers)),
            ...(options?.body ? { payload: String(options.body) } : {}),
          });
          if (handoff && state.loseAfterHandoff)
            throw new Error('Offline handoff response loss');
          return new Response(response.body, {
            status: response.statusCode,
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([key, value]) => [
                key,
                String(value),
              ]),
            ),
          });
        }
        return execution.request(input, options);
      }) as typeof fetch;
      vi.stubGlobal('fetch', bridge);
      executor = await createExecutionService({
        configuration: executorConfig,
        request: bridge,
      });
      servers.push(executor);
    },
  );
  walletApp = f.app;
  return {
    f,
    state,
    get executor() {
      return executor;
    },
    get executorConfig() {
      return executorConfig;
    },
    async restart() {
      await f.restart();
      walletApp = f.app;
      await executor.close();
      executor = await createExecutionService({
        configuration: executorConfig,
        request: bridge,
      });
      servers.push(executor);
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
  it('dispatches through the designated service with fresh callbacks, independent verification and stable recovery across both stores', async () => {
    const t = await designatedFixture();
    const f = t.f;
    const action = (await f.request('1')).json();
    const path = '/v1/actions/' + action.action_id;
    t.state.loseAfterHandoff = true;
    const first = await f.api(path + '/execute', {});
    expect(first.statusCode).toBe(503);
    expect(f.execution!.state.posts).toBe(1);
    expect(t.state.authorityCalls).toBeGreaterThanOrEqual(4);
    t.state.loseAfterHandoff = false;
    await t.restart();
    const headers = {
      authorization: await f.token('wallet:execute:read'),
      'execution-profile': 'erc3009-executor-v1',
      'execution-profile-revision': '1',
    };
    f.execution!.state.included = true;
    f.execution!.state.finality = 'finalized';
    const recovered = await f.app.inject({ url: path + '/execution', headers });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toMatchObject({
      profile: 'erc3009-executor-v1',
      dispatch_status: 'accepted',
      verification: 'rpc-quorum',
      settlement: 'succeeded',
    });
    expect((await f.api(path + '/execute', {})).json().execution_id).toBe(
      recovered.json().execution_id,
    );
    expect(f.execution!.state.posts).toBe(1);
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
    expect(
      (
        await f.app.inject({
          url: path + '/execution',
          headers: { ...headers, 'execution-profile': 'erc3009-relayer-v1' },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/v1/internal/execution-authority',
          headers: {
            authorization: await f.token('wallet:execute wallet:sign'),
          },
          payload: {
            provider_id: 'sponsor',
            provider_revision: '1',
            execution_id: recovered.json().execution_id,
            action_id: action.action_id,
            plan_hash: '0'.repeat(64),
            request_hash: '0'.repeat(64),
          },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('recovers a handoff lost before executor acceptance using the original identity and current authority', async () => {
    const t = await designatedFixture();
    const f = t.f;
    const action = (await f.request('1')).json();
    const path = '/v1/actions/' + action.action_id;
    t.state.loseBeforeHandoff = true;
    expect((await f.api(path + '/execute', {})).statusCode).toBe(503);
    expect(f.execution!.state.posts).toBe(0);
    t.state.loseBeforeHandoff = false;
    await t.restart();
    const resumed = await f.api(path + '/execute', {});
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().dispatch_status).toBe('accepted');
    await f.api(path + '/execute', {});
    expect(f.execution!.state.posts).toBe(1);
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  });
  it('denies executor dispatch when wallet authority is revoked during the remote callback', async () => {
    const t = await designatedFixture();
    const f = t.f;
    const action = (await f.request('1')).json();
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    t.state.beforeAuthority = async () => {
      await db.onboardingStore.transaction((state) => {
        state.grants[f.grant.grant_id].state = 'revoked';
      });
    };
    expect(
      (await f.api('/v1/actions/' + action.action_id + '/execute', {}))
        .statusCode,
    ).toBe(503);
    expect(f.execution!.state.posts).toBe(0);
    db.close();
  });
  it('expires a handoff lease without dispatch and renews it only through a fresh authorized execute request', async () => {
    const t = await designatedFixture();
    const f = t.f;
    const action = (await f.request('1')).json();
    const path = '/v1/actions/' + action.action_id;
    t.state.loseBeforeHandoff = true;
    await f.api(path + '/execute', {});
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const record = await db.onboardingStore.transaction(
      (state) => state.supportedActions![action.action_id],
    );
    const execution = record.execution!;
    const request = createWalletAttemptRequest(
      'configured-execution-v1',
      'erc3009-executor-v1',
      'relay_transaction',
      record.approval.account.accountId,
      execution.executionId,
      action.action_id,
      execution.plan!,
    );
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);
    const identity = await createServiceIdentity(
      t.executorConfig.origin,
      t.executorConfig.signing,
      t.executorConfig.callers,
    );
    const body = {
      provider_id: 'sponsor',
      provider_revision: '1',
      execution_id: execution.executionId,
      action_id: action.action_id,
      plan_hash: execution.planHash!,
      request_hash: request.requestHash,
    };
    const signed = await identity.sign(
      f.config.policy.provider.origin,
      'authority',
      'POST',
      '/v1/internal/execution-authority',
      body,
    );
    const denied = await f.app.inject({
      method: 'POST',
      url: '/v1/internal/execution-authority',
      headers: {
        authorization: 'Bearer ' + signed.proof,
        'content-type': 'application/json',
      },
      payload: canonicalServiceJson(body),
    });
    expect(denied.statusCode).toBe(403);
    expect(f.execution!.state.posts).toBe(0);
    t.state.loseBeforeHandoff = false;
    expect((await f.api(path + '/execute', {})).statusCode).toBe(200);
    expect(f.execution!.state.posts).toBe(1);
    db.close();
  });
  it('rotates both service key identities without rebuilding approved plans or dispatching again', async () => {
    const t = await designatedFixture();
    const f = t.f;
    const action = (await f.request('1')).json();
    const path = '/v1/actions/' + action.action_id;
    const original = (await f.api(path + '/execute', {})).json();
    for (const name of ['WALLET_NEXT', 'EXECUTOR_NEXT']) {
      const pair = await generateKeyPair('ES256', { extractable: true });
      vi.stubEnv(name + '_PRIVATE', await exportPKCS8(pair.privateKey));
      vi.stubEnv(name + '_PUBLIC', await exportSPKI(pair.publicKey));
    }
    f.config.execution!.service!.signing = {
      id: 'wallet-next',
      privateKey: { env: 'WALLET_NEXT_PRIVATE' },
    };
    f.config.execution!.service!.keys.push({
      id: 'executor-next',
      publicKey: { env: 'EXECUTOR_NEXT_PUBLIC' },
    });
    t.executorConfig.signing = {
      id: 'executor-next',
      privateKey: { env: 'EXECUTOR_NEXT_PRIVATE' },
    };
    t.executorConfig.callers[0].keys.push({
      id: 'wallet-next',
      publicKey: { env: 'WALLET_NEXT_PUBLIC' },
    });
    await t.restart();
    const headers = {
      authorization: await f.token('wallet:execute:read'),
      'execution-profile': 'erc3009-executor-v1',
      'execution-profile-revision': '1',
    };
    const status = await f.app.inject({ url: path + '/execution', headers });
    expect(status.statusCode).toBe(200);
    expect(status.json().execution_id).toBe(original.execution_id);
    expect((await f.api(path + '/execute', {})).statusCode).toBe(200);
    expect(f.execution!.state.posts).toBe(1);
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  });
  it('coordinates one sponsored transfer, persists replay and verifies its exact finalized effect', async () => {
    const f = await fixture(undefined, undefined, true);
    const action = (await f.request('100')).json();
    const url = '/v1/actions/' + action.action_id + '/execute';
    const key = randomUUID();
    const executed = await f.api(url, {}, key);
    expect(executed.statusCode).toBe(200);
    expect(executed.json()).toMatchObject({
      profile: 'erc3009-relayer-v1',
      dispatch_status: 'accepted',
      verification: 'unverified',
      settlement: 'pending',
    });
    expect(executed.json()).not.toHaveProperty('signature');
    expect(executed.json()).not.toHaveProperty('data');
    expect(f.execution!.state.posts).toBe(1);
    const token = await f.token('wallet:execute:read');
    const read = () =>
      f.app.inject({
        url: '/v1/actions/' + action.action_id + '/execution',
        headers: {
          authorization: token,
          'execution-profile': 'erc3009-relayer-v1',
          'execution-profile-revision': '1',
        },
      });
    f.execution!.state.included = true;
    for (const phase of ['included', 'safe', 'finalized'] as const) {
      f.execution!.state.finality = phase;
      const response = await read();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        chain_status: phase,
        verification: 'rpc-quorum',
        outcome: 'succeeded',
        settlement: phase === 'finalized' ? 'succeeded' : 'pending',
      });
    }
    await f.restart();
    const replay = await f.api(url, {}, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().execution_id).toBe(executed.json().execution_id);
    expect(replay.json().settlement).toBe('succeeded');
    expect((await f.api(url, {})).json().execution_id).toBe(
      executed.json().execution_id,
    );
    expect(f.execution!.state.posts).toBe(1);
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const budgetId = fingerprint([
      'execution-gas',
      f.config.policy.provider.origin,
      f.config.oauth.issuer,
      f.config.policy.applications[0].clientId,
    ]);
    expect((await db.budget(budgetId))?.reserved).toBe('451000000000000');
    db.close();
    const discovery = (await f.app.inject('/v1/execution-capabilities')).json();
    expect(discovery.profiles[0]).toMatchObject({
      configured: true,
      ready: true,
      revision: '1',
      finality: 'finalized',
    });
  });
  it('restores execution identity, gas reservations and CloudEvents from an online backup without dispatch', async () => {
    const f = await fixture(undefined, undefined, true);
    const action = (await f.request('1')).json();
    const path = '/v1/actions/' + action.action_id;
    const executed = (await f.api(path + '/execute', {})).json();
    f.execution!.state.included = true;
    const headers = {
      authorization: await f.token('wallet:execute:read'),
      'execution-profile': 'erc3009-relayer-v1',
      'execution-profile-revision': '1',
    };
    const status = () => f.app.inject({ url: path + '/execution', headers });
    await status();
    await status();
    const first = (
      await f.app.inject({ url: path + '/execution-events', headers })
    ).json();
    expect(first.events).toHaveLength(1);
    expect(first.events[0]).toMatchObject({
      specversion: '1.0',
      sequence: 1,
      data: { chain_status: 'included', settlement: 'pending' },
    });
    expect(
      (
        await f.app.inject({ url: path + '/execution-events?after=1', headers })
      ).json().events,
    ).toEqual([]);
    expect(
      (await f.app.inject({ url: path + '/execution-events?after=2', headers }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await f.app.inject({
          url: path + '/execution-events?after=-1',
          headers,
        })
      ).statusCode,
    ).toBe(400);
    const destination = await folder();
    const source = new DatabaseSync(
      join(f.config.storage.directory, 'provider.sqlite'),
      { readOnly: true },
    );
    await backup(source, join(destination, 'provider.sqlite'));
    source.close();
    await chmod(join(destination, 'provider.sqlite'), 0o600);
    await f.app.close();
    const restored = await createConfiguredProvider({
      ...f.config,
      storage: { ...f.config.storage, directory: destination },
    });
    servers.push(restored);
    expect(
      (
        await restored.inject({ url: path + '/execution-events', headers })
      ).json(),
    ).toEqual(first);
    const replay = await restored.inject({
      method: 'POST',
      url: path + '/execute',
      headers: {
        ...headers,
        authorization: await f.token('wallet:execute wallet:sign'),
        'idempotency-key': randomUUID(),
      },
      payload: {},
    });
    expect(replay.json().execution_id).toBe(executed.execution_id);
    f.execution!.state.finality = 'finalized';
    expect(
      (await restored.inject({ url: path + '/execution', headers })).json()
        .settlement,
    ).toBe('succeeded');
    const feed = (
      await restored.inject({
        url: path + '/execution-events?after=1',
        headers,
      })
    ).json();
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0].sequence).toBe(2);
    expect(feed.events[0].id).not.toBe(first.events[0].id);
    expect(f.execution!.state.posts).toBe(1);
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
    const db = openProviderDatabase({ directory: destination });
    const budgetId = fingerprint([
      'execution-gas',
      f.config.policy.provider.origin,
      f.config.oauth.issuer,
      f.config.policy.applications[0].clientId,
    ]);
    expect((await db.budget(budgetId))?.reserved).toBe('451000000000000');
    // Retention loss is explicit; consumers resynchronize from the current receipt.
    await db.onboardingStore.transaction((state) => {
      const execution = state.supportedActions![action.action_id].execution!;
      execution.events = [execution.events![1]];
    });
    expect(
      (
        await restored.inject({ url: path + '/execution-events', headers })
      ).json().history_truncated,
    ).toBe(true);
    db.close();
  });
  it('denies invalid sponsor configuration and fails closed when execution is absent', async () => {
    const f = await fixture(undefined, undefined, true);
    for (const change of [
      (config: ProviderConfiguration) => {
        delete config.activation.executionAcceptance;
      },
      (config: ProviderConfiguration) => {
        config.execution!.sponsors[0].lifetimeBudgetWei = '1';
      },
      (config: ProviderConfiguration) => {
        config.execution!.sponsors[0].clientId = 'untrusted-app';
      },
      (config: ProviderConfiguration) => {
        config.execution!.sponsors[0].maxPriorityFeePerGas = '4000000000';
      },
      (config: ProviderConfiguration) => {
        config.execution!.rpc.endpoints[1] = config.execution!.rpc.endpoints[0];
      },
    ]) {
      const config = structuredClone(f.config);
      change(config);
      expect(() => validateProviderConfiguration(config)).toThrow();
    }
    const config = structuredClone(f.config);
    delete config.execution;
    const action = (await f.request('1')).json();
    const other = await createConfiguredProvider(config);
    servers.push(other);
    expect(
      (await other.inject('/v1/execution-capabilities')).json().profiles[0]
        .configured,
    ).toBe(false);
    const response = await other.inject({
      method: 'POST',
      url: '/v1/actions/' + action.action_id + '/execute',
      headers: {
        authorization: await f.token('wallet:execute wallet:sign'),
        'idempotency-key': randomUUID(),
        'execution-profile': 'erc3009-relayer-v1',
        'execution-profile-revision': '1',
      },
      payload: {},
    });
    expect(response.statusCode).toBe(503);
    expect(f.execution!.state.posts).toBe(0);
  });
  it('never redispatches an unknown submission and recovers a lost provider ID from exact chain logs', async () => {
    const f = await fixture(undefined, undefined, true);
    const action = (await f.request('1')).json();
    const url = '/v1/actions/' + action.action_id + '/execute';
    f.execution!.state.lostResponse = true;
    const first = await f.api(url, {});
    expect(first.statusCode).toBe(503);
    expect(first.json().outcome).toBe('unknown');
    await f.restart();
    const retry = await f.api(url, {});
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({
      dispatch_status: 'unknown',
      settlement: 'pending',
    });
    expect(f.execution!.state.posts).toBe(1);
    f.execution!.state.included = true;
    f.execution!.state.finality = 'finalized';
    const status = await f.app.inject({
      url: '/v1/actions/' + action.action_id + '/execution',
      headers: {
        authorization: await f.token('wallet:execute:read'),
        'execution-profile': 'erc3009-relayer-v1',
        'execution-profile-revision': '1',
      },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      dispatch_status: 'unknown',
      chain_status: 'finalized',
      verification: 'rpc-quorum',
      settlement: 'succeeded',
    });
    await f.api(url, {});
    expect(f.execution!.state.posts).toBe(1);
  });
  it('retains gas admission after dispatch and rejects a second action when the sponsor budget is exhausted', async () => {
    const f = await fixture(undefined, undefined, true, '451000000000000');
    const first = (await f.request('1')).json();
    const second = (await f.request('1')).json();
    expect(
      (await f.api('/v1/actions/' + first.action_id + '/execute', {}))
        .statusCode,
    ).toBe(200);
    const denied = await f.api(
      '/v1/actions/' + second.action_id + '/execute',
      {},
    );
    expect(denied.statusCode).toBe(503);
    expect(f.execution!.state.posts).toBe(1);
    await f.restart();
    await f.api('/v1/actions/' + second.action_id + '/execute', {});
    expect(f.execution!.state.posts).toBe(1);
  });
  it('continues authorized status recovery after signing expiry and fences a finalized-head regression', async () => {
    const f = await fixture(undefined, undefined, true);
    const first = (await f.request('1')).json();
    const unstarted = (await f.request('1')).json();
    const path = '/v1/actions/' + first.action_id;
    await f.api(path + '/execute', {});
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 301000);
    expect(
      (await f.api('/v1/actions/' + unstarted.action_id + '/execute', {}))
        .statusCode,
    ).toBe(403);
    f.execution!.state.included = true;
    f.execution!.state.finality = 'finalized';
    const headers = {
      authorization: await f.token('wallet:execute:read'),
      'execution-profile': 'erc3009-relayer-v1',
      'execution-profile-revision': '1',
    };
    const read = () => f.app.inject({ url: path + '/execution', headers });
    expect((await read()).json().settlement).toBe('succeeded');
    expect((await f.api(path + '/execute', {})).json().settlement).toBe(
      'succeeded',
    );
    f.execution!.state.finality = 'included';
    expect((await read()).statusCode).toBe(503);
    expect(f.execution!.state.posts).toBe(1);
  });
  it('serializes two coordinators against the same durable action and sponsor budget', async () => {
    const f = await fixture(undefined, undefined, true);
    const action = (await f.request('1')).json();
    const other = await createConfiguredProvider(f.config);
    servers.push(other);
    const url = '/v1/actions/' + action.action_id + '/execute';
    const responses = await Promise.all([
      f.api(url, {}),
      other.inject({
        method: 'POST',
        url,
        headers: {
          authorization: await f.token('wallet:execute wallet:sign'),
          'idempotency-key': randomUUID(),
          'execution-profile': 'erc3009-relayer-v1',
          'execution-profile-revision': '1',
        },
        payload: {},
      }),
    ]);
    expect(
      responses.every((response) => [200, 409].includes(response.statusCode)),
    ).toBe(true);
    expect(f.execution!.state.posts).toBe(1);
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  });
  it('requires exact execution profile selection, both write scopes and an empty body', async () => {
    const f = await fixture(undefined, undefined, true);
    const action = (await f.request('1')).json();
    const url = '/v1/actions/' + action.action_id + '/execute';
    const authorization = await f.token('wallet:execute wallet:sign');
    const headers = {
      authorization,
      'idempotency-key': randomUUID(),
      'execution-profile': 'erc3009-relayer-v1',
      'execution-profile-revision': '1',
    };
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers: { authorization, 'idempotency-key': randomUUID() },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers: { ...headers, 'execution-profile-revision': '2' },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers: {
            ...headers,
            authorization: await f.token('wallet:execute'),
          },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers,
          payload: { data: '0x' },
        })
      ).statusCode,
    ).toBe(400);
    expect(f.execution!.state.posts).toBe(0);
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  });
  it('rechecks revocation after simulation before dispatch and protects status responses', async () => {
    const f = await fixture(undefined, undefined, true);
    const action = (await f.request('1')).json();
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    f.execution!.state.before = async (method) => {
      if (method === 'eth_call')
        await db.onboardingStore.transaction((state) => {
          state.grants[f.grant.grant_id].state = 'revoked';
        });
    };
    expect(
      (await f.api('/v1/actions/' + action.action_id + '/execute', {}))
        .statusCode,
    ).toBe(403);
    expect(f.execution!.state.posts).toBe(0);
    const status = await f.app.inject({
      url: '/v1/actions/' + action.action_id + '/execution',
      headers: {
        authorization: await f.token('wallet:execute:read'),
        'execution-profile': 'erc3009-relayer-v1',
        'execution-profile-revision': '1',
      },
    });
    expect(status.statusCode).toBe(403);
    db.close();
  });
  it('does not accept reported confirmation as settlement and fences contradictions to finalized evidence', async () => {
    const f = await fixture(undefined, undefined, true);
    const action = (await f.request('1')).json();
    expect(
      (await f.api('/v1/actions/' + action.action_id + '/execute', {}))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await f.api('/v1/actions/' + action.action_id + '/transaction-events', {
          event: 'confirmed',
          chain_id: 'eip155:84532',
          transaction_hash: f.execution!.transactionHash,
          observed_at: new Date().toISOString(),
        })
      ).statusCode,
    ).toBe(200);
    const read = () =>
      f.app.inject({
        url: '/v1/actions/' + action.action_id + '/execution',
        headers: {
          authorization: '',
          'execution-profile': 'erc3009-relayer-v1',
          'execution-profile-revision': '1',
        },
      });
    const authorization = await f.token('wallet:execute:read');
    const status = () =>
      f.app.inject({
        url: '/v1/actions/' + action.action_id + '/execution',
        headers: {
          authorization,
          'execution-profile': 'erc3009-relayer-v1',
          'execution-profile-revision': '1',
        },
      });
    expect((await status()).json().settlement).toBe('pending');
    f.execution!.state.included = true;
    f.execution!.state.finality = 'finalized';
    expect((await status()).json().settlement).toBe('succeeded');
    f.execution!.state.mutate = (method, value) =>
      method === 'eth_getBlockByNumber' && (value as any).number === '0x65'
        ? { ...(value as object), hash: '0x' + 'f'.repeat(64) }
        : value;
    expect((await status()).statusCode).toBe(503);
    f.execution!.state.mutate = undefined;
    expect((await status()).statusCode).toBe(503);
    expect(f.execution!.state.posts).toBe(1);
    expect((await read()).statusCode).toBe(401);
  });
  it('records concurrent idempotent transaction reports durably without altering signing or budgets', async () => {
    const f = await fixture();
    const receipt = (await f.request('100')).json();
    const path = '/v1/actions/' + receipt.action_id + '/transaction-events';
    expect(
      (await f.api('/v1/actions/' + receipt.action_id + '/sign', {}))
        .statusCode,
    ).toBe(200);
    const body = {
      event: 'confirmed',
      chain_id: 'eip155:84532',
      transaction_hash: '0x' + '1'.repeat(64),
      observed_at: new Date().toISOString(),
    };
    const key = randomUUID();
    const results = await Promise.all([
      f.api(path, body, key),
      f.api(path, body, key),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results[0].json()).toEqual(results[1].json());
    expect(results[0].json()).toMatchObject({
      action_id: receipt.action_id,
      verification: 'unverified',
      ...body,
    });
    expect(
      (await f.api(path, { ...body, event: 'failed' }, key)).statusCode,
    ).toBe(409);
    const other = (await f.request('1')).json();
    expect(
      (
        await f.api(
          '/v1/actions/' + other.action_id + '/transaction-events',
          body,
          key,
        )
      ).statusCode,
    ).toBe(409);
    await f.restart();
    expect((await f.api(path, body, key)).json()).toEqual(results[0].json());
    const read = await f.app.inject({
      url: path,
      headers: { authorization: await f.token('wallet:events:read') },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().events).toHaveLength(1);
    expect(read.json().events[0].verification).toBe('unverified');
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const saved = await db.onboardingStore.transaction(
      (state) => state.supportedActions![receipt.action_id],
    );
    expect(saved.status).toBe('authorized');
    expect(await db.budget(saved.approval.budgetId)).toEqual({
      maximum: '150',
      reserved: '100',
    });
    db.close();
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  });
  it('requires report scopes and the original caller, validates bounded input and remains unverified', async () => {
    const f = await fixture();
    const receipt = (await f.request('1')).json();
    const path = '/v1/actions/' + receipt.action_id + '/transaction-events';
    const body = {
      event: 'submitted',
      chain_id: 'eip155:84532',
      transaction_hash: '0x' + '2'.repeat(64),
      observed_at: new Date().toISOString(),
    };
    const post = (authorization?: string, payload = body) =>
      f.app.inject({
        method: 'POST',
        url: path,
        headers: {
          ...(authorization ? { authorization } : {}),
          'idempotency-key': randomUUID(),
        },
        payload,
      });
    expect((await post()).statusCode).toBe(401);
    expect((await post(await f.token('wallet:sign'))).statusCode).toBe(403);
    expect(
      (await post(await f.token('wallet:events', 'another-client'))).statusCode,
    ).toBe(403);
    expect(
      (
        await post(
          await f.token(
            'wallet:events',
            f.config.policy.applications[0].clientId,
            'another-caller',
          ),
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          url: path,
          headers: { authorization: await f.token('wallet:events') },
        })
      ).statusCode,
    ).toBe(403);
    for (const invalid of [
      { ...body, chain_id: 'eip155:1' },
      { ...body, transaction_hash: 'invalid' },
      { ...body, signature: 'must-not-be-stored' },
      { ...body, verification: 'verified' },
      { ...body, observed_at: 'invalid' },
      { ...body, observed_at: '2037-02-30T12:00:00Z' },
    ])
      expect((await f.api(path, invalid)).statusCode).toBe(400);
    expect(
      (
        await f.api(path, {
          ...body,
          observed_at: new Date(Date.now() + 120000).toISOString(),
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await f.api('/v1/actions/' + randomUUID() + '/transaction-events', body))
        .statusCode,
    ).toBe(403);
    for (let index = 0; index < 32; index++)
      expect((await f.api(path, body)).statusCode).toBe(200);
    expect((await f.api(path, body)).statusCode).toBe(409);
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  });
  it('accepts late observations after signing expiry without reopening signing and denies revoked access', async () => {
    const f = await fixture();
    const receipt = (await f.request('1')).json();
    const path = '/v1/actions/' + receipt.action_id + '/transaction-events';
    const expired = Date.parse(receipt.expires_at) + 1000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(expired);
    const body = {
      event: 'confirmed',
      chain_id: 'eip155:84532',
      transaction_hash: '0x' + '3'.repeat(64),
      observed_at: new Date(expired).toISOString(),
    };
    expect((await f.api(path, body)).statusCode).toBe(200);
    expect(
      (
        await f.app.inject({
          url: path,
          headers: { authorization: await f.token('wallet:events:read') },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await f.api('/v1/actions/' + receipt.action_id + '/sign', {}))
        .statusCode,
    ).toBe(422);
    now.mockRestore();
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    await db.onboardingStore.transaction((state) => {
      state.grants[f.grant.grant_id].state = 'revoked';
    });
    db.close();
    expect(
      (await f.api(path, { ...body, observed_at: new Date().toISOString() }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          url: path,
          headers: { authorization: await f.token('wallet:events:read') },
        })
      ).statusCode,
    ).toBe(403);
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
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
      const eventPath =
        '/v1/actions/' + receipt.action_id + '/transaction-events';
      expect(
        (
          await f.api(eventPath, {
            event: 'submitted',
            chain_id: 'eip155:84532',
            transaction_hash: '0x' + '4'.repeat(64),
            observed_at: new Date().toISOString(),
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await f.app.inject({
            url: eventPath,
            headers: { authorization: await f.token('wallet:events:read') },
          })
        ).statusCode,
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

it('runs application-led policy, provisioning and delegated signing without user login, and fences hosted-store migration', async () => {
  const f = await fixture();
  const config = validateProviderConfiguration(
    JSON.parse(await readFile('docs/provider.config.example.json', 'utf8')),
  );
  config.activation = f.config.activation;
  config.financial = f.config.financial;
  config.policy.applications[0].permissions = [
    'account:read',
    'operations:request',
    'transfers:request',
  ];
  config.storage.directory = await folder();
  const db = openProviderDatabase({
    directory: config.storage.directory,
    initialize: true,
  });
  db.close();
  const app = await createConfiguredProvider(config);
  servers.push(app);
  const headers = {
    authorization: await f.token(),
    'idempotency-key': randomUUID(),
  };
  const policy = (
    await app.inject({ url: '/v1/access-policy', headers })
  ).json();
  expect(policy).toMatchObject({
    flow: 'application',
    provider_login_required: false,
    provider_review_required: false,
    transfer_terms: config.financial,
  });
  const user = {
    id: 'app-user',
    identity: {
      reference: 'test-evidence',
      level: 'verified',
      verified_at: new Date(Date.now() - 1000).toISOString(),
      fields: { country: 'ZA' },
    },
    consent: {
      reference: 'test-consent',
      granted_at: new Date(Date.now() - 1000).toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      policy_revision: policy.policy_revision,
      transfer_policy_revision: policy.transfer_policy_revision,
    },
  };
  const granted = await app.inject({
    method: 'POST',
    url: '/v1/access-requests',
    headers,
    payload: {
      mode: 'create',
      user,
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: ['account:read', 'operations:request', 'transfers:request'],
        },
      ],
    },
  });
  expect(granted.statusCode).toBe(200);
  expect(granted.json().status).toBe('granted');
  expect(granted.json()).not.toHaveProperty('consent_url');
  const accountId = granted.json().account_id;
  const post = (url: string, payload: object) =>
    app.inject({
      method: 'POST',
      url,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload,
    });
  expect(
    (await post('/v1/accounts/' + accountId + '/provision', {})).statusCode,
  ).toBe(200);
  const account = await app.inject({
    url: '/v1/accounts/' + accountId,
    headers,
  });
  expect(account.statusCode).toBe(200);
  expect(account.json()).toMatchObject({
    identity_source: 'application_attestation',
    evaluation_only: false,
  });
  const action = await post('/v1/transfer-authorizations', {
    account_id: accountId,
    recipient: config.financial!.recipients[0],
    amount: '1',
  });
  expect(action.statusCode).toBe(200);
  expect(
    (await post('/v1/actions/' + action.json().action_id + '/sign', {}))
      .statusCode,
  ).toBe(200);
  expect(
    (await post('/v1/access-grants/' + granted.json().grant_id + '/revoke', {}))
      .statusCode,
  ).toBe(200);
  expect(
    (await post('/v1/actions/' + action.json().action_id + '/sign', {}))
      .statusCode,
  ).toBe(403);
  expect((await app.inject({ url: '/onboarding/access' })).statusCode).toBe(
    404,
  );
  const changed = { ...config, storage: f.config.storage };
  await expect(createConfiguredProvider(changed)).rejects.toThrow(
    'Invalid provider configuration',
  );
});

async function generalFixture(contractOnly = false) {
  const t = await designatedFixture(),
    f = t.f;
  const calls = approvedCallsFixture(
    f.grant.account_id,
    f.wallet.address,
    f.execution!,
  );
  f.execution!.request = calls.request;
  f.config.approvedCalls = { policy: calls.policy, maxValiditySeconds: 300 };
  f.config.execution!.profile = 'approved-evm-executor-v1';
  f.config.policy.applications[0].permissions!.push('contracts:request');
  t.executorConfig.providers[0].contractCalls = calls.policy;
  t.executorConfig.providers[0].revision = '2';
  f.config.execution!.service!.providerRevision = '2';
  if (contractOnly) {
    delete f.config.financial;
    delete t.executorConfig.providers[0].token;
    delete f.config.execution!.rpc.tokenCodeHash;
    delete t.executorConfig.providers[0].rpc.tokenCodeHash;
  }
  await t.restart();
  const access = await f.api('/v1/access-requests', {
    mode: 'connect',
    account_id: f.grant.account_id,
    authorization_details: [
      {
        type: 'https://moovha.com/wallet/account-access',
        actions: ['account:read', 'contracts:request'],
      },
    ],
  });
  expect(access.statusCode, access.body).toBe(200);
  const requestId = access.json().request_id;
  expect(
    (await f.form('/onboarding/' + requestId, { decision: 'approve' }))
      .statusCode,
  ).toBe(302);
  expect(
    (
      await f.api('/v1/access-requests/' + requestId + '/identity', {
        vendor: 'didit',
        share_token: 'ephemeral-share',
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await f.form(
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
    await f.app.inject({
      url: '/v1/access-requests/' + requestId,
      headers: { authorization: await f.token() },
    })
  ).json();
  expect(grant.status).toBe('granted');
  expect(
    (await f.api('/v1/accounts/' + f.grant.account_id + '/provision', {}))
      .statusCode,
  ).toBe(200);
  const request = async (
    kind: 'contract-call' | 'swap' | 'vault-deposit' = 'contract-call',
    key?: string,
  ) => {
    const input =
      kind === 'contract-call'
        ? {
            account_id: f.grant.account_id,
            kind,
            calls: [
              {
                to: calls.policy.contracts[0].address,
                value: '0',
                data: '0x12345678',
              },
            ],
          }
        : kind === 'swap'
          ? {
              account_id: f.grant.account_id,
              kind,
              route: 'swap',
              amount_in: '50',
              minimum_out: '40',
              deadline: String(Math.floor(Date.now() / 1000) + 120),
            }
          : {
              account_id: f.grant.account_id,
              kind,
              route: 'vault',
              assets: '50',
              minimum_shares: '40',
            };
    const response = await f.api('/v1/actions/contract-calls', input, key);
    if (response.statusCode === 200) {
      calls.state.intent = response.json().intent;
      calls.state.digest = response.json().payload_hash;
    }
    return response;
  };
  return { ...t, calls, grant, request };
}

describe('approved EVM execution foundation', () => {
  it('retains an expired nonce after signing admission and keeps other account bindings private', async () => {
    const t = await generalFixture(),
      action = await t.request();
    expect(action.statusCode, action.body).toBe(200);
    const policy = await t.f.app.inject({
      url: '/v1/access-policy',
      headers: { authorization: await t.f.token() },
    });
    expect(policy.statusCode, policy.body).toBe(200);
    expect(policy.json().contract_call_terms.policy).not.toHaveProperty(
      'accounts',
    );
    expect(policy.json().action_policy_revision).toBe(
      policy.json().transfer_policy_revision,
    );
    expect(
      (await t.f.api('/v1/actions/' + action.json().action_id + '/execute', {}))
        .statusCode,
    ).toBe(200);
    const now = Date.now(),
      clock = vi.spyOn(Date, 'now').mockReturnValue(now + 301000);
    const another = await t.request();
    expect(another.statusCode).toBe(409);
    expect(t.calls.state.posts).toBe(1);
    clock.mockRestore();
  });

  it('releases an expired unsigned nonce only with durable evidence that no signing admission exists', async () => {
    const t = await generalFixture(),
      action = await t.request();
    expect(action.statusCode, action.body).toBe(200);
    const now = Date.now(),
      clock = vi.spyOn(Date, 'now').mockReturnValue(now + 301000);
    // HTTP token lifetime is independent; obtain a fresh token for the advanced clock.
    const token = await t.f.token();
    const next = await t.f.app.inject({
      method: 'POST',
      url: '/v1/actions/contract-calls',
      headers: { authorization: token, 'idempotency-key': randomUUID() },
      payload: {
        account_id: t.f.grant.account_id,
        kind: 'contract-call',
        calls: [
          {
            to: t.calls.policy.contracts[0].address,
            value: '0',
            data: '0x12345678',
          },
        ],
      },
    });
    expect(next.statusCode, next.body).toBe(200);
    expect(next.json().action_id).not.toBe(action.json().action_id);
    const db = openProviderDatabase({
      directory: t.f.config.storage.directory,
    });
    const previous = await db.onboardingStore.transaction(
      (state) => state.supportedActions![action.json().action_id],
    );
    db.close();
    expect(previous.nonceReleased).toBe(true);
    expect(previous.status).toBe('denied');
    clock.mockRestore();
  });

  it('supports a contract-only deployment without a token-transfer policy or token-code configuration', async () => {
    const t = await generalFixture(true),
      action = await t.request('vault-deposit');
    expect(action.statusCode, action.body).toBe(200);
    const executed = await t.f.api(
      '/v1/actions/' + action.json().action_id + '/execute',
      {},
    );
    expect(executed.statusCode, executed.body).toBe(200);
    expect(t.calls.state.posts).toBe(1);
  });
  it.each(['contract-call', 'swap', 'vault-deposit'] as const)(
    'coordinates approved %s calls through signed dispatch and verifies its exact finalized effects',
    async (kind) => {
      const t = await generalFixture();
      const action = await t.request(kind);
      expect(action.statusCode, action.body).toBe(200);
      expect(action.json().payload.primaryType).toBe('SafeTx');
      expect(
        (await t.f.api('/v1/actions/' + action.json().action_id + '/sign', {}))
          .statusCode,
      ).toBe(403);
      const executed = await t.f.api(
        '/v1/actions/' + action.json().action_id + '/execute',
        {},
      );
      expect(executed.statusCode, executed.body).toBe(200);
      expect(executed.json().dispatch_status).toBe('accepted');
      expect(t.calls.state.posts).toBe(1);
      t.calls.state.included = true;
      const response = await t.f.app.inject({
        url: '/v1/actions/' + action.json().action_id + '/execution',
        headers: {
          authorization: await t.f.token(),
          'execution-profile': 'approved-evm-executor-v1',
          'execution-profile-revision': '1',
        },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({
        verification: 'rpc-quorum',
        chain_status: 'finalized',
        outcome: 'succeeded',
        settlement: 'succeeded',
      });
      expect(t.calls.state.posts).toBe(1);
    },
  );
  it('retains the nonce and action on idempotent replay and rejects another action at that nonce', async () => {
    const t = await generalFixture(),
      key = randomUUID();
    const first = await t.request('contract-call', key),
      replay = await t.request('contract-call', key);
    expect(first.statusCode, first.body).toBe(200);
    expect(replay.json().action_id).toBe(first.json().action_id);
    const another = await t.request('contract-call');
    expect(another.statusCode).toBe(409);
    expect(t.calls.state.posts).toBe(0);
  });
  it('recovers lost designated-service acceptance after both services restart without another provider submission', async () => {
    const t = await generalFixture(),
      action = await t.request('swap');
    expect(action.statusCode, action.body).toBe(200);
    t.state.loseAfterHandoff = true;
    expect(
      (await t.f.api('/v1/actions/' + action.json().action_id + '/execute', {}))
        .statusCode,
    ).toBe(503);
    expect(t.calls.state.posts).toBe(1);
    t.state.loseAfterHandoff = false;
    await t.restart();
    t.calls.state.included = true;
    const read = await t.f.app.inject({
      url: '/v1/actions/' + action.json().action_id + '/execution',
      headers: {
        authorization: await t.f.token(),
        'execution-profile': 'approved-evm-executor-v1',
        'execution-profile-revision': '1',
      },
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json().settlement).toBe('succeeded');
    expect(t.calls.state.posts).toBe(1);
  });
  it('does not promote successful Safe execution into a verified swap without matching output effects', async () => {
    const t = await generalFixture(),
      action = await t.request('swap');
    expect(action.statusCode, action.body).toBe(200);
    expect(
      (await t.f.api('/v1/actions/' + action.json().action_id + '/execute', {}))
        .statusCode,
    ).toBe(200);
    t.calls.state.included = true;
    t.calls.state.minimumEffects = false;
    const read = await t.f.app.inject({
      url: '/v1/actions/' + action.json().action_id + '/execution',
      headers: {
        authorization: await t.f.token(),
        'execution-profile': 'approved-evm-executor-v1',
        'execution-profile-revision': '1',
      },
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json().settlement).toBe('pending');
    expect(read.json().verification).toBe('unverified');
  });
  it('rechecks current contract delegation during executor authority callbacks', async () => {
    const t = await generalFixture(),
      action = await t.request();
    expect(action.statusCode, action.body).toBe(200);
    t.state.beforeAuthority = async () => {
      const db = openProviderDatabase({
        directory: t.f.config.storage.directory,
      });
      await db.onboardingStore.transaction((state) => {
        state.grants[t.grant.grant_id].state = 'revoked';
      });
      db.close();
    };
    expect(
      (await t.f.api('/v1/actions/' + action.json().action_id + '/execute', {}))
        .statusCode,
    ).toBe(503);
    expect(t.calls.state.posts).toBe(0);
  });
  it('denies Safe owner disagreement before creating an approved signing action', async () => {
    const t = await generalFixture();
    t.calls.state.owner = Wallet.createRandom().address;
    const action = await t.request();
    expect(action.statusCode).toBe(503);
    expect(t.calls.state.posts).toBe(0);
  });
});
