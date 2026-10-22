import {
  ManagementService,
  managementScopes,
} from '../src/management/service.js';
import { installationConfiguration } from '../src/deployment/installation.js';
import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProviderDatabase } from '../src/storage/index.js';
import { StorageConnection } from '../src/storage/connection.js';
import { schemaVersion } from '../src/storage/schema.js';
import { OnboardingService } from '../src/onboarding/service.js';
import type {
  AccessRequestInput,
  OnboardingPolicy,
} from '../src/onboarding/types.js';
import type { VerifiedPrincipal } from '../src/domain/principal.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { createServer } from '../src/service/server.js';
import {
  createNetworkResolver,
  type NetworkContext,
} from '../src/service/network-context.js';
import { ApplicationCredentialCipher } from '../src/runtime-configuration/credentials.js';
import { applicationGasBudgetId } from '../src/sponsorship/budget.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
} from '../src/runtime-configuration/service.js';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import { networkConfigurations } from '../src/deployment/network-configuration.js';
import { SupportedActions } from '../src/deployment/actions.js';
import { SafeWalletRuntime } from '../src/sponsorship/safe-wallet.js';
import type { WalletSigningProvider } from '../src/domain/signing.js';
import { fingerprint } from '../src/onboarding/policy.js';
import { createConfiguredProvider } from '../src/deployment/provider.js';
import { generateDeploymentSecrets } from '../src/deployment/deployment-secrets.js';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const principal: VerifiedPrincipal = {
  issuer: 'https://apps.example.test',
  subject: 'app',
  clientId: 'app',
  scopes: [
    'wallet:access',
    'wallet:access:read',
    'wallet:account:read',
    'wallet:configuration:read',
    'wallet:configuration:propose',
  ],
};
const policy: OnboardingPolicy = {
  version: 'offline-networks',
  provider: {
    name: 'Offline',
    origin: 'https://wallet.example.test',
    privacyUrl: 'https://wallet.example.test/privacy',
  },
  applications: [
    {
      issuer: principal.issuer,
      clientId: 'app',
      name: 'Offline app',
      permissions: ['account:read', 'members:manage'],
      assertionTrust: { agreement: 'offline' },
    },
  ],
  identity: {
    maxAgeDays: 90,
    application: { requiredFields: ['country'], verificationLevel: 'verified' },
  },
  access: { mode: 'application', maxAgeDays: 7 },
};
async function fixture(
  secondNetwork: 'ethereum' | 'ethereum-sepolia' = 'ethereum-sepolia',
) {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-networks-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const root = openProviderDatabase({ directory, initialize: true });
  const eth = openProviderDatabase({
    directory,
    networkScope: secondNetwork,
  });
  cleanup.push(async () => {
    root.close();
    eth.close();
  });
  const contexts: NetworkContext[] = [];
  for (const [index, database] of [root, eth].entries()) {
    const network = index === 0 ? 'base-sepolia' : secondNetwork;
    await database.onboardingStore.transaction((state) => {
      (state.deploymentBindings ??= {})['service-v1'] = {
        origin: policy.provider.origin,
        provider: 'offline',
        binding: 'offline',
        network,
        activeRevision: network,
      };
    });
    const onboarding = new OnboardingService(
      policy,
      database.onboardingStore,
      [],
      undefined,
      undefined,
      false,
      false,
      undefined,
      database.networkScope,
    );
    const runtime = new RuntimeConfigurationService(
      onboarding.policy,
      database.onboardingStore,
      { operators: [] },
      network,
      undefined,
      network,
    );
    await runtime.initialize();
    contexts.push({
      network,
      database,
      onboarding: { service: onboarding, network, reviewers: [] },
      runtimeConfiguration: runtime,
      service: {} as EmbeddedWalletService,
      currentConfiguration: async () => true,
      ready: async () => true,
      start: async () => {},
      close: async () => {},
    });
  }
  const app = await createServer({
    ...contexts[0],
    networkContexts: contexts,
    resolveNetwork: createNetworkResolver(contexts),
    authenticate: async () => principal,
    documentation: false,
  });
  cleanup.push(() => app.close());
  const input = (index: number, reuse = false): AccessRequestInput => ({
    mode: 'create',
    user: {
      id: 'offline-user',
      ...(!reuse
        ? {
            identity: {
              reference: 'offline-proof',
              level: 'verified',
              verified_at: new Date().toISOString(),
              fields: { country: 'ZA' },
            },
          }
        : {}),
      consent: {
        reference: randomUUID(),
        granted_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        policy_revision:
          contexts[index].onboarding!.service.accessPolicy(principal)
            .policy_revision,
      },
    },
    authorization_details: [
      {
        type: 'https://moovha.com/wallet/account-access',
        actions: ['account:read'],
      },
    ],
  });
  const request = (
    index: number,
    value: AccessRequestInput,
    key = randomUUID(),
  ) =>
    app.inject({
      method: 'POST',
      url: '/v1/access-requests',
      headers: {
        'idempotency-key': key,
        ...(index ? { 'wallet-network': contexts[index].network } : {}),
      },
      payload: value,
    });
  return { directory, root, eth, contexts, app, input, request };
}
it.each(['ethereum', 'ethereum-sepolia'] as const)(
  'shares identity with %s while retaining independent personal wallets, grants and consent',
  async (network) => {
    const f = await fixture(network);
    const evidence = new StorageConnection({ directory: f.directory });
    expect(evidence.get('PRAGMA user_version')?.user_version).toBe(
      schemaVersion,
    );
    expect(
      evidence
        .all('PRAGMA table_info(onboarding_records)')
        .map((row) => row.name),
    ).toEqual(['collection', 'id', 'record']);
    evidence.close();
    const firstInput = f.input(0);
    const first = await f.request(0, firstInput);
    expect(first.statusCode).toBe(200);
    const a = first.json();
    expect(a.status).toBe('granted');
    // The same identity can be reused, but its previous network's consent cannot.
    expect((await f.request(1, firstInput)).statusCode).toBe(403);
    const next = await f.request(1, f.input(1, true));
    expect(next.statusCode).toBe(200);
    const b = next.json();
    expect(b.account_id).not.toBe(a.account_id);
    expect(b.grant_id).not.toBe(a.grant_id);
    const profiles = await f.root.onboardingStore.transaction((state) =>
      Object.keys(state.verifiedUsers!),
    );
    expect(profiles).toHaveLength(1);
    expect(
      await f.eth.onboardingStore.transaction((state) =>
        Object.keys(state.verifiedUsers!),
      ),
    ).toEqual(profiles);
    for (const [index, receipt] of [a, b].entries()) {
      const selected = f.contexts[index];
      expect(
        await selected.database.onboardingStore.transaction(
          (state) => state.accounts[receipt.account_id].owner,
        ),
      ).toBe(profiles[0]);
      const list = await f.app.inject({
        method: 'POST',
        url: '/v1/accounts/query',
        headers: {
          'wallet-network': selected.network,
          'idempotency-key': randomUUID(),
        },
        payload: { user_id: 'offline-user' },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().accounts).toEqual([
        expect.objectContaining({
          account_id: receipt.account_id,
          is_default: true,
        }),
      ]);
      // Existing account and request URLs route by their stored IDs, without a selector.
      expect(
        (await f.app.inject({ url: '/v1/accounts/' + receipt.account_id }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await f.app.inject({
            url: '/v1/access-requests/' + receipt.request_id,
          })
        ).json().account_id,
      ).toBe(receipt.account_id);
    }
    expect(
      (
        await f.app.inject({
          url: '/v1/accounts/' + b.account_id,
          headers: { 'wallet-network': 'base-sepolia' },
        })
      ).statusCode,
    ).toBe(403);
    await expect(
      f.contexts[0].onboarding!.service.account(principal, b.account_id),
    ).rejects.toThrow();
    await expect(
      f.contexts[1].onboarding!.service.account(
        { ...principal, accessGrantId: a.grant_id },
        b.account_id,
      ),
    ).rejects.toThrow();
    const same = f.input(1, true),
      key = randomUUID();
    expect((await f.request(1, same, key)).json()).toEqual(
      (await f.request(1, same, key)).json(),
    );
  },
);
it('discovers networks and selects independent runtime policies without duplicating application registration', async () => {
  const f = await fixture();
  const discovered = (await f.app.inject({ url: '/v1/networks' })).json();
  expect(discovered.default_network).toBe('base-sepolia');
  expect(
    discovered.networks.map((entry: { chain_id: string }) => entry.chain_id),
  ).toEqual(['eip155:84532', 'eip155:11155111']);
  const applicationId = runtimeApplicationId(
    principal.issuer,
    principal.clientId,
  );
  for (const network of ['base-sepolia', 'ethereum-sepolia']) {
    const response = await f.app.inject({
      url: '/v1/application/policy',
      headers: { 'wallet-network': network },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().application_id).toBe(applicationId);
    const list = await f.app.inject({
      url: '/v1/applications/configurations',
      headers: { 'wallet-network': network },
    });
    expect(list.json().network).toBe(network);
  }
  const proposed = {
    expected_revision: '0',
    policy: {
      version: '1',
      enabled: false,
      chain_id: 'eip155:11155111',
      maximum_calls: 1,
      maximum_native_value_wei: '0',
      max_validity_seconds: 60,
      contracts: [],
      claim_requirements: [],
    },
  };
  const proposal = await f.app.inject({
    method: 'POST',
    url: '/v1/application/policy/proposals',
    headers: {
      'wallet-network': 'ethereum-sepolia',
      'idempotency-key': randomUUID(),
    },
    payload: proposed,
  });
  expect(proposal.statusCode).toBe(200);
  expect(proposal.json().policy.chain_id).toBe('eip155:11155111');
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: '/v1/application/policy/proposals',
        headers: {
          'wallet-network': 'base-sepolia',
          'idempotency-key': randomUUID(),
        },
        payload: proposed,
      })
    ).statusCode,
  ).toBe(422);
  expect(
    (
      await f.app.inject({
        url: '/v1/application/policy/proposals/' + proposal.json().proposal_id,
        headers: { 'wallet-network': 'base-sepolia' },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await f.app.inject({
        url: '/v1/access-policy',
        headers: { 'wallet-network': 'base' },
      })
    ).statusCode,
  ).toBe(422);
});
it('separates gas ledgers and encrypted keys, retaining legacy default IDs and ciphertext', async () => {
  const f = await fixture();
  const oldId = applicationGasBudgetId(
    policy.provider.origin,
    principal.issuer,
    principal.clientId,
  );
  const ethId = applicationGasBudgetId(
    policy.provider.origin,
    principal.issuer,
    principal.clientId,
    'ethereum-sepolia',
  );
  expect(ethId).not.toBe(oldId);
  await f.root.setBudget(oldId, '100', 'base-sepolia');
  await f.eth.setBudget(ethId, '7', 'ethereum-sepolia');
  expect(await f.root.budget(oldId)).toEqual({ maximum: '100', reserved: '0' });
  expect(await f.eth.budget(ethId)).toEqual({ maximum: '7', reserved: '0' });
  await expect(f.eth.setBudget(ethId, '20', 'base-sepolia')).rejects.toThrow();
  const token = '0x' + '1'.repeat(40);
  await f.root.ensureAssetBudget(
    policy.provider.origin,
    randomUUID(),
    token,
    '10',
    'base-sepolia',
  );
  await f.eth.ensureAssetBudget(
    policy.provider.origin,
    randomUUID(),
    token,
    '4',
    'ethereum-sepolia',
  );
  expect(
    await f.root.onboardingStore.transaction((state) =>
      Object.keys(state.assetBudgetBindings!),
    ),
  ).toHaveLength(1);
  expect(
    await f.eth.onboardingStore.transaction((state) =>
      Object.keys(state.assetBudgetBindings!),
    ),
  ).toHaveLength(1);
  const key = Buffer.alloc(32, 9).toString('base64');
  const normal = new ApplicationCredentialCipher(key),
    scoped = new ApplicationCredentialCipher(key, 'ethereum-sepolia');
  const metadata = {
    application_id: 'a'.repeat(64),
    reference: 'offline',
    revision: '1',
    origin: 'https://offline.example.test',
    status: 'active' as const,
  };
  const ciphertext = normal.seal(metadata, 'offline-value');
  expect(new ApplicationCredentialCipher(key).open(ciphertext)).toBe(
    'offline-value',
  );
  expect(() => scoped.open(ciphertext)).toThrow();
  expect(() => normal.open(scoped.seal(metadata, 'offline-other'))).toThrow();
});
it('fences removed network writers at both onboarding and financial transaction boundaries', async () => {
  const f = await fixture();
  await f.root.onboardingStore.transaction((state) => {
    state.deploymentBindings!['service-v1'].networkSetRevision = 'set-one';
  });
  const retained = openProviderDatabase({
    directory: f.directory,
    networkScope: 'ethereum-sepolia',
    expectedNetworkSetRevision: 'set-one',
  });
  cleanup.push(async () => retained.close());
  await retained.onboardingStore.transaction(() => undefined);
  await f.root.onboardingStore.transaction((state) => {
    delete state.deploymentBindings!['service-v1'].networkSetRevision;
  });
  await expect(
    retained.onboardingStore.transaction(() => undefined),
  ).rejects.toThrow();
  await expect(retained.setBudget('offline-budget', '1')).rejects.toThrow();
});
it('starts and restarts one configured instance with independent disabled network defaults, without RPC effects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-configured-networks-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const input = JSON.parse(
    await readFile('docs/provider.config.safe.example.json', 'utf8'),
  );
  input.network = 'base-sepolia';
  input.safeWallet.runtimeDirectory = '.provider-data/private-bundler';
  input.safeWallet.bundlerAuthorization = { env: 'OFFLINE_MULTI_BUNDLER' };
  input.additionalNetworks = [
    { network: 'ethereum-sepolia' },
    { network: 'ethereum' },
    { network: 'base' },
  ];
  input.storage.directory = join(directory, 'data');
  input.backend.vaultDirectory = join(directory, 'vault');
  await mkdir(input.backend.vaultDirectory, { mode: 0o700 });
  const config = validateProviderConfiguration(input);
  expect(networkConfigurations(config)[1].activation.enabled).toBe(false);
  expect(() =>
    validateProviderConfiguration({
      ...input,
      additionalNetworks: [{ network: 'base-sepolia' }],
    }),
  ).toThrow();
  for (const [name, value] of Object.entries(
    generateDeploymentSecrets(config, {}),
  ))
    vi.stubEnv(name, value);
  const db = openProviderDatabase({
    directory: input.storage.directory,
    initialize: true,
  });
  db.close();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('Offline only'));
  for (let i = 0; i < 2; i++) {
    const app = await createConfiguredProvider(config, directory);
    try {
      const response = await app.inject({ url: '/v1/networks' });
      expect(response.statusCode).toBe(200);
      expect(response.json().networks).toEqual([
        expect.objectContaining({ network: 'base-sepolia', configured: false }),
        expect.objectContaining({ network: 'base', configured: false }),
        expect.objectContaining({
          network: 'ethereum',
          chain_id: 'eip155:1',
          configured: false,
        }),
        expect.objectContaining({
          network: 'ethereum-sepolia',
          configured: false,
        }),
      ]);
    } finally {
      await app.close();
    }
  }
  config.additionalNetworks![0].activation = {
    enabled: true,
    backendAcceptance: 'Offline fixture',
    recoveryAcceptance: 'Offline fixture',
  };
  const independent = await createConfiguredProvider(config, directory);
  try {
    expect(
      (await independent.inject({ url: '/health/ready' })).statusCode,
    ).toBe(200);
    expect(
      (await independent.inject({ url: '/v1/execution-capabilities' })).json()
        .configured,
    ).toBe(false);
    expect(
      (
        await independent.inject({
          url: '/v1/execution-capabilities',
          headers: { 'wallet-network': 'ethereum-sepolia' },
        })
      ).json().configured,
    ).toBe(true);
  } finally {
    await independent.close();
  }
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['ethereum', 'ethereum-sepolia'] as const)(
  'retains distinct funding, executor and paymaster keys and private bundler routes on %s',
  async (network) => {
    const f = await fixture(network);
    const input = JSON.parse(
      await readFile('docs/provider.config.safe.example.json', 'utf8'),
    );
    input.network = 'base-sepolia';
    input.additionalNetworks = [{ network }];
    const configurations = networkConfigurations(input);
    const applicationId = runtimeApplicationId(
      principal.issuer,
      principal.clientId,
    );
    const fundingAddresses: string[] = [],
      executors: string[] = [],
      signers: string[] = [];
    const urls: string[] = [];
    for (const [index, context] of f.contexts.entries()) {
      configurations[index].activation.enabled = true;
      const resources = context.runtimeConfiguration!;
      vi.spyOn(resources, 'assertOperator').mockImplementation(() => {});
      vi.spyOn(resources, 'acceptedSponsorship').mockResolvedValue({
        value: { account_model: 'provider-controlled-user-safe' },
      } as Awaited<ReturnType<typeof resources.acceptedSponsorship>>);
      const rpc = vi
        .spyOn(resources, 'rpcEndpoints')
        .mockRejectedValue(Error('Offline boundary'));
      const cipher = new ApplicationCredentialCipher(
        Buffer.alloc(32, 3).toString('base64'),
        context.database.networkScope,
      );
      const actions = new SupportedActions(
        context.onboarding!.service,
        context.database,
        context.network,
        configurations[index].approvedCalls,
        context.network,
      );
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{}'));
      const runtime = new SafeWalletRuntime(
        configurations[index],
        context.database,
        resources,
        context.onboarding!.service,
        actions,
        {} as WalletSigningProvider,
        cipher,
        f.directory,
        'offline-bundler',
        request,
      );
      // Stop before RPC or contract creation; inspect only the durable local key allocation.
      await expect(
        runtime.ensure(
          { principal, idempotencyKey: randomUUID() },
          applicationId,
        ),
      ).rejects.toThrow('Offline boundary');
      const infrastructure = await context.database.onboardingStore.transaction(
        (state) => {
          const infra =
            state.deploymentBindings!['service-v1'].runtimeConfiguration!
              .safeWalletInfrastructure![applicationId];
          infra.paymaster = {
            address: '0x' + '1'.repeat(40),
            codeHash: '0x' + '2'.repeat(64),
          };
          return infra;
        },
      );
      fundingAddresses.push(infrastructure.fundingAddress);
      executors.push(infrastructure.executor.address);
      signers.push(infrastructure.paymasterSigner.address);
      rpc.mockResolvedValue(['https://offline-rpc.example.test']);
      await (
        runtime as unknown as { writeBundler(id: string): Promise<void> }
      ).writeBundler(applicationId);
      const scopedId = index
        ? fingerprint(['network-bundler-v1', context.network, applicationId])
        : applicationId;
      const document = JSON.parse(
        await readFile(
          join(
            f.directory,
            configurations[index].safeWallet!.runtimeDirectory,
            scopedId + '.json',
          ),
          'utf8',
        ),
      );
      expect(document.applicationId).toBe(scopedId);
      expect(document.chainId).toBe(
        index ? (network === 'ethereum' ? '0x1' : '0xaa36a7') : '0x14a34',
      );
      const transport = (
        runtime as unknown as { transport(id: string): typeof fetch }
      ).transport(applicationId);
      await transport('https://bundled-bundler.invalid/rpc/' + scopedId, {
        method: 'POST',
      });
      expect(request.mock.calls[0][0]).toBe(
        'http://bundler:3000/rpc/' + scopedId,
      );
      urls.push(scopedId);
    }
    for (const values of [fundingAddresses, executors, signers, urls])
      expect(new Set(values).size).toBe(2);
  },
);

it('lists every network wallet for one verified user and revokes all retained grants when shared user checks change', async () => {
  const f = await fixture();
  const a = (await f.request(0, f.input(0))).json();
  const b = (await f.request(1, f.input(1, true))).json();
  const management = new ManagementService(
    f.root.managementStore,
    f.root.managementSnapshot,
    principal.issuer,
    policy,
    undefined,
    f.root.accountNetwork,
  );
  const claim = randomBytes(48).toString('base64url'),
    password = randomBytes(32).toString('base64url');
  await management.initialize(claim);
  await management.claim({ claim, username: 'offline-admin', password });
  const admin = await management.verifyCredentials(
    'operator-offline-admin',
    password,
    managementScopes,
  );
  const users = await management.users(admin);
  expect(users.users).toHaveLength(1);
  const detail = await management.user(admin, users.users[0].id);
  expect(detail.wallets.map((wallet) => wallet.network).sort()).toEqual([
    'base-sepolia',
    'ethereum-sepolia',
  ]);
  await management.saveUserChecks(admin, randomUUID(), {
    expected_revision: 1,
    required_fields: ['country'],
    verification_level: 'verified',
    max_identity_age_days: 30,
    max_access_days: 2,
  });
  for (const [index, receipt] of [a, b].entries()) {
    const state = await f.contexts[index].database.onboardingStore.transaction(
      (state) => ({
        grant: state.grants[receipt.grant_id],
        request: state.requests[receipt.request_id],
        accounts: Object.keys(state.accounts),
      }),
    );
    expect(state.grant.state).toBe('revoked');
    expect(state.request.denied).toBe(true);
    expect(state.accounts).toEqual([receipt.account_id]);
  }
});
it('uses one durable application registration and OAuth identity on both configured networks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-managed-networks-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const config = installationConfiguration({
    name: 'Offline provider',
    origin: 'https://localhost',
    privacyUrl: 'https://localhost/privacy',
    additionalNetworks: ['ethereum-sepolia'],
  });
  config.storage.directory = join(directory, 'data');
  config.backend.vaultDirectory = join(directory, 'vault');
  await mkdir(config.backend.vaultDirectory, { mode: 0o700 });
  const secrets = generateDeploymentSecrets(config, {});
  for (const [name, value] of Object.entries(secrets)) vi.stubEnv(name, value);
  const database = openProviderDatabase({
    directory: config.storage.directory,
    initialize: true,
  });
  cleanup.push(async () => database.close());
  const app = await createConfiguredProvider(config, directory);
  cleanup.push(() => app.close());
  const management = new ManagementService(
    database.managementStore,
    database.managementSnapshot,
    config.oauth.issuer,
    config.policy,
  );
  const password = randomBytes(32).toString('base64url');
  await management.claim({
    claim: secrets.WALLET_INSTALLATION_CLAIM,
    username: 'offline-admin',
    password,
  });
  const admin = await management.verifyCredentials(
    'operator-offline-admin',
    password,
    managementScopes,
  );
  const created = (await management.mutate(admin, randomUUID(), 'create', {
    name: 'Offline application',
    role: 'application',
  })) as { id: string; client_secret: string };
  await management.mutate(admin, randomUUID(), 'update', {
    id: created.id,
    expected_revision: 1,
    trust_agreement: 'Offline application agreement',
    permissions: ['account:read'],
  });
  const response = await app.inject({
    method: 'POST',
    url: '/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: created.id,
      client_secret: created.client_secret,
      scope: 'wallet:configuration:read',
    }).toString(),
  });
  expect(response.statusCode).toBe(200);
  const authorization = 'Bearer ' + response.json().access_token;
  for (const network of ['base', 'ethereum-sepolia']) {
    const result = await app.inject({
      url: '/v1/applications/configurations',
      headers: { authorization, 'wallet-network': network },
    });
    expect(result.statusCode).toBe(200);
    expect(
      result
        .json()
        .applications.map(
          (entry: { application_id: string }) => entry.application_id,
        ),
    ).toEqual([runtimeApplicationId(config.oauth.issuer, created.id)]);
  }
  const choices = management.networkSettings(admin, [
    'base',
    'ethereum-sepolia',
  ]);
  const saveKey = randomUUID();
  const selected = {
    expected_revision: choices.revision,
    networks: ['base', 'base-sepolia', 'ethereum', 'ethereum-sepolia'] as const,
  };
  const saved = await management.saveNetworks(
    admin,
    saveKey,
    { ...selected, networks: [...selected.networks] },
    ['base', 'ethereum-sepolia'],
  );
  expect(
    await management.saveNetworks(
      admin,
      saveKey,
      { ...selected, networks: [...selected.networks] },
      ['base', 'ethereum-sepolia'],
    ),
  ).toEqual(saved);
  await expect(
    management.saveNetworks(
      admin,
      randomUUID(),
      { expected_revision: choices.revision, networks: ['base'] },
      ['base', 'ethereum-sepolia'],
    ),
  ).rejects.toThrow();
  await expect(
    management.saveNetworks(
      admin,
      randomUUID(),
      { expected_revision: saved.revision, networks: ['ethereum-sepolia'] },
      ['base', 'ethereum-sepolia'],
    ),
  ).rejects.toThrow();
  expect(
    (await app.inject({ url: '/v1/networks' }))
      .json()
      .networks.map((entry: { network: string }) => entry.network),
  ).toEqual(['base', 'ethereum-sepolia']);
  await app.close();
  const restarted = await createConfiguredProvider(config, directory);
  cleanup.push(() => restarted.close());
  expect(
    (await restarted.inject({ url: '/v1/networks' })).json().networks,
  ).toEqual([
    expect.objectContaining({ network: 'base', configured: false }),
    expect.objectContaining({ network: 'base-sepolia', configured: false }),
    expect.objectContaining({ network: 'ethereum', configured: false }),
    expect.objectContaining({ network: 'ethereum-sepolia', configured: false }),
  ]);
  await management.mutate(admin, randomUUID(), 'update', {
    id: created.id,
    expected_revision: 2,
    enabled: false,
  });
  for (const network of ['base', 'base-sepolia'])
    expect(
      (
        await restarted.inject({
          url: '/v1/applications/configurations',
          headers: { authorization, 'wallet-network': network },
        })
      ).statusCode,
    ).toBe(401);
});
