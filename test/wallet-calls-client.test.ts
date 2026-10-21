import { describe, expect, it, vi } from 'vitest';
import {
  createWalletCallsProvider,
  WalletCallsRpcError,
} from '../src/wallet-calls/client.js';

describe('wallet calls request adapter', () => {
  it('sends exact standard parameters once using host authorization and never follows redirects', async () => {
    const request = vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      expect(body).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'wallet_sendCalls',
        params: [
          {
            version: '2.0.0',
            chainId: '0x14a34',
            atomicRequired: true,
            calls: [],
          },
        ],
      });
      expect(options).toMatchObject({
        redirect: 'error',
        credentials: 'omit',
        headers: { authorization: 'Bearer offline-access' },
      });
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: { id: '0x1234' },
      });
    });
    const provider = createWalletCallsProvider({
      url: 'https://wallet.example.test/v1/accounts/offline/wallet',
      authorization: async () => 'Bearer offline-access',
      fetch: request,
    });
    expect(
      await provider.request({
        method: 'wallet_sendCalls',
        params: [
          {
            version: '2.0.0',
            chainId: '0x14a34',
            atomicRequired: true,
            calls: [],
          },
        ],
      }),
    ).toEqual({ id: '0x1234' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('shows a batch only after a successful authorized status lookup through the configured presenter', async () => {
    const status = {
      version: '2.0.0',
      id: '0x1234',
      chainId: '0x14a34',
      status: 100,
      atomic: true,
    };
    const presenter = vi.fn(async () => {});
    const request = vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      expect(body.method).toBe('wallet_getCallsStatus');
      return Response.json({ jsonrpc: '2.0', id: body.id, result: status });
    });
    const provider = createWalletCallsProvider({
      url: 'https://wallet.example.test/v1/accounts/offline/wallet',
      authorization: async () => 'Bearer offline-access',
      fetch: request,
      showCallsStatus: presenter,
    });
    expect(
      await provider.request({
        method: 'wallet_showCallsStatus',
        params: ['0x1234'],
      }),
    ).toBeNull();
    expect(presenter).toHaveBeenCalledWith(status);
  });
  it.each([
    'wrong id',
    'ambiguous result',
    'HTTP authorization',
    'RPC error',
  ] as const)('rejects %s without an automatic retry', async (kind) => {
    const request = vi.fn<typeof fetch>(async () =>
      kind === 'HTTP authorization'
        ? Response.json({}, { status: 403 })
        : Response.json({
            jsonrpc: '2.0',
            id: kind === 'wrong id' ? 2 : 1,
            ...(kind === 'RPC error' ? {} : { result: { id: '0x1234' } }),
            ...(kind === 'RPC error' || kind === 'ambiguous result'
              ? { error: { code: 5730, message: 'Unknown bundle id' } }
              : {}),
          }),
    );
    const provider = createWalletCallsProvider({
      url: 'https://wallet.example.test/v1/accounts/offline/wallet',
      authorization: async () => 'Bearer offline-access',
      fetch: request,
    });
    await expect(
      provider.request({ method: 'wallet_getCallsStatus', params: ['0x1234'] }),
    ).rejects.toBeInstanceOf(WalletCallsRpcError);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects display without a presenter and rejects credential-bearing transport locations', async () => {
    const credentialUrl = new URL('https://wallet.example.test');
    credentialUrl.username = 'offline-user';
    credentialUrl.password = 'offline-placeholder';
    expect(() =>
      createWalletCallsProvider({
        url: credentialUrl.href,
        authorization: async () => '',
      }),
    ).toThrow();
    expect(() =>
      createWalletCallsProvider({
        url: 'http://wallet.example.test',
        authorization: async () => '',
      }),
    ).toThrow();
    const provider = createWalletCallsProvider({
      url: 'https://wallet.example.test/v1/accounts/offline/wallet',
      authorization: async () => '',
    });
    await expect(
      provider.request({
        method: 'wallet_showCallsStatus',
        params: ['0x1234'],
      }),
    ).rejects.toMatchObject({ code: 4200 });
    await expect(
      provider.request({ method: 'eth_sendTransaction', params: [] }),
    ).rejects.toMatchObject({ code: -32601 });
  });
});
it('reports transport loss as disconnected without retrying a possibly admitted batch', async () => {
  const request = vi.fn<typeof fetch>(async () => {
    throw new Error('Offline transport loss');
  });
  const provider = createWalletCallsProvider({
    url: 'https://wallet.example.test/v1/accounts/offline/wallet',
    authorization: async () => 'Bearer offline-access',
    fetch: request,
  });
  await expect(
    provider.request({ method: 'wallet_sendCalls', params: [] }),
  ).rejects.toMatchObject({ code: 4900 });
  expect(request).toHaveBeenCalledTimes(1);
});

it('streams authenticated status without exposing tokens in URLs and cancels the stream at terminal status', async () => {
  const accessGrantId = '11111111-1111-4111-8111-111111111111';
  const pending = {
    version: '2.0.0',
    id: 'batch',
    chainId: '0x14a34',
    status: 100,
    atomic: true,
  };
  const failed = { ...pending, status: 500 };
  const request = vi.fn<typeof fetch>(async (url, options) => {
    expect(String(url)).toBe(
      'https://wallet.example.test/v1/accounts/offline/wallet/calls/batch/events',
    );
    expect(options?.headers).toMatchObject({
      authorization: 'Bearer offline-access',
      'Wallet-Grant-Id': accessGrantId,
    });
    return new Response(
      'event: status\ndata: ' +
        JSON.stringify(pending) +
        '\n\nevent: status\ndata: ' +
        JSON.stringify(failed) +
        '\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  const provider = createWalletCallsProvider({
    url: 'https://wallet.example.test/v1/accounts/offline/wallet',
    accessGrantId,
    authorization: async () => 'Bearer offline-access',
    fetch: request,
  });
  const statuses = [];
  for await (const status of provider.watchCallsStatus('batch'))
    statuses.push(status.status);
  expect(statuses).toEqual([100, 500]);
  expect(request).toHaveBeenCalledOnce();
});
