import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createSetupServer } from '../../dist/deployment/setup-server.js';

let app: Awaited<ReturnType<typeof createSetupServer>>;
let url: string;
const token = 'browser-test-session';
const sample = JSON.parse(
  await readFile(
    new URL('../../docs/provider.config.safe.example.json', import.meta.url),
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
  await page.goto(`${url}/?advanced#${token}`);
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
  await expect(page.getByRole('status')).toContainText('Settings imported');
}
async function exported(page: Page) {
  await step(page, 'Finish setup');
  await page
    .getByRole('button', { name: 'Check settings', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Settings checked');
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download configuration', exact: true })
    .click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}

test('exports one Safe execution flow and retains configuration across import', async ({
  page,
}) => {
  await imported(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const saved = await exported(page);
  await page.screenshot({
    path: 'artifacts/safe-default/wizard-export.png',
    fullPage: true,
  });
  expect(saved).toEqual(sample);
  expect(saved.safeWallet.profile).toBe('safe-only-4337-v1');
  for (const key of ['financial', 'execution', 'localExecution', 'operations'])
    expect(saved[key]).toBeUndefined();
  expect(saved.runtimeConfiguration.sharedApplicationSafes).toBeUndefined();
  expect(saved.runtimeConfiguration.executionPool).toBeUndefined();
  await imported(page, saved);
  expect(await exported(page)).toEqual(saved);
  await step(page, 'Provider');
  await page
    .getByLabel('Provider name', { exact: true })
    .fill('Changed Wallet Provider');
  await step(page, 'Finish setup');
  await expect(
    page.getByRole('button', {
      name: 'Download configuration',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('shows the bundled Safe infrastructure without backend, relayer or pool selectors', async ({
  page,
}) => {
  await step(page, 'Wallet storage');
  await expect(
    page.getByRole('heading', {
      name: 'A wallet for each person',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Coinbase CDP', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'OpenZeppelin Relayer', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel('Wallet environment name', { exact: true }),
  ).not.toBeVisible();
  await page.getByText('Advanced vault settings', { exact: true }).click();
  await expect(
    page.getByLabel('Private wallet folder', { exact: true }),
  ).toBeVisible();
  await step(page, 'Services');
  await expect(
    page.getByText(
      'Setup includes the private tools that send approved wallet transactions',
    ),
  ).toBeVisible();
  await step(page, 'Applications');
  await expect(page.getByLabel('Access flow', { exact: true })).toHaveCount(0);
  await step(page, 'Deployment');
  for (const name of [
    'Sponsor signer ID 1',
    'Execution submission service',
    'Execution Safes per application',
    'Gas sponsors per application',
  ])
    await expect(page.getByLabel(name, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Personal and shared Safe wallets', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Enable wallet operations in this configuration', {
      exact: true,
    }),
  ).not.toBeChecked();
  await page.screenshot({
    path: 'artifacts/safe-default/wizard-desktop.png',
    fullPage: true,
  });
});

test('rejects an incomplete Safe export without starting integrations or reflecting credentials', async ({
  page,
}) => {
  const retired = JSON.parse(
    await readFile(
      new URL('../../docs/provider.config.safe.example.json', import.meta.url),
      'utf8',
    ),
  );
  delete retired.safeWallet;
  await page
    .getByLabel('Import provider configuration', { exact: true })
    .setInputFiles({
      name: 'retired.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(retired)),
    });
  await expect(page.getByRole('alert')).toContainText(
    'only per-user Safe accounts',
  );
  await expect(
    page.getByRole('button', {
      name: 'Download configuration',
      exact: true,
    }),
  ).toHaveCount(0);
});

test('retains advanced vault and environment references without exposing secret values', async ({
  page,
}) => {
  await imported(page);
  await step(page, 'Wallet storage');
  await page
    .getByText('Advanced wallet environment settings', { exact: true })
    .click();
  await page
    .getByLabel('Wallet environment name', { exact: true })
    .fill('reviewed-environment');
  await page.getByText('Advanced vault settings', { exact: true }).click();
  await page
    .getByLabel('Private wallet folder', { exact: true })
    .fill('private-vault');
  await page
    .getByLabel('Wallet storage password setting name', { exact: true })
    .fill('RETAINED_VAULT_PASSPHRASE');
  const saved = await exported(page);
  expect(saved.backend).toEqual({
    ...sample.backend,
    binding: 'reviewed-environment',
    vaultDirectory: 'private-vault',
    passphrase: { env: 'RETAINED_VAULT_PASSPHRASE' },
  });
});

test('mobile controls stay within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await step(page, 'Wallet storage');
  await expect(
    page.getByRole('heading', {
      name: 'A wallet for each person',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'artifacts/safe-default/wizard-mobile.png',
    fullPage: true,
  });
});
