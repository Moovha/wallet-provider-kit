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
