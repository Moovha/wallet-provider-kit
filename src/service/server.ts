import { providerNetwork } from '../networks.js';
import {
  usesNetworkContext,
  type NetworkContext,
  type ResolveNetwork,
} from './network-context.js';
import { selectWalletGrant } from './wallet-grant.js';
import {
  apiTasks,
  apiOperationOrder,
  sortApiOperations,
  operationGuides,
  operationGuideDescription,
} from './api-guides.js';
import { registerManagementRoutes } from '../management/http.js';
import type { ManagementService } from '../management/service.js';
import { setAuthenticatedResponseTimeout } from './response-timeout.js';
import { registerWalletCallsRoutes } from '../wallet-calls/http.js';
import type { WalletCallsService } from '../wallet-calls/service.js';
import { readFile } from 'node:fs/promises';
import { registerRuntimeConfigurationRoutes } from '../runtime-configuration/http.js';
import type { RuntimeConfigurationService } from '../runtime-configuration/service.js';
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
  mountApiDocumentation,
  apiNavigationPlugin,
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
  networkContexts?: readonly NetworkContext[];
  resolveNetwork?: ResolveNetwork;
  management?: ManagementService;
  managementReady?: () => Promise<boolean>;
  providerOrigin?: string;
  localManagementOrigin?: string;
  requestsPerMinute?: number;
  safeWallet?: import('../sponsorship/safe-wallet.js').SafeWalletRuntime;
  authorizationServer?: {
    register(app: import('fastify').FastifyInstance): void;
  };
  walletCalls?: WalletCallsService;
  runtimeConfiguration?: RuntimeConfigurationService;
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
  actionProfiles?: readonly 'provider-approved-contracts-v1'[];
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
  const requestLimit = options.requestsPerMinute ?? 60;
  if (
    !Number.isInteger(requestLimit) ||
    requestLimit < 1 ||
    requestLimit > 6000
  )
    throw new Error('Invalid request limit');
  await app.register(rateLimit, { max: requestLimit, timeWindow: '1 minute' });
  app.addHook('onRoute', (route) => {
    if (route.schema && usesNetworkContext(route.url)) {
      const headers = route.schema.headers as
        { properties?: Record<string, unknown> } | undefined;
      route.schema.headers = {
        type: 'object',
        ...headers,
        properties: {
          ...headers?.properties,
          'wallet-network': {
            type: 'string',
            enum: ['base', 'base-sepolia', 'ethereum', 'ethereum-sepolia'],
            description:
              'Choose a configured network. Omit to use the default; existing wallet, request and grant IDs select their stored network automatically. A conflicting selection is rejected.',
          },
        },
      };
    }
    if (route.schema && route.url.startsWith('/v1/accounts/')) {
      const headers = (route.schema.headers ?? {}) as {
        properties?: Record<string, unknown>;
      };
      route.schema.headers = {
        type: 'object',
        ...headers,
        properties: {
          ...headers.properties,
          'wallet-grant-id': {
            ...uuidSchema,
            description:
              'Select this person’s current grant for this wallet. Required for shared wallets; the selector alone grants no authority.',
          },
        },
      };
    }
    const guide = operationGuides[String(route.schema?.operationId ?? '')];
    if (!guide || !route.schema || Object.hasOwn(route.schema, 'x-purpose'))
      return;
    route.schema.summary = guide.title;
    route.schema.tags = [guide.group];
    route.schema.description = [
      operationGuideDescription(guide),
      route.schema.description
        ? `**Request details:** ${route.schema.description}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    Object.assign(route.schema, {
      'x-task-order': apiOperationOrder.indexOf(
        String(route.schema.operationId),
      ),
      'x-audience': guide.audience,
      'x-purpose': guide.purpose,
      'x-when-to-use': guide.whenToUse,
    });
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      tags: apiTasks.map((task) => ({ ...task })),
      info: {
        title: 'Moovha Wallet Provider Service',
        version: '0.1.0',
        description:
          'Experimental wallet-provider API. Configured deployments support personal and shared Safe wallets with independent member and application approvals, private ERC-4337 v0.7 bundling and an application-owned verifying paymaster. Applications submit policy-approved calls through the account wallet endpoint and observe independently verified inclusion. Current owner, identity, consent, immutable calls and durable attempt authority precede effects. Acknowledgement, wallet inclusion and business settlement are distinct. Not the Moovha operation orchestration API.',
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
      theme: {
        js: options.documentationTokens
          ? [
              {
                filename: 'operator-tokens.js',
                content: await readFile(
                  new URL('./documentation-token-ui.mjs', import.meta.url),
                  'utf8',
                ),
              },
            ]
          : [],
        css: [
          {
            filename: 'api-navigation.css',
            content:
              '.wpk-api-navigation{max-width:1460px;margin:24px auto;padding:24px;box-sizing:border-box;border:1px solid #cbd8e4;border-radius:12px;background:#f4f8fc;color:#183247;font:16px/1.6 system-ui}.wpk-api-navigation h2{margin-top:0}.wpk-api-navigation label{font-weight:600}.wpk-api-navigation select{display:block;font:inherit;padding:10px;max-width:100%;margin:8px 0 16px;border:1px solid #a8bbc9;border-radius:6px;background:white}.wpk-api-navigation select:focus-visible{outline:3px solid #12bfde;outline-offset:2px}.swagger-ui .filter-container{display:none}.swagger-ui .opblock-summary-description{font-size:15px;font-weight:600}.wpk-token-panel{max-width:1460px;margin:24px auto;padding:24px;box-sizing:border-box;border:1px solid #c7dfd3;border-radius:12px;background:#f3faf6;color:#163e31;font:16px/1.5 system-ui}.wpk-token-panel h2{margin-top:0}.wpk-token-panel button,.wpk-token-panel select{font:inherit;padding:8px 12px;margin:6px 8px 6px 0;max-width:100%}.wpk-token-panel button{cursor:pointer;border:1px solid #adcabc;border-radius:8px;background:white;color:#163e31}.wpk-token-panel [data-get],.wpk-token-panel [data-renew]{background:#166346;color:white;border-color:#166346}.wpk-token-panel button:focus-visible,.wpk-token-panel select:focus-visible,.wpk-token-panel a:focus-visible{outline:3px solid #68b893;outline-offset:2px}.wpk-token-panel select{border:1px solid #adcabc;border-radius:8px;background:white}.wpk-token-panel input{accent-color:#166346}.wpk-token-panel label{display:block}.wpk-token-panel input{margin-right:8px}.wpk-token-panel [role=status]{overflow-wrap:anywhere}.wpk-token-panel fieldset{border:0;padding:8px 0}.wpk-token-panel a{color:#176448}',
          },
        ],
      },
      transformSpecification: (document) =>
        liveApiSpecification(document, {
          management: !!options.management,
          onboarding: !!options.onboarding,
          enrollment: !!options.enrollment,
          walletCalls: !!options.walletCalls,
          safeWallet: !!options.safeWallet,
          runtimeConfiguration: !!options.runtimeConfiguration,
          wallet:
            !!options.service && !!options.authenticate && !!options.ready,
          flow: options.onboarding?.service.policy.access.mode,
          records: !!options.onboarding?.service.policy.identity?.records,
          vendor: !!options.onboarding?.service.verificationVendors().length,
        }),
      uiConfig: {
        layout: 'BaseLayout',
        ...{ walletApiTasks: apiTasks },
        filter: 'Wallet access',
        operationsSorter: sortApiOperations,
        onComplete: mountApiDocumentation,
        plugins: [
          apiNavigationPlugin,
          ...(options.documentationTokens ? [documentationTokenPlugin] : []),
        ],
        persistAuthorization: false,
        validatorUrl: null,
        supportedSubmitMethods: ['get', 'post', 'put', 'patch'],
        tryItOutEnabled: false,
        displayRequestDuration: true,
        defaultModelsExpandDepth: -1,
        requestInterceptor: liveRequestInterceptor,
      },
    });
  }
  const selected = (request: FastifyRequest) =>
    options.resolveNetwork?.(request) ?? options;
  const isReady = async (request?: FastifyRequest) => {
    const services = request ? selected(request) : options;
    if (!services.service || !options.authenticate || !services.ready)
      return false;
    try {
      return await services.ready!();
    } catch {
      return false;
    }
  };
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });
  app.addHook('preSerialization', async (request, reply, payload) => {
    if (
      options.resolveNetwork &&
      reply.statusCode < 400 &&
      usesNetworkContext(request.routeOptions.url ?? '')
    ) {
      const network = options.resolveNetwork(request).network;
      if (network) reply.header('Wallet-Network', network);
    }
    return payload;
  });
  app.addHook('onResponse', async (request, reply) => {
    // Only registered templates and methods; unknown raw URLs/methods never enter telemetry.
    const method = [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ].includes(request.method)
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
      [400, 404, 413, 415, 429, 503].includes(error.statusCode)
    ) {
      status = error.statusCode;
      code = 'invalid_request';
      if (status === 404) code = 'not_found';
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
  app.get(
    '/health/management',
    { schema: { hide: true } },
    async (_request, reply) => {
      let ready = false;
      try {
        ready = (await options.managementReady?.()) ?? false;
      } catch {
        /* A failed storage probe remains unavailable. */
      }
      return reply
        .code(ready ? 200 : 503)
        .send({ status: ready ? 'ready' : 'unavailable' });
    },
  );
  app.get('/health/live', { schema: { hide: true } }, async () => ({
    status: 'live',
  }));
  app.get(
    '/health/ready',
    { schema: { hide: true } },
    async (_request, reply) => {
      const ready = await isReady();
      return reply.code(ready ? 200 : 503).send({
        status: ready ? 'ready' : 'unconfigured',
      });
    },
  );
  app.get('/openapi.json', { schema: { hide: true } }, async () =>
    app.swagger(),
  );
  app.get(
    '/v1/networks',
    {
      schema: {
        operationId: 'listNetworks',
        summary: 'Choose a wallet network',
        description:
          'Discover enabled network configurations. Identity and application registrations are shared; each network has separate wallets, approvals and fee funding. Configured means execution is enabled and current, not that an application has funded it.',
        response: {
          200: {
            type: 'object',
            required: ['default_network', 'networks'],
            properties: {
              default_network: { type: 'string' },
              networks: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['network', 'name', 'chain_id', 'configured'],
                  properties: {
                    network: { type: 'string' },
                    name: { type: 'string' },
                    chain_id: { type: 'string' },
                    configured: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => ({
      default_network:
        options.networkContexts?.[0]?.network ??
        options.onboarding?.network ??
        'base-sepolia',
      networks: await Promise.all(
        (options.networkContexts ?? []).map(async (entry) => ({
          network: entry.network,
          name: providerNetwork(entry.network).label,
          chain_id: providerNetwork(entry.network).caip,
          configured: await entry.ready!(),
        })),
      ),
    }),
  );
  app.get(
    '/v1/execution-capabilities',
    {
      schema: {
        operationId: 'getExecutionCapabilities',
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['profile', 'revision', 'configured'],
            properties: {
              profile: { const: 'safe-only-4337-v1' },
              revision: { const: '1' },
              configured: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request) => ({
      profile: 'safe-only-4337-v1',
      revision: '1',
      configured: !!selected(request).safeWallet && (await isReady(request)),
    }),
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
              profile: { type: 'string', enum: ['safe-wallet-service'] },
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
                  enum: ['provider-approved-contracts-v1'],
                },
              },
            },
          },
        },
      },
    },
    async (request) => ({
      profile: 'safe-wallet-service',
      status: 'experimental',
      configured: await isReady(request),
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
      selectWalletGrant(
        await options.authenticate(request.headers.authorization, scope),
        request.headers['wallet-grant-id'],
      ),
    );
    setAuthenticatedResponseTimeout(request);
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
      const { service, safeWallet, onboarding } = selected(request);
      if (!(await isReady(request)) || !safeWallet || !service)
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      const context = {
        principal: principals.get(request)!,
        idempotencyKey: request.headers['idempotency-key'] as string,
      };
      if (options.enrollment)
        await options.enrollment.provision(
          service,
          context,
          request.params.accountId,
        );
      else
        await service.provision(
          context,
          request.params.accountId,
          onboarding
            ? async (owner) => {
                const grant = await onboarding.service.authorizeCurrent(
                  context.principal,
                  request.params.accountId,
                );
                if (grant.owner !== owner)
                  throw new WalletProviderError('wallet_authorization_denied');
              }
            : undefined,
        );
      return safeWallet.provision(context, request.params.accountId);
    },
  );
  app.get<{ Params: { applicationId: string } }>(
    '/v1/configuration/applications/:applicationId/safe-wallet',
    {
      onRequest: (request) => authorize(request, 'wallet:configuration:write'),
      schema: {
        operationId: 'readSafeWalletInfrastructure',
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['application_id', 'chain_id', 'profile', 'status'],
            properties: {
              application_id: { type: 'string' },
              chain_id: { type: 'string' },
              profile: { const: 'safe-only-4337-v1' },
              status: {
                type: 'string',
                enum: ['unprovisioned', 'needs-funding', 'provisioned'],
              },
              funding_address: { type: 'string' },
              paymaster: { type: 'string' },
            },
          },
          403: problemSchema,
          503: problemSchema,
        },
        security: [{ accessToken: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['applicationId'],
          properties: {
            applicationId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
        },
      },
    },
    (request) =>
      (
        selected(request).safeWallet ??
        (() => {
          throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
        })()
      ).read(principals.get(request)!, request.params.applicationId),
  );
  app.post<{ Params: { applicationId: string } }>(
    '/v1/configuration/applications/:applicationId/safe-wallet',
    {
      onRequest: (request) => authorize(request, 'wallet:configuration:write'),
      schema: {
        operationId: 'provisionSafeWalletInfrastructure',
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: { 'idempotency-key': uuidSchema },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['application_id', 'chain_id', 'profile', 'status'],
            properties: {
              application_id: { type: 'string' },
              chain_id: { type: 'string' },
              profile: { const: 'safe-only-4337-v1' },
              status: {
                type: 'string',
                enum: ['unprovisioned', 'needs-funding', 'provisioned'],
              },
              funding_address: { type: 'string' },
              paymaster: { type: 'string' },
            },
          },
          403: problemSchema,
          503: problemSchema,
        },
        security: [{ accessToken: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['applicationId'],
          properties: {
            applicationId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
        },
        body: { type: 'object', additionalProperties: false },
      },
    },
    (request) =>
      (
        selected(request).safeWallet ??
        (() => {
          throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
        })()
      ).ensure(
        {
          principal: principals.get(request)!,
          idempotencyKey: String(request.headers['idempotency-key'] ?? ''),
        },
        request.params.applicationId,
      ),
  );
  app.post<{ Params: { applicationId: string } }>(
    '/v1/configuration/applications/:applicationId/safe-wallet/funding-address',
    {
      onRequest: (request) => authorize(request, 'wallet:configuration:write'),
      schema: {
        operationId: 'prepareApplicationFundingAddress',
        description:
          'Retain a stable application funding address after the provider offers fee terms or accepts application-submitted terms. Application acceptance is required before provider-offered terms permit sponsorship. Operator-only; does not contact the chain, deploy contracts, transfer funds or enable execution.',
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: { 'idempotency-key': uuidSchema },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['application_id', 'chain_id', 'profile', 'status'],
            properties: {
              application_id: { type: 'string' },
              chain_id: { type: 'string' },
              profile: { const: 'safe-only-4337-v1' },
              status: {
                type: 'string',
                enum: ['unprovisioned', 'needs-funding', 'provisioned'],
              },
              funding_address: { type: 'string' },
              paymaster: { type: 'string' },
            },
          },
          403: problemSchema,
          503: problemSchema,
        },
        security: [{ accessToken: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['applicationId'],
          properties: {
            applicationId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
        },
        body: { type: 'object', additionalProperties: false },
      },
    },
    (request) =>
      (
        selected(request).safeWallet ??
        (() => {
          throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
        })()
      ).prepareFundingAddress(
        {
          principal: principals.get(request)!,
          idempotencyKey: String(request.headers['idempotency-key'] ?? ''),
        },
        request.params.applicationId,
      ),
  );

  await registerOnboardingRoutes(
    app,
    options.onboarding,
    options.authenticate,
    isReady,
    options.resolveNetwork,
  );
  await registerWalletCallsRoutes(
    app,
    options.walletCalls,
    options.authenticate,
    isReady,
    options.resolveNetwork,
  );
  await registerRuntimeConfigurationRoutes(
    app,
    options.runtimeConfiguration,
    options.authenticate,
    options.walletCalls,
    options.safeWallet,
    options.resolveNetwork,
  );
  if (options.documentation !== false && options.documentationTokens)
    await registerDocumentationTokens(app, options.documentationTokens);
  await registerManagementRoutes(
    app,
    options.management,
    options.authenticate,
    options.ready,
    options.providerOrigin,
    options.localManagementOrigin,
    options.networkContexts?.map((context) => context.network),
    options.networkContexts
      ? async (network) =>
          (await options
            .networkContexts!.find((context) => context.network === network)
            ?.ready?.()) ?? false
      : undefined,
  );
  options.authorizationServer?.register(app);
  await app.ready();
  return app;
}
