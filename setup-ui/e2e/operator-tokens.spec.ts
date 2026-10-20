import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createServer } from '../../dist/service/server.js';
import { AuthenticationError } from '../../dist/service/auth.js';
import type { DocumentationTokenOptions } from '../../dist/service/documentation-tokens.js';
import type { EmbeddedWalletService } from '../../dist/domain/embedded-wallet.js';
let app: Awaited<ReturnType<typeof createServer>>;
let url: string;
const sessionToken = randomBytes(32).toString('base64url');
const csrf = randomBytes(32).toString('base64url');
let issued = 0;
let operatorValid = true;
let apiCalls = 0;
const apiHeaders: (string | undefined)[] = [];
let holdToken: Promise<void> | undefined;
const started = Date.now();
const options: DocumentationTokenOptions = {
  origin: 'http://127.0.0.1',
  issuer: 'https://offline-operator.example',
  operators: ['operator'],
  applications: [
    {
      clientId: 'offline-app',
      name: 'Offline test application',
      scopes: ['wallet:provision', 'wallet:account:read'],
    },
  ],
  currentConfiguration: async () => true,
  login: {
    start: async () => 'https://offline-operator.example/authorize',
    finish: async () => ({ sessionToken, requestId: 'api-explorer' }),
    session: async (token) => {
      if (token !== sessionToken || !operatorValid)
        throw new AuthenticationError(401);
      return {
        csrf,
        identity: {
          issuer: 'https://offline-operator.example',
          subject: 'operator',
          authenticatedAt: Date.now(),
        },
      };
    },
  },
  issue: async (_client, scopes) => {
    const count = ++issued;
    await holdToken;
    return {
      access_token: `offline-application-${count}`,
      scope: scopes.join(' '),
      expires_at: started + count * 600000,
    };
  },
};
test.beforeAll(async () => {
  app = await createServer({
    documentation: true,
    configurationProfile: 'provider-service-v1',
    documentationTokens: options,
    ready: async () => true,
    authenticate: async (header, scope) => {
      apiCalls++;
      apiHeaders.push(header);
      if (header !== `Bearer offline-application-${issued}`)
        throw new AuthenticationError(401);
      return {
        issuer: 'offline',
        subject: 'app',
        clientId: 'offline-app',
        scopes: [scope],
      };
    },
    service: {
      provision: async (_context: unknown, accountId: string) => ({
        accountId,
        address: '0x1111111111111111111111111111111111111111',
      }),
    } as unknown as EmbeddedWalletService,
  });
  url = await app.listen({ host: '127.0.0.1', port: 0 });
  options.origin = url;
});
test.afterAll(async () => {
  await app.close();
});
test('operator gets and renews tokens without paste, Execute renews near expiry, and expired operator login prevents dispatch', async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: started });
  await page.goto(`${url}/docs/`);
  const panel = page.getByRole('region', {
    name: 'Application token controls',
  });
  await expect(panel.getByRole('status')).toContainText('Sign in');
  expect(issued).toBe(0);
  await page.context().addCookies([
    {
      name: '__Host-wpk-session',
      value: sessionToken,
      domain: '127.0.0.1',
      path: '/',
      secure: true,
    },
  ]);
  await panel.getByRole('button', { name: 'Check sign-in' }).click();
  await expect(panel.getByRole('status')).toContainText(
    'Signed in to token controls',
  );
  await panel
    .getByRole('checkbox', { name: /\(wallet:provision\)$/, exact: true })
    .check();
  await panel.getByRole('button', { name: 'Get token', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText(
    'Application token ready',
  );
  expect(issued).toBe(1);
  const provision = page.locator(
    '#operations-Wallet_accounts-provisionAccount',
  );
  await provision.locator('.opblock-summary-control').click();
  await provision
    .getByRole('button', { name: 'Try it out', exact: true })
    .click();
  await provision
    .getByPlaceholder('accountId')
    .fill('10000000-0000-4000-8000-000000000001');
  await provision
    .getByPlaceholder('idempotency-key')
    .fill('10000000-0000-4000-8000-000000000002');
  await provision.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(provision.locator('.responses-inner')).toContainText(
    'service_unavailable',
  );
  expect(apiCalls).toBe(1);
  await panel.getByRole('button', { name: 'Clear token', exact: true }).click();
  await provision.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(provision.locator('.responses-inner')).toContainText(
    'invalid_token',
  );
  expect(apiHeaders.at(-1)).toBeUndefined();
  await panel.getByRole('button', { name: 'Get token', exact: true }).click();
  await expect.poll(() => issued).toBe(2);
  await panel.getByRole('button', { name: 'Renew token', exact: true }).click();
  await expect.poll(() => issued).toBe(3);
  await page.clock.fastForward(1780000);
  await provision.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect.poll(() => issued).toBe(4);
  await expect.poll(() => apiCalls).toBe(3);
  operatorValid = false;
  await page.clock.fastForward(600000);
  await provision.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText(
    'Sign in again with an account allowed to use token controls',
  );
  expect(apiCalls).toBe(3);
  expect(issued).toBe(4);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page.reload();
  await expect(panel.getByRole('status')).toContainText('Sign in');
  expect(requests.filter((value) => !value.startsWith(url))).toEqual([]);
  expect(errors).toEqual([]);
});

test('clearing during issuance discards the arriving token and never silently changes caller', async ({
  page,
}) => {
  operatorValid = true;
  let release!: () => void;
  holdToken = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.context().addCookies([
    {
      name: '__Host-wpk-session',
      value: sessionToken,
      domain: '127.0.0.1',
      path: '/',
      secure: true,
    },
  ]);
  await page.goto(`${url}/docs/`);
  const panel = page.getByRole('region', {
    name: 'Application token controls',
  });
  await expect(panel.getByRole('status')).toContainText(
    'Signed in to token controls',
  );
  await panel
    .getByRole('checkbox', { name: /\(wallet:provision\)$/, exact: true })
    .check();
  const before = issued;
  await panel.getByRole('button', { name: 'Get token', exact: true }).click();
  await expect.poll(() => issued).toBe(before + 1);
  await panel.getByRole('button', { name: 'Clear token', exact: true }).click();
  release();
  holdToken = undefined;
  await expect(panel.getByRole('status')).toContainText(
    'Token selection changed',
  );
  const provision = page.locator(
    '#operations-Wallet_accounts-provisionAccount',
  );
  await provision.locator('.opblock-summary-control').click();
  await provision
    .getByRole('button', { name: 'Try it out', exact: true })
    .click();
  await provision
    .getByPlaceholder('accountId')
    .fill('10000000-0000-4000-8000-000000000001');
  await provision
    .getByPlaceholder('idempotency-key')
    .fill('10000000-0000-4000-8000-000000000002');
  await provision.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(provision.locator('.responses-inner')).toContainText(
    'invalid_token',
  );
  expect(apiHeaders.at(-1)).toBeUndefined();
});
