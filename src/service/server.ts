import { readFile } from 'node:fs/promises';
import {
  registerDocumentationTokens,
  type DocumentationTokenOptions,
} from './documentation-tokens.js';
import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';
import Fastify, { type FastifyRequest } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { EmbeddedWalletService } from '../domain/embedded-wallet.js';
import type { EnrollmentService } from '../domain/enrollment.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import { AuthenticationError, type Authenticate } from './auth.js';
import {
  liveApiSpecification,
  liveRequestInterceptor,
  mountDocumentationTokens,
  documentationTokenPlugin,
} from './live-api-docs.js';
import { observeRequest } from './telemetry.js';
import {
  registerOnboardingRoutes,
  type OnboardingHttpOptions,
} from '../onboarding/http.js';
import {
  accountSchema,
  emptyBodySchema,
  problemSchema,
  signatureSchema,
  uuidSchema,
  enrollmentReceiptSchema,
  enrollmentChallengeSchema,
  enrollmentIdentitySchema,
} from './schemas.js';

export interface ServerOptions {
  authenticate?: Authenticate;
  service?: EmbeddedWalletService;
  /** Enabling enrollment also gates the provisioning route on current provider acceptance. */
  enrollment?: EnrollmentService;
  /** Application-led access or explicit hosted compatibility access. Independent of legacy OIDC enrollment. */
  onboarding?: OnboardingHttpOptions;
  /** Must check durable authority/recovery dependencies; never infer readiness from env keys. */
  ready?: () => Promise<boolean>;
  documentation?: boolean;
  /** Optional operator-authenticated client-credentials broker for the deployed explorer. */
  documentationTokens?: DocumentationTokenOptions;
  configurationProfile?: 'provider-service-v1';
  actionProfiles?: readonly 'provider-authorized-erc3009-v1'[];
  /** Release host-owned resources when the service closes. Registered before ready. */
  onClose?: () => Promise<void>;
}

export async function createServer(options: ServerOptions = {}) {
  if (options.enrollment && options.onboarding)
    throw new WalletProviderError('wallet_provider_configuration');
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
  if (options.onClose) app.addHook('onClose', options.onClose);
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
          'Experimental wallet-provider API with application-led access and optional hosted compatibility. Signing returns an approved EIP-712 signature; it does not submit a transaction or pay gas. Application transaction-event reports remain unverified and do not establish settlement. No transaction-submission HTTP endpoint is implemented. Not the Moovha operation orchestration API.',
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
      ...(options.documentationTokens
        ? {
            theme: {
              js: [
                {
                  filename: 'operator-tokens.js',
                  content: await readFile(
                    new URL('./documentation-token-ui.mjs', import.meta.url),
                    'utf8',
                  ),
                },
              ],
              css: [
                {
                  filename: 'operator-tokens.css',
                  content:
                    '.wpk-token-panel{max-width:1460px;margin:24px auto;padding:24px;box-sizing:border-box;border:1px solid #c7dfd3;border-radius:12px;background:#f3faf6;color:#163e31;font:16px/1.5 system-ui}.wpk-token-panel h2{margin-top:0}.wpk-token-panel button,.wpk-token-panel select{font:inherit;padding:8px 12px;margin:6px 8px 6px 0;max-width:100%}.wpk-token-panel button{cursor:pointer;border:1px solid #adcabc;border-radius:8px;background:white;color:#163e31}.wpk-token-panel [data-get],.wpk-token-panel [data-renew]{background:#166346;color:white;border-color:#166346}.wpk-token-panel button:focus-visible,.wpk-token-panel select:focus-visible,.wpk-token-panel a:focus-visible{outline:3px solid #68b893;outline-offset:2px}.wpk-token-panel select{border:1px solid #adcabc;border-radius:8px;background:white}.wpk-token-panel input{accent-color:#166346}.wpk-token-panel label{display:block}.wpk-token-panel input{margin-right:8px}.wpk-token-panel [role=status]{overflow-wrap:anywhere}.wpk-token-panel fieldset{border:0;padding:8px 0}.wpk-token-panel a{color:#176448}',
                },
              ],
            },
          }
        : {}),
      transformSpecification: (document) =>
        liveApiSpecification(document, {
          onboarding: !!options.onboarding,
          enrollment: !!options.enrollment,
          financial: !!options.onboarding?.actions,
          signing:
            !!options.onboarding?.actions ||
            (!!options.service && !options.configurationProfile),
          wallet:
            !!options.service && !!options.authenticate && !!options.ready,
          flow: options.onboarding?.service.policy.access.mode,
          records: !!options.onboarding?.service.policy.identity?.records,
          vendor: !!options.onboarding?.service.verificationVendors().length,
        }),
      uiConfig: {
        layout: 'BaseLayout',
        ...(options.documentationTokens
          ? {
              onComplete: mountDocumentationTokens,
              plugins: [documentationTokenPlugin],
            }
          : {}),
        persistAuthorization: false,
        validatorUrl: null,
        supportedSubmitMethods: ['get', 'post'],
        tryItOutEnabled: false,
        displayRequestDuration: true,
        defaultModelsExpandDepth: -1,
        requestInterceptor: liveRequestInterceptor,
      },
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
      if (code === 'wallet_identity_invalid') status = 422;
      if (
        code === 'wallet_attempt_conflict' ||
        code === 'wallet_attempt_pending'
      )
        status = 409;
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
              configuration_profile: {
                type: 'string',
                enum: ['provider-service-v1'],
              },
              action_profiles: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['provider-authorized-erc3009-v1'],
                },
              },
            },
          },
        },
      },
    },
    async () => ({
      profile: 'provider-signing-preview',
      status: 'experimental',
      configured: await isReady(),
      ...(options.configurationProfile
        ? {
            configuration_profile: options.configurationProfile,
            action_profiles: [...(options.actionProfiles ?? [])],
          }
        : {}),
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
  function mutationSchema(
    id: string | undefined,
    operationId: string,
    response: object,
    success = 200,
  ) {
    return {
      operationId,
      security: [{ accessToken: [] }],
      description:
        'Requires current owner/grant/KYC authority and a durable attempt. Never retry an unknown outcome blindly. The body must be an empty object.',
      ...(id
        ? {
            params: {
              type: 'object',
              required: [id],
              additionalProperties: false,
              properties: { [id]: uuidSchema },
            },
          }
        : {}),
      headers: {
        type: 'object',
        required: ['idempotency-key'],
        properties: { 'idempotency-key': uuidSchema },
      },
      body: emptyBodySchema,
      response: {
        [success]: response,
        ...Object.fromEntries(
          [400, 401, 403, 409, 413, 415, 422, 429, 500, 503].map((status) => [
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
  const enrollmentUnavailable = () =>
    Object.assign(new Error('Unavailable'), { statusCode: 503 });
  app.post<{ Body: { identity_subject: string } }>(
    '/v1/enrollments',
    {
      schema: {
        ...mutationSchema(
          undefined,
          'beginEnrollment',
          enrollmentChallengeSchema,
          201,
        ),
        description:
          'Reserve an owner-enrollment challenge through current host policy and durable storage. No wallet is created.',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['identity_subject'],
          properties: {
            identity_subject: { type: 'string', minLength: 1, maxLength: 255 },
          },
        },
      },
      onRequest: (request) => authorize(request, 'wallet:enroll'),
    },
    async (request, reply) => {
      if (!(await isReady()) || !options.enrollment)
        throw enrollmentUnavailable();
      const result = await options.enrollment.begin(
        {
          principal: principals.get(request)!,
          idempotencyKey: request.headers['idempotency-key'] as string,
        },
        request.body.identity_subject,
      );
      return reply
        .code(201)
        .header('location', `/v1/enrollments/${result.enrollment_id}`)
        .send(result);
    },
  );
  app.post<{ Params: { enrollmentId: string }; Body: { id_token: string } }>(
    '/v1/enrollments/:enrollmentId/identity',
    {
      bodyLimit: 34816,
      schema: {
        ...mutationSchema(
          'enrollmentId',
          'submitEnrollmentIdentity',
          enrollmentReceiptSchema,
        ),
        description:
          'Submit a provider-nonce-bound OIDC Identity Assurance ID token. Provider policy decides acceptance; this never creates a wallet or spend grant.',
        body: enrollmentIdentitySchema,
      },
      onRequest: (request) => authorize(request, 'wallet:enroll'),
    },
    async (request) => {
      if (!(await isReady()) || !options.enrollment)
        throw enrollmentUnavailable();
      return options.enrollment.complete(
        {
          principal: principals.get(request)!,
          idempotencyKey: request.headers['idempotency-key'] as string,
        },
        request.params.enrollmentId,
        request.body.id_token,
      );
    },
  );
  const {
    body: _readBody,
    headers: _readHeaders,
    ...enrollmentReadSchema
  } = mutationSchema('enrollmentId', 'getEnrollment', enrollmentReceiptSchema);
  app.get<{ Params: { enrollmentId: string } }>(
    '/v1/enrollments/:enrollmentId',
    {
      schema: {
        ...enrollmentReadSchema,
        description:
          'Read the current authorized enrollment receipt without identity attributes or the proof token.',
      },
      onRequest: (request) => authorize(request, 'wallet:enroll:read'),
    },
    async (request) => {
      if (!(await isReady()) || !options.enrollment)
        throw enrollmentUnavailable();
      return options.enrollment.read(
        { principal: principals.get(request)!, idempotencyKey: request.id },
        request.params.enrollmentId,
      );
    },
  );
  app.post<{ Params: { accountId: string } }>(
    '/v1/accounts/:accountId/provision',
    {
      schema: {
        ...mutationSchema('accountId', 'provisionAccount', accountSchema),
        description:
          'Provision a host-authorized account by stored ID with an empty body and durable attempt. When enrollment is configured, current provider acceptance for the same caller/account/owner is also required. Acceptance does not grant signing rights.',
      },
      onRequest: (request) => authorize(request, 'wallet:provision'),
    },
    async (request) => {
      if (!(await isReady()))
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const context = {
        principal: principals.get(request)!,
        idempotencyKey: request.headers['idempotency-key'] as string,
      };
      const account = options.enrollment
        ? await options.enrollment.provision(
            options.service!,
            context,
            request.params.accountId,
          )
        : await options.service!.provision(
            context,
            request.params.accountId,
            options.onboarding
              ? async (owner) => {
                  const grant =
                    await options.onboarding!.service.authorizeCurrent(
                      context.principal,
                      request.params.accountId,
                    );
                  if (grant.owner !== owner)
                    throw new WalletProviderError(
                      'wallet_authorization_denied',
                    );
                }
              : undefined,
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
      const context = {
        principal: principals.get(request)!,
        idempotencyKey: request.headers['idempotency-key'] as string,
      };
      const signature = await options.service!.sign(
        context,
        request.params.actionId,
        options.onboarding
          ? async (owner, accountId) => {
              const grant = await options.onboarding!.service.authorize(
                context.principal,
                accountId,
                options.onboarding!.actions
                  ? 'transfers:request'
                  : 'operations:request',
              );
              if (grant.owner !== owner)
                throw new WalletProviderError('wallet_authorization_denied');
            }
          : undefined,
      );
      return { signature };
    },
  );
  await registerOnboardingRoutes(
    app,
    options.onboarding,
    options.authenticate,
    isReady,
  );
  if (options.documentation !== false && options.documentationTokens)
    await registerDocumentationTokens(app, options.documentationTokens);
  await app.ready();
  return app;
}
