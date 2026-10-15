import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';
import Fastify, { type FastifyRequest } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { EmbeddedWalletService } from '../domain/embedded-wallet.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import { AuthenticationError, type Authenticate } from './auth.js';
import { observeRequest } from './telemetry.js';
import {
  accountSchema,
  emptyBodySchema,
  problemSchema,
  signatureSchema,
  uuidSchema,
} from './schemas.js';

export interface ServerOptions {
  authenticate?: Authenticate;
  service?: EmbeddedWalletService;
  /** Must check durable authority/recovery dependencies; never infer readiness from env keys. */
  ready?: () => Promise<boolean>;
  documentation?: boolean;
}

export async function createServer(options: ServerOptions = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024,
    requestTimeout: 15000,
    connectionTimeout: 10000,
    trustProxy: false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
      },
    },
  });
  const principals = new WeakMap<FastifyRequest, VerifiedPrincipal>();
  await app.register(helmet);
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Moovha Wallet Provider Service',
        version: '0.1.0',
        description:
          'Experimental provider-hosted signing profile. Not the Moovha operation orchestration API.',
      },
      components: {
        securitySchemes: {
          accessToken: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'RFC 9068 JWT',
          },
        },
      },
    },
  });
  if (options.documentation !== false) {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      staticCSP: true,
      uiConfig: { persistAuthorization: false, validatorUrl: null },
    });
  }
  const isReady = async () => {
    if (!options.service || !options.authenticate || !options.ready)
      return false;
    try {
      return await options.ready();
    } catch {
      return false;
    }
  };
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });
  app.addHook('onResponse', async (request, reply) => {
    // Only registered templates and methods; unknown raw URLs/methods never enter telemetry.
    const method = ['GET', 'POST', 'HEAD', 'OPTIONS'].includes(request.method)
      ? request.method
      : 'OTHER';
    observeRequest(
      method,
      request.routeOptions.url ?? 'unmatched',
      reply.statusCode,
      reply.elapsedTime / 1000,
    );
  });
  app.setErrorHandler((error, request, reply) => {
    let status = 500;
    let code = 'internal_error';
    let outcome: string | undefined;
    if (error instanceof AuthenticationError) {
      status = error.status;
      code = error.message;
      reply.header('www-authenticate', `Bearer error="${code}"`);
    } else if (error instanceof WalletProviderError) {
      code = error.code;
      outcome = error.outcome;
      status = 503;
      if (code === 'wallet_authorization_denied') status = 403;
      if (code === 'wallet_provider_input') status = 422;
    } else if (
      typeof error === 'object' &&
      error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      [400, 413, 415, 429, 503].includes(error.statusCode)
    ) {
      status = error.statusCode;
      code = 'invalid_request';
      if (status === 503) code = 'service_unavailable';
      if (status === 429) code = 'rate_limited';
    }
    reply
      .code(status)
      .type('application/problem+json')
      .send({
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Request failed',
        status,
        code,
        request_id: request.id,
        ...(outcome ? { outcome } : {}),
      });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).type('application/problem+json').send({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'not_found',
      request_id: request.id,
    }),
  );
  app.get('/health/live', { schema: { hide: true } }, async () => ({
    status: 'live',
  }));
  app.get(
    '/health/ready',
    { schema: { hide: true } },
    async (_request, reply) => {
      const ready = await isReady();
      return reply
        .code(ready ? 200 : 503)
        .send({ status: ready ? 'ready' : 'unconfigured' });
    },
  );
  app.get('/openapi.json', { schema: { hide: true } }, async () =>
    app.swagger(),
  );
  app.get(
    '/v1/capabilities',
    {
      schema: {
        operationId: 'getCapabilities',
        response: {
          200: {
            type: 'object',
            required: ['profile', 'status', 'configured'],
            additionalProperties: false,
            properties: {
              profile: { type: 'string', enum: ['provider-signing-preview'] },
              status: { type: 'string', enum: ['experimental'] },
              configured: { type: 'boolean' },
            },
          },
        },
      },
    },
    async () => ({
      profile: 'provider-signing-preview',
      status: 'experimental',
      configured: await isReady(),
    }),
  );

  async function authorize(request: FastifyRequest, scope: string) {
    if (!options.authenticate)
      throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
    principals.set(
      request,
      await options.authenticate(request.headers.authorization, scope),
    );
  }
  function mutationSchema(id: string, operationId: string, response: object) {
    return {
      operationId,
      security: [{ accessToken: [] }],
      description:
        'Requires current owner/grant/KYC authority and a durable attempt. Never retry an unknown outcome blindly. The body must be an empty object.',
      params: {
        type: 'object',
        required: [id],
        additionalProperties: false,
        properties: { [id]: uuidSchema },
      },
      headers: {
        type: 'object',
        required: ['idempotency-key'],
        properties: { 'idempotency-key': uuidSchema },
      },
      body: emptyBodySchema,
      response: {
        200: response,
        ...Object.fromEntries(
          [400, 401, 403, 413, 415, 422, 429, 500, 503].map((status) => [
            status,
            {
              description: 'Problem response',
              content: {
                'application/problem+json': { schema: problemSchema },
              },
            },
          ]),
        ),
      },
    };
  }
  app.post<{ Params: { accountId: string } }>(
    '/v1/accounts/:accountId/provision',
    {
      schema: mutationSchema('accountId', 'provisionAccount', accountSchema),
      onRequest: (request) => authorize(request, 'wallet:provision'),
    },
    async (request) => {
      if (!(await isReady()))
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const account = await options.service!.provision(
        {
          principal: principals.get(request)!,
          idempotencyKey: request.headers['idempotency-key'] as string,
        },
        request.params.accountId,
      );
      return { account_id: account.accountId, address: account.address };
    },
  );
  app.post<{ Params: { actionId: string } }>(
    '/v1/actions/:actionId/sign',
    {
      schema: mutationSchema('actionId', 'signAction', signatureSchema),
      onRequest: (request) => authorize(request, 'wallet:sign'),
    },
    async (request) => {
      if (!(await isReady()))
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const signature = await options.service!.sign(
        {
          principal: principals.get(request)!,
          idempotencyKey: request.headers['idempotency-key'] as string,
        },
        request.params.actionId,
      );
      return { signature };
    },
  );
  await app.ready();
  return app;
}
