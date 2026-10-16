import { test, expect } from '@playwright/test';
import { createServer } from '../../dist/service/server.js';
import { AuthenticationError } from '../../dist/service/auth.js';
import { WalletProviderError } from '../../dist/domain/signing.js';
import type { EmbeddedWalletService } from '../../dist/domain/embedded-wallet.js';

// Offline HTTP fixture: no vendor adapters, keys, identity data or financial effects.
let app: Awaited<ReturnType<typeof createServer>>;
let url: string;
let redirectsFollowed = 0;
const calls: { authorization?: string; scope: string }[] = [];
test.beforeAll(async () => {
  app = await createServer({
    documentation: true,
    configurationProfile: 'provider-service-v1',
    ready: async () => true,
    authenticate: async (authorization, scope) => {
      calls.push({ authorization, scope });
      if (authorization !== 'Bearer offline-application-token')
        throw new AuthenticationError(401);
      return {
        issuer: 'offline-fixture',
        subject: 'owner',
        clientId: 'app',
        scopes: [scope],
      };
    },
    service: {
      provision: async () => {
        throw new WalletProviderError('wallet_authorization_denied');
      },
    } as unknown as EmbeddedWalletService,
  });
  url = await app.listen({ host: '127.0.0.1', port: 0 });
});
test.afterAll(async () => {
  await app.close();
});

test('deployed Swagger executes same-origin HTTP and displays real success/auth/authority responses', async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(url)) external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page
    .context()
    .addCookies([{ name: 'offline-owner-session', value: 'fixture', url }]);
  await page.goto(`${url}/docs/`);
  await expect(
    page.getByRole('heading', { name: /Provider API · Live testing/ }),
  ).toBeVisible();
  await expect(page.locator('.opblock')).toHaveCount(21);
  const discovery = page.locator('#operations-Discovery-getCapabilities');
  await discovery.locator('.opblock-summary-control').click();
  await discovery
    .getByRole('button', { name: 'Try it out', exact: true })
    .click();
  expect(calls).toHaveLength(0);
  const success = page.waitForResponse(`${url}/v1/capabilities`);
  await discovery.getByRole('button', { name: 'Execute', exact: true }).click();
  const successResponse = await success;
  expect(successResponse.status()).toBe(200);
  expect((await successResponse.request().allHeaders()).cookie).toBeUndefined();
  await expect(discovery.locator('.responses-inner')).toContainText(
    '"configured": true',
  );
  await expect(discovery.locator('.responses-inner')).toContainText(
    'Request duration',
  );
  const provision = page.locator(
    '#operations-Wallet_accounts-provisionAccount',
  );
  await provision.locator('.opblock-summary-control').click();
  await expect(provision).toContainText('wallet:provision');
  await provision
    .getByRole('button', { name: 'Try it out', exact: true })
    .click();
  await provision
    .getByPlaceholder('accountId')
    .fill('10000000-0000-4000-8000-000000000001');
  await provision
    .getByPlaceholder('idempotency-key')
    .fill('10000000-0000-4000-8000-000000000002');
  const unauthorized = page.waitForResponse(
    `${url}/v1/accounts/10000000-0000-4000-8000-000000000001/provision`,
  );
  await provision.getByRole('button', { name: 'Execute', exact: true }).click();
  expect((await unauthorized).status()).toBe(401);
  await expect(provision.locator('.responses-inner')).toContainText(
    'invalid_token',
  );
  await page
    .getByRole('button', { name: 'Authorize', exact: true })
    .first()
    .click();
  await page.locator('.auth-container input').fill('offline-application-token');
  await page
    .locator('.auth-btn-wrapper')
    .getByRole('button', { name: 'Apply credentials', exact: true })
    .click();
  await page
    .locator('.auth-btn-wrapper')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  const denied = page.waitForResponse(
    `${url}/v1/accounts/10000000-0000-4000-8000-000000000001/provision`,
  );
  await provision.getByRole('button', { name: 'Execute', exact: true }).click();
  expect((await denied).status()).toBe(403);
  await expect(provision.locator('.responses-inner')).toContainText(
    'wallet_authorization_denied',
  );
  expect(calls.at(-1)).toEqual({
    authorization: 'Bearer offline-application-token',
    scope: 'wallet:provision',
  });
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page.reload();
  await page
    .getByRole('button', { name: 'Authorize', exact: true })
    .first()
    .click();
  await expect(page.locator('.auth-container input')).toHaveValue('');

  await page
    .locator('.auth-btn-wrapper')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.route('**/v1/capabilities', (route) =>
    route.fulfill({
      status: 302,
      headers: { location: `${url}/fixture-redirect-target` },
    }),
  );
  await page.route('**/fixture-redirect-target', (route) => {
    redirectsFollowed++;
    return route.fulfill({ json: {} });
  });
  const reloadedDiscovery = page.locator(
    '#operations-Discovery-getCapabilities',
  );
  await reloadedDiscovery.locator('.opblock-summary-control').click();
  await reloadedDiscovery
    .getByRole('button', { name: 'Try it out', exact: true })
    .click();
  await reloadedDiscovery
    .getByRole('button', { name: 'Execute', exact: true })
    .click();
  await expect(reloadedDiscovery).toContainText('Failed to fetch');
  expect(redirectsFollowed).toBe(0);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
