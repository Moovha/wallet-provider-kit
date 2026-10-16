import {
  operationGuides,
  type OperationGuide,
} from '../src/service/api-guides.js';
export { operationGuides } from '../src/service/api-guides.js';
import type { ProviderConfiguration } from './model.js';

export interface ApiOperation {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<{ name: string; in: string; example?: unknown }>;
  requestBody?: {
    content: Record<string, { schema: object; example?: unknown }>;
  };
  responses: Record<
    string,
    {
      description: string;
      content?: Record<string, { schema: object; example?: unknown }>;
    }
  >;
  [key: string]: unknown;
}
export interface ApiContract {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, ApiOperation>>;
  servers?: Array<{ url: string }>;
  [key: string]: unknown;
}
export const exampleId = '10000000-0000-4000-8000-000000000001';

export function deployedExplorerUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.origin === value)
      return `${value}/docs/`;
  } catch {
    /* An incomplete origin must not produce a live destination. */
  }
}

export function referenceOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.origin === value) return value;
  } catch {
    /* Incomplete setup uses an explicit example origin. */
  }
  return 'https://wallet.example.com';
}
export function operationStatus(
  guide: OperationGuide,
  config: ProviderConfiguration,
  applicationIndex: number,
) {
  if (!guide.scope) return 'Public discovery';
  if (guide.financial && !config.financial)
    return 'Transfer profile not configured';
  const app = config.policy.applications[applicationIndex];
  if (!app?.clientId || !app.issuer || app.issuer !== config.oauth.issuer)
    return 'Application registration incomplete';
  if (app.enabled === false) return 'Application disabled';
  if (
    guide.permission &&
    !(app.permissions ?? ['account:read', 'operations:request']).includes(
      guide.permission,
    )
  )
    return 'Application permission not allowed';
  if (!config.activation.enabled) return 'Activation disabled';
  return 'Configured; runtime checks apply';
}
export function requestExample(
  id: string,
  config: ProviderConfiguration,
  applicationIndex: number,
): object | undefined {
  if (id === 'requestAccountAccess')
    return {
      mode: 'create',
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: config.policy.applications[applicationIndex]
            ?.permissions ?? ['account:read', 'operations:request'],
        },
      ],
    };
  if (id === 'importAccessIdentity')
    return {
      vendor: config.identity.didit ? 'didit' : 'sumsub',
      share_token: '<SHARED_IDENTITY_TOKEN>',
    };
  if (id === 'requestTransferAuthorization')
    return {
      account_id: exampleId,
      recipient:
        config.financial?.recipients[0] ||
        '0x1111111111111111111111111111111111111111',
      amount: '1',
    };
  if (id === 'provisionAccount' || id === 'signAction') return {};
}
export function referenceOperations(
  contract: ApiContract,
  config: ProviderConfiguration,
  applicationIndex: number,
) {
  return Object.entries(contract.paths).flatMap(([path, methods]) =>
    Object.entries(methods).flatMap(([method, operation]) => {
      const guide = operationGuides[operation.operationId];
      return guide
        ? [
            {
              path,
              method,
              operation,
              guide,
              status: operationStatus(guide, config, applicationIndex),
              body: requestExample(
                operation.operationId,
                config,
                applicationIndex,
              ),
            },
          ]
        : [];
    }),
  );
}
export type ReferenceOperation = ReturnType<typeof referenceOperations>[number];
/** Fictional, schema-checked bodies; never approvals, signatures or live results. */
export function responseExample(id: string): object {
  const address = '0x1111111111111111111111111111111111111111';
  const consent_url = `https://wallet.example.com/onboarding/${exampleId}`;
  if (id === 'getCapabilities')
    return {
      profile: 'provider-signing-preview',
      status: 'experimental',
      configured: false,
    };
  if (id === 'provisionAccount') return { account_id: exampleId, address };
  if (id === 'readGrantedAccount')
    return { account_id: exampleId, status: 'provisioned', address };
  if (id === 'signAction') return { signature: '0x' + '0'.repeat(130) };
  if (id === 'requestAccountAccess')
    return { request_id: exampleId, status: 'consent_required', consent_url };
  if (id === 'importAccessIdentity')
    return {
      request_id: exampleId,
      status: 'provider_review_required',
      consent_url,
    };
  if (id === 'getAccountAccessRequest')
    return {
      request_id: exampleId,
      status: 'granted',
      consent_url,
      account_id: exampleId,
      grant_id: '30000000-0000-4000-8000-000000000001',
      permissions: ['account:read'],
      expires_at: '2030-01-01T00:00:00.000Z',
    };
  return {
    action_id: exampleId,
    account_id: exampleId,
    status: 'authorized',
    expires_at: '2030-01-01T00:00:00.000Z',
    payload_hash: '0x' + '0'.repeat(64),
    payload: {
      primaryType: 'TransferWithAuthorization',
      domain: {
        name: 'Example Token',
        version: '1',
        chainId: '84532',
        verifyingContract: address,
      },
      types: {
        TransferWithAuthorization: [
          ['from', 'address'],
          ['to', 'address'],
          ['value', 'uint256'],
          ['validAfter', 'uint256'],
          ['validBefore', 'uint256'],
          ['nonce', 'bytes32'],
        ].map(([name, type]) => ({ name, type })),
      },
      message: {
        from: address,
        to: '0x2222222222222222222222222222222222222222',
        value: '1',
        validAfter: '0',
        validBefore: '1893456000',
        nonce: '0x' + '0'.repeat(64),
      },
    },
  };
}
export function referenceSpec(
  contract: ApiContract,
  config: ProviderConfiguration,
  operations: ReferenceOperation[],
) {
  const spec = structuredClone(contract);
  spec.info = {
    ...spec.info,
    title: 'Configured provider API reference',
    description:
      'Local configuration preview. Examples are illustrative, not live responses. Actual access requires deployed readiness, a compatible scoped token and current provider authority.',
  };
  spec.servers = [{ url: referenceOrigin(config.policy.provider.origin) }];
  spec.paths = {};
  for (const item of operations) {
    const op = structuredClone(item.operation);
    op.summary = item.guide.title;
    op.tags = [item.guide.group];
    op.description = [
      `**Configuration preview:** ${item.status}.`,
      `**Required OAuth scope:** ${item.guide.scope ?? 'None (public)'}.`,
      item.guide.prerequisite,
      item.guide.success,
      op.description ?? '',
    ].join('\n\n');
    for (const parameter of op.parameters ?? []) {
      if (parameter.in === 'path') parameter.example = exampleId;
      if (
        parameter.in === 'header' &&
        parameter.name.toLowerCase() === 'idempotency-key'
      )
        parameter.example = '20000000-0000-4000-8000-000000000001';
    }
    if (op.requestBody?.content['application/json'])
      op.requestBody.content['application/json'].example = item.body;
    if (op.responses['200']) {
      op.responses['200'].description = item.guide.success;
      const body = op.responses['200'].content?.['application/json'];
      if (body) body.example = responseExample(item.operation.operationId);
    }
    (spec.paths[item.path] ??= {})[item.method] = op;
  }
  return spec;
}
function shellQuote(value: string) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
export function curlExample(item: ReferenceOperation, origin: string) {
  const lines = [
    `curl --request ${item.method.toUpperCase()} ${shellQuote(referenceOrigin(origin) + item.path.replace(/\{[^}]+\}/g, exampleId))}`,
  ];
  if (item.guide.scope)
    lines.push("  --header 'Authorization: Bearer <APPLICATION_ACCESS_TOKEN>'");
  if (item.body !== undefined)
    lines.push(
      "  --header 'Content-Type: application/json'",
      "  --header 'Idempotency-Key: <NEW_UUIDV4_REUSE_ON_RETRY>'",
      `  --data ${shellQuote(JSON.stringify(item.body, null, 2))}`,
    );
  return lines.join(' \\\n') + '\n';
}
