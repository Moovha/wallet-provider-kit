import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { VerifiedPrincipal } from '../domain/principal.js';

export class AuthenticationError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? 'invalid_token' : 'insufficient_scope');
  }
}

export interface OAuthConfiguration {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

export type Authenticate = (
  authorization: string | undefined,
  requiredScope: string,
) => Promise<VerifiedPrincipal>;

export function trustedHttpsUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new Error('Invalid trusted HTTPS configuration');
  }
  return url;
}

/** RFC 9068 resource server; keys and issuer are operator configuration, never token input. */
export function createAuthenticator(
  configuration: OAuthConfiguration,
  keys?: JWTVerifyGetKey,
): Authenticate {
  trustedHttpsUrl(configuration.issuer);
  const jwksUrl = trustedHttpsUrl(configuration.jwksUrl);
  if (!configuration.audience.trim()) throw new Error('Missing OAuth audience');
  const resolver =
    keys ??
    createRemoteJWKSet(jwksUrl, {
      timeoutDuration: 3000,
      cooldownDuration: 30000,
      cacheMaxAge: 300000,
    });
  return async (authorization, requiredScope) => {
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(authorization ?? '');
    if (!match || match[1].length > 8192) throw new AuthenticationError(401);
    let principal: VerifiedPrincipal;
    try {
      const { payload } = await jwtVerify(match[1], resolver, {
        issuer: configuration.issuer,
        audience: configuration.audience,
        algorithms: ['RS256', 'ES256'],
        typ: 'at+jwt',
        requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'jti', 'client_id'],
        maxTokenAge: '10m',
        clockTolerance: 5,
      });
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        typeof payload.client_id !== 'string' ||
        !payload.client_id ||
        typeof payload.jti !== 'string' ||
        !payload.jti ||
        typeof payload.scope !== 'string' ||
        payload.cnf !== undefined ||
        typeof payload.exp !== 'number' ||
        typeof payload.iat !== 'number' ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > 600
      ) {
        throw new Error('Invalid access token claims');
      }
      principal = Object.freeze({
        issuer: configuration.issuer,
        subject: payload.sub,
        clientId: payload.client_id,
        scopes: Object.freeze(payload.scope.split(' ').filter(Boolean)),
      });
    } catch {
      throw new AuthenticationError(401);
    }
    if (!principal.scopes.includes(requiredScope))
      throw new AuthenticationError(403);
    return principal;
  };
}
