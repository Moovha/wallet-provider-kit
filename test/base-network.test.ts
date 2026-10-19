import { createTransferExecutionProvider } from '../src/execution/relayer.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoverAddress, Wallet } from 'ethers';
import { generateDeploymentSecrets } from '../src/deployment/deployment-secrets.js';
import { createConfiguredProvider } from '../src/deployment/provider.js';
import type { ProviderConfiguration } from '../src/deployment/config.js';
import { openProviderDatabase } from '../src/storage/index.js';
import { providerNetwork, type ProviderNetwork } from '../src/networks.js';
import { apiTokenScopes } from '../src/service/api-token-scopes.js';
import {
  buildApprovedCallIntent,
  buildApprovedCallAction,
  validateApprovedCallAction,
} from '../src/execution/approved-calls.js';
import { approvedCallsFixture } from './helpers/approved-calls.js';
import { executionFixture } from './helpers/execution.js';
import { QuorumExecutionObserver } from '../src/execution/chain.js';

const folders: string[] = [];
const servers: Awaited<ReturnType<typeof createConfiguredProvider>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  vi.unstubAllEnvs();
  await Promise.all(
    folders.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});

async function fixture(network: ProviderNetwork) {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-network-'));
  folders.push(directory);
  const config: ProviderConfiguration = JSON.parse(
    await readFile('docs/provider.config.bundled.example.json', 'utf8'),
  );
  config.network = network;
  delete config.localExecution;
  config.storage.directory = join(directory, 'data');
  if (config.backend.kind !== 'ows') throw new Error();
  config.backend.vaultDirectory = join(directory, 'vault');
  await mkdir(config.backend.vaultDirectory, { mode: 0o700 });
  const issuer = config.oauth.issuer;
  config.policy.applications[0].permissions = [
    'account:read',
    'operations:request',
    'transfers:request',
  ];
  config.authorizationServer!.clients[0].scopes = [...apiTokenScopes];
  config.authorizationServer!.operatorClients = [
    { clientId: 'operator', clientSecret: { env: 'PREVIEW_OPERATOR_SECRET' } },
  ];
  config.runtimeConfiguration = {
    operators: [{ issuer, clientId: 'operator', subject: 'operator' }],
  };
  config.financial = {
    profile: 'provider-authorized-erc3009-v1',
    token: {
      address: Wallet.createRandom().address,
      name: 'Offline Token',
      version: '1',
      symbol: 'TEST',
      decimals: 6,
    },
    recipients: [Wallet.createRandom().address],
    maximumAmount: '1',
    lifetimeAmount: '2',
    maxValiditySeconds: 60,
  };
  config.activation = {
    enabled: true,
    backendAcceptance: 'ephemeral offline engine exercise',
    recoveryAcceptance: 'ephemeral restart exercise',
    tokenAcceptance: 'offline token fixture only',
  };
  const values = generateDeploymentSecrets(config, {});
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  const db = openProviderDatabase({
    directory: config.storage.directory,
    initialize: true,
  });
  db.close();
  const app = await createConfiguredProvider(config);
  servers.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error();
  const origin = `http://127.0.0.1:${address.port}`;
  async function token(operator = false) {
    const client = operator
      ? config.authorizationServer!.operatorClients![0]
      : config.authorizationServer!.clients[0];
    const scope = operator
      ? 'wallet:configuration:write wallet:configuration:read'
      : config.authorizationServer!.clients[0].scopes.join(' ');
    const response = await fetch(origin + '/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: client.clientId,
        client_secret: values[client.clientSecret.env],
        scope,
        resource: config.oauth.audience,
      }),
    });
    expect(response.status).toBe(200);
    return (
      'Bearer ' +
      ((await response.json()) as { access_token: string }).access_token
    );
  }
  const bearer = await token(),
    operator = await token(true);
  async function request(
    path: string,
    body?: unknown,
    authorization = bearer,
    key = randomUUID(),
  ) {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, any>,
    };
  }
  return { config, app, request, operator };
}

describe.each(['base', 'base-sepolia'] as const)(
  '%s local HTTP and real OWS authority',
  (network) => {
    it('publishes registered methods with operator approval, provisions and recovers a wallet, signs exact delegated actions and denies revoked replay', async () => {
      const f = await fixture(network),
        chain = providerNetwork(network);
      const policy = {
        version: '1',
        enabled: false,
        chain_id: chain.caip,
        contracts: [
          {
            address: f.config.financial!.token.address,
            code_hash: '0x' + '1'.repeat(64),
            methods: [
              {
                signature: 'transfer(address,uint256)',
                maximum_value_wei: '0',
              },
            ],
          },
        ],
        maximum_calls: 1,
        maximum_native_value_wei: '0',
        max_validity_seconds: 60,
        claim_requirements: [],
      };
      const proposal = await f.request('/v1/runtime-configuration/proposals', {
        expected_revision: '0',
        policy,
      });
      expect(proposal.status).toBe(200);
      const path =
        '/v1/runtime-configuration/proposals/' +
        proposal.body.proposal_id +
        '/publish';
      expect((await f.request(path, { expected_revision: '0' })).status).toBe(
        403,
      );
      expect(
        (await f.request(path, { expected_revision: '0' }, f.operator)).status,
      ).toBe(200);
      expect(
        (await f.request('/v1/runtime-configuration')).body.publication.policy
          .chain_id,
      ).toBe(chain.caip);
      expect(
        (await f.request('/v1/applications/configurations')).body.network,
      ).toBe(network);
      const wrong = structuredClone(policy);
      wrong.chain_id = providerNetwork(
        network === 'base' ? 'base-sepolia' : 'base',
      ).caip;
      expect(
        (
          await f.request('/v1/runtime-configuration/proposals', {
            expected_revision: '1',
            policy: wrong,
          })
        ).status,
      ).toBe(422);
      const terms = await f.request('/v1/access-policy');
      expect(terms.body.chain_id).toBe(chain.caip);
      const grant = await f.request('/v1/access-requests', {
        mode: 'create',
        user: {
          id: 'ephemeral-user',
          identity: {
            reference: 'ephemeral-identity',
            level: 'verified',
            verified_at: new Date(Date.now() - 1000).toISOString(),
            fields: { country: 'ZA' },
          },
          consent: {
            reference: 'ephemeral-consent',
            granted_at: new Date(Date.now() - 1000).toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            policy_revision: terms.body.policy_revision,
            transfer_policy_revision: terms.body.transfer_policy_revision,
          },
        },
        authorization_details: [
          {
            type: 'https://moovha.com/wallet/account-access',
            actions: ['account:read', 'transfers:request'],
          },
        ],
      });
      expect(grant.status).toBe(200);
      const provisionPath =
          '/v1/accounts/' + grant.body.account_id + '/provision',
        key = randomUUID();
      const provision = await f.request(provisionPath, {}, undefined, key);
      expect(provision.status).toBe(200);
      expect((await f.request(provisionPath, {}, undefined, key)).body).toEqual(
        provision.body,
      );
      const action = await f.request('/v1/transfer-authorizations', {
        account_id: grant.body.account_id,
        recipient: f.config.financial!.recipients[0],
        amount: '1',
      });
      expect(action.status, JSON.stringify(action.body)).toBe(200);
      expect(action.body.payload.domain.chainId).toBe(chain.chainId);
      const signPath = '/v1/actions/' + action.body.action_id + '/sign';
      const signature = await f.request(signPath, {});
      expect(signature.status).toBe(200);
      expect(
        recoverAddress(action.body.payload_hash, signature.body.signature),
      ).toBe(provision.body.address);
      await f.app.close();
      const restarted = await createConfiguredProvider(f.config);
      servers.push(restarted);
      const saved = await restarted.inject({
        url: signPath,
        method: 'POST',
        headers: { authorization: 'invalid', 'idempotency-key': randomUUID() },
        payload: {},
      });
      expect(saved.statusCode).toBe(401);
      // Restored OWS and persisted journals are exercised through the authenticated original socket below.
      const rebound = await restarted.listen({ host: '127.0.0.1', port: 0 });
      const client = f.config.authorizationServer!.clients[0];
      const response = await fetch(rebound + '/oauth/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: client.clientId,
          client_secret: process.env[client.clientSecret.env]!,
          scope: client.scopes.join(' '),
          resource: f.config.oauth.audience,
        }),
      });
      const authorization =
        'Bearer ' +
        ((await response.json()) as { access_token: string }).access_token;
      const post = async (path: string) =>
        restarted.inject({
          url: path,
          method: 'POST',
          headers: { authorization, 'idempotency-key': randomUUID() },
          payload: {},
        });
      expect((await post(signPath)).json()).toEqual(signature.body);
      expect(
        (await post('/v1/access-grants/' + grant.body.grant_id + '/revoke'))
          .statusCode,
      ).toBe(200);
      expect((await post(signPath)).statusCode).toBe(403);
      const changed = structuredClone(f.config);
      changed.network = network === 'base' ? 'base-sepolia' : 'base';
      await expect(createConfiguredProvider(changed)).rejects.toMatchObject({
        issues: [expect.stringContaining('provider binding changed')],
      });
    });
  },
);

it('binds Safe call digests and validation to the selected network', () => {
  const id = randomUUID(),
    owner = Wallet.createRandom().address,
    calls = approvedCallsFixture(id, owner, executionFixture());
  const expiry = new Date(Date.now() + 60000).toISOString();
  const intent = buildApprovedCallIntent(
    calls.policy,
    {
      kind: 'contract-call',
      account_id: id,
      calls: [
        {
          to: calls.policy.contracts[0].address,
          value: '0',
          data: '0x12345678',
        },
      ],
    },
    '0',
    expiry,
  );
  const base = buildApprovedCallAction(
    intent,
    owner,
    expiry,
    randomUUID(),
    'base',
  );
  const sepolia = buildApprovedCallAction(intent, owner, expiry, randomUUID());
  expect(base.chain_id).toBe('eip155:8453');
  expect(base.payload_hash).not.toBe(sepolia.payload_hash);
  expect(() =>
    validateApprovedCallAction(calls.policy, intent, base, 'base'),
  ).not.toThrow();
  expect(() =>
    validateApprovedCallAction(calls.policy, intent, base),
  ).toThrow();
});

it('requires mainnet identity at each RPC and rejects a Sepolia peer', async () => {
  const seen: string[] = [];
  const request = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const body = JSON.parse(String(init?.body));
    seen.push(body.method);
    const result =
      body.method === 'eth_chainId'
        ? '0x14a34'
        : { hash: '0x' + '1'.repeat(64) };
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
      { headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const observer = new QuorumExecutionObserver(
    ['https://first.example.test', 'https://second.example.test'],
    '0x' + '1'.repeat(64),
    100,
    request,
    'base',
  );
  await expect(
    observer.payerBalance(Wallet.createRandom().address),
  ).rejects.toThrow();
  expect(seen).toContain('eth_chainId');
});

it('simulates, queues and independently verifies a Base transfer with offline RPC/Relayer fixtures', async () => {
  const f = executionFixture(
    undefined,
    undefined,
    undefined,
    undefined,
    'base',
  );
  const plan = await f.plan();
  const observer = new QuorumExecutionObserver(
    ['https://primary.example.test', 'https://secondary.example.test'],
    f.configuration.rpc.genesisHash,
    10000,
    f.request,
    'base',
  );
  await observer.preflight(plan);
  expect(f.state.posts).toBe(0);
  const execution = createTransferExecutionProvider(
    f.configuration,
    'ephemeral-offline-secret',
    f.request,
  );
  await execution.prepare(plan);
  const { createWalletAttemptRequest } =
    await import('../src/providers/attempt-lifecycle.js');
  const request = createWalletAttemptRequest(
    'offline-base',
    'openzeppelin-relayer-execution-v1',
    'relay_transaction',
    randomUUID(),
    randomUUID(),
    plan.action.action_id,
    plan,
  );
  await execution.submit(plan, {
    executionId: randomUUID(),
    request,
    authorizeEffect: async () => {},
  });
  expect(f.state.posts).toBe(1);
  f.state.included = true;
  f.state.finality = 'finalized';
  expect(
    await observer.observe(plan, [f.transactionHash], f.transactionHash),
  ).toMatchObject({ verification: 'rpc-quorum', settlement: 'succeeded' });
  const wrong = structuredClone(plan);
  wrong.action.chain_id = 'eip155:84532';
  await expect(observer.preflight(wrong)).rejects.toThrow();
  await expect(execution.prepare(wrong)).rejects.toThrow();
  expect(f.state.posts).toBe(1);
});

it('derives Safe4337 typed-data and signer bindings from the accepted Base domain', async () => {
  const { safeOpPayloadV07, safeOpActionV07 } =
    await import('../src/sponsorship/safe-op.js');
  const wallet = Wallet.createRandom();
  const operation = {
    sender: wallet.address,
    nonce: '0x0',
    callData: '0x',
    callGasLimit: '0x10000',
    verificationGasLimit: '0x10000',
    preVerificationGas: '0x1000',
    maxFeePerGas: '0x100',
    maxPriorityFeePerGas: '0x1',
    paymaster: Wallet.createRandom().address,
    paymasterVerificationGasLimit: '0x10000',
    paymasterPostOpGasLimit: '0x10000',
    paymasterData: '0x',
  };
  const payload = safeOpPayloadV07(
    operation,
    {
      entryPointVersion: '0.7',
      entryPoint: Wallet.createRandom().address,
      chainId: '0x2105',
    },
    Wallet.createRandom().address,
    '0',
    String(Math.floor(Date.now() / 1000) + 60),
  );
  const action = safeOpActionV07(
    payload,
    { accountId: randomUUID(), address: wallet.address },
    randomUUID(),
    randomUUID(),
  );
  expect(payload.domain.chainId).toBe('8453');
  expect(action.chain_id).toBe('eip155:8453');
  expect(action.chain_account_id).toBe('eip155:8453:' + wallet.address);
});
