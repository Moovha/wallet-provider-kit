import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalJWKSet,
  decodeJwt,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';
import {
  createIdentityVerifier,
  type IdentityConfiguration,
} from '../src/identity/oidc.js';
import {
  EnrollmentService,
  type EnrollmentAuthority,
  type EnrollmentRecord,
  type EnrollmentStatus,
} from '../src/domain/enrollment.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import {
  WalletProviderError,
  type WalletSigningProvider,
} from '../src/domain/signing.js';
import type { AuthorityContext } from '../src/domain/principal.js';
import { createServer } from '../src/service/server.js';
import { createAuthenticator } from '../src/service/auth.js';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
import { TestJournal } from './helpers/journal.js';

const config: IdentityConfiguration = {
  issuer: 'https://identity.example.test',
  clientId: 'provider-oidc-rp',
  jwksUrl: 'https://identity.example.test/jwks',
  requiredClaims: ['given_name', 'family_name', 'birthdate'],
  maxVerificationAgeSeconds: 86400,
};
const keys = await generateKeyPair('ES256');
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: 'identity-test',
  alg: 'ES256',
};
const resolver = createLocalJWKSet({ keys: [jwk] });
const unsafeJwks = new URL(config.jwksUrl);
unsafeJwks.username = 'fixture-user';
unsafeJwks.password = 'fixture-password';
const verification = () => ({
  trust_framework: 'provider-agreed-fixture',
  time: new Date().toISOString(),
  verification_process: 'opaque-check-reference',
});
const attributes = {
  given_name: 'Example',
  family_name: 'Person',
  birthdate: '1990-01-02',
};
function context(
  overrides: Partial<AuthorityContext['principal']> = {},
): AuthorityContext {
  return {
    principal: {
      issuer: 'https://api-issuer.example.test',
      subject: 'orchestrator-service',
      clientId: 'orchestrator-a',
      scopes: [
        'wallet:enroll',
        'wallet:enroll:read',
        'wallet:provision',
        'wallet:sign',
      ],
      ...overrides,
    },
    idempotencyKey: randomUUID(),
  };
}
async function proof(
  record: EnrollmentRecord,
  overrides: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: config.issuer,
    sub: record.identitySubject,
    aud: config.clientId,
    iat: now,
    exp: now + 300,
    auth_time: now,
    nonce: record.nonce,
    verified_claims: { verification: verification(), claims: attributes },
    ...overrides,
  })
    .setProtectedHeader({
      alg: 'ES256',
      typ: 'JWT',
      kid: 'identity-test',
      ...header,
    })
    .sign(keys.privateKey);
}

// Test-only transactional model. No memory implementation is exported for deployment.
function fixture() {
  const records = new Map<string, EnrollmentRecord>();
  const starts = new Map<string, string>();
  const submissions = new Map<
    string,
    { enrollmentId: string; proofHash: string }
  >();
  const submissionKey = (ctx: AuthorityContext) =>
    JSON.stringify([
      ctx.principal.issuer,
      ctx.principal.subject,
      ctx.principal.clientId,
      ctx.idempotencyKey,
    ]);
  const policy = {
    status: 'accepted' as EnrollmentStatus,
    consent: true,
    revoked: false,
    kyc: 'ID VERIFIED',
    owner: 'provider-customer-a',
  };
  const authority: EnrollmentAuthority = {
    begin: vi.fn(async (ctx, proposal) => {
      const prior = starts.get(ctx.idempotencyKey);
      if (prior) {
        const record = records.get(prior)!;
        if (record.identitySubject !== proposal.identitySubject)
          throw new WalletProviderError('wallet_attempt_conflict');
        return structuredClone(record);
      }
      const record: EnrollmentRecord = {
        ...proposal,
        status: 'awaiting_identity',
      };
      records.set(record.enrollmentId, structuredClone(record));
      starts.set(ctx.idempotencyKey, record.enrollmentId);
      return structuredClone(record);
    }),
    load: vi.fn(async (ctx, id) => {
      const submitted = submissions.get(submissionKey(ctx));
      if (submitted && submitted.enrollmentId !== id)
        throw new WalletProviderError('wallet_attempt_conflict');
      return policy.revoked ? null : structuredClone(records.get(id) ?? null);
    }),
    decide: vi.fn(async (ctx, challenge, identity) => {
      const record = records.get(challenge.enrollmentId)!;
      if (policy.revoked)
        throw new WalletProviderError('wallet_authorization_denied');
      if (record.status !== 'awaiting_identity') {
        if (record.decision?.proofHash !== identity.proofHash)
          throw new WalletProviderError('wallet_attempt_conflict');
        return structuredClone(record);
      }
      if (Date.parse(record.expiresAt) <= Date.now())
        throw new WalletProviderError('wallet_authorization_denied');
      const key = submissionKey(ctx);
      const submitted = submissions.get(key);
      if (
        submitted &&
        (submitted.enrollmentId !== record.enrollmentId ||
          submitted.proofHash !== identity.proofHash)
      )
        throw new WalletProviderError('wallet_attempt_conflict');
      submissions.set(key, {
        enrollmentId: record.enrollmentId,
        proofHash: identity.proofHash,
      });
      record.status = policy.consent ? policy.status : 'needs_verification';
      record.decision = {
        proofHash: identity.proofHash,
        identityIssuer: identity.issuer,
        identitySubject: identity.subject,
        verifiedAt: identity.verifiedAt,
        policyRevision: 'provider-policy-1',
        ...(record.status === 'accepted'
          ? {
              ownerSubject: policy.owner,
              consentReference: 'independently-verified-consent',
              acceptanceExpiresAt: new Date(Date.now() + 3600000).toISOString(),
            }
          : {}),
      };
      return structuredClone(record);
    }),
    forAccount: vi.fn(async (_ctx, id) =>
      policy.revoked || !policy.consent
        ? null
        : structuredClone(
            [...records.values()].find((record) => record.accountId === id) ??
              null,
          ),
    ),
  };
  const provider: WalletSigningProvider = {
    provider: 'offline-enrollment-test',
    createAccount: vi.fn(async (id) => ({
      accountId: id,
      address: '0x' + '1'.repeat(40),
    })),
    findAccount: vi.fn(async () => null),
    signTypedData: vi.fn(async () => 'unused'),
  };
  const wallets = new EmbeddedWalletService(
    {
      provision: async (_ctx, accountId) => ({
        accountId,
        ownerSubject: policy.owner,
        sessionSubject: policy.owner,
        currentUserStatus: policy.kyc,
        attemptId: randomUUID(),
      }),
      sign: async () => null,
    },
    provider,
  );
  const identity = createIdentityVerifier(config, resolver);
  const enrollment = new EnrollmentService(identity, authority);
  const ctx = context();
  async function begin() {
    const result = await enrollment.begin(ctx, 'provider-pairwise-user-a');
    return { result, record: records.get(result.enrollment_id)! };
  }
  return {
    records,
    policy,
    authority,
    provider,
    wallets,
    identity,
    enrollment,
    ctx,
    begin,
  };
}

describe('OIDC Identity Assurance proof validation', () => {
  it('validates RS256 signatures and ordinary ID tokens without a typ header', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const rsa = await generateKeyPair('RS256');
    const rsaJwk = {
      ...(await exportJWK(rsa.publicKey)),
      alg: 'RS256',
      kid: 'rsa-test',
    };
    const token = await new SignJWT(decodeJwt(await proof(record)))
      .setProtectedHeader({ alg: 'RS256', kid: rsaJwk.kid })
      .sign(rsa.privateKey);
    const identity = createIdentityVerifier(
      config,
      createLocalJWKSet({ keys: [rsaJwk] }),
    );
    expect((await identity.verify(token, record)).subject).toBe(
      record.identitySubject,
    );
  });
  it('passes only signed verified attributes and process metadata to provider policy', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const token = await proof(record, { name: 'Unverified top-level name' });
    const result = await f.identity.verify(token, record);
    expect(result.verifiedClaims.claims).toEqual(attributes);
    expect(JSON.stringify(result)).not.toContain('Unverified');
    expect(result.subject).toBe(record.identitySubject);
  });
  it('reuses a recent existing login while binding new token issuance to the challenge', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const authTime = Math.floor(Date.now() / 1000) - 60;
    expect(
      (
        await f.identity.verify(
          await proof(record, { auth_time: authTime }),
          record,
        )
      ).authenticatedAt,
    ).toBe(new Date(authTime * 1000).toISOString());
  });
  it.each([
    { iss: 'https://attacker.example.test' },
    { aud: 'orchestrator-oidc-rp' },
    { aud: [config.clientId, 'other-rp'] },
    { azp: 'other-rp' },
    { nonce: 'other-nonce' },
    { exp: 1 },
    { iat: 1 },
    { exp: Math.floor(Date.now() / 1000) + 3600 },
    { auth_time: 1 },
    { auth_time: Math.floor(Date.now() / 1000) + 600 },
    { auth_time: undefined },
    { verified_claims: undefined },
    { verified_claims: [] },
    { sub: '' },
    { sub: 'x'.repeat(256) },
    { sub: 'non-ascii-✓' },
  ])('rejects invalid OIDC claims %j', async (overrides) => {
    const f = fixture();
    const { record } = await f.begin();
    await expect(
      f.enrollment.complete(
        f.ctx,
        record.enrollmentId,
        await proof(record, overrides),
      ),
    ).rejects.toMatchObject({ code: 'wallet_identity_invalid' });
    expect(f.authority.decide).not.toHaveBeenCalled();
    expect(f.provider.createAccount).not.toHaveBeenCalled();
  });
  it.each([
    { typ: 'at+jwt' },
    { typ: 'provided-claims+jwt' },
    { jku: 'https://attacker.example.test/jwks' },
  ])('rejects token type/key confusion %j', async (header) => {
    const f = fixture();
    const { record } = await f.begin();
    await expect(
      f.identity.verify(await proof(record, {}, header), record),
    ).rejects.toMatchObject({ code: 'wallet_identity_invalid' });
  });
  it('rejects a correctly signed proof for a different user', async () => {
    const f = fixture();
    const { record } = await f.begin();
    await expect(
      f.enrollment.complete(
        f.ctx,
        record.enrollmentId,
        await proof(record, { sub: 'user-b' }),
      ),
    ).rejects.toMatchObject({ code: 'wallet_identity_invalid' });
    expect(f.authority.decide).not.toHaveBeenCalled();
  });
  it('rejects unsigned and incorrectly signed proofs', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const other = await generateKeyPair('ES256');
    const token = await new SignJWT({ nonce: record.nonce })
      .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
      .sign(other.privateKey);
    await expect(f.identity.verify(token, record)).rejects.toMatchObject({
      code: 'wallet_identity_invalid',
    });
    await expect(
      f.identity.verify('eyJhbGciOiJub25lIn0.e30.', record),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
  });
  it.each([
    {
      verification: { ...verification(), time: '2000-01-01T00:00:00Z' },
      claims: attributes,
    },
    {
      verification: { ...verification(), time: '2099-01-01T00:00:00Z' },
      claims: attributes,
    },
    {
      verification: { ...verification(), verification_process: '' },
      claims: attributes,
    },
    {
      verification: {
        ...verification(),
        evidence: [{ document: 'raw-document' }],
      },
      claims: attributes,
    },
    {
      verification: verification(),
      claims: { ...attributes, email: 'extra@example.test' },
    },
    {
      verification: verification(),
      claims: { ...attributes, birthdate: '1990-02-30' },
    },
    {
      verification: verification(),
      claims: { ...attributes, birthdate: '1990' },
    },
    {
      verification: verification(),
      claims: { given_name: 'Only one attribute' },
    },
    {
      verification: verification(),
      claims: { ...attributes, given_name: '\n' },
    },
  ])(
    'rejects unsupported, stale or incomplete verified claims',
    async (verified_claims) => {
      const f = fixture();
      const { record } = await f.begin();
      await expect(
        f.identity.verify(await proof(record, { verified_claims }), record),
      ).rejects.toMatchObject({ code: 'wallet_identity_invalid' });
    },
  );
  it.each([
    { issuer: 'http://identity.example.test' },
    { jwksUrl: unsafeJwks.href },
    { requiredClaims: [] },
    { maxVerificationAgeSeconds: 0 },
  ])('rejects unsafe provider configuration', (override) => {
    expect(() =>
      createIdentityVerifier({ ...config, ...override }, resolver),
    ).toThrow();
  });
});

describe('provider-owned enrollment lifecycle', () => {
  it('reserves stable IDs and a nonce on retry without creating wallets', async () => {
    const f = fixture();
    const { result } = await f.begin();
    expect(await f.enrollment.begin(f.ctx, 'provider-pairwise-user-a')).toEqual(
      result,
    );
    expect(f.records.size).toBe(1);
    expect(result.nonce).toHaveLength(43);
    await expect(f.enrollment.begin(f.ctx, 'user-b')).rejects.toMatchObject({
      code: 'wallet_attempt_conflict',
    });
    expect(f.provider.createAccount).not.toHaveBeenCalled();
  });
  it.each(['accepted', 'needs_verification', 'rejected'] as const)(
    'preserves the provider decision %s without signing or auto-provisioning',
    async (status) => {
      const f = fixture();
      f.policy.status = status;
      const { record } = await f.begin();
      const result = await f.enrollment.complete(
        f.ctx,
        record.enrollmentId,
        await proof(record),
      );
      expect(result.status).toBe(status);
      expect(f.provider.createAccount).not.toHaveBeenCalled();
      expect(f.provider.signTypedData).not.toHaveBeenCalled();
      expect(Object.keys(result).sort()).toEqual([
        'account_id',
        'enrollment_id',
        'status',
      ]);
    },
  );
  it('requires provider consent even with valid identity proof', async () => {
    const f = fixture();
    f.policy.consent = false;
    const { record } = await f.begin();
    expect(
      (
        await f.enrollment.complete(
          f.ctx,
          record.enrollmentId,
          await proof(record),
        )
      ).status,
    ).toBe('needs_verification');
    await expect(
      f.enrollment.provision(f.wallets, f.ctx, record.accountId),
    ).rejects.toThrow();
    expect(f.provider.createAccount).not.toHaveBeenCalled();
  });
  it('gates provisioning on accepted ownership and independently current local KYC', async () => {
    const f = fixture();
    const { record } = await f.begin();
    await expect(
      f.enrollment.provision(f.wallets, f.ctx, record.accountId),
    ).rejects.toThrow();
    await f.enrollment.complete(
      f.ctx,
      record.enrollmentId,
      await proof(record),
    );
    f.policy.kyc = 'PENDING';
    await expect(
      f.enrollment.provision(f.wallets, f.ctx, record.accountId),
    ).rejects.toThrow();
    expect(f.provider.createAccount).not.toHaveBeenCalled();
    f.policy.kyc = 'ID VERIFIED';
    expect(
      await f.enrollment.provision(f.wallets, f.ctx, record.accountId),
    ).toMatchObject({ accountId: record.accountId });
    await expect(f.wallets.sign(f.ctx, randomUUID())).rejects.toThrow();
    expect(f.provider.signTypedData).not.toHaveBeenCalled();
  });
  it('denies pending enrollment before reserving a wallet attempt', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const admission = vi.fn(async () => null);
    const wallets = new EmbeddedWalletService(
      { provision: admission, sign: async () => null },
      f.provider,
    );
    await expect(
      f.enrollment.provision(wallets, f.ctx, record.accountId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(admission).not.toHaveBeenCalled();
  });
  it('snapshots wallet admission across the asynchronous enrollment check', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const attemptId = randomUUID();
    const admission = {
      accountId: record.accountId,
      sessionSubject: f.policy.owner,
      ownerSubject: f.policy.owner,
      currentUserStatus: 'ID VERIFIED',
      attemptId,
    };
    const wallets = new EmbeddedWalletService(
      { provision: async () => admission, sign: async () => null },
      f.provider,
    );
    await wallets.provision(f.ctx, record.accountId, async () => {
      admission.attemptId = randomUUID();
    });
    expect(f.provider.createAccount).toHaveBeenCalledWith(
      record.accountId,
      attemptId,
    );
  });
  it.each(['needs_verification', 'rejected'] as const)(
    'denies provisioning after %s',
    async (status) => {
      const f = fixture();
      f.policy.status = status;
      const { record } = await f.begin();
      await f.enrollment.complete(
        f.ctx,
        record.enrollmentId,
        await proof(record),
      );
      await expect(
        f.enrollment.provision(f.wallets, f.ctx, record.accountId),
      ).rejects.toThrow();
      expect(f.provider.createAccount).not.toHaveBeenCalled();
    },
  );
  it('denies revoked acceptance, expired acceptance and wrong provider-owner mapping', async () => {
    const f = fixture();
    const { record } = await f.begin();
    await f.enrollment.complete(
      f.ctx,
      record.enrollmentId,
      await proof(record),
    );
    f.policy.revoked = true;
    await expect(
      f.enrollment.provision(f.wallets, f.ctx, record.accountId),
    ).rejects.toThrow();
    f.policy.revoked = false;
    record.decision!.acceptanceExpiresAt = new Date(0).toISOString();
    await expect(
      f.enrollment.provision(f.wallets, f.ctx, record.accountId),
    ).rejects.toThrow();
    record.decision!.acceptanceExpiresAt = new Date(
      Date.now() + 60000,
    ).toISOString();
    f.policy.owner = 'other-owner';
    await expect(
      f.enrollment.provision(f.wallets, f.ctx, record.accountId),
    ).rejects.toThrow();
    expect(f.provider.createAccount).not.toHaveBeenCalled();
  });
  it.each([
    { clientId: 'other-client' },
    { issuer: 'https://other.example.test' },
    { subject: 'other-caller' },
  ])('isolates callers on proof, read and provision', async (override) => {
    const f = fixture();
    const { record } = await f.begin();
    const token = await proof(record);
    const other = context(override);
    await expect(
      f.enrollment.complete(other, record.enrollmentId, token),
    ).rejects.toThrow();
    await f.enrollment.complete(f.ctx, record.enrollmentId, token);
    await expect(
      f.enrollment.read(other, record.enrollmentId),
    ).rejects.toThrow();
    await expect(
      f.enrollment.provision(f.wallets, other, record.accountId),
    ).rejects.toThrow();
    expect(f.provider.createAccount).not.toHaveBeenCalled();
  });
  it('consumes the same proof once across concurrent calls and restart; changed proof conflicts', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const token = await proof(record);
    const results = await Promise.all([
      f.enrollment.complete(f.ctx, record.enrollmentId, token),
      f.enrollment.complete(f.ctx, record.enrollmentId, token),
    ]);
    expect(results[0]).toEqual(results[1]);
    const restarted = new EnrollmentService(f.identity, f.authority);
    expect(await restarted.complete(f.ctx, record.enrollmentId, token)).toEqual(
      results[0],
    );
    await expect(
      restarted.complete(
        f.ctx,
        record.enrollmentId,
        await proof(record, { jti: randomUUID() }),
      ),
    ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
  });
  it('rejects a proof reused for another enrollment nonce', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const second = await f.enrollment.begin(context(), record.identitySubject);
    await expect(
      f.enrollment.complete(f.ctx, second.enrollment_id, await proof(record)),
    ).rejects.toMatchObject({ code: 'wallet_identity_invalid' });
  });
  it('rejects a consumed submission key reused for another enrollment', async () => {
    const f = fixture();
    const { record } = await f.begin();
    await f.enrollment.complete(
      f.ctx,
      record.enrollmentId,
      await proof(record),
    );
    const second = await f.enrollment.begin(context(), record.identitySubject);
    await expect(
      f.enrollment.complete(
        f.ctx,
        second.enrollment_id,
        await proof(f.records.get(second.enrollment_id)!),
      ),
    ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
  });
  it('recovers a lost decision response without repeating the policy decision', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const token = await proof(record);
    const decide = f.authority.decide;
    f.authority.decide = vi.fn(async (ctx, challenge, identity) => {
      await decide(ctx, challenge, identity);
      throw new Error('Example Person private-id-token');
    });
    await expect(
      f.enrollment.complete(f.ctx, record.enrollmentId, token),
    ).rejects.toMatchObject({
      code: 'wallet_enrollment_unavailable',
      outcome: 'unknown',
    });
    expect(
      (await f.enrollment.complete(f.ctx, record.enrollmentId, token)).status,
    ).toBe('accepted');
    expect(f.authority.decide).toHaveBeenCalledTimes(1);
  });
  it('recovers a lost challenge reservation response with the original IDs and nonce', async () => {
    const f = fixture();
    const begin = f.authority.begin;
    let fail = true;
    f.authority.begin = async (ctx, proposal) => {
      const record = await begin(ctx, proposal);
      if (fail) {
        fail = false;
        throw new Error('lost durable commit response');
      }
      return record;
    };
    await expect(f.begin()).rejects.toMatchObject({
      code: 'wallet_enrollment_unavailable',
      outcome: 'unknown',
    });
    const stored = [...f.records.values()][0];
    const { result } = await f.begin();
    expect(result).toMatchObject({
      enrollment_id: stored.enrollmentId,
      account_id: stored.accountId,
      nonce: stored.nonce,
    });
    expect(f.records.size).toBe(1);
  });
  it('rejects expiry during identity verification before the provider decides', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const token = await proof(record);
    const enrollment = new EnrollmentService(
      {
        ...f.identity,
        verify: async (value, challenge) => {
          const identity = await f.identity.verify(value, challenge);
          vi.spyOn(Date, 'now').mockReturnValue(
            Date.parse(record.expiresAt) + 1,
          );
          return identity;
        },
      },
      f.authority,
    );
    try {
      await expect(
        enrollment.complete(f.ctx, record.enrollmentId, token),
      ).rejects.toMatchObject({ code: 'wallet_identity_invalid' });
      expect(f.authority.decide).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
  it('denies a different user or account returned by the acceptance writer', async () => {
    const f = fixture();
    const { record } = await f.begin();
    const decide = f.authority.decide;
    f.authority.decide = async (ctx, challenge, identity) => {
      const result = await decide(ctx, challenge, identity);
      result.accountId = randomUUID();
      return result;
    };
    await expect(
      f.enrollment.complete(f.ctx, record.enrollmentId, await proof(record)),
    ).rejects.toMatchObject({ code: 'wallet_enrollment_unavailable' });
    expect(f.provider.createAccount).not.toHaveBeenCalled();
  });
  it('rechecks enrollment revocation through the wallet journal immediately before effects', async () => {
    const f = fixture();
    const { record } = await f.begin();
    await f.enrollment.complete(
      f.ctx,
      record.enrollmentId,
      await proof(record),
    );
    const journal = new TestJournal();
    const claim = journal.claim.bind(journal);
    journal.claim = async (request) => {
      const result = await claim(request);
      f.policy.revoked = true;
      return result;
    };
    const backend = createJournaledWalletProvider(f.provider, {
      namespace: 'enrollment-test',
      journal,
      authorizeAttempt: async () => !f.policy.revoked,
    });
    const wallets = new EmbeddedWalletService(
      {
        provision: async (_ctx, accountId) => ({
          accountId,
          sessionSubject: f.policy.owner,
          ownerSubject: f.policy.owner,
          currentUserStatus: 'ID VERIFIED',
          attemptId: randomUUID(),
        }),
        sign: async () => null,
      },
      backend,
    );
    await expect(
      f.enrollment.provision(wallets, f.ctx, record.accountId),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(f.provider.createAccount).not.toHaveBeenCalled();
  });
  it('fails closed on corrupt host results and sanitized storage failures', async () => {
    const f = fixture();
    const { record } = await f.begin();
    record.expiresAt = 'invalid';
    await expect(
      f.enrollment.read(f.ctx, record.enrollmentId),
    ).rejects.toMatchObject({ code: 'wallet_enrollment_unavailable' });
    f.authority.load = async () => {
      throw new Error('Example Person private-record');
    };
    await expect(f.enrollment.read(f.ctx, record.enrollmentId)).rejects.toThrow(
      'wallet_enrollment_unavailable',
    );
  });
});

const servers: Awaited<ReturnType<typeof createServer>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
describe('enrollment HTTP boundary', () => {
  async function httpFixture() {
    const f = fixture();
    const authenticate = createAuthenticator(
      {
        issuer: 'https://api-issuer.example.test',
        audience: 'provider-api',
        jwksUrl: config.jwksUrl,
      },
      resolver,
    );
    async function apiToken(scope = f.ctx.principal.scopes.join(' ')) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        iss: f.ctx.principal.issuer,
        sub: f.ctx.principal.subject,
        client_id: f.ctx.principal.clientId,
        aud: 'provider-api',
        iat: now,
        exp: now + 300,
        jti: randomUUID(),
        scope,
      })
        .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: jwk.kid })
        .sign(keys.privateKey);
    }
    const app = await createServer({
      service: f.wallets,
      enrollment: f.enrollment,
      authenticate,
      ready: async () => true,
    });
    servers.push(app);
    const headers = {
      authorization: `Bearer ${await apiToken()}`,
      'idempotency-key': f.ctx.idempotencyKey,
    };
    return { ...f, app, headers, apiToken, authenticate };
  }
  it('exposes enrollment and keeps new provisioning behind acceptance without returning PII', async () => {
    const f = await httpFixture();
    const started = await f.app.inject({
      method: 'POST',
      url: '/v1/enrollments',
      headers: f.headers,
      payload: { identity_subject: 'provider-pairwise-user-a' },
    });
    expect(started.statusCode).toBe(201);
    const result = started.json();
    expect(started.headers.location).toBe(
      `/v1/enrollments/${result.enrollment_id}`,
    );
    const record = f.records.get(result.enrollment_id)!;
    const provision = () =>
      f.app.inject({
        method: 'POST',
        url: `/v1/accounts/${record.accountId}/provision`,
        headers: f.headers,
        payload: {},
      });
    expect((await provision()).statusCode).toBe(503);
    const token = await proof(record);
    const completed = await f.app.inject({
      method: 'POST',
      url: `/v1/enrollments/${record.enrollmentId}/identity`,
      headers: f.headers,
      payload: { id_token: token },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().status).toBe('accepted');
    expect(completed.body).not.toMatch(
      /Example|Person|birthdate|nonce|proofHash|id_token/,
    );
    expect((await provision()).statusCode).toBe(503);
    const read = await f.app.inject({
      method: 'GET',
      url: `/v1/enrollments/${record.enrollmentId}`,
      headers: { authorization: f.headers.authorization },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(completed.json());
    expect(read.headers['cache-control']).toBe('no-store');
    expect(f.provider.signTypedData).not.toHaveBeenCalled();
  });
  it('denies ID tokens as API credentials, wrong scopes, and caller-written KYC fields', async () => {
    const f = await httpFixture();
    const { record } = await f.begin();
    for (const [headers, expected] of [
      [{ ...f.headers, authorization: `Bearer ${await proof(record)}` }, 401],
      [
        {
          ...f.headers,
          authorization: `Bearer ${await f.apiToken('wallet:sign')}`,
        },
        403,
      ],
    ] as const) {
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url: '/v1/enrollments',
            headers,
            payload: { identity_subject: record.identitySubject },
          })
        ).statusCode,
      ).toBe(expected);
    }
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/v1/enrollments',
          headers: f.headers,
          payload: {
            identity_subject: record.identitySubject,
            kyc_verified: true,
          },
        })
      ).statusCode,
    ).toBe(400);
    const invalid = await f.app.inject({
      method: 'POST',
      url: `/v1/enrollments/${record.enrollmentId}/identity`,
      headers: f.headers,
      payload: { id_token: await proof(record, { sub: 'other-user' }) },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.body).not.toContain('other-user');
    expect(f.authority.decide).not.toHaveBeenCalled();
  });
  it('bounds identity payloads and disables enrollment without configured storage/service', async () => {
    const f = await httpFixture();
    const { record } = await f.begin();
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/v1/enrollments/${record.enrollmentId}/identity`,
          headers: f.headers,
          payload: { id_token: 'a'.repeat(35000) },
        })
      ).statusCode,
    ).toBe(413);
    const app = await createServer({
      authenticate: f.authenticate,
      service: f.wallets,
      ready: async () => true,
    });
    servers.push(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/enrollments',
          headers: f.headers,
          payload: { identity_subject: record.identitySubject },
        })
      ).statusCode,
    ).toBe(503);
  });
  it('does not expose identity attributes or tokens when the acceptance store fails', async () => {
    const f = await httpFixture();
    const { record } = await f.begin();
    const token = await proof(record);
    f.authority.decide = async () => {
      throw new Error(`Example Person ${token}`);
    };
    const response = await f.app.inject({
      method: 'POST',
      url: `/v1/enrollments/${record.enrollmentId}/identity`,
      headers: f.headers,
      payload: { id_token: token },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: 'wallet_enrollment_unavailable',
      outcome: 'unknown',
    });
    expect(response.body).not.toContain(token);
    expect(response.body).not.toMatch(/Example|Person|birthdate/);
    expect(f.provider.createAccount).not.toHaveBeenCalled();
  });
});
