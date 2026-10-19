import { randomUUID } from 'node:crypto';
import type { EmbeddedWalletService } from '../../dist/domain/embedded-wallet.js';
import type { WalletCallsService } from '../../dist/wallet-calls/service.js';
import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../../dist/service/server.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
} from '../../dist/runtime-configuration/service.js';
import { defineOnboardingPolicy } from '../../dist/onboarding/policy.js';
import { openProviderDatabase } from '../../dist/storage/index.js';
import { AuthenticationError } from '../../dist/service/auth.js';

let app: Awaited<ReturnType<typeof createServer>>;
let db: ReturnType<typeof openProviderDatabase>;
let directory: string;
let url: string;
const issuer = 'https://issuer.example.test';
const principal = (provider: boolean) => ({
  issuer,
  clientId: provider ? 'operator' : 'application',
  subject: provider ? 'operator' : 'service',
  scopes: provider
    ? ['wallet:configuration:write']
    : [
        'wallet:configuration:read',
        'wallet:configuration:propose',
        'wallet:execute:read',
        'wallet:access:read',
      ],
});
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'wpk-workspace-browser-'));
  db = openProviderDatabase({ directory, initialize: true });
  await db.onboardingStore.transaction((state) => {
    state.deploymentBindings = {
      'service-v1': {
        origin: 'https://wallet.example.test',
        provider: 'offline',
        binding: 'offline',
        activeRevision: 'offline',
      },
    };
  });
  const policy = defineOnboardingPolicy({
    version: '1',
    provider: {
      name: 'Offline provider',
      origin: 'https://wallet.example.test',
      privacyUrl: 'https://wallet.example.test/privacy',
    },
    access: { mode: 'application' },
    identity: {
      application: { verificationLevel: 'verified', requiredFields: [] },
    },
    applications: [
      {
        issuer,
        clientId: 'application',
        name: 'Example application',
        assertionTrust: { agreement: 'offline' },
      },
    ],
  });
  const batch = {
    version: '2.0.0',
    id: 'offline-batch',
    chainId: '0x14a34',
    status: 100,
    atomic: true,
    account_id: '10000000-0000-4000-8000-000000000001',
    sender: '0x1111111111111111111111111111111111111111',
    application_id: runtimeApplicationId(issuer, 'application'),
    queue_stage: 'queued',
    policy_revision: '1',
    expires_at: '2030-01-01T00:00:00.000Z',
  };
  // UI-only batch presenter; financial authority and ledger isolation use configured-service tests.
  app = await createServer({
    ready: async () => true,
    service: {} as EmbeddedWalletService,
    walletCalls: {
      list: async () => ({ batches: [batch], truncated: false }),
      request: async (
        _principal: unknown,
        accountId: string,
        method: string,
        params: unknown[],
      ) => {
        expect(accountId).toBe(batch.account_id);
        expect(method).toBe('wallet_getCallsStatus');
        expect(params).toEqual([batch.id]);
        return {
          version: '2.0.0',
          id: batch.id,
          chainId: '0x14a34',
          status: 100,
          atomic: true,
        };
      },
    } as unknown as WalletCallsService,
    runtimeConfiguration: new RuntimeConfigurationService(
      policy,
      db.onboardingStore,
      { operators: [{ issuer, clientId: 'operator', subject: 'operator' }] },
      'offline',
    ),
    authenticate: async (authorization, scope) => {
      if (
        !['Bearer offline-app', 'Bearer offline-provider'].includes(
          authorization ?? '',
        )
      )
        throw new AuthenticationError(401);
      const caller = principal(authorization === 'Bearer offline-provider');
      if (!caller.scopes.includes(scope)) throw new AuthenticationError(403);
      return caller;
    },
  });
  url = await app.listen({ host: '127.0.0.1', port: 0 });
});
test.afterAll(async () => {
  await app?.close();
  await db?.close();
  await rm(directory, { recursive: true, force: true });
});

test('applications register methods and providers publish and allow subsequent automatic acceptance through forms', async ({
  page,
  context,
}) => {
  const browserErrors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith(url)) external.push(request.url());
  });
  await context.addCookies([
    { name: 'offline-session', value: 'fixture', url },
  ]);
  await page.goto(`${url}/operator/`);
  await expect(
    page.getByRole('heading', { name: 'Runtime workspace', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Access token', { exact: true }).fill('offline-app');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Register contracts', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add contract', exact: true }).click();
  await page
    .getByLabel('Contract address', { exact: true })
    .fill('0x1111111111111111111111111111111111111111');
  await page
    .getByLabel('Bytecode hash', { exact: true })
    .fill('0x' + '1'.repeat(64));
  await page
    .getByLabel('Method signature', { exact: true })
    .fill('deposit(uint256,address)');
  const submitted = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/proposals'),
  );
  await page.getByRole('button', { name: 'Submit registration' }).click();
  const submission = await submitted;
  expect((await submission.allHeaders()).cookie).toBeUndefined();
  await expect(
    page.getByText('Awaiting review', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByLabel('Access token', { exact: true })).toHaveValue(
    '',
  );
  await page
    .getByLabel('Access token', { exact: true })
    .fill('offline-provider');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page
    .getByRole('button', { name: 'Review proposal', exact: true })
    .click();
  await expect(
    page.getByLabel('Method signature', { exact: true }),
  ).toHaveValue('deposit(uint256,address)');
  await page
    .getByRole('button', { name: 'Publish policy', exact: true })
    .click();
  await expect(
    page.getByText('Published revision 1', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Registration review', { exact: true }),
  ).toHaveValue('automatic');
  await page
    .getByRole('button', { name: 'Allow contract registrations', exact: true })
    .click();
  await expect(
    page.getByText('Automatic contract registration allowed', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByLabel('Access token', { exact: true }).fill('offline-app');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByRole('button', { name: 'Add method', exact: true }).click();
  await page
    .getByLabel('Method signature', { exact: true })
    .nth(1)
    .fill('withdraw(uint256)');
  await page.getByRole('button', { name: 'Submit registration' }).click();
  await expect(
    page.getByText('Published revision 2', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Published as revision 2', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('withdraw(uint256) · 0 wei', { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Load batches', exact: true }).click();
  await expect(page.getByText('offline-batch', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Refresh status', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Batch offline-batch:' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '/tmp/wpk-runtime-workspace-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: '/tmp/wpk-runtime-workspace-desktop.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByLabel('Access token', { exact: true })).toHaveValue(
    '',
  );
  expect(browserErrors).toEqual([]);
  expect(external).toEqual([]);
});

test('address discovery fills verified pins and selected methods, while ABI import covers unverified contracts', async ({
  page,
}) => {
  const address = '0x2222222222222222222222222222222222222222';
  const discoveryRequests: { url: string; headers: Record<string, string> }[] =
    [];
  await page.route(
    'https://sourcify.dev/server/v2/contract/84532/**',
    async (route) => {
      discoveryRequests.push({
        url: route.request().url(),
        headers: await route.request().allHeaders(),
      });
      if (!route.request().url().includes(address)) {
        await route.fulfill({
          status: 404,
          headers: { 'access-control-allow-origin': '*' },
          json: { error: 'not found' },
        });
        return;
      }
      await route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        json: {
          address,
          chainId: '84532',
          runtimeMatch: 'exact_match',
          runtimeBytecode: { onchainBytecode: '0x6001600055' },
          proxyResolution: { isProxy: false },
          abi: [
            'function deposit(uint256,address) payable',
            'function withdraw(uint256)',
            'event Deposit(address owner)',
          ],
        },
      });
    },
  );
  await page.goto(`${url}/operator/`);
  await page.getByLabel('Access token', { exact: true }).fill('offline-app');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Register contracts', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add contract', exact: true }).click();
  const contract = page.getByRole('group', { name: /^Contract \d+$/ }).last();
  await contract.getByLabel('Contract address', { exact: true }).fill(address);
  await contract
    .getByRole('button', { name: 'Load verified methods', exact: true })
    .click();
  await expect(
    contract.getByText(/2 methods loaded and selected/),
  ).toBeVisible();
  await expect(
    contract.getByLabel('Bytecode hash', { exact: true }),
  ).toHaveValue(/^0x[0-9a-f]{64}$/);
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveCount(2);
  await expect(
    contract.getByRole('checkbox', { name: /^deposit\(uint256,address\)/ }),
  ).toBeChecked();
  await contract
    .getByRole('checkbox', { name: /^withdraw\(uint256\)/ })
    .uncheck();
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveCount(1);
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveValue('deposit(uint256,address)');
  await contract.screenshot({ path: '/tmp/wpk-contract-discovery.png' });
  expect(discoveryRequests).toHaveLength(1);
  expect(discoveryRequests[0].headers.authorization).toBeUndefined();
  expect(discoveryRequests[0].headers.cookie).toBeUndefined();
  expect(discoveryRequests[0].headers.referer).toBeUndefined();
  expect(discoveryRequests[0].url).not.toContain('offline-app');
  await contract
    .getByLabel('Contract address', { exact: true })
    .fill('0x3333333333333333333333333333333333333333');
  await expect(
    contract.getByLabel('Bytecode hash', { exact: true }),
  ).toHaveValue('');
  await contract
    .getByRole('button', { name: 'Load verified methods', exact: true })
    .click();
  await expect(contract.getByRole('alert')).toContainText(
    'No Sourcify verification',
  );
  await contract.getByText('Upload or paste an ABI', { exact: true }).click();
  await contract.getByLabel('ABI JSON', { exact: true }).fill(
    JSON.stringify({
      abi: ['function firstMethod(uint)', 'function secondMethod(bytes32)'],
    }),
  );
  await contract
    .getByRole('button', { name: 'Import ABI', exact: true })
    .click();
  await expect(
    contract.getByLabel('Method signature', { exact: true }).first(),
  ).toHaveValue('firstMethod(uint256)');
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveCount(2);
  await contract.getByLabel('ABI file', { exact: true }).setInputFiles({
    name: 'contract-artifact.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ abi: ['function uploadedMethod(address)'] }),
    ),
  });
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveCount(1);
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveValue('uploadedMethod(address)');
  await contract.getByLabel('ABI JSON', { exact: true }).fill('not an ABI');
  await contract
    .getByRole('button', { name: 'Import ABI', exact: true })
    .click();
  await expect(contract.getByRole('alert')).toContainText('valid ABI JSON');
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveCount(1);
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveValue('uploadedMethod(address)');
  await contract
    .getByLabel('ABI JSON', { exact: true })
    .fill(
      JSON.stringify(
        Array.from(
          { length: 33 },
          (_, index) => `function method${index}(uint256)`,
        ),
      ),
    );
  await contract
    .getByRole('button', { name: 'Import ABI', exact: true })
    .click();
  await expect(contract.getByText(/33 methods found/)).toBeVisible();
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveCount(0);
  await contract.getByRole('checkbox', { name: /^method0\(uint256\)/ }).check();
  await expect(
    contract.getByLabel('Method signature', { exact: true }),
  ).toHaveValue('method0(uint256)');
  await page.setViewportSize({ width: 390, height: 844 });

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('providers publish optional adapter terms through forms and applications retain read-only terms', async ({
  page,
}) => {
  const headers = {
    authorization: 'Bearer offline-provider',
    'idempotency-key': randomUUID(),
  };
  const workspace = (
    await app.inject({
      method: 'GET',
      url: '/v1/runtime-configuration/workspace',
      headers,
    })
  ).json();
  const target = workspace.applications[0];
  const seed = await app.inject({
    method: 'POST',
    url: `/v1/runtime-configuration/applications/${target.application_id}/revisions`,
    headers,
    payload: {
      expected_revision: target.active_revision,
      policy: {
        version: '1',
        enabled: true,
        chain_id: 'eip155:84532',
        contracts: [
          {
            address: '0x1111111111111111111111111111111111111111',
            code_hash: '0x' + '1'.repeat(64),
            methods: [
              {
                signature: 'transfer(address,uint256)',
                maximum_value_wei: '0',
              },
            ],
          },
        ],
        maximum_calls: 4,
        maximum_native_value_wei: '0',
        max_validity_seconds: 300,
        claim_requirements: [],
      },
    },
  });
  expect(seed.statusCode).toBe(200);

  await page.goto(`${url}/operator/`);
  await page
    .getByLabel('Access token', { exact: true })
    .fill('offline-provider');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Add token transfer adapter',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Add token transfer adapter', exact: true })
    .click();
  await page
    .getByLabel('Transfer token registered contract', { exact: true })
    .selectOption('0x1111111111111111111111111111111111111111');
  await page
    .getByLabel('Allowed transfer recipients (one per line)', { exact: true })
    .fill('0x3333333333333333333333333333333333333333');
  await page
    .getByLabel('Maximum transfer amount (base units)', { exact: true })
    .fill('10');
  await page
    .getByLabel('Use a cumulative token allowance', { exact: true })
    .check();
  await page
    .getByLabel('Lifetime token allowance (base units)', { exact: true })
    .fill('50');
  await page
    .getByRole('region', { name: 'Optional policy adapters', exact: true })
    .screenshot({ path: '/tmp/wpk-runtime-policy-adapters.png' });
  const published = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/revisions'),
  );
  await page
    .getByRole('button', { name: 'Publish policy', exact: true })
    .click();
  const request = await published;
  expect(
    request.postDataJSON().policy.call_adapters.tokenTransfers[0]
      .lifetimeAmount,
  ).toBe('50');
  await expect(
    page.getByRole('status').filter({ hasText: 'Policy published' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByLabel('Access token', { exact: true }).fill('offline-app');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Add token transfer adapter',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByText('Current published requirements and pins', { exact: true })
    .click();
  await expect(
    page.getByText(/Cumulative allowance: 50 base units\./).first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
