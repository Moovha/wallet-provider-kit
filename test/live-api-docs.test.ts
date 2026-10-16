import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  liveApiSpecification,
  liveRequestInterceptor,
} from '../src/service/live-api-docs.js';
import {
  deployedExplorerUrl,
  type ApiContract,
} from '../setup-ui/api-reference.js';
const contract: ApiContract = JSON.parse(
  await readFile(new URL('../spec/provider-api.json', import.meta.url), 'utf8'),
);
afterEach(() => vi.unstubAllGlobals());
describe('live API explorer boundaries', () => {
  it('shows configured financial operations without modifying schemas or the canonical document', () => {
    const before = structuredClone(contract);
    const live = liveApiSpecification(contract, true, true);
    expect(
      Object.values(live.paths).flatMap((methods) => Object.values(methods)),
    ).toHaveLength(9);
    for (const [path, methods] of Object.entries(live.paths)) {
      for (const [method, operation] of Object.entries(
        methods as Record<string, any>,
      )) {
        expect(operation.responses).toEqual(
          contract.paths[path][method].responses,
        );
        expect(operation.requestBody).toEqual(
          contract.paths[path][method].requestBody,
        );
        expect(operation.parameters).toEqual(
          contract.paths[path][method].parameters,
        );
        expect(operation.security).toEqual(
          contract.paths[path][method].security,
        );
      }
    }
    expect(contract).toEqual(before);
  });
  it('never falls back to an example or unsafe live destination for incomplete drafts', () => {
    expect(deployedExplorerUrl('https://wallet.example.test')).toBe(
      'https://wallet.example.test/docs/',
    );
    const credentialOrigin = new URL('https://host.test');
    credentialOrigin.username = 'fixture-user';
    credentialOrigin.password = 'fixture-password';
    expect(deployedExplorerUrl(credentialOrigin.href)).toBeUndefined();
    for (const origin of [
      '',
      'https://wallet.example.test/',
      'http://host.test',
      'https://host.test/path',
      'javascript:alert(1)',
    ])
      expect(deployedExplorerUrl(origin)).toBeUndefined();
  });
  it('restricts requests to this HTTPS provider, omits browser cookies and refuses redirects', () => {
    vi.stubGlobal('location', new URL('https://wallet.example.test/docs/'));
    expect(liveRequestInterceptor({ url: '/v1/capabilities' })).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
    });
    expect(() =>
      liveRequestInterceptor({
        url: 'https://other.example.test/v1/capabilities',
      }),
    ).toThrow();
    vi.stubGlobal('location', new URL('http://public.example.test/docs/'));
    expect(() => liveRequestInterceptor({ url: '/v1/capabilities' })).toThrow();
    vi.stubGlobal('location', new URL('http://127.0.0.1:8080/docs/'));
    expect(liveRequestInterceptor({ url: '/v1/capabilities' }).url).toBe(
      '/v1/capabilities',
    );
  });
});
