import { test, expect } from '@playwright/test';
import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import { consoleHtml, consoleStyle } from '../../dist/management/ui.js';

test('guides email verification using a private browser session without granting administrator access', async ({
  page,
  context,
}) => {
  const app = Fastify();
  let expectedOrigin = '';
  let sent = 0,
    verified = 0;
  app.get('/admin/', async (_request, reply) =>
    reply.type('text/html').send(consoleHtml),
  );
  app.get('/admin/style.css', async (_request, reply) =>
    reply.type('text/css').send(consoleStyle),
  );
  app.get('/admin/app.js', async (_request, reply) =>
    reply
      .type('text/javascript')
      .send(
        await readFile(
          new URL('../../dist/management/console.mjs', import.meta.url),
          'utf8',
        ),
      ),
  );
  app.get('/admin/auth/options', async () => ({
    cognito: true,
    sessionAvailable: false,
    verifyEmail: true,
  }));
  app.post('/admin/auth/email/send', async (request, reply) => {
    if (request.headers.origin !== expectedOrigin)
      return reply.code(403).send({});
    if (!request.headers.cookie?.includes('offline-verification=browser-bound'))
      return reply.code(401).send({});
    sent++;
    return { sent: true };
  });
  app.post<{ Body: { code: string } }>(
    '/admin/auth/email/verify',
    async (request, reply) => {
      if (request.headers.origin !== expectedOrigin)
        return reply.code(403).send({});
      if (
        !request.headers.cookie?.includes('offline-verification=browser-bound')
      )
        return reply.code(401).send({});
      if (request.body.code !== '123456') return reply.code(401).send({});
      verified++;
      return { url: '/admin/auth/start' };
    },
  );
  app.get('/admin/auth/start', async (_request, reply) =>
    reply.type('text/html').send('<h1>Continue to hosted sign-in</h1>'),
  );
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  expectedOrigin = url;
  try {
    await context.addCookies([
      {
        name: 'offline-verification',
        value: 'browser-bound',
        url,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto(url + '/admin/');
    await expect(
      page.getByRole('link', { name: 'Sign in with Amazon Cognito' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Verify your administrator email' }),
    ).toBeVisible();
    await expect(page.locator('#workspace')).toBeHidden();
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Check your administrator email',
    );
    expect(sent).toBe(1);
    await page.getByLabel('Email verification code').fill('000000');
    await page
      .getByRole('button', { name: 'Verify email and continue' })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'code could not be verified',
    );
    await expect(page.locator('#workspace')).toBeHidden();
    await page.getByLabel('Email verification code').fill('123456');
    await page
      .getByRole('button', { name: 'Verify email and continue' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Continue to hosted sign-in' }),
    ).toBeVisible();
    expect(verified).toBe(1);
    expect(new URL(page.url()).search).toBe('');
  } finally {
    await app.close();
  }
});
