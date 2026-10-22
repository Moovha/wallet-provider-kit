import type { ResolveNetwork } from '../service/network-context.js';
import { runtimeApplicationId } from './service.js';
import { setAuthenticatedResponseTimeout } from '../service/response-timeout.js';
import {
  obligationSchemas,
  type ObligationKind,
  type ApplicationObligations,
} from './obligations.js';
import { walletCallsReceiptSchema } from '../wallet-calls/schemas.js';
import type { WalletCallsService } from '../wallet-calls/service.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthorityContext } from '../domain/principal.js';
import { AuthenticationError, type Authenticate } from '../service/auth.js';
import { problemSchema, uuidSchema } from '../service/schemas.js';
import type {
  RuntimeConfigurationService,
  RuntimePolicyChange,
} from './service.js';
import {
  applicationIdSchema,
  policyChangeSchema,
  revisionSchema,
  runtimePolicySchema,
} from './schemas.js';

const publicationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'application_id',
    'revision',
    'previous_revision',
    'policy_hash',
    'policy',
    'published_at',
    'published_by',
  ],
  properties: {
    application_id: applicationIdSchema,
    revision: revisionSchema,
    previous_revision: revisionSchema,
    policy_hash: applicationIdSchema,
    policy: runtimePolicySchema,
    published_at: { type: 'string', format: 'date-time' },
    proposal_id: uuidSchema,
    published_by: applicationIdSchema,
  },
};
const proposalSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'proposal_id',
    'application_id',
    'based_on_revision',
    'policy_hash',
    'policy',
    'created_at',
  ],
  properties: {
    proposal_id: uuidSchema,
    application_id: applicationIdSchema,
    based_on_revision: revisionSchema,
    policy_hash: applicationIdSchema,
    policy: runtimePolicySchema,
    created_at: { type: 'string', format: 'date-time' },
  },
};
const reviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'revision', 'approved_by'],
  properties: {
    mode: { type: 'string', enum: ['automatic', 'manual'] },
    revision: revisionSchema,
    approved_by: applicationIdSchema,
  },
};
const applicationsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['role', 'applications'],
  properties: {
    network: {
      type: 'string',
      enum: ['base', 'base-sepolia', 'ethereum-sepolia'],
    },
    role: { type: 'string', enum: ['provider', 'application'] },
    applications: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'application_id',
          'name',
          'active_revision',
          'proposals',
          'proposals_truncated',
          'publications',
        ],
        properties: {
          application_id: applicationIdSchema,
          name: { type: 'string' },
          active_revision: revisionSchema,
          publication: publicationSchema,
          publications: {
            type: 'array',
            maxItems: 20,
            items: publicationSchema,
          },
          review: reviewSchema,
          proposals_truncated: { type: 'boolean' },
          proposals: {
            type: 'array',
            maxItems: 20,
            items: {
              ...proposalSchema,
              properties: {
                ...proposalSchema.properties,
                published_revision: revisionSchema,
              },
            },
          },
        },
      },
    },
  },
};
const batchesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['truncated', 'batches'],
  properties: {
    truncated: { type: 'boolean' },
    batches: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'account_id',
          'sender',
          'queue_stage',
          'policy_revision',
          'expires_at',
          'application_id',
          'version',
          'chainId',
          'status',
          'atomic',
        ],
        properties: {
          id: { type: 'string', maxLength: 8194 },
          account_id: uuidSchema,
          sender: { type: 'string' },
          queue_stage: {
            type: 'string',
            enum: [
              'queued',
              'executing',
              'included',
              'failed',
              'succeeded',
              'cancelled',
              'expired',
              'blocked',
            ],
          },
          policy_revision: revisionSchema,
          expires_at: { type: 'string', format: 'date-time' },
          application_id: applicationIdSchema,
          version: { type: 'string', enum: ['2.0.0'] },
          chainId: { type: 'string', enum: ['0x14a34', '0x2105', '0xaa36a7'] },
          status: { type: 'integer', enum: [100, 200, 400, 500] },
          atomic: { type: 'boolean', enum: [true] },
          receipts: { type: 'array', items: walletCallsReceiptSchema },
        },
      },
    },
  },
};
const currentSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'application_id',
    'active_revision',
    'revision',
    'authorizes_spending',
  ],
  properties: {
    application_id: applicationIdSchema,
    active_revision: revisionSchema,
    revision: revisionSchema,
    publication: publicationSchema,
    authorizes_spending: { type: 'boolean', enum: [false] },
  },
};
const errors = Object.fromEntries(
  [400, 401, 403, 409, 413, 415, 422, 429, 500, 503].map((status) => [
    status,
    {
      description: 'Problem response',
      content: { 'application/problem+json': { schema: problemSchema } },
    },
  ]),
);
const headers = {
  type: 'object',
  required: ['idempotency-key'],
  properties: { 'idempotency-key': uuidSchema },
};
function params(name: string, schema: object) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [name],
    properties: { [name]: schema },
  };
}
const description =
  'Optional runtime configuration control plane. Application proposals and provider publications are configuration records, not wallet grants, signing authority or execution activation. Publications become readable immediately without restarting the service. Immutable historical revisions remain available. Requires the documented scope and configured application or operator identity.';

export async function registerRuntimeConfigurationRoutes(
  app: FastifyInstance,
  service?: RuntimeConfigurationService,
  authenticate?: Authenticate,
  walletCalls?: WalletCallsService,
  safeWallet?: import('../sponsorship/safe-wallet.js').SafeWalletRuntime,
  resolveNetwork?: ResolveNetwork,
) {
  function configured(request: FastifyRequest) {
    const current = resolveNetwork
      ? resolveNetwork(request).runtimeConfiguration
      : service;
    if (!current)
      throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
    return current;
  }
  async function principal(request: FastifyRequest, scope: string) {
    if (!authenticate)
      throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
    configured(request);
    const caller = await authenticate(request.headers.authorization, scope);
    setAuthenticatedResponseTimeout(request);
    return caller;
  }
  async function context(
    request: FastifyRequest,
    scope: string,
  ): Promise<AuthorityContext> {
    return {
      principal: await principal(request, scope),
      idempotencyKey: String(request.headers['idempotency-key'] ?? ''),
    };
  }
  const schema = (operationId: string, response: object, extra = {}) => ({
    operationId,
    description,
    tags: ['Application configuration'],
    security: [{ accessToken: [] }],
    ...extra,
    response: { 200: response, ...errors },
  });
  app.get(
    '/v1/application/gas-funding',
    {
      schema: schema('readApplicationGasFunding', {
        type: 'object',
        additionalProperties: false,
        required: ['application_id', 'chain_id', 'profile', 'status'],
        properties: {
          application_id: applicationIdSchema,
          chain_id: { type: 'string' },
          profile: { const: 'safe-only-4337-v1' },
          status: {
            type: 'string',
            enum: ['unprovisioned', 'needs-funding', 'provisioned'],
          },
          execution_funding: {
            type: 'object',
            description:
              'Most recent background check of network fee balances and refill constraints. This observation does not authorize spending and expires after 30 seconds.',
            additionalProperties: false,
            required: ['status', 'message'],
            properties: {
              status: {
                type: 'string',
                enum: [
                  'checking',
                  'ready',
                  'replenishing',
                  'needs-funding',
                  'limit-reached',
                  'unavailable',
                ],
              },
              message: { type: 'string' },
              checked_at: { type: 'string', format: 'date-time' },
            },
          },
          funding_address: { type: 'string' },
          paymaster: { type: 'string' },
        },
      }),
    },
    async (request) => {
      const caller = await principal(request, 'wallet:configuration:read');
      const selectedWallet = resolveNetwork
        ? resolveNetwork(request).safeWallet
        : safeWallet;
      if (selectedWallet)
        return selectedWallet.read(
          caller,
          runtimeApplicationId(caller.issuer, caller.clientId),
        );
      throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
    },
  );
  const credentialSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['application_id', 'reference', 'revision', 'origin', 'status'],
    properties: {
      application_id: applicationIdSchema,
      reference: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' },
      revision: revisionSchema,
      origin: { type: 'string' },
      status: { type: 'string', enum: ['active', 'revoked'] },
    },
  };
  app.get(
    '/v1/application/credentials',
    {
      schema: schema('readApplicationCredentials', {
        type: 'array',
        maxItems: 32,
        items: credentialSchema,
      }),
    },
    async (request) =>
      configured(request).readCredentials(
        await principal(request, 'wallet:configuration:read'),
      ),
  );
  app.get<{ Params: { applicationId: string } }>(
    '/v1/provider/applications/:applicationId/credentials',
    {
      schema: schema(
        'readProviderApplicationCredentials',
        { type: 'array', maxItems: 32, items: credentialSchema },
        { params: params('applicationId', applicationIdSchema) },
      ),
    },
    async (request) =>
      configured(request).readCredentials(
        await principal(request, 'wallet:configuration:write'),
        request.params.applicationId,
      ),
  );
  app.put<{
    Params: { reference: string };
    Body: { expected_revision: string; endpoint: string | null };
  }>(
    '/v1/application/credentials/:reference',
    {
      bodyLimit: 8192,
      schema: {
        ...schema('writeApplicationCredential', credentialSchema, {
          headers,
          params: params('reference', credentialSchema.properties.reference),
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['expected_revision', 'endpoint'],
            properties: {
              expected_revision: revisionSchema,
              endpoint: {
                anyOf: [
                  { type: 'string', minLength: 1, maxLength: 4096 },
                  { type: 'null' },
                ],
              },
            },
          },
        }),
        description:
          'Store or rotate an application-owned HTTPS service endpoint in encrypted storage. Send null to revoke it. Secret paths are never returned. Associated service declarations require provider review after every change.',
      },
    },
    async (request) =>
      configured(request).writeCredential(
        await context(request, 'wallet:configuration:propose'),
        request.params.reference,
        request.body,
      ),
  );
  const obligationRecordSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'application_id',
      'kind',
      'revision',
      'value',
      'submitted_at',
      'decision',
      'decision_revision',
    ],
    properties: {
      application_id: applicationIdSchema,
      kind: { type: 'string', enum: ['actions', 'services', 'sponsorship'] },
      revision: revisionSchema,
      value: { anyOf: Object.values(obligationSchemas) },
      submitted_at: { type: 'string', format: 'date-time' },
      decision: { type: 'string', enum: ['pending', 'accepted', 'rejected'] },
      decision_revision: revisionSchema,
      decided_at: { type: 'string', format: 'date-time' },
    },
  };
  const obligationReadSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'application_id',
      'resources',
      'authorizes_spending',
      'activates_execution',
    ],
    properties: {
      application_id: applicationIdSchema,
      resources: { type: 'array', maxItems: 3, items: obligationRecordSchema },
      authorizes_spending: { type: 'boolean', enum: [false] },
      activates_execution: { type: 'boolean', enum: [false] },
    },
  };
  const obligationSchema = (
    operationId: string,
    response: object,
    extra = {},
  ) => ({
    ...schema(operationId, response, extra),
    tags: ['Application obligations'],
    description:
      'Protected, application-scoped declarations and provider decisions. Accepted actions constrain off-chain payloads. Accepted service declarations permit resolving application-owned verifier credentials when credential storage is configured. Acceptance does not fund gas, provision a user Safe, activate execution or authorize spending. User assets remain in individual user wallets. Secrets and actual user payloads must not be submitted here.',
  });
  app.get(
    '/v1/application/obligations',
    {
      schema: obligationSchema(
        'readApplicationObligations',
        obligationReadSchema,
      ),
    },
    async (request) =>
      configured(request).readObligations(
        await principal(request, 'wallet:configuration:read'),
      ),
  );
  app.get<{ Params: { applicationId: string } }>(
    '/v1/provider/applications/:applicationId/obligations',
    {
      schema: obligationSchema(
        'readProviderApplicationObligations',
        obligationReadSchema,
        {
          params: params('applicationId', applicationIdSchema),
        },
      ),
    },
    async (request) =>
      configured(request).readObligations(
        await principal(request, 'wallet:configuration:write'),
        request.params.applicationId,
      ),
  );
  for (const kind of Object.keys(obligationSchemas) as ObligationKind[]) {
    const name = kind[0].toUpperCase() + kind.slice(1);
    app.put<{
      Body: {
        expected_revision: string;
        value: ApplicationObligations[ObligationKind];
      };
    }>(
      '/v1/application/obligations/' + kind,
      {
        bodyLimit: 32768,
        schema: obligationSchema(
          'submitApplication' + name,
          obligationRecordSchema,
          {
            headers,
            body: {
              type: 'object',
              additionalProperties: false,
              required: ['expected_revision', 'value'],
              properties: {
                expected_revision: revisionSchema,
                value: obligationSchemas[kind],
              },
            },
          },
        ),
      },
      async (request) =>
        configured(request).submitObligation(
          await context(request, 'wallet:configuration:propose'),
          kind,
          request.body,
        ),
    );
    app.post<{
      Params: { applicationId: string };
      Body: {
        expected_revision: string;
        expected_decision_revision: string;
        decision: 'accepted' | 'rejected';
      };
    }>(
      '/v1/provider/applications/:applicationId/obligations/' +
        kind +
        '/decision',
      {
        schema: obligationSchema(
          'decideApplication' + name,
          obligationRecordSchema,
          {
            headers,
            params: params('applicationId', applicationIdSchema),
            body: {
              type: 'object',
              additionalProperties: false,
              required: [
                'expected_revision',
                'expected_decision_revision',
                'decision',
              ],
              properties: {
                expected_revision: revisionSchema,
                expected_decision_revision: revisionSchema,
                decision: { type: 'string', enum: ['accepted', 'rejected'] },
              },
            },
          },
        ),
      },
      async (request) =>
        configured(request).decideObligation(
          await context(request, 'wallet:configuration:write'),
          request.params.applicationId,
          kind,
          request.body,
        ),
    );
  }
  app.get<{ Querystring: { application_id?: string } }>(
    '/v1/applications/configurations',
    {
      schema: schema('listApplicationConfigurations', applicationsSchema, {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { application_id: applicationIdSchema },
        },
      }),
    },
    async (request) => {
      let caller;
      try {
        caller = await principal(request, 'wallet:configuration:read');
      } catch (error) {
        if (!(error instanceof AuthenticationError) || error.status !== 403)
          throw error;
        caller = await principal(request, 'wallet:configuration:write');
      }
      return configured(request).listApplications(
        caller,
        request.query.application_id,
      );
    },
  );
  app.get(
    '/v1/wallet/batches',
    {
      schema: schema('listWalletBatches', batchesSchema),
    },
    async (request) => {
      let caller;
      try {
        caller = await principal(request, 'wallet:execute:read');
      } catch (error) {
        if (!(error instanceof AuthenticationError) || error.status !== 403)
          throw error;
        caller = await principal(request, 'wallet:configuration:write');
      }
      const selectedCalls = resolveNetwork
        ? resolveNetwork(request).walletCalls
        : walletCalls;
      if (!selectedCalls)
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const provider = caller.scopes.includes('wallet:configuration:write');
      if (provider) configured(request).assertOperator(caller);
      return selectedCalls.list(
        caller,
        provider
          ? (state) => configured(request).assertOperatorState(caller, state)
          : undefined,
      );
    },
  );
  app.post<{
    Params: { applicationId: string };
    Body: {
      expected_revision: string;
      expected_review_revision: string;
      mode: 'automatic' | 'manual';
    };
  }>(
    '/v1/provider/applications/:applicationId/policy/review',
    {
      schema: schema(
        'setRuntimeReviewMode',
        {
          type: 'object',
          additionalProperties: false,
          required: ['mode', 'revision', 'approved_by'],
          properties: {
            mode: { type: 'string', enum: ['automatic', 'manual'] },
            revision: revisionSchema,
            approved_by: applicationIdSchema,
          },
        },
        {
          headers,
          params: params('applicationId', applicationIdSchema),
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['expected_revision', 'expected_review_revision', 'mode'],
            properties: {
              expected_revision: revisionSchema,
              expected_review_revision: revisionSchema,
              mode: { type: 'string', enum: ['automatic', 'manual'] },
            },
          },
        },
      ),
    },
    async (request) =>
      configured(request).setReview(
        await context(request, 'wallet:configuration:write'),
        request.params.applicationId,
        request.body,
      ),
  );
  app.get(
    '/v1/application/policy',
    {
      schema: schema('readRuntimeConfiguration', currentSchema),
    },
    async (request) =>
      configured(request).read(
        await principal(request, 'wallet:configuration:read'),
      ),
  );
  app.get<{ Params: { applicationId: string } }>(
    '/v1/provider/applications/:applicationId/policy',
    {
      schema: schema('readRuntimeApplicationConfiguration', currentSchema, {
        params: params('applicationId', applicationIdSchema),
      }),
    },
    async (request) =>
      configured(request).readApplication(
        await principal(request, 'wallet:configuration:write'),
        request.params.applicationId,
      ),
  );
  app.get<{ Params: { revision: string } }>(
    '/v1/application/policy/revisions/:revision',
    {
      schema: schema('readRuntimeConfigurationRevision', currentSchema, {
        params: params('revision', revisionSchema),
      }),
    },
    async (request) =>
      configured(request).read(
        await principal(request, 'wallet:configuration:read'),
        request.params.revision,
      ),
  );
  app.post<{ Body: RuntimePolicyChange }>(
    '/v1/application/policy/proposals',
    {
      bodyLimit: 32768,
      schema: schema('proposeRuntimeConfiguration', proposalSchema, {
        headers,
        body: policyChangeSchema,
      }),
    },
    async (request) =>
      configured(request).propose(
        await context(request, 'wallet:configuration:propose'),
        request.body,
      ),
  );
  app.get<{ Params: { proposalId: string } }>(
    '/v1/application/policy/proposals/:proposalId',
    {
      schema: schema('readRuntimeConfigurationProposal', proposalSchema, {
        params: params('proposalId', uuidSchema),
      }),
    },
    async (request) => {
      let caller;
      try {
        caller = await principal(request, 'wallet:configuration:read');
      } catch (error) {
        if (!(error instanceof AuthenticationError) || error.status !== 403)
          throw error;
        caller = await principal(request, 'wallet:configuration:write');
      }
      return configured(request).proposal(caller, request.params.proposalId);
    },
  );
  app.post<{
    Params: { proposalId: string };
    Body: { expected_revision: string };
  }>(
    '/v1/provider/policy/proposals/:proposalId/publish',
    {
      schema: schema('publishRuntimeConfiguration', publicationSchema, {
        headers,
        params: params('proposalId', uuidSchema),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['expected_revision'],
          properties: { expected_revision: revisionSchema },
        },
      }),
    },
    async (request) =>
      configured(request).publish(
        await context(request, 'wallet:configuration:write'),
        request.params.proposalId,
        request.body.expected_revision,
      ),
  );
  app.post<{ Params: { applicationId: string }; Body: RuntimePolicyChange }>(
    '/v1/provider/applications/:applicationId/policy/revisions',
    {
      bodyLimit: 32768,
      schema: schema('updateRuntimeConfiguration', publicationSchema, {
        headers,
        params: params('applicationId', applicationIdSchema),
        body: policyChangeSchema,
      }),
    },
    async (request) =>
      configured(request).update(
        await context(request, 'wallet:configuration:write'),
        request.params.applicationId,
        request.body,
      ),
  );
}
