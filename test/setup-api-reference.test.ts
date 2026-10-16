import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Ajv } from 'ajv';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import {
  curlExample,
  operationGuides,
  referenceOperations,
  referenceOrigin,
  referenceSpec,
  responseExample,
  type ApiContract,
} from '../setup-ui/api-reference.js';
const contract: ApiContract = JSON.parse(
  await readFile(new URL('../spec/provider-api.json', import.meta.url), 'utf8'),
);
const sample = JSON.parse(
  await readFile(
    new URL('../docs/provider.config.example.json', import.meta.url),
    'utf8',
  ),
);
function fixture() {
  return validateProviderConfiguration(structuredClone(sample));
}
describe('operator API reference', () => {
  it('uses canonical request/response contracts, excludes advanced profiles and does not mutate them', () => {
    const config = fixture();
    const operations = referenceOperations(contract, config, 0);
    expect(operations).toHaveLength(9);
    expect(
      Object.values(contract.paths)
        .flatMap((methods) =>
          Object.values(methods).map((operation) => operation.operationId),
        )
        .filter((id) => !id.toLowerCase().includes('enrollment'))
        .sort(),
    ).toEqual(Object.keys(operationGuides).sort());
    expect(operations.map((item) => item.operation.operationId).sort()).toEqual(
      Object.keys(operationGuides).sort(),
    );
    const spec = referenceSpec(contract, config, operations);
    for (const item of operations) {
      const preview = spec.paths[item.path][item.method];
      expect(
        preview.responses['200'].content?.['application/json'].schema,
      ).toEqual(
        item.operation.responses['200'].content?.['application/json'].schema,
      );
      expect(preview.requestBody?.content['application/json'].schema).toEqual(
        item.operation.requestBody?.content['application/json'].schema,
      );
      expect(preview.description).toContain(
        item.guide.scope ?? 'None (public)',
      );
    }
    expect(
      Object.keys(spec.paths).some((path) => path.includes('enrollment')),
    ).toBe(false);
    expect(contract.info.title).toBe('Moovha Wallet Provider Service');
    expect(contract.paths['/v1/access-requests'].post.summary).toBeUndefined();
  });
  it('distinguishes configuration, application permissions and activation without pretending to verify runtime access', () => {
    const config = fixture();
    let operations = referenceOperations(contract, config, 0);
    expect(
      operations.find(
        (item) => item.operation.operationId === 'getCapabilities',
      )?.status,
    ).toBe('Public discovery');
    expect(
      operations.find(
        (item) => item.operation.operationId === 'requestAccountAccess',
      )?.status,
    ).toBe('Activation disabled');
    expect(
      operations.find((item) => item.operation.operationId === 'signAction')
        ?.status,
    ).toBe('Transfer profile not configured');
    config.financial = {
      profile: 'owner-approved-erc3009-v1',
      token: {
        address: '0x1111111111111111111111111111111111111111',
        name: 'Example',
        version: '1',
        symbol: 'TEST',
        decimals: 6,
      },
      recipients: ['0x2222222222222222222222222222222222222222'],
      maximumAmount: '10',
      lifetimeAmount: '100',
      maxValiditySeconds: 300,
    };
    config.activation.enabled = true;
    config.policy.applications[0].permissions = ['account:read'];
    operations = referenceOperations(contract, config, 0);
    expect(
      operations.find((item) => item.operation.operationId === 'signAction')
        ?.status,
    ).toBe('Application permission not allowed');
    expect(
      operations.find(
        (item) => item.operation.operationId === 'provisionAccount',
      )?.status,
    ).toBe('Configured; runtime checks apply');
    config.policy.applications.push({
      ...config.policy.applications[0],
      clientId: 'disabled-app',
      enabled: false,
    });
    expect(
      referenceOperations(contract, config, 1).find((item) => item.guide.scope)
        ?.status,
    ).toBe('Application disabled');
    delete config.policy.applications[0].permissions;
    expect(
      referenceOperations(contract, config, 0).find(
        (item) => item.operation.operationId === 'signAction',
      )?.status,
    ).toBe('Configured; runtime checks apply');
  });
  it('provides schema-valid request examples and placeholder-only scoped cURL with an explicit retry key', () => {
    const config = fixture();
    const operations = referenceOperations(contract, config, 0);
    const ajv = new Ajv({ strict: false, formats: fullFormats });
    for (const item of operations) {
      expect(
        ajv.validate(
          item.operation.responses['200'].content!['application/json'].schema,
          responseExample(item.operation.operationId),
        ),
        JSON.stringify(ajv.errors),
      ).toBe(true);
      if (item.operation.requestBody) {
        expect(
          ajv.validate(
            item.operation.requestBody.content['application/json'].schema,
            item.body,
          ),
          JSON.stringify(ajv.errors),
        ).toBe(true);
        expect(curlExample(item, config.policy.provider.origin)).toContain(
          '<NEW_UUIDV4_REUSE_ON_RETRY>',
        );
      }
      expect(curlExample(item, config.policy.provider.origin)).not.toContain(
        'PROVIDER_LOGIN_SECRET',
      );
      if (item.guide.scope)
        expect(curlExample(item, config.policy.provider.origin)).toContain(
          '<APPLICATION_ACCESS_TOKEN>',
        );
    }
    expect(referenceOrigin('http://127.0.0.1:4319')).toBe(
      'https://wallet.example.com',
    );
    expect(referenceOrigin('https://wallet.example.com/unsafe?token=x')).toBe(
      'https://wallet.example.com',
    );
  });
});
