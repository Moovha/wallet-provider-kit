import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnboardingProvider } from '../src/onboarding/provider.js';
import {
  createDiditIdentityAdapter,
  createSumsubIdentityAdapter,
} from '../src/onboarding/vendors.js';

const workflowId = randomUUID();
afterEach(() => vi.unstubAllEnvs());
const correlation = randomUUID();
const diditId = randomUUID();
const sumsubId = '5b594ade0a975a36c9349e66';
function didit() {
  return {
    session_id: diditId,
    session_kind: 'user',
    workflow_id: workflowId,
    vendor_data: correlation,
    shared_from_session: randomUUID(),
    status: 'Approved',
    first_name: 'Private',
    document_url: 'https://private.example.test',
  };
}
function sumsub() {
  return {
    id: sumsubId,
    type: 'individual',
    externalUserId: correlation,
    review: {
      levelName: 'provider-kyc',
      reviewStatus: 'completed',
      reviewResult: { reviewAnswer: 'GREEN' },
      reviewDate: '2026-10-15 12:30:00+0000',
    },
    info: { firstName: 'Private' },
  };
}
function response(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
function diditAdapter(fetcher: typeof fetch) {
  return createDiditIdentityAdapter(
    { apiKey: randomUUID(), workflowId },
    fetcher,
  );
}
function sumsubAdapter(fetcher: typeof fetch) {
  return createSumsubIdentityAdapter(
    {
      appToken: 'offline-app',
      secretKey: 'offline-secret',
      levelName: 'provider-kyc',
      reusableKycShareEnabled: true,
    },
    fetcher,
  );
}

describe('recipient identity adapters', () => {
  it('refuses vendor credentials with disabled TLS verification before making requests', () => {
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0');
    const fetcher = vi.fn();
    expect(() => diditAdapter(fetcher)).toThrow(
      'wallet_provider_configuration',
    );
    expect(() => sumsubAdapter(fetcher)).toThrow(
      'wallet_provider_configuration',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not bootstrap the independent provider inside the legacy exchange service', async () => {
    vi.stubEnv('GAE_SERVICE', 'exchange');
    await expect(
      createOnboardingProvider(
        {} as Parameters<typeof createOnboardingProvider>[0],
      ),
    ).rejects.toThrow('wallet_provider_configuration');
  });
  it('imports Didit with recipient credentials, a fixed workflow and independent review', async () => {
    const fetcher = vi.fn(async () => response(didit()));
    const evidence = await diditAdapter(fetcher).importShared(
      'opaque-secret-token',
      correlation,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://verification.didit.me/v3/session/import-shared/');
    expect(init.redirect).toBe('error');
    expect(JSON.parse(init.body as string)).toEqual({
      share_token: 'opaque-secret-token',
      trust_review: false,
      workflow_id: workflowId,
      vendor_data: correlation,
    });
    expect(evidence.status).toBe('approved');
    expect(evidence.verifiedAt).toBeUndefined();
    expect(JSON.stringify(evidence)).not.toMatch(
      /Private|document_url|opaque-secret-token/,
    );
  });
  it('signs the exact Sumsub path, query and body and never decodes an opaque token', async () => {
    const fetcher = vi.fn(async () => response(sumsub()));
    const evidence = await sumsubAdapter(fetcher).importShared(
      'opaque + & token',
      correlation,
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const target = new URL(url);
    expect(target.origin).toBe('https://api.sumsub.com');
    expect(target.searchParams.get('shareToken')).toBe('opaque + & token');
    expect(target.searchParams.get('userId')).toBe(correlation);
    expect(JSON.parse(init.body as string)).toEqual({
      preservedVerificationStatus: false,
      requireFreshSelfie: false,
    });
    const headers = init.headers as Record<string, string>;
    expect(headers['X-App-Access-Sig']).toBe(
      createHmac('sha256', 'offline-secret')
        .update(
          headers['X-App-Access-Ts'] +
            'POST' +
            target.pathname +
            target.search +
            init.body,
        )
        .digest('hex'),
    );
    expect(evidence.verifiedAt).toBe('2026-10-15T12:30:00.000Z');
    expect(JSON.stringify(evidence)).not.toContain('Private');
  });
  it.each(['didit', 'sumsub'] as const)(
    'rejects a %s recipient correlation mismatch and company profiles',
    async (vendor) => {
      const value = vendor === 'didit' ? didit() : sumsub();
      const adapter = vendor === 'didit' ? diditAdapter : sumsubAdapter;
      await expect(
        adapter(
          vi.fn(async () =>
            response({
              ...value,
              vendor_data: 'someone-else',
              externalUserId: 'someone-else',
            }),
          ),
        ).importShared('opaque', correlation),
      ).rejects.toThrow('wallet_identity_unavailable');
      await expect(
        adapter(
          vi.fn(async () =>
            response({ ...value, session_kind: 'business', type: 'company' }),
          ),
        ).importShared('opaque', correlation),
      ).rejects.toThrow('wallet_identity_unavailable');
    },
  );
  it('treats pending or red Sumsub reports as unapproved and rejects a mismatched recipient level', async () => {
    const value = sumsub();
    value.review.reviewStatus = 'pending';
    expect(
      (
        await sumsubAdapter(vi.fn(async () => response(value))).read(
          sumsubId,
          correlation,
        )
      ).status,
    ).toBe('review');
    value.review.reviewStatus = 'completed';
    value.review.reviewResult.reviewAnswer = 'RED';
    expect(
      (
        await sumsubAdapter(vi.fn(async () => response(value))).read(
          sumsubId,
          correlation,
        )
      ).status,
    ).toBe('rejected');
    value.review.levelName = 'other-level';
    await expect(
      sumsubAdapter(vi.fn(async () => response(value))).read(
        sumsubId,
        correlation,
      ),
    ).rejects.toThrow();
  });
  it.each([401, 403, 429, 500])(
    'sanitizes %i responses without retrying a mutation',
    async (status) => {
      const fetcher = vi.fn(
        async () => new Response('private-vendor-error', { status }),
      );
      await expect(
        diditAdapter(fetcher).importShared('private-token', correlation),
      ).rejects.toMatchObject({
        code: 'wallet_identity_unavailable',
        outcome: 'unknown',
        message: 'wallet_identity_unavailable',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('bounds responses and rejects malformed JSON without exposing it', async () => {
    for (const body of [
      'not-json-private',
      JSON.stringify({ data: 'x'.repeat(1024 * 1024 + 1) }),
    ]) {
      const fetcher = vi.fn(async () => new Response(body));
      await expect(
        diditAdapter(fetcher).importShared('opaque', correlation),
      ).rejects.toThrow('wallet_identity_unavailable');
    }
  });
  it('refuses oversized Sumsub tokens before any call and requires the new Share feature', async () => {
    const fetcher = vi.fn();
    await expect(
      sumsubAdapter(fetcher).importShared('a'.repeat(1025), correlation),
    ).rejects.toThrow('wallet_provider_input');
    expect(fetcher).not.toHaveBeenCalled();
    expect(() =>
      createSumsubIdentityAdapter(
        {
          appToken: 'test',
          secretKey: 'test',
          levelName: 'test',
          reusableKycShareEnabled: false as unknown as true,
        },
        fetcher,
      ),
    ).toThrow('wallet_provider_configuration');
  });
  it('uses read-only recipient lookups to recover evidence without redeeming another token', async () => {
    const fetcher = vi.fn(async () => response(didit()));
    await diditAdapter(fetcher).read(diditId, correlation);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe(
      `https://verification.didit.me/v3/session/${diditId}/decision/`,
    );
    const other = vi.fn(async () => response(sumsub()));
    await sumsubAdapter(other).readByCorrelation!(correlation);
    expect((other.mock.calls[0] as unknown as [string])[0]).toBe(
      `https://api.sumsub.com/resources/applicants/-;externalUserId=${correlation}/one`,
    );
  });
  it('starts hosted verification with opaque correlation and refuses unexpected redirect hosts', async () => {
    const fetcher = vi.fn(async () =>
      response({
        session_id: diditId,
        url: 'https://verify.didit.me/session/example',
      }),
    );
    expect(
      (await diditAdapter(fetcher).startVerification!(correlation)).reference,
    ).toBe(diditId);
    const other = vi.fn(async () =>
      response({ url: 'https://in.sumsub.com/websdk/p/example' }),
    );
    expect(
      (await sumsubAdapter(other).startVerification!(correlation)).url,
    ).toContain('in.sumsub.com');
    expect(
      JSON.parse(
        (other.mock.calls[0] as unknown as [string, RequestInit])[1]
          .body as string,
      ),
    ).toEqual({
      levelName: 'provider-kyc',
      userId: correlation,
      ttlInSecs: 1800,
    });
    await expect(
      sumsubAdapter(
        vi.fn(async () => response({ url: 'https://attacker.example.test' })),
      ).startVerification!(correlation),
    ).rejects.toThrow('wallet_identity_unavailable');
  });
});
