import { randomBytes, randomUUID } from 'node:crypto';
import type { EmbeddedWalletService } from './embedded-wallet.js';
import type { AuthorityContext, VerifiedPrincipal } from './principal.js';
import { WalletProviderError } from './signing.js';
import {
  identityProofHash,
  type IdentityVerifier,
  type VerifiedIdentity,
} from '../identity/oidc.js';

export interface EnrollmentChallenge {
  enrollmentId: string;
  accountId: string;
  nonce: string;
  createdAt: string;
  expiresAt: string;
  caller: Pick<VerifiedPrincipal, 'issuer' | 'subject' | 'clientId'>;
  identityIssuer: string;
  identityClientId: string;
  /** Claimed at enrollment start; becomes verified only after matching the issuer's ID token. */
  identitySubject: string;
}
export type EnrollmentStatus =
  'awaiting_identity' | 'accepted' | 'needs_verification' | 'rejected';
export interface EnrollmentDecision {
  proofHash: string;
  identityIssuer: string;
  identitySubject: string;
  verifiedAt: string;
  policyRevision: string;
  /** Required for acceptance; host-resolved owner, never copied from an API claim. */
  ownerSubject?: string;
  consentReference?: string;
  acceptanceExpiresAt?: string;
}
export interface EnrollmentRecord extends EnrollmentChallenge {
  status: EnrollmentStatus;
  decision?: EnrollmentDecision;
}

/** Trusted enrollment policy/persistence port; SQLite storage still requires host authorization and acceptance callbacks. */
export interface EnrollmentAuthority {
  /** Authorize current caller; atomically reserve IDs/unique nonce and bind the idempotency key. Return original record on exact retry. */
  begin(
    context: AuthorityContext,
    proposal: EnrollmentChallenge,
  ): Promise<EnrollmentRecord | null>;
  /** Current tenant/client/grant/object authorization, including completed-result reads. Reject a previously consumed submission key bound to another enrollment. */
  load(
    context: AuthorityContext,
    enrollmentId: string,
  ): Promise<EnrollmentRecord | null>;
  /** Apply provider policy and independently verified enrollment consent. Atomically consume nonce and submission idempotency key, bind issuer/subject to owner/account, persist decision and proofHash. Exact proof replay returns stored result; changed proofs conflict. Never provision/sign here. */
  decide(
    context: AuthorityContext,
    challenge: EnrollmentChallenge,
    identity: VerifiedIdentity,
  ): Promise<EnrollmentRecord>;
  /** Recheck current acceptance, consent, revocation, subject/account mapping and policy. Null denies. */
  forAccount(
    context: AuthorityContext,
    accountId: string,
  ): Promise<EnrollmentRecord | null>;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const deny = () => new WalletProviderError('wallet_authorization_denied');
const unavailable = () =>
  new WalletProviderError('wallet_enrollment_unavailable', 'unknown');
function nonempty(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
function challengeOf(record: EnrollmentChallenge): EnrollmentChallenge {
  return structuredClone({
    enrollmentId: record.enrollmentId,
    accountId: record.accountId,
    nonce: record.nonce,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    caller: record.caller,
    identityIssuer: record.identityIssuer,
    identityClientId: record.identityClientId,
    identitySubject: record.identitySubject,
  });
}
function sameChallenge(left: EnrollmentChallenge, right: EnrollmentChallenge) {
  return (
    [
      'enrollmentId',
      'accountId',
      'nonce',
      'createdAt',
      'expiresAt',
      'identityIssuer',
      'identityClientId',
      'identitySubject',
    ].every(
      (key) =>
        left[key as keyof EnrollmentChallenge] ===
        right[key as keyof EnrollmentChallenge],
    ) &&
    left.caller.issuer === right.caller.issuer &&
    left.caller.subject === right.caller.subject &&
    left.caller.clientId === right.caller.clientId
  );
}

/** Enrollment consumes identity evidence; it never creates grants, changes KYC or calls a signing backend. */
export class EnrollmentService {
  private readonly identity: IdentityVerifier;
  private readonly authority: EnrollmentAuthority;
  constructor(identity: IdentityVerifier, authority: EnrollmentAuthority) {
    this.identity = identity;
    this.authority = authority;
  }
  private context(context: AuthorityContext): AuthorityContext {
    const copy = structuredClone(context);
    if (
      !uuid.test(copy.idempotencyKey) ||
      !nonempty(copy.principal.issuer) ||
      !nonempty(copy.principal.subject) ||
      !nonempty(copy.principal.clientId)
    )
      throw new WalletProviderError('wallet_provider_input');
    return copy;
  }
  private check(
    record: EnrollmentRecord | null,
    context: AuthorityContext,
  ): EnrollmentRecord {
    if (!record) throw deny();
    const value = structuredClone(record);
    const created = Date.parse(value.createdAt);
    const expires = Date.parse(value.expiresAt);
    if (
      !uuid.test(value.enrollmentId) ||
      !uuid.test(value.accountId) ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.nonce) ||
      !Number.isFinite(created) ||
      !Number.isFinite(expires) ||
      created > Date.now() + 5000 ||
      expires <= created ||
      expires - created > 600000 ||
      value.identityIssuer !== this.identity.issuer ||
      value.identityClientId !== this.identity.clientId ||
      typeof value.identitySubject !== 'string' ||
      !/^[\x20-\x7e]{1,255}$/.test(value.identitySubject) ||
      !value.caller ||
      value.caller.issuer !== context.principal.issuer ||
      value.caller.subject !== context.principal.subject ||
      value.caller.clientId !== context.principal.clientId ||
      ![
        'awaiting_identity',
        'accepted',
        'needs_verification',
        'rejected',
      ].includes(value.status)
    )
      throw unavailable();
    if (value.status !== 'awaiting_identity') {
      const decision = value.decision;
      if (
        !decision ||
        !/^[a-f0-9]{64}$/.test(decision.proofHash) ||
        decision.identityIssuer !== this.identity.issuer ||
        decision.identitySubject !== value.identitySubject ||
        !nonempty(decision.policyRevision) ||
        !Number.isFinite(Date.parse(decision.verifiedAt))
      )
        throw unavailable();
      if (
        value.status === 'accepted' &&
        (!nonempty(decision.ownerSubject) ||
          !nonempty(decision.consentReference) ||
          !Number.isFinite(Date.parse(decision.acceptanceExpiresAt ?? '')))
      )
        throw unavailable();
    } else if (value.decision !== undefined) throw unavailable();
    return value;
  }
  private receipt(record: EnrollmentRecord) {
    return {
      enrollment_id: record.enrollmentId,
      account_id: record.accountId,
      status: record.status,
    };
  }
  private async storage<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (
        error instanceof WalletProviderError &&
        ['wallet_authorization_denied', 'wallet_attempt_conflict'].includes(
          error.code,
        )
      )
        throw error;
      throw unavailable();
    }
  }
  async begin(input: AuthorityContext, identitySubject: string) {
    const context = this.context(input);
    if (
      typeof identitySubject !== 'string' ||
      !/^[\x20-\x7e]{1,255}$/.test(identitySubject)
    )
      throw new WalletProviderError('wallet_provider_input');
    const now = Date.now();
    const proposal: EnrollmentChallenge = {
      enrollmentId: randomUUID(),
      accountId: randomUUID(),
      nonce: randomBytes(32).toString('base64url'),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 600000).toISOString(),
      caller: {
        issuer: context.principal.issuer,
        subject: context.principal.subject,
        clientId: context.principal.clientId,
      },
      identityIssuer: this.identity.issuer,
      identityClientId: this.identity.clientId,
      identitySubject,
    };
    const record = this.check(
      await this.storage(() =>
        this.authority.begin(structuredClone(context), proposal),
      ),
      context,
    );
    if (record.identitySubject !== identitySubject)
      throw new WalletProviderError('wallet_attempt_conflict');
    if (
      record.status !== 'awaiting_identity' ||
      Date.parse(record.expiresAt) <= Date.now()
    )
      throw deny();
    return {
      ...this.receipt(record),
      nonce: record.nonce,
      expires_at: record.expiresAt,
      identity_issuer: this.identity.issuer,
      identity_client_id: this.identity.clientId,
      required_claims: [...this.identity.requiredClaims],
    };
  }
  async complete(input: AuthorityContext, enrollmentId: string, token: string) {
    const context = this.context(input);
    if (!uuid.test(enrollmentId))
      throw new WalletProviderError('wallet_provider_input');
    const proofHash = identityProofHash(token);
    const record = this.check(
      await this.storage(() =>
        this.authority.load(structuredClone(context), enrollmentId),
      ),
      context,
    );
    if (record.enrollmentId !== enrollmentId) throw unavailable();
    if (record.status !== 'awaiting_identity') {
      if (record.decision?.proofHash !== proofHash)
        throw new WalletProviderError('wallet_attempt_conflict');
      return this.receipt(record);
    }
    if (Date.parse(record.expiresAt) <= Date.now())
      throw new WalletProviderError('wallet_identity_invalid');
    const challenge = challengeOf(record);
    const identity = await this.identity.verify(
      token,
      structuredClone(challenge),
    );
    if (
      identity.subject !== challenge.identitySubject ||
      identity.issuer !== challenge.identityIssuer ||
      identity.proofHash !== proofHash
    )
      throw new WalletProviderError('wallet_identity_invalid');
    if (Date.parse(challenge.expiresAt) <= Date.now())
      throw new WalletProviderError('wallet_identity_invalid');
    const decided = this.check(
      await this.storage(() =>
        this.authority.decide(
          structuredClone(context),
          structuredClone(challenge),
          structuredClone(identity),
        ),
      ),
      context,
    );
    if (
      !sameChallenge(decided, challenge) ||
      decided.status === 'awaiting_identity' ||
      decided.decision?.proofHash !== identity.proofHash ||
      decided.decision.identityIssuer !== identity.issuer ||
      decided.decision.identitySubject !== identity.subject ||
      decided.decision.verifiedAt !== identity.verifiedAt
    )
      throw unavailable();
    return this.receipt(decided);
  }
  async read(input: AuthorityContext, enrollmentId: string) {
    const context = this.context(input);
    if (!uuid.test(enrollmentId))
      throw new WalletProviderError('wallet_provider_input');
    const record = this.check(
      await this.storage(() =>
        this.authority.load(structuredClone(context), enrollmentId),
      ),
      context,
    );
    if (record.enrollmentId !== enrollmentId) throw unavailable();
    return this.receipt(record);
  }
  async provision(
    wallets: EmbeddedWalletService,
    input: AuthorityContext,
    accountId: string,
  ) {
    const context = this.context(input);
    const acceptedOwner = async () => {
      const record = this.check(
        await this.storage(() =>
          this.authority.forAccount(structuredClone(context), accountId),
        ),
        context,
      );
      const decision = record.decision;
      if (
        record.accountId !== accountId ||
        record.status !== 'accepted' ||
        !decision?.ownerSubject ||
        Date.parse(decision.acceptanceExpiresAt ?? '') <= Date.now() ||
        Date.now() - Date.parse(decision.verifiedAt) >
          this.identity.maxVerificationAgeSeconds * 1000 ||
        Date.parse(decision.verifiedAt) > Date.now() + 5000
      )
        throw deny();
      return decision.ownerSubject;
    };
    // Deny before wallet admission; then recheck after its asynchronous owner/KYC check.
    const owner = await acceptedOwner();
    return wallets.provision(context, accountId, async (ownerSubject) => {
      if (ownerSubject !== owner || (await acceptedOwner()) !== ownerSubject)
        throw deny();
    });
  }
}
