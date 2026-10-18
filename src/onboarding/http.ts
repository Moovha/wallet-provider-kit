import type { SafeExecutionQueue } from '../execution/queue.js';
import {
  approvedCallInputSchema,
  approvedCallIntentSchema,
  safePayloadSchema,
} from '../execution/call-schemas.js';
import type {
  ApprovedCallInput,
  SafeAccountBinding,
} from '../execution/approved-calls.js';
import {
  canonicalServiceBody,
  canonicalServiceJson,
  type ServiceIdentity,
} from '../executor/auth.js';
import {
  authoritySchema,
  authorityReceiptSchema,
} from '../executor/schemas.js';
import type { ExecutionAuthorityRequest } from '../executor/protocol.js';
import providerConfigurationSchema from '../../spec/provider-config.schema.json' with { type: 'json' };
import type { TransferExecutionCoordinator } from '../execution/coordinator.js';
import {
  executionHeaders,
  executionReceiptSchema,
  executionCapabilitiesSchema,
  executionEventsSchema,
} from '../execution/schemas.js';
import { formatUnits } from 'ethers';
import type {
  SupportedActions,
  TransferInput,
  TransactionEventInput,
} from '../deployment/actions.js';
import {
  transferReceiptSchema,
  transactionEventInputSchema,
  transactionEventReceiptSchema,
  transactionEventsSchema,
} from '../deployment/schemas.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticationError, type Authenticate } from '../service/auth.js';
import { problemSchema, uuidSchema } from '../service/schemas.js';
import {
  accessType,
  permissions,
  type AccessInput,
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
  service: OnboardingService;
  login?: OwnerLogin;
  /** Provider IdP subjects allowed to review; applications cannot grant themselves staff access. */
  reviewers: readonly string[];
  /** Allow the fixed operator-login return target only when integrated API tokens are configured. */
  apiExplorerLogin?: boolean;
  /** Configuration-first provider-authorized transfers; absent in the onboarding-only profile. */
  actions?: SupportedActions;
  execution?: TransferExecutionCoordinator;
  safeQueue?: SafeExecutionQueue;
  executionIdentity?: ServiceIdentity;
  contractNonce?: (
    binding: SafeAccountBinding,
    owner: string,
  ) => Promise<string>;
  /** Fence superseded configured-service instances, including browser authority writers. */
  currentConfiguration?: () => Promise<boolean>;
}
export const accessReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['request_id', 'status'],
  properties: {
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
  'contracts:request':
    'Request approved contract calls under the configured target, function and operation limits.',
  'transfers:request':
    'Request transfers on your behalf under the provider’s limits, without asking you to approve each transfer again',
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
  revoked: 'Application access has been revoked.',
  policy_changed:
    'Your provider’s requirements have changed. Start a new request from your application.',
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
  ready: () => Promise<boolean>,
) {
  const unavailable = () => {
    throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
  };
  const service = () => options?.service ?? unavailable();
  async function context(request: FastifyRequest, scope: string) {
    if (!authenticate || !options || !(await ready())) return unavailable();
    const principal = await authenticate(request.headers.authorization, scope);
    if (!(await ready())) return unavailable();
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
  const actions = () => options?.actions ?? unavailable();
  const actionParams = {
    type: 'object',
    additionalProperties: false,
    required: ['actionId'],
    properties: { actionId: uuidSchema },
  };
  const transferBody = {
    type: 'object',
    additionalProperties: false,
    required: ['account_id', 'recipient', 'amount'],
    properties: {
      account_id: uuidSchema,
      recipient: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      amount: { type: 'string', pattern: '^[1-9][0-9]{0,77}$' },
    },
  };
  const transferSchema = (
    operationId: string,
    body?: object,
    params?: object,
  ) => {
    const base = schema(operationId, body, params);
    return {
      ...base,
      description:
        'Fixed Base Sepolia ERC-3009 transfer authorization. Explicit transfer delegation, current owner-bound access, identity and provider policy authorization are required. No per-transfer owner prompt. No broadcast or settlement.',
      response: { ...base.response, 200: transferReceiptSchema },
    };
  };
  app.post<{ Body: TransferInput }>(
    '/v1/transfer-authorizations',
    { schema: transferSchema('requestTransferAuthorization', transferBody) },
    async (request) =>
      actions().request(await context(request, 'wallet:actions'), request.body),
  );
  app.get<{ Params: { actionId: string } }>(
    '/v1/transfer-authorizations/:actionId',
    {
      schema: transferSchema(
        'getTransferAuthorization',
        undefined,
        actionParams,
      ),
    },
    async (request) =>
      actions().read(
        (await context(request, 'wallet:actions:read')).principal,
        request.params.actionId,
      ),
  );
  const queueReceiptSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'request_id',
      'account_id',
      'status',
      'expires_at',
      'next_poll_after_ms',
    ],
    properties: {
      request_id: uuidSchema,
      account_id: uuidSchema,
      action_id: uuidSchema,
      status: {
        type: 'string',
        enum: [
          'queued',
          'executing',
          'succeeded',
          'cancelled',
          'expired',
          'blocked',
        ],
      },
      expires_at: { type: 'string', format: 'date-time' },
      next_poll_after_ms: { type: 'integer', minimum: 5000, maximum: 300000 },
    },
  };
  app.post<{ Body: ApprovedCallInput }>(
    '/v1/contract-call-requests',
    {
      schema: {
        ...schema('enqueueContractCall', approvedCallInputSchema),
        response: { 202: queueReceiptSchema },
      },
    },
    async (request, reply) => {
      const queue = options?.safeQueue ?? unavailable();
      const result = await queue.enqueue(
        await context(request, 'wallet:actions'),
        request.body,
      );
      return reply.code(202).send(result);
    },
  );
  app.get<{ Params: { requestId: string } }>(
    '/v1/contract-call-requests/:requestId',
    {
      schema: {
        ...schema('readContractCallRequest'),
        params: {
          type: 'object',
          required: ['requestId'],
          properties: { requestId: uuidSchema },
        },
        response: { 200: queueReceiptSchema },
      },
    },
    async (request) =>
      (options?.safeQueue ?? unavailable()).read(
        (await context(request, 'wallet:execute:read')).principal,
        request.params.requestId,
      ),
  );
  app.post<{ Params: { requestId: string } }>(
    '/v1/contract-call-requests/:requestId/cancel',
    {
      schema: {
        ...schema('cancelContractCallRequest', {
          type: 'object',
          additionalProperties: false,
        }),
        params: {
          type: 'object',
          required: ['requestId'],
          properties: { requestId: uuidSchema },
        },
        response: { 200: queueReceiptSchema },
      },
    },
    async (request) =>
      (options?.safeQueue ?? unavailable()).cancel(
        await context(request, 'wallet:execute'),
        request.params.requestId,
      ),
  );
  app.post<{ Body: ApprovedCallInput }>(
    '/v1/actions/contract-calls',
    {
      schema: {
        ...schema('requestContractCall', approvedCallInputSchema),
        description:
          'Request an immutable approved contract call, Uniswap V3 exact-input swap or bounded ERC-4626 router deposit. Requires separately consented contracts:request delegation, current owner/grant/KYC/consent and configured target policies. The service constructs the Safe transaction and reserves its nonce; callers never supply signatures or a signing payload.',
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: [
              'action_id',
              'account_id',
              'status',
              'expires_at',
              'payload_hash',
              'payload',
              'intent',
            ],
            properties: {
              action_id: uuidSchema,
              account_id: uuidSchema,
              status: { type: 'string' },
              expires_at: { type: 'string', format: 'date-time' },
              payload_hash: { type: 'string' },
              payload: safePayloadSchema,
              intent: approvedCallIntentSchema,
            },
          },
        },
      },
    },
    async (request) => {
      if (!options?.contractNonce) return unavailable();
      return actions().requestCalls(
        await context(request, 'wallet:actions'),
        request.body,
        options.contractNonce,
      );
    },
  );
  const execution = (request?: FastifyRequest) => {
    const coordinator = options?.execution ?? unavailable();
    if (request && request.headers['execution-profile'] !== coordinator.profile)
      throw new WalletProviderError('wallet_provider_input');
    return coordinator;
  };
  app.post<{ Body: ExecutionAuthorityRequest }>(
    '/v1/internal/execution-authority',
    {
      preParsing: canonicalServiceBody,
      onSend: async (_request, _reply, payload) =>
        typeof payload === 'string'
          ? canonicalServiceJson(JSON.parse(payload))
          : payload,
      schema: {
        operationId: 'checkExecutionAuthority',
        security: [{ serviceProof: [] }],
        description:
          'Read-only callback for the configured designated executor. Requires a pinned signed service request, exact stored plan/attempt and an unexpired handoff lease. Rechecks current owner, grant, KYC, consent, immutable approval and active revision. Application OAuth tokens do not authenticate this endpoint.',
        body: authoritySchema,
        response: { 200: authorityReceiptSchema },
      },
    },
    async (request, reply) => {
      if (!options?.executionIdentity || !(await ready())) return unavailable();
      if (request.url !== '/v1/internal/execution-authority')
        throw new AuthenticationError(401);
      const proof = await options.executionIdentity.verify(
        request.headers.authorization,
        'authority',
        'POST',
        '/v1/internal/execution-authority',
        request.body,
      );
      const value = await execution().authorizeRemote(request.body);
      const signed = await options.executionIdentity.sign(
        proof.origin,
        'authority',
        'POST',
        '/v1/internal/execution-authority',
        value,
        { requestId: proof.requestId, status: 200 },
      );
      reply.header('execution-service-proof', signed.proof);
      return value;
    },
  );
  app.get(
    '/v1/execution-capabilities',
    {
      schema: {
        operationId: 'getExecutionCapabilities',
        description:
          'Public versioned execution discovery. Profile implementation, configuration and service readiness do not establish live-provider certification or production custody acceptance. Clients must select an exact supported ID/revision and ignore unknown profiles.',
        response: { 200: executionCapabilitiesSchema },
      },
    },
    async () => {
      const readyValue = await ready();
      return {
        contract_version: '1',
        profiles: [
          'erc3009-relayer-v1',
          'erc3009-executor-v1',
          'approved-evm-executor-v1',
        ].map((profile) => ({
          id: profile,
          revision: '1',
          implemented: true,
          configured: options?.execution?.profile === profile,
          ready: options?.execution?.profile === profile && readyValue,
          chain_id: 'eip155:84532',
          account_type:
            profile === 'approved-evm-executor-v1'
              ? 'eoa-or-safe-1.4.1'
              : 'eoa',
          signing: 'eip-712',
          token_authorization:
            profile === 'approved-evm-executor-v1'
              ? 'erc-3009-or-approved-contract-calls'
              : 'erc-3009',
          submission:
            profile === 'erc3009-relayer-v1'
              ? 'openzeppelin-relayer-1.8.0'
              : 'designated-execution-service-v1',
          verification: 'rpc-quorum',
          finality: 'finalized',
          minimum_rpc_sources: 2,
          execute_scopes: ['wallet:execute', 'wallet:sign'],
          read_scopes: ['wallet:execute:read'],
        })),
      };
    },
  );
  app.post<{ Params: { actionId: string } }>(
    '/v1/actions/:actionId/reconcile',
    {
      schema: {
        ...schema(
          'reconcileExecution',
          { type: 'object', additionalProperties: false },
          actionParams,
        ),
        headers: {
          ...executionHeaders,
          required: [...executionHeaders.required, 'idempotency-key'],
          properties: {
            ...executionHeaders.properties,
            'idempotency-key': uuidSchema,
          },
        },
        response: { 200: executionReceiptSchema },
      },
    },
    async (request) =>
      execution(request).reconcile(
        await context(request, 'wallet:execute:read'),
        request.params.actionId,
      ),
  );
  const executionDescription =
    'Optional immutable approved-action execution with exact version selection, current owner/grant/identity/consent/approval checks, durable signing and submission authority, application gas sponsorship and independent RPC receipt/finality verification. Unknown provider submission outcomes never permit redispatch. Contract calls require the approved-evm-executor-v1 profile and a stored policy-approved action; execute never accepts replacement calldata.';
  const executeSchema = schema(
    'executeTransfer',
    { type: 'object', additionalProperties: false },
    actionParams,
  );
  app.post<{ Params: { actionId: string } }>(
    '/v1/actions/:actionId/execute',
    {
      schema: {
        ...executeSchema,
        headers: {
          ...executionHeaders,
          required: [...executionHeaders.required, 'idempotency-key'],
          properties: {
            ...executionHeaders.properties,
            'idempotency-key': uuidSchema,
          },
        },
        description: executionDescription,
        response: { ...executeSchema.response, 200: executionReceiptSchema },
      },
    },
    async (request) =>
      execution(request).execute(
        await context(request, 'wallet:execute'),
        request.params.actionId,
      ),
  );
  const readExecutionSchema = schema(
    'getTransferExecution',
    undefined,
    actionParams,
  );
  app.get<{ Params: { actionId: string } }>(
    '/v1/actions/:actionId/execution',
    {
      schema: {
        ...readExecutionSchema,
        headers: executionHeaders,
        description: executionDescription,
        response: {
          ...readExecutionSchema.response,
          200: executionReceiptSchema,
        },
      },
    },
    async (request) =>
      execution(request).read(
        (await context(request, 'wallet:execute:read')).principal,
        request.params.actionId,
      ),
  );
  const executionEvents = schema('getExecutionEvents', undefined, actionParams);
  app.get<{ Params: { actionId: string }; Querystring: { after?: string } }>(
    '/v1/actions/:actionId/execution-events',
    {
      schema: {
        ...executionEvents,
        headers: executionHeaders,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            after: { type: 'string', pattern: '^(0|[1-9][0-9]{0,15})$' },
          },
        },
        description:
          'Authenticated CloudEvents 1.0 execution observations with a monotonic sequence in the active store. At most 64 transitions are retained per execution; history_truncated signals a cursor gap requiring verified-status resynchronization. Reports never become verified events without RPC evidence. This endpoint does not refresh, submit or release budgets.',
        response: { ...executionEvents.response, 200: executionEventsSchema },
      },
    },
    async (request) =>
      execution(request).events(
        (await context(request, 'wallet:execute:read')).principal,
        request.params.actionId,
        request.query.after,
      ),
  );
  const eventDescription =
    'Record or read unverified application transaction observations for an existing authorized transfer. Current caller, owner, grant, identity, consent and policy checks apply even after signing expiry. Reports never broadcast, reconcile attempts, verify settlement or release budgets.';
  app.post<{ Params: { actionId: string }; Body: TransactionEventInput }>(
    '/v1/actions/:actionId/transaction-events',
    {
      schema: {
        ...schema(
          'reportTransactionEvent',
          transactionEventInputSchema,
          actionParams,
        ),
        description: eventDescription,
        response: {
          ...schema('reportTransactionEvent').response,
          200: transactionEventReceiptSchema,
        },
      },
    },
    async (request) =>
      actions().reportTransactionEvent(
        await context(request, 'wallet:events'),
        request.params.actionId,
        request.body,
      ),
  );
  app.get<{ Params: { actionId: string } }>(
    '/v1/actions/:actionId/transaction-events',
    {
      schema: {
        ...schema('getTransactionEvents', undefined, actionParams),
        description: eventDescription,
        response: {
          ...schema('getTransactionEvents').response,
          200: transactionEventsSchema,
        },
      },
    },
    async (request) =>
      actions().transactionEvents(
        (await context(request, 'wallet:events:read')).principal,
        request.params.actionId,
      ),
  );
  const requestParams = {
    type: 'object',
    additionalProperties: false,
    required: ['requestId'],
    properties: { requestId: uuidSchema },
  };
  app.post<{ Body: AccessInput }>(
    '/v1/access-requests',
    {
      bodyLimit: 32768,
      schema: schema('requestAccountAccess', {
        type: 'object',
        additionalProperties: false,
        required: ['mode', 'authorization_details'],
        properties: {
          mode: { type: 'string', enum: ['create', 'connect'] },
          account_id: uuidSchema,
          identity_record: applicationRecordSchema,
          user: {
            description:
              'Required in application-led mode. The explicitly trusted application attests its stable user identity and recorded consent; OAuth scopes alone do not establish these facts.',
            type: 'object',
            additionalProperties: false,
            required: ['id', 'identity', 'consent'],
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
                  action_policy_revision: {
                    type: 'string',
                    pattern: '^[a-f0-9]{64}$',
                  },
                  transfer_policy_revision: {
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
      service().request(await context(request, 'wallet:access'), request.body),
  );
  app.get(
    '/v1/access-policy',
    {
      schema: {
        ...schema('getAccountAccessPolicy'),
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
              transfer_policy_revision: { type: 'string' },
              transfer_terms: providerConfigurationSchema.properties.financial,
              contract_call_terms: callTermsSchema,
              max_identity_age_days: { type: 'integer' },
              max_access_days: { type: 'integer' },
              verification_level: { type: 'string' },
            },
          },
        },
      },
    },
    async (request) => ({
      ...service().accessPolicy(
        (await context(request, 'wallet:access:read')).principal,
      ),
      ...(options?.actions
        ? {
            ...(options.actions.consentTerms()
              ? { transfer_terms: options.actions.consentTerms() }
              : {}),
            ...(options.actions.callConsentTerms()
              ? { contract_call_terms: options.actions.callConsentTerms() }
              : {}),
          }
        : {}),
    }),
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
      service().revokeApplicationGrant(
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
      service().submitRecords(
        await context(request, 'wallet:access'),
        request.body.records,
      ),
  );
  app.get<{ Params: { requestId: string } }>(
    '/v1/access-requests/:requestId',
    { schema: schema('getAccountAccessRequest', undefined, requestParams) },
    async (request) =>
      service().read(
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
      service().importIdentity(
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
          properties: { accountId: uuidSchema },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['account_id', 'status'],
            properties: {
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
      service().account(
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
            ? 'We could not authorize this request. Check that you are using the right provider account and that the identity evidence meets the provider’s requirements.'
            : status === 409
              ? 'This request is already being handled or has changed. Ask your provider to check the original request.'
              : status === 503
                ? 'We could not confirm the result. Your provider needs to check the original attempt before trying another verification or wallet creation.'
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
        request.headers.origin !== service().policy.provider.origin ||
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
        const url = new URL(request.raw.url!, service().policy.provider.origin);
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
        const grants = await service().ownerGrants(current.identity);
        const pending = await service().ownerRequests(current.identity);
        return html(
          reply,
          'Your application access',
          `<p>Choose which applications can use your wallet. Revoking access stops future requests; completed blockchain actions remain.</p>${
            grants.length
              ? grants
                  .map(
                    (g) => `<article>
<h2>${escape(g.application)}</h2>
<p>${escape(g.permissions.map((p) => permissionLabels[p]).join('; '))} · ${escape(g.state)}<br>Expires ${escape(new Date(g.expiresAt).toISOString())}</p>
<form method="post" action="/onboarding/access/${escape(g.id)}">
<input type="hidden" name="csrf" value="${escape(current.csrf)}">
<button name="decision" value="suspended">Pause access</button>
<button name="decision" value="revoked">Revoke access</button>
</form>
</article>`,
                  )
                  .join('')
              : '<p>No applications have access yet.</p>'
          }<h2>Pending requests</h2><p>You can cancel a request before access is granted. Checks already started may still finish and incur the agreed cost.</p>${pending.length ? pending.map((r) => `<article><h2>${escape(r.application)}</h2><p>${escape(statusLabels[r.status] ?? 'Your provider will help with the next step.')}</p><form method="post" action="/onboarding/requests/${r.id}/cancel"><input type="hidden" name="csrf" value="${escape(current.csrf)}"><button>Cancel request</button></form></article>`).join('') : '<p>No requests are waiting.</p>'}`,
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
        await service().cancelPending(
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
        await service().changeGrant(
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
        const pending = await service().reviews(staff(current.identity));
        const accounts = await service().providerAccounts(
          staff(current.identity),
        );
        return html(
          reply,
          'Review wallet requests',
          `<p>${service().policy.identity.records ? 'Review the application-supplied record, match it to the authenticated provider user and accept it only for your unfunded evaluation. Required fields do not establish externally verified KYC.' : 'Check identity evidence in your vendor workspace and match it to the provider user below. A share token or application login alone does not establish that match.'}</p>${
            pending.length
              ? pending
                  .map(
                    (r) => `<article>
<p>Provider user: <code>${escape(r.owner?.subject)}</code>
<br>Issuer: ${escape(r.owner?.issuer)}${r.applicationRecord ? '' : `<br>Evidence: ${escape(r.vendor ?? 'not supplied')} <code>${escape(r.reference ?? '')}</code>`}
<br>Status: ${escape(r.status)}</p>
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
<label><input type="checkbox" name="identity_matches_owner" value="yes"> I matched this submitted record to this provider user and accept it for an unfunded evaluation.</label>
<button name="decision" value="accept">Accept submitted record</button>`
    : `<label>Vendor <select name="vendor">
<option value="didit"${r.vendor === 'didit' ? ' selected' : ''}>Didit</option>
<option value="sumsub"${r.vendor === 'sumsub' ? ' selected' : ''}>Sumsub</option>
</select>
</label>
<label>Recipient evidence reference (also used to recover a lost import response)<input name="reference" value="${escape(r.reference ?? '')}" maxlength="256">
</label>
<label>Verification date from evidence, in UTC<input name="verified_at" value="${escape(r.verifiedAt ?? '')}" placeholder="2026-10-15T12:00:00Z" maxlength="40">
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
          }<h2>Provider accounts</h2>${accounts
            .map(
              (a) => `<article>
<code>${escape(a.id)}</code>
<p>${escape(a.status)} · ${a.provisioned ? 'Wallet provisioned' : 'Wallet not confirmed'}</p>
<form method="post" action="/onboarding/accounts/${a.id}">
<input type="hidden" name="csrf" value="${escape(current.csrf)}">
<button name="decision" value="reconcile">Check wallet creation</button>
<button name="decision" value="suspend">Suspend account and revoke access</button>
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
          await service().suspendAccount(principal, request.params.accountId);
          return reply.redirect('/onboarding/review');
        }
        const result = await service().reconcileAccount(
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
        await service().review(
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
        const view = await service().consentView(
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
    ? `<p>Contract-call delegation on Base Sepolia: you permit calls to the configured contracts and functions, swaps on the configured routes and deposits into the configured vaults. Limits and account bindings: <code>${escape(JSON.stringify(actions().callConsentTerms()))}</code>. Contract-call signatures remain private to coordinated execution. Safe signatures have no native expiry; revocation stops new service dispatch but cannot recall an already submitted authorization.</p>`
    : ''
}
${
  view.permissions.includes('transfers:request')
    ? (() => {
        const terms = actions().consentTerms() ?? deny();
        return `<p>Transfer delegation: ${escape(terms.token.symbol)} on Base Sepolia. Token contract: <code>${escape(terms.token.address)}</code>. Domain: ${escape(terms.token.name)} / ${escape(terms.token.version)}. Maximum per transfer: ${escape(formatUnits(terms.maximumAmount, terms.token.decimals))} ${escape(terms.token.symbol)}. Lifetime limit per account/token across applications: ${escape(formatUnits(terms.lifetimeAmount, terms.token.decimals))} ${escape(terms.token.symbol)}. Allowed recipients: ${terms.recipients.map((a) => `<code>${escape(a)}</code>`).join(', ')}. Each signature is valid for up to ${escape(terms.maxValiditySeconds)} seconds. The provider checks each request against these terms without another approval prompt. Revoking access stops new signing; signatures already issued may remain usable until expiry.</p>`;
      })()
    : ''
}
<p>Access lasts up to ${view.durationDays} days. You can pause or revoke it at any time. Each financial action still needs the provider’s authorization.</p>
<p>${view.identitySource === 'application_record' ? 'Your application submitted a record for provider review. This is an unfunded evaluation; the record is not externally verified KYC.' : 'Your provider may receive identity evidence to review your account. The requesting application funds agreed verification costs.'} <a href="${escape(view.privacyUrl)}">Read the provider’s privacy notice</a>.</p>
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
                  ? `<p>Your application can share existing identity evidence. If you need a new check, choose a provider below. Verification starts only when an agreed budget covers it.</p>
<form method="post" action="/onboarding/${request.params.requestId}/verify">
<input type="hidden" name="csrf" value="${escape(current.csrf)}">
<select name="vendor">${service()
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
        await service().consent(
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
        if (!(await ready())) return unavailable();
        const result = await service().startVerification(
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
