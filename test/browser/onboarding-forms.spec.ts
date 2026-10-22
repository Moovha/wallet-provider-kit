import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../../dist/http.js';
import { AuthenticationError } from '../../dist/service/auth.js';
import { EmbeddedWalletService } from '../../dist/domain/embedded-wallet.js';
import {
  OnboardingService,
  createFileOnboardingStore,
} from '../../dist/onboarding/index.js';

test('browser consent, verification handoff, review and revocation preserve Origin and withhold external referrers', async ({
  page,
}) => {
  const origin = 'https://wallet.example.test';
  const issuer = 'https://issuer.example.test';
  const ownerSession = randomBytes(32).toString('base64url');
  const reviewerSession = randomBytes(32).toString('base64url');
  const verificationOwnerSession = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  const directory = await mkdtemp(join(tmpdir(), 'wpk-browser-forms-'));
  const verificationUrl = 'https://verify.didit.me/session/offline-fixture';
  let verificationStarts = 0;
  const principal = {
    issuer,
    subject: 'offline-application',
    clientId: 'offline-client',
    scopes: ['wallet:access', 'wallet:access:read', 'wallet:account:read'],
  };
  const onboarding = new OnboardingService(
    {
      version: '1',
      provider: {
        name: 'Offline provider',
        origin,
        privacyUrl: origin + '/privacy',
      },
      applications: [
        {
          issuer,
          clientId: principal.clientId,
          name: 'Offline application',
          permissions: ['account:read'],
          funding: { agreement: 'offline-fixture', monthlyLimitMinor: 0 },
        },
      ],
    },
    createFileOnboardingStore(directory),
    [
      {
        vendor: 'didit',
        price: { maximumMinor: 0, termsReference: 'offline-fixture' },
        verificationPrice: {
          maximumMinor: 0,
          termsReference: 'offline-fixture',
        },
        startVerification: async () => {
          verificationStarts++;
          return { reference: randomUUID(), url: verificationUrl };
        },
        importShared: async (_token, correlation) => ({
          vendor: 'didit',
          reference: correlation,
          correlation,
          status: 'approved',
          fetchedAt: new Date().toISOString(),
        }),
        read: async (reference, correlation) => ({
          vendor: 'didit',
          reference,
          correlation,
          status: 'approved',
          fetchedAt: new Date().toISOString(),
        }),
      },
    ],
  );
  const app = await createServer({
    service: new EmbeddedWalletService(onboarding.walletAuthority(), {
      provider: 'offline-no-effects',
      createAccount: async () => {
        throw new Error('Unexpected provisioning');
      },
      findAccount: async () => null,
      signTypedData: async () => {
        throw new Error('Unexpected signing');
      },
    }),
    authenticate: async () => principal,
    ready: async () => true,
    onboarding: {
      service: onboarding,
      reviewers: ['reviewer'],
      login: {
        start: async () => {
          throw new Error('Unexpected login');
        },
        finish: async () => {
          throw new Error('Unexpected callback');
        },
        session: async (token) => {
          if (
            ![ownerSession, reviewerSession, verificationOwnerSession].includes(
              token,
            )
          )
            throw new AuthenticationError(401);
          return {
            csrf,
            identity: {
              issuer,
              subject:
                token === ownerSession
                  ? 'owner'
                  : token === reviewerSession
                    ? 'reviewer'
                    : 'verification-owner',
              authenticatedAt: Date.now(),
            },
          };
        },
      },
    },
  });
  const forms: { origin?: string; status: number }[] = [];
  let externalReferrer: string | undefined;
  try {
    // Route browser traffic through the real HTTP handlers without network or TLS dependencies.
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.url() === verificationUrl) {
        expect((await request.allHeaders()).referer).toBeUndefined();
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: 'Offline identity verification',
        });
      }
      if (request.url() === 'https://moovha.com/') {
        externalReferrer = (await request.allHeaders()).referer;
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: 'Offline destination',
        });
      }
      expect(new URL(request.url()).origin).toBe(origin);
      const headers = await request.allHeaders();
      const response = await app.inject({
        method: request.method() as 'GET' | 'POST',
        url: new URL(request.url()).pathname,
        headers,
        ...(request.postData() ? { payload: request.postData()! } : {}),
      });
      if (request.method() === 'POST')
        forms.push({ origin: headers.origin, status: response.statusCode });
      if (new URL(request.url()).pathname.endsWith('/verify'))
        expect(response.headers['content-security-policy']).toContain(
          "form-action 'self'",
        );
      await route.fulfill({
        status: response.statusCode,
        headers: response.headers as Record<string, string>,
        body: response.body,
      });
    });
    const request = await app.inject({
      method: 'POST',
      url: '/v1/access-requests',
      headers: { 'idempotency-key': randomUUID() },
      payload: {
        mode: 'create',
        authorization_details: [
          {
            type: 'https://moovha.com/wallet/account-access',
            actions: ['account:read'],
          },
        ],
      },
    });
    expect(request.statusCode).toBe(200);
    const receipt = request.json();
    const session = async (value: string) =>
      page
        .context()
        .addCookies([
          { name: '__Host-wpk-session', value, url: origin, secure: true },
        ]);
    await session(ownerSession);
    await page.goto(origin + '/onboarding/' + receipt.request_id);
    await page.getByRole('button', { name: 'Allow requested access' }).click();
    await expect(
      page.getByText('Identity verification is needed.', { exact: true }),
    ).toBeVisible();
    await onboarding.importIdentity(
      { principal, idempotencyKey: randomUUID() },
      receipt.request_id,
      'didit',
      'offline-fixture',
    );
    await session(reviewerSession);
    await page.goto(origin + '/onboarding/review');
    const review = page.locator(
      `form[action="/onboarding/review/${receipt.request_id}"]`,
    );
    await review.locator('[name=verified_at]').fill(new Date().toISOString());
    await review.locator('[name=identity_matches_owner]').check();
    await review.getByRole('button', { name: 'Accept verified user' }).click();
    await expect(
      page.getByText('No requests need review.', { exact: true }),
    ).toBeVisible();
    const granted = await onboarding.read(
      { principal, idempotencyKey: randomUUID() },
      receipt.request_id,
    );
    await session(ownerSession);
    await page.goto(origin + '/onboarding/access');
    await page.getByRole('button', { name: 'Remove access' }).click();
    await expect(page.getByText(/Access removed/)).toBeVisible();
    expect(forms).toEqual(
      Array.from({ length: 3 }, () => ({ origin, status: 302 })),
    );
    await expect(
      onboarding.account(principal, granted.account_id!),
    ).rejects.toThrow();
    await page.getByRole('link', { name: 'Moovha', exact: true }).click();
    await expect(page.getByText('Offline destination')).toBeVisible();
    expect(externalReferrer).toBeUndefined();
    const verificationRequest = await onboarding.request(
      { principal, idempotencyKey: randomUUID() },
      {
        mode: 'create',
        authorization_details: [
          {
            type: 'https://moovha.com/wallet/account-access',
            actions: ['account:read'],
          },
        ],
      },
    );
    await session(verificationOwnerSession);
    await page.goto(origin + '/onboarding/' + verificationRequest.request_id);
    await page.getByRole('button', { name: 'Allow requested access' }).click();
    await page.getByRole('button', { name: 'Continue verification' }).click();
    await expect(
      page.getByRole('link', { name: 'Continue to identity verification' }),
    ).toBeVisible();
    await page.goto(origin + '/onboarding/' + verificationRequest.request_id);
    await expect(
      page.getByRole('link', { name: 'Continue to identity verification' }),
    ).toBeVisible();
    expect(verificationStarts).toBe(1);
    await page
      .getByRole('link', { name: 'Continue to identity verification' })
      .click();
    await expect(page.getByText('Offline identity verification')).toBeVisible();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('application records require browser owner consent and a separate provider decision', async ({
  page,
}) => {
  const origin = 'https://wallet.example.test';
  const issuer = 'https://issuer.example.test';
  const directory = await mkdtemp(join(tmpdir(), 'wpk-browser-records-'));
  const ownerSession = randomBytes(32).toString('base64url');
  const reviewerSession = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  const principal = {
    issuer,
    subject: 'offline-worker',
    clientId: 'offline-client',
    scopes: ['wallet:access', 'wallet:access:read', 'wallet:account:read'],
  };
  const onboarding = new OnboardingService(
    {
      version: '1',
      provider: {
        name: 'Offline provider',
        origin,
        privacyUrl: origin + '/privacy',
      },
      applications: [
        {
          issuer,
          clientId: principal.clientId,
          name: 'Offline application',
          permissions: ['account:read'],
        },
      ],
      identity: {
        maxAgeDays: 7,
        records: { requiredFields: ['display_name', 'country'] },
      },
    },
    createFileOnboardingStore(directory),
  );
  const app = await createServer({
    service: new EmbeddedWalletService(onboarding.walletAuthority(), {
      provider: 'offline-no-effects',
      createAccount: async () => {
        throw new Error('Unexpected provisioning');
      },
      findAccount: async () => null,
      signTypedData: async () => {
        throw new Error('Unexpected signing');
      },
    }),
    authenticate: async () => principal,
    ready: async () => true,
    onboarding: {
      service: onboarding,
      reviewers: ['reviewer'],
      login: {
        start: async () => {
          throw new Error('Unexpected login');
        },
        finish: async () => {
          throw new Error('Unexpected callback');
        },
        session: async (token) => {
          if (![ownerSession, reviewerSession].includes(token))
            throw new AuthenticationError(401);
          return {
            csrf,
            identity: {
              issuer,
              subject: token === ownerSession ? 'owner' : 'reviewer',
              authenticatedAt: Date.now(),
            },
          };
        },
      },
    },
  });
  const session = async (value: string) =>
    page
      .context()
      .addCookies([
        { name: '__Host-wpk-session', value, url: origin, secure: true },
      ]);
  try {
    await page.route('**/*', async (route) => {
      const request = route.request();
      expect(new URL(request.url()).origin).toBe(origin);
      const headers = await request.allHeaders();
      const response = await app.inject({
        method: request.method() as 'GET' | 'POST',
        url: new URL(request.url()).pathname,
        headers,
        ...(request.postData() ? { payload: request.postData()! } : {}),
      });
      if (request.method() === 'POST') {
        expect(headers.origin).toBe(origin);
        expect(response.statusCode).toBe(302);
      }
      await route.fulfill({
        status: response.statusCode,
        headers: response.headers as Record<string, string>,
        body: response.body,
      });
    });
    const batch = await app.inject({
      method: 'POST',
      url: '/v1/access-records',
      headers: { 'idempotency-key': randomUUID() },
      payload: {
        records: [
          {
            reference: 'fictional-a',
            fields: {
              display_name: '<script>unexpected()</script>',
              country: 'ZA',
              kyc_status: 'approved',
            },
          },
        ],
      },
    });
    expect(batch.statusCode).toBe(200);
    const receipt = batch.json().results[0].receipt;
    await session(ownerSession);
    await page.goto(origin + '/onboarding/' + receipt.request_id);
    await expect(
      page.getByText(
        /has not been independently verified as an identity check/,
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Allow requested access' }).click();
    await expect(
      page.getByText('Your provider is reviewing your submitted record.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Continue verification' }),
    ).toHaveCount(0);
    await session(reviewerSession);
    await page.goto(origin + '/onboarding/review');
    const review = page.locator(
      `form[action="/onboarding/review/${receipt.request_id}"]`,
    );
    await expect(
      review.getByText('<script>unexpected()</script>', { exact: true }),
    ).toBeVisible();
    await expect(review.getByText('kyc_status', { exact: true })).toHaveCount(
      0,
    );
    await expect(
      review.locator('[name=vendor], [name=verified_at]'),
    ).toHaveCount(0);
    await page.screenshot({
      path: 'artifacts/application-record-review.png',
      fullPage: true,
    });
    await review.locator('[name=identity_matches_owner]').check();
    await review
      .getByRole('button', { name: 'Accept submitted record' })
      .click();
    await expect(
      page.getByText('No requests need review.', { exact: true }),
    ).toBeVisible();
    const granted = await onboarding.read(
      { principal, idempotencyKey: randomUUID() },
      receipt.request_id,
    );
    expect(
      await onboarding.account(principal, granted.account_id!),
    ).toMatchObject({
      evaluation_only: true,
      identity_source: 'application_record',
    });
    await session(ownerSession);
    await page.goto(origin + '/onboarding/access');
    await page.getByRole('button', { name: 'Remove access' }).click();
    await expect(
      onboarding.account(principal, granted.account_id!),
    ).rejects.toThrow();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
