import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createSetupServer } from '../../dist/deployment/setup-server.js';

test('a new operator configures application-led access without user login, vendors or reviewers and previews its contract', async ({
  page,
}) => {
  const token = 'offline-application-setup';
  const server = await createSetupServer({ token });
  const url = await server.listen({ host: '127.0.0.1', port: 0 });
  try {
    await page.goto(`${url}/#${token}`);
    await page
      .getByLabel('Provider name', { exact: true })
      .fill('Example Wallets');
    await page
      .getByLabel('Public wallet service address', { exact: true })
      .fill('https://wallet.example.test');
    await page
      .getByLabel('Privacy notice URL', { exact: true })
      .fill('https://wallet.example.test/privacy');
    await page.getByRole('tab', { name: 'Backend', exact: true }).click();
    await page
      .getByLabel('Wallet environment name', { exact: true })
      .fill('offline-example');
    await page.getByRole('tab', { name: 'Services', exact: true }).click();
    const services = page.getByRole('tabpanel', {
      name: 'Services',
      exact: true,
    });
    await expect(
      services.getByLabel('Access flow', { exact: true }),
    ).toHaveCount(0);
    await expect(
      services.getByLabel('Required identity level', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel('Login service issuer URL', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel('Use Didit', { exact: true })).toHaveCount(0);
    await expect(
      page
        .getByText('Users stay in the application.', { exact: false })
        .first(),
    ).toBeVisible();
    await page
      .getByLabel('Application token issuer', { exact: true })
      .fill('https://apps.example.test');
    await page
      .getByLabel('Wallet API audience', { exact: true })
      .fill('wallet-api');
    await page
      .getByLabel('Token verification keys URL (JWKS)', { exact: true })
      .fill('https://apps.example.test/jwks');
    await page.getByRole('tab', { name: 'Policies', exact: true }).click();
    await expect(page.getByLabel('Access flow', { exact: true })).toHaveValue(
      'application',
    );
    await page
      .getByLabel('Required identity level', { exact: true })
      .fill('enhanced');
    await page
      .getByLabel('Required identity fields (one per line)', { exact: true })
      .fill('country\ncustomer_type');
    await page
      .getByLabel('Maximum access duration (days)', { exact: true })
      .fill('3');
    await page
      .getByLabel('Maximum age of identity checks (days)', { exact: true })
      .fill('30');
    const rules = page.locator('.callout').filter({
      hasText: 'How the provider uses these rules',
    });
    await expect(rules).toContainText('checked within 30 days');
    await expect(rules).toContainText('Access lasts at most 3 days');
    await page
      .getByLabel('Application name', { exact: true })
      .fill('Example App');
    await page
      .getByLabel('Application client ID', { exact: true })
      .fill('example-app');
    await page
      .getByLabel('Application identity and consent trust agreement', {
        exact: true,
      })
      .fill('reviewed-offline-agreement');
    await expect(
      page.getByRole('button', { name: 'Add reviewer', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('tab', { name: 'Export', exact: true }).click();
    await page
      .getByRole('button', { name: 'Validate configuration', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Configuration valid');
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download configuration', exact: true })
      .click();
    const config = JSON.parse(
      await readFile((await (await download).path())!, 'utf8'),
    );
    expect(config.policy.access.mode).toBe('application');
    expect(config.policy.access.maxAgeDays).toBe(3);
    expect(config.policy.identity.maxAgeDays).toBe(30);
    expect(config.policy.identity.application).toEqual({
      verificationLevel: 'enhanced',
      requiredFields: ['country', 'customer_type'],
    });
    expect(config.ownerLogin).toBeUndefined();
    expect(config.reviewers).toBeUndefined();
    expect(config.identity).toEqual({});
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(url)) external.push(request.url());
    });
    await page
      .getByRole('button', { name: 'API reference', exact: true })
      .click();
    await page.locator('.swagger-ui .opblock').first().waitFor();
    await expect(page.locator('.swagger-ui .opblock')).toHaveCount(7);
    await page
      .getByLabel('Example endpoint', { exact: true })
      .selectOption('requestAccountAccess');
    await expect(page.getByLabel('cURL request example')).toContainText(
      'policy_revision',
    );
    await expect(page.getByLabel('cURL request example')).toContainText(
      'verified_at',
    );
    await page
      .getByLabel('Example endpoint', { exact: true })
      .selectOption('revokeAccountAccess');
    await expect(page.getByLabel('cURL request example')).toContainText(
      '/revoke',
    );
    expect(external).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await server.close();
  }
});
