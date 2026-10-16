/** Recreate documentation screenshots using only the offline example configuration. */
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from '../dist/service/server.js';
import { createSetupServer } from '../dist/deployment/setup-server.js';

const sample = JSON.parse(
  await readFile(
    new URL('../docs/provider.config.example.json', import.meta.url),
    'utf8',
  ),
);
sample.policy.provider.name = 'Acme Wallets';
sample.policy.provider.origin = 'https://wallet.acme.example';
sample.policy.provider.privacyUrl = 'https://acme.example/privacy';
sample.policy.applications[0].name = 'Acme App';
sample.policy.applications[0].clientId = 'acme-app';
sample.backend.binding = 'acme-cdp-base-sepolia-01';
const output = new URL('../artifacts/setup-docs/', import.meta.url);
await mkdir(output, { recursive: true });
const token = 'offline-documentation-session';
const app = await createSetupServer({ token });
let browser;
let liveApp;
let tokenApp;
let localApp;
let localDirectory;
try {
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(`${url}/#${token}`);
  await page
    .getByLabel('Import provider configuration', { exact: true })
    .setInputFiles({
      name: 'provider.config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(sample)),
    });
  await page
    .getByRole('status')
    .filter({ hasText: 'Configuration imported' })
    .waitFor();
  for (const name of [
    'Provider',
    'Backend',
    'Services',
    'Policies',
    'Deployment',
    'Export',
  ]) {
    await page.getByRole('tab', { name, exact: true }).click();
    if (name === 'Export') {
      await page
        .getByRole('button', { name: 'Validate configuration', exact: true })
        .click();
      await page
        .getByRole('status')
        .filter({ hasText: 'Configuration valid' })
        .waitFor();
    }
    await page.screenshot({
      path: new URL(`${name.toLowerCase()}.png`, output).pathname,
      fullPage: true,
      animations: 'disabled',
    });
    if (name === 'Export') {
      await page.locator('.export-panel').screenshot({
        path: new URL('export-handoff.png', output).pathname,
        animations: 'disabled',
      });
    }
    if (name === 'Provider') {
      const help = page.locator('[data-setting="origin"] summary');
      await help.click();
      await page.screenshot({
        path: new URL('provider-guidance.png', output).pathname,
        fullPage: true,
        animations: 'disabled',
      });
      await help.click();
    }
  }
  await page
    .getByRole('button', { name: 'API reference', exact: true })
    .click();
  await page.locator('.swagger-ui .opblock').first().waitFor();
  await page.screenshot({
    path: new URL('api-reference.png', output).pathname,
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('.api-swagger').screenshot({
    path: new URL('api-endpoints.png', output).pathname,
    animations: 'disabled',
  });
  liveApp = await createServer({
    documentation: true,
    configurationProfile: 'provider-service-v1',
  });
  const liveUrl = await liveApp.listen({ host: '127.0.0.1', port: 0 });
  await page.goto(`${liveUrl}/docs/`);
  const discovery = page.locator('#operations-Discovery-getCapabilities');
  await discovery.locator('.opblock-summary-control').click();
  await discovery
    .getByRole('button', { name: 'Try it out', exact: true })
    .click();
  await discovery.getByRole('button', { name: 'Execute', exact: true }).click();
  await page
    .getByText('"configured": false', { exact: false })
    .first()
    .waitFor();
  await page.screenshot({
    path: new URL('api-live.png', output).pathname,
    fullPage: true,
    animations: 'disabled',
  });
  await discovery.screenshot({
    path: new URL('api-live-response.png', output).pathname,
    animations: 'disabled',
  });
  // Optional token configuration and issuance are demonstrated with offline fixtures only.
  await page.goto(`${url}/#${token}`);
  await page
    .getByLabel('Import provider configuration', { exact: true })
    .setInputFiles({
      name: 'provider.config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(sample)),
    });
  await page
    .getByRole('status')
    .filter({ hasText: 'Configuration imported' })
    .waitFor();
  await page.getByRole('tab', { name: 'Deployment', exact: true }).click();
  await page
    .getByText('Enable application token controls for staff', { exact: true })
    .click();
  await page
    .getByLabel('Token operator account IDs (sub)', { exact: true })
    .fill('auth0|example-operator');
  await page
    .getByText('Allow staff to get tokens for Acme App', {
      exact: true,
    })
    .click();
  await page
    .getByRole('region', { name: 'Integrated application tokens' })
    .screenshot({
      path: new URL('operator-token-setup.png', output).pathname,
      animations: 'disabled',
    });
  const operatorSession = randomBytes(32).toString('base64url');
  const controls = {
    origin: 'http://127.0.0.1',
    issuer: 'https://operator.acme.example',
    operators: ['example-operator'],
    applications: [
      {
        clientId: 'acme-test-app',
        name: 'Acme test application',
        scopes: ['wallet:access:read', 'wallet:account:read'],
      },
    ],
    currentConfiguration: async () => true,
    login: {
      start: async () => 'https://operator.acme.example/authorize',
      finish: async () => ({
        sessionToken: operatorSession,
        requestId: 'api-explorer',
      }),
      session: async () => ({
        csrf: 'x'.repeat(43),
        identity: {
          issuer: 'https://operator.acme.example',
          subject: 'example-operator',
          authenticatedAt: Date.now(),
        },
      }),
    },
    issue: async () => ({
      access_token: 'offline-documentation-fixture-not-a-JWT',
      expires_at: Date.now() + 600000,
      scope: 'wallet:account:read',
    }),
  };
  tokenApp = await createServer({
    documentation: true,
    configurationProfile: 'provider-service-v1',
    documentationTokens: controls,
  });
  const tokenUrl = await tokenApp.listen({ host: '127.0.0.1', port: 0 });
  controls.origin = tokenUrl;
  await page.goto(`${tokenUrl}/docs/`);
  const tokenPanel = page.getByRole('region', {
    name: 'Application token controls',
  });
  await tokenPanel
    .getByRole('checkbox', { name: /\(wallet:account:read\)$/, exact: true })
    .check();
  await tokenPanel
    .getByRole('button', { name: 'Get token', exact: true })
    .click();
  await tokenPanel
    .getByRole('status')
    .filter({ hasText: 'Application token ready' })
    .waitFor();
  await tokenPanel.screenshot({
    path: new URL('operator-tokens.png', output).pathname,
    animations: 'disabled',
  });
  const hostedRecords = JSON.parse(
    await readFile(
      new URL('../docs/provider.config.records.example.json', import.meta.url),
      'utf8',
    ),
  );
  await page.goto(`${url}/#${token}`);
  await page
    .getByLabel('Import provider configuration', { exact: true })
    .setInputFiles({
      name: 'provider.config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(hostedRecords)),
    });
  await page
    .getByRole('status')
    .filter({ hasText: 'Configuration imported' })
    .waitFor();
  await page.getByRole('tab', { name: 'Policies', exact: true }).click();
  await page.screenshot({
    path: new URL('application-record-policies.png', output).pathname,
    fullPage: true,
    animations: 'disabled',
  });
  // The executor fixture performs no Docker commands, database DDL or provider calls.
  localDirectory = await mkdtemp('/tmp/wpk-local-docs-');
  localApp = await createSetupServer({
    token,
    runtime: {
      environment: {},
      command: async (_file, args) => {
        if (args[0] === '--version') return 'offline';
        if (args[0] === 'context') return 'unix:///offline/docker.sock';
        if (args[0] === 'compose') return '2.40.0';
        if (args.includes('info')) return 'linux';
        return '';
      },
    },
    executor: {
      root: `${localDirectory}/deployments`,
      environment: {},
      command: async (args) => {
        if (args[0] === 'context') return 'unix:///offline/docker.sock';
        if (args.includes('version')) return '2.40.0';
        if (args.includes('info')) return 'linux';
        if (args.includes('ps')) return 'api';
        return '';
      },
    },
  });
  const localUrl = await localApp.listen({ host: '127.0.0.1', port: 0 });
  await page.goto(`${localUrl}/#${token}`);
  await page
    .getByLabel('Import provider configuration', { exact: true })
    .setInputFiles({
      name: 'provider.config.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(sample)),
    });
  await page
    .getByRole('status')
    .filter({ hasText: 'Configuration imported' })
    .waitFor();
  await page.getByRole('tab', { name: 'Export', exact: true }).click();
  await page
    .getByRole('button', { name: 'Validate configuration', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'Configuration valid' })
    .waitFor();
  await page
    .getByRole('button', {
      name: 'Check local setup prerequisites',
      exact: true,
    })
    .click();
  await page
    .getByRole('heading', { name: 'Supply deployment secrets', exact: true })
    .waitFor();
  for (const field of await page.locator('.secret-value').all())
    await field.fill('offline-documentation-value');
  await page
    .getByRole('button', { name: 'Start local setup', exact: true })
    .click();
  await page
    .getByRole('heading', {
      name: 'Local service running · wallet operations disabled',
      exact: true,
    })
    .waitFor();
  await page.locator('.local-setup').screenshot({
    path: new URL('local-setup.png', output).pathname,
    animations: 'disabled',
  });
  console.log(
    'Captured six wizard steps, the API reference and offline live responses in artifacts/setup-docs.',
  );
} finally {
  await browser?.close();
  await app.close();
  await liveApp?.close();
  await tokenApp?.close();
  await localApp?.close();
  if (localDirectory)
    await rm(localDirectory, { recursive: true, force: true });
}
