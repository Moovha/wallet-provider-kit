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
    new URL('../docs/provider.config.hosted.example.json', import.meta.url),
    'utf8',
  ),
);
function fixture() {
  return validateProviderConfiguration(structuredClone(sample));
}
describe('operator API reference', () => {
  it('uses canonical request/response contracts, includes unavailable advanced profiles and does not mutate them', () => {
    const config = fixture();
    const operations = referenceOperations(contract, config, 0);
    expect(operations).toHaveLength(17);
    expect(
      Object.values(contract.paths)
        .flatMap((methods) =>
          Object.values(methods).map((operation) => operation.operationId),
        )
        .sort(),
    ).toEqual(Object.keys(operationGuides).sort());
    expect(operations.map((item) => item.operation.operationId).sort()).toEqual(
      Object.entries(operationGuides)
        .map(([id]) => id)
        .sort(),
    );
    const spec = referenceSpec(contract, config, operations);
    for (const item of operations) {
      const preview = spec.paths[item.path][item.method];
      expect(
        preview.responses[
          item.operation.operationId === 'beginEnrollment' ? '201' : '200'
        ].content?.['application/json'].schema,
      ).toEqual(
        item.operation.responses[
          item.operation.operationId === 'beginEnrollment' ? '201' : '200'
        ].content?.['application/json'].schema,
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
    ).toBe(true);
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
    ).toBe('No access token needed');
    expect(
      operations.find(
        (item) => item.operation.operationId === 'requestAccountAccess',
      )?.status,
    ).toBe('Not enabled: Wallet operations are disabled in Deployment');
    expect(
      operations.find((item) => item.operation.operationId === 'signAction')
        ?.status,
    ).toBe('Not enabled: Transfer signing is off in Policies');
    config.financial = {
      profile: 'provider-authorized-erc3009-v1',
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
    ).toBe('Select the required permission for this application in Policies');
    expect(
      operations.find(
        (item) => item.operation.operationId === 'provisionAccount',
      )?.status,
    ).toBe('Settings are present; deployed access has not been checked');
    config.policy.applications.push({
      ...config.policy.applications[0],
      clientId: 'disabled-app',
      enabled: false,
    });
    expect(
      referenceOperations(contract, config, 1).find(
        (item) => item.operation.operationId === 'requestAccountAccess',
      )?.status,
    ).toBe('This application is disabled in Policies');
    delete config.policy.applications[0].permissions;
    expect(
      referenceOperations(contract, config, 0).find(
        (item) => item.operation.operationId === 'signAction',
      )?.status,
    ).toBe('Select the required permission for this application in Policies');
  });
  it('provides schema-valid request examples and placeholder-only scoped cURL with an explicit retry key', () => {
    const config = fixture();
    const operations = referenceOperations(contract, config, 0);
    const ajv = new Ajv({ strict: false, formats: fullFormats });
    for (const item of operations) {
      expect(
        ajv.validate(
          item.operation.responses[
            item.operation.operationId === 'beginEnrollment' ? '201' : '200'
          ].content!['application/json'].schema,
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

it('previews application-led policy and grants with schema-valid evidence examples and unavailable hosted endpoints', async () => {
  const config = validateProviderConfiguration(
    JSON.parse(await readFile('docs/provider.config.example.json', 'utf8')),
  );
  const operations = referenceOperations(contract, config, 0);
  expect(
    operations.some((item) => item.guide.records || item.guide.vendor),
  ).toBe(true);
  expect(
    operations
      .filter((item) => item.guide.records || item.guide.vendor)
      .every((item) => item.status.startsWith('Not enabled:')),
  ).toBe(true);
  expect(
    operations.some(
      (item) => item.operation.operationId === 'revokeAccountAccess',
    ),
  ).toBe(true);
  const spec = referenceSpec(contract, config, operations);
  const ajv = new Ajv({ strict: false, formats: fullFormats });
  for (const item of operations) {
    const op = spec.paths[item.path][item.method];
    const response =
      op.responses[
        item.operation.operationId === 'beginEnrollment' ? '201' : '200'
      ].content!['application/json'];
    expect(
      ajv.validate(response.schema, response.example),
      JSON.stringify(ajv.errors),
    ).toBe(true);
    if (op.requestBody) {
      const body = op.requestBody.content['application/json'];
      expect(
        ajv.validate(body.schema, body.example),
        JSON.stringify(ajv.errors),
      ).toBe(true);
    }
  }
  expect(responseExample('getAccountAccessPolicy', config)).toMatchObject({
    flow: 'application',
    required_fields: ['country'],
    provider_review_required: false,
    max_access_days: 7,
  });
  expect(responseExample('requestAccountAccess', config)).not.toHaveProperty(
    'consent_url',
  );
});
