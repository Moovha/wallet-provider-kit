import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { OwnerLogin } from '../onboarding/login.js';
import { AuthenticationError } from './auth.js';
import { apiTokenScopes } from './api-token-scopes.js';
import type { ExplorerToken } from '../deployment/explorer-tokens.js';

export interface DocumentationTokenOptions {
  origin: string;
  issuer: string;
  login: OwnerLogin;
  operators: readonly string[];
  applications: readonly {
    clientId: string;
    name: string;
    scopes: readonly string[];
  }[];
  currentConfiguration: () => Promise<boolean>;
  issue: (clientId: string, scopes: string[]) => Promise<ExplorerToken>;
}
function cookie(request: FastifyRequest, name: string) {
  const matches = (request.headers.cookie ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(name + '='));
  if (matches.length !== 1) return '';
  const value = matches[0].slice(name.length + 1);
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
export async function registerDocumentationTokens(
  app: FastifyInstance,
  options: DocumentationTokenOptions,
) {
  await app.register(async (routes) => {
    routes.addHook('onRequest', async (request) => {
      if (
        request.headers.host !== new URL(options.origin).host ||
        !(await options.currentConfiguration())
      )
        throw new AuthenticationError(403);
    });
    routes.setErrorHandler((error, request, reply) => {
      const status =
        error instanceof AuthenticationError
          ? error.status
          : typeof error === 'object' &&
              error &&
              'statusCode' in error &&
              [400, 413, 415, 429].includes(Number(error.statusCode))
            ? Number(error.statusCode)
            : 503;
      reply
        .code(status)
        .type('application/problem+json')
        .send({
          type: 'about:blank',
          title: 'Explorer authorization unavailable',
          status,
          code:
            status === 401
              ? 'operator_login_required'
              : status === 403
                ? 'operator_access_denied'
                : status === 503
                  ? 'token_issuance_failed'
                  : 'invalid_request',
          request_id: request.id,
        });
    });
    async function operator(request: FastifyRequest) {
      const session = await options.login.session(
        cookie(request, '__Host-wpk-session'),
      );
      if (
        session.identity.issuer !== options.issuer ||
        !options.operators.includes(session.identity.subject) ||
        session.identity.authenticatedAt < Date.now() - 300000 ||
        session.identity.authenticatedAt > Date.now() + 5000
      )
        throw new AuthenticationError(403);
      return session;
    }
    routes.get(
      '/docs/operator/login',
      { schema: { hide: true } },
      async (request, reply) => {
        const browser =
          cookie(request, '__Host-wpk-browser') ||
          randomBytes(32).toString('base64url');
        const url = await options.login.start('api-explorer', browser);
        setCookie(reply, '__Host-wpk-browser', browser);
        return reply.redirect(url);
      },
    );
    routes.get(
      '/docs/operator/session',
      { schema: { hide: true } },
      async (request) => {
        if (request.headers['sec-fetch-site'] === 'cross-site')
          throw new AuthenticationError(403);
        const session = await operator(request);
        return { csrf: session.csrf, applications: options.applications };
      },
    );
    routes.post<{
      Body: { client_id: string; scopes: string[]; csrf: string };
    }>(
      '/docs/operator/token',
      {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
        schema: {
          hide: true,
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['client_id', 'scopes', 'csrf'],
            properties: {
              client_id: { type: 'string', minLength: 1, maxLength: 256 },
              csrf: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
              scopes: {
                type: 'array',
                minItems: 1,
                maxItems: 7,
                uniqueItems: true,
                items: { type: 'string', enum: apiTokenScopes },
              },
            },
          },
        },
      },
      async (request) => {
        if (
          request.headers.origin !== options.origin ||
          request.headers['sec-fetch-site'] === 'cross-site'
        )
          throw new AuthenticationError(403);
        const session = await operator(request);
        if (
          session.csrf.length !== request.body.csrf.length ||
          !timingSafeEqual(
            Buffer.from(session.csrf),
            Buffer.from(request.body.csrf),
          )
        )
          throw new AuthenticationError(403);
        const entry = options.applications.find(
          (item) => item.clientId === request.body.client_id,
        );
        if (
          !entry ||
          request.body.scopes.some((scope) => !entry.scopes.includes(scope))
        )
          throw new AuthenticationError(403);
        const token = await options.issue(entry.clientId, request.body.scopes);
        // Issuance can involve network I/O. Do not deliver credentials after authority expires or changes.
        await operator(request);
        if (!(await options.currentConfiguration()))
          throw new AuthenticationError(403);
        return token;
      },
    );
    routes.post<{ Body: { csrf: string } }>(
      '/docs/operator/logout',
      {
        schema: {
          hide: true,
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['csrf'],
            properties: {
              csrf: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
            },
          },
        },
      },
      async (request, reply) => {
        if (
          request.headers.origin !== options.origin ||
          request.headers['sec-fetch-site'] === 'cross-site'
        )
          throw new AuthenticationError(403);
        const session = await operator(request);
        if (session.csrf !== request.body.csrf)
          throw new AuthenticationError(403);
        setCookie(reply, '__Host-wpk-session', '', 0);
        return { status: 'signed_out' };
      },
    );
  });
}
