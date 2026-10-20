import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import { installationConfiguration } from '../../dist/deployment/installation.js';
import { ManagementService } from '../../dist/management/service.js';
import { createManagementAuthorizationServer } from '../../dist/management/authorization.js';
import { createServer } from '../../dist/service/server.js';
import { generateDeploymentSecrets } from '../../dist/deployment/deployment-secrets.js';
import type {
  ProviderState,
  OnboardingStore,
} from '../../src/onboarding/types.js';

test('claims, registers and manages applications through the real protected management API', async ({
  page,
}) => {
  const net = createNetServer();
  await new Promise<void>((resolve) => net.listen(0, '127.0.0.1', resolve));
  const port = (net.address() as { port: number }).port;
  await new Promise<void>((resolve) => net.close(() => resolve()));
  const config = installationConfiguration({
    name: 'Offline provider',
    origin: 'https://localhost',
    privacyUrl: 'https://localhost/privacy',
    localOrigin: `http://127.0.0.1:${port}`,
  });
  let state = {
    format: 'moovha-onboarding-1',
    requests: {},
    grants: {},
    audit: [],
  } as unknown as ProviderState;
  const store: OnboardingStore = {
    async transaction(work) {
      const next = structuredClone(state);
      const result = structuredClone(work(next));
      state = next;
      return result;
    },
  };
  const service = new ManagementService(
    store,
    () => structuredClone(state.management?.provider),
    config.oauth.issuer,
    config.policy,
  );
  const claim = randomBytes(48).toString('base64url'),
    password = randomBytes(32).toString('base64url');
  await service.initialize(claim);
  const previous = process.env.WALLET_OAUTH_SIGNING_KEY;
  process.env.WALLET_OAUTH_SIGNING_KEY = generateDeploymentSecrets(
    config,
    {},
  ).WALLET_OAUTH_SIGNING_KEY;
  const issuer = await createManagementAuthorizationServer(config, service);
  const app = await createServer({
    management: service,
    managementReady: async () => true,
    providerOrigin: config.policy.provider.origin,
    localManagementOrigin: config.management?.localOrigin,
    authenticate: issuer.authenticate,
    authorizationServer: issuer,
    ready: async () => false,
    documentation: false,
  });
  const url = await app.listen({ host: '127.0.0.1', port });
  try {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url + '/admin/');
    await page
      .getByRole('button', { name: 'Set up administrator', exact: true })
      .click();
    await page.getByLabel('Installation claim credential').fill(claim);
    await page.getByLabel('Administrator username').fill('offline-admin');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('button', { name: 'Create administrator' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your provider' }),
    ).toBeVisible();
    await expect(page.getByText('Disabled', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Applications', exact: true })
      .click();
    await expect(
      page.getByText('No applications connected.', { exact: false }),
    ).toBeVisible();
    await page
      .getByLabel('Application name', { exact: true })
      .fill('Offline application');
    await page
      .getByRole('button', { name: 'Register application', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Save this credential now' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'I have saved it' }).click();
    await expect(
      page.getByRole('heading', { name: 'Offline application' }),
    ).toBeVisible();
    await page
      .getByLabel('Identity and consent trust agreement reference')
      .fill('Offline trust agreement');
    await page.getByRole('button', { name: 'Save trust settings' }).click();
    await expect(
      page.getByText('Identity trust accepted', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Suspend', exact: true }).click();
    await expect(page.getByText('Suspended', { exact: false })).toBeVisible();
    await page.screenshot({
      path: 'artifacts/provider-installation/administration.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
    ).toBe(0);
    expect(errors).toEqual([]);
    let releaseResponse!: () => void, operationCreated!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const created = new Promise<void>((resolve) => {
      operationCreated = resolve;
    });
    await page.route('**/v1/provider/identities', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      operationCreated();
      await responseGate;
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    await page.getByLabel('Automation name').fill('Delayed offline automation');
    await page
      .getByRole('button', { name: 'Create automation identity', exact: true })
      .click();
    await created;
    const arriving = page.waitForResponse(
      (response) =>
        response.url().endsWith('/v1/provider/identities') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    releaseResponse();
    await arriving;
    await expect(page.getByRole('status')).toContainText('The session ended');
    await expect(page.locator('#credential-value')).toHaveText('');
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.WALLET_OAUTH_SIGNING_KEY;
    else process.env.WALLET_OAUTH_SIGNING_KEY = previous;
  }
});
