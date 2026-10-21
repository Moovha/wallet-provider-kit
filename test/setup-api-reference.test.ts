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
    new URL('../docs/provider.config.safe.example.json', import.meta.url),
    'utf8',
  ),
);
function fixture() {
  return validateProviderConfiguration(structuredClone(sample));
}
function responseBody(operation: {
  responses: Record<
    string,
    { content?: Record<string, { schema: object; example?: unknown }> }
  >;
}) {
  const response =
    operation.responses[
      Object.keys(operation.responses).find((code) => code.startsWith('2'))!
    ];
  return Object.values(response.content!)[0];
}
describe('operator API reference', () => {
  it('uses canonical request/response contracts, includes unavailable advanced profiles and does not mutate them', () => {
    const config = fixture();
    const operations = referenceOperations(contract, config, 0);
    expect(operations).toHaveLength(Object.keys(operationGuides).length);
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
      expect(responseBody(preview).schema).toEqual(
        responseBody(item.operation).schema,
      );
      expect(preview.requestBody?.content['application/json'].schema).toEqual(
        item.operation.requestBody?.content['application/json'].schema,
      );
      expect(preview.description).toContain(
        item.guide.scope ??
          (item.guide.serviceAuthenticated
            ? 'Service proof required'
            : 'None (public)'),
      );
    }
    expect(
      Object.keys(spec.paths).some((path) => path.includes('enrollment')),
    ).toBe(true);
    expect(contract.info.title).toBe('Moovha Wallet Provider Service');
    expect(contract.paths['/v1/access-requests'].post.summary).toBe(
      operationGuides.requestAccountAccess.title,
    );
  });
  it('provides schema-valid request examples and placeholder-only scoped cURL with an explicit retry key', () => {
    const config = fixture();
    const operations = referenceOperations(contract, config, 0);
    const ajv = new Ajv({ strict: false, formats: fullFormats });
    for (const item of operations) {
      expect(
        ajv.validate(
          responseBody(item.operation).schema,
          responseExample(item.operation.operationId),
        ),
        item.operation.operationId + ': ' + JSON.stringify(ajv.errors),
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
          item.guide.management ||
            item.guide.scope === 'wallet:configuration:write'
            ? '<PROVIDER_OPERATOR_ACCESS_TOKEN>'
            : '<APPLICATION_ACCESS_TOKEN>',
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
    JSON.parse(
      await readFile('docs/provider.config.safe.example.json', 'utf8'),
    ),
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
    const response = responseBody(op);
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
