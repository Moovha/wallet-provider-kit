import { approvedCallsFixture } from './helpers/approved-calls.js';
import { buildApprovedCallIntent } from '../src/execution/approved-calls.js';
import { openExecutorDatabase } from '../src/executor/storage.js';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdtemp, rm, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executionFixture } from './helpers/execution.js';
import {
  createServiceIdentity,
  signedServiceClient,
  canonicalServiceJson,
  serviceHash,
} from '../src/executor/auth.js';
import { createExecutionService } from '../src/executor/service.js';
import {
  validateExecutionServiceConfiguration,
  type ExecutionServiceConfiguration,
} from '../src/executor/config.js';
import {
  validateExecutionDispatch,
  executionPlanHash,
  type ExecutionDispatch,
} from '../src/executor/protocol.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { openProviderDatabase } from '../src/storage/index.js';
import type { FastifyInstance } from 'fastify';

const directories: string[] = [];
const servers: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function keys(privateName: string, publicName: string) {
  const pair = await generateKeyPair('ES256', { extractable: true });
  vi.stubEnv(privateName, await exportPKCS8(pair.privateKey));
  vi.stubEnv(publicName, await exportSPKI(pair.publicKey));
}
async function fixture(lifetimeBudget?: string) {
  await keys('WALLET_PRIVATE', 'WALLET_PUBLIC');
  await keys('EXECUTOR_PRIVATE', 'EXECUTOR_PUBLIC');
  const directory = await mkdtemp(join(tmpdir(), 'wpk-executor-'));
  directories.push(directory);
  const f = executionFixture();
  if (lifetimeBudget)
    f.configuration.sponsors[0].lifetimeBudgetWei = lifetimeBudget;
  vi.stubEnv('EXECUTION_RELAYER_API_KEY', 'ephemeral-offline-api-token');
  vi.stubEnv('EXECUTION_RPC_PRIMARY_URL', 'https://primary.example.test');
  vi.stubEnv('EXECUTION_RPC_SECONDARY_URL', 'https://secondary.example.test');
  const config: ExecutionServiceConfiguration = {
    configVersion: 1,
    profile: 'execution-service-v1',
    origin: 'https://executor.example.test',
    binding: 'offline-executor',
    storage: { kind: 'sqlite', directory },
    signing: { id: 'executor-key', privateKey: { env: 'EXECUTOR_PRIVATE' } },
    callers: [
      {
        origin: 'https://wallet.example.test',
        keys: [{ id: 'wallet-key', publicKey: { env: 'WALLET_PUBLIC' } }],
        providers: ['sponsor'],
      },
    ],
    providers: [
      {
        id: 'sponsor',
        revision: '1',
        kind: 'openzeppelin-relayer',
        relayer: f.configuration.relayer,
        rpc: f.configuration.rpc,
        token: {
          address: '',
          name: 'Test Token',
          version: '1',
          symbol: 'TEST',
          decimals: 6,
        },
        sponsors: f.configuration.sponsors,
      },
    ],
    activation: {
      enabled: true,
      providerAcceptance: 'offline-provider-evidence',
      recoveryAcceptance: 'offline-recovery-evidence',
      authenticationAcceptance: 'offline-authentication-evidence',
    },
  };
  const plan = structuredClone(await f.plan());
  plan.profile = 'erc3009-executor-v1';
  plan.sponsor.binding = {
    address: plan.sponsor.binding.address,
    bindingRevision: plan.sponsor.binding.bindingRevision,
  };
  config.providers[0].token!.address = String(
    plan.action.payload.domain.verifyingContract,
  );
  const executionId = randomUUID();
  const walletAttempt = createWalletAttemptRequest(
    'configured-execution-v1',
    'erc3009-executor-v1',
    'relay_transaction',
    randomUUID(),
    executionId,
    plan.action.action_id,
    plan,
  );
  const dispatch: ExecutionDispatch = {
    contract: 'execution-dispatch-v1',
    execution_id: executionId,
    provider_id: 'sponsor',
    provider_revision: '1',
    wallet_attempt: walletAttempt,
    plan,
  };
  const wallet = await createServiceIdentity(
    'https://wallet.example.test',
    { id: 'wallet-key', privateKey: { env: 'WALLET_PRIVATE' } },
    [
      {
        origin: config.origin,
        keys: [{ id: 'executor-key', publicKey: { env: 'EXECUTOR_PUBLIC' } }],
      },
    ],
  );
  let app: FastifyInstance;
  const state = {
    allowed: true,
    callbacks: 0,
    loseHandoff: false,
    tamperResponse: false,
    beforeAuthority: undefined as (() => Promise<void>) | undefined,
  };
  const request = (async (input, options) => {
    const url = new URL(String(input));
    if (url.origin === 'https://wallet.example.test') {
      const body = JSON.parse(String(options?.body));
      const headers = new Headers(options?.headers);
      const authenticated = await wallet.verify(
        headers.get('authorization') ?? undefined,
        'authority',
        'POST',
        url.pathname,
        body,
      );
      state.callbacks++;
      await state.beforeAuthority?.();
      const result = state.allowed
        ? { allowed: true, ...body }
        : { code: 'wallet_authorization_denied' };
      const status = state.allowed ? 200 : 403;
      const signed = await wallet.sign(
        config.origin,
        'authority',
        'POST',
        url.pathname,
        result,
        { requestId: authenticated.requestId, status },
      );
      return new Response(canonicalServiceJson(result), {
        status,
        headers: { 'execution-service-proof': signed.proof },
      });
    }
    if (url.origin === config.origin) {
      const response = await app.inject({
        method: options?.method as 'GET' | 'POST',
        url: url.pathname,
        headers: Object.fromEntries(new Headers(options?.headers)),
        ...(options?.body ? { payload: String(options.body) } : {}),
      });
      if (state.loseHandoff && options?.method === 'POST')
        throw new Error('Offline handoff response loss');
      const body = state.tamperResponse
        ? response.body.replace('accepted', 'unknown')
        : response.body;
      return new Response(body, {
        status: response.statusCode,
        headers: Object.fromEntries(
          Object.entries(response.headers).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
      });
    }
    return f.request(input, options);
  }) as typeof fetch;
  const initial = openProviderDatabase({ directory, initialize: true });
  initial.close();
  app = await createExecutionService({ configuration: config, request });
  servers.push(app);
  const call = signedServiceClient(wallet, config.origin, request);
  return {
    f,
    config,
    dispatch,
    wallet,
    state,
    request,
    call,
    get app() {
      return app;
    },
    async restart() {
      await app.close();
      app = await createExecutionService({ configuration: config, request });
      servers.push(app);
    },
  };
}

describe('designated execution service', () => {
  it('reserves a Safe nonce across wallet origins and execution identities in the independent executor store', async () => {
    const t = await fixture(),
      dispatch = structuredClone(t.dispatch);
    const calls = approvedCallsFixture(
      dispatch.wallet_attempt.accountId,
      String(dispatch.plan.action.payload.message.from),
      t.f,
    );
    t.config.providers[0].revision = '2';
    t.config.providers[0].contractCalls = calls.policy;
    dispatch.provider_revision = '2';
    dispatch.plan.profile = 'approved-evm-executor-v1';
    dispatch.plan.intent = buildApprovedCallIntent(
      calls.policy,
      {
        account_id: dispatch.wallet_attempt.accountId,
        kind: 'contract-call',
        calls: [
          {
            to: calls.policy.contracts[0].address,
            value: '0',
            data: '0x12345678',
          },
        ],
      },
      '0',
      dispatch.plan.action.expires_at,
    );
    const database = openExecutorDatabase(t.config, process.cwd());
    try {
      database.admit(t.wallet.origin, dispatch, t.config.providers[0]);
      const conflicting = structuredClone(dispatch);
      conflicting.execution_id = randomUUID();
      conflicting.plan.action.action_id = randomUUID();
      expect(() =>
        database.admit(
          'https://other-wallet.example.test',
          conflicting,
          t.config.providers[0],
        ),
      ).toThrow();
    } finally {
      database.close();
    }
    expect(t.f.state.posts).toBe(0);
  });

  it('retains read-only recovery for an accepted provider revision when a new revision is registered', async () => {
    const t = await fixture();
    await t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch);
    t.config.providers.push({
      ...structuredClone(t.config.providers[0]),
      revision: '2',
    });
    await t.restart();
    const capabilities = (await t.call(
      'capabilities',
      'GET',
      '/v1/executor-capabilities',
    )) as { providers: { id: string; revision: string }[] };
    expect(capabilities.providers.map((provider) => provider.revision)).toEqual(
      ['1', '2'],
    );
    const result = (await t.call(
      'status',
      'GET',
      '/v1/dispatches/' + t.dispatch.execution_id,
    )) as { dispatch_status: string };
    expect(result.dispatch_status).toBe('accepted');
    expect(t.f.state.posts).toBe(1);
  });

  it('fails closed without configuration while publishing every service endpoint', async () => {
    const app = await createExecutionService();
    servers.push(app);
    expect(Object.keys(app.swagger().paths!)).toHaveLength(3);
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
    expect((await app.inject('/v1/executor-capabilities')).statusCode).toBe(
      503,
    );
  });
  it('authenticates immutable dispatch, preserves one provider effect and recovers its identity after response loss and restart', async () => {
    const t = await fixture();
    const capabilities = (await t.call(
      'capabilities',
      'GET',
      '/v1/executor-capabilities',
    )) as any;
    expect(capabilities.providers).toEqual([{ id: 'sponsor', revision: '1' }]);
    t.state.loseHandoff = true;
    await expect(
      t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(t.f.state.posts).toBe(1);
    expect(t.state.callbacks).toBeGreaterThanOrEqual(4);
    await t.restart();
    t.state.loseHandoff = false;
    const recovered = (await t.call(
      'status',
      'GET',
      '/v1/dispatches/' + t.dispatch.execution_id,
    )) as any;
    expect(recovered).toMatchObject({
      execution_id: t.dispatch.execution_id,
      plan_hash: executionPlanHash(t.dispatch.plan),
      dispatch_status: 'accepted',
      transaction_hash: t.f.transactionHash,
    });
    await t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch);
    expect(t.f.state.posts).toBe(1);
  });
  it('does not redispatch an unknown provider effect on retries, restart or lease expiry', async () => {
    const t = await fixture();
    t.f.state.lostResponse = true;
    await expect(
      t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    await t.restart();
    const result = (await t.call(
      'dispatch',
      'POST',
      '/v1/dispatches',
      t.dispatch,
    )) as any;
    expect(result.dispatch_status).toBe('unknown');
    expect(t.f.state.posts).toBe(1);
    t.f.state.included = true;
    t.f.state.finality = 'finalized';
    expect(
      await t.call(
        'status',
        'GET',
        '/v1/dispatches/' + t.dispatch.execution_id,
      ),
    ).toMatchObject({
      dispatch_status: 'unknown',
      transaction_hash: t.f.transactionHash,
    });
    expect(t.f.state.posts).toBe(1);
  });
  it('denies a changed plan, wrong provider revision and a second identity for the same immutable action', async () => {
    const t = await fixture();
    await t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch);
    const changed = structuredClone(t.dispatch);
    changed.plan.sponsor.gasLimit = '160000';
    await expect(
      t.call('dispatch', 'POST', '/v1/dispatches', changed),
    ).rejects.toThrow();
    const revision = structuredClone(t.dispatch);
    revision.provider_revision = '2';
    await expect(
      t.call('dispatch', 'POST', '/v1/dispatches', revision),
    ).rejects.toThrow();
    const duplicate = structuredClone(t.dispatch);
    duplicate.execution_id = randomUUID();
    duplicate.wallet_attempt = createWalletAttemptRequest(
      'configured-execution-v1',
      'erc3009-executor-v1',
      'relay_transaction',
      duplicate.wallet_attempt.accountId,
      duplicate.execution_id,
      duplicate.plan.action.action_id,
      duplicate.plan,
    );
    await expect(
      t.call('dispatch', 'POST', '/v1/dispatches', duplicate),
    ).rejects.toThrow();
    expect(t.f.state.posts).toBe(1);
  });
  it('rechecks revocation after simulation and immediately before the provider effect', async () => {
    const t = await fixture();
    t.f.state.before = async (method) => {
      if (method === 'eth_call') t.state.allowed = false;
    };
    await expect(
      t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch),
    ).rejects.toThrow();
    expect(t.f.state.posts).toBe(0);
  });
  it('serializes concurrent authenticated submissions through one service-owned journal', async () => {
    const t = await fixture();
    await Promise.allSettled([
      t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch),
      t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch),
    ]);
    expect(t.f.state.posts).toBe(1);
  });
  it('preserves attempts and provider acceptance through a SQLite-aware backup restore', async () => {
    const t = await fixture();
    const first = await t.call(
      'dispatch',
      'POST',
      '/v1/dispatches',
      t.dispatch,
    );
    const destination = await mkdtemp(join(tmpdir(), 'wpk-executor-restore-'));
    directories.push(destination);
    const source = new DatabaseSync(
      join(t.config.storage.directory, 'provider.sqlite'),
      { readOnly: true },
    );
    await backup(source, join(destination, 'provider.sqlite'));
    source.close();
    await chmod(join(destination, 'provider.sqlite'), 0o600);
    t.config.storage.directory = destination;
    await t.restart();
    expect(
      await t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch),
    ).toMatchObject({
      execution_id: t.dispatch.execution_id,
      dispatch_status: 'accepted',
    });
    expect((first as any).execution_id).toBe(t.dispatch.execution_id);
    expect(t.f.state.posts).toBe(1);
  });
  it('coordinates two independent service instances against the same local journal', async () => {
    const t = await fixture();
    const second = await createExecutionService({
      configuration: t.config,
      request: t.request,
    });
    servers.push(second);
    const signed = await t.wallet.sign(
      t.config.origin,
      'dispatch',
      'POST',
      '/v1/dispatches',
      t.dispatch,
    );
    await Promise.allSettled([
      t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch),
      second.inject({
        method: 'POST',
        url: '/v1/dispatches',
        headers: {
          authorization: 'Bearer ' + signed.proof,
          'content-type': 'application/json',
        },
        payload: canonicalServiceJson(t.dispatch),
      }),
    ]);
    expect(t.f.state.posts).toBe(1);
  });
  it('rejects duplicate JSON names and expired service proofs before any effect', async () => {
    const t = await fixture();
    const signed = await t.wallet.sign(
      t.config.origin,
      'dispatch',
      'POST',
      '/v1/dispatches',
      t.dispatch,
    );
    const wire = canonicalServiceJson(t.dispatch).replace(
      '{',
      '{"contract":"execution-dispatch-v1",',
    );
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: '/v1/dispatches',
          headers: {
            authorization: 'Bearer ' + signed.proof,
            'content-type': 'application/json',
          },
          payload: wire,
        })
      ).statusCode,
    ).toBe(401);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 33000);
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: '/v1/dispatches',
          headers: {
            authorization: 'Bearer ' + signed.proof,
            'content-type': 'application/json',
          },
          payload: canonicalServiceJson(t.dispatch),
        })
      ).statusCode,
    ).toBe(401);
    expect(t.f.state.posts).toBe(0);
  });
  it('enforces its own sponsor budget across distinct approved actions', async () => {
    const t = await fixture('451000000000000');
    t.dispatch.wallet_attempt = createWalletAttemptRequest(
      'configured-execution-v1',
      'erc3009-executor-v1',
      'relay_transaction',
      t.dispatch.wallet_attempt.accountId,
      t.dispatch.execution_id,
      t.dispatch.plan.action.action_id,
      t.dispatch.plan,
    );
    await t.restart();
    await t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch);
    const plan = structuredClone(await t.f.plan());
    plan.profile = 'erc3009-executor-v1';
    plan.sponsor.binding = {
      address: plan.sponsor.binding.address,
      bindingRevision: plan.sponsor.binding.bindingRevision,
    };
    const id = randomUUID();
    const next = {
      ...t.dispatch,
      execution_id: id,
      plan,
      wallet_attempt: createWalletAttemptRequest(
        'configured-execution-v1',
        'erc3009-executor-v1',
        'relay_transaction',
        randomUUID(),
        id,
        plan.action.action_id,
        plan,
      ),
    };
    await expect(
      t.call('dispatch', 'POST', '/v1/dispatches', next),
    ).rejects.toThrow();
    expect(t.f.state.posts).toBe(1);
  });
  it('keeps durable dispatches isolated between registered wallet origins', async () => {
    const t = await fixture();
    await t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch);
    await keys('OTHER_WALLET_PRIVATE', 'OTHER_WALLET_PUBLIC');
    t.config.callers.push({
      origin: 'https://other-wallet.example.test',
      keys: [{ id: 'other-wallet', publicKey: { env: 'OTHER_WALLET_PUBLIC' } }],
      providers: ['sponsor'],
    });
    await t.restart();
    const other = await createServiceIdentity(
      'https://other-wallet.example.test',
      { id: 'other-wallet', privateKey: { env: 'OTHER_WALLET_PRIVATE' } },
      [
        {
          origin: t.config.origin,
          keys: [{ id: 'executor-key', publicKey: { env: 'EXECUTOR_PUBLIC' } }],
        },
      ],
    );
    const path = '/v1/dispatches/' + t.dispatch.execution_id;
    const signed = await other.sign(
      t.config.origin,
      'status',
      'GET',
      path,
      null,
    );
    expect(
      (
        await t.app.inject({
          url: path,
          headers: { authorization: 'Bearer ' + signed.proof },
        })
      ).statusCode,
    ).toBe(403);
    expect(t.f.state.posts).toBe(1);
  });
  it('rejects unsigned requests, wrong-purpose proofs, altered bodies and altered signed responses', async () => {
    const t = await fixture();
    expect((await t.app.inject('/v1/executor-capabilities')).statusCode).toBe(
      401,
    );
    const proof = await t.wallet.sign(
      t.config.origin,
      'status',
      'POST',
      '/v1/dispatches',
      t.dispatch,
    );
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: '/v1/dispatches',
          headers: {
            authorization: 'Bearer ' + proof.proof,
            'content-type': 'application/json',
          },
          payload: canonicalServiceJson(t.dispatch),
        })
      ).statusCode,
    ).toBe(401);
    const exact = await t.wallet.sign(
      t.config.origin,
      'dispatch',
      'POST',
      '/v1/dispatches',
      t.dispatch,
    );
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: '/v1/dispatches',
          headers: {
            authorization: 'Bearer ' + exact.proof,
            'content-type': 'application/json',
          },
          payload: canonicalServiceJson({
            ...t.dispatch,
            provider_revision: '2',
          }),
        })
      ).statusCode,
    ).toBe(401);
    await t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch);
    t.state.tamperResponse = true;
    await expect(
      t.call('status', 'GET', '/v1/dispatches/' + t.dispatch.execution_id),
    ).rejects.toThrow();
    expect(t.f.state.posts).toBe(1);
  });
  it('validates configuration without network access and requires separate activation evidence', async () => {
    const config = JSON.parse(
      await readFile('docs/executor.config.example.json', 'utf8'),
    );
    expect(
      validateExecutionServiceConfiguration(config).activation.enabled,
    ).toBe(false);
    config.activation.enabled = true;
    expect(() => validateExecutionServiceConfiguration(config)).toThrow();
  });
  it('recovers native provider acceptance read-only by the original client reference after an unknown response', async () => {
    const t = await fixture();
    await t.app.close();
    const module = join(t.config.storage.directory, 'native-recovery.mjs');
    const recordPath = join(
      t.config.storage.directory,
      'offline-vendor-record.json',
    );
    const providerId = randomUUID();
    await writeFile(
      module,
      `
      import {readFile,writeFile} from 'node:fs/promises';
      export const adapterVersion=1;
      export function createExecutionProvider(){return {
        prepare:async()=>{},
        submit:async(_plan,context)=>{await context.authorizeEffect();await writeFile(${JSON.stringify(recordPath)},JSON.stringify({id:context.executionId,hash:context.request.requestHash,providerId:'${providerId}',submissions:1}),{flag:'wx',mode:0o600});throw new Error('Offline response loss after provider acceptance');},
        transactionHash:async()=>undefined,
        recover:async(_plan,context)=>{const record=JSON.parse(await readFile(${JSON.stringify(recordPath)},'utf8'));if(record.id!==context.executionId||record.hash!==context.request.requestHash)throw new Error('Wrong native client reference');return {accepted:true,transactionId:record.providerId};}
      }};
    `,
      { mode: 0o600 },
    );
    const provider = t.config.providers[0];
    provider.kind = 'custom';
    provider.revision = '2';
    t.dispatch.provider_revision = '2';
    provider.module = module;
    delete provider.relayer;
    for (const sponsor of provider.sponsors) {
      delete sponsor.binding.relayerId;
      delete sponsor.binding.signerId;
    }
    await t.restart();
    await expect(
      t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch),
    ).rejects.toThrow();
    await t.restart();
    expect(
      await t.call(
        'status',
        'GET',
        '/v1/dispatches/' + t.dispatch.execution_id,
      ),
    ).toMatchObject({ dispatch_status: 'accepted' });
    await t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch);
    expect(JSON.parse(await readFile(recordPath, 'utf8')).submissions).toBe(1);
    expect(t.f.state.posts).toBe(0);
  });
  it('rejects rebinding an existing provider revision to another submission destination', async () => {
    const t = await fixture();
    await t.call('dispatch', 'POST', '/v1/dispatches', t.dispatch);
    await t.app.close();
    t.config.providers[0].relayer!.url = 'https://other-relayer.example.test';
    await expect(
      createExecutionService({ configuration: t.config, request: t.request }),
    ).rejects.toMatchObject({ code: 'wallet_provider_configuration' });
    expect(t.f.state.posts).toBe(1);
  });
  it('supports a configured custom adapter without requiring Relayer bindings', async () => {
    const t = await fixture();
    await t.app.close();
    const module = join(t.config.storage.directory, 'offline-executor.mjs');
    await writeFile(
      module,
      `export const adapterVersion=1;export function createExecutionProvider(){return {prepare:async()=>{},submit:async(_plan,context)=>{await context.authorizeEffect();return '${randomUUID()}'},transactionHash:async()=>undefined}}`,
      { mode: 0o600 },
    );
    const provider = t.config.providers[0];
    provider.kind = 'custom';
    provider.revision = '2';
    t.dispatch.provider_revision = '2';
    provider.module = module;
    delete provider.relayer;
    for (const sponsor of provider.sponsors) {
      delete sponsor.binding.relayerId;
      delete sponsor.binding.signerId;
    }
    const app = await createExecutionService({
      configuration: t.config,
      request: t.request,
    });
    servers.push(app);
    const signed = await t.wallet.sign(
      t.config.origin,
      'dispatch',
      'POST',
      '/v1/dispatches',
      t.dispatch,
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/dispatches',
      headers: {
        authorization: 'Bearer ' + signed.proof,
        'content-type': 'application/json',
      },
      payload: canonicalServiceJson(t.dispatch),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().dispatch_status).toBe('accepted');
    expect(t.f.state.posts).toBe(0);
  });
});

describe('execution wire authentication', () => {
  it('canonicalizes structured JSON and rejects invalid Unicode and nonfinite numbers', () => {
    expect(canonicalServiceJson({ b: 2, a: { d: 'x', c: true } })).toBe(
      '{"a":{"c":true,"d":"x"},"b":2}',
    );
    expect(serviceHash({ b: 2, a: 1 })).toBe(serviceHash({ a: 1, b: 2 }));
    expect(() => canonicalServiceJson('\ud800')).toThrow();
    expect(() => canonicalServiceJson(NaN)).toThrow();
  });
  it('rejects domain, signature and calldata mismatches even with an authenticated wallet caller', async () => {
    const t = await fixture();
    for (const modify of [
      (value: ExecutionDispatch) => {
        value.plan.data = '0x';
      },
      (value: ExecutionDispatch) => {
        value.plan.action.payload.domain.name = 'Other Token';
      },
      (value: ExecutionDispatch) => {
        value.plan.action.payload.message.value = '999';
      },
    ]) {
      const value = structuredClone(t.dispatch);
      modify(value);
      expect(() =>
        validateExecutionDispatch(value, t.config.providers[0]),
      ).toThrow();
    }
    expect(t.f.state.posts).toBe(0);
  });
});

it('enforces sponsor capacity atomically across wallet origins and releases capacity only on verified finality', async () => {
  const t = await fixture(),
    provider = t.config.providers[0];
  provider.revision = '2';
  provider.sponsorPool = { strategy: 'round-robin', maxInFlightPerSponsor: 2 };
  const db = openExecutorDatabase(t.config, process.cwd());
  const make = () => {
    const dispatch = structuredClone(t.dispatch);
    dispatch.execution_id = randomUUID();
    dispatch.provider_revision = '2';
    dispatch.plan.action.action_id = randomUUID();
    dispatch.plan.action.operation_id = dispatch.plan.action.action_id;
    dispatch.wallet_attempt = createWalletAttemptRequest(
      'configured-execution-v1',
      'erc3009-executor-v1',
      'relay_transaction',
      dispatch.wallet_attempt.accountId,
      dispatch.execution_id,
      dispatch.plan.action.action_id,
      dispatch.plan,
    );
    return dispatch;
  };
  try {
    const first = make(),
      second = make(),
      third = make();
    const a = db.admit(t.wallet.origin, first, provider),
      b = db.admit('https://other-wallet.example.test', second, provider);
    expect(() => db.admit(t.wallet.origin, third, provider)).toThrow();
    expect(
      db.admit(t.wallet.origin, first, provider).dispatch.execution_id,
    ).toBe(first.execution_id);
    db.observe(a, {
      chain_status: 'included',
      verification: 'rpc-quorum',
      outcome: 'succeeded',
      settlement: 'pending',
      observed_at: new Date().toISOString(),
      transaction_hash: t.f.transactionHash,
      block_hash: t.f.blockHash,
      block_number: '101',
      execution_origin: 'sponsor',
    });
    expect(() => db.admit(t.wallet.origin, third, provider)).toThrow();
    const latest = db.load(first.execution_id, t.wallet.origin)!;
    db.observe(latest, {
      chain_status: 'finalized',
      verification: 'rpc-quorum',
      outcome: 'succeeded',
      settlement: 'succeeded',
      observed_at: new Date().toISOString(),
      transaction_hash: t.f.transactionHash,
      block_hash: t.f.blockHash,
      block_number: '101',
      execution_origin: 'sponsor',
    });
    expect(
      db.admit(t.wallet.origin, third, provider).dispatch.execution_id,
    ).toBe(third.execution_id);
    expect(
      db.load(b.dispatch.execution_id, 'https://other-wallet.example.test')!
        .observation,
    ).toBeUndefined();
  } finally {
    db.close();
  }
});
