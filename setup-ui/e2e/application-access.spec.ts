import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSetupServer } from '../../dist/deployment/setup-server.js';

const contract = JSON.parse(
  await readFile(
    new URL('../../spec/provider-api.json', import.meta.url),
    'utf8',
  ),
);
const endpointCount = Object.values(
  contract.paths as Record<string, Record<string, unknown>>,
).reduce((count, methods) => count + Object.keys(methods).length, 0);

test('a new operator configures application-led access without user login, vendors or reviewers and previews its contract', async ({
  page,
}) => {
  const token = 'offline-application-setup';
  const server = await createSetupServer({ token });
  const url = await server.listen({ host: '127.0.0.1', port: 0 });
  try {
    await page.goto(`${url}/?advanced#${token}`);
    await page
      .getByLabel('Provider name', { exact: true })
      .fill('Example Wallets');
    await page
      .getByLabel('Public wallet service address', { exact: true })
      .fill('https://wallet.example.test');
    await page
      .getByLabel('Privacy notice address', { exact: true })
      .fill('https://wallet.example.test/privacy');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page
      .getByText('Advanced wallet environment settings', { exact: true })
      .click();
    await page
      .getByLabel('Wallet environment name', { exact: true })
      .fill('offline-example');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
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
      .getByLabel('Application authentication', { exact: true })
      .selectOption('external');
    await page
      .getByLabel('Application token issuer', { exact: true })
      .fill('https://apps.example.test');
    await page
      .getByLabel('Wallet API audience', { exact: true })
      .fill('wallet-api');
    await page
      .getByLabel('Token verification keys URL (JWKS)', { exact: true })
      .fill('https://apps.example.test/jwks');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByLabel('Access flow', { exact: true })).toHaveCount(
      0,
    );
    await page
      .getByText('User checks and how long access lasts', {
        exact: true,
      })
      .click();
    await page
      .getByLabel('Required identity level', { exact: true })
      .fill('enhanced');
    await page
      .getByLabel('Required identity fields (one per line)', { exact: true })
      .fill('Country\ncountry');
    await page
      .getByLabel('Required identity fields (one per line)', { exact: true })
      .blur();
    await expect(
      page.getByText('Use up to 16 different field names, one per line:', {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByLabel('Required identity fields (one per line)', { exact: true })
      .fill('country\ncustomer_type');
    await page
      .getByLabel('Maximum access duration (days)', { exact: true })
      .fill('3');
    await page
      .getByLabel('Maximum age of identity checks (days)', { exact: true })
      .fill('30');
    await page
      .getByLabel('Application name', { exact: true })
      .fill('Example App');
    await page
      .getByText('Advanced application identity', { exact: true })
      .click();
    await page
      .getByLabel('Application client ID', { exact: true })
      .fill('example-app');
    await page
      .getByLabel('Agreement reference', {
        exact: true,
      })
      .fill('reviewed-offline-agreement');
    await expect(
      page.getByRole('button', { name: 'Add reviewer', exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel('Operator issuer', { exact: true })
      .fill('https://apps.example.test');
    await page
      .getByLabel('Operator OAuth client ID', { exact: true })
      .fill('runtime-provider-operator');
    await page
      .getByLabel('Operator token subject', { exact: true })
      .fill('runtime-provider-subject');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
      page.getByLabel('Enable wallet operations in this configuration', {
        exact: true,
      }),
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Application permissions to review',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Your next steps',
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Check settings', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Settings checked');
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download configuration', exact: true })
      .click();
    const configPath = (await (await download).path())!;
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    expect(config.policy.access.mode).toBe('application');
    expect(config.policy.access.maxAgeDays).toBe(3);
    expect(config.policy.identity.maxAgeDays).toBe(30);
    expect(config.policy.identity.application).toEqual({
      verificationLevel: 'enhanced',
      requiredFields: ['country', 'customer_type'],
    });
    expect(config.runtimeConfiguration).toMatchObject({
      authorizeContracts: true,
      operators: [
        {
          issuer: 'https://apps.example.test',
          clientId: 'runtime-provider-operator',
          subject: 'runtime-provider-subject',
        },
      ],
    });
    expect(config.safeWallet).toMatchObject({ profile: 'safe-only-4337-v1' });
    expect(config.runtimeConfiguration.sharedApplicationSafes).toBeUndefined();
    expect(config.ownerLogin).toBeUndefined();
    expect(config.reviewers).toBeUndefined();
    expect(config.identity).toEqual({});
    await expect(
      page.getByRole('heading', {
        name: 'Your next steps',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: 'Open the deployment guide ↗',
        exact: true,
      }),
    ).toHaveAttribute('href', /operator-deployment.html$/);
    const checklistDownload = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download checklist', exact: true })
      .click();
    const checklist = await readFile(
      (await (await checklistDownload).path())!,
      'utf8',
    );
    expect(checklist).toContain(
      'node "$PROVIDER_SOURCE/dist/main.js" validate',
    );
    expect(checklist).toContain('--env-file="$PROVIDER_STATE/provider.env"');
    expect(checklist).toContain('readiness HTTP 503 while disabled');
    expect(checklist).not.toContain('npx --no-install');
    const validation = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(new URL('../../dist/main.js', import.meta.url)),
        'validate',
        '--config',
        configPath,
      ],
      { cwd: dirname(configPath) },
    );
    expect(validation.stdout).toContain(
      'Configuration valid; no integrations activated',
    );
    const variablesDownload = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download variable template', exact: true })
      .click();
    const variables = await readFile(
      (await (await variablesDownload).path())!,
      'utf8',
    );
    expect(variables).toContain('OWS_OWNER_PASSPHRASE=\n');
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(url)) external.push(request.url());
    });
    await page
      .getByRole('button', { name: 'API reference', exact: true })
      .click();
    await page.locator('.swagger-ui .opblock').first().waitFor();
    await expect(
      page.getByLabel('Browse requests by task', { exact: true }),
    ).toHaveValue('Wallet access');
    await expect(page.locator('.swagger-ui .opblock')).toHaveCount(6);
    await expect(
      page.getByText('Why this exists:', { exact: false }).first(),
    ).toBeVisible();
    await page
      .getByLabel('Browse requests by task', { exact: true })
      .selectOption('');

    await expect(page.locator('.swagger-ui .opblock')).toHaveCount(
      endpointCount,
    );
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
