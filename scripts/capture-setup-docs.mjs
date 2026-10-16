/** Recreate documentation screenshots using only the offline example configuration. */
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
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
sample.policy.applications[0].funding = {
  agreement: 'example-agreement-not-live',
  monthlyLimitMinor: 10000,
};
sample.reviewers = ['example-reviewer-subject'];
sample.backend.binding = 'acme-cdp-base-sepolia-01';
for (const route of ['importPrice', 'verificationPrice']) {
  sample.identity.didit[route] = {
    maximumMinor: 0,
    termsReference: 'example-free-test-terms-not-live',
  };
}
const output = new URL('../artifacts/setup-docs/', import.meta.url);
await mkdir(output, { recursive: true });
const token = 'offline-documentation-session';
const app = await createSetupServer({ token });
let browser;
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
  }
  console.log('Captured six offline wizard screens in artifacts/setup-docs.');
} finally {
  await browser?.close();
  await app.close();
}
