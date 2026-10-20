import { test, expect } from '@playwright/test';
import { createSetupServer } from '../../dist/deployment/setup-server.js';

test('reviews a zero-application local installation in three stages', async ({
  page,
}) => {
  const token = 'offline-installation-browser';
  const app = await createSetupServer({ token });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  try {
    await page.goto(`${url}/#${token}`);
    await expect(
      page.getByRole('heading', { name: 'Deploy your wallet provider' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByText(
        'No application, RPC credential, sponsor funding or external identity provider is needed.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Review and deploy', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Deploy and open administration',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Check local setup prerequisites' }),
    ).toBeVisible();
    await page.screenshot({
      path: 'artifacts/provider-installation/review.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await app.close();
  }
});
