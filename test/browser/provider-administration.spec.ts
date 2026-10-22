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
    await page.route('**/admin/app.js', (route) => route.abort());
    await page.goto(url + '/admin/');
    await expect(page.locator('#login')).toHaveAttribute('inert', '');
    await expect(page.locator('#login')).toHaveAttribute('method', 'post');
    await expect(page.locator('#claim')).toHaveAttribute('inert', '');
    await expect(
      page.getByText('Loading secure administration.', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Username or access ID').press('Tab');
    expect(new URL(page.url()).search).toBe('');
    await page.unroute('**/admin/app.js');
    await page.reload();
    await expect(page.locator('#login')).not.toHaveAttribute('inert', '');
    await page
      .getByRole('button', { name: 'First-time setup', exact: true })
      .click();
    await page.getByLabel('Setup code').fill(claim);
    await page.getByLabel('Choose a username').fill('offline-admin');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page
      .getByRole('button', { name: 'Create administrator account' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Welcome to your service' }),
    ).toBeVisible();
    await expect(page.getByText('Disabled', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Networks', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Choose your wallet networks' }),
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', {
        name: 'Base Sepolia · test network · default',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('checkbox', {
        name: 'Ethereum Sepolia · test network',
        exact: true,
      })
      .check();
    await page
      .getByRole('checkbox', { name: 'Ethereum · mainnet', exact: true })
      .check();
    await page
      .getByRole('button', { name: 'Save network choices', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Network choices saved. Restart the provider',
    );
    expect(service.storedNetworks()).toEqual([
      'base-sepolia',
      'ethereum',
      'ethereum-sepolia',
    ]);
    await page.screenshot({
      path: 'internal-testing/multi-network/admin-networks.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'internal-testing/multi-network/admin-networks-mobile.png',
      fullPage: false,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page
      .getByRole('button', { name: 'User checks', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Choose the user checks you’ll accept',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Country', exact: true }),
    ).toBeChecked();
    await page
      .getByRole('checkbox', { name: 'Given name', exact: true })
      .check();
    for (const name of [
      'ID number',
      'Document type',
      'Document issuing country',
    ])
      await page.getByRole('checkbox', { name, exact: true }).check();
    await page
      .getByLabel('How recently must identity have been checked? (days)')
      .fill('30');
    await page
      .getByLabel('How long can wallet permission last? (days)')
      .fill('2');
    await page
      .getByRole('button', { name: 'Save user checks', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'User-check requirements saved',
    );
    expect(service.currentUserChecks()?.required_fields).toEqual([
      'country',
      'document_type',
      'given_name',
      'identity_number',
      'issuing_country',
    ]);
    await page.reload();
    await page.getByLabel('Username or access ID').fill('offline-admin');
    await page.getByLabel('Password or secret').fill(password);
    await page
      .getByRole('button', { name: 'Sign in', exact: true })
      .last()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Welcome to your service' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'User checks', exact: true })
      .click();
    await expect(
      page.getByRole('checkbox', { name: 'Given name', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByLabel('How long can wallet permission last? (days)'),
    ).toHaveValue('2');
    await page.screenshot({
      path: 'artifacts/provider-installation/user-checks.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Applications', exact: true })
      .click();
    await expect(
      page.getByText('No applications yet.', { exact: false }),
    ).toBeVisible();
    await page
      .getByLabel('Application name', { exact: true })
      .fill('Offline application');
    await page
      .getByRole('button', { name: 'Add application', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Keep these connection details safe' }),
    ).toBeVisible();
    await page.screenshot({
      path: 'artifacts/provider-installation/connection-details.png',
      fullPage: true,
      mask: [page.locator('#credential-value')],
      maskColor: '#d8e2ea',
    });
    await page
      .getByRole('button', { name: 'I’ve saved these details' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Offline application' }),
    ).toBeVisible();
    await page
      .getByLabel('Agreement reference', { exact: true })
      .fill('Offline trust agreement');
    await expect(
      page.getByRole('checkbox', {
        name: 'Let wallet owners manage shared-wallet members',
        exact: true,
      }),
    ).not.toBeChecked();
    await page
      .getByRole('checkbox', {
        name: 'Let wallet owners manage shared-wallet members',
        exact: true,
      })
      .check();
    await page.getByRole('button', { name: 'Save access settings' }).click();
    await expect(
      page.getByRole('checkbox', {
        name: 'Let wallet owners manage shared-wallet members',
        exact: true,
      }),
    ).toBeChecked();
    expect(
      Object.values(state.management!.provider.identities).find(
        (i) => i.name === 'Offline application',
      )!.policy!.permissions,
    ).toContain('members:manage');
    await expect(
      page.getByText('User checks: agreement saved', { exact: false }),
    ).toBeVisible();
    // Offline fee services exercise the console without chain access or funding.
    let approvedFees = false,
      preparedAddress = false,
      wrongNetwork = false,
      providerOffered = false;
    const offlineAddress = '0x' + '12'.repeat(20);
    const calls: {
      method: string;
      path: string;
      network: string;
      body: unknown;
    }[] = [];
    await page.route(
      '**/v1/provider/applications/*/obligations**',
      async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const applicationId = path.split('/')[4];
        const network = request.headers()['wallet-network'];
        if (request.method() === 'PUT') {
          const offered = request.postDataJSON();
          expect(offered.value.maximum_transaction_fee_wei).toBe(
            '2000000000000000',
          );
          expect(offered.value).not.toHaveProperty('maximum_gas_budget_wei');
          providerOffered = true;
          approvedFees = false;
          preparedAddress = false;
        }
        if (request.method() === 'POST') {
          calls.push({
            method: request.method(),
            path,
            network,
            body: request.postDataJSON(),
          });
          approvedFees = true;
        }
        await route.fulfill({
          json: {
            application_id: applicationId,
            resources: [
              {
                kind: 'sponsorship',
                ...(providerOffered ? { proposed_by: 'provider' } : {}),
                revision: '2',
                decision_revision: approvedFees ? '1' : '0',
                decision: approvedFees ? 'accepted' : 'pending',
                value: {
                  chain_id: {
                    base: 'eip155:8453',
                    'base-sepolia': 'eip155:84532',
                    ethereum: 'eip155:1',
                    'ethereum-sepolia': 'eip155:11155111',
                  }[network],
                  funding_agreement: 'Offline fee agreement',
                  funding_mode: 'balance',
                  maximum_transaction_fee_wei: '1000000000000000',
                  maximum_pending_fees_wei: '10000000000000000',
                },
              },
            ],
          },
        });
      },
    );
    await page.route(
      '**/v1/configuration/applications/*/safe-wallet**',
      async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const applicationId = path.split('/')[4];
        const network = request.headers()['wallet-network'];
        const chains: Record<string, string> = {
          base: 'eip155:8453',
          'base-sepolia': 'eip155:84532',
          ethereum: 'eip155:1',
          'ethereum-sepolia': 'eip155:11155111',
        };
        if (request.method() === 'POST') {
          expect(path).toMatch(/safe-wallet\/funding-address$/);
          calls.push({
            method: request.method(),
            path,
            network,
            body: request.postDataJSON(),
          });
          preparedAddress = true;
        }
        await route.fulfill({
          json: {
            application_id: applicationId,
            chain_id: wrongNetwork ? 'eip155:1' : chains[network],
            profile: 'safe-only-4337-v1',
            status: preparedAddress ? 'needs-funding' : 'unprovisioned',
            ...(preparedAddress ? { funding_address: offlineAddress } : {}),
          },
        });
      },
    );
    const fees = page
      .locator('#application-list article details')
      .filter({ has: page.getByText('Network fees', { exact: true }) });
    await fees.locator('summary').click();
    await expect(
      fees.getByText('Per-transaction limit: 0.001 ETH', { exact: false }),
    ).toBeVisible();
    await expect(
      fees.getByRole('button', {
        name: 'Prepare funding address',
        exact: true,
      }),
    ).toHaveCount(0);
    page.once('dialog', (dialog) => dialog.accept());
    await fees
      .getByRole('button', { name: 'Approve fee terms', exact: true })
      .click();
    await fees
      .getByRole('button', { name: 'Prepare funding address', exact: true })
      .click();
    await expect(fees.getByText(offlineAddress, { exact: true })).toBeVisible();
    expect(calls).toHaveLength(2);
    expect(calls[0].body).toEqual({
      expected_revision: '2',
      expected_decision_revision: '0',
      decision: 'accepted',
    });
    expect(calls[1].body).toEqual({});
    expect(calls[0].network).toBe(calls[1].network);
    await page.screenshot({
      path: 'artifacts/provider-installation/application-fees.png',
      fullPage: true,
    });
    await fees.getByText('Change fee limits', { exact: true }).click();
    await fees
      .getByLabel('Per-transaction limit (ETH)', { exact: true })
      .fill('0.002');
    await fees
      .getByLabel('Maximum wallets covered', { exact: true })
      .fill('100');
    await fees
      .getByRole('button', { name: 'Save fee terms', exact: true })
      .click();
    await fees
      .getByRole('button', { name: 'Prepare funding address', exact: true })
      .click();
    await expect(
      fees.getByText('Approval: Awaiting application acceptance', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      fees.getByRole('button', { name: 'Approve fee terms', exact: true }),
    ).toHaveCount(0);
    await expect(fees.getByText(offlineAddress, { exact: true })).toBeVisible();
    wrongNetwork = true;
    await fees
      .getByRole('button', { name: 'Refresh fee setup', exact: true })
      .click();
    await expect(fees.getByText(offlineAddress, { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('status')).toContainText(
      'do not match this application and network',
    );
    await page
      .getByRole('button', { name: 'Pause connection', exact: true })
      .click();
    await expect(
      page.getByText('Connection paused', { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: 'artifacts/provider-installation/administration.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Resume connection', exact: true })
      .click();
    await page
      .getByLabel('Application name', { exact: true })
      .fill('Second application');
    await page
      .getByRole('button', { name: 'Add application', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'I’ve saved these details' })
      .click();
    const second = page.locator('#application-list article').filter({
      has: page.getByRole('heading', {
        name: 'Second application',
        exact: true,
      }),
    });
    await second
      .getByLabel('Agreement reference', { exact: true })
      .fill('Offline second application trust');
    await second.getByRole('button', { name: 'Save access settings' }).click();
    const first = page.locator('#application-list article').filter({
      has: page.getByRole('heading', {
        name: 'Offline application',
        exact: true,
      }),
    });
    await expect(
      first.getByRole('checkbox', {
        name: 'Allow wallet sharing',
        exact: true,
      }),
    ).not.toBeChecked();
    await first
      .getByRole('checkbox', { name: 'Allow wallet sharing', exact: true })
      .check();
    await first
      .getByRole('checkbox', {
        name: 'Allow requests from Second application',
        exact: true,
      })
      .check();
    await first
      .getByRole('checkbox', { name: 'Match Given name', exact: true })
      .check();
    await first
      .getByLabel('Sharing agreement reference')
      .fill('Offline cross-application agreement');
    await first
      .getByRole('button', { name: 'Save wallet sharing', exact: true })
      .click();
    await expect(
      first.getByRole('checkbox', {
        name: 'Allow wallet sharing',
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      first.getByRole('checkbox', { name: 'Match ID number', exact: true }),
    ).toBeChecked();
    await expect(
      first.getByRole('checkbox', { name: 'Match ID number', exact: true }),
    ).toBeDisabled();
    await expect(
      first.getByRole('checkbox', { name: 'Match Given name', exact: true }),
    ).toBeChecked();
    expect(
      Object.values(state.management!.provider.identities).find(
        (i) => i.name === 'Offline application',
      )!.policy!.walletSharing!.matchingFields,
    ).toEqual([
      'document_type',
      'given_name',
      'identity_number',
      'issuing_country',
    ]);
    await page.screenshot({
      path: 'artifacts/provider-installation/wallet-sharing.png',
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
    await page.getByLabel('Tool name').fill('Delayed offline automation');
    await page
      .getByRole('button', { name: 'Add management tool', exact: true })
      .click();
    await created;
    const arriving = page.waitForResponse(
      (response) =>
        response.url().endsWith('/v1/provider/identities') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Welcome back', exact: true }),
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
