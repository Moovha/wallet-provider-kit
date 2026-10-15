import { randomBytes } from 'node:crypto';
import * as client from 'openid-client';
import { decodeProtectedHeader } from 'jose';
import { AuthenticationError, trustedHttpsUrl } from '../service/auth.js';
import { fingerprint, text } from './policy.js';
import type { OnboardingStore, OwnerIdentity } from './types.js';

export interface OwnerLoginConfiguration {
  issuer: string;
  clientId: string;
  clientSecret: string;
  idTokenAlgorithm?: 'RS256' | 'ES256';
}
export interface OwnerLogin {
  start(requestId: string, browserToken: string): Promise<string>;
  finish(
    url: URL,
    browserToken: string,
  ): Promise<{ sessionToken: string; requestId: string }>;
  session(token: string): Promise<{ identity: OwnerIdentity; csrf: string }>;
}
/** The maintained OIDC client handles protocol validation; the provider's IdP owns login and MFA. */
export async function createOwnerLogin(
  inputConfiguration: OwnerLoginConfiguration,
  origin: string,
  store: OnboardingStore,
): Promise<OwnerLogin> {
  const input = structuredClone(inputConfiguration);
  trustedHttpsUrl(input.issuer);
  trustedHttpsUrl(origin);
  if (
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
    !text(input.clientId) ||
    !text(input.clientSecret, 4096) ||
    (input.idTokenAlgorithm &&
      !['RS256', 'ES256'].includes(input.idTokenAlgorithm))
  )
    throw new Error('Invalid owner login configuration');
  const config = await client.discovery(
    new URL(input.issuer),
    input.clientId,
    {
      id_token_signed_response_alg: input.idTokenAlgorithm ?? 'RS256',
      default_max_age: 300,
    },
    client.ClientSecretPost(input.clientSecret),
  );
  const metadata = config.serverMetadata();
  client.enableNonRepudiationChecks(config);
  for (const endpoint of [
    metadata.issuer,
    metadata.authorization_endpoint,
    metadata.token_endpoint,
    metadata.jwks_uri,
  ]) {
    if (!endpoint) throw new Error('Incomplete owner login metadata');
    trustedHttpsUrl(endpoint);
  }
  const callback = origin + '/onboarding/callback';
  return {
    async start(requestId, browserToken) {
      const verifier = client.randomPKCECodeVerifier();
      const state = client.randomState();
      const nonce = client.randomNonce();
      const challenge = await client.calculatePKCECodeChallenge(verifier);
      await store.transaction((data) => {
        const now = Date.now();
        for (const [key, login] of Object.entries(data.logins))
          if (login.expiresAt <= now) delete data.logins[key];
        for (const [key, session] of Object.entries(data.sessions))
          if (session.expiresAt <= now) delete data.sessions[key];
        data.logins[fingerprint(state)] = {
          verifier,
          nonce,
          browserHash: fingerprint(browserToken),
          requestId,
          expiresAt: now + 300000,
        };
      });
      return client.buildAuthorizationUrl(config, {
        redirect_uri: callback,
        scope: 'openid',
        response_type: 'code',
        state,
        nonce,
        max_age: '300',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).href;
    },
    async finish(url, browserToken) {
      if (
        url.origin !== origin ||
        url.pathname !== '/onboarding/callback' ||
        url.searchParams.getAll('state').length !== 1
      )
        throw new AuthenticationError(401);
      const state = url.searchParams.get('state') ?? '';
      const login = await store.transaction((data) => {
        const pending = data.logins[fingerprint(state)];
        if (
          !pending ||
          pending.expiresAt <= Date.now() ||
          pending.browserHash !== fingerprint(browserToken)
        )
          throw new AuthenticationError(401);
        delete data.logins[fingerprint(state)];
        return pending;
      });
      try {
        const tokens = await client.authorizationCodeGrant(config, url, {
          pkceCodeVerifier: login.verifier,
          expectedState: state,
          expectedNonce: login.nonce,
          maxAge: 300,
          idTokenExpected: true,
        });
        const claims = tokens.claims();
        if (
          typeof tokens.id_token !== 'string' ||
          tokens.id_token.length > 16384
        )
          throw new Error();
        const header = decodeProtectedHeader(tokens.id_token);
        if (
          (header.typ && header.typ !== 'JWT') ||
          header.jku ||
          header.jwk ||
          header.x5u
        )
          throw new Error();
        if (
          !claims ||
          !text(claims.sub) ||
          typeof claims.iat !== 'number' ||
          typeof claims.exp !== 'number' ||
          claims.exp <= claims.iat ||
          claims.exp - claims.iat > 600 ||
          claims.iat * 1000 > Date.now() + 5000 ||
          claims.iat * 1000 < Date.now() - 600000 ||
          typeof claims.auth_time !== 'number' ||
          claims.auth_time * 1000 > Date.now() + 5000 ||
          claims.auth_time * 1000 < Date.now() - 300000
        )
          throw new Error();
        const sessionToken = randomBytes(32).toString('base64url');
        await store.transaction((data) => {
          data.sessions[fingerprint(sessionToken)] = {
            owner: {
              issuer: input.issuer,
              subject: claims.sub,
              authenticatedAt: claims.auth_time! * 1000,
            },
            expiresAt: Math.min(
              Date.now() + 300000,
              claims.auth_time! * 1000 + 300000,
            ),
            csrf: randomBytes(32).toString('base64url'),
          };
        });
        return { sessionToken, requestId: login.requestId };
      } catch {
        throw new AuthenticationError(401);
      }
    },
    async session(token) {
      return store.transaction((data) => {
        const session = data.sessions[fingerprint(token)];
        if (!session || session.expiresAt <= Date.now())
          throw new AuthenticationError(401);
        return { identity: session.owner, csrf: session.csrf };
      });
    },
  };
}
