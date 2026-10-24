import { expect, it, vi } from 'vitest';
import {
  createWalletsClient,
  WalletAccessError,
} from '../src/wallets/client.js';

const url = 'https://wallet.example.test';
const authorization = async () => 'Bearer offline';
const requestId = '11111111-1111-4111-8111-111111111111';

it('reads sharing requirements using an encoded source application and selected network', async () => {
  const send = vi.fn<typeof fetch>(async (input, init) => {
    const target = new URL(String(input));
    expect(target.pathname).toBe('/v1/access-policy');
    expect([...target.searchParams]).toEqual([
      ['source_application_id', 'source & private'],
    ]);
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      headers: {
        authorization: 'Bearer offline',
        'Wallet-Network': 'ethereum-sepolia',
      },
    });
    return Response.json({
      policy_revision: 'consent-1',
      wallet_sharing: {
        source_application_id: 'source & private',
        matching_fields: ['country'],
        revision: 'sharing-1',
      },
    });
  });
  const client = createWalletsClient({
    url,
    network: 'ethereum-sepolia',
    authorization,
    fetch: send,
  });
  const policy = await client.accessPolicy('source & private');
  expect(policy.wallet_sharing?.revision).toBe('sharing-1');
  expect(policy.wallet_sharing?.matching_fields).toEqual(['country']);
  expect(send).toHaveBeenCalledOnce();
});

it('reads a saved access decision without creating a request or requiring a mutation key', async () => {
  const send = vi.fn<typeof fetch>(async (input, init) => {
    expect(String(input)).toBe(url + '/v1/access-requests/' + requestId);
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).has('Idempotency-Key')).toBe(false);
    return Response.json({
      request_id: requestId,
      status: 'reconciliation_required',
    });
  });
  const client = createWalletsClient({ url, authorization, fetch: send });
  expect(await client.accessRequest(requestId)).toEqual({
    request_id: requestId,
    status: 'reconciliation_required',
  });
  expect(() => client.accessRequest('../other')).toThrow(
    'valid access request ID',
  );
  expect(() => client.accessPolicy('')).toThrow('valid source application ID');
  expect(send).toHaveBeenCalledOnce();
});

it.each([
  [401, 'invalid_token', 'not_dispatched'],
  [403, 'wallet_authorization_denied', 'not_dispatched'],
  [409, 'wallet_attempt_pending', 'unknown'],
  [429, 'rate_limited', 'not_dispatched'],
  [503, 'wallet_provider_unavailable', 'unknown'],
] as const)(
  'retains recovery details for HTTP %i without retrying',
  async (status, code, outcome) => {
    const send = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          status,
          code,
          outcome,
          request_id: requestId,
          title: 'Private server detail',
          detail: 'Do not retain response bodies',
        },
        { status, headers: { 'Retry-After': '12' } },
      ),
    );
    const client = createWalletsClient({ url, authorization, fetch: send });
    const error = await client
      .provision(requestId, requestId, requestId)
      .catch((e) => e);
    expect(error).toBeInstanceOf(WalletAccessError);
    expect(error).toMatchObject({
      status,
      code,
      outcome,
      requestId,
      retryAfterSeconds: 12,
    });
    expect(error).not.toHaveProperty('detail');
    expect(error.message).not.toContain('Private');
    expect(send).toHaveBeenCalledOnce();
  },
);

it.each([
  'not-json',
  JSON.stringify({
    status: 200,
    code: 'wallet_attempt_pending',
    outcome: 'not_dispatched',
    request_id: requestId,
  }),
  JSON.stringify({
    status: 503,
    code: 'unsafe code\n',
    outcome: 'succeeded',
    request_id: 'https://private.example.test',
  }),
])(
  'keeps HTTP status when problem metadata is malformed or inconsistent: %s',
  async (body) => {
    const send = vi.fn<typeof fetch>(
      async () =>
        new Response(body, {
          status: 503,
          headers: { 'Retry-After': 'invalid' },
        }),
    );
    const client = createWalletsClient({ url, authorization, fetch: send });
    await expect(client.account(requestId)).rejects.toMatchObject({
      status: 503,
      code: undefined,
      requestId: undefined,
      outcome: undefined,
      retryAfterSeconds: undefined,
    });
    expect(send).toHaveBeenCalledOnce();
  },
);

it('marks a lost transport response uncertain without retaining the exception or retrying', async () => {
  const send = vi.fn<typeof fetch>(async () => {
    throw new Error('Private request contents');
  });
  const client = createWalletsClient({ url, authorization, fetch: send });
  const error = await client
    .provision(requestId, requestId, requestId)
    .catch((e) => e);
  expect(error).toMatchObject({ status: 0, outcome: 'unknown' });
  expect(error).not.toHaveProperty('cause');
  expect(error.message).not.toContain('Private');
  expect(send).toHaveBeenCalledOnce();
});

it('retains uncertainty when a successful HTTP response cannot be decoded', async () => {
  const send = vi.fn<typeof fetch>(
    async () => new Response('incomplete', { status: 200 }),
  );
  const client = createWalletsClient({ url, authorization, fetch: send });
  await expect(
    client.provision(requestId, requestId, requestId),
  ).rejects.toMatchObject({ status: 200, outcome: 'unknown' });
  expect(send).toHaveBeenCalledOnce();
});

it('converts an HTTP-date retry delay without inventing an outcome for an empty error response', async () => {
  const now = vi
    .spyOn(Date, 'now')
    .mockReturnValue(Date.parse('2030-01-01T00:00:00Z'));
  try {
    const send = vi.fn<typeof fetch>(
      async () =>
        new Response('', {
          status: 429,
          headers: { 'Retry-After': 'Tue, 01 Jan 2030 00:00:30 GMT' },
        }),
    );
    const client = createWalletsClient({ url, authorization, fetch: send });
    await expect(client.account(requestId)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 30,
      outcome: undefined,
    });
    expect(send).toHaveBeenCalledOnce();
  } finally {
    now.mockRestore();
  }
});
