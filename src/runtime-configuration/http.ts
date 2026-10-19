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
const workspaceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['role', 'applications'],
  properties: {
    network: { type: 'string', enum: ['base', 'base-sepolia'] },
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
          chainId: { type: 'string', enum: ['0x14a34', '0x2105'] },
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
) {
  function configured() {
    if (!service)
      throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
    return service;
  }
  async function principal(request: FastifyRequest, scope: string) {
    if (!service || !authenticate)
      throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
    return authenticate(request.headers.authorization, scope);
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
    tags: ['Runtime configuration'],
    security: [{ accessToken: [] }],
    ...extra,
    response: { 200: response, ...errors },
  });
  app.get<{ Querystring: { application_id?: string } }>(
    '/v1/runtime-configuration/workspace',
    {
      schema: schema('readRuntimeWorkspace', workspaceSchema, {
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
      return configured().workspace(caller, request.query.application_id);
    },
  );
  app.get(
    '/v1/runtime-configuration/batches',
    {
      schema: schema('listRuntimeBatches', batchesSchema),
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
      if (!walletCalls)
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const provider = caller.scopes.includes('wallet:configuration:write');
      if (provider) configured().assertOperator(caller);
      return walletCalls.list(
        caller,
        provider
          ? (state) => configured().assertOperatorState(caller, state)
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
    '/v1/runtime-configuration/applications/:applicationId/review',
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
      configured().setReview(
        await context(request, 'wallet:configuration:write'),
        request.params.applicationId,
        request.body,
      ),
  );
  app.get(
    '/v1/runtime-configuration',
    {
      schema: schema('readRuntimeConfiguration', currentSchema),
    },
    async (request) =>
      configured().read(await principal(request, 'wallet:configuration:read')),
  );
  app.get<{ Params: { applicationId: string } }>(
    '/v1/runtime-configuration/applications/:applicationId',
    {
      schema: schema('readRuntimeApplicationConfiguration', currentSchema, {
        params: params('applicationId', applicationIdSchema),
      }),
    },
    async (request) =>
      configured().readApplication(
        await principal(request, 'wallet:configuration:write'),
        request.params.applicationId,
      ),
  );
  app.get<{ Params: { revision: string } }>(
    '/v1/runtime-configuration/revisions/:revision',
    {
      schema: schema('readRuntimeConfigurationRevision', currentSchema, {
        params: params('revision', revisionSchema),
      }),
    },
    async (request) =>
      configured().read(
        await principal(request, 'wallet:configuration:read'),
        request.params.revision,
      ),
  );
  app.post<{ Body: RuntimePolicyChange }>(
    '/v1/runtime-configuration/proposals',
    {
      bodyLimit: 32768,
      schema: schema('proposeRuntimeConfiguration', proposalSchema, {
        headers,
        body: policyChangeSchema,
      }),
    },
    async (request) =>
      configured().propose(
        await context(request, 'wallet:configuration:propose'),
        request.body,
      ),
  );
  app.get<{ Params: { proposalId: string } }>(
    '/v1/runtime-configuration/proposals/:proposalId',
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
      return configured().proposal(caller, request.params.proposalId);
    },
  );
  app.post<{
    Params: { proposalId: string };
    Body: { expected_revision: string };
  }>(
    '/v1/runtime-configuration/proposals/:proposalId/publish',
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
      configured().publish(
        await context(request, 'wallet:configuration:write'),
        request.params.proposalId,
        request.body.expected_revision,
      ),
  );
  app.post<{ Params: { applicationId: string }; Body: RuntimePolicyChange }>(
    '/v1/runtime-configuration/applications/:applicationId/revisions',
    {
      bodyLimit: 32768,
      schema: schema('updateRuntimeConfiguration', publicationSchema, {
        headers,
        params: params('applicationId', applicationIdSchema),
        body: policyChangeSchema,
      }),
    },
    async (request) =>
      configured().update(
        await context(request, 'wallet:configuration:write'),
        request.params.applicationId,
        request.body,
      ),
  );
}
