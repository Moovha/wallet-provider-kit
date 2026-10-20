import { afterEach, expect, it, vi } from 'vitest';
import {
  etherscanEndpoint,
  etherscanRead,
  etherscanSupports,
} from '../src/execution/etherscan.js';
afterEach(() => vi.useRealTimers());
const endpoint =
  'https://api.etherscan.io/v2/api?chainid=84532&apikey=offlinefixture';
it('accepts only the bounded official explorer URL and excludes signing, submission and simulation overrides', () => {
  expect(etherscanEndpoint(endpoint)).toBeInstanceOf(URL);
  for (const value of [
    endpoint + '&action=anything',
    endpoint.replace('api.etherscan.io', 'evil.example'),
    endpoint.replace('84532', '1'),
    endpoint + '#fragment',
  ])
    expect(etherscanEndpoint(value)).toBeUndefined();
  expect(etherscanSupports('eth_sendRawTransaction', [])).toBe(false);
  expect(etherscanSupports('eth_call', [{}, 'latest', {}])).toBe(false);
});
it('maps compatible block reads and respects the shared key rate budget', async () => {
  vi.useFakeTimers();
  const times: number[] = [];
  const request = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    expect(url.searchParams.get('action')).toBe('eth_getBlockByNumber');
    expect(url.searchParams.get('tag')).toBe('0x64');
    times.push(Date.now());
    return Response.json({ jsonrpc: '2.0', id: 1, result: { number: '0x64' } });
  });
  const reads = Promise.all(
    Array.from({ length: 3 }, () =>
      etherscanRead(endpoint, 'eth_getBlockByNumber', ['0x64', false], request),
    ),
  );
  await vi.runAllTimersAsync();
  expect(await reads).toHaveLength(3);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(350);
  expect(times[2] - times[1]).toBeGreaterThanOrEqual(350);
});
it('rejects API throttling responses without exposing the credential URL', async () => {
  await expect(
    etherscanRead(
      endpoint.replace('offlinefixture', 'offlineerror'),
      'eth_getBlockByNumber',
      ['0x64', false],
      async () =>
        Response.json({
          status: '0',
          message: 'NOTOK',
          result: 'Max rate limit reached',
        }),
    ),
  ).rejects.toMatchObject({ code: 'wallet_provider_unavailable' });
});

it('stores explorer query credentials encrypted and returns only origin metadata', async () => {
  const { ApplicationCredentialCipher, credentialOrigin, credentialMetadata } =
    await import('../src/runtime-configuration/credentials.js');
  const cipher = new ApplicationCredentialCipher(
    Buffer.alloc(32, 7).toString('base64'),
  );
  const metadata = {
    application_id: 'offline-app',
    reference: 'explorer',
    revision: '1',
    origin: credentialOrigin(endpoint),
    status: 'active' as const,
  };
  const sealed = cipher.seal(metadata, endpoint);
  expect(JSON.stringify(sealed)).not.toContain('offlinefixture');
  expect(credentialMetadata(sealed)).toEqual(metadata);
  expect(cipher.open(sealed)).toBe(endpoint);
});
