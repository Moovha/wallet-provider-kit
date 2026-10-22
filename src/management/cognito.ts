import { randomBytes, createHash } from 'node:crypto';
import * as oidc from 'openid-client';
import { decodeProtectedHeader } from 'jose';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { VerifiedPrincipal } from '../domain/principal.js';
import { AuthenticationError, trustedHttpsUrl } from '../service/auth.js';
import type { ManagementService } from './service.js';

export interface CognitoConfiguration {
  userPoolId: string;
  clientId: string;
  domain: string;
  administratorGroup: string;
  bootstrap?: boolean;
}
type Token = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};
const cookieName = '__Host-wpk-admin-login';
const fingerprint = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function browserCookie(request: FastifyRequest) {
  const values = (request.headers.cookie ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(cookieName + '='));
  if (values.length !== 1) return '';
  const value = values[0].slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}
function setCookie(reply: FastifyReply, value: string, seconds = 600) {
  reply.header(
    'set-cookie',
    `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`,
  );
}

/** Cognito authenticates people; an explicitly configured group grants provider administration. */
export function createCognitoAdministration(
  input: CognitoConfiguration,
  origin: string,
  service: ManagementService,
  issue: (principal: VerifiedPrincipal) => Promise<Token>,
) {
  const settings = structuredClone(input);
  trustedHttpsUrl(origin);
  const match = /^([a-z]{2}(?:-[a-z0-9]+)+-\d)_([A-Za-z0-9]+)$/.exec(
    settings.userPoolId,
  );
  if (
    !match ||
    !/^[a-z0-9]{1,128}$/.test(settings.clientId) ||
    !/^[A-Za-z0-9_+=,.@-]{1,128}$/.test(settings.administratorGroup)
  )
    throw new Error('Invalid Cognito administration configuration');
  const region = match[1];
  if (
    !new RegExp(
      '^https://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.auth\\.' +
        region.replaceAll('-', '\\-') +
        '\\.amazoncognito\\.com$',
    ).test(settings.domain)
  )
    throw new Error('Use a Cognito prefix domain in the user pool Region');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || process.env.DEBUG)
    throw new Error(
      'Disable insecure TLS and debug logging before administrator sign-in',
    );
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${settings.userPoolId}`;
  const configuration = new oidc.Configuration(
    {
      issuer,
      authorization_endpoint: settings.domain + '/oauth2/authorize',
      token_endpoint: settings.domain + '/oauth2/token',
      jwks_uri: issuer + '/.well-known/jwks.json',
      response_types_supported: ['code'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['none'],
    },
    settings.clientId,
    { id_token_signed_response_alg: 'RS256' },
    oidc.None(),
  );
  oidc.enableNonRepudiationChecks(configuration);
  const callback = origin + '/admin/auth/callback';
  const pending = new Map<
    string,
    { browser: string; verifier: string; nonce: string; expires: number }
  >();
  const sessions = new Map<string, { token: Token; expires: number }>();
  const verification = new Map<
    string,
    { accessToken: string; expires: number }
  >();
  function prune() {
    for (const [key, value] of pending)
      if (value.expires <= Date.now()) pending.delete(key);
    for (const [key, value] of sessions)
      if (value.expires <= Date.now()) sessions.delete(key);
    for (const [key, value] of verification)
      if (value.expires <= Date.now()) verification.delete(key);
  }
  function sameOrigin(request: FastifyRequest) {
    if (
      request.headers.origin !== origin ||
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      throw new AuthenticationError(403);
  }
  async function verifyEmail(
    request: FastifyRequest,
    operation: 'GetUserAttributeVerificationCode' | 'VerifyUserAttribute',
    code?: string,
  ) {
    sameOrigin(request);
    prune();
    const key = fingerprint(browserCookie(request)),
      session = verification.get(key);
    if (!session) throw new AuthenticationError(401);
    const response = await fetch(
      `https://cognito-idp.${region}.amazonaws.com/`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
        headers: {
          'content-type': 'application/x-amz-json-1.1',
          'x-amz-target': 'AWSCognitoIdentityProviderService.' + operation,
        },
        body: JSON.stringify({
          AccessToken: session.accessToken,
          AttributeName: 'email',
          ...(code ? { Code: code } : {}),
        }),
      },
    );
    await response.body?.cancel();
    if (!response.ok) throw new AuthenticationError(401);
    if (operation === 'VerifyUserAttribute') verification.delete(key);
  }
  return {
    register(app: FastifyInstance) {
      const options = {
        schema: { hide: true },
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      };
      app.get('/admin/auth/options', options, async (request, reply) => {
        prune();
        reply.header('cache-control', 'no-store');
        return {
          cognito: true,
          sessionAvailable: sessions.has(fingerprint(browserCookie(request))),
          verifyEmail: verification.has(fingerprint(browserCookie(request))),
        };
      });
      app.get('/admin/auth/start', options, async (_request, reply) => {
        prune();
        if (pending.size + sessions.size + verification.size >= 256)
          throw Object.assign(new Error('Sign-in temporarily unavailable'), {
            statusCode: 503,
          });
        const browser = randomBytes(32).toString('base64url');
        const state = oidc.randomState(),
          nonce = oidc.randomNonce(),
          verifier = oidc.randomPKCECodeVerifier();
        pending.set(fingerprint(state), {
          browser: fingerprint(browser),
          verifier,
          nonce,
          expires: Date.now() + 600000,
        });
        setCookie(reply, browser);
        reply
          .header('cache-control', 'no-store')
          .header('referrer-policy', 'no-referrer');
        return reply.redirect(
          oidc.buildAuthorizationUrl(configuration, {
            redirect_uri: callback,
            scope: 'openid email aws.cognito.signin.user.admin',
            response_type: 'code',
            state,
            nonce,
            prompt: 'login',
            max_age: '300',
            code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
            code_challenge_method: 'S256',
          }).href,
        );
      });
      app.get('/admin/auth/callback', options, async (request, reply) => {
        reply
          .header('cache-control', 'no-store')
          .header('referrer-policy', 'no-referrer');
        const url = new URL(request.url, origin);
        const state = url.searchParams.get('state') ?? '';
        const key = fingerprint(state),
          login = pending.get(key);
        pending.delete(key);
        const browser = browserCookie(request);
        let failureStage = 'browser_binding';
        try {
          if (
            url.searchParams.getAll('state').length !== 1 ||
            !login ||
            login.expires <= Date.now() ||
            !browser ||
            login.browser !== fingerprint(browser)
          )
            throw new AuthenticationError(401);
          failureStage = 'code_exchange';
          const tokens = await oidc.authorizationCodeGrant(configuration, url, {
            pkceCodeVerifier: login.verifier,
            expectedState: state,
            expectedNonce: login.nonce,
            idTokenExpected: true,
            maxAge: 300,
          });
          const claims = tokens.claims();
          failureStage = 'identity_checks';
          if (
            typeof tokens.id_token !== 'string' ||
            tokens.id_token.length > 16384
          )
            throw new AuthenticationError(401);
          const header = decodeProtectedHeader(tokens.id_token);
          if (
            (header.typ && header.typ !== 'JWT') ||
            header.jku ||
            header.jwk ||
            header.x5u ||
            !claims ||
            claims.token_use !== 'id' ||
            typeof claims.sub !== 'string' ||
            !claims.sub ||
            claims.sub.length > 256 ||
            !Array.isArray(claims['cognito:groups']) ||
            !claims['cognito:groups'].includes(settings.administratorGroup) ||
            typeof claims.iat !== 'number' ||
            typeof claims.exp !== 'number' ||
            claims.exp <= claims.iat ||
            claims.exp - claims.iat > 600 ||
            claims.iat * 1000 < Date.now() - 600000 ||
            claims.iat * 1000 > Date.now() + 5000
          )
            throw new AuthenticationError(401);
          if (claims.email_verified !== true) {
            // Scope metadata is optional in token responses; Cognito checks the access token on its profile API.
            if (
              typeof tokens.access_token !== 'string' ||
              !tokens.access_token ||
              tokens.access_token.length > 16384
            )
              throw new AuthenticationError(401);
            const session = randomBytes(32).toString('base64url');
            verification.set(fingerprint(session), {
              accessToken: tokens.access_token,
              expires: Date.now() + 300000,
            });
            setCookie(reply, session, 300);
            return reply.redirect('/admin/');
          }
          failureStage = 'administrator_authorization';
          const principal = await service.federatedAdministrator(
            issuer,
            claims.sub,
            settings.bootstrap === true,
          );
          const session = randomBytes(32).toString('base64url');
          sessions.set(fingerprint(session), {
            token: await issue(principal),
            expires: Date.now() + 60000,
          });
          setCookie(reply, session, 60);
          return reply.redirect('/admin/');
        } catch {
          // Log only a fixed stage, never protocol error objects or authentication material.
          process.stderr.write(
            JSON.stringify({
              event: 'administrator_signin_rejected',
              stage: failureStage,
            }) + '\n',
          );
          setCookie(reply, '', 0);
          return reply.redirect('/admin/?signin=failed');
        }
      });
      app.post(
        '/admin/auth/email/send',
        { ...options, bodyLimit: 64 },
        async (request, reply) => {
          await verifyEmail(request, 'GetUserAttributeVerificationCode');
          reply.header('cache-control', 'no-store');
          return { sent: true };
        },
      );
      app.post<{ Body: { code: string } }>(
        '/admin/auth/email/verify',
        {
          ...options,
          bodyLimit: 128,
          schema: {
            hide: true,
            body: {
              type: 'object',
              additionalProperties: false,
              required: ['code'],
              properties: { code: { type: 'string', pattern: '^[0-9]{6}$' } },
            },
          },
        },
        async (request, reply) => {
          await verifyEmail(request, 'VerifyUserAttribute', request.body.code);
          setCookie(reply, '', 0);
          reply.header('cache-control', 'no-store');
          return { url: '/admin/auth/start' };
        },
      );
      app.post(
        '/admin/auth/session',
        { ...options, bodyLimit: 64 },
        async (request, reply) => {
          reply.header('cache-control', 'no-store');
          if (
            request.headers.origin !== origin ||
            request.headers['sec-fetch-site'] === 'cross-site'
          )
            throw new AuthenticationError(403);
          prune();
          const key = fingerprint(browserCookie(request)),
            session = sessions.get(key);
          sessions.delete(key);
          setCookie(reply, '', 0);
          if (!session) throw new AuthenticationError(401);
          return session.token;
        },
      );
      app.post(
        '/admin/auth/logout',
        { ...options, bodyLimit: 64 },
        async (request, reply) => {
          if (
            request.headers.origin !== origin ||
            request.headers['sec-fetch-site'] === 'cross-site'
          )
            throw new AuthenticationError(403);
          sessions.delete(fingerprint(browserCookie(request)));
          setCookie(reply, '', 0);
          reply.header('cache-control', 'no-store');
          const url = new URL(settings.domain + '/logout');
          url.search = new URLSearchParams({
            client_id: settings.clientId,
            logout_uri: origin + '/admin/',
          }).toString();
          return { url: url.href };
        },
      );
      app.addHook('onClose', async () => {
        pending.clear();
        sessions.clear();
        verification.clear();
      });
    },
  };
}
