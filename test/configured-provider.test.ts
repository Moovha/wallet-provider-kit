import { defaultSafeProvisioning } from '../src/provisioning/defaults.js';
import { safeProvisioningIdentity } from '../src/provisioning/safe.js';
import {
  defaultLocalExecution,
  localExecutionOrigin,
  localSponsorIds,
} from '../src/deployment/local-execution-contract.js';
import { runtimeApplicationId } from '../src/runtime-configuration/service.js';
import { replacementWire } from './helpers/replacements.js';
import { defaultReplacementPolicy } from '../src/execution/replacement.js';
import { buildApprovedCallIntent } from '../src/execution/approved-calls.js';
import { SafeExecutionQueue } from '../src/execution/queue.js';
import { OnboardingService } from '../src/onboarding/service.js';
import { QuorumExecutionObserver } from '../src/execution/chain.js';
import { WalletProviderError } from '../src/domain/signing.js';
import { approvedCallsFixture } from './helpers/approved-calls.js';
import { randomUUID, randomBytes } from 'node:crypto';
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
  Interface,
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

async function designatedFixture(withReplacement = false) {
  let replacement: ReturnType<typeof replacementWire> | undefined;
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
    beforeReplacementAuthority: undefined as
      | ((
          body: import('../src/executor/protocol.js').ExecutionAuthorityRequest,
        ) => Promise<void>)
      | undefined,
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
      if (withReplacement) {
        replacement = replacementWire(execution);
        execution.request = replacement.request;
        config.execution!.replacement = { ...defaultReplacementPolicy };
        config.execution!.recovery = {
          stuckAfterSeconds: 30,
          quarantineOnStuck: true,
        };
        executorConfig.providers[0].replacement = config.execution!.replacement;
        executorConfig.providers[0].recovery = config.execution!.recovery;
      }
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
            const body = options?.body
              ? JSON.parse(String(options.body))
              : undefined;
            if (body?.replacement)
              await state.beforeReplacementAuthority?.(body);
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
    get replacement() {
      return replacement;
    },
    get executor() {
      return executor;
    },
    get executorConfig() {
      return executorConfig;
    },
    useWallet(app: typeof walletApp) {
      walletApp = app;
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
    const initialized = JSON.parse(
      await readFile(join(dir, 'provider.config.json'), 'utf8'),
    );
    expect(initialized.backend.binding).toMatch(/^wallets-[0-9a-f-]{36}$/);
    expect(initialized.policy.applications[0].clientId).toMatch(
      /^application-[0-9a-f-]{36}$/,
    );
    expect(initialized.authorizationServer.clients[0].clientId).toBe(
      initialized.policy.applications[0].clientId,
    );

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
  it('composes the runtime registry with real JWT application/operator separation and live publication', async () => {
    const t = await fixture();
    t.config.runtimeConfiguration = {
      operators: [
        {
          issuer: t.config.oauth.issuer,
          clientId: 'runtime-operator',
          subject: 'configuration-operator',
        },
      ],
    };
    await t.restart();
    const running = t.app;
    const applicationToken = await t.token(
      'wallet:configuration:read wallet:configuration:propose',
    );
    const operatorToken = await t.token(
      'wallet:configuration:write',
      'runtime-operator',
      'configuration-operator',
    );
    const policy = {
      version: '1',
      enabled: false,
      chain_id: 'eip155:84532',
      contracts: [],
      maximum_calls: 1,
      maximum_native_value_wei: '0',
      max_validity_seconds: 120,
      claim_requirements: [],
    };
    const proposal = await t.app.inject({
      method: 'POST',
      url: '/v1/runtime-configuration/proposals',
      headers: {
        authorization: applicationToken,
        'idempotency-key': randomUUID(),
      },
      payload: { expected_revision: '0', policy },
    });
    expect(proposal.statusCode).toBe(200);
    const publication = await t.app.inject({
      method: 'POST',
      url: `/v1/runtime-configuration/proposals/${proposal.json().proposal_id}/publish`,
      headers: {
        authorization: operatorToken,
        'idempotency-key': randomUUID(),
      },
      payload: { expected_revision: '0' },
    });
    expect(publication.statusCode).toBe(200);
    const read = await t.app.inject({
      url: '/v1/runtime-configuration',
      headers: { authorization: applicationToken },
    });
    expect(read.json()).toMatchObject({
      active_revision: '1',
      authorizes_spending: false,
      publication: { policy: { enabled: false } },
    });
    expect(t.app).toBe(running);
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
    const forgedOperator = await t.token(
      'wallet:configuration:write',
      t.config.policy.applications[0].clientId,
      'configuration-operator',
    );
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: `/v1/runtime-configuration/proposals/${proposal.json().proposal_id}/publish`,
          headers: {
            authorization: forgedOperator,
            'idempotency-key': randomUUID(),
          },
          payload: { expected_revision: '0' },
        })
      ).statusCode,
    ).toBe(403);
  });
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

async function generalFixture(
  contractOnly = false,
  queue = false,
  replacements = false,
) {
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
  if (queue)
    f.config.execution!.safeQueue = {
      maxDepthPerSafe: 20,
      maxWaitSeconds: 300,
    };
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
  const bounded = replacements
    ? replacementWire(
        { ...f.execution!, request: calls.request },
        () => calls.state.included,
      )
    : undefined;
  if (bounded) {
    f.execution!.request = bounded.request;
    f.config.execution!.replacement = { ...defaultReplacementPolicy };
    f.config.execution!.recovery = {
      stuckAfterSeconds: 30,
      quarantineOnStuck: true,
    };
    t.executorConfig.providers[0].replacement = f.config.execution!.replacement;
    t.executorConfig.providers[0].recovery = f.config.execution!.recovery;
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
  return { ...t, calls, grant, request, bounded };
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

function queueInput(t: Awaited<ReturnType<typeof generalFixture>>) {
  return {
    account_id: t.f.grant.account_id,
    kind: 'contract-call' as const,
    calls: [
      {
        to: t.calls.policy.contracts[0].address,
        value: '0',
        data: '0x12345678',
      },
    ],
  };
}
async function queueWorker(t: Awaited<ReturnType<typeof generalFixture>>) {
  const database = openProviderDatabase({
    directory: t.f.config.storage.directory,
  });
  const revision = await database.onboardingStore.transaction(
    (state) => state.deploymentBindings!['service-v1'].activeRevision!,
  );
  const onboarding = new OnboardingService(
    t.f.config.policy,
    database.onboardingStore,
    [
      {
        vendor: 'didit',
        policyFingerprint: 'offline',
        importShared: async () => {
          throw new Error('Unused offline boundary');
        },
        read: async () => {
          throw new Error('Unused offline boundary');
        },
      },
    ],
    injected.backend,
    fingerprint([t.f.config.financial ?? null, t.f.config.approvedCalls]),
  );
  const actions = new SupportedActions(
    onboarding,
    database,
    t.f.config.financial,
    revision,
    t.f.config.approvedCalls,
  );
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test', 'https://secondary.example.test'],
    t.f.config.execution!.rpc.genesisHash,
    10000,
  );
  const execution = {
    async refresh(id: string) {
      const response = await t.f.app.inject({
        url: '/v1/actions/' + id + '/execution',
        headers: {
          authorization: await t.f.token(),
          'execution-profile': 'approved-evm-executor-v1',
          'execution-profile-revision': '1',
        },
      });
      if (response.statusCode !== 200)
        throw new WalletProviderError(
          response.statusCode === 403
            ? 'wallet_authorization_denied'
            : 'wallet_attempt_unavailable',
        );
    },
    async execute(
      context: import('../src/domain/principal.js').AuthorityContext,
      id: string,
    ) {
      const response = await t.f.api(
        '/v1/actions/' + id + '/execute',
        {},
        context.idempotencyKey,
      );
      if (response.statusCode !== 200)
        throw new WalletProviderError(
          response.statusCode === 403
            ? 'wallet_authorization_denied'
            : 'wallet_attempt_unavailable',
        );
      return response.json() as import('../src/execution/types.js').ExecutionReceipt;
    },
  };
  const queue = new SafeExecutionQueue(
    actions,
    database,
    execution,
    (binding, owner) => observer.contractNonce(binding, owner),
    t.f.config.execution!.safeQueue!,
    300,
  );
  return { queue, database };
}
function recordQueueSignature(t: Awaited<ReturnType<typeof generalFixture>>) {
  vi.mocked(injected.backend!.signTypedData).mockImplementation(
    async (_account, action) => {
      t.calls.state.digest = action.payload_hash;
      t.calls.state.intent = buildApprovedCallIntent(
        t.calls.policy,
        queueInput(t),
        String(action.payload.message.nonce),
        action.expires_at,
      );
      return t.f.wallet.signTypedData(
        action.payload.domain,
        action.payload.types,
        action.payload.message,
      );
    },
  );
}
async function queueRead(
  t: Awaited<ReturnType<typeof generalFixture>>,
  id: string,
) {
  return t.f.app.inject({
    url: '/v1/contract-call-requests/' + id,
    headers: { authorization: await t.f.token() },
  });
}
describe('durable Safe request queue with authenticated execution', () => {
  it('bounds a concurrent burst, preserves FIFO and dispatches one head across independent SQLite connections and overlapping workers', async () => {
    const t = await generalFixture(true, true);
    recordQueueSignature(t);
    const requests = await Promise.all(
      Array.from({ length: 25 }, () =>
        t.f.api('/v1/contract-call-requests', queueInput(t)),
      ),
    );
    expect(
      requests.filter((response) => response.statusCode === 202),
    ).toHaveLength(20);
    expect(
      requests
        .filter((response) => response.statusCode !== 202)
        .every((response) => [409, 503].includes(response.statusCode)),
    ).toBe(true);
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(0);
    const a = await queueWorker(t),
      b = await queueWorker(t);
    try {
      await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          (index % 2 ? a : b).queue.process(),
        ),
      );
      expect(t.calls.state.posts).toBe(1);
      expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
      const records = await a.database.onboardingStore.transaction((state) =>
        Object.values(state.safeRequests!).sort(
          (x, y) => x.sequence - y.sequence,
        ),
      );
      expect(records.map((entry) => entry.sequence)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
      expect(records.filter((entry) => entry.actionId)).toHaveLength(1);
      expect(records[0].status).toBe('executing');
      expect((await t.request()).statusCode).toBe(409);
      const status = await queueRead(t, records[0].id);
      expect(status.statusCode, status.body).toBe(200);
      expect(status.json().action_id).toBe(records[0].actionId);
    } finally {
      a.database.close();
      b.database.close();
    }
  });
  it('binds enqueue replays, rejects scope-only execution and never lets status reads advance work', async () => {
    const t = await generalFixture(true, true),
      key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        t.f.api('/v1/contract-call-requests', queueInput(t), key),
      ),
    );
    expect(responses.every((response) => response.statusCode === 202)).toBe(
      true,
    );
    expect(
      new Set(responses.map((response) => response.json().request_id)).size,
    ).toBe(1);
    expect(
      (
        await t.f.api(
          '/v1/contract-call-requests',
          {
            ...queueInput(t),
            calls: [{ ...queueInput(t).calls[0], value: '1' }],
          },
          key,
        )
      ).statusCode,
    ).toBe(409);
    const denied = await t.f.app.inject({
      method: 'POST',
      url: '/v1/contract-call-requests',
      headers: {
        authorization: await t.f.token('wallet:actions'),
        'idempotency-key': randomUUID(),
      },
      payload: queueInput(t),
    });
    expect(denied.statusCode).toBe(403);
    for (let index = 0; index < 3; index++)
      expect(
        (await queueRead(t, responses[0].json().request_id)).json().status,
      ).toBe('queued');
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(0);
    expect(t.calls.state.posts).toBe(0);
  });
  it('cancels unsigned followers and fences cancellation once signing has been admitted', async () => {
    const t = await generalFixture(true, true);
    recordQueueSignature(t);
    const first = await t.f.api('/v1/contract-call-requests', queueInput(t)),
      second = await t.f.api('/v1/contract-call-requests', queueInput(t));
    expect(
      (
        await t.f.api(
          '/v1/contract-call-requests/' + second.json().request_id + '/cancel',
          {},
        )
      ).json().status,
    ).toBe('cancelled');
    const w = await queueWorker(t);
    try {
      await w.queue.process();
      expect(t.calls.state.posts).toBe(1);
      const cancel = await t.f.api(
        '/v1/contract-call-requests/' + first.json().request_id + '/cancel',
        {},
      );
      expect(cancel.statusCode, cancel.body).toBe(409);
      expect((await queueRead(t, first.json().request_id)).json().status).toBe(
        'executing',
      );
      expect((await queueRead(t, second.json().request_id)).json().status).toBe(
        'cancelled',
      );
    } finally {
      w.database.close();
    }
  });
  it('recovers a crash after action insertion without duplicating the action and can cancel it while unsigned', async () => {
    const t = await generalFixture(true, true),
      response = await t.f.api('/v1/contract-call-requests', queueInput(t));
    const original = SupportedActions.prototype.requestCalls;
    vi.spyOn(SupportedActions.prototype, 'requestCalls').mockImplementationOnce(
      async function (this: SupportedActions, ...args) {
        await original.apply(this, args);
        throw new WalletProviderError('wallet_attempt_unavailable', 'unknown');
      },
    );
    const w = await queueWorker(t);
    try {
      await w.queue.process();
      const before = await w.database.onboardingStore.transaction(
        (state) => state.safeRequests![response.json().request_id],
      );
      expect(before.actionId).toBeUndefined();
      const cancelled = await t.f.api(
        '/v1/contract-call-requests/' + before.id + '/cancel',
        {},
      );
      expect(cancelled.statusCode, cancelled.body).toBe(200);
      expect(cancelled.json().status).toBe('cancelled');
      const actions = await w.database.onboardingStore.transaction((state) =>
        Object.values(state.supportedActions!).filter((entry) => entry.intent),
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].nonceReleased).toBe(true);
      expect(actions[0].status).toBe('denied');
      expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(0);
    } finally {
      w.database.close();
    }
  });
  it('expires unsigned requests and rechecks revoked delegation before creating a signing action', async () => {
    const t = await generalFixture(true, true),
      response = await t.f.api('/v1/contract-call-requests', queueInput(t));
    const w = await queueWorker(t);
    try {
      await w.database.onboardingStore.transaction((state) => {
        state.grants[t.grant.grant_id].state = 'revoked';
      });
      await w.queue.process();
      expect(
        (
          await w.database.onboardingStore.transaction(
            (state) => state.safeRequests![response.json().request_id],
          )
        ).status,
      ).toBe('cancelled');
      expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(0);
      expect(t.calls.state.posts).toBe(0);
    } finally {
      w.database.close();
    }
    const e = await generalFixture(true, true),
      queued = await e.f.api('/v1/contract-call-requests', queueInput(e)),
      worker = await queueWorker(e);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 301000);
    try {
      await worker.queue.process();
      expect(
        (
          await worker.database.onboardingStore.transaction(
            (state) => state.safeRequests![queued.json().request_id],
          )
        ).status,
      ).toBe('expired');
      expect(e.calls.state.posts).toBe(0);
    } finally {
      clock.mockRestore();
      worker.database.close();
    }
  });
  it('retains an uncertain head through restart and advances only after independent finalized success', async () => {
    const t = await generalFixture(true, true);
    recordQueueSignature(t);
    const first = await t.f.api('/v1/contract-call-requests', queueInput(t)),
      second = await t.f.api('/v1/contract-call-requests', queueInput(t));
    let w = await queueWorker(t);
    t.state.loseAfterHandoff = true;
    await w.queue.process();
    expect(t.calls.state.posts).toBe(1);
    w.database.close();
    t.state.loseAfterHandoff = false;
    await t.restart();
    w = await queueWorker(t);
    try {
      await w.queue.process();
      expect(t.calls.state.posts).toBe(1);
      expect(
        (await queueRead(t, second.json().request_id)).json().action_id,
      ).toBeUndefined();
      t.calls.state.included = true;
      await w.queue.process();
      expect((await queueRead(t, first.json().request_id)).json().status).toBe(
        'succeeded',
      );
      expect((await queueRead(t, second.json().request_id)).json().status).toBe(
        'queued',
      );
      // The next head reads the advanced Safe nonce; it never reserves a speculative future nonce.
      t.calls.state.included = false;
      t.calls.state.nonce = '1';
      await w.queue.process();
      const next = await w.database.onboardingStore.transaction(
        (state) =>
          state.supportedActions![
            state.safeRequests![second.json().request_id].actionId!
          ],
      );
      expect(next.intent!.nonce).toBe('1');
      expect(t.calls.state.posts).toBe(2);
    } finally {
      w.database.close();
    }
  });
});

it('serializes duplicate enqueue admission across independent operating-system processes', async () => {
  const t = await generalFixture(true, true),
    key = randomUUID();
  const { spawn } = await import('node:child_process');
  const data = JSON.stringify({
    config: t.f.config,
    input: queueInput(t),
    context: {
      idempotencyKey: key,
      principal: {
        issuer: t.f.config.oauth.issuer,
        subject: 'application-service',
        clientId: t.f.config.policy.applications[0].clientId,
        scopes: ['wallet:actions', 'wallet:execute', 'wallet:sign'],
      },
    },
  });
  const results = await Promise.all(
    Array.from(
      { length: 6 },
      () =>
        new Promise<boolean>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ['--import', 'tsx', 'test/helpers/safe-queue-worker.ts'],
            { stdio: ['pipe', 'pipe', 'pipe'] },
          );
          let output = '';
          child.stdout.on('data', (chunk) => (output += String(chunk)));
          child.stderr.resume();
          child.once('error', reject);
          child.once('close', (code) =>
            code === 0
              ? resolve(JSON.parse(output).accepted)
              : reject(new Error('Offline queue process failed')),
          );
          child.stdin.end(data);
        }),
    ),
  );
  expect(results).toEqual(Array(6).fill(true));
  const db = openProviderDatabase({ directory: t.f.config.storage.directory });
  try {
    expect(
      await db.onboardingStore.transaction(
        (state) => Object.values(state.safeRequests!).length,
      ),
    ).toBe(1);
    expect(
      await db.onboardingStore.transaction(
        (state) =>
          Object.values(state.supportedActions ?? {}).filter(
            (entry) => entry.intent,
          ).length,
      ),
    ).toBe(0);
  } finally {
    db.close();
  }
}, 15000);

async function sponsorPoolFixture(enableRecovery = false) {
  const t = await designatedFixture(),
    configuration = t.f.config.execution!;
  configuration.sponsorPool = {
    strategy: 'round-robin',
    maxInFlightPerSponsor: 2,
  };
  configuration.service!.providerRevision = '3';
  const second = {
    ...structuredClone(configuration.sponsors[0]),
    accountId: randomUUID(),
    binding: { address: Wallet.createRandom().address, bindingRevision: '1' },
  };
  configuration.sponsors.push(second);
  const provider = t.executorConfig.providers[0];
  provider.revision = '3';
  provider.sponsorPool = configuration.sponsorPool;
  if (enableRecovery) {
    configuration.recovery = { stuckAfterSeconds: 30, quarantineOnStuck: true };
    provider.recovery = configuration.recovery;
  }
  provider.sponsors.push({
    ...structuredClone(second),
    binding: {
      ...second.binding,
      relayerId: 'sponsor-relayer-two',
      signerId: 'sponsor-signer-two',
    },
  });
  const original = t.f.execution!.request;
  const transactions = new Map<string, Record<string, unknown>>();
  const submitted: string[] = [];
  t.f.execution!.request = (async (input, options) => {
    const url = new URL(String(input));
    if (url.origin !== t.f.execution!.configuration.relayer.url)
      return original(input, options);
    const relayer = provider.sponsors.find(
      (entry) => url.pathname.split('/')[4] === entry.binding.relayerId,
    );
    if (!relayer) return original(input, options);
    if (url.pathname.endsWith('/transactions') && options?.method === 'POST') {
      const body = JSON.parse(String(options.body)),
        id = randomUUID();
      const nonce = submitted.filter(
        (address) => address === relayer.binding.address,
      ).length;
      submitted.push(relayer.binding.address);
      const value = {
        nonce,
        id,
        relayer_id: relayer.binding.relayerId,
        from: relayer.binding.address,
        to: body.to,
        value: body.value,
        data: body.data,
        gas_limit: body.gas_limit,
        max_fee_per_gas: body.max_fee_per_gas,
        status: 'submitted',
        hash: '0x' + id.replaceAll('-', '').repeat(2),
      };
      transactions.set(id, value);
      return new Response(JSON.stringify({ success: true, data: value }));
    }
    if (url.pathname.includes('/transactions/'))
      return new Response(
        JSON.stringify({
          success: true,
          data: transactions.get(url.pathname.split('/').at(-1)!),
        }),
      );
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: relayer.binding.relayerId,
          signer_id: relayer.binding.signerId,
          address: relayer.binding.address,
          network: 'base-sepolia',
          network_type: 'evm',
          paused: false,
          system_disabled: false,
          policies: { gas_limit_estimation: false, gas_price_cap: 3000000000 },
        },
      }),
    );
  }) as typeof fetch;
  await t.restart();
  return { ...t, submitted, transactions };
}
describe('durable application sponsor pools', () => {
  it('round-robins a concurrent burst with atomic per-address limits and preserves selected payers across retry and restart', async () => {
    const t = await sponsorPoolFixture();
    const requests = await Promise.all(
      Array.from({ length: 12 }, () => t.f.request('1')),
    );
    expect(requests.every((response) => response.statusCode === 200)).toBe(
      true,
    );
    const results = await Promise.all(
      requests.map((response) =>
        t.f.api('/v1/actions/' + response.json().action_id + '/execute', {}),
      ),
    );
    expect(
      results.filter((response) => response.statusCode === 200),
    ).toHaveLength(4);
    expect(t.submitted).toHaveLength(4);
    for (const sponsor of t.f.config.execution!.sponsors)
      expect(
        t.submitted.filter((address) => address === sponsor.binding.address),
      ).toHaveLength(2);
    const db = openProviderDatabase({
      directory: t.f.config.storage.directory,
    });
    let before: unknown;
    try {
      before = await db.onboardingStore.transaction((state) =>
        Object.values(state.supportedActions!)
          .filter((entry) => entry.execution)
          .map((entry) => ({
            action: entry.approval.action.action_id,
            execution: entry.execution!.executionId,
            sponsor: entry.execution!.sponsorAccountId,
            hash: entry.execution!.planHash,
          })),
      );
    } finally {
      db.close();
    }
    await t.restart();
    const accepted = requests.filter(
      (_, index) => results[index].statusCode === 200,
    );
    await Promise.all(
      accepted.map((response) =>
        t.f.api('/v1/actions/' + response.json().action_id + '/execute', {}),
      ),
    );
    expect(t.submitted).toHaveLength(4);
    const after = openProviderDatabase({
      directory: t.f.config.storage.directory,
    });
    try {
      expect(
        await after.onboardingStore.transaction((state) =>
          Object.values(state.supportedActions!)
            .filter((entry) => entry.execution)
            .map((entry) => ({
              action: entry.approval.action.action_id,
              execution: entry.execution!.executionId,
              sponsor: entry.execution!.sponsorAccountId,
              hash: entry.execution!.planHash,
            })),
        ),
      ).toEqual(before);
    } finally {
      after.close();
    }
    const blocked = await t.f.api(
      '/v1/actions/' +
        requests.find((_, index) => results[index].statusCode !== 200)!.json()
          .action_id +
        '/execute',
      {},
    );
    expect([409, 503]).toContain(blocked.statusCode);
    expect(t.submitted).toHaveLength(4);
  });
  it('rejects duplicate client sponsors without an explicit pool and never shares a payer across applications', async () => {
    const t = await sponsorPoolFixture(),
      changed = structuredClone(t.f.config);
    delete changed.execution!.sponsorPool;
    expect(() => validateProviderConfiguration(changed)).toThrow();
    changed.execution!.sponsorPool = {
      strategy: 'round-robin',
      maxInFlightPerSponsor: 2,
    };
    changed.execution!.sponsors[1].binding.address =
      changed.execution!.sponsors[0].binding.address;
    expect(() => validateProviderConfiguration(changed)).toThrow();
  });
});

it('allows a different Safe head to dispatch while another Safe is paused at its authenticated authority callback', async () => {
  const t = await generalFixture(true, true),
    secondAccount = randomUUID();
  const safe = {
    ...structuredClone(t.calls.policy.accounts[0]),
    accountId: secondAccount,
    address: Wallet.createRandom().address,
  };
  t.calls.policy.accounts.push(safe);
  t.executorConfig.providers[0].revision = '3';
  t.f.config.execution!.service!.providerRevision = '3';
  await t.restart();
  const db = openProviderDatabase({ directory: t.f.config.storage.directory });
  try {
    // Trusted offline acceptance records for two accounts controlled by the same fixture owner.
    const policyRevision = fingerprint([null, t.f.config.approvedCalls]);
    await db.onboardingStore.transaction((state) => {
      const grant = state.grants[t.grant.grant_id],
        request = state.requests[grant.requestId];
      grant.state = 'active';
      grant.transferPolicyRevision = policyRevision;
      request.transferPolicyRevision = policyRevision;
      const account = structuredClone(state.accounts[t.f.grant.account_id]);
      account.id = secondAccount;
      state.accounts[secondAccount] = account;
      const newGrant = structuredClone(grant);
      newGrant.id = randomUUID();
      newGrant.accountId = secondAccount;
      const newRequest = structuredClone(request);
      newRequest.id = randomUUID();
      newRequest.accountId = secondAccount;
      newRequest.grantId = newGrant.id;
      state.requests[newRequest.id] = newRequest;
      newGrant.requestId = newRequest.id;
      state.grants[newGrant.id] = newGrant;
    });
  } finally {
    db.close();
  }
  recordQueueSignature(t);
  const first = await t.f.api('/v1/contract-call-requests', queueInput(t)),
    second = await t.f.api('/v1/contract-call-requests', {
      ...queueInput(t),
      account_id: secondAccount,
    });
  expect(first.statusCode, first.body).toBe(202);
  expect(second.statusCode, second.body).toBe(202);
  let release!: () => void,
    entered = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.state.beforeAuthority = async () => {
    if (entered++ === 0) await gate;
  };
  const w = await queueWorker(t),
    processing = w.queue.process();
  try {
    await vi.waitFor(() => expect(t.calls.state.posts).toBe(1));
    release();
    await processing;
    expect(t.calls.state.posts).toBe(2);
    expect((await queueRead(t, first.json().request_id)).json().status).toBe(
      'executing',
    );
    expect((await queueRead(t, second.json().request_id)).json().status).toBe(
      'executing',
    );
  } finally {
    release();
    await processing;
    w.database.close();
  }
});

it('rejects cancellation racing with an admitted signature without skipping the Safe head', async () => {
  const t = await generalFixture(true, true);
  recordQueueSignature(t);
  const first = await t.f.api('/v1/contract-call-requests', queueInput(t));
  let release!: () => void,
    entered = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sign = vi
    .mocked(injected.backend!.signTypedData)
    .getMockImplementation()!;
  vi.mocked(injected.backend!.signTypedData).mockImplementation(
    async (...args) => {
      entered = true;
      await gate;
      return sign(...args);
    },
  );
  const w = await queueWorker(t),
    processing = w.queue.process();
  try {
    await vi.waitFor(() => expect(entered).toBe(true));
    expect(
      (
        await t.f.api(
          '/v1/contract-call-requests/' + first.json().request_id + '/cancel',
          {},
        )
      ).statusCode,
    ).toBe(409);
    release();
    await processing;
    expect(t.calls.state.posts).toBe(1);
  } finally {
    release();
    await processing;
    w.database.close();
  }
});

it('automatically executes a queued head in the configured service without a status read or application broadcast', async () => {
  const t = await generalFixture(true, true);
  t.f.config.execution!.pollIntervalSeconds = 5;
  await t.restart();
  recordQueueSignature(t);
  const response = await t.f.api('/v1/contract-call-requests', queueInput(t));
  expect(response.statusCode, response.body).toBe(202);
  await vi.waitFor(() => expect(t.calls.state.posts).toBe(1), {
    timeout: 7500,
    interval: 100,
  });
  expect((await queueRead(t, response.json().request_id)).json().status).toBe(
    'executing',
  );
  expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
}, 15000);

it('fences a corrupted queue action link before it can release a Safe head', async () => {
  const t = await generalFixture(true, true);
  recordQueueSignature(t);
  const request = await t.f.api('/v1/contract-call-requests', queueInput(t)),
    w = await queueWorker(t);
  try {
    await w.queue.process();
    expect(t.calls.state.posts).toBe(1);
    await w.database.onboardingStore.transaction((state) => {
      state.safeRequests![request.json().request_id].actionId = randomUUID();
    });
    await expect(w.queue.process()).rejects.toThrow();
    expect((await queueRead(t, request.json().request_id)).statusCode).toBe(
      403,
    );
    expect(t.calls.state.posts).toBe(1);
  } finally {
    w.database.close();
  }
});

it('rejects substitution of a renewed grant between queued authority and action materialization', async () => {
  const t = await generalFixture(true, true),
    request = await t.f.api('/v1/contract-call-requests', queueInput(t)),
    w = await queueWorker(t);
  const original = SupportedActions.prototype.requestCalls;
  vi.spyOn(SupportedActions.prototype, 'requestCalls').mockImplementationOnce(
    async function (this: SupportedActions, ...args) {
      await w.database.onboardingStore.transaction((state) => {
        const previous = state.grants[t.grant.grant_id];
        previous.state = 'revoked';
        const next = structuredClone(previous);
        next.id = randomUUID();
        next.state = 'active';
        const consent = structuredClone(state.requests[previous.requestId]);
        consent.id = randomUUID();
        consent.grantId = next.id;
        state.requests[consent.id] = consent;
        next.requestId = consent.id;
        state.grants[next.id] = next;
      });
      return original.apply(this, args);
    },
  );
  try {
    await w.queue.process();
    expect(
      await w.database.onboardingStore.transaction(
        (state) => state.safeRequests![request.json().request_id].status,
      ),
    ).toBe('cancelled');
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(0);
    expect(t.calls.state.posts).toBe(0);
  } finally {
    w.database.close();
  }
});

it('quarantines a stuck payer durably, routes new executions to another member and never treats reconciliation as dispatch', async () => {
  const t = await sponsorPoolFixture(true),
    first = await t.f.request('1');
  const id = first.json().action_id;
  expect((await t.f.api('/v1/actions/' + id + '/execute', {})).statusCode).toBe(
    200,
  );
  const db = openProviderDatabase({ directory: t.f.config.storage.directory });
  let payer: string;
  try {
    payer = await db.onboardingStore.transaction((state) => {
      const execution = state.supportedActions![id].execution!;
      execution.startedAt = Date.now() - 31000;
      return execution.sponsorAddress!;
    });
  } finally {
    db.close();
  }
  const reconciliation = await t.f.app.inject({
    method: 'POST',
    url: '/v1/actions/' + id + '/reconcile',
    headers: {
      authorization: await t.f.token(),
      'idempotency-key': randomUUID(),
      'execution-profile': 'erc3009-executor-v1',
      'execution-profile-revision': '1',
    },
    payload: {},
  });
  expect(reconciliation.statusCode, reconciliation.body).toBe(200);
  expect(reconciliation.json().recovery).toMatchObject({
    state: 'suspected-stuck',
    reason: 'transaction-not-visible',
    quarantined: true,
    sponsor_nonce: '0',
  });
  expect(t.submitted).toHaveLength(1);
  await t.restart();
  const second = await t.f.request('1');
  expect(
    (await t.f.api('/v1/actions/' + second.json().action_id + '/execute', {}))
      .statusCode,
  ).toBe(200);
  expect(t.submitted).toHaveLength(2);
  expect(t.submitted[1]).not.toBe(payer!);
  const repeat = await t.f.app.inject({
    method: 'POST',
    url: '/v1/actions/' + id + '/reconcile',
    headers: {
      authorization: await t.f.token(),
      'idempotency-key': randomUUID(),
      'execution-profile': 'erc3009-executor-v1',
      'execution-profile-revision': '1',
    },
    payload: {},
  });
  expect(repeat.statusCode, repeat.body).toBe(200);
  expect(repeat.json().recovery.quarantined).toBe(true);
  expect(t.submitted).toHaveLength(2);
});

it('clears wallet and executor quarantines only after exact finalized recovery and retains them during evidence outages', async () => {
  const t = await designatedFixture();
  vi.stubEnv('PAYER_WEBHOOK_URL', 'https://payer-events.example.test/ingest');
  vi.stubEnv(
    'PAYER_WEBHOOK_KEY',
    'whsec_' + randomBytes(32).toString('base64'),
  );
  t.f.config.operations = {
    pollIntervalSeconds: 5,
    lowBalanceWei: '1000000000000000000000000',
    webhooks: [
      {
        id: 'alerts',
        endpoint: { env: 'PAYER_WEBHOOK_URL' },
        signingSecrets: [{ env: 'PAYER_WEBHOOK_KEY' }],
      },
    ],
  };
  t.executorConfig.operations = t.f.config.operations;
  t.f.config.execution!.recovery = {
    stuckAfterSeconds: 30,
    quarantineOnStuck: true,
  };
  t.f.config.execution!.service!.providerRevision = '2';
  t.executorConfig.providers[0].revision = '2';
  t.executorConfig.providers[0].recovery = t.f.config.execution!.recovery;
  await t.restart();
  const action = await t.f.request('1'),
    id = action.json().action_id;
  expect((await t.f.api('/v1/actions/' + id + '/execute', {})).statusCode).toBe(
    200,
  );
  const walletDb = openProviderDatabase({
    directory: t.f.config.storage.directory,
  });
  try {
    await walletDb.onboardingStore.transaction((state) => {
      state.supportedActions![id].execution!.startedAt = Date.now() - 31000;
    });
  } finally {
    walletDb.close();
  }
  const rawExecutor = new DatabaseSync(
    join(t.executorConfig.storage.directory, 'provider.sqlite'),
  );
  const rows = rawExecutor
    .prepare(
      "SELECT id,record FROM onboarding_records WHERE collection='executorDispatches'",
    )
    .all();
  const record = JSON.parse(String(rows[0].record));
  record.startedAt = Date.now() - 31000;
  rawExecutor
    .prepare(
      "UPDATE onboarding_records SET record=? WHERE collection='executorDispatches' AND id=?",
    )
    .run(JSON.stringify(record), String(rows[0].id));
  rawExecutor.close();
  const inspect = async () =>
    t.f.app.inject({
      url: '/v1/actions/' + id + '/execution',
      headers: {
        authorization: await t.f.token(),
        'execution-profile': 'erc3009-executor-v1',
        'execution-profile-revision': '1',
      },
    });
  const stuck = await inspect();
  expect(stuck.statusCode, stuck.body).toBe(200);
  expect(stuck.json().recovery.quarantined).toBe(true);
  await vi.waitFor(async () => {
    for (const app of [t.f.app, t.executor]) {
      const health = await app.inject('/health/ready');
      expect(health.statusCode).toBe(200);
      expect(health.json().operations).toMatchObject({
        status: 'degraded',
        affected_payers: 1,
        low_balance_payers: 1,
      });
      expect(JSON.stringify(health.json())).not.toContain(
        t.f.config.execution!.sponsors[0].binding.address,
      );
    }
  });
  const eventDb = openProviderDatabase({
    directory: t.f.config.storage.directory,
  });
  try {
    const events = await eventDb.onboardingStore.transaction((state) =>
      Object.values(state.operations!['service-v1'].deliveries),
    );
    expect(events.some((entry) => entry.event.data.affected)).toBe(true);
  } finally {
    eventDb.close();
  }

  t.f.execution!.state.mutate = (method, result) =>
    method === 'eth_getTransactionCount' ? null : result;
  const unavailable = await inspect();
  expect(unavailable.statusCode, unavailable.body).toBe(200);
  expect(unavailable.json().recovery.quarantined).toBe(true);
  t.f.execution!.state.mutate = undefined;
  t.f.execution!.state.included = true;
  t.f.execution!.state.finality = 'finalized';
  const recovered = await inspect();
  expect(recovered.statusCode, recovered.body).toBe(200);
  for (const app of [t.f.app, t.executor])
    expect((await app.inject('/health/ready')).json().operations).toMatchObject(
      { affected_payers: 0, low_balance_payers: 1 },
    );
  expect(recovered.json().recovery).toMatchObject({
    state: 'finalized',
    quarantined: false,
  });
  expect(recovered.json().settlement).toBe('succeeded');
  expect(t.f.execution!.state.posts).toBe(1);
  const db = openProviderDatabase({ directory: t.f.config.storage.directory });
  try {
    expect(
      await db.onboardingStore.transaction((state) =>
        Object.values(state.sponsorQuarantines!).flat(),
      ),
    ).toHaveLength(0);
  } finally {
    db.close();
  }
  const executorDb = new DatabaseSync(
    join(t.executorConfig.storage.directory, 'provider.sqlite'),
  );
  try {
    const quarantines = executorDb
      .prepare(
        "SELECT record FROM onboarding_records WHERE collection='executorQuarantines'",
      )
      .all();
    expect(
      quarantines.flatMap((row) => JSON.parse(String(row.record)).executionIds),
    ).toHaveLength(0);
  } finally {
    executorDb.close();
  }
});

async function ageReplacement(
  t: Awaited<ReturnType<typeof designatedFixture>>,
  actionId: string,
) {
  const wallet = openProviderDatabase({
    directory: t.f.config.storage.directory,
  });
  try {
    await wallet.onboardingStore.transaction((state) => {
      state.supportedActions![actionId].execution!.startedAt =
        Date.now() - 31000;
    });
  } finally {
    wallet.close();
  }
  const database = new DatabaseSync(
    join(t.executorConfig.storage.directory, 'provider.sqlite'),
  );
  try {
    const rows = database
      .prepare(
        "SELECT id,record FROM onboarding_records WHERE collection='executorDispatches'",
      )
      .all();
    for (const row of rows) {
      const record = JSON.parse(String(row.record));
      record.startedAt = Date.now() - 31000;
      database
        .prepare(
          "UPDATE onboarding_records SET record=? WHERE collection='executorDispatches' AND id=?",
        )
        .run(JSON.stringify(record), String(row.id));
    }
  } finally {
    database.close();
  }
}
it.each([false, true])(
  'the default background worker preserves authority and fixed caps with original handoff response loss=%s',
  async (lost) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const t = await designatedFixture(true),
        action = await t.f.request('1'),
        id = action.json().action_id;
      t.state.loseAfterHandoff = lost;
      const executed = await t.f.api('/v1/actions/' + id + '/execute', {});
      expect(executed.statusCode, executed.body).toBe(lost ? 503 : 200);
      t.state.loseAfterHandoff = false;
      await ageReplacement(t, id);
      const phases: string[] = [];
      t.state.beforeReplacementAuthority = async (body) => {
        phases.push(body.replacement!.phase);
      };
      await vi.advanceTimersByTimeAsync(15000);
      await vi.waitFor(() => expect(t.replacement!.state.puts).toBe(1), {
        timeout: 3000,
      });
      expect(phases).toEqual(['prepare', 'dispatch']);
      const status = await t.f.app.inject({
        url: '/v1/actions/' + id + '/execution',
        headers: {
          authorization: await t.f.token(),
          'execution-profile': 'erc3009-executor-v1',
          'execution-profile-revision': '1',
        },
      });
      expect(status.statusCode, status.body).toBe(200);
      expect(status.json().replacement).toMatchObject({
        state: 'accepted',
        attempts: 1,
      });
      const database = openProviderDatabase({
        directory: t.f.config.storage.directory,
      });
      try {
        const stored = await database.onboardingStore.transaction(
          (state) => state.supportedActions![id].execution!,
        );
        expect(stored.plan!.sponsor.maxFeePerGas).toBe('3000000000');
        expect(stored.replacements).toHaveLength(1);
      } finally {
        database.close();
      }
      expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
      t.f.execution!.state.included = true;
      t.f.execution!.state.finality = 'finalized';
      await vi.advanceTimersByTimeAsync(15000);
      await vi.waitFor(
        () => {
          const database = new DatabaseSync(
            join(t.executorConfig.storage.directory, 'provider.sqlite'),
          );
          try {
            const row = database
              .prepare(
                "SELECT record FROM onboarding_records WHERE collection='executorDispatches'",
              )
              .get()!;
            expect(
              JSON.parse(String(row.record)).replacementStatus?.state,
            ).toBe('settled');
          } finally {
            database.close();
          }
        },
        { timeout: 3000 },
      );
      const finalized = await t.f.app.inject({
        url: '/v1/actions/' + id + '/execution',
        headers: {
          authorization: await t.f.token(),
          'execution-profile': 'erc3009-executor-v1',
          'execution-profile-revision': '1',
        },
      });
      expect(finalized.statusCode, finalized.body).toBe(200);
      expect(finalized.json()).toMatchObject({
        settlement: 'succeeded',
        replacement: { state: 'settled', attempts: 1 },
      });
      expect(t.replacement!.state.puts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  },
);
it.each(['grant', 'owner', 'identity', 'consent', 'approval'] as const)(
  'denies automatic replacement when current %s changes at the final authority callback',
  async (condition) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const t = await designatedFixture(true),
        action = await t.f.request('1'),
        id = action.json().action_id;
      expect(
        (await t.f.api('/v1/actions/' + id + '/execute', {})).statusCode,
      ).toBe(200);
      await ageReplacement(t, id);
      let mutated = false;
      t.state.beforeReplacementAuthority = async (body) => {
        if (body.replacement?.phase !== 'dispatch') return;
        const database = openProviderDatabase({
          directory: t.f.config.storage.directory,
        });
        try {
          await database.onboardingStore.transaction((state) => {
            const action = state.supportedActions![id],
              grant = state.grants[t.f.grant.grant_id],
              request = state.requests[grant.requestId],
              account = state.accounts[grant.accountId];
            if (condition === 'grant') grant.state = 'revoked';
            if (condition === 'owner') account.owner = 'changed-owner';
            if (condition === 'identity')
              account.acceptedUntil = Date.now() - 1;
            if (condition === 'consent') delete request.consent;
            if (condition === 'approval') action.status = 'denied';
          });
        } finally {
          database.close();
        }
        mutated = true;
      };
      await vi.advanceTimersByTimeAsync(15000);
      await vi.waitFor(() => expect(mutated).toBe(true), { timeout: 3000 });
      expect(t.replacement!.state.puts).toBe(0);
      expect(t.f.execution!.state.posts).toBe(1);
      expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  },
);

it.each(['contract-call', 'swap', 'vault-deposit'] as const)(
  'replaces the exact approved Safe %s without signing another owner action',
  async (kind) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const t = await generalFixture(false, false, true);
      const action = await t.request(kind),
        id = action.json().action_id;
      expect(action.statusCode, action.body).toBe(200);
      const execution = await t.f.api('/v1/actions/' + id + '/execute', {});
      expect(execution.statusCode, execution.body).toBe(200);
      const original = t.calls.state.data;
      await ageReplacement(t, id);
      await vi.advanceTimersByTimeAsync(15000);
      await vi.waitFor(
        () => {
          const db = new DatabaseSync(
            join(t.executorConfig.storage.directory, 'provider.sqlite'),
            { readOnly: true },
          );
          try {
            const row = db
              .prepare(
                "SELECT record FROM onboarding_records WHERE collection='executorDispatches'",
              )
              .get()!;
            const record = JSON.parse(String(row.record));
            expect(
              t.bounded!.state.puts,
              JSON.stringify({
                recovery: record.recovery?.reason,
                replacement: record.replacementStatus,
                authorityCalls: t.state.authorityCalls,
              }),
            ).toBe(1);
          } finally {
            db.close();
          }
        },
        { timeout: 3000 },
      );
      expect(t.bounded!.state.data).toBe(original);
      expect(t.bounded!.state.target.toLowerCase()).toBe(
        t.calls.state.target.toLowerCase(),
      );
      expect(t.calls.state.posts).toBe(1);
      expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  },
);

/** Offline application-led wallet and authenticated executor, with independent persistent stores. */
async function runtimeFinancialFixture(queue = false, local = false) {
  const t = await designatedFixture();
  const config = validateProviderConfiguration(
    JSON.parse(await readFile('docs/provider.config.example.json', 'utf8')),
  );
  config.policy.provider = t.f.config.policy.provider;
  config.policy.applications[0].issuer = t.f.config.oauth.issuer;
  config.policy.applications[0].clientId =
    t.f.config.policy.applications[0].clientId;
  config.policy.applications[0].permissions = [
    'account:read',
    'operations:request',
    'contracts:request',
  ];
  config.oauth = t.f.config.oauth;
  config.activation = t.f.config.activation;
  config.storage.directory = await folder();
  const initial = openProviderDatabase({
    directory: config.storage.directory,
    initialize: true,
  });
  initial.close();
  let app = await createConfiguredProvider(config);
  servers.push(app);
  const headers = { authorization: await t.f.token() };
  const post = (url: string, payload: object) =>
    app.inject({
      method: 'POST',
      url,
      headers: {
        ...headers,
        'idempotency-key': randomUUID(),
        ...(url.endsWith('/execute')
          ? {
              'execution-profile': 'approved-evm-executor-v1',
              'execution-profile-revision': '1',
            }
          : {}),
      },
      payload,
    });
  const readTerms = async () => {
    const result = await app.inject({ url: '/v1/access-policy', headers });
    expect(result.statusCode, result.body).toBe(200);
    return result.json();
  };
  const firstTerms = await readTerms();
  const user = {
    id: 'runtime-user',
    identity: {
      reference: 'runtime-identity',
      level: 'verified',
      verified_at: new Date(Date.now() - 1000).toISOString(),
      fields: { country: 'ZA' } as Record<string, string>,
    },
    consent: {
      reference: 'runtime-consent',
      granted_at: new Date(Date.now() - 1000).toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      policy_revision: firstTerms.policy_revision,
      action_policy_revision: undefined as string | undefined,
    },
  };
  const created = await post('/v1/access-requests', {
    mode: 'create',
    user,
    authorization_details: [
      {
        type: 'https://moovha.com/wallet/account-access',
        actions: ['account:read', 'operations:request'],
      },
    ],
  });
  expect(created.statusCode, created.body).toBe(200);
  const accountId: string = created.json().account_id;
  expect(
    (await post('/v1/accounts/' + accountId + '/provision', {})).statusCode,
  ).toBe(200);
  const calls = approvedCallsFixture(
    accountId,
    t.f.wallet.address,
    t.f.execution!,
  );
  t.f.execution!.request = calls.request;
  config.approvedCalls = { policy: calls.policy, maxValiditySeconds: 300 };
  config.execution = {
    ...t.f.config.execution!,
    profile: 'approved-evm-executor-v1',
  };
  if (queue) {
    config.execution.safeQueue = { maxDepthPerSafe: 10, maxWaitSeconds: 300 };
    config.execution.pollIntervalSeconds = 5;
  }
  config.runtimeConfiguration = {
    authorizeContracts: true,
    operators: [
      {
        issuer: config.oauth.issuer,
        clientId: 'runtime-operator',
        subject: 'runtime-operator',
      },
    ],
  };
  t.executorConfig.providers[0].contractCalls = calls.policy;
  t.executorConfig.providers[0].runtimeContracts = true;
  t.executorConfig.providers[0].revision = '2';
  config.execution.service!.providerRevision = '2';
  t.f.config.execution!.service!.providerRevision = '2';
  await t.restart();
  if (local) {
    config.localExecution = defaultLocalExecution();
    config.execution.local = true;
    delete config.execution.service;
    config.execution.relayer = {
      url: localExecutionOrigin,
      apiKey: config.localExecution.apiKey,
    };
    for (const sponsor of config.execution.sponsors)
      sponsor.binding = {
        ...localSponsorIds(sponsor.accountId),
        address: sponsor.binding.address,
        bindingRevision: '1',
      };
    vi.stubEnv('LOCAL_EXECUTION_API_KEY', randomBytes(32).toString('hex'));
    const fixtureRequest = calls.request;
    const managed = localSponsorIds(config.execution.sponsors[0].accountId);
    t.f.execution!.request = (async (input, options) => {
      const url = new URL(String(input));
      if (url.origin !== 'http://local-execution:8080')
        return fixtureRequest(input, options);
      const path = url.pathname.replace(managed.relayerId, 'sponsor-relayer');
      const response = await fixtureRequest(
        t.f.execution!.configuration.relayer!.url + path,
        options,
      );
      return new Response(
        (await response.text())
          .replaceAll('sponsor-relayer', managed.relayerId)
          .replaceAll('sponsor-signer', managed.signerId),
        { status: response.status },
      );
    }) as typeof fetch;
  }
  const restart = async () => {
    await app.close();
    app = await createConfiguredProvider(config);
    servers.push(app);
    t.useWallet(app);
  };
  await restart();
  const { runtimeApplicationId } =
    await import('../src/runtime-configuration/service.js');
  const applicationId = runtimeApplicationId(
    config.oauth.issuer,
    config.policy.applications[0].clientId,
  );
  const operatorToken = await t.f.token(
    'wallet:configuration:write',
    'runtime-operator',
    'runtime-operator',
  );
  let revision = '0';
  const abi = new Interface([
    'function customMethod(uint256,address)',
    'function anotherMethod(bytes32)',
  ]);
  const document = {
    version: '1' as const,
    enabled: true,
    chain_id: 'eip155:84532' as const,
    maximum_calls: 2,
    maximum_native_value_wei: '10',
    max_validity_seconds: 120,
    contracts: [
      {
        address: Wallet.createRandom().address,
        code_hash: keccak256('0x6001600055'),
        methods: [
          {
            signature: 'customMethod(uint256,address)',
            maximum_value_wei: '2',
          },
        ],
      },
    ],
    claim_requirements: [
      { name: 'country', allowed_values: ['ZA'], max_age_seconds: 3600 },
      { name: 'risk', allowed_values: ['low'], max_age_seconds: 120 },
    ],
  };
  // RPC fixtures use the same bytecode hash for all configured contracts.
  document.contracts[0].code_hash = calls.policy.contracts[0].codeHash;
  const publish = async () => {
    const result = await app.inject({
      method: 'POST',
      url:
        '/v1/runtime-configuration/applications/' +
        applicationId +
        '/revisions',
      headers: {
        authorization: operatorToken,
        'idempotency-key': randomUUID(),
      },
      payload: { expected_revision: revision, policy: document },
    });
    expect(result.statusCode, result.body).toBe(200);
    revision = result.json().revision;
    return result.json();
  };
  const consent = async () => {
    const terms = await readTerms();
    user.identity.fields.risk = 'low';
    user.identity.verified_at = new Date(Date.now() - 1000).toISOString();
    user.consent.action_policy_revision = terms.action_policy_revision;
    user.consent.reference = randomUUID();
    return post('/v1/access-requests', {
      mode: 'connect',
      account_id: accountId,
      user,
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: ['account:read', 'operations:request', 'contracts:request'],
        },
      ],
    });
  };
  const input = () => ({
    account_id: accountId,
    kind: 'contract-call' as const,
    calls: [
      {
        to: document.contracts[0].address,
        value: '1',
        data: abi.encodeFunctionData(
          document.contracts[0].methods[0].signature,
          document.contracts[0].methods[0].signature.startsWith('custom')
            ? [7, t.f.wallet.address]
            : ['0x' + '1'.repeat(64)],
        ),
      },
    ],
  });
  const request = async (body = input()) => {
    const result = await post('/v1/actions/contract-calls', body);
    if (result.statusCode === 200) {
      calls.state.intent = result.json().intent;
      calls.state.digest = result.json().payload_hash;
    }
    return result;
  };
  await publish();
  expect((await consent()).json().status).toBe('granted');
  return {
    t,
    config,
    operatorToken,
    calls,
    user,
    document,
    post,
    request,
    input,
    publish,
    consent,
    readTerms,
    restart,
    get app() {
      return app;
    },
  };
}

it('executes newly registered application methods without restarting either service and retains submitted evidence after publication', async () => {
  const f = await runtimeFinancialFixture();
  const running = f.app,
    executor = f.t.executor;
  const terms = await f.readTerms();
  expect(terms.required_fields).toEqual(['country', 'risk']);
  expect(terms.runtime_contract_terms.revision).toBe('1');
  expect(terms.contract_call_terms.maxValiditySeconds).toBe(120);
  expect(terms.contract_call_terms.policy).not.toHaveProperty('accounts');
  const action = await f.request();
  expect(action.statusCode, action.body).toBe(200);
  const execution = await f.post(
    '/v1/actions/' + action.json().action_id + '/execute',
    {},
  );
  expect(execution.statusCode, execution.body).toBe(200);
  expect(execution.json().dispatch_status).toBe('accepted');
  expect(f.calls.state.posts).toBe(1);
  f.document.contracts[0].address = Wallet.createRandom().address;
  f.document.contracts[0].methods = [
    { signature: 'anotherMethod(bytes32)', maximum_value_wei: '2' },
  ];
  await f.publish();
  expect((await f.request()).statusCode).toBe(403);
  // Already dispatched work remains observable under account-read authority.
  const observed = await f.app.inject({
    url: '/v1/actions/' + action.json().action_id + '/execution',
    headers: {
      authorization: await f.t.f.token(),
      'execution-profile': 'approved-evm-executor-v1',
      'execution-profile-revision': '1',
    },
  });
  expect(observed.statusCode, observed.body).toBe(200);
  expect((await f.consent()).json().status).toBe('granted');
  f.calls.state.nonce = '1';
  const next = await f.request();
  expect(next.statusCode, next.body).toBe(200);
  expect(f.app).toBe(running);
  expect(f.t.executor).toBe(executor);
  const db = openProviderDatabase({ directory: f.config.storage.directory });
  const snapshots = await db.onboardingStore.transaction((state) =>
    Object.values(state.supportedActions!).map(
      (action) => action.runtimePolicy?.revision,
    ),
  );
  db.close();
  expect(snapshots).toEqual(['1', '2']);
  await f.restart();
  expect(
    (
      await f.app.inject({
        url: '/v1/transfer-authorizations/' + next.json().action_id,
        headers: { authorization: await f.t.f.token() },
      })
    ).statusCode,
  ).toBe(200);
});

it.each([
  'method value',
  'batch count',
  'malformed arguments',
  'claim value',
  'claim age',
  'disabled',
  'consent revision',
] as const)('rejects runtime %s before signing or submission', async (kind) => {
  const f = await runtimeFinancialFixture();
  const body = f.input();
  if (kind === 'method value') body.calls[0].value = '3';
  if (kind === 'batch count') body.calls.push(body.calls[0], body.calls[0]);
  if (kind === 'malformed arguments') body.calls[0].data += '00';
  if (kind === 'claim value' || kind === 'claim age') {
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    await db.onboardingStore.transaction((state) => {
      const request = Object.values(state.requests).find(
        (request) => request.input.user?.identity.fields.risk,
      )!;
      if (kind === 'claim value')
        request.input.user!.identity.fields.risk = 'high';
      else
        request.input.user!.identity.verified_at = new Date(
          Date.now() - 121000,
        ).toISOString();
    });
    db.close();
  }
  if (kind === 'disabled') {
    f.document.enabled = false;
    await f.publish();
  }
  if (kind === 'consent revision') {
    await f.publish();
  }
  const result = await f.request(body);
  expect(result.statusCode, result.body).toBe(403);
  expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  expect(f.calls.state.posts).toBe(0);
});

it('blocks a runtime policy change at the final executor callback and retains the original action snapshot', async () => {
  const f = await runtimeFinancialFixture();
  const action = await f.request();
  expect(action.statusCode, action.body).toBe(200);
  f.t.state.beforeAuthority = async () => {
    f.t.state.beforeAuthority = undefined;
    await f.publish();
  };
  await f.post('/v1/actions/' + action.json().action_id + '/execute', {});
  expect(f.calls.state.posts).toBe(0);
  const db = openProviderDatabase({ directory: f.config.storage.directory });
  expect(
    await db.onboardingStore.transaction(
      (state) =>
        state.supportedActions![action.json().action_id].runtimePolicy
          ?.revision,
    ),
  ).toBe('1');
  db.close();
});

it('rechecks the runtime publication after signing admission and before the wallet backend effect', async () => {
  const f = await runtimeFinancialFixture();
  const action = await f.request();
  expect(action.statusCode).toBe(200);
  const authorize = SupportedActions.prototype.authorize;
  let calls = 0;
  vi.spyOn(SupportedActions.prototype, 'authorize').mockImplementation(
    async function (this: SupportedActions, context, approval) {
      if (++calls === 3) await f.publish();
      return authorize.call(this, context, approval);
    },
  );
  const result = await f.post(
    '/v1/actions/' + action.json().action_id + '/execute',
    {},
  );
  expect(result.statusCode).toBe(403);
  expect(calls).toBeGreaterThanOrEqual(3);
  expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  expect(f.calls.state.posts).toBe(0);
});
it('caps queued runtime requests to the publication lifetime and binds their materialized snapshot', async () => {
  const f = await runtimeFinancialFixture(true);
  const queued = await f.post('/v1/contract-call-requests', f.input());
  expect(queued.statusCode, queued.body).toBe(202);
  expect(Date.parse(queued.json().expires_at)).toBeLessThanOrEqual(
    Date.now() + 120000,
  );
  const id = queued.json().request_id;
  await vi.waitFor(() => expect(f.calls.state.posts).toBe(1), {
    timeout: 7500,
    interval: 100,
  });
  const result = await f.app.inject({
    url: '/v1/contract-call-requests/' + id,
    headers: { authorization: await f.t.f.token() },
  });
  expect(result.statusCode, result.body).toBe(200);
  expect(result.json().status).toBe('executing');
}, 15000);

async function walletCallsFixture(local = false) {
  let worker: SafeExecutionQueue;
  vi.spyOn(SafeExecutionQueue.prototype, 'start').mockImplementation(function (
    this: SafeExecutionQueue,
  ) {
    worker = this;
  });
  const f = await runtimeFinancialFixture(true, local);
  vi.mocked(injected.backend!.signTypedData).mockImplementation(
    async (_account, action) => {
      f.calls.state.digest = action.payload_hash;
      return f.t.f.wallet.signTypedData(
        action.payload.domain,
        action.payload.types,
        action.payload.message,
      );
    },
  );
  const accountId = f.input().account_id;
  let correlation = 0;
  const rpc = async (
    method: string,
    params: unknown[],
    authorization?: string,
  ) => {
    const id = ++correlation;
    const response = await f.app.inject({
      method: 'POST',
      url: '/v1/accounts/' + accountId + '/wallet',
      headers: { authorization: authorization ?? (await f.t.f.token()) },
      payload: { jsonrpc: '2.0', id, method, params },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().id).toBe(id);
    return response.json();
  };
  const batch = () => ({
    version: '2.0.0',
    chainId: '0x14a34',
    from: f.calls.policy.accounts[0].address,
    atomicRequired: true,
    calls: f.input().calls.map((call) => ({ ...call, value: '0x1' })),
  });
  return {
    ...f,
    get app() {
      return f.app;
    },
    rpc,
    batch,
    process: () => worker!.process(),
  };
}

describe('EIP-5792 runtime wallet calls', () => {
  it('discovers the Safe sender, submits an atomic batch once and returns verified standard receipts across restart and policy changes', async () => {
    const f = await walletCallsFixture();
    expect(
      (
        await f.rpc('wallet_getCapabilities', [
          f.calls.policy.accounts[0].address,
          ['0x01', '0x14A34'],
        ])
      ).error?.code,
    ).toBe(-32602);
    expect(
      (
        await f.rpc('wallet_getCapabilities', [
          f.calls.policy.accounts[0].address,
          ['0x1', '0x14A34'],
        ])
      ).result,
    ).toEqual({ '0x14a34': { atomic: { status: 'supported' } } });
    expect(
      (
        await f.rpc('wallet_getCapabilities', [
          f.calls.policy.accounts[0].address,
          ['0x1'],
        ])
      ).result,
    ).toEqual({});
    const batch = f.batch();
    batch.calls.push({ ...batch.calls[0] });
    const sent = await f.rpc('wallet_sendCalls', [batch]);
    expect(sent.error).toBeUndefined();
    const id = sent.result.id;
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await f.rpc('wallet_getCallsStatus', [id])).result).toMatchObject({
      version: '2.0.0',
      id,
      chainId: '0x14a34',
      status: 100,
      atomic: true,
    });
    expect(f.calls.state.posts).toBe(0);
    await f.process();
    expect(f.calls.state.posts).toBe(1);
    expect((await f.rpc('wallet_getCallsStatus', [id])).result.status).toBe(
      100,
    );
    f.calls.state.included = true;
    const included = await f.rpc('wallet_getCallsStatus', [id]);
    expect(included.error).toBeUndefined();
    expect(included.result).toMatchObject({
      status: 200,
      atomic: true,
      receipts: [
        {
          transactionHash: f.t.f.execution!.transactionHash,
          blockNumber: '0x65',
          gasUsed: '0x186a0',
          status: '0x1',
          logs: [],
        },
      ],
    });
    await f.publish();
    await f.restart();
    expect((await f.rpc('wallet_getCallsStatus', [id])).result.status).toBe(
      200,
    );
    expect(f.calls.state.posts).toBe(1);
  });
  it('atomically rejects duplicate caller IDs across concurrent sends and restart, without a second queued effect', async () => {
    const f = await walletCallsFixture(),
      batch = { ...f.batch(), id: '0x' + 'a'.repeat(64) };
    const responses = await Promise.all([
      f.rpc('wallet_sendCalls', [batch]),
      f.rpc('wallet_sendCalls', [batch]),
    ]);
    expect(responses.filter((value) => value.result).length).toBe(1);
    expect(responses.find((value) => value.error)?.error.code).toBe(5720);
    await f.restart();
    expect((await f.rpc('wallet_sendCalls', [batch])).error.code).toBe(5720);
    await f.process();
    expect(f.calls.state.posts).toBe(1);
  });
  it.each([
    'chain',
    'version',
    'required capability',
    'call capability',
    'sender',
    'leading zero value',
    'too many calls',
    'method',
    'claim age',
    'scope',
  ] as const)('denies %s before admission or signing', async (kind) => {
    const f = await walletCallsFixture();
    const batch: Record<string, unknown> = f.batch();
    if (kind === 'chain') batch.chainId = '0x1';
    if (kind === 'version') batch.version = '1.0';
    if (kind === 'required capability')
      batch.capabilities = {
        paymasterService: { url: 'https://untrusted.example.test' },
      };
    if (kind === 'call capability')
      (batch.calls as object[])[0] = {
        ...(batch.calls as object[])[0],
        capabilities: { unknown: {} },
      };
    if (kind === 'sender') batch.from = f.t.f.wallet.address;
    if (kind === 'leading zero value')
      (batch.calls as { value: string }[])[0].value = '0x01';
    if (kind === 'too many calls')
      batch.calls = Array(17).fill((batch.calls as unknown[])[0]);
    if (kind === 'method')
      (batch.calls as { data: string }[])[0].data = '0x12345678';
    if (kind === 'claim age') {
      const db = openProviderDatabase({
        directory: f.config.storage.directory,
      });
      await db.onboardingStore.transaction((state) => {
        for (const request of Object.values(state.requests))
          if (request.input.user?.identity.fields.risk)
            request.input.user.identity.verified_at = new Date(
              Date.now() - 121000,
            ).toISOString();
      });
      db.close();
    }
    const token =
      kind === 'scope'
        ? await f.t.f.token('wallet:access:read wallet:execute:read')
        : undefined;
    const result = await f.rpc('wallet_sendCalls', [batch], token);
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(
      kind === 'chain'
        ? 5710
        : kind.includes('capability')
          ? 5700
          : kind === 'version' || kind === 'leading zero value'
            ? -32602
            : kind === 'too many calls'
              ? 5740
              : 4100,
    );
    await f.process();
    expect(f.calls.state.posts).toBe(0);
    expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  });
  it('ignores optional capabilities without fetching their URLs and fences foreign status callers', async () => {
    const f = await walletCallsFixture();
    const batch = {
      ...f.batch(),
      atomicRequired: false,
      id: 'application-chosen-id',
      capabilities: {
        paymasterService: {
          optional: true,
          url: 'https://untrusted.example.test',
        },
      },
    };
    const sent = await f.rpc('wallet_sendCalls', [batch]);
    expect(sent.result).toEqual({ id: 'application-chosen-id' });
    expect((await f.rpc('wallet_getCallsStatus', ['missing'])).error.code).toBe(
      5730,
    );
    const foreign = await f.t.f.token(undefined, undefined, 'another-subject');
    expect(
      (await f.rpc('wallet_getCallsStatus', [batch.id], foreign)).error.code,
    ).toBe(4100);
    expect((await f.rpc('wallet_showCallsStatus', [batch.id])).error.code).toBe(
      4200,
    );
    await f.process();
    expect(f.calls.state.posts).toBe(1);
  });
  it('returns offchain failure for unsigned policy cancellation and preserves uncertain dispatched states', async () => {
    const f = await walletCallsFixture();
    const sent = await f.rpc('wallet_sendCalls', [f.batch()]);
    await f.publish();
    await f.process();
    expect(
      (await f.rpc('wallet_getCallsStatus', [sent.result.id])).result.status,
    ).toBe(400);
    expect(f.calls.state.posts).toBe(0);
  });
  it('reports complete Safe call failure using the verified outer transaction receipt, not a success or a partial batch', async () => {
    const f = await walletCallsFixture();
    const sent = await f.rpc('wallet_sendCalls', [f.batch()]);
    await f.process();
    f.calls.state.included = true;
    f.calls.state.safeSuccess = false;
    const result = await f.rpc('wallet_getCallsStatus', [sent.result.id]);
    expect(result.result).toMatchObject({
      status: 500,
      atomic: true,
      receipts: [{ status: '0x1' }],
    });
    expect(f.calls.state.posts).toBe(1);
  });
  it('downgrades an included batch on a reorg and refuses mismatching receipt metadata from RPC operators', async () => {
    const f = await walletCallsFixture();
    const sent = await f.rpc('wallet_sendCalls', [f.batch()]);
    await f.process();
    f.calls.state.included = true;
    const heads = (method: string, result: unknown, params: unknown[]) =>
      method === 'eth_getBlockByNumber' &&
      ['safe', 'finalized'].includes(String(params[0]))
        ? { ...(result as object), number: '0x64' }
        : result;
    f.calls.state.mutate = (method, result, _origin, params) =>
      heads(method, result, params);
    expect(
      (await f.rpc('wallet_getCallsStatus', [sent.result.id])).result.status,
    ).toBe(200);
    f.calls.state.mutate = (method, result, origin, params) =>
      method === 'eth_getTransactionReceipt' && origin.includes('secondary')
        ? { ...(result as object), gasUsed: '0x1' }
        : heads(method, result, params);
    const disputed = await f.rpc('wallet_getCallsStatus', [sent.result.id]);
    expect(disputed.result.status).toBe(100);
    expect(disputed.result.receipts).toBeUndefined();
    f.calls.state.mutate = undefined;
    f.calls.state.included = false;
    expect(
      (await f.rpc('wallet_getCallsStatus', [sent.result.id])).result.status,
    ).toBe(100);
  });
});

it('returns JSON-RPC parse/envelope/method errors without admitting malformed wallet batches', async () => {
  const f = await walletCallsFixture();
  const headers = {
    authorization: await f.t.f.token(),
    'content-type': 'application/json',
  };
  const url = '/v1/accounts/' + f.input().account_id + '/wallet';
  const malformed = await f.app.inject({
    method: 'POST',
    url,
    headers,
    payload: '{',
  });
  expect(malformed.statusCode, malformed.body).toBe(200);
  expect(malformed.json()).toEqual({
    jsonrpc: '2.0',
    id: null,
    error: { code: -32700, message: 'Parse error' },
  });
  for (const payload of [
    { jsonrpc: '2.0', method: 'wallet_sendCalls', params: [f.batch()] },
    [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'wallet_sendCalls',
        params: [f.batch()],
      },
    ],
  ]) {
    const response = await f.app.inject({
      method: 'POST',
      url,
      headers,
      payload,
    });
    expect(response.json().error.code).toBe(-32600);
  }
  expect((await f.rpc('unsupported_method', [])).error.code).toBe(-32601);
  expect((await f.rpc('wallet_getCallsStatus', [])).error.code).toBe(-32602);
  const anonymous = await f.app.inject({
    method: 'POST',
    url,
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'wallet_sendCalls',
      params: [f.batch()],
    },
  });
  expect(anonymous.statusCode).toBe(401);
  await f.process();
  expect(f.calls.state.posts).toBe(0);
});

it('retains an uncertain wallet-call dispatch through polling and restart without resubmitting', async () => {
  const f = await walletCallsFixture();
  f.calls.state.lostResponse = true;
  const sent = await f.rpc('wallet_sendCalls', [
    { ...f.batch(), id: 'uncertain-batch' },
  ]);
  await f.process();
  expect(f.calls.state.posts).toBe(1);
  expect(
    (await f.rpc('wallet_getCallsStatus', [sent.result.id])).result.status,
  ).toBe(100);
  await f.restart();
  expect(
    (await f.rpc('wallet_getCallsStatus', [sent.result.id])).result.status,
  ).toBe(100);
  await f.process();
  expect(f.calls.state.posts).toBe(1);
});
it('refuses wallet-call status when its retained execution plan no longer matches the journal hash', async () => {
  const f = await walletCallsFixture();
  const sent = await f.rpc('wallet_sendCalls', [f.batch()]);
  await f.process();
  f.calls.state.included = true;
  expect(
    (await f.rpc('wallet_getCallsStatus', [sent.result.id])).result.status,
  ).toBe(200);
  const database = openProviderDatabase({
    directory: f.config.storage.directory,
  });
  await database.onboardingStore.transaction((state) => {
    const execution = Object.values(state.supportedActions!)[0].execution!;
    execution.plan!.scanFromBlock = '0';
  });
  database.close();
  const result = await f.rpc('wallet_getCallsStatus', [sent.result.id]);
  expect(result.error.code).toBe(4900);
  expect(f.calls.state.posts).toBe(1);
});
it('rejects aggregate calldata beyond the Safe profile limit before queue admission or signing', async () => {
  const f = await walletCallsFixture();
  f.document.contracts[0].methods = [
    { signature: 'blob(bytes)', maximum_value_wei: '0' },
  ];
  await f.publish();
  await f.consent();
  const data = new Interface(['function blob(bytes)']).encodeFunctionData(
    'blob',
    ['0x' + '11'.repeat(1680)],
  );
  const batch = {
    version: '2.0.0',
    chainId: '0x14a34',
    atomicRequired: true,
    calls: [
      { to: f.document.contracts[0].address, value: '0x0', data },
      { to: f.document.contracts[0].address, value: '0x0', data },
    ],
  };
  expect(
    Buffer.byteLength(
      JSON.stringify([
        (await f.readTerms()).runtime_contract_terms,
        batch.calls.map((call) => ({ ...call, value: '0' })),
      ]),
    ),
  ).toBeLessThan(8192);
  const result = await f.rpc('wallet_sendCalls', [batch]);
  expect(result.error.code).toBe(5740);
  const db = openProviderDatabase({ directory: f.config.storage.directory });
  expect(
    await db.onboardingStore.transaction(
      (state) => Object.keys(state.safeRequests ?? {}).length,
    ),
  ).toBe(0);
  db.close();
  expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  expect(f.calls.state.posts).toBe(0);
});

it('lists wallet batches with owner-bound application access and a separately authorized provider ledger', async () => {
  const f = await walletCallsFixture();
  const sent = await f.rpc('wallet_sendCalls', [
    { ...f.batch(), id: 'operator-ui-batch' },
  ]);
  expect(sent.result.id).toBe('operator-ui-batch');
  const list = (authorization: string) =>
    f.app.inject({
      method: 'GET',
      url: '/v1/runtime-configuration/batches',
      headers: { authorization },
    });
  const appToken = await f.t.f.token('wallet:execute:read');
  const applicationList = await list(appToken);
  expect(applicationList.statusCode, applicationList.body).toBe(200);
  expect(applicationList.json().batches).toEqual([
    expect.objectContaining({
      id: 'operator-ui-batch',
      status: 100,
      queue_stage: 'queued',
    }),
  ]);
  expect(applicationList.body).not.toContain('consentReference');
  expect(applicationList.body).not.toContain('principal');
  const providerList = await list(f.operatorToken);
  expect(providerList.statusCode, providerList.body).toBe(200);
  expect(providerList.json()).toEqual(applicationList.json());
  const otherSubject = await list(
    await f.t.f.token('wallet:execute:read', undefined, 'different-subject'),
  );
  expect(otherSubject.statusCode).toBe(200);
  expect(otherSubject.json().batches).toEqual([]);
  expect(
    (await list(await f.t.f.token('wallet:configuration:write'))).statusCode,
  ).toBe(403);
  await f.publish();
  expect((await list(appToken)).json().batches).toHaveLength(1);
  expect(f.calls.state.posts).toBe(0);
  const db = openProviderDatabase({ directory: f.config.storage.directory });
  try {
    await db.onboardingStore.transaction((state) => {
      for (const grant of Object.values(state.grants)) grant.state = 'revoked';
    });
  } finally {
    await db.close();
  }
  expect((await list(appToken)).json().batches).toEqual([]);
  expect((await list(f.operatorToken)).json().batches).toHaveLength(1);
  expect(f.calls.state.posts).toBe(0);
});

it('requires renewed financial consent after a provider-allowed application automatically registers a method', async () => {
  const f = await runtimeFinancialFixture();
  const appId = runtimeApplicationId(
    f.config.oauth.issuer,
    f.config.policy.applications[0].clientId,
  );
  const review = await f.app.inject({
    method: 'POST',
    url: `/v1/runtime-configuration/applications/${appId}/review`,
    headers: {
      authorization: f.operatorToken,
      'idempotency-key': randomUUID(),
    },
    payload: {
      expected_revision: '1',
      expected_review_revision: '0',
      mode: 'automatic',
    },
  });
  expect(review.statusCode, review.body).toBe(200);
  f.document.contracts[0].methods.unshift({
    signature: 'anotherMethod(bytes32)',
    maximum_value_wei: '2',
  });
  const proposed = await f.app.inject({
    method: 'POST',
    url: '/v1/runtime-configuration/proposals',
    headers: {
      authorization: await f.t.f.token('wallet:configuration:propose'),
      'idempotency-key': randomUUID(),
    },
    payload: { expected_revision: '1', policy: f.document },
  });
  expect(proposed.statusCode, proposed.body).toBe(200);
  expect((await f.request()).statusCode).toBe(403);
  expect(f.calls.state.posts).toBe(0);
  expect((await f.consent()).json().status).toBe('granted');
  const admitted = await f.request();
  expect(admitted.statusCode, admitted.body).toBe(200);
  expect(f.calls.state.posts).toBe(0);
});

it('admits EIP-5792 batches through the bundled local engine without a designated-service envelope or financial effects', async () => {
  const f = await walletCallsFixture(true);
  const sent = await f.rpc('wallet_sendCalls', [f.batch()]);
  expect(sent.error).toBeUndefined();
  expect(sent.result.id).toMatch(/^0x[0-9a-f]{64}$/);
  expect(
    (await f.rpc('wallet_getCallsStatus', [sent.result.id])).result.status,
  ).toBe(100);
  expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  expect(f.calls.state.posts).toBe(0);
});

it('fails an undersized local Safe simulation before signing or submission', async () => {
  const f = await walletCallsFixture(true);
  const action = await f.request();
  expect(action.statusCode).toBe(200);
  f.calls.state.mutate = (method, result, _origin, params) =>
    method === 'eth_call' &&
    String((params[0] as { data?: string }).data).startsWith('0x6a761202')
      ? '0x' + '0'.repeat(64)
      : result;
  const executed = await f.post(
    '/v1/actions/' + action.json().action_id + '/execute',
    {},
  );
  expect(executed.statusCode).toBe(503);
  expect(executed.json().outcome).toBe('not_dispatched');
  expect(injected.backend!.signTypedData).not.toHaveBeenCalled();
  expect(f.calls.state.posts).toBe(0);
  const db = openProviderDatabase({ directory: f.config.storage.directory });
  expect(db.hasActionAttempts(action.json().action_id)).toBe(false);
  db.close();
});

it.each([false, true])(
  'authorizes exact nonce cancellation and releases only finalized recovery (queued=%s)',
  async (queued) => {
    const f = await walletCallsFixture(true);
    f.config.execution!.sponsorPool = {
      strategy: 'round-robin',
      maxInFlightPerSponsor: 1,
    };
    await f.restart();
    expect((await f.consent()).json().status).toBe('granted');
    const signedPreflight = vi.spyOn(
      QuorumExecutionObserver.prototype,
      'preflight',
    );
    signedPreflight.mockRejectedValueOnce(
      new WalletProviderError('wallet_provider_unavailable'),
    );
    let originalId: string, payloadHash: string, batchId: string | undefined;
    if (queued) {
      const sent = await f.rpc('wallet_sendCalls', [f.batch()]);
      expect(sent.error).toBeUndefined();
      batchId = sent.result.id;
      await f.process();
      const db = openProviderDatabase({
        directory: f.config.storage.directory,
      });
      const original = await db.onboardingStore.transaction(
        (state) => Object.values(state.supportedActions!)[0],
      );
      originalId = original.approval.action.action_id;
      payloadHash = original.approval.action.payload_hash;
      db.close();
    } else {
      const action = await f.request();
      expect(action.statusCode, action.body).toBe(200);
      originalId = action.json().action_id;
      payloadHash = action.json().payload_hash;
      expect(
        (await f.post('/v1/actions/' + originalId + '/execute', {})).statusCode,
      ).toBe(503);
    }
    expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
    expect(f.calls.state.posts).toBe(0);
    const payload = {
      expected_nonce: '0',
      expected_payload_hash: payloadHash,
      authorization: 'invalidate-signed-action',
    };
    expect(
      (
        await f.post('/v1/actions/' + originalId + '/cancel-nonce', {
          ...payload,
          expected_nonce: '1',
        })
      ).statusCode,
    ).toBe(403);
    const key = randomUUID();
    const headers = {
      authorization: await f.t.f.token(),
      'idempotency-key': key,
    };
    const create = () =>
      f.app.inject({
        method: 'POST',
        url: '/v1/actions/' + originalId + '/cancel-nonce',
        headers,
        payload,
      });
    const created = await create();
    expect(created.statusCode, created.body).toBe(200);
    const cancellationId = created.json().action_id;
    expect((await create()).json()).toEqual(created.json());
    expect(
      (await f.post('/v1/actions/' + originalId + '/execute', {})).statusCode,
    ).toBe(403);
    const db = openProviderDatabase({ directory: f.config.storage.directory });
    const child = await db.onboardingStore.transaction(
      (state) => state.supportedActions![cancellationId],
    );
    const original = await db.onboardingStore.transaction(
      (state) => state.supportedActions![originalId],
    );
    const blockedRequest = createWalletAttemptRequest(
      'configured-execution-v1',
      'approved-evm-executor-v1',
      'relay_transaction',
      original.approval.account.accountId,
      original.execution!.executionId,
      originalId,
      {},
    );
    await db.setBudget('offline-blocked-submission', '1');
    await expect(
      db.admitExecutionAttempt(
        {
          request: blockedRequest,
          budgetId: 'offline-blocked-submission',
          units: '1',
        },
        originalId,
      ),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(db.hasExecutionAdmission(original.execution!.executionId)).toBe(
      false,
    );

    expect(child.approval.action.payload.message).toMatchObject({
      to: f.calls.policy.accounts[0].address,
      value: '0',
      data: '0x',
      operation: '0',
      nonce: '0',
    });
    f.calls.state.intent = child.intent;
    const executed = await f.post(
      '/v1/actions/' + cancellationId + '/execute',
      {},
    );
    expect(executed.statusCode, executed.body).toBe(200);
    expect(f.calls.state.posts).toBe(1);
    expect(
      await db.onboardingStore.transaction(
        (state) => state.supportedActions![originalId].nonceReleased,
      ),
    ).not.toBe(true);
    f.calls.state.included = true;
    f.calls.state.mutate = (method, result, _origin, params) => {
      if (method === 'eth_getLogs') throw Error('Offline history unavailable');
      return method === 'eth_getBlockByNumber' &&
        ['safe', 'finalized'].includes(String(params[0]))
        ? { ...(result as object), number: '0x64' }
        : result;
    };
    const included = await f.app.inject({
      url: '/v1/actions/' + cancellationId + '/execution',
      headers: {
        authorization: await f.t.f.token(),
        'execution-profile': 'approved-evm-executor-v1',
        'execution-profile-revision': '1',
      },
    });
    expect(included.json().chain_status).toBe('included');
    expect(
      await db.onboardingStore.transaction(
        (state) => state.supportedActions![originalId].nonceReleased,
      ),
    ).not.toBe(true);
    f.calls.state.mutate = (method, value) => {
      if (method === 'eth_getLogs') throw Error('Offline history unavailable');
      return value;
    };
    const receipt = await f.app.inject({
      url: '/v1/actions/' + cancellationId + '/execution',
      headers: {
        authorization: await f.t.f.token(),
        'execution-profile': 'approved-evm-executor-v1',
        'execution-profile-revision': '1',
      },
    });
    expect(receipt.statusCode, receipt.body).toBe(200);
    expect(receipt.json().chain_status).toBe('finalized');
    expect(
      await db.onboardingStore.transaction(
        (state) => state.supportedActions![originalId].nonceReleased,
      ),
    ).toBe(true);
    if (batchId) {
      expect(
        await db.onboardingStore.transaction(
          (state) => Object.values(state.safeRequests!)[0].status,
        ),
      ).toBe('cancelled');
      expect(
        (await f.rpc('wallet_getCallsStatus', [batchId])).result.status,
      ).toBe(400);
    }
    db.close();
    await f.restart();
    expect(
      (await f.post('/v1/actions/' + originalId + '/execute', {})).statusCode,
    ).toBe(403);
  },
);

it.each([
  'admitted without claim',
  'foreign caller',
  'revoked approval',
  'changed nonce',
  'runtime policy changed',
] as const)('denies nonce cancellation when %s', async (kind) => {
  const f = await walletCallsFixture(true);
  const action = await f.request();
  const id = action.json().action_id;
  vi.spyOn(
    QuorumExecutionObserver.prototype,
    'preflight',
  ).mockRejectedValueOnce(
    new WalletProviderError('wallet_provider_unavailable'),
  );
  await f.post('/v1/actions/' + id + '/execute', {});
  const db = openProviderDatabase({ directory: f.config.storage.directory });
  const record = await db.onboardingStore.transaction(
    (state) => state.supportedActions![id],
  );
  expect(record.execution?.plan).toBeDefined();
  if (kind === 'admitted without claim') {
    const request = createWalletAttemptRequest(
      'configured-execution-v1',
      'approved-evm-executor-v1',
      'relay_transaction',
      record.approval.account.accountId,
      record.execution!.executionId,
      id,
      {},
    );
    await db.setBudget('offline-submission', '1');
    await db.admitExecutionAttempt(
      { request, budgetId: 'offline-submission', units: '1' },
      id,
    );
    expect(await db.journal.read(request)).toBeNull();
  }
  if (kind === 'revoked approval') await db.revokeAction(id);
  if (kind === 'changed nonce') f.calls.state.nonce = '1';
  if (kind === 'runtime policy changed') await f.publish();
  const response = await f.app.inject({
    method: 'POST',
    url: '/v1/actions/' + id + '/cancel-nonce',
    headers: {
      authorization: await f.t.f.token(
        undefined,
        undefined,
        kind === 'foreign caller' ? 'foreign' : undefined,
      ),
      'idempotency-key': randomUUID(),
    },
    payload: {
      expected_nonce: '0',
      expected_payload_hash: action.json().payload_hash,
      authorization: 'invalidate-signed-action',
    },
  });
  expect(response.statusCode, response.body).toBe(403);
  expect(f.calls.state.posts).toBe(0);
  expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  db.close();
});

it('reads runtime execution evidence from an automatically provisioned Safe immediately after restart', async () => {
  const f = await walletCallsFixture(true);
  const binding = f.calls.policy.accounts[0];
  const safe = {
    ...defaultSafeProvisioning(),
    singleton: binding.singleton,
    proxyCodeHash: binding.codeHash,
  };
  f.config.safeProvisioning = safe;
  f.config.activation.safeProvisioningAcceptance = 'offline-ready-Safe-fixture';
  f.config.approvedCalls!.policy = structuredClone(
    f.config.approvedCalls!.policy,
  );
  f.config.approvedCalls!.policy.accounts = [];
  const db = openProviderDatabase({ directory: f.config.storage.directory });
  await db.onboardingStore.transaction((state) => {
    state.deploymentBindings!['service-v1'].safeAccounts = {
      [binding.accountId]: {
        attemptId: randomUUID(),
        caller: {
          issuer: f.config.oauth.issuer,
          clientId: f.config.policy.applications[0].clientId,
          subject: 'application-user',
        },
        configurationHash: safeProvisioningIdentity(safe, 'base-sepolia'),
        state: 'ready',
        plan: {
          accountId: binding.accountId,
          owner: f.t.f.wallet.address,
          address: binding.address,
          saltNonce: '0',
          data: '0x',
          chainId: '84532',
          factory: safe.factory,
          singleton: safe.singleton,
          proxyCodeHash: safe.proxyCodeHash,
          sponsor: f.config.execution!.sponsors[0],
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      },
    };
  });
  await f.restart();
  expect((await f.consent()).json().status).toBe('granted');
  const action = await f.request();
  expect(action.statusCode, action.body).toBe(200);
  vi.spyOn(
    QuorumExecutionObserver.prototype,
    'preflight',
  ).mockRejectedValueOnce(
    new WalletProviderError('wallet_provider_unavailable'),
  );
  await f.post('/v1/actions/' + action.json().action_id + '/execute', {});
  expect(injected.backend!.signTypedData).toHaveBeenCalledTimes(1);
  await f.restart();
  const observed = await f.app.inject({
    url: '/v1/actions/' + action.json().action_id + '/execution',
    headers: {
      authorization: await f.t.f.token(),
      'execution-profile': 'approved-evm-executor-v1',
      'execution-profile-revision': '1',
    },
  });
  expect(observed.statusCode, observed.body).toBe(200);
  expect(observed.json().dispatch_status).toBe('not_started');
  expect(f.calls.state.posts).toBe(0);
  db.close();
});
