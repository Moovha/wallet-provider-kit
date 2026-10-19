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
  await page
    .getByText('Advanced wallet environment settings', { exact: true })
    .click();
  const bindingHelp = page.locator('[data-setting="binding"]');
  await bindingHelp.locator('summary').click();
  await expect(bindingHelp).toContainText('No vendor issues this value');
  await expect(bindingHelp).toContainText('Keep the generated ID unchanged');
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
  await step(page, 'Applications');
  await page.getByLabel('Access flow', { exact: true }).selectOption('hosted');
  await page
    .getByRole('button', {
      name: 'Configure hosted connections in Services',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('tab', { name: 'Services', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
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
    .getByRole('button', { name: 'Continue in Applications', exact: true })
    .click();
  await page
    .getByText('Didit verification: set an agreed price limit', {
      exact: true,
    })
    .click();
  const priceHelp = page.locator('[data-setting="priceMaximum"]');
  await priceHelp.locator('summary').click();
  await expect(priceHelp).toContainText('250 means USD 2.50');
  await expect(priceHelp).toContainText('explicitly agreed free route');
  await step(page, 'Applications');
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

test('an operator edits a compatibility CDP profile, exports valid files, and editing invalidates export', async ({
  page,
}) => {
  await imported(page);
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
  await page.getByRole('button', { name: 'Coinbase CDP', exact: true }).click();
  await page
    .getByText('Advanced wallet environment settings', { exact: true })
    .click();
  await page
    .getByLabel('Wallet environment name', { exact: true })
    .fill('acme-sepolia');
  await step(page, 'Applications');
  await page.getByLabel('Access flow', { exact: true }).selectOption('hosted');
  await step(page, 'Services');
  await page
    .getByLabel('Application authentication', { exact: true })
    .selectOption('external');
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
  await step(page, 'Applications');
  await page
    .getByText('Use application-supplied records for an unfunded evaluation', {
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel('Required record fields', { exact: true }),
  ).toHaveValue('display_name\ncountry');
  await step(page, 'Applications');
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
    .getByText('Advanced wallet environment settings', { exact: true })
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
  await step(page, 'Applications');
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
    .getByText('Advanced wallet environment settings', { exact: true })
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
  await step(page, 'Applications');
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
  await step(page, 'Applications');
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
  await page
    .getByText('Advanced CDP credential variables', { exact: true })
    .click();
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
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(55);
  await expect(
    page
      .getByText('Not enabled: Wallet operations are disabled in Deployment', {
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
  expect(spec.paths['/v1/enrollments'].post.summary).toContain('[Not enabled]');
  expect(spec.paths['/v1/actions/{actionId}/sign'].post.summary).toContain(
    '[Not enabled]',
  );
  expect(spec.servers).toEqual([{ url: sample.policy.provider.origin }]);
  await page
    .getByLabel('Find an endpoint', { exact: true })
    .fill('/v1/accounts/{accountId}/provision');
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(1);
  await expect(
    page.getByLabel('cURL request example', { exact: true }),
  ).toContainText('wallet.example.com/v1/accounts/');
  await page.getByLabel('Find an endpoint', { exact: true }).fill('');
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(55);
  await page
    .getByLabel('Example endpoint', { exact: true })
    .selectOption('signAction');
  await expect(
    page
      .getByText('Not enabled: Transfer signing is off in Applications', {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Setup configuration', exact: true })
    .click();
  await expect(page.getByLabel('Provider name', { exact: true })).toHaveValue(
    'Draft provider name',
  );
  await step(page, 'Applications');
  await page.getByText('Application access enabled', { exact: true }).click();
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  await page
    .getByLabel('Example endpoint', { exact: true })
    .selectOption('requestAccountAccess');
  await expect(
    page
      .getByText('This application is disabled in Applications', {
        exact: true,
      })
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
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(55);
  await page
    .getByLabel('Example endpoint', { exact: true })
    .selectOption('signAction');
  await expect(
    page
      .getByText(
        'Select the required permission for this application in Applications',
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
  const expandedOperations = page.locator(
    '.opblock.is-open .opblock-summary-control',
  );
  while (await expandedOperations.count())
    await expandedOperations.first().click();
  await page
    .locator('.swagger-ui')
    .screenshot({ path: 'artifacts/setup-api-endpoints.png' });
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
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(55);
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
    .getByRole('button', {
      name: 'Configure staff login in Services',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('tab', { name: 'Services', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page
    .getByRole('button', { name: 'Continue in Deployment', exact: true })
    .click();
  await expect(
    page.getByLabel('Enable application token controls for staff', {
      exact: true,
    }),
  ).toBeChecked();
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
  await expect(page.getByLabel('Use Didit', { exact: true })).toBeChecked();
  await step(page, 'Applications');
  const records = page.getByLabel(
    'Use application-supplied records for an unfunded evaluation',
    { exact: true },
  );
  await expect(records).not.toBeChecked();
  await page
    .getByText('Use application-supplied records for an unfunded evaluation', {
      exact: true,
    })
    .click();
  await page
    .getByLabel('Required record fields', { exact: true })
    .fill('display_name\ncountry\ncustomer_type');
  await step(page, 'Applications');
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
  await imported(page, config);
  await step(page, 'Applications');
  await expect(
    page.getByLabel('Required record fields', { exact: true }),
  ).toHaveValue('display_name\ncountry\ncustomer_type');
  await page
    .getByText('Use application-supplied records for an unfunded evaluation', {
      exact: true,
    })
    .click();
  await step(page, 'Services');
  await page.getByText('Use Didit', { exact: true }).click();
  await expect(
    page.getByLabel('Didit workflow ID', { exact: true }),
  ).toBeVisible();
  await step(page, 'Applications');
  await expect(
    page.getByLabel('Didit verification: set an agreed price limit', {
      exact: true,
    }),
  ).toBeVisible();
});

test('optional execution sponsor settings survive wizard import, edits and export without secrets', async ({
  page,
}) => {
  const config = structuredClone(sample);
  config.financial = {
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
  config.policy.applications[0].permissions = [
    'account:read',
    'transfers:request',
  ];
  config.activation.enabled = false;
  await imported(page, config);
  await step(page, 'Deployment');
  await page
    .getByText('Configure transfer execution and RPC verification', {
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel(
      'Automatically replace stuck transactions within approved fees',
      { exact: true },
    ),
  ).toBeChecked();
  await expect(
    page.getByLabel('Initial fee percentage in basis points', { exact: true }),
  ).toHaveValue('5000');
  await expect(
    page.getByLabel('Maximum replacement attempts', { exact: true }),
  ).toHaveValue('3');
  await page
    .getByLabel('Execution submission service', { exact: true })
    .selectOption('erc3009-relayer-v1');
  await page
    .getByLabel('Execution Relayer HTTPS origin', { exact: true })
    .fill('https://sponsor.example.test');
  await page
    .getByLabel('Accepted network genesis hash', { exact: true })
    .fill('0x' + '1'.repeat(64));
  await page
    .getByLabel('Accepted token runtime code hash', { exact: true })
    .fill('0x' + '2'.repeat(64));
  await page
    .getByLabel('Sponsor Relayer ID 1', { exact: true })
    .fill('sponsor');
  await page
    .getByLabel('Sponsor signer ID 1', { exact: true })
    .fill('sponsor-signer');
  await page
    .getByLabel('Sponsor address 1', { exact: true })
    .fill('0x3333333333333333333333333333333333333333');
  await page
    .getByLabel('Gas funding agreement reference 1', { exact: true })
    .fill('reviewed-offline-funding-agreement');
  await page.getByText('Advanced gas values in wei 1', { exact: true }).click();
  await page
    .getByLabel('Maximum fee per gas in wei 1', { exact: true })
    .fill('3000000000');
  await page
    .getByLabel('Maximum priority fee per gas in wei 1', { exact: true })
    .fill('1000000000');
  await page
    .getByLabel('L1 fee reserve in wei 1', { exact: true })
    .fill('1000000000000');
  await page
    .getByLabel('Lifetime gas budget in wei 1', { exact: true })
    .fill('10000000000000000');
  const first = await exported(page);
  expect(first.execution.profile).toBe('erc3009-relayer-v1');
  expect(first.execution.sponsors[0].gasLimit).toBe('500000');
  expect(first.execution.replacement).toBeUndefined();
  expect(first.execution.sponsors[0].maxFeePerGas).toBe('3000000000');
  expect(first.execution.rpc.endpoints).toEqual([
    { env: 'EXECUTION_RPC_PRIMARY_URL' },
    { env: 'EXECUTION_RPC_SECONDARY_URL' },
  ]);
  expect(first.activation.enabled).toBe(false);
  await imported(page, first);
  expect((await exported(page)).execution).toEqual(first.execution);
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download variable template', exact: true })
    .click();
  const variables = await readFile((await (await download).path())!, 'utf8');
  expect(variables).toContain('EXECUTION_RELAYER_API_KEY=\n');
  expect(variables).toContain('EXECUTION_RPC_PRIMARY_URL=\n');
});

test('designated execution configuration preserves provider selection, service-key references and neutral sponsor bindings', async ({
  page,
}) => {
  const config = structuredClone(sample);
  config.financial = {
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
  config.policy.applications[0].permissions = [
    'account:read',
    'transfers:request',
  ];
  config.policy.applications.push({
    ...config.policy.applications[0],
    clientId: 'second-app',
    name: 'Second App',
  });
  config.activation.enabled = false;
  config.execution = {
    profile: 'erc3009-executor-v1',
    service: {
      url: 'https://executor.example.test',
      providerId: 'application-sponsor',
      providerRevision: '1',
      signing: {
        id: 'wallet-2026',
        privateKey: { env: 'WALLET_SERVICE_PRIVATE' },
      },
      keys: [
        { id: 'executor-2026', publicKey: { env: 'EXECUTOR_SERVICE_PUBLIC' } },
      ],
    },
    rpc: {
      endpoints: [
        { env: 'EXECUTION_RPC_PRIMARY_URL' },
        { env: 'EXECUTION_RPC_SECONDARY_URL' },
      ],
      genesisHash: '0x' + '1'.repeat(64),
      tokenCodeHash: '0x' + '2'.repeat(64),
    },
    sponsors: [
      {
        clientId: config.policy.applications[0].clientId,
        accountId: '10000000-0000-4000-8000-000000000001',
        binding: {
          address: '0x3333333333333333333333333333333333333333',
          bindingRevision: '1',
        },
        fundingAgreement: 'offline-reviewed-agreement',
        gasLimit: '150000',
        maxFeePerGas: '3000000000',
        maxPriorityFeePerGas: '1000000000',
        l1FeeReserveWei: '1000000000000',
        lifetimeBudgetWei: '10000000000000000',
      },
    ],
    pollIntervalSeconds: 15,
    maxLogRange: 10000,
  };
  await imported(page, config);
  await step(page, 'Deployment');
  await expect(
    page.getByLabel('Execution submission service', { exact: true }),
  ).toHaveValue('erc3009-executor-v1');
  await expect(
    page.getByLabel('Sponsor Relayer ID 1', { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel('Execution provider revision', { exact: true })
    .fill('2');
  await page
    .getByRole('button', { name: 'Add application gas sponsor', exact: true })
    .click();
  await page
    .getByLabel('Execution application 2', { exact: true })
    .selectOption('second-app');
  await page
    .getByLabel('Sponsor address 2', { exact: true })
    .fill('0x4444444444444444444444444444444444444444');
  await page
    .getByLabel('Gas funding agreement reference 2', { exact: true })
    .fill('offline-second-agreement');
  await page.getByText('Advanced gas values in wei 2', { exact: true }).click();
  await page
    .getByLabel('Maximum fee per gas in wei 2', { exact: true })
    .fill('3000000000');
  await page
    .getByLabel('Maximum priority fee per gas in wei 2', { exact: true })
    .fill('1000000000');
  await page
    .getByLabel('L1 fee reserve in wei 2', { exact: true })
    .fill('1000000000000');
  await page
    .getByLabel('Lifetime gas budget in wei 2', { exact: true })
    .fill('10000000000000000');
  const result = await exported(page);
  expect(Object.keys(result.execution.sponsors[1].binding).sort()).toEqual([
    'address',
    'bindingRevision',
  ]);
  expect(result.execution.service.providerRevision).toBe('2');
  expect(result.execution.sponsors[0].binding).toEqual(
    config.execution.sponsors[0].binding,
  );
  expect(result.execution.relayer).toBeUndefined();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download variable template', exact: true })
    .click();
  const variables = await readFile((await (await download).path())!, 'utf8');
  expect(variables).toContain('WALLET_SERVICE_PRIVATE=\n');
  expect(variables).toContain('EXECUTOR_SERVICE_PUBLIC=\n');
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  await page
    .getByLabel('Example endpoint', { exact: true })
    .selectOption('executeTransfer');
  await expect(page.getByLabel('cURL request example')).toContainText(
    'Execution-Profile: erc3009-executor-v1',
  );
  await page
    .getByLabel('Example endpoint', { exact: true })
    .selectOption('checkExecutionAuthority');
  await expect(page.getByLabel('cURL request example')).toContainText(
    'SIGNED_SERVICE_REQUEST_PROOF',
  );
});

test('operators can configure and export contract-only execution policies without transfer signing', async ({
  page,
}) => {
  const config = JSON.parse(
    await readFile(
      new URL(
        '../../docs/provider.config.contracts.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await imported(page, config);
  await step(page, 'Deployment');
  await expect(
    page.getByLabel('Execution submission service', { exact: true }),
  ).toHaveValue('approved-evm-executor-v1');
  await expect(
    page.getByLabel('Enable approved contract-call policy', { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel('Accepted token runtime code hash', { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel('Maximum native value per operation (wei)', { exact: true })
    .fill('5');
  await page
    .getByLabel('Permitted function selectors (comma separated)', {
      exact: true,
    })
    .fill('0x12345678,0x87654321');
  await page
    .getByText('Permitted target uses an ERC-1967 implementation', {
      exact: true,
    })
    .click();
  await page
    .getByLabel('Permitted target implementation address', { exact: true })
    .fill('0xcccccccccccccccccccccccccccccccccccccccc');
  await page
    .getByLabel('Permitted target implementation runtime code hash', {
      exact: true,
    })
    .fill('0x' + '2'.repeat(64));
  const saved = await exported(page);
  expect(saved).not.toHaveProperty('financial');
  expect(saved.execution.rpc).not.toHaveProperty('tokenCodeHash');
  expect(saved.approvedCalls.policy.maximumNativeValueWei).toBe('5');
  expect(saved.approvedCalls.policy.contracts[0].selectors).toEqual([
    '0x12345678',
    '0x87654321',
  ]);
  expect(saved.approvedCalls.policy.contracts[0].implementation.codeHash).toBe(
    '0x' + '2'.repeat(64),
  );
  expect(saved.approvedCalls.policy.swaps[0].maximumInput).toBe('1000000');
  expect(saved.approvedCalls.policy.vaults[0].maximumAssets).toBe('1000000');
  await step(page, 'Deployment');
  await page
    .getByRole('heading', {
      name: 'Approved contract calls, swaps and vault deposits',
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'artifacts/setup-approved-calls.png',
    fullPage: true,
  });
});

test('operators can export per-Safe queue limits and multiple sponsors for one application', async ({
  page,
}) => {
  const config = JSON.parse(
    await readFile(
      new URL(
        '../../docs/provider.config.contracts.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const second = structuredClone(config.execution.sponsors[0]);
  second.accountId = '30000000-0000-4000-8000-000000000003';
  second.binding.address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  config.execution.sponsors.push(second);
  config.execution.sponsorPool = {
    strategy: 'round-robin',
    maxInFlightPerSponsor: 4,
  };
  await imported(page, config);
  await step(page, 'Deployment');
  await expect(
    page.getByLabel('Enable round-robin sponsor pools', { exact: true }),
  ).toBeChecked();
  await page
    .getByText('Enable durable per-Safe request queues', { exact: true })
    .click();
  await page
    .getByLabel('Maximum pending requests per Safe', { exact: true })
    .fill('12');
  await page
    .getByLabel('Maximum queue validity in seconds', { exact: true })
    .fill('180');
  await page
    .getByLabel('Maximum unfinished executions per sponsor', { exact: true })
    .fill('3');
  await page
    .getByText('Detect stuck execution and nonce problems', { exact: true })
    .click();
  await page
    .getByLabel('Stuck suspicion threshold in seconds', { exact: true })
    .fill('120');
  await page
    .getByText('Monitor payer balances, health and webhooks', { exact: true })
    .click();
  await page
    .getByLabel('Low gas balance threshold in wei', { exact: true })
    .fill('2000000000000000');
  await page
    .getByRole('button', { name: 'Add payer webhook', exact: true })
    .click();
  await page
    .getByLabel('Webhook destination ID', { exact: true })
    .fill('alerts');
  const saved = await exported(page);
  expect(saved.execution.recovery).toEqual({
    stuckAfterSeconds: 120,
    quarantineOnStuck: true,
  });
  expect(saved.operations).toEqual({
    pollIntervalSeconds: 15,
    lowBalanceWei: '2000000000000000',
    webhooks: [
      {
        id: 'alerts',
        endpoint: { env: 'PAYER_WEBHOOK_1_URL' },
        signingSecrets: [{ env: 'PAYER_WEBHOOK_1_SECRET' }],
      },
    ],
  });
  expect(saved.execution.safeQueue).toEqual({
    maxDepthPerSafe: 12,
    maxWaitSeconds: 180,
  });
  expect(saved.execution.sponsorPool).toEqual({
    strategy: 'round-robin',
    maxInFlightPerSponsor: 3,
  });
  expect(saved.execution.sponsors).toHaveLength(2);
  expect(saved.execution.sponsors[0].clientId).toBe(
    saved.execution.sponsors[1].clientId,
  );
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  await expect(page.locator('.swagger-ui .opblock')).toHaveCount(55);
  await page
    .getByLabel('Example endpoint', { exact: true })
    .selectOption('enqueueContractCall');
  await expect(page.getByLabel('cURL request example')).toContainText(
    '/v1/contract-call-requests',
  );
  await expect(page.getByLabel('cURL request example')).toContainText(
    'Idempotency-Key',
  );
});

test('replacement defaults are editable for future designated execution plans and survive configuration export', async ({
  page,
}) => {
  const config = JSON.parse(
    await readFile(
      new URL(
        '../../docs/provider.config.contracts.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await imported(page, config);
  await step(page, 'Deployment');
  await expect(
    page.getByLabel(
      'Automatically replace stuck transactions within approved fees',
      { exact: true },
    ),
  ).not.toBeChecked();
  await page
    .getByText(
      'Automatically replace stuck transactions within approved fees',
      { exact: true },
    )
    .click();
  await expect(
    page.getByLabel('Initial fee percentage in basis points', { exact: true }),
  ).toHaveValue('5000');
  await page
    .getByLabel('Initial fee percentage in basis points', { exact: true })
    .fill('6000');
  await page
    .getByLabel('Maximum replacement attempts', { exact: true })
    .fill('2');
  const saved = await exported(page);
  expect(saved.execution.replacement).toEqual({
    initialFeeBasisPoints: 6000,
    bumpBasisPoints: 1250,
    maxAttempts: 2,
    intervalSeconds: 30,
  });
  expect(saved.execution.sponsors).toEqual(config.execution.sponsors);
  await imported(page, saved);
  expect((await exported(page)).execution).toEqual(saved.execution);
});

test('a new provider exports the bundled issuer, OWS vault and Caddy profile without external service registrations', async ({
  page,
}) => {
  await page
    .getByLabel('Provider name', { exact: true })
    .fill('Example Wallets');
  await page
    .getByLabel('Public wallet service address', { exact: true })
    .fill('https://wallet.example.test');
  await page
    .getByLabel('Privacy notice URL', { exact: true })
    .fill('https://wallet.example.test/privacy');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Wallet Standard', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByLabel('Wallet environment name', { exact: true }),
  ).not.toBeVisible();
  const binding = await page
    .getByLabel('Wallet environment name', { exact: true })
    .inputValue();
  expect(binding).toMatch(/^wallets-[0-9a-f-]{36}$/);
  await expect(
    page.getByLabel('OWS vault directory', { exact: true }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByLabel('Application authentication', { exact: true }),
  ).toHaveValue('bundled');
  await expect(
    page.getByLabel('Application token issuer', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('wallet:sign', { exact: true })).toBeChecked();
  await expect(
    page.getByLabel('wallet:sign', { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText('https://wallet.example.test/oauth', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByLabel('Application name', { exact: true })
    .fill('Example Server');
  await expect(
    page.getByLabel('Application client ID', { exact: true }),
  ).not.toBeVisible();
  const clientId = await page
    .getByLabel('Application client ID', { exact: true })
    .inputValue();
  expect(clientId).toMatch(/^application-[0-9a-f-]{36}$/);
  await expect(
    page.getByLabel('Policy version', { exact: true }),
  ).not.toBeVisible();
  await page
    .getByLabel('Application identity and consent trust agreement', {
      exact: true,
    })
    .fill('reviewed-example-agreement');
  await expect(
    page.getByLabel('Enable runtime configuration', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel('Operator OAuth client ID', { exact: true }),
  ).not.toBeVisible();
  const operatorId = await page
    .getByLabel('Operator OAuth client ID', { exact: true })
    .inputValue();
  expect(operatorId).toMatch(/^operator-[0-9a-f-]{36}$/);
  await expect(
    page.getByLabel('Operator token subject', { exact: true }),
  ).toHaveValue(operatorId);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByLabel('HTTPS gateway', { exact: true })).toHaveValue(
    'caddy',
  );
  await expect(
    page.getByLabel('Service port', { exact: true }),
  ).not.toBeVisible();
  const config = await exported(page);
  expect(config.backend.binding).toBe(binding);
  expect(config.backend.kind).toBe('ows');
  expect(config.authorizationServer.operatorClients).toEqual([
    expect.objectContaining({ clientId: operatorId }),
  ]);
  expect(config.http.ingress).toBe('caddy');
  expect(config.activation.enabled).toBe(false);
  expect(config.authorizationServer.clients).toEqual([
    expect.objectContaining({
      clientId,
      scopes: expect.arrayContaining([
        'wallet:access',
        'wallet:access:read',
        'wallet:account:read',
        'wallet:provision',
        'wallet:configuration:propose',
        'wallet:sign',
      ]),
    }),
  ]);
  expect(config.oauth).toEqual({
    issuer: 'https://wallet.example.test/oauth',
    audience: 'https://wallet.example.test/api',
    jwksUrl: 'https://wallet.example.test/oauth/jwks',
  });
  await imported(page, config);
  const restored = await exported(page);
  expect(restored).toEqual(config);
});

test('shared execution is prebundled without wizard sponsors, RPCs or contract policies', async ({
  page,
}) => {
  await step(page, 'Services');
  await expect(
    page.getByLabel('Local execution engine', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Local setup starts the execution engine'),
  ).toBeVisible();
  await step(page, 'Applications');
  await expect(page.getByLabel('Access flow', { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel('Required identity level', { exact: true }),
  ).not.toBeVisible();
  await step(page, 'Deployment');
  await expect(
    page.getByText('Configure transfer execution and RPC verification', {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel('Sponsor signer ID 1', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel('Execution submission service', { exact: true }),
  ).toHaveCount(0);
});

test('advanced overrides and additional bundled registrations retain their identities across export and import', async ({
  page,
}) => {
  const bundled = JSON.parse(
    await readFile(
      new URL(
        '../../docs/provider.config.bundled.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await imported(page, bundled);
  await step(page, 'Backend');
  const environment = page.getByText('Advanced wallet environment settings', {
    exact: true,
  });
  await environment.focus();
  await environment.press('Enter');
  await page
    .getByLabel('Wallet environment name', { exact: true })
    .fill('reviewed-environment');
  await page.getByText('Advanced vault settings', { exact: true }).click();
  await page
    .getByLabel('OWS vault directory', { exact: true })
    .fill('private-vault');
  await page
    .getByLabel('OWS owner passphrase variable name', { exact: true })
    .fill('RETAINED_VAULT_PASSPHRASE');
  await step(page, 'Applications');
  await page
    .getByRole('button', { name: 'Add application', exact: true })
    .click();
  const applications = page.getByLabel('Application client ID', {
    exact: true,
  });
  expect(await applications.nth(0).inputValue()).toBe('application-1');
  const addedClient = await applications.nth(1).inputValue();
  expect(addedClient).toMatch(/^application-[0-9a-f-]{36}$/);
  await page
    .getByLabel('Application name', { exact: true })
    .nth(1)
    .fill('Second application');
  await page
    .getByLabel('Application identity and consent trust agreement', {
      exact: true,
    })
    .nth(1)
    .fill('reviewed-second-application');
  await page
    .getByLabel('Enable runtime configuration', { exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Add runtime operator', exact: true })
    .click();
  const operators = page.getByLabel('Operator OAuth client ID', {
    exact: true,
  });
  expect(await operators.nth(0).inputValue()).not.toBe(
    await operators.nth(1).inputValue(),
  );
  await step(page, 'Services');
  await page
    .getByText('Advanced application API permissions', { exact: true })
    .nth(1)
    .click();
  await page.getByText('wallet:actions:read', { exact: true }).nth(1).click();
  await step(page, 'Deployment');
  await page.getByText('Advanced deployment settings', { exact: true }).click();
  await page
    .getByLabel('Private data directory', { exact: true })
    .fill('private-data');
  await page.getByLabel('Service port', { exact: true }).fill('9090');
  const saved = await exported(page);
  expect(saved.backend).toEqual({
    ...bundled.backend,
    binding: 'reviewed-environment',
    vaultDirectory: 'private-vault',
    passphrase: { env: 'RETAINED_VAULT_PASSPHRASE' },
  });
  expect(saved.storage.directory).toBe('private-data');
  expect(saved.http.port).toBe(9090);
  expect(saved.policy.applications[1].clientId).toBe(addedClient);
  expect(saved.authorizationServer.clients[1].scopes).toContain(
    'wallet:actions:read',
  );
  expect(saved.authorizationServer.clients[0]).toEqual(
    bundled.authorizationServer.clients[0],
  );
  await imported(page, saved);
  expect(await exported(page)).toEqual(saved);
});

test('optional adapter forms preserve generic defaults and export exact gas display amounts', async ({
  page,
}) => {
  const config = JSON.parse(
    await readFile(
      new URL(
        '../../docs/provider.config.contracts.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await imported(page, config);
  await step(page, 'Deployment');
  await expect(
    page.getByText('No optional adapters selected.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Lifetime sponsorship budget (ETH) 1', { exact: true }),
  ).toHaveValue('0.01');
  await page
    .getByLabel('Lifetime sponsorship budget (ETH) 1', { exact: true })
    .fill('0.025000000000000001');
  await page
    .getByLabel('Maximum fee per gas (gwei) 1', { exact: true })
    .fill('4.25');
  await page
    .locator('section.feature-panel')
    .filter({
      has: page.getByRole('heading', {
        name: 'Application gas sponsor 1',
        exact: true,
      }),
    })
    .last()
    .screenshot({ path: '/tmp/wpk-gas-budget-forms.png' });
  await page
    .getByRole('button', { name: 'Add token transfer adapter', exact: true })
    .click();
  await page
    .getByLabel('Transfer token registered contract', { exact: true })
    .selectOption(config.approvedCalls.policy.contracts[0].address);
  await expect(
    page.getByLabel('Transfer token code hash', { exact: true }),
  ).toHaveValue(config.approvedCalls.policy.contracts[0].codeHash);
  await page
    .getByLabel('Allowed transfer recipients (one per line)', { exact: true })
    .fill('0x3333333333333333333333333333333333333333');
  await page
    .getByLabel('Maximum transfer amount (base units)', { exact: true })
    .fill('1000000');
  await expect(
    page.getByLabel('Use a cumulative token allowance', { exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel('Use a cumulative token allowance', { exact: true })
    .check();
  await expect(
    page.getByLabel('Lifetime token allowance (base units)', { exact: true }),
  ).toHaveValue('1000000');
  await page
    .getByLabel('Lifetime token allowance (base units)', { exact: true })
    .fill('5000000');
  await page
    .getByRole('region', { name: 'Optional policy adapters', exact: true })
    .screenshot({ path: '/tmp/wpk-wizard-policy-adapters.png' });
  await page
    .getByRole('button', {
      name: 'Use compatibility routes as optional adapters',
      exact: true,
    })
    .click();
  const saved = await exported(page);
  expect(saved.approvedCalls.policy.adapters.tokenTransfers[0]).toMatchObject({
    maximumAmount: '1000000',
    lifetimeAmount: '5000000',
    token: {
      address: config.approvedCalls.policy.contracts[0].address,
      codeHash: config.approvedCalls.policy.contracts[0].codeHash,
    },
  });
  expect(saved.approvedCalls.policy.adapters.swaps[0]).toMatchObject({
    ...config.approvedCalls.policy.swaps[0],
    id: config.approvedCalls.policy.swaps[0].id + '-adapter',
  });
  expect(saved.approvedCalls.policy.swaps).toEqual(
    config.approvedCalls.policy.swaps,
  );
  expect(saved.approvedCalls.policy.adapters.vaults[0]).toMatchObject({
    ...config.approvedCalls.policy.vaults[0],
    id: config.approvedCalls.policy.vaults[0].id + '-adapter',
  });
  expect(saved.execution.sponsors[0].lifetimeBudgetWei).toBe(
    '25000000000000001',
  );
  expect(saved.execution.sponsors[0].maxFeePerGas).toBe('4250000000');
  await imported(page, saved);
  await step(page, 'Deployment');
  await expect(
    page.getByLabel('Lifetime token allowance (base units)', { exact: true }),
  ).toHaveValue('5000000');
  await page
    .getByRole('button', { name: 'Remove token adapter 1', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Remove swap adapter 1', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Remove vault adapter 1', exact: true })
    .click();
  const generic = await exported(page);
  expect(generic.approvedCalls.policy).not.toHaveProperty('adapters');
  expect(generic.execution.sponsors).toEqual(saved.execution.sponsors);
});

test('ERC-3009 prefill requires an explicit cumulative opt-in and invalid gas decimals stay invalid', async ({
  page,
}) => {
  const config = JSON.parse(
    await readFile(
      new URL(
        '../../docs/provider.config.contracts.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const token = config.approvedCalls.policy.swaps[0].tokenIn;
  config.financial = {
    profile: 'provider-authorized-erc3009-v1',
    token: {
      address: token.address,
      name: 'Offline Token',
      version: '1',
      symbol: 'TEST',
      decimals: 6,
    },
    recipients: ['0x3333333333333333333333333333333333333333'],
    maximumAmount: '1000000',
    lifetimeAmount: '7000000',
    maxValiditySeconds: 300,
  };
  config.execution.rpc.tokenCodeHash = token.codeHash;
  await imported(page, config);
  await step(page, 'Deployment');
  await page
    .getByRole('button', { name: 'Add token transfer adapter', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Prefill from ERC-3009 policy', exact: true })
    .click();
  await expect(
    page.getByLabel('Transfer token address', { exact: true }),
  ).toHaveValue(token.address);
  await expect(
    page.getByLabel('Transfer token code hash', { exact: true }),
  ).toHaveValue(token.codeHash);
  await expect(
    page.getByLabel('Maximum transfer amount (base units)', { exact: true }),
  ).toHaveValue('1000000');
  await expect(
    page.getByLabel('Use a cumulative token allowance', { exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel('Use a cumulative token allowance', { exact: true })
    .check();
  await expect(
    page.getByLabel('Lifetime token allowance (base units)', { exact: true }),
  ).toHaveValue('7000000');
  await page
    .getByLabel('Maximum fee per gas (gwei) 1', { exact: true })
    .fill('0.0000000001');
  await expect(page.getByRole('alert')).toContainText(
    'at most 9 decimal places',
  );
  await page
    .getByLabel('Maximum fee per gas (gwei) 1', { exact: true })
    .fill('3');
  await page
    .getByLabel('Use a cumulative token allowance', { exact: true })
    .uncheck();
  const saved = await exported(page);
  expect(
    saved.approvedCalls.policy.adapters.tokenTransfers[0],
  ).not.toHaveProperty('lifetimeAmount');
  expect(saved.financial).toEqual(config.financial);
});

test('network selection defaults new drafts to Base and preserves omitted Sepolia imports', async ({
  page,
}) => {
  const selector = page.getByLabel('Blockchain network', { exact: true });
  await expect(selector).toHaveValue('base');
  await imported(page);
  await step(page, 'Provider');
  await expect(selector).toHaveValue('base-sepolia');
  expect(await exported(page)).not.toHaveProperty('network');
  await step(page, 'Provider');
  await selector.selectOption('base');
  expect((await exported(page)).network).toBe('base');
});

test('automatic Safe provisioning exports canonical pins without a static account and preserves existing bindings', async ({
  page,
}) => {
  const config = JSON.parse(
    await readFile(
      new URL(
        '../../docs/provider.config.contracts.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const { defaultLocalExecution, localSponsorIds, localExecutionOrigin } =
    await import('../../dist/deployment/local-execution-contract.js');
  config.localExecution = defaultLocalExecution();
  config.execution.local = true;
  delete config.execution.service;
  config.execution.relayer = {
    url: localExecutionOrigin,
    apiKey: config.localExecution.apiKey,
  };
  for (const s of config.execution.sponsors)
    s.binding = {
      ...localSponsorIds(s.accountId),
      address: 'managed',
      bindingRevision: '1',
    };
  await imported(page, config);
  await step(page, 'Deployment');
  await page
    .getByText('Automatically provision a Safe for each new wallet', {
      exact: true,
    })
    .click();
  await page
    .getByText('Enable durable per-Safe request queues', { exact: true })
    .click();
  await page
    .getByText('Enable round-robin sponsor pools', { exact: true })
    .click();
  await expect(
    page.getByLabel('Automatically provision a Safe for each new wallet', {
      exact: true,
    }),
  ).toBeChecked();
  let saved = await exported(page);
  expect(saved.execution.safeQueue).toBeDefined();
  expect(saved.execution.sponsorPool).toBeDefined();
  expect(saved.safeProvisioning.factory.address).toBe(
    '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
  );
  expect(saved.approvedCalls.policy.accounts).toEqual(
    config.approvedCalls.policy.accounts,
  );
  await step(page, 'Deployment');
  await page
    .getByRole('button', { name: 'Remove account binding', exact: true })
    .click();
  saved = await exported(page);
  expect(saved.approvedCalls.policy.accounts).toEqual([]);
  expect(saved.safeProvisioning.profile).toBe('safe-1.4.1');
});
