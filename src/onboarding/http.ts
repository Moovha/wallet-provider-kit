import type { ResolveNetwork } from '../service/network-context.js';
import { selectWalletGrant } from '../service/wallet-grant.js';
import { setAuthenticatedResponseTimeout } from '../service/response-timeout.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import { runtimeSnapshotSchema } from '../runtime-configuration/schemas.js';
import providerConfigurationSchema from '../../spec/provider-config.schema.json' with { type: 'json' };
import { formatUnits } from 'ethers';
import type { SupportedActions } from '../deployment/actions.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticationError, type Authenticate } from '../service/auth.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
import { problemSchema, uuidSchema } from '../service/schemas.js';
import {
  accessType,
  permissions,
  type AccessInput,
  type AccessRequestInput,
  type Vendor,
  type ApplicationIdentityRecord,
} from './types.js';
import { deny, uuid } from './policy.js';
import { WalletProviderError } from '../domain/signing.js';
import type { OwnerLogin } from './login.js';
import type { OnboardingService } from './service.js';

const callTermsSchema = structuredClone(
  providerConfigurationSchema.properties.approvedCalls,
) as {
  properties: {
    policy: { required: string[]; properties: Record<string, unknown> };
  };
};
delete callTermsSchema.properties.policy.properties.accounts;
callTermsSchema.properties.policy.required =
  callTermsSchema.properties.policy.required.filter(
    (field) => field !== 'accounts',
  );

export interface OnboardingHttpOptions {
  network?: ProviderNetwork;
  service: OnboardingService;
  login?: OwnerLogin;
  /** Provider IdP subjects allowed to review; applications cannot grant themselves staff access. */
  reviewers: readonly string[];
  /** Allow the fixed operator-login return target only when integrated API tokens are configured. */
  apiExplorerLogin?: boolean;
  /** Safe wallet calls are configured by the provider service. */
  actions?: SupportedActions;
  /** Fence superseded configured-service instances, including browser authority writers. */
  currentConfiguration?: () => Promise<boolean>;
}
export const walletDescriptionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'name', 'kind'],
  properties: {
    reference: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,63}$' },
    name: { type: 'string', minLength: 1, maxLength: 80 },
    kind: { enum: ['personal', 'shared'] },
  },
};
export const accessReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['request_id', 'status'],
  properties: {
    wallet: walletDescriptionSchema,
    membership_revision: { type: 'integer', minimum: 1 },
    request_id: uuidSchema,
    status: {
      type: 'string',
      enum: [
        'consent_required',
        'verification_required',
        'funding_approval_required',
        'identity_pending',
        'reconciliation_required',
        'provider_review_required',
        'granted',
        'denied',
        'expired',
        'suspended',
        'revoked',
        'policy_changed',
      ],
    },
    consent_url: {
      type: 'string',
      format: 'uri',
      description:
        'Hosted compatibility only. Application-led grants have no provider user redirect.',
    },
    grant_id: uuidSchema,
    account_id: uuidSchema,
    permissions: {
      type: 'array',
      items: { type: 'string', enum: permissions },
    },
    expires_at: { type: 'string', format: 'date-time' },
  },
};
const applicationRecordSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'fields'],
  properties: {
    reference: {
      type: 'string',
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$',
    },
    fields: {
      type: 'object',
      minProperties: 1,
      maxProperties: 64,
      additionalProperties: { type: 'string', minLength: 1, maxLength: 512 },
    },
  },
};
function escape(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
const permissionLabels = {
  'account:read': 'Read your wallet address and account status',
  'operations:request':
    'Request wallet operations, subject to your provider’s approvals',
  'owners:manage':
    'Change on-chain owner addresses and the required signature threshold',
  'members:manage': 'Invite people and change their shared-wallet permissions',
  'contracts:request':
    'Request wallet transactions within the approved contract and transaction limits.',
};
const statusLabels: Record<string, string> = {
  consent_required: 'Your permission is needed.',
  verification_required: 'Identity verification is needed.',
  funding_approval_required:
    'Your provider and application need to agree verification costs.',
  identity_pending: 'Your identity check is being set up.',
  reconciliation_required:
    'Your provider is checking the result of your previous request.',
  provider_review_required: 'Your provider is reviewing your identity.',
  granted: 'Connected. You can return to your application.',
  denied: 'This request was declined.',
  expired: 'This request has expired. Start again from your application.',
  suspended: 'Application access is paused.',
  revoked: 'Application access has been removed.',
  policy_changed:
    'Your provider’s requirements have changed. Start a new request from your application.',
};
const reviewStatusLabels: Record<string, string> = {
  consent_required: 'Waiting for wallet permission',
  verification_required: 'Identity check needed',
  funding_approval_required: 'Verification costs need agreement',
  identity_pending: 'Identity check in progress',
  reconciliation_required: 'Previous request needs checking',
  provider_review_required: 'Ready for your identity review',
  granted: 'Access approved',
  denied: 'Request declined',
  expired: 'Request expired',
  suspended: 'Access paused',
  revoked: 'Access removed',
  policy_changed: 'Access rules changed',
};
function page(title: string, content: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>body{font:17px/1.55 system-ui,sans-serif;color:#173d32;background:#f5f8f5;margin:0}main{max-width:640px;margin:48px auto;padding:28px;background:white;border:1px solid #dce6df;border-radius:16px}h1{font-size:28px;line-height:1.2}h2{font-size:21px}a{color:#126346}button{font:inherit;border:0;border-radius:8px;padding:12px 20px;background:#126346;color:white;cursor:pointer;margin:8px 8px 8px 0}input,select{font:inherit;max-width:100%;padding:8px}label{display:block;margin:12px 0}small{display:block;color:#52645d}article{border-top:1px solid #dce6df;padding:20px 0}code{overflow-wrap:anywhere}footer{margin-top:24px;font-size:14px}@media(max-width:700px){main{margin:16px;padding:20px}}</style>
</head>
<body>
<main>
<h1>${escape(title)}</h1>${content}<footer>
<a href="/onboarding/access">Manage application access</a> · Toolkit by <a href="https://moovha.com" rel="noreferrer">Moovha</a>
</footer>
</main>
</body>
</html>`;
}
function cookie(request: FastifyRequest, name: string) {
  const values = (request.headers.cookie ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(name + '='));
  if (values.length !== 1) return '';
  const value = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}
function setCookie(
  reply: FastifyReply,
  name: string,
  value: string,
  seconds = 300,
) {
  reply.header(
    'set-cookie',
    `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`,
  );
}
const csrfSchema = { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' };

export async function registerOnboardingRoutes(
  app: FastifyInstance,
  options: OnboardingHttpOptions | undefined,
  authenticate: Authenticate | undefined,
  ready: (request?: FastifyRequest) => Promise<boolean>,
  resolveNetwork?: ResolveNetwork,
) {
  const unavailable = () => {
    throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
  };
  const network = providerNetwork(
    options?.network ?? options?.actions?.network.name,
  );
  if (options?.actions && options.actions.network.name !== network.name)
    throw new WalletProviderError('wallet_provider_configuration');
  const selected = (request: FastifyRequest) =>
    resolveNetwork ? resolveNetwork(request).onboarding : options;
  const service = (request: FastifyRequest) =>
    selected(request)?.service ?? unavailable();
  async function context(request: FastifyRequest, scope: string) {
    if (!authenticate || !options || !(await ready(request)))
      return unavailable();
    const principal = selectWalletGrant(
      await authenticate(request.headers.authorization, scope),
      request.headers['wallet-grant-id'],
    );
    setAuthenticatedResponseTimeout(request);
    if (!(await ready(request))) return unavailable();
    return {
      principal,
      idempotencyKey:
        (request.headers['idempotency-key'] as string) ?? request.id,
    };
  }
  function schema(operationId: string, body?: object, params?: object) {
    return {
      operationId,
      security: [{ accessToken: [] }],
      ...(body
        ? {
            body,
            headers: {
              type: 'object',
              required: ['idempotency-key'],
              properties: { 'idempotency-key': uuidSchema },
            },
          }
        : {}),
      ...(params ? { params } : {}),
      response: {
        200: accessReceiptSchema,
        ...Object.fromEntries(
          [400, 401, 403, 409, 413, 415, 422, 429, 500, 503].map((status) => [
            status,
            {
              content: {
                'application/problem+json': { schema: problemSchema },
              },
            },
          ]),
        ),
      },
    };
  }
  const actions = (request: FastifyRequest) =>
    selected(request)?.actions ?? unavailable();
  const requestParams = {
    type: 'object',
    additionalProperties: false,
    required: ['requestId'],
    properties: { requestId: uuidSchema },
  };
  const actionParams = {
    type: 'object',
    additionalProperties: false,
    required: ['actionId'],
    properties: { actionId: uuidSchema },
  };
  app.post<{ Body: AccessRequestInput }>(
    '/v1/access-requests',
    {
      bodyLimit: 32768,
      schema: schema('requestAccountAccess', {
        type: 'object',
        additionalProperties: false,
        required: ['mode', 'authorization_details'],
        properties: {
          mode: {
            type: 'string',
            enum: ['create', 'connect', 'connect_from_application'],
          },
          wallet: walletDescriptionSchema,
          source_account_id: uuidSchema,
          account_id: uuidSchema,
          source_application_id: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
            description:
              'Source application connection ID for connect_from_application, using the same provider issuer. Omit account_id; the provider requires one unique verified identity match.',
          },
          identity_record: applicationRecordSchema,
          user: {
            description:
              'Required in application-led mode. The explicitly trusted application attests its stable user identity and recorded consent; OAuth scopes alone do not establish these facts.',
            type: 'object',
            additionalProperties: false,
            required: ['id', 'consent'],
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 256 },
              identity: {
                type: 'object',
                additionalProperties: false,
                required: ['reference', 'level', 'verified_at', 'fields'],
                properties: {
                  reference: { type: 'string', minLength: 1, maxLength: 256 },
                  level: { type: 'string', minLength: 1, maxLength: 100 },
                  verified_at: { type: 'string', format: 'date-time' },
                  fields: {
                    type: 'object',
                    maxProperties: 16,
                    additionalProperties: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 512,
                    },
                  },
                },
              },
              consent: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'reference',
                  'granted_at',
                  'expires_at',
                  'policy_revision',
                ],
                properties: {
                  reference: { type: 'string', minLength: 1, maxLength: 256 },
                  granted_at: { type: 'string', format: 'date-time' },
                  expires_at: { type: 'string', format: 'date-time' },
                  policy_revision: {
                    type: 'string',
                    pattern: '^[a-f0-9]{64}$',
                  },
                  source_application_id: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 256,
                  },
                  account_id: uuidSchema,
                  wallet_reference: {
                    type: 'string',
                    pattern: '^[a-z][a-z0-9_-]{0,63}$',
                  },
                  membership_revision: { type: 'integer', minimum: 1 },
                  sharing_revision: {
                    type: 'string',
                    pattern: '^[a-f0-9]{64}$',
                  },
                  action_policy_revision: {
                    type: 'string',
                    pattern: '^[a-f0-9]{64}$',
                  },
                },
              },
            },
          },
          authorization_details: {
            type: 'array',
            minItems: 1,
            maxItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'actions'],
              properties: {
                type: { type: 'string', enum: [accessType] },
                actions: {
                  type: 'array',
                  minItems: 1,
                  maxItems: permissions.length,
                  uniqueItems: true,
                  items: { type: 'string', enum: permissions },
                },
              },
            },
          },
        },
      }),
    },
    async (request) =>
      service(request).request(
        await context(request, 'wallet:access'),
        request.body,
      ),
  );
  app.get<{ Querystring: { source_application_id?: string } }>(
    '/v1/access-policy',
    {
      schema: {
        ...schema('getAccountAccessPolicy'),
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            source_application_id: {
              type: 'string',
              minLength: 1,
              maxLength: 256,
            },
          },
        },
        response: {
          ...schema('getAccountAccessPolicy').response,
          200: {
            type: 'object',
            additionalProperties: false,
            required: [
              'source',
              'evaluation_only',
              'required_fields',
              'maximum_field_characters',
              'owner_consent_required',
              'provider_review_required',
            ],
            properties: {
              chain_id: {
                type: 'string',
                enum: [
                  'eip155:8453',
                  'eip155:84532',
                  'eip155:1',
                  'eip155:11155111',
                ],
              },
              source: {
                type: 'string',
                enum: [
                  'application_record',
                  'vendor_verification',
                  'application_attestation',
                ],
              },
              evaluation_only: { type: 'boolean' },
              required_fields: { type: 'array', items: { type: 'string' } },
              maximum_field_characters: { type: 'integer' },
              owner_consent_required: { type: 'boolean', enum: [true] },
              provider_review_required: { type: 'boolean' },
              provider_login_required: { type: 'boolean' },
              flow: { type: 'string', enum: ['application', 'hosted'] },
              policy_revision: { type: 'string' },
              action_policy_revision: { type: 'string' },
              contract_call_terms: callTermsSchema,
              runtime_contract_terms: runtimeSnapshotSchema,
              max_identity_age_days: { type: 'integer' },
              max_access_days: { type: 'integer' },
              wallet_sharing: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'source_application_id',
                  'matching_fields',
                  'revision',
                ],
                properties: {
                  source_application_id: { type: 'string' },
                  matching_fields: { type: 'array', items: { type: 'string' } },
                  revision: { type: 'string' },
                },
              },
              verification_level: { type: 'string' },
            },
          },
        },
      },
    },
    async (request) => {
      const principal = (await context(request, 'wallet:access:read'))
        .principal;
      const terms = await service(request).applicationAccessPolicy(
        principal,
        request.query.source_application_id,
      );
      const snapshot =
        'runtime_contract_terms' in terms
          ? terms.runtime_contract_terms
          : undefined;
      const calls = selected(request)?.actions?.callConsentTerms(snapshot);
      return {
        ...terms,
        chain_id: providerNetwork(selected(request)?.network ?? network.name)
          .caip,
        ...(calls ? { contract_call_terms: calls } : {}),
      };
    },
  );
  const accountParams = {
    type: 'object',
    required: ['accountId'],
    additionalProperties: false,
    properties: { accountId: uuidSchema },
  };
  const memberResult = {
    type: 'object',
    additionalProperties: false,
    required: ['account_id', 'wallet', 'revision', 'members'],
    properties: {
      account_id: uuidSchema,
      wallet: walletDescriptionSchema,
      revision: { type: 'integer' },
      members: {
        type: 'array',
        maxItems: 100,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'member_id',
            'application_id',
            'name',
            'permissions',
            'membership_revision',
            'status',
          ],
          properties: {
            member_id: { type: 'string' },
            application_id: { type: 'string' },
            user_id: { type: 'string' },
            name: { type: 'string' },
            permissions: {
              type: 'array',
              items: { enum: ['account:read', 'contracts:request'] },
            },
            membership_revision: { type: 'integer' },
            status: { enum: ['invited', 'active', 'removed'] },
          },
        },
      },
    },
  };
  app.post<{ Body: { user_id: string } }>(
    '/v1/accounts/query',
    {
      bodyLimit: 1024,
      schema: {
        ...schema('listUserWallets', {
          type: 'object',
          additionalProperties: false,
          required: ['user_id'],
          properties: {
            user_id: { type: 'string', minLength: 1, maxLength: 256 },
          },
        }),
        response: {
          ...schema('listUserWallets').response,
          200: {
            type: 'object',
            required: ['accounts'],
            additionalProperties: false,
            properties: {
              accounts: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'account_id',
                    'is_default',
                    'wallet',
                    'grant_id',
                    'permissions',
                    'expires_at',
                    'role',
                  ],
                  additionalProperties: false,
                  properties: {
                    account_id: uuidSchema,
                    network: {
                      type: 'string',
                      enum: [
                        'base',
                        'base-sepolia',
                        'ethereum',
                        'ethereum-sepolia',
                      ],
                    },
                    chain_id: { type: 'string' },
                    is_default: { type: 'boolean' },
                    wallet: walletDescriptionSchema,
                    grant_id: uuidSchema,
                    permissions: {
                      type: 'array',
                      items: { enum: permissions },
                    },
                    expires_at: { type: 'string' },
                    role: { enum: ['owner', 'member'] },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const result = await service(request).wallets(
        await context(request, 'wallet:account:read'),
        request.body.user_id,
      );
      const current = providerNetwork(
        selected(request)?.network ?? network.name,
      );
      return {
        accounts: result.accounts.map((account) => ({
          ...account,
          network: current.name,
          chain_id: current.caip,
        })),
      };
    },
  );
  app.get<{ Params: { accountId: string } }>(
    '/v1/accounts/:accountId/members',
    {
      schema: {
        ...schema('readWalletMembers', undefined, accountParams),
        response: {
          ...schema('readWalletMembers').response,
          200: memberResult,
        },
      },
    },
    async (request) =>
      service(request).members(
        (await context(request, 'wallet:access')).principal,
        request.params.accountId,
      ),
  );
  app.post<{
    Params: { accountId: string };
    Body: Parameters<OnboardingService['saveMember']>[2];
  }>(
    '/v1/accounts/:accountId/members',
    {
      bodyLimit: 4096,
      schema: {
        ...schema(
          'saveWalletMember',
          {
            type: 'object',
            additionalProperties: false,
            required: ['expected_revision', 'enabled', 'permissions'],
            properties: {
              expected_revision: { type: 'integer', minimum: 0 },
              user_id: { type: 'string', minLength: 1, maxLength: 256 },
              member_id: { type: 'string', pattern: '^[a-f0-9]{64}$' },
              name: { type: 'string', minLength: 1, maxLength: 80 },
              enabled: { type: 'boolean' },
              permissions: {
                type: 'array',
                minItems: 1,
                maxItems: 2,
                uniqueItems: true,
                items: { enum: ['account:read', 'contracts:request'] },
              },
            },
          },
          accountParams,
        ),
        response: { ...schema('saveWalletMember').response, 200: memberResult },
      },
    },
    async (request) =>
      service(request).saveMember(
        await context(request, 'wallet:access'),
        request.params.accountId,
        request.body,
      ),
  );
  app.post<{ Params: { grantId: string }; Body: Record<string, never> }>(
    '/v1/access-grants/:grantId/revoke',
    {
      schema: {
        ...schema(
          'revokeAccountAccess',
          { type: 'object', additionalProperties: false },
          {
            type: 'object',
            required: ['grantId'],
            properties: { grantId: uuidSchema },
          },
        ),
        response: {
          200: {
            type: 'object',
            required: ['grant_id', 'status'],
            properties: {
              grant_id: uuidSchema,
              status: { type: 'string', enum: ['revoked'] },
            },
          },
          ...Object.fromEntries(
            [400, 401, 403, 409, 422, 429, 503].map((code) => [
              code,
              problemSchema,
            ]),
          ),
        },
      },
    },
    async (request) =>
      service(request).revokeApplicationGrant(
        await context(request, 'wallet:access'),
        request.params.grantId,
      ),
  );
  app.post<{ Body: { records: ApplicationIdentityRecord[] } }>(
    '/v1/access-records',
    {
      bodyLimit: 524288,
      schema: {
        ...schema('submitAccountAccessRecords', {
          type: 'object',
          additionalProperties: false,
          required: ['records'],
          properties: {
            records: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: applicationRecordSchema,
            },
          },
        }),
        response: {
          ...schema('submitAccountAccessRecords').response,
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['results'],
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['index', 'status'],
                  properties: {
                    index: { type: 'integer', minimum: 0 },
                    status: { type: 'string', enum: ['submitted', 'invalid'] },
                    required_fields: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    receipt: accessReceiptSchema,
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request) =>
      service(request).submitRecords(
        await context(request, 'wallet:access'),
        request.body.records,
      ),
  );
  app.get<{ Params: { requestId: string } }>(
    '/v1/access-requests/:requestId',
    { schema: schema('getAccountAccessRequest', undefined, requestParams) },
    async (request) =>
      service(request).read(
        await context(request, 'wallet:access:read'),
        request.params.requestId,
      ),
  );
  app.post<{
    Params: { requestId: string };
    Body: { vendor: Vendor; share_token: string };
  }>(
    '/v1/access-requests/:requestId/identity',
    {
      bodyLimit: 18000,
      schema: schema(
        'importAccessIdentity',
        {
          type: 'object',
          additionalProperties: false,
          required: ['vendor', 'share_token'],
          properties: {
            vendor: { type: 'string', enum: ['didit', 'sumsub'] },
            share_token: { type: 'string', minLength: 1, maxLength: 16384 },
          },
        },
        requestParams,
      ),
    },
    async (request) =>
      service(request).importIdentity(
        await context(request, 'wallet:access'),
        request.params.requestId,
        request.body.vendor,
        request.body.share_token,
      ),
  );
  app.get<{ Params: { accountId: string } }>(
    '/v1/accounts/:accountId',
    {
      schema: {
        operationId: 'readGrantedAccount',
        security: [{ accessToken: [] }],
        params: {
          type: 'object',
          required: ['accountId'],
          additionalProperties: false,
          properties: {
            accountId: uuidSchema,
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['account_id', 'status'],
            properties: {
              wallet: walletDescriptionSchema,
              account_id: uuidSchema,
              identity_source: {
                type: 'string',
                enum: ['application_record', 'application_attestation'],
              },
              evaluation_only: { type: 'boolean' },
              status: { type: 'string', enum: ['accepted', 'provisioned'] },
              address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
            },
          },
          ...Object.fromEntries(
            [400, 401, 403, 422, 429, 500, 503].map((status) => [
              status,
              {
                content: {
                  'application/problem+json': { schema: problemSchema },
                },
              },
            ]),
          ),
        },
      },
    },
    async (request) =>
      service(request).account(
        (await context(request, 'wallet:account:read')).principal,
        request.params.accountId,
      ),
  );

  await app.register(async (ui) => {
    ui.setErrorHandler((error, _request, reply) => {
      const code = error instanceof WalletProviderError ? error.code : '';
      const status =
        error instanceof AuthenticationError
          ? error.status
          : code === 'wallet_authorization_denied'
            ? 403
            : code === 'wallet_attempt_conflict'
              ? 409
              : typeof error === 'object' &&
                  error &&
                  'statusCode' in error &&
                  typeof error.statusCode === 'number' &&
                  [400, 413, 415, 429].includes(error.statusCode)
                ? error.statusCode
                : code === 'wallet_provider_input'
                  ? 422
                  : 503;
      const message =
        status === 401
          ? 'Your confirmation session has expired. Open your request again to sign in.'
          : status === 403
            ? 'We couldn’t approve this request. Check that you signed in with the right wallet-service account. Your service team can help check whether the required identity checks are complete.'
            : status === 409
              ? 'This request is already being handled or has changed. Ask your provider to check the original request.'
              : status === 503
                ? 'We couldn’t confirm what happened. Please ask your service team to check the original request before starting another identity check or creating another wallet.'
                : 'Check the form values and try again.';
      reply
        .code(status)
        .type('text/html; charset=utf-8')
        .send(
          page(
            'Your request needs attention',
            `<p>${escape(message)}</p>
<p>
<a href="/onboarding/access">Open your application access</a>
</p>`,
          ),
        );
    });
    ui.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => {
        const fields = new URLSearchParams(body as string);
        if ([...fields.keys()].some((k) => fields.getAll(k).length !== 1))
          return done(
            Object.assign(new Error('Duplicate form fields'), {
              statusCode: 400,
            }),
          );
        done(null, Object.fromEntries(fields));
      },
    );
    ui.addHook('onRequest', async (_request, reply) => {
      if (!options) return unavailable();
      if (
        !options?.login ||
        (options.service.policy.access.mode === 'application' &&
          _request.url.split('?')[0] !== '/onboarding/callback')
      ) {
        return reply
          .code(404)
          .send({ message: 'Use the application to manage wallet access.' });
      }
      if (
        options?.currentConfiguration &&
        !(await options.currentConfiguration())
      )
        return unavailable();
      reply.header(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      );
      // no-referrer makes browser form POSTs send Origin: null, breaking the
      // exact-origin CSRF check. Keep referrers private on cross-origin requests.
      reply.header('referrer-policy', 'same-origin');
    });
    async function session(
      request: FastifyRequest,
      reply: FastifyReply,
      target: string,
    ) {
      if (!options) return unavailable();
      try {
        return await options.login!.session(
          cookie(request, '__Host-wpk-session'),
        );
      } catch (error) {
        if (!(error instanceof AuthenticationError)) throw error;
        const browser =
          cookie(request, '__Host-wpk-browser') ||
          randomBytes(32).toString('base64url');
        const url = await options.login!.start(target, browser);
        setCookie(reply, '__Host-wpk-browser', browser);
        reply.redirect(url);
        return null;
      }
    }
    async function formSession(request: FastifyRequest, csrf: string) {
      if (!options) return unavailable();
      if (
        request.headers.origin !== service(request).policy.provider.origin ||
        request.headers['sec-fetch-site'] === 'cross-site'
      )
        deny();
      const current = await options.login!.session(
        cookie(request, '__Host-wpk-session'),
      );
      if (
        csrf.length !== current.csrf.length ||
        !timingSafeEqual(Buffer.from(csrf), Buffer.from(current.csrf))
      )
        deny();
      return current;
    }
    function staff(identity: { issuer: string; subject: string }) {
      if (!options?.reviewers.includes(identity.subject)) deny();
      return {
        issuer: identity.issuer,
        subject: identity.subject,
        clientId: 'provider-review',
        scopes: ['wallet:review'],
      };
    }
    const html = (reply: FastifyReply, title: string, body: string) =>
      reply.type('text/html; charset=utf-8').send(page(title, body));
    ui.get(
      '/onboarding/callback',
      { schema: { hide: true } },
      async (request, reply) => {
        if (!options) return unavailable();
        const url = new URL(
          request.raw.url!,
          service(request).policy.provider.origin,
        );
        const result = await options.login!.finish(
          url,
          cookie(request, '__Host-wpk-browser'),
        );
        if (result.requestId === 'api-explorer' && options.apiExplorerLogin) {
          setCookie(reply, '__Host-wpk-session', result.sessionToken);
          return reply.redirect('/docs/');
        }
        if (
          !uuid.test(result.requestId) &&
          !['access', 'review'].includes(result.requestId)
        )
          deny();
        setCookie(reply, '__Host-wpk-session', result.sessionToken);
        return reply.redirect('/onboarding/' + result.requestId);
      },
    );
    ui.get(
      '/onboarding/access',
      { schema: { hide: true } },
      async (request, reply) => {
        const current = await session(request, reply, 'access');
        if (!current) return;
        const grants = await service(request).ownerGrants(current.identity);
        const pending = await service(request).ownerRequests(current.identity);
        return html(
          reply,
          'Your application access',
          `<p>You’re in control of which applications can use your wallet. Remove access whenever you need to stop future requests. This cannot undo transactions that have already happened.</p>${
            grants.length
              ? grants
                  .map(
                    (g) => `<article>
<h2>${escape(g.application)}</h2>
<p>${escape(g.permissions.map((p) => permissionLabels[p]).join('; '))} · ${escape(g.state === 'active' ? 'Access allowed' : g.state === 'suspended' ? 'Access paused' : 'Access removed')}<br>Expires ${escape(new Date(g.expiresAt).toISOString())}</p>
<form method="post" action="/onboarding/access/${escape(g.id)}">
<input type="hidden" name="csrf" value="${escape(current.csrf)}">
<button name="decision" value="suspended">Pause access</button>
<button name="decision" value="revoked">Remove access</button>
</form>
</article>`,
                  )
                  .join('')
              : '<p>No applications have access yet.</p>'
          }<h2>Requests waiting for a decision</h2><p>You can cancel a request before access is granted. Checks already started may still finish and incur the agreed cost.</p>${pending.length ? pending.map((r) => `<article><h2>${escape(r.application)}</h2><p>${escape(statusLabels[r.status] ?? 'Your provider will help with the next step.')}</p><form method="post" action="/onboarding/requests/${r.id}/cancel"><input type="hidden" name="csrf" value="${escape(current.csrf)}"><button>Cancel request</button></form></article>`).join('') : '<p>No requests are waiting.</p>'}`,
        );
      },
    );
    ui.post<{ Params: { requestId: string }; Body: { csrf: string } }>(
      '/onboarding/requests/:requestId/cancel',
      {
        schema: {
          hide: true,
          params: requestParams,
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['csrf'],
            properties: { csrf: csrfSchema },
          },
        },
      },
      async (request, reply) => {
        const current = await formSession(request, request.body.csrf);
        await service(request).cancelPending(
          request.params.requestId,
          current.identity,
        );
        return reply.redirect('/onboarding/access');
      },
    );
    ui.post<{
      Params: { grantId: string };
      Body: { csrf: string; decision: 'suspended' | 'revoked' };
    }>(
      '/onboarding/access/:grantId',
      {
        schema: {
          hide: true,
          params: {
            type: 'object',
            required: ['grantId'],
            properties: { grantId: uuidSchema },
          },
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['csrf', 'decision'],
            properties: {
              csrf: csrfSchema,
              decision: { type: 'string', enum: ['suspended', 'revoked'] },
            },
          },
        },
      },
      async (request, reply) => {
        const current = await formSession(request, request.body.csrf);
        await service(request).changeGrant(
          request.params.grantId,
          request.body.decision,
          current.identity,
        );
        return reply.redirect('/onboarding/access');
      },
    );
    ui.get(
      '/onboarding/review',
      { schema: { hide: true } },
      async (request, reply) => {
        const current = await session(request, reply, 'review');
        if (!current) return;
        const pending = await service(request).reviews(staff(current.identity));
        const accounts = await service(request).providerAccounts(
          staff(current.identity),
        );
        return html(
          reply,
          'Help people connect their wallets',
          `<p>${service(request).policy.identity.records ? 'Check that the information shared by the application belongs to this person. Accept it only for a test without funds; filled-in fields are not independently verified identity checks.' : 'Open your identity-checking service’s dashboard and confirm that its results belong to the person below. An import code or application sign-in alone does not prove this match.'}</p>${
            pending.length
              ? pending
                  .map(
                    (r) => `<article>
<p>Wallet-service account: <code>${escape(r.owner?.subject)}</code>
<br>Sign-in service: ${escape(r.owner?.issuer)}${r.applicationRecord ? '' : `<br>Evidence: ${escape(r.vendor ?? 'not supplied')} <code>${escape(r.reference ?? '')}</code>`}
<br>Status: ${escape(reviewStatusLabels[r.status] ?? 'Ready for your review')}</p>
<form method="post" action="/onboarding/review/${r.requestId}">
<input type="hidden" name="csrf" value="${escape(current.csrf)}">
${
  r.applicationRecord
    ? `<p>Submitted by ${escape(r.application)} · application record <code>${escape(r.applicationRecord.reference)}</code></p>
<dl>${Object.entries(r.applicationRecord.fields)
        .map(
          ([field, value]) =>
            `<dt>${escape(field)}</dt><dd>${escape(value)}</dd>`,
        )
        .join('')}</dl>
<label><input type="checkbox" name="identity_matches_owner" value="yes"> I checked that this information belongs to this person and accept it only for a test without funds.</label>
<button name="decision" value="accept">Accept submitted record</button>`
    : `<label>Vendor <select name="vendor">
<option value="didit"${r.vendor === 'didit' ? ' selected' : ''}>Didit</option>
<option value="sumsub"${r.vendor === 'sumsub' ? ' selected' : ''}>Sumsub</option>
</select>
</label>
<label>Identity-check reference (keep this to follow up on the original check)<input name="reference" value="${escape(r.reference ?? '')}" maxlength="256">
</label>
<label>When the identity check was completed (UTC)<input name="verified_at" value="${escape(r.verifiedAt ?? '')}" placeholder="2026-10-15T12:00:00Z" maxlength="40">
</label>
<label>
<input type="checkbox" name="identity_matches_owner" value="yes"> I checked that this verified identity belongs to this provider user and meets our policy.</label>
<button name="decision" value="accept">Accept verified user</button>`
}
<button name="decision" value="reject">Decline request</button>
</form>
</article>`,
                  )
                  .join('')
              : '<p>No requests need review.</p>'
          }<h2>Wallet accounts</h2>${accounts
            .map(
              (a) => `<article>
<code>${escape(a.id)}</code>
<p>${escape(a.status === 'active' ? 'Account active' : 'Account paused')} · ${a.provisioned ? 'Wallet created' : 'Wallet not confirmed'}</p>
<form method="post" action="/onboarding/accounts/${a.id}">
<input type="hidden" name="csrf" value="${escape(current.csrf)}">
<button name="decision" value="reconcile">Check wallet creation</button>
<button name="decision" value="suspend">Pause account and remove access</button>
</form>
</article>`,
            )
            .join('')}`,
        );
      },
    );
    ui.post<{
      Params: { accountId: string };
      Body: { csrf: string; decision: 'reconcile' | 'suspend' };
    }>(
      '/onboarding/accounts/:accountId',
      {
        schema: {
          hide: true,
          params: {
            type: 'object',
            required: ['accountId'],
            properties: { accountId: uuidSchema },
          },
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['csrf', 'decision'],
            properties: {
              csrf: csrfSchema,
              decision: { type: 'string', enum: ['reconcile', 'suspend'] },
            },
          },
        },
      },
      async (request, reply) => {
        const current = await formSession(request, request.body.csrf);
        const principal = staff(current.identity);
        if (request.body.decision === 'suspend') {
          await service(request).suspendAccount(
            principal,
            request.params.accountId,
          );
          return reply.redirect('/onboarding/review');
        }
        const result = await service(request).reconcileAccount(
          principal,
          request.params.accountId,
        );
        return html(
          reply,
          'Wallet creation check',
          `<p>${result.status === 'reconciled' ? 'The original wallet was found and its receipt has been restored.' : 'No wallet was found. This does not authorize another creation attempt. Check the original backend attempt before proceeding.'}</p>
<a href="/onboarding/review">Back to provider review</a>`,
        );
      },
    );
    ui.post<{
      Params: { requestId: string };
      Body: {
        csrf: string;
        vendor?: Vendor;
        reference?: string;
        verified_at?: string;
        identity_matches_owner?: string;
        decision: 'accept' | 'reject';
      };
    }>(
      '/onboarding/review/:requestId',
      {
        schema: {
          hide: true,
          params: requestParams,
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['csrf', 'decision'],
            properties: {
              csrf: csrfSchema,
              vendor: { type: 'string', enum: ['didit', 'sumsub'] },
              reference: { type: 'string', maxLength: 256 },
              verified_at: { type: 'string', maxLength: 40 },
              identity_matches_owner: { type: 'string', enum: ['yes'] },
              decision: { type: 'string', enum: ['accept', 'reject'] },
            },
          },
        },
      },
      async (request, reply) => {
        const current = await formSession(request, request.body.csrf);
        await service(request).review(
          staff(current.identity),
          request.params.requestId,
          {
            decision: request.body.decision,
            identity_matches_owner:
              request.body.identity_matches_owner === 'yes',
            ...(request.body.reference
              ? { reference: request.body.reference }
              : {}),
            ...(request.body.verified_at
              ? { verified_at: request.body.verified_at }
              : {}),
            ...(request.body.vendor ? { vendor: request.body.vendor } : {}),
          },
        );
        return reply.redirect('/onboarding/review');
      },
    );
    ui.get<{ Params: { requestId: string } }>(
      '/onboarding/:requestId',
      { schema: { hide: true, params: requestParams } },
      async (request, reply) => {
        const current = await session(request, reply, request.params.requestId);
        if (!current) return;
        const view = await service(request).consentView(
          request.params.requestId,
          current.identity,
        );
        return html(
          reply,
          `Connect ${view.application}`,
          `<p>${escape(view.application)} wants to ${view.mode === 'create' ? 'set up a wallet with' : 'connect your existing wallet at'} ${escape(view.provider)}.</p>
<ul>${view.permissions.map((p) => `<li>${escape(permissionLabels[p])}</li>`).join('')}</ul>
${
  view.permissions.includes('contracts:request')
    ? `<p>You allow this application to request approved transactions on ${escape(actions(request).network.label)}, within the limits below. Withdrawing access stops new requests through this service. It cannot undo a transaction or recall an authorization already issued.</p><details><summary>Review the exact transaction limits</summary><p>The technical rules below identify allowed contracts, recipients and operation limits. Safe signatures have no native expiry; revocation stops new service dispatch but cannot recall an already submitted authorization.</p><code>${escape(JSON.stringify(actions(request).callConsentTerms()))}</code></details>`
    : ''
}
<p>Access lasts up to ${view.durationDays} days. You can pause or remove it at any time. Your wallet service still checks each financial request before allowing it.</p>
<p>${view.identitySource === 'application_record' ? 'Your application shared information for your service team to review. This is a test without funds. The information has not been independently verified as an identity check.' : 'Your wallet service may receive information from your identity checks to review your account. The application pays the agreed cost of those checks.'} <a href="${escape(view.privacyUrl)}">Read how your information is used</a>.</p>
<p><strong>${escape(view.verificationUrl ? 'Your identity verification session is ready.' : view.identitySource === 'application_record' && view.status === 'provider_review_required' ? 'Your provider is reviewing your submitted record.' : (statusLabels[view.status] ?? 'Your provider will help with the next step.'))}</strong>
</p>${
            view.status === 'consent_required'
              ? `<form method="post">
<input type="hidden" name="csrf" value="${escape(current.csrf)}">
<button name="decision" value="approve">Allow requested access</button>
<button name="decision" value="deny">Decline</button>
</form>`
              : view.verificationUrl
                ? `<p><a href="${escape(view.verificationUrl)}" rel="noreferrer">Continue to identity verification</a></p>`
                : view.status === 'verification_required'
                  ? `<p>Your application can share an identity check you have already completed. If you need a new check, choose a service below. It starts only when the cost has been agreed and covered.</p>
<form method="post" action="/onboarding/${request.params.requestId}/verify">
<input type="hidden" name="csrf" value="${escape(current.csrf)}">
<select name="vendor">${service(request)
                      .verificationVendors()
                      .map((v) => `<option>${v}</option>`)
                      .join('')}</select>
<button>Continue verification</button>
</form>`
                  : '<p>You can return to your application. Your provider will complete any remaining review.</p>'
          }`,
        );
      },
    );
    ui.post<{
      Params: { requestId: string };
      Body: { csrf: string; decision: 'approve' | 'deny' };
    }>(
      '/onboarding/:requestId',
      {
        schema: {
          hide: true,
          params: requestParams,
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['csrf', 'decision'],
            properties: {
              csrf: csrfSchema,
              decision: { type: 'string', enum: ['approve', 'deny'] },
            },
          },
        },
      },
      async (request, reply) => {
        const current = await formSession(request, request.body.csrf);
        await service(request).consent(
          request.params.requestId,
          current.identity,
          request.body.decision === 'approve',
        );
        return reply.redirect('/onboarding/' + request.params.requestId);
      },
    );
    ui.post<{
      Params: { requestId: string };
      Body: { csrf: string; vendor: Vendor };
    }>(
      '/onboarding/:requestId/verify',
      {
        schema: {
          hide: true,
          params: requestParams,
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['csrf', 'vendor'],
            properties: {
              csrf: csrfSchema,
              vendor: { type: 'string', enum: ['didit', 'sumsub'] },
            },
          },
        },
      },
      async (request, reply) => {
        const current = await formSession(request, request.body.csrf);
        if (!(await ready(request))) return unavailable();
        const result = await service(request).startVerification(
          request.params.requestId,
          current.identity,
          request.body.vendor,
        );
        if (result.url)
          return html(
            reply,
            'Continue identity verification',
            `<p>Your identity verification session is ready. Continue at the verification provider, then return to your application while your provider reviews the result.</p>
<p><a href="${escape(result.url)}" rel="noreferrer">Continue to identity verification</a></p>
<a href="/onboarding/${request.params.requestId}">Back to your request</a>`,
          );
        return html(
          reply,
          'Verification needs attention',
          `<p>${escape(statusLabels[result.status] ?? 'Your provider will help with the next step.')} Verification will continue once this is resolved.</p>
<a href="/onboarding/${request.params.requestId}">Back to your request</a>`,
        );
      },
    );
  });
}
