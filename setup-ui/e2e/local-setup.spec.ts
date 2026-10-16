import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSetupServer } from '../../dist/deployment/setup-server.js';

test('local setup reviews changes and secret privacy, shows progress, resumes the session, and stops without erasing storage', async ({
  page,
}) => {
  const directory = await mkdtemp(
    join(tmpdir(), 'wallet-local-setup-browser-'),
  );
  const commands: string[][] = [];
  let release: () => void = () => {};
  const build = new Promise<void>((resolve) => {
    release = resolve;
  });
  const token = 'offline-local-container-fixture';
  const server = await createSetupServer({
    token,
    executor: {
      root: join(directory, 'deployments'),
      environment: {},
      command: async (args) => {
        commands.push(args);
        if (args[0] === 'context') return 'unix:///offline/docker.sock';
        if (args.includes('version')) return '2.40.0';
        if (args.includes('info')) return 'linux';
        if (args.includes('build')) await build;
        if (args.includes('ps')) return 'api';
        return '';
      },
    },
  });
  const url = await server.listen({ host: '127.0.0.1', port: 0 });
  try {
    await page.goto(`${url}/#${token}`);
    const file = join(directory, 'config.json');
    const config = await readFile(
      new URL('../../docs/provider.config.example.json', import.meta.url),
    );
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, config);
    await page.getByLabel('Import provider configuration').setInputFiles(file);
    await expect(
      page.getByText('Configuration imported.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Export', exact: true }).click();
    await page
      .getByRole('button', { name: 'Validate configuration', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Check local setup prerequisites',
        exact: true,
      })
      .click();
    await expect(
      page.getByText('Container HTTP listen address:', { exact: false }),
    ).toBeVisible();
    const start = page.getByRole('button', {
      name: 'Start local setup',
      exact: true,
    });
    await expect(start).toBeDisabled();
    for (const field of await page.locator('.secret-value').all())
      await field.fill('offline-browser-secret');
    await expect(start).toBeEnabled();
    await start.click();
    await expect(
      page.getByText('Setup in progress', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('In progress · Build the service image', { exact: false }),
    ).toBeVisible();
    await expect(page.locator('.secret-value')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Import configuration', exact: true }),
    ).toBeDisabled();
    await page.goto(`${url}/?resume#${token}`);
    await expect(
      page.getByText('Setup in progress', { exact: true }),
    ).toBeVisible();
    release();
    await expect(
      page.getByText('Local service running · wallet operations disabled', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      commands.filter((args) => args.includes('init-storage')),
    ).toHaveLength(1);
    expect(JSON.stringify(commands)).not.toContain('offline-browser-secret');
    await page
      .locator('.local-setup')
      .screenshot({ path: 'artifacts/setup-docs/local-setup.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('button', { name: 'Stop local service', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'artifacts/setup-docs/local-setup-mobile.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Stop local service', exact: true })
      .click();
    await expect(
      page.getByText('Local service stopped', { exact: true }),
    ).toBeVisible();
    expect(commands.at(-1)).toContain('stop');
    const setupPath = commands.find((args) => args.includes('--file'))!;
    const composeFile = setupPath[setupPath.indexOf('--file') + 1];
    expect(
      await readFile(
        join(composeFile.slice(0, -'compose.json'.length), 'provider.env'),
        'utf8',
      ),
    ).toContain('offline-browser-secret');
  } finally {
    release();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
