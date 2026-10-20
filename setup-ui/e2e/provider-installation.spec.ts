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
      page.getByRole('heading', { name: 'Let’s set up your wallet service' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByText(
        'Just a name to get started. You can connect applications, arrange network fees and set up user checks later.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Continue to setup', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Let’s get your service running',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Check this computer' }),
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
