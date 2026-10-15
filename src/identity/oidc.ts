import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { trustedHttpsUrl } from '../service/auth.js';
import { WalletProviderError } from '../domain/signing.js';

const attributeNames = [
  'name',
  'given_name',
  'family_name',
  'middle_name',
  'birthdate',
  'phone_number',
] as const;
export type IdentityAttribute = (typeof attributeNames)[number];
export interface IdentityConfiguration {
  issuer: string;
  /** Provider's registered OIDC RP client; separate from the API OAuth audience. */
  clientId: string;
  jwksUrl: string;
  requiredClaims: readonly IdentityAttribute[];
  /** Provider-selected freshness, not a universal KYC lifetime. */
  maxVerificationAgeSeconds: number;
}
export interface IdentityChallenge {
  nonce: string;
  createdAt: string;
}
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  proofHash: string;
  verifiedAt: string;
  authenticatedAt: string;
  verifiedClaims: {
    verification: {
      trust_framework: string;
      time: string;
      verification_process: string;
      assurance_level?: string;
    };
    claims: Partial<Record<IdentityAttribute, string>>;
  };
}
export interface IdentityVerifier {
  readonly issuer: string;
  readonly clientId: string;
  readonly requiredClaims: readonly IdentityAttribute[];
  readonly maxVerificationAgeSeconds: number;
  verify(
    token: string,
    challenge: IdentityChallenge,
  ): Promise<VerifiedIdentity>;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
export function identityProofHash(token: string): string {
  if (
    typeof token !== 'string' ||
    token.length > 32768 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  )
    throw new WalletProviderError('wallet_provider_input');
  return createHash('sha256').update(token).digest('hex');
}

/** Narrow OIDC Core / Identity Assurance profile; no token-driven discovery or evidence fetching. */
export function createIdentityVerifier(
  configuration: IdentityConfiguration,
  keys?: JWTVerifyGetKey,
): IdentityVerifier {
  const config = structuredClone(configuration);
  try {
    trustedHttpsUrl(config.issuer);
    trustedHttpsUrl(config.jwksUrl);
    if (
      !text(config.clientId) ||
      !Array.isArray(config.requiredClaims) ||
      config.requiredClaims.length === 0 ||
      new Set(config.requiredClaims).size !== config.requiredClaims.length ||
      config.requiredClaims.some((claim) => !attributeNames.includes(claim)) ||
      !Number.isSafeInteger(config.maxVerificationAgeSeconds) ||
      config.maxVerificationAgeSeconds <= 0
    )
      throw new Error();
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
  const resolver =
    keys ??
    createRemoteJWKSet(new URL(config.jwksUrl), {
      timeoutDuration: 3000,
      cooldownDuration: 30000,
      cacheMaxAge: 300000,
    });
  return Object.freeze({
    issuer: config.issuer,
    clientId: config.clientId,
    requiredClaims: Object.freeze([...config.requiredClaims]),
    maxVerificationAgeSeconds: config.maxVerificationAgeSeconds,
    async verify(token: string, challenge: IdentityChallenge) {
      const proofHash = identityProofHash(token);
      const expected = structuredClone(challenge);
      try {
        const { payload, protectedHeader } = await jwtVerify(token, resolver, {
          issuer: config.issuer,
          audience: config.clientId,
          algorithms: ['RS256', 'ES256'],
          requiredClaims: [
            'iss',
            'sub',
            'aud',
            'iat',
            'exp',
            'nonce',
            'auth_time',
            'verified_claims',
          ],
          maxTokenAge: '10m',
          clockTolerance: 5,
        });
        const now = Math.floor(Date.now() / 1000);
        const created = Date.parse(expected.createdAt) / 1000;
        if (
          (protectedHeader.typ !== undefined &&
            protectedHeader.typ !== 'JWT') ||
          protectedHeader.jku ||
          protectedHeader.jwk ||
          protectedHeader.x5u ||
          payload.aud !== config.clientId ||
          (payload.azp !== undefined && payload.azp !== config.clientId) ||
          typeof payload.sub !== 'string' ||
          !/^[\x20-\x7e]{1,255}$/.test(payload.sub) ||
          payload.nonce !== expected.nonce ||
          !/^[A-Za-z0-9_-]{43}$/.test(expected.nonce) ||
          !Number.isFinite(created) ||
          !Number.isSafeInteger(payload.iat) ||
          !Number.isSafeInteger(payload.exp) ||
          payload.exp! <= payload.iat! ||
          payload.exp! - payload.iat! > 600 ||
          payload.iat! < created - 5 ||
          !Number.isSafeInteger(payload.auth_time) ||
          (payload.auth_time as number) < now - 300 ||
          (payload.auth_time as number) > payload.iat! + 5 ||
          (payload.auth_time as number) > now + 5
        )
          throw new Error();
        const verified = payload.verified_claims;
        if (
          !object(verified) ||
          Object.keys(verified).some(
            (key) => !['verification', 'claims'].includes(key),
          ) ||
          !object(verified.verification) ||
          !object(verified.claims)
        )
          throw new Error();
        const verification = verified.verification;
        // This profile uses an opaque verification-process reference, not raw identity documents.
        if (
          Object.keys(verification).some(
            (key) =>
              ![
                'trust_framework',
                'time',
                'verification_process',
                'assurance_level',
              ].includes(key),
          ) ||
          !text(verification.trust_framework) ||
          !text(verification.verification_process) ||
          (verification.assurance_level !== undefined &&
            !text(verification.assurance_level)) ||
          typeof verification.time !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
            verification.time,
          )
        )
          throw new Error();
        const verifiedTime = Date.parse(verification.time) / 1000;
        if (
          !Number.isFinite(verifiedTime) ||
          verifiedTime > now + 5 ||
          new Date(verification.time.slice(0, 10))
            .toISOString()
            .slice(0, 10) !== verification.time.slice(0, 10) ||
          now - verifiedTime > config.maxVerificationAgeSeconds
        )
          throw new Error();
        const claims = verified.claims;
        if (
          Object.keys(claims).some(
            (key) => !config.requiredClaims.includes(key as IdentityAttribute),
          ) ||
          config.requiredClaims.some((key) => !text(claims[key]))
        )
          throw new Error();
        if (
          claims.birthdate !== undefined &&
          (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(claims.birthdate as string) ||
            new Date(claims.birthdate as string).toISOString().slice(0, 10) !==
              claims.birthdate ||
            Date.parse(claims.birthdate as string) > Date.now())
        )
          throw new Error();
        return {
          issuer: config.issuer,
          subject: payload.sub,
          proofHash,
          verifiedAt: verification.time,
          authenticatedAt: new Date(
            (payload.auth_time as number) * 1000,
          ).toISOString(),
          verifiedClaims: structuredClone(
            verified,
          ) as unknown as VerifiedIdentity['verifiedClaims'],
        };
      } catch {
        // jose and key-resolver errors may contain token or remote-response material.
        throw new WalletProviderError('wallet_identity_invalid');
      }
    },
  });
}
