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
