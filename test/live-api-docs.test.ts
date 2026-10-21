import {
  apiTasks,
  apiOperationOrder,
  operationGuides,
} from '../src/service/api-guides.js';
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
  it('shows all operations without modifying schemas or the canonical document', () => {
    const before = structuredClone(contract);
    const live = liveApiSpecification(contract, {
      onboarding: true,
      enrollment: false,
      wallet: true,
      flow: 'application',
    });
    expect(
      Object.values(live.paths).flatMap((methods) => Object.values(methods)),
    ).toHaveLength(
      Object.values(contract.paths).flatMap((methods) => Object.values(methods))
        .length,
    );
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
  it('gives every request a task, caller, purpose and usage guidance without duplicate introductions', () => {
    const tasks = new Set(apiTasks.map((task) => String(task.name)));
    expect([...apiOperationOrder].sort()).toEqual(
      Object.keys(operationGuides).sort(),
    );
    for (const methods of Object.values(contract.paths)) {
      for (const op of Object.values(methods)) {
        const guide = operationGuides[op.operationId];
        expect(tasks.has(guide.group), op.operationId).toBe(true);
        expect(guide.audience.trim().length).toBeGreaterThan(0);
        for (const field of ['purpose', 'whenToUse'] as const)
          expect(guide[field].trim().length, op.operationId).toBeGreaterThan(
            15,
          );
        expect(op.summary).toBe(guide.title);
        expect(op.description?.split('**Why this exists:**')).toHaveLength(2);
        expect(op.description).toContain(guide.purpose);
        expect(op.description).toContain(guide.whenToUse);
      }
    }
  });
  it('labels missing profiles while retaining every endpoint in every configuration', () => {
    for (const flow of ['application', 'hosted'] as const) {
      const live = liveApiSpecification(contract, {
        onboarding: true,
        enrollment: false,
        wallet: true,
        flow,
        records: flow === 'hosted',
      });
      expect(Object.keys(live.paths).sort()).toEqual(
        Object.keys(contract.paths).sort(),
      );
      for (const path of [
        '/v1/accounts/{accountId}/wallet',
        '/v1/enrollments',
      ]) {
        expect(live.paths[path].post.summary).toContain('[Not enabled]');
        expect(live.paths[path].post.description).toContain('Not enabled');
      }
      expect(live.paths['/v1/access-requests'].post.summary).toContain(
        '[Configured]',
      );
      expect(
        live.paths['/v1/access-grants/{grantId}/revoke'].post.summary,
      ).toContain(flow === 'application' ? '[Configured]' : '[Not enabled]');
      expect(live.info.description).toContain(
        'sponsored Safe ERC-4337 UserOperation',
      );
    }
    const embedded = liveApiSpecification(contract, {
      onboarding: false,
      enrollment: true,
      wallet: true,
    });
    expect(embedded.paths['/v1/enrollments'].post.summary).toContain(
      '[Configured]',
    );
    expect(
      embedded.paths['/v1/accounts/{accountId}/wallet'].post.summary,
    ).toContain('[Not enabled]');
    expect(embedded.paths['/v1/access-requests'].post.summary).toContain(
      '[Not enabled]',
    );
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
  it('restricts requests to this HTTPS provider, omits browser cookies and refuses redirects', async () => {
    vi.stubGlobal('location', new URL('https://wallet.example.test/docs/'));
    expect(
      await liveRequestInterceptor({ url: '/v1/capabilities' }),
    ).toMatchObject({
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
    expect(
      (await liveRequestInterceptor({ url: '/v1/capabilities' })).url,
    ).toBe('/v1/capabilities');
  });
});
