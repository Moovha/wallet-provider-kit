import { providerNetwork } from '../src/networks.js';
import {
  operationGuides,
  operationUnavailableReason,
  transactionBoundaryDescription,
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
  const id =
    Object.entries(operationGuides).find(([, entry]) => entry === guide)?.[0] ??
    '';
  const unavailable = operationUnavailableReason(id, {
    management: !!config.management,
    onboarding: true,
    enrollment: false,
    wallet: true,
    safeWallet: !!config.safeWallet,
    walletCalls: !!config.safeWallet,
    runtimeConfiguration: !!config.runtimeConfiguration,
    flow: config.policy.access?.mode ?? 'application',
    records: !!config.policy.identity?.records,
    vendor: !!config.identity.didit || !!config.identity.sumsub,
  });
  if (guide.management)
    return unavailable
      ? `Not enabled: ${unavailable}`
      : 'Settings are present; claim or authenticate dedicated provider administration separately';
  if (!guide.scope && !guide.serviceAuthenticated)
    return 'No access token needed';
  if (unavailable) return `Not enabled: ${unavailable}`;
  if (guide.scope === 'wallet:configuration:write')
    return 'Use a dedicated configured provider operator token; application tokens cannot publish policy';
  if (guide.runtimeConfiguration)
    return 'Runtime registry settings are present; current application access still requires verification';
  const app = config.policy.applications[applicationIndex];
  if (!app?.clientId || !app.issuer || app.issuer !== config.oauth.issuer)
    return "Complete this application's registration in Applications and Services";
  if (app.enabled === false)
    return 'This application is disabled in Applications';
  if (
    config.policy.access?.mode === 'application' &&
    !app.assertionTrust?.agreement
  )
    return 'Record this application’s identity and consent trust agreement in Applications';
  if (
    guide.permission &&
    !(app.permissions ?? ['account:read', 'operations:request']).includes(
      guide.permission,
    )
  )
    return 'Select the required permission for this application in Applications';
  if (guide.scope && !config.activation.enabled)
    return 'Not enabled: Wallet operations are disabled in Deployment';
  return 'Settings are present; deployed access has not been checked';
}
function obligationExample(
  kind: string,
  network?: ProviderConfiguration['network'],
) {
  if (kind === 'actions')
    return [
      {
        name: 'pay_invoice',
        description: 'Pay an approved invoice.',
        fields: [
          {
            name: 'invoice_status',
            required: true,
            allowed_values: ['approved'],
          },
        ],
      },
    ];
  if (kind === 'services')
    return [
      {
        id: 'verification',
        kind: 'rpc-verification',
        vendor: 'example',
        credential_reference: 'verification-primary',
        billing_owner: 'application',
      },
    ];
  return {
    chain_id: providerNetwork(network).caip,
    funding_agreement: 'Application-funded gas agreement',
    maximum_gas_budget_wei: '1000000000000000',
    account_model: 'provider-controlled-user-safe',
    asset_model: 'individual-user-wallets',
    maximum_execution_accounts: 10,
  };
}
export function requestExample(
  id: string,
  config: ProviderConfiguration,
  applicationIndex: number,
): object | undefined {
  if (id === 'claimProviderInstallation')
    return {
      claim: 'offline-claim-placeholder-' + 'x'.repeat(43),
      username: 'offline-admin',
      password: 'offline-password-placeholder',
    };
  if (id === 'createProviderIdentity')
    return { name: 'Offline application', role: 'application' };
  if (id === 'updateProviderIdentity')
    return { expected_revision: 1, enabled: false };
  if (id === 'rotateProviderIdentityCredential')
    return { expected_revision: 1 };
  if (id === 'provisionSafeWalletInfrastructure') return {};
  if (id === 'writeApplicationCredential')
    return {
      expected_revision: '0',
      endpoint: 'https://rpc.example.test/application-key',
    };
  if (
    [
      'submitApplicationActions',
      'submitApplicationServices',
      'submitApplicationSponsorship',
    ].includes(id)
  )
    return {
      expected_revision: '0',
      value: obligationExample(
        id.slice('submitApplication'.length).toLowerCase(),
        config.network,
      ),
    };
  if (
    [
      'decideApplicationActions',
      'decideApplicationServices',
      'decideApplicationSponsorship',
    ].includes(id)
  )
    return {
      expected_revision: '1',
      expected_decision_revision: '0',
      decision: 'accepted',
    };
  if (
    id === 'proposeRuntimeConfiguration' ||
    id === 'updateRuntimeConfiguration'
  )
    return {
      expected_revision: '0',
      policy: {
        ...runtimePolicyExample,
        chain_id: providerNetwork(config?.network).caip,
      },
    };
  if (id === 'publishRuntimeConfiguration') return { expected_revision: '0' };
  if (id === 'beginEnrollment')
    return { identity_subject: 'example-provider-subject' };
  if (id === 'submitEnrollmentIdentity')
    return { id_token: 'e30.e30.Zml4dHVyZQ' };
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
                action_policy_revision: 'b'.repeat(64),
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
  if (id === 'setRuntimeReviewMode')
    return {
      expected_revision: '1',
      expected_review_revision: '0',
      mode: 'automatic',
    };
  if (id === 'walletCallsRpc')
    return {
      jsonrpc: '2.0',
      id: 1,
      method: 'wallet_getCapabilities',
      params: [
        '0x1111111111111111111111111111111111111111',
        [providerNetwork(config?.network).hex],
      ],
    };
  if (
    id === 'provisionAccount' ||
    id === 'signAction' ||
    id === 'revokeAccountAccess' ||
    id === 'executeTransfer' ||
    id === 'reconcileExecution' ||
    id === 'cancelContractCallRequest'
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
const runtimePolicyExample = {
  version: '1',
  enabled: false,
  chain_id: 'eip155:84532',
  contracts: [
    {
      address: '0x1111111111111111111111111111111111111111',
      code_hash: '0x' + '1'.repeat(64),
      methods: [
        { signature: 'customMethod(uint256,address)', maximum_value_wei: '0' },
      ],
    },
  ],
  maximum_calls: 1,
  maximum_native_value_wei: '0',
  max_validity_seconds: 120,
  claim_requirements: [],
};
/** Fictional, schema-checked bodies; never approvals, signatures or live results. */
export function responseExample(
  id: string,
  config?: ProviderConfiguration,
  requestedPermissions?: string[],
): object | string {
  const managedIdentity = {
    id: 'app-10000000-0000-4000-8000-000000000001',
    name: 'Offline application',
    role: 'application',
    enabled: true,
    revision: 1,
    credentialRevision: 1,
    scopes: ['wallet:configuration:read'],
  };
  if (id === 'claimProviderInstallation')
    return {
      ...managedIdentity,
      id: 'operator-offline-admin',
      name: 'Offline administrator',
      role: 'administrator',
      scopes: ['provider:manage'],
    };
  if (id === 'readProviderStatus')
    return {
      installation_id: exampleId,
      claimed: true,
      applications: [],
      management_available: true,
      wallet_operations_enabled: false,
    };
  if (id === 'listProviderIdentities') return [managedIdentity];
  if (
    ['createProviderIdentity', 'rotateProviderIdentityCredential'].includes(id)
  )
    return { ...managedIdentity, client_secret: 'generated-once-placeholder' };
  if (id === 'updateProviderIdentity')
    return { ...managedIdentity, enabled: false, revision: 2 };
  const address = '0x1111111111111111111111111111111111111111';
  const consent_url =
    referenceOrigin(config?.policy.provider.origin ?? '') +
    '/onboarding/' +
    exampleId;
  if (
    [
      'readSafeWalletInfrastructure',
      'provisionSafeWalletInfrastructure',
    ].includes(id)
  )
    return {
      application_id: 'a'.repeat(64),
      chain_id: providerNetwork(config?.network).caip,
      profile: 'safe-only-4337-v1',
      status: 'needs-funding',
      funding_address: '0x' + '1'.repeat(40),
    };
  if (id === 'readApplicationGasFunding')
    return {
      application_id: 'a'.repeat(64),
      chain_id: providerNetwork(config?.network).caip,
      profile: 'safe-only-4337-v1',
      status: 'needs-funding',
      funding_address: '0x' + '1'.repeat(40),
    };
  if (id === 'streamWalletCallsStatus')
    return (
      'event: status\ndata: ' +
      JSON.stringify({
        version: '2.0.0',
        id: 'batch',
        chainId: providerNetwork(config?.network).hex,
        status: 100,
        atomic: true,
      }) +
      '\n\n'
    );
  if (id === 'readWalletExecutionAccount')
    return {
      address: '0x' + '2'.repeat(40),
      chainId: providerNetwork(config?.network).hex,
    };
  if (
    [
      'readApplicationCredentials',
      'readProviderApplicationCredentials',
      'writeApplicationCredential',
    ].includes(id)
  ) {
    const metadata = {
      application_id: 'a'.repeat(64),
      reference: 'verification-primary',
      revision: '1',
      origin: 'https://rpc.example.test',
      status: 'active',
    };
    return id === 'writeApplicationCredential' ? metadata : [metadata];
  }
  if (
    [
      'readApplicationObligations',
      'readProviderApplicationObligations',
    ].includes(id)
  )
    return {
      application_id: 'a'.repeat(64),
      resources: [],
      authorizes_spending: false,
      activates_execution: false,
    };
  if (
    [
      'submitApplicationActions',
      'submitApplicationServices',
      'submitApplicationSponsorship',
      'decideApplicationActions',
      'decideApplicationServices',
      'decideApplicationSponsorship',
    ].includes(id)
  ) {
    const decision = id.startsWith('decide');
    const kind = id
      .slice((decision ? 'decideApplication' : 'submitApplication').length)
      .toLowerCase();
    return {
      application_id: 'a'.repeat(64),
      kind,
      revision: '1',
      value: obligationExample(kind, config?.network),
      submitted_at: '2030-01-01T00:00:00.000Z',
      decision: decision ? 'accepted' : 'pending',
      decision_revision: decision ? '1' : '0',
      ...(decision ? { decided_at: '2030-01-01T00:01:00.000Z' } : {}),
    };
  }
  if (id === 'listApplicationConfigurations')
    return {
      role: 'application',
      applications: [
        {
          application_id: 'a'.repeat(64),
          name: 'Example application',
          active_revision: '0',
          proposals: [],
          proposals_truncated: false,
          publications: [],
        },
      ],
    };
  if (id === 'listWalletBatches') return { truncated: false, batches: [] };
  if (id === 'setRuntimeReviewMode')
    return { mode: 'automatic', revision: '1', approved_by: 'c'.repeat(64) };
  if (
    [
      'readRuntimeConfiguration',
      'readRuntimeConfigurationRevision',
      'readRuntimeApplicationConfiguration',
    ].includes(id)
  )
    return {
      application_id: 'a'.repeat(64),
      active_revision: '0',
      revision: '0',
      authorizes_spending: false,
    };
  if (
    id === 'proposeRuntimeConfiguration' ||
    id === 'readRuntimeConfigurationProposal'
  )
    return {
      proposal_id: exampleId,
      application_id: 'a'.repeat(64),
      based_on_revision: '0',
      policy_hash: 'b'.repeat(64),
      policy: runtimePolicyExample,
      created_at: '2030-01-01T00:00:00.000Z',
    };
  if (id === 'walletCallsRpc')
    return {
      jsonrpc: '2.0',
      id: 1,
      result: {
        [providerNetwork(config?.network).hex]: {
          atomic: { status: 'supported' },
        },
      },
    };
  if (
    id === 'publishRuntimeConfiguration' ||
    id === 'updateRuntimeConfiguration'
  )
    return {
      application_id: 'a'.repeat(64),
      revision: '1',
      previous_revision: '0',
      policy_hash: 'b'.repeat(64),
      policy: runtimePolicyExample,
      published_at: '2030-01-01T00:00:00.000Z',
      published_by: 'c'.repeat(64),
    };
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
  if (
    ['beginEnrollment', 'submitEnrollmentIdentity', 'getEnrollment'].includes(
      id,
    )
  )
    return {
      enrollment_id: exampleId,
      account_id: exampleId,
      status: 'awaiting_identity',
      ...(id === 'beginEnrollment'
        ? {
            nonce: 'a'.repeat(43),
            expires_at: '2030-01-01T00:00:00.000Z',
            identity_issuer: 'https://identity.example.com',
            identity_client_id: 'provider-identity-client',
            required_claims: ['given_name'],
          }
        : {}),
    };
  if (id === 'getExecutionCapabilities')
    return {
      profile: 'safe-only-4337-v1',
      revision: '1',
      configured: !!config?.safeWallet,
    };

  if (id === 'getCapabilities')
    return {
      profile: 'safe-wallet-service',
      status: 'experimental',
      configured: false,
    };
  if (id === 'getAccountAccessPolicy')
    return {
      flow: applicationLed ? 'application' : 'hosted',
      policy_revision: 'a'.repeat(64),

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
  throw new Error('Missing API response example: ' + id);
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
      'All implemented provider API endpoints are shown by default, including unavailable services. Not enabled identifies missing configuration; draft settings do not prove live access. No API requests are sent.\n\n' +
      transactionBoundaryDescription,
  };
  spec.servers = [{ url: referenceOrigin(config.policy.provider.origin) }];
  spec.paths = {};
  for (const item of operations) {
    const op = structuredClone(item.operation);
    op.summary = `[${item.status === 'No access token needed' ? 'Public' : item.status.startsWith('Settings are present') ? 'Configured in draft' : 'Not enabled'}] ${item.guide.title}`;
    op.tags = [item.guide.group];
    op.description = [
      `**Configuration preview:** ${item.status}.`,
      `**Required OAuth scope:** ${item.guide.scope ?? (item.guide.serviceAuthenticated ? 'Service proof required; application OAuth is not accepted' : 'None (public)')}.`,
      item.guide.prerequisite,
      item.guide.success,
      op.description ?? '',
    ].join('\n\n');
    for (const parameter of op.parameters ?? []) {
      if (parameter.in === 'path')
        parameter.example =
          item.guide.management && parameter.name === 'id'
            ? 'app-' + exampleId
            : exampleId;
      if (
        parameter.in === 'header' &&
        parameter.name.toLowerCase() === 'idempotency-key'
      )
        parameter.example = '20000000-0000-4000-8000-000000000001';
    }
    if (op.requestBody?.content['application/json'])
      op.requestBody.content['application/json'].example = item.body;
    const success =
      op.responses[
        Object.keys(op.responses).find((code) => code.startsWith('2'))!
      ];
    if (success) {
      success.description = item.guide.success;
      const body =
        success.content?.['application/json'] ??
        success.content?.['text/event-stream'];
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
    `curl --request ${item.method.toUpperCase()} ${shellQuote(
      referenceOrigin(origin) +
        item.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
          if (item.guide.management && name === 'id') return 'app-' + exampleId;
          if (name === 'revision') return '1';
          if (name === 'applicationId') return 'a'.repeat(64);
          return exampleId;
        }),
    )}`,
  ];
  if (item.guide.scope)
    lines.push(
      item.guide.scope === 'wallet:configuration:write'
        ? "  --header 'Authorization: Bearer <PROVIDER_OPERATOR_ACCESS_TOKEN>'"
        : "  --header 'Authorization: Bearer <APPLICATION_ACCESS_TOKEN>'",
    );
  if (item.body !== undefined)
    lines.push(
      "  --header 'Content-Type: application/json'",
      "  --header 'Idempotency-Key: <NEW_UUIDV4_REUSE_ON_RETRY>'",
      `  --data ${shellQuote(JSON.stringify(item.body, null, 2))}`,
    );
  return lines.join(' \\\n') + '\n';
}
