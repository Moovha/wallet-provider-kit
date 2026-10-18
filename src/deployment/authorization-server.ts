import { operatorScopes } from './authorization-contract.js';
import type {} from '@fastify/swagger';
import Provider, { errors, type Adapter } from 'oidc-provider';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { createLocalJWKSet, type JWK } from 'jose';
import type { FastifyInstance } from 'fastify';
import { createAuthenticator, AuthenticationError } from '../service/auth.js';
import {
  ConfigurationError,
  resolveSecret,
  type ProviderConfiguration,
} from './config.js';

/** Only static clients and self-contained JWTs are supported. Stateful flows fail closed. */
const statelessAdapter = (): Adapter => ({
  async find() {
    return undefined;
  },
  async findByUid() {
    return undefined;
  },
  async findByUserCode() {
    return undefined;
  },
  async upsert() {
    throw new Error('Stateful authorization is unavailable');
  },
  async consume() {
    throw new Error('Stateful authorization is unavailable');
  },
  async destroy() {
    throw new Error('Stateful authorization is unavailable');
  },
  async revokeByGrantId() {
    throw new Error('Stateful authorization is unavailable');
  },
});

export function createBundledAuthorizationServer(
  config: ProviderConfiguration,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (process.env.DEBUG)
    throw new ConfigurationError([
      '/authorizationServer: disable DEBUG logging before running the bundled issuer',
    ]);
  const settings = config.authorizationServer!;
  let key: JWK;
  let publicKey: JWK;
  try {
    key = JSON.parse(resolveSecret(settings.signingKey, environment));
    if (
      key.kty !== 'RSA' ||
      key.alg !== 'RS256' ||
      key.use !== 'sig' ||
      !key.kid ||
      !key.d
    )
      throw new Error();
    const privateKey = createPrivateKey({ key, format: 'jwk' });
    if ((privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072)
      throw new Error();
    publicKey = {
      ...createPublicKey(privateKey).export({ format: 'jwk' }),
      kid: key.kid,
      alg: 'RS256',
      use: 'sig',
    };
  } catch {
    throw new ConfigurationError([
      '/authorizationServer/signingKey: supply a retained private RSA signing JWK of at least 3072 bits with kid, alg RS256 and use sig',
    ]);
  }
  const clients = [
    ...settings.clients,
    ...(settings.operatorClients ?? []).map((entry) => ({
      ...entry,
      scopes: [...operatorScopes],
    })),
  ].map((entry) => {
    const secret = resolveSecret(entry.clientSecret, environment);
    if (Buffer.byteLength(secret) < 32)
      throw new ConfigurationError([
        '/authorizationServer/clients: client secrets must contain at least 32 bytes',
      ]);
    return { ...entry, secret };
  });
  const provider = new Provider(config.oauth.issuer, {
    adapter: statelessAdapter,
    jwks: { keys: [key] },
    clients: clients.map((entry) => ({
      client_id: entry.clientId,
      client_secret: entry.secret,
      grant_types: ['client_credentials'],
      response_types: [],
      redirect_uris: [],
      token_endpoint_auth_method: 'client_secret_post',
      scope: entry.scopes.join(' '),
    })),
    responseTypes: [],
    scopes: [...new Set(clients.flatMap((entry) => entry.scopes))],
    clientAuthMethods: ['client_secret_post'],
    features: {
      devInteractions: { enabled: false },
      clientCredentials: { enabled: true },
      userinfo: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      revocation: { enabled: false },
      introspection: { enabled: false },
      registration: { enabled: false },
      dPoP: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => config.oauth.audience,
        getResourceServerInfo: (ctx, resource) => {
          const requested = ctx.oidc.params?.scope;
          const client = clients.find(
            (entry) => entry.clientId === ctx.oidc.client?.clientId,
          );
          if (
            typeof requested !== 'string' ||
            !requested.trim() ||
            !client ||
            requested.split(' ').some((scope) => !client.scopes.includes(scope))
          )
            throw new errors.InvalidScope('Requested scope is unavailable', '');
          if (resource !== config.oauth.audience)
            throw new errors.InvalidTarget();
          return {
            scope: clients.flatMap((entry) => entry.scopes).join(' '),
            audience: config.oauth.audience,
            accessTokenFormat: 'jwt',
            accessTokenTTL: 300,
            jwt: { sign: { alg: 'RS256' } },
          };
        },
      },
    },
    ttl: { ClientCredentials: 300 },
    renderError: (ctx) => {
      ctx.type = 'application/json';
      ctx.body = { error: 'invalid_request' };
    },
  });
  // The configured HTTPS origin is authoritative; caller-supplied forwarding headers are ignored.
  provider.proxy = true;
  Object.assign(provider, { silent: true });
  const callback = provider.callback();
  const verify = createAuthenticator(
    config.oauth,
    createLocalJWKSet({ keys: [publicKey] }),
  );
  const authenticate: typeof verify = async (authorization, scope) => {
    const principal = await verify(authorization, scope);
    const entry = clients.find(
      (client) => client.clientId === principal.clientId,
    );
    if (
      !entry ||
      principal.scopes.some((value) => !entry.scopes.includes(value))
    )
      throw new AuthenticationError(401);
    return principal;
  };
  return {
    authenticate,
    register(app: FastifyInstance) {
      // onRequest runs before Fastify consumes the form stream. Other service routes retain their parsers.
      app.route({
        method: ['GET', 'POST'],
        url: '/oauth/*',
        schema: { hide: true },
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
        onRequest: async (request, reply) => {
          const path = request.raw.url?.split('?')[0];
          const allowed =
            (request.method === 'GET' &&
              [
                '/oauth/jwks',
                '/oauth/.well-known/openid-configuration',
                '/oauth/.well-known/oauth-authorization-server',
              ].includes(path ?? '')) ||
            (request.method === 'POST' && path === '/oauth/token');
          if (!allowed) return reply.code(404).send({ error: 'not_found' });
          const url = new URL(config.oauth.issuer);
          request.raw.headers.host = url.host;
          delete request.raw.headers.forwarded;
          delete request.raw.headers['x-forwarded-host'];
          request.raw.headers['x-forwarded-proto'] = 'https';
          request.raw.url = request.raw.url!.slice('/oauth'.length);
          Object.assign(request.raw, { baseUrl: '/oauth' });
          reply.raw.setHeader('cache-control', 'no-store');
          reply.raw.setHeader('x-content-type-options', 'nosniff');
          reply.raw.setHeader('referrer-policy', 'no-referrer');
          reply.hijack();
          callback(request.raw, reply.raw);
        },
        handler: async () => {},
      });
    },
  };
}
