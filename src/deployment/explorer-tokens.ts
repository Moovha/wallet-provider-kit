import * as client from 'openid-client';
import { decodeJwt } from 'jose';
import {
  createAuthenticator,
  trustedHttpsUrl,
  type Authenticate,
} from '../service/auth.js';
import type { ProviderConfiguration, SecretReference } from './config.js';
import { resolveSecret } from './config.js';

export interface ExplorerTokensConfiguration {
  /** Exact subjects at the configured owner-login issuer. No reviewer access is implied. */
  operators: string[];
  clients: {
    clientId: string;
    clientSecret: SecretReference;
    scopes: string[];
  }[];
}
export interface ExplorerToken {
  access_token: string;
  expires_at: number;
  scope: string;
}
/** Secrets remain server-side. Renewing uses a fresh client-credentials grant, never a refresh token. */
export function createExplorerTokenIssuer(
  configuration: ProviderConfiguration,
  authenticate: Authenticate = createAuthenticator(configuration.oauth),
) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
    throw new Error('Unsafe token issuer environment');
  const entries = configuration.apiExplorer!.clients.map((entry) => ({
    ...structuredClone(entry),
    secret: resolveSecret(entry.clientSecret),
  }));
  const connections = new Map<string, client.Configuration>();
  const pending = new Set<string>();
  const restrictedFetch: client.CustomFetch = (url, options) =>
    fetch(url, { ...options, redirect: 'error' } as Parameters<
      typeof fetch
    >[1]);
  return async (clientId: string, scopes: string[]): Promise<ExplorerToken> => {
    const entry = entries.find((item) => item.clientId === clientId);
    if (
      !entry ||
      !scopes.length ||
      new Set(scopes).size !== scopes.length ||
      scopes.some((scope) => !entry.scopes.includes(scope))
    )
      throw new Error('token_request_denied');
    if (pending.has(clientId)) throw new Error('token_request_pending');
    pending.add(clientId);
    try {
      let connection = connections.get(clientId);
      if (!connection) {
        connection = await client.discovery(
          new URL(configuration.oauth.issuer),
          clientId,
          undefined,
          client.ClientSecretPost(entry.secret),
          { timeout: 8, [client.customFetch]: restrictedFetch },
        );
        const metadata = connection.serverMetadata();
        if (
          metadata.issuer !== configuration.oauth.issuer ||
          !metadata.token_endpoint
        )
          throw new Error();
        trustedHttpsUrl(metadata.token_endpoint);
        connections.set(clientId, connection);
      }
      const tokens = await client.clientCredentialsGrant(connection, {
        audience: configuration.oauth.audience,
        scope: scopes.join(' '),
      });
      if (
        tokens.token_type.toLowerCase() !== 'bearer' ||
        typeof tokens.access_token !== 'string' ||
        tokens.access_token.length > 8192
      )
        throw new Error();
      const principal = await authenticate(
        `Bearer ${tokens.access_token}`,
        scopes[0],
      );
      if (
        principal.clientId !== clientId ||
        principal.issuer !== configuration.oauth.issuer ||
        scopes.some((scope) => !principal.scopes.includes(scope)) ||
        principal.scopes.some((scope) => !scopes.includes(scope))
      )
        throw new Error();
      // Decode only after the normal API authenticator has checked the signature and profile.
      const expiresAt = decodeJwt(tokens.access_token).exp! * 1000;
      if (
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now() ||
        expiresAt > Date.now() + 605000
      )
        throw new Error();
      return {
        access_token: tokens.access_token,
        expires_at: expiresAt,
        scope: principal.scopes.join(' '),
      };
    } catch {
      // Do not expose IdP responses, URLs, credentials or tokens in diagnostics.
      throw new Error('token_issuance_failed');
    } finally {
      pending.delete(clientId);
    }
  };
}
