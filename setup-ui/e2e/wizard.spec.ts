import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createSetupServer } from '../../dist/deployment/setup-server.js';

let app: Awaited<ReturnType<typeof createSetupServer>>;
let url: string;
const token = 'browser-test-session';
const sample = JSON.parse(
  await readFile(
    new URL('../../docs/provider.config.hosted.example.json', import.meta.url),
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

test('a first-time host can understand the address and open contextual instructions with a keyboard', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await expect(
    page.getByText('Start with the address you plan to host'),
  ).toBeVisible();
  const address = page.getByLabel('Public wallet service address', {
    exact: true,
  });
  const help = page.locator('[data-setting="origin"]');
  await expect(help).toContainText('public web address');
  await expect(address).toHaveAttribute(
    'aria-describedby',
    (await help.getAttribute('id'))!,
  );
  const explanation = help.locator('summary');
  await explanation.focus();
  await explanation.press('Enter');
  await expect(help.locator('details')).toHaveAttribute('open', '');
  await expect(help).toContainText(
    'Choose a hostname under a domain you control',
  );
  await expect(help).toContainText(
    'Connected applications send wallet requests here',
  );
  await expect(help.getByRole('link')).toHaveAttribute(
    'href',
    'https://moovha.github.io/wallet-provider-kit/docs/operator-deployment.html#publish-through-https',
  );
  await address.fill('https://wallet.example.test');
  await explanation.press('Enter');
  await expect(address).toHaveValue('https://wallet.example.test');
  await page.setViewportSize({ width: 390, height: 844 });
  await explanation.press('Enter');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'artifacts/setup-guidance-mobile.png',
    animations: 'disabled',
  });
  await help.screenshot({
    path: 'artifacts/setup-field-help-mobile.png',
    animations: 'disabled',
  });
  expect(requests.filter((request) => !request.startsWith(url))).toEqual([]);
});

test('field guidance follows backend choices and explains service registrations, budgets and optional activation', async ({
  page,
}) => {
  await imported(page);
  await step(page, 'Backend');
  const bindingHelp = page.locator('[data-setting="binding"]');
  await bindingHelp.locator('summary').click();
  await expect(bindingHelp).toContainText('No vendor issues this value');
  await expect(bindingHelp).toContainText('Keep it unchanged');
  await page
    .getByRole('button', { name: 'Open Wallet Standard', exact: true })
    .click();
  await expect(page.locator('[data-setting="cdpKeyId"]')).toHaveCount(0);
  await expect(page.locator('[data-setting="vault"]')).toContainText(
    'private folder on your server',
  );
  await page
    .getByRole('button', { name: 'OpenZeppelin Relayer', exact: true })
    .click();
  const relayerHelp = page.locator('[data-setting="relayerOrigin"]');
  await relayerHelp.locator('summary').click();
  await expect(relayerHelp).toContainText('does not install a Relayer');
  await step(page, 'Services');
  await page.getByLabel('Access flow', { exact: true }).selectOption('hosted');
  await expect(
    page.getByRole('heading', {
      name: 'Access tokens for connected applications',
    }),
  ).toBeVisible();
  const audienceHelp = page.locator('[data-setting="audience"]');
  await audienceHelp.locator('summary').click();
  await expect(audienceHelp).toContainText('Register a dedicated API/resource');
  await expect(page.locator('.callout code')).toHaveText(
    `${sample.policy.provider.origin}/onboarding/callback`,
  );
  await page.getByText('Use Didit', { exact: true }).click();
  await page
    .getByText('Didit verification: set an agreed price limit', {
      exact: true,
    })
    .click();
  const priceHelp = page.locator('[data-setting="priceMaximum"]');
  await priceHelp.locator('summary').click();
  await expect(priceHelp).toContainText('250 means USD 2.50');
  await expect(priceHelp).toContainText('explicitly agreed free route');
  await step(page, 'Policies');
  const reviewerHelp = page.locator('[data-setting="reviewer"]');
  await reviewerHelp.locator('summary').click();
  await expect(reviewerHelp).toContainText('Do not enter an email');
  await page
    .getByText('Configure delegated transfer signing', {
      exact: true,
    })
    .click();
  await expect(page.locator('[data-setting="tokenDecimals"]')).toContainText(
    '1000000 base units means 1 token',
  );
  await step(page, 'Deployment');
  await expect(
    page.getByLabel('Enable wallet operations in this configuration', {
      exact: true,
    }),
  ).not.toBeChecked();
  const activationHelp = page.locator('[data-setting="activation"]');
  await activationHelp.locator('summary').click();
  await expect(activationHelp).toContainText(
    'The deployed service refuses wallet operations',
  );
  await page
    .getByText('Enable wallet operations in this configuration', {
      exact: true,
    })
    .click();
  const evidenceHelp = page.locator('[data-setting="backendEvidence"]');
  await evidenceHelp.locator('summary').click();
  await expect(evidenceHelp).toContainText('Complete the staging tests first');
  await step(page, 'Export');
  await expect(
    page.getByRole('heading', { name: 'Review your configuration' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Validation does not test credentials, connect external services or deploy your wallet service.',
      { exact: false },
    ),
  ).toBeVisible();
});

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
    .getByLabel('Public wallet service address', { exact: true })
    .fill('https://wallet.acme.example');
  await page
    .getByLabel('Privacy notice URL', { exact: true })
    .fill('https://acme.example/privacy');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose your wallet backend' }),
  ).toBeVisible();
  await page
    .getByLabel('Wallet environment name', { exact: true })
    .fill('acme-sepolia');
  await step(page, 'Services');
  await page.getByLabel('Access flow', { exact: true }).selectOption('hosted');
  await page
    .getByLabel('Login service issuer URL', { exact: true })
    .fill('https://login.acme.example');
  await page
    .getByLabel('Wallet login client ID', { exact: true })
    .fill('owner-login');
  await page
    .getByLabel('Application token issuer', { exact: true })
    .fill('https://applications.acme.example');
  await page
    .getByLabel('Wallet API audience', { exact: true })
    .fill('acme-wallets');
  await page
    .getByLabel('Token verification keys URL (JWKS)', { exact: true })
    .fill('https://applications.acme.example/jwks');
  await page
    .getByText('Use application-supplied records for an unfunded evaluation', {
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel('Required record fields', { exact: true }),
  ).toHaveValue('display_name\ncountry');
  await step(page, 'Policies');
  await page.getByLabel('Application name', { exact: true }).fill('Acme App');
  await page
    .getByLabel('Application client ID', { exact: true })
    .fill('acme-app');
  await expect(
    page.getByLabel('Application issuer', { exact: true }),
  ).toHaveValue('https://applications.acme.example');
  await page
    .getByLabel('Reviewer 1 account ID (sub)', { exact: true })
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
    .getByLabel('Wallet environment name', { exact: true })
    .fill('acme-ows');
  await expect(
    page.getByLabel('OWS vault directory', { exact: true }),
  ).toHaveValue('.provider-vault');
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
  await page
    .getByLabel('Sumsub recipient level name', { exact: true })
    .fill('recipient-level');
  await page
    .getByText('Sumsub import: set an agreed price limit', {
      exact: true,
    })
    .click();
  await page
    .getByLabel('Sumsub import price limit (USD cents)', { exact: true })
    .fill('25');
  await page
    .getByLabel('Sumsub import price agreement reference', { exact: true })
    .fill('contract-2026');
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
    .getByLabel('Wallet environment name', { exact: true })
    .fill('acme-relayer');
  await page
    .getByLabel('Relayer service address', { exact: true })
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
    .getByLabel('Signer wallet address', { exact: true })
    .fill('0x2222222222222222222222222222222222222222');
  await page
    .getByRole('button', { name: 'Remove signer 1', exact: true })
    .click();
  await expect(page.getByLabel('Relayer ID', { exact: true })).toHaveValue(
    'relayer-two',
  );
  await step(page, 'Policies');
  await page
    .getByText('Record an identity funding agreement for this application', {
      exact: true,
    })
    .click();
  await page
    .getByLabel('Funding agreement reference', { exact: true })
    .fill('agreement-one');
  await page
    .getByLabel('Monthly identity budget (USD cents)', { exact: true })
    .fill('500');
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
    .getByText('Configure delegated transfer signing', {
      exact: true,
    })
    .click();
  await page
    .getByLabel('Token contract address', { exact: true })
    .fill('0x3333333333333333333333333333333333333333');
  await page
    .getByLabel('Token signing-domain name', { exact: true })
    .fill('Example Token');
  await page
    .getByLabel('Token signing-domain version', { exact: true })
    .fill('1');
  await page.getByLabel('Token symbol', { exact: true }).fill('TEST');
  await page
    .getByLabel('Maximum per transfer (base units)', { exact: true })
    .fill('1000000');
  await page
    .getByLabel('Total limit per account and token (base units)', {
      exact: true,
    })
    .fill('10000000');
  await page
    .getByLabel('Recipient 1 address', { exact: true })
    .fill('0x4444444444444444444444444444444444444444');
  await step(page, 'Deployment');
  await page
    .getByText('Enable wallet operations in this configuration', {
      exact: true,
    })
    .click();
  await page
    .getByLabel('Wallet backend test report reference', { exact: true })
    .fill('review/backend');
  await page
    .getByLabel('Recovery test report reference', { exact: true })
    .fill('review/recovery');
  await page
    .getByLabel('Token signing test report reference', { exact: true })
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
  await page
    .getByLabel('Reviewer 2 account ID (sub)', { exact: true })
    .fill(sample.reviewers[0]);
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
  const header = await page.locator('.topbar').boundingBox();
  const actions = await page.locator('.topbar-actions').boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(
    header!.y + header!.height,
  );
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
  await step(page, 'Backend');
  const secretName = page.getByLabel('CDP API key secret variable name', {
    exact: true,
  });
  await secretName.fill('not-a-variable');
  await secretName.blur();
  await expect(
    page.getByText('Enter a variable name using uppercase letters', {
      exact: false,
    }),
  ).toBeVisible();
  await secretName.fill('WALLET_CDP_API_KEY_SECRET');
  await step(page, 'Services');
  await page.getByLabel('Use Didit', { exact: true }).press('Space');
  await expect(
    page.getByLabel('Didit workflow ID', { exact: true }),
  ).toHaveCount(0);
  await step(page, 'Provider');
  await page
    .getByLabel('Public wallet service address', { exact: true })
    .fill('http://wallet.example.com');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('tab', { name: /^Provider/ }).click();
  await expect(
    page.getByText(
      'Enter https:// and your service hostname only, such as https://wallet.acme.com. Remove any trailing slash or page path.',
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
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(8);
  await expect(
    page
      .getByText('Wallet operations are disabled in Deployment', {
        exact: true,
      })
      .first(),
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
  await page.getByLabel('Find an endpoint', { exact: true }).fill('provision');
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(1);
  await expect(
    page.getByLabel('cURL request example', { exact: true }),
  ).toContainText('wallet.example.com/v1/accounts/');
  await page.getByLabel('Find an endpoint', { exact: true }).fill('');
  await page
    .getByLabel('Show transfer APIs even when transfer signing is off', {
      exact: true,
    })
    .check();
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(11);
  await page
    .getByLabel('Example endpoint', { exact: true })
    .selectOption('signAction');
  await expect(
    page
      .getByText('Transfer signing is off in Policies', { exact: true })
      .first(),
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
    .getByLabel('Example endpoint', { exact: true })
    .selectOption('requestAccountAccess');
  await expect(
    page
      .getByText('This application is disabled in Policies', { exact: true })
      .first(),
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
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(11);
  await page
    .getByLabel('Example endpoint', { exact: true })
    .selectOption('signAction');
  await expect(
    page
      .getByText(
        'Select the required permission for this application in Policies',
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await page
    .getByLabel('Application to preview', { exact: true })
    .selectOption('1');
  await expect(
    page
      .getByText('Settings are present; deployed access has not been checked', {
        exact: true,
      })
      .first(),
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
    'The API reference could not be loaded',
  );
  await page.unroute('**/reference/swagger-ui-bundle.js');
  await page
    .getByRole('button', { name: 'Reload API reference', exact: true })
    .click();
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(8);
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
    .getByLabel('Public wallet service address', { exact: true })
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
    .getByLabel('Public wallet service address', { exact: true })
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
    .getByText('Enable application token controls for staff', { exact: true })
    .click();
  await page
    .getByLabel('Token operator account IDs (sub)', { exact: true })
    .fill('auth0|offline-operator');
  await page
    .getByText(
      `Allow staff to get tokens for ${sample.policy.applications[0].name}`,
      {
        exact: true,
      },
    )
    .click();
  await expect(
    page.getByLabel('Application client secret variable name', { exact: true }),
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

test('hosted compatibility supports unfunded record evaluation without vendor credentials or signing', async ({
  page,
}) => {
  await imported(page);
  await step(page, 'Services');
  const records = page.getByLabel(
    'Use application-supplied records for an unfunded evaluation',
    { exact: true },
  );
  await expect(records).not.toBeChecked();
  await expect(page.getByLabel('Use Didit', { exact: true })).toBeChecked();
  await page
    .getByText('Use application-supplied records for an unfunded evaluation', {
      exact: true,
    })
    .click();
  await page
    .getByLabel('Required record fields', { exact: true })
    .fill('display_name\ncountry\ncustomer_type');
  await step(page, 'Policies');
  await expect(
    page.getByLabel('Configure delegated transfer signing', { exact: true }),
  ).toBeDisabled();
  const config = await exported(page);
  expect(config.policy.identity.records.requiredFields).toEqual([
    'display_name',
    'country',
    'customer_type',
  ]);
  expect(config.policy.applications[0].permissions).toEqual(['account:read']);
  expect(config.identity).toEqual({});
  expect(config.financial).toBeUndefined();
  const variables = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download variable template' })
    .click();
  expect(
    await readFile((await (await variables).path())!, 'utf8'),
  ).not.toContain('DIDIT');
});
