import { randomUUID } from 'node:crypto';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { readFile, mkdtemp, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { Wallet } from 'ethers';
import { afterEach, expect, it, vi } from 'vitest';
import {
  defaultLocalExecution,
  localExecutionOrigin,
  localSponsorIds,
} from '../src/deployment/local-execution-contract.js';
import {
  localExecutionFetch,
  prepareLocalExecution,
} from '../src/deployment/local-execution.js';
import { generateDeploymentSecrets } from '../src/deployment/deployment-secrets.js';
import {
  validateProviderConfiguration,
  type ProviderConfiguration,
} from '../src/deployment/config.js';
import {
  createSetupExecutor,
  localCompose,
} from '../src/deployment/setup-executor.js';
import { createTransferExecutionProvider } from '../src/execution/relayer.js';
import { executionFixture } from './helpers/execution.js';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function configuration() {
  return JSON.parse(
    await readFile(
      new URL('../docs/provider.config.bundled.example.json', import.meta.url),
      'utf8',
    ),
  ) as ProviderConfiguration;
}
async function managed() {
  const config = await configuration();
  const app = config.policy.applications[0];
  app.permissions!.push('transfers:request');
  app.funding = { agreement: 'offline-gas-agreement', monthlyLimitMinor: 0 };
  config.financial = {
    profile: 'provider-authorized-erc3009-v1',
    token: {
      address: Wallet.createRandom().address,
      name: 'Offline Token',
      symbol: 'TEST',
      version: '1',
      decimals: 6,
    },
    recipients: [Wallet.createRandom().address],
    maximumAmount: '100',
    lifetimeAmount: '150',
    maxValiditySeconds: 300,
  };
  config.execution = executionFixture(app.clientId).configuration;
  config.execution.local = true;
  config.execution.relayer = {
    url: localExecutionOrigin,
    apiKey: { ...config.localExecution!.apiKey },
  };
  const sponsor = config.execution.sponsors[0];
  sponsor.binding = {
    ...localSponsorIds(sponsor.accountId),
    address: 'managed',
    bindingRevision: '1',
  };
  return validateProviderConfiguration(config);
}
it('defaults to a private persistent engine without enabling financial operations', async () => {
  const config = validateProviderConfiguration(await configuration());
  expect(config.localExecution).toEqual(defaultLocalExecution());
  expect(config.execution).toBeUndefined();
  expect(config.activation.enabled).toBe(false);
  const prepared = prepareLocalExecution(
    config,
    generateDeploymentSecrets(config, {}),
  );
  expect(prepared.relayer.relayers).toEqual([]);
  expect(prepared.relayer.signers).toEqual([]);
  expect(prepared.keys).toEqual([]);
});
it('generates retained separate engine secrets and rejects weak retained values', async () => {
  const config = await configuration();
  const values = generateDeploymentSecrets(config, {});
  expect(
    Buffer.from(values.LOCAL_EXECUTION_STORAGE_KEY, 'base64'),
  ).toHaveLength(32);
  expect(generateDeploymentSecrets(config, values)).toEqual(values);
  expect(new Set(Object.values(values)).size).toBe(Object.keys(values).length);
  for (const name of [
    'LOCAL_EXECUTION_API_KEY',
    'LOCAL_EXECUTION_STORAGE_KEY',
    'LOCAL_EXECUTION_KEYSTORE_PASSPHRASE',
  ])
    expect(() =>
      generateDeploymentSecrets(config, { ...values, [name]: 'weak' }),
    ).toThrow();
});
it('rejects external overrides, credential aliases, altered bindings and premature activation', async () => {
  const config = await managed();
  for (const change of [
    (c: ProviderConfiguration) => {
      c.execution!.relayer!.url = 'https://other.example.test';
    },
    (c: ProviderConfiguration) => {
      delete c.localExecution;
    },
    (c: ProviderConfiguration) => {
      delete c.execution!.local;
    },
    (c: ProviderConfiguration) => {
      c.localExecution!.storageKey = c.localExecution!.apiKey;
    },
    (c: ProviderConfiguration) => {
      c.execution!.rpc.endpoints[0] = c.localExecution!.apiKey;
    },
    (c: ProviderConfiguration) => {
      c.execution!.sponsors[0].binding.signerId = 'external';
    },
    (c: ProviderConfiguration) => {
      c.activation.enabled = true;
    },
  ]) {
    const altered = structuredClone(config);
    change(altered);
    expect(() => validateProviderConfiguration(altered)).toThrow();
  }
});
it('creates an ephemeral encrypted sponsor keystore matching its durable public binding', async () => {
  const config = await managed();
  const values = generateDeploymentSecrets(config, {});
  values.EXECUTION_RPC_PRIMARY_URL = 'https://rpc-one.example.test';
  values.EXECUTION_RPC_SECONDARY_URL = 'https://rpc-two.example.test';
  const prepared = prepareLocalExecution(config, values);
  const encrypted = JSON.parse(prepared.keys[0].contents);
  expect(encrypted.crypto).toMatchObject({
    cipher: 'aes-128-ctr',
    kdf: 'scrypt',
  });
  expect(encrypted.Crypto).toBeUndefined();
  const wallet = await Wallet.fromEncryptedJson(
    prepared.keys[0].contents,
    values.LOCAL_EXECUTION_KEYSTORE_PASSPHRASE,
  );
  expect(wallet.address).toBe(config.execution!.sponsors[0].binding.address);
  expect(JSON.stringify(prepared.relayer)).not.toContain(wallet.privateKey);
  expect(prepared.relayer.signers[0].id!.length).toBeLessThanOrEqual(36);
  expect(prepared.relayer.relayers[0].policies.gas_price_cap).toBe(3000000000);
  expect(validateProviderConfiguration(config)).toEqual(config);
  expect(() => prepareLocalExecution(config, values)).toThrow();
});
it('pins the private peer and refuses arbitrary origins, queries, credentials and administration paths', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  const transport = localExecutionFetch(request);
  await transport(localExecutionOrigin + '/api/v1/relayers', { method: 'GET' });
  expect(request).toHaveBeenCalledWith(
    'http://local-execution:8080/api/v1/relayers',
    expect.objectContaining({ redirect: 'error', credentials: 'omit' }),
  );
  for (const url of [
    'https://other.example.test/api/v1/relayers',
    localExecutionOrigin + '/health',
    localExecutionOrigin + '/api/v1/relayers?key=x',
    'https://user:password@bundled-execution.invalid/api/v1/relayers',
  ]) {
    await expect(transport(url)).rejects.toThrow();
  }
  expect(request).toHaveBeenCalledTimes(1);
});
it('retains current authority and uncertain-response behavior through the existing execution adapter', async () => {
  const f = executionFixture();
  const request = (async (
    input: string | URL | Request,
    options?: RequestInit,
  ) =>
    f.request(
      String(input).replace(
        'http://local-execution:8080',
        f.configuration.relayer.url,
      ),
      options,
    )) as typeof fetch;
  const provider = createTransferExecutionProvider(
    {
      ...f.configuration,
      local: true,
      relayer: { ...f.configuration.relayer, url: localExecutionOrigin },
    },
    'ephemeral-offline-api-token',
    localExecutionFetch(request),
  );
  const plan = await f.plan();
  await provider.prepare(plan);
  const denied = async () => {
    throw new Error('revoked');
  };
  await expect(
    provider.submit(plan, {
      executionId: randomUUID(),
      request: createWalletAttemptRequest(
        'offline',
        'erc3009-relayer-v1',
        'relay_transaction',
        randomUUID(),
        randomUUID(),
        plan.action.action_id,
        plan,
      ),
      authorizeEffect: denied,
    }),
  ).rejects.toThrow('revoked');
  expect(f.state.posts).toBe(0);
  f.state.lostResponse = true;
  await expect(provider.submit(plan)).rejects.toMatchObject({
    outcome: 'unknown',
  });
  expect(f.state.posts).toBe(1);
});
it('rejects retired relayer and managed-pool deployment plans before effects', async () => {
  const config = await configuration();
  const root = await mkdtemp(join(tmpdir(), 'wpk-retired-engine-'));
  folders.push(root);
  const command = vi.fn(async () => '');
  const run = createSetupExecutor({ root, environment: {}, command });
  await expect(run.prepare(config)).rejects.toMatchObject({
    issues: [expect.stringContaining('only per-user Safe accounts')],
  });
  expect(command).not.toHaveBeenCalled();
});

it('renders mainnet Relayer identity without testnet metadata or financial activation', async () => {
  const config = await configuration();
  config.network = 'base';
  const prepared = prepareLocalExecution(
    config,
    generateDeploymentSecrets(config, {}),
  );
  expect(prepared.relayer.networks[0]).toMatchObject({
    network: 'base',
    chain_id: 8453,
    is_testnet: false,
    tags: ['mainnet'],
  });
  expect(prepared.relayer.networks[0].rpc_urls).toEqual([
    'https://mainnet.base.org',
    'https://base.drpc.org',
  ]);
  expect(prepared.relayer.relayers).toEqual([]);
});
