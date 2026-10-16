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
  if (!guide.scope) return 'No access token needed';
  if (guide.financial && !config.financial)
    return 'Transfer signing is off in Policies';
  if (guide.records && !config.policy.identity?.records)
    return 'Select application records in Services to use batch submission';
  if (guide.vendor && config.policy.identity?.records)
    return 'Select an identity vendor in Services to import verification';
  const app = config.policy.applications[applicationIndex];
  if (!app?.clientId || !app.issuer || app.issuer !== config.oauth.issuer)
    return "Complete this application's registration in Policies and Services";
  if (app.enabled === false) return 'This application is disabled in Policies';
  if (
    config.policy.access?.mode === 'application' &&
    !app.assertionTrust?.agreement
  )
    return 'Record this application’s identity and consent trust agreement in Policies';
  if (
    guide.permission &&
    !(app.permissions ?? ['account:read', 'operations:request']).includes(
      guide.permission,
    )
  )
    return 'Select the required permission for this application in Policies';
  if (!config.activation.enabled)
    return 'Wallet operations are disabled in Deployment';
  return 'Settings are present; deployed access has not been checked';
}
export function requestExample(
  id: string,
  config: ProviderConfiguration,
  applicationIndex: number,
): object | undefined {
  const identityRecord = {
    reference: 'evaluation-owner-001',
    fields: Object.fromEntries(
      (
        config.policy.identity?.records?.requiredFields ?? [
          'display_name',
          'country',
        ]
      ).map((field) => [
        field,
        field === 'country' ? 'ZA' : 'Fictional evaluation value',
      ]),
    ),
  };
  if (id === 'submitAccountAccessRecords') return { records: [identityRecord] };
  if (id === 'requestAccountAccess')
    return {
      mode: 'create',
      ...(config.policy.access?.mode === 'application'
        ? {
            user: {
              id: 'example-application-user',
              identity: {
                reference: 'example-identity-record',
                level:
                  config.policy.identity?.application?.verificationLevel ??
                  'verified',
                verified_at: '2030-01-01T00:00:00.000Z',
                fields: Object.fromEntries(
                  (
                    config.policy.identity?.application?.requiredFields ?? []
                  ).map((field) => [field, 'Example value']),
                ),
              },
              consent: {
                reference: 'example-consent-record',
                granted_at: '2030-01-01T00:00:00.000Z',
                expires_at: '2030-01-02T00:00:00.000Z',
                policy_revision: 'a'.repeat(64),
                ...(config.financial
                  ? { transfer_policy_revision: 'b'.repeat(64) }
                  : {}),
              },
            },
          }
        : {}),
      ...(config.policy.identity?.records
        ? { identity_record: identityRecord }
        : {}),
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
  if (
    id === 'provisionAccount' ||
    id === 'signAction' ||
    id === 'revokeAccountAccess'
  )
    return {};
}
export function referenceOperations(
  contract: ApiContract,
  config: ProviderConfiguration,
  applicationIndex: number,
) {
  return Object.entries(contract.paths).flatMap(([path, methods]) =>
    Object.entries(methods).flatMap(([method, operation]) => {
      const guide = operationGuides[operation.operationId];
      return guide &&
        !(
          config.policy.access?.mode === 'application' &&
          (guide.records || guide.vendor)
        ) &&
        !(config.policy.access?.mode !== 'application' && guide.applicationLed)
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
export function responseExample(
  id: string,
  config?: ProviderConfiguration,
  requestedPermissions?: string[],
): object {
  const applicationLed = config?.policy.access?.mode === 'application';
  if (id === 'revokeAccountAccess')
    return { grant_id: exampleId, status: 'revoked' };
  if (
    applicationLed &&
    ['requestAccountAccess', 'getAccountAccessRequest'].includes(id)
  )
    return {
      request_id: exampleId,
      status: 'granted',
      account_id: exampleId,
      grant_id: exampleId,
      permissions: requestedPermissions ?? ['account:read'],
      expires_at: '2030-01-02T00:00:00.000Z',
    };
  const address = '0x1111111111111111111111111111111111111111';
  const consent_url = `https://wallet.example.com/onboarding/${exampleId}`;
  if (id === 'getCapabilities')
    return {
      profile: 'provider-signing-preview',
      status: 'experimental',
      configured: false,
    };
  if (id === 'getAccountAccessPolicy')
    return {
      flow: applicationLed ? 'application' : 'hosted',
      policy_revision: 'a'.repeat(64),
      ...(applicationLed && config?.financial
        ? {
            transfer_policy_revision: 'b'.repeat(64),
            transfer_terms: config.financial,
          }
        : {}),
      ...(applicationLed
        ? {
            verification_level:
              config!.policy.identity!.application!.verificationLevel,
            max_identity_age_days: config!.policy.identity!.maxAgeDays ?? 365,
            max_access_days: config!.policy.access!.maxAgeDays ?? 30,
            provider_login_required: false,
          }
        : {}),
      source: applicationLed ? 'application_attestation' : 'application_record',
      evaluation_only: !applicationLed,
      required_fields: applicationLed
        ? config!.policy.identity!.application!.requiredFields
        : (config?.policy.identity?.records?.requiredFields ?? [
            'country',
            'display_name',
          ]),
      maximum_field_characters: 512,
      owner_consent_required: true,
      provider_review_required: !applicationLed,
    };
  if (id === 'submitAccountAccessRecords')
    return {
      results: [
        {
          index: 0,
          status: 'submitted',
          receipt: {
            request_id: exampleId,
            status: 'consent_required',
            consent_url,
          },
        },
      ],
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
    title: 'Wallet API reference · local preview',
    description:
      'Explore your current wizard settings and example responses. No API requests are sent. Deployed requests still require a ready service, a valid application token and current account permission.',
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
      if (body)
        body.example = responseExample(
          item.operation.operationId,
          config,
          (
            item.body as
              { authorization_details?: [{ actions: string[] }] } | undefined
          )?.authorization_details?.[0]?.actions,
        );
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
