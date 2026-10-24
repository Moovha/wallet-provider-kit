import { createPrivateKey, createPublicKey, randomUUID } from 'node:crypto';
import {
  createLocalJWKSet,
  decodeJwt,
  importJWK,
  SignJWT,
  type JWK,
} from 'jose';
import type { FastifyInstance } from 'fastify';
import { WalletProviderError } from '../domain/signing.js';
import { AuthenticationError, createAuthenticator } from '../service/auth.js';
import {
  ConfigurationError,
  resolveSecret,
  type ProviderConfiguration,
} from '../deployment/config.js';
import { managementScopes, ManagementService } from './service.js';
import { applicationScopes } from '../deployment/authorization-contract.js';
import { createCognitoAdministration } from './cognito.js';
import type { VerifiedPrincipal } from '../domain/principal.js';

/** Local credentials and optional Cognito sign-in use the current durable registrations. */
export async function createManagementAuthorizationServer(
  config: ProviderConfiguration,
  service: ManagementService,
) {
  if (process.env.DEBUG)
    throw new ConfigurationError([
      '/authorizationServer: disable DEBUG logging before running the bundled issuer',
    ]);
  let key: JWK, publicKey: JWK;
  try {
    key = JSON.parse(resolveSecret(config.authorizationServer!.signingKey));
    const privateKey = createPrivateKey({ key, format: 'jwk' });
    if (
      key.kty !== 'RSA' ||
      key.alg !== 'RS256' ||
      key.use !== 'sig' ||
      !key.kid ||
      !key.d ||
      (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
    )
      throw new Error();
    publicKey = {
      ...createPublicKey(privateKey).export({ format: 'jwk' }),
      kid: key.kid,
      alg: 'RS256',
      use: 'sig',
    };
  } catch {
    throw new ConfigurationError([
      '/authorizationServer/signingKey: invalid retained issuer key',
    ]);
  }
  const signingKey = await importJWK(key, 'RS256');
  const verify = createAuthenticator(
    config.oauth,
    createLocalJWKSet({ keys: [publicKey] }),
    1800,
  );
  const authenticate: typeof verify = async (authorization, scope) => {
    const principal = await verify(authorization, scope);
    const payload = decodeJwt(authorization!.slice(7));
    if (!Number.isSafeInteger(payload.credential_revision))
      throw new AuthenticationError(401);
    const current = {
      ...principal,
      credentialRevision: payload.credential_revision as number,
    };
    try {
      service.currentPrincipal(current);
      if (payload.exp! - payload.iat! > service.tokenLifetimeSeconds(current))
        throw new AuthenticationError(401);
    } catch {
      throw new AuthenticationError(401);
    }
    return current;
  };
  const issue = async (principal: VerifiedPrincipal) => {
    const lifetime = service.tokenLifetimeSeconds(principal);
    const access_token = await new SignJWT({
      client_id: principal.clientId,
      scope: principal.scopes.join(' '),
      credential_revision: principal.credentialRevision,
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: key.kid })
      .setIssuer(config.oauth.issuer)
      .setAudience(config.oauth.audience)
      .setSubject(principal.subject)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + lifetime)
      .setJti(randomUUID())
      .sign(signingKey);
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: lifetime,
      scope: principal.scopes.join(' '),
    };
  };
  const token = async (id: string, secret: string, scope: string) => {
    let principal;
    try {
      principal = await service.verifyCredentials(
        id,
        secret,
        scope.split(' ').filter(Boolean),
      );
    } catch (error) {
      if (
        error instanceof WalletProviderError &&
        error.code === 'wallet_provider_input'
      )
        throw error;
      throw new AuthenticationError(401);
    }
    return issue(principal);
  };
  const cognito = config.management?.cognito
    ? createCognitoAdministration(
        config.management.cognito,
        config.policy.provider.origin,
        service,
        issue,
      )
    : undefined;
  return {
    authenticate,
    register(app: FastifyInstance) {
      if (cognito) cognito.register(app);
      else
        app.get(
          '/admin/auth/options',
          { schema: { hide: true } },
          async () => ({ cognito: false }),
        );
      app.get('/oauth/jwks', { schema: { hide: true } }, async () => ({
        keys: [publicKey],
      }));
      for (const path of [
        '/oauth/.well-known/openid-configuration',
        '/oauth/.well-known/oauth-authorization-server',
      ])
        app.get(path, { schema: { hide: true } }, async () => ({
          issuer: config.oauth.issuer,
          token_endpoint: config.oauth.issuer + '/token',
          jwks_uri: config.oauth.jwksUrl,
          grant_types_supported: ['client_credentials'],
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          scopes_supported: [
            ...new Set([...applicationScopes, ...managementScopes]),
          ],
          response_types_supported: [],
        }));
      app.register(async (issuer) => {
        issuer.setErrorHandler((error, _request, reply) => {
          const status =
            error instanceof AuthenticationError
              ? 401
              : (error as { statusCode?: number }).statusCode === 429
                ? 429
                : 400;
          const code =
            error instanceof AuthenticationError
              ? 'invalid_client'
              : error instanceof WalletProviderError &&
                  error.code === 'wallet_provider_input'
                ? 'invalid_scope'
                : status === 429
                  ? 'temporarily_unavailable'
                  : 'invalid_request';
          return reply.code(status).send({ error: code });
        });
        issuer.addContentTypeParser(
          'application/x-www-form-urlencoded',
          { parseAs: 'string' },
          (_request, body, done) => {
            const params = new URLSearchParams(String(body));
            if (
              [...new Set(params.keys())].some(
                (name) => params.getAll(name).length !== 1,
              )
            )
              return done(new Error('Invalid token request'));
            done(null, Object.fromEntries(params));
          },
        );
        issuer.post<{
          Body: {
            grant_type: string;
            client_id: string;
            client_secret: string;
            scope: string;
            resource?: string;
            audience?: string;
          };
        }>(
          '/oauth/token',
          {
            bodyLimit: 4096,
            config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
            schema: {
              hide: true,
              body: {
                type: 'object',
                additionalProperties: false,
                required: ['grant_type', 'client_id', 'client_secret', 'scope'],
                properties: {
                  grant_type: { const: 'client_credentials' },
                  client_id: { type: 'string', minLength: 1, maxLength: 256 },
                  client_secret: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 256,
                  },
                  scope: { type: 'string', minLength: 1, maxLength: 2048 },
                  resource: { const: config.oauth.audience },
                  audience: { const: config.oauth.audience },
                },
              },
            },
          },
          async (request) =>
            token(
              request.body.client_id,
              request.body.client_secret,
              request.body.scope,
            ),
        );
      });
    },
  };
}
