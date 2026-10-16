import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createSetupServer } from '../../dist/deployment/setup-server.js';

let app: Awaited<ReturnType<typeof createSetupServer>>;
let url: string;
const token = 'browser-test-session';
const sample = JSON.parse(
  await readFile(
    new URL('../../docs/provider.config.example.json', import.meta.url),
    'utf8',
  ),
);

test.beforeAll(async () => {
  app = await createSetupServer({ token });
  url = await app.listen({ host: '127.0.0.1', port: 0 });
});
test.afterAll(async () => {
  await app.close();
});
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(5000);
  page.on('pageerror', (error) =>
    console.error('Wizard browser error:', error.message),
  );
  await page.goto(`${url}/#${token}`);
  await expect(page.getByLabel('Provider name', { exact: true })).toBeVisible();
});
async function step(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}
async function imported(page: Page, config = sample) {
  await page
    .getByLabel('Import provider configuration', { exact: true })
    .setInputFiles({
      name: 'provider.config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(config)),
    });
  await expect(page.getByRole('status')).toContainText(
    'Configuration imported',
  );
}
async function exported(page: Page) {
  await step(page, 'Export');
  await page
    .getByRole('button', { name: 'Validate configuration', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Configuration valid');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download configuration', exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('provider.config.json');
  return JSON.parse(await readFile((await file.path())!, 'utf8'));
}

test('an operator configures CDP without JSON, exports valid files, and editing invalidates export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(url) && !request.url().startsWith('blob:'))
      external.push(request.url());
  });
  await page.getByLabel('Provider name', { exact: true }).fill('Acme Wallets');
  await page
    .getByLabel('Service HTTPS origin', { exact: true })
    .fill('https://wallet.acme.example');
  await page
    .getByLabel('Privacy notice URL', { exact: true })
    .fill('https://acme.example/privacy');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose your wallet backend' }),
  ).toBeVisible();
  await page
    .getByLabel('Stable backend binding', { exact: true })
    .fill('acme-sepolia');
  await step(page, 'Services');
  await page
    .getByLabel('Owner login issuer', { exact: true })
    .fill('https://login.acme.example');
  await page
    .getByLabel('Owner login client ID', { exact: true })
    .fill('owner-login');
  await page
    .getByLabel('Application token issuer', { exact: true })
    .fill('https://applications.acme.example');
  await page
    .getByLabel('Dedicated API audience', { exact: true })
    .fill('acme-wallets');
  await page
    .getByLabel('Application JWKS URL', { exact: true })
    .fill('https://applications.acme.example/jwks');
  await page
    .getByLabel('Didit workflow ID', { exact: true })
    .fill('00000000-0000-4000-8000-000000000001');
  await step(page, 'Policies');
  await page.getByLabel('Application name', { exact: true }).fill('Acme App');
  await page
    .getByLabel('Application client ID', { exact: true })
    .fill('acme-app');
  await expect(
    page.getByLabel('Application issuer', { exact: true }),
  ).toHaveValue('https://applications.acme.example');
  await page
    .getByLabel('Reviewer 1 login subject', { exact: true })
    .fill('reviewer-one');
  const config = await exported(page);
  expect(config.policy.provider.name).toBe('Acme Wallets');
  expect(config.backend.kind).toBe('cdp');
  expect(config.activation.enabled).toBe(false);
  expect(config.financial).toBeUndefined();
  expect(config.backend.apiKeySecret).toEqual({
    env: 'WALLET_CDP_API_KEY_SECRET',
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download checklist' }).click();
  expect(await readFile((await (await download).path())!, 'utf8')).toContain(
    'init-storage',
  );
  const variables = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download variable template' })
    .click();
  expect(await readFile((await (await variables).path())!, 'utf8')).toContain(
    'WALLET_CDP_API_KEY_SECRET=\n',
  );
  await page.screenshot({
    path: 'artifacts/setup-wizard-export.png',
    fullPage: true,
  });
  await step(page, 'Provider');
  await page
    .getByLabel('Provider name', { exact: true })
    .fill('Changed Provider');
  await step(page, 'Export');
  await expect(
    page.getByRole('button', { name: 'Download configuration' }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  expect(
    await page.evaluate(() => [
      localStorage.length,
      sessionStorage.length,
      location.hash,
    ]),
  ).toEqual([0, 0, '']);
});

test('OWS and Sumsub can be selected with their references and exported without adapter code', async ({
  page,
}) => {
  await imported(page);
  await step(page, 'Backend');
  await page
    .getByRole('button', { name: 'Open Wallet Standard', exact: true })
    .click();
  await page
    .getByLabel('Stable backend binding', { exact: true })
    .fill('acme-ows');
  await expect(page.getByLabel('OWS vault directory')).toHaveValue(
    '.provider-vault',
  );
  await expect(
    page.getByRole('link', { name: 'Open Wallet Standard documentation' }),
  ).toHaveAttribute('href', 'https://docs.openwallet.sh/');
  await page.screenshot({
    path: 'artifacts/setup-wizard-backends.png',
    fullPage: true,
  });
  await step(page, 'Services');
  await page.getByText('Use Didit', { exact: true }).click();
  await page.getByText('Use Sumsub', { exact: true }).click();
  await page.getByLabel('Sumsub recipient level name').fill('recipient-level');
  await page
    .getByText('Sumsub import: configure an agreed price bound', {
      exact: true,
    })
    .click();
  await page.getByLabel('Sumsub import maximum (USD cents)').fill('25');
  await page.getByLabel('Sumsub import terms reference').fill('contract-2026');
  const config = await exported(page);
  expect(config.backend).toEqual({
    kind: 'ows',
    binding: 'acme-ows',
    vaultDirectory: '.provider-vault',
    passphrase: { env: 'OWS_OWNER_PASSPHRASE' },
  });
  expect(config.identity.didit).toBeUndefined();
  expect(config.identity.sumsub.importPrice).toEqual({
    maximumMinor: 25,
    termsReference: 'contract-2026',
  });
});

test('Relayer signer pool, applications, financial policies and activation are configurable', async ({
  page,
}) => {
  await imported(page);
  await step(page, 'Backend');
  await page
    .getByRole('button', { name: 'OpenZeppelin Relayer', exact: true })
    .click();
  await page
    .getByLabel('Stable backend binding', { exact: true })
    .fill('acme-relayer');
  await page
    .getByLabel('Relayer HTTPS origin')
    .fill('https://relayer.acme.example');
  await page.getByLabel('Relayer ID', { exact: true }).fill('relayer-one');
  await page.getByLabel('Signer ID', { exact: true }).fill('signer-one');
  await page
    .getByLabel('Signer wallet address', { exact: true })
    .fill('0x1111111111111111111111111111111111111111');
  await page.getByRole('button', { name: 'Add signer', exact: true }).click();
  await page
    .getByRole('group', { name: 'Signer 2', exact: true })
    .getByLabel('Relayer ID', { exact: true })
    .fill('relayer-two');
  await page
    .getByRole('group', { name: 'Signer 2', exact: true })
    .getByLabel('Signer ID', { exact: true })
    .fill('signer-two');
  await page
    .getByRole('group', { name: 'Signer 2', exact: true })
    .getByLabel('Signer wallet address')
    .fill('0x2222222222222222222222222222222222222222');
  await page
    .getByRole('button', { name: 'Remove signer 1', exact: true })
    .click();
  await expect(page.getByLabel('Relayer ID', { exact: true })).toHaveValue(
    'relayer-two',
  );
  await step(page, 'Policies');
  await page
    .getByText(
      'Configure an application funding agreement for identity costs',
      { exact: true },
    )
    .click();
  await page.getByLabel('Funding agreement reference').fill('agreement-one');
  await page.getByLabel('Monthly identity budget (USD cents)').fill('500');
  await page
    .getByRole('button', { name: 'Add application', exact: true })
    .click();
  const second = page.getByRole('group', {
    name: 'Application 2',
    exact: true,
  });
  await second
    .getByLabel('Application name', { exact: true })
    .fill('Second app');
  await second
    .getByLabel('Application client ID', { exact: true })
    .fill('second-app');
  await page
    .getByRole('group', { name: 'Application 1', exact: true })
    .getByText('Request transfers on behalf of users', { exact: true })
    .click();
  await page
    .getByText('Configure provider-authorized transfer signing', {
      exact: true,
    })
    .click();
  await page
    .getByLabel('Token contract address')
    .fill('0x3333333333333333333333333333333333333333');
  await page.getByLabel('Token signing-domain name').fill('Example Token');
  await page.getByLabel('Token signing-domain version').fill('1');
  await page.getByLabel('Token symbol', { exact: true }).fill('TEST');
  await page.getByLabel('Maximum per action (base units)').fill('1000000');
  await page
    .getByLabel('Lifetime limit per account/token (base units)')
    .fill('10000000');
  await page
    .getByLabel('Recipient 1 address')
    .fill('0x4444444444444444444444444444444444444444');
  await step(page, 'Deployment');
  await page
    .getByText('Enable service activation in this export', { exact: true })
    .click();
  await page
    .getByLabel('Backend acceptance evidence reference')
    .fill('review/backend');
  await page
    .getByLabel('Recovery acceptance evidence reference')
    .fill('review/recovery');
  await page
    .getByLabel('Token acceptance evidence reference')
    .fill('review/token');
  const config = await exported(page);
  expect(config.backend.signers).toEqual([
    {
      relayerId: 'relayer-two',
      signerId: 'signer-two',
      address: '0x2222222222222222222222222222222222222222',
      bindingRevision: '1',
    },
  ]);
  expect(config.policy.applications).toHaveLength(2);
  expect(config.policy.applications[0].funding.monthlyLimitMinor).toBe(500);
  expect(config.financial.maximumAmount).toBe('1000000');
  expect(config.activation.tokenAcceptance).toBe('review/token');
});

test('invalid policies block exports, imports round-trip, and custom adapters stay advanced', async ({
  page,
}) => {
  await imported(page);
  expect(await exported(page)).toEqual(sample);
  await step(page, 'Policies');
  await page.getByRole('button', { name: 'Add reviewer', exact: true }).click();
  await page.getByLabel('Reviewer 2 login subject').fill(sample.reviewers[0]);
  await step(page, 'Export');
  await page
    .getByRole('button', { name: 'Validate configuration', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Remove duplicate entries',
  );
  await expect(
    page.getByRole('button', { name: 'Download configuration' }),
  ).toHaveCount(0);
  const custom = {
    ...sample,
    backend: { kind: 'custom', binding: 'advanced', module: './custom.mjs' },
  };
  await page
    .getByLabel('Import provider configuration', { exact: true })
    .setInputFiles({
      name: 'custom.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(custom)),
    });
  await expect(page.getByRole('alert')).toContainText('advanced setup guide');
});

test('mobile layout has usable controls and no horizontal page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Provider name', { exact: true })).toBeVisible();
  await step(page, 'Backend');
  await expect(
    page.getByRole('button', { name: 'Coinbase CDP', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'artifacts/setup-wizard-mobile.png',
    fullPage: true,
  });
});

test('step validation accepts variable names, shows HTTPS errors, and supports keyboard input', async ({
  page,
}) => {
  await imported(page);
  await step(page, 'Backend');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Services', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Use Didit', { exact: true }).press('Space');
  await expect(page.getByLabel('Didit workflow ID')).toHaveCount(0);
  await step(page, 'Provider');
  await page
    .getByLabel('Service HTTPS origin', { exact: true })
    .fill('http://wallet.example.com');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('tab', { name: /^Provider/ }).click();
  await expect(
    page.getByText(
      'Use only the HTTPS origin, without a trailing slash or path.',
    ),
  ).toBeVisible();
});

test('API reference follows the configuration, preserves edits, shows Swagger schemas and never dispatches requests', async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await imported(page);
  await step(page, 'Provider');
  await page
    .getByLabel('Provider name', { exact: true })
    .fill('Draft provider name');
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Provider API reference', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(6);
  await expect(
    page.getByText('Activation disabled', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Try it out', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Authorize', exact: true }),
  ).toHaveCount(0);
  await page
    .locator('.opblock-summary-control')
    .filter({ hasText: '/v1/access-requests' })
    .first()
    .click();
  await expect(page.locator('.opblock.is-open')).toContainText('consent_url');
  await expect(page.locator('.opblock.is-open')).toContainText(
    'authorization_details',
  );
  await expect(page.locator('.opblock.is-open')).toContainText('wallet:access');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download displayed OpenAPI' })
    .click();
  const spec = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  );
  expect(spec.paths['/v1/enrollments']).toBeUndefined();
  expect(spec.paths['/v1/actions/{actionId}/sign']).toBeUndefined();
  expect(spec.servers).toEqual([{ url: sample.policy.provider.origin }]);
  await page.getByLabel('Find an endpoint').fill('provision');
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(1);
  await expect(page.getByLabel('cURL request example')).toContainText(
    'wallet.example.com/v1/accounts/',
  );
  await page.getByLabel('Find an endpoint').fill('');
  await page
    .getByLabel('Show transfer APIs when the signing profile is not configured')
    .check();
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(9);
  await page.getByLabel('Example endpoint').selectOption('signAction');
  await expect(
    page.getByText('Transfer profile not configured', { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Setup configuration', exact: true })
    .click();
  await expect(page.getByLabel('Provider name', { exact: true })).toHaveValue(
    'Draft provider name',
  );
  await step(page, 'Policies');
  await page.getByText('Application access enabled', { exact: true }).click();
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  await page
    .getByLabel('Example endpoint')
    .selectOption('requestAccountAccess');
  await expect(
    page.getByText('Application disabled', { exact: true }).first(),
  ).toBeVisible();
  const financial = structuredClone(sample);
  financial.financial = {
    profile: 'provider-authorized-erc3009-v1',
    token: {
      address: '0x1111111111111111111111111111111111111111',
      name: 'Example Token',
      version: '1',
      symbol: 'TEST',
      decimals: 6,
    },
    recipients: ['0x2222222222222222222222222222222222222222'],
    maximumAmount: '100',
    lifetimeAmount: '1000',
    maxValiditySeconds: 300,
  };
  financial.activation = {
    enabled: true,
    backendAcceptance: 'offline-fixture/backend',
    recoveryAcceptance: 'offline-fixture/recovery',
    tokenAcceptance: 'offline-fixture/token',
  };
  financial.policy.applications[0].permissions = ['account:read'];
  financial.policy.applications.push({
    ...financial.policy.applications[0],
    clientId: 'second-app',
    name: 'Second App',
    permissions: ['account:read', 'transfers:request'],
  });
  await imported(page, financial);
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(9);
  await page.getByLabel('Example endpoint').selectOption('signAction');
  await expect(
    page
      .getByText('Application permission not allowed', { exact: true })
      .first(),
  ).toBeVisible();
  await page.getByLabel('Preview application').selectOption('1');
  await expect(
    page.getByText('Configured; runtime checks apply', { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Copy cURL example', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /Example copied|Clipboard unavailable/ }),
  ).toBeVisible();
  await page.screenshot({
    path: 'artifacts/setup-api-reference.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    requests.filter(
      (request) => !request.startsWith(url) && !request.startsWith('blob:'),
    ),
  ).toEqual([]);
  expect(
    requests.filter((request) => request.startsWith(url + '/v1/')),
  ).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => [
      localStorage.length,
      sessionStorage.length,
      location.hash,
    ]),
  ).toEqual([0, 0, '']);
});

test('API renderer can retry a failed bundled asset without losing setup', async ({
  page,
}) => {
  await imported(page);
  await page.route('**/reference/swagger-ui-bundle.js', (route) =>
    route.abort(),
  );
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'API renderer unavailable',
  );
  await page.unroute('**/reference/swagger-ui-bundle.js');
  await page
    .getByRole('button', { name: 'Retry API renderer', exact: true })
    .click();
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(6);
  await page
    .getByRole('button', { name: 'Setup configuration', exact: true })
    .click();
  await expect(page.getByLabel('Provider name', { exact: true })).toHaveValue(
    sample.policy.provider.name,
  );
});

test('operator enables live testing in the draft, exports the setting and retains setup state', async ({
  page,
}) => {
  await imported(page, {
    ...sample,
    http: { documentation: false, host: '127.0.0.1', port: 8080 },
  });
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  const link = page.getByRole('link', { name: 'Open deployed Try it out' });
  await expect(link).toHaveAttribute(
    'href',
    `${sample.policy.provider.origin}/docs/`,
  );
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await page
    .getByRole('button', { name: 'Enable deployed API explorer in draft' })
    .click();
  await expect(
    page.getByText('Explorer enabled in this draft.', { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Setup configuration', exact: true })
    .click();
  expect((await exported(page)).http.documentation).toBe(true);
  await step(page, 'Provider');
  await page
    .getByLabel('Service HTTPS origin', { exact: true })
    .fill('https://second.example.test');
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  await expect(link).toHaveAttribute(
    'href',
    'https://second.example.test/docs/',
  );
  await page
    .getByRole('button', { name: 'Setup configuration', exact: true })
    .click();
  await page
    .getByLabel('Service HTTPS origin', { exact: true })
    .fill('http://invalid.test');
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  await expect(link).toHaveCount(0);
});

test('operator configures GUI token issuance with explicit subjects, clients, scope limits and secret variable exports', async ({
  page,
}) => {
  await imported(page);
  await step(page, 'Deployment');
  await page
    .getByText('Enable operator token controls', { exact: true })
    .click();
  await page
    .getByLabel('Token operator login subjects', { exact: true })
    .fill('auth0|offline-operator');
  await page
    .getByText(`Allow GUI tokens for ${sample.policy.applications[0].name}`, {
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel('Application client secret variable', { exact: true }),
  ).toHaveValue('WALLET_EXPLORER_APP_1_SECRET');
  const config = await exported(page);
  expect(config.http.documentation).toBe(true);
  expect(config.apiExplorer).toEqual({
    operators: ['auth0|offline-operator'],
    clients: [
      {
        clientId: sample.policy.applications[0].clientId,
        clientSecret: { env: 'WALLET_EXPLORER_APP_1_SECRET' },
        scopes: ['wallet:access:read', 'wallet:account:read'],
      },
    ],
  });
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download variable template' })
    .click();
  expect(await readFile((await (await download).path())!, 'utf8')).toContain(
    'WALLET_EXPLORER_APP_1_SECRET=',
  );
});
