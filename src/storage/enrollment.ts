import type {
  EnrollmentAuthority,
  EnrollmentChallenge,
  EnrollmentDecision,
  EnrollmentRecord,
} from '../domain/enrollment.js';
import type { AuthorityContext } from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import type { VerifiedIdentity } from '../identity/oidc.js';
import { fingerprint, text, uuid } from '../onboarding/policy.js';
import { StorageConnection, unavailable } from './connection.js';

export interface DatabaseEnrollmentOptions {
  /** Fresh caller, current consent, object and policy checks. No provider effects. */
  authorize(
    context: AuthorityContext,
    record: EnrollmentRecord,
    purpose: 'begin' | 'read' | 'decide' | 'provision',
  ): Promise<boolean>;
  /** Host acceptance policy, independent of vendor approval. Raw verified claims are never persisted. */
  decide(
    context: AuthorityContext,
    challenge: EnrollmentChallenge,
    identity: VerifiedIdentity,
  ): Promise<{
    status: Exclude<EnrollmentRecord['status'], 'awaiting_identity'>;
    decision: EnrollmentDecision;
  }>;
}

export function sqliteEnrollmentAuthority(
  connection: StorageConnection,
  options: DatabaseEnrollmentOptions,
): EnrollmentAuthority {
  if (
    !options ||
    typeof options.authorize !== 'function' ||
    typeof options.decide !== 'function'
  )
    throw new WalletProviderError('wallet_provider_configuration');
  const { authorize, decide } = options;
  function callerKey(context: AuthorityContext) {
    if (!uuid.test(context.idempotencyKey))
      throw new WalletProviderError('wallet_provider_input');
    return fingerprint([
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
    ]);
  }
  function load(id: string): EnrollmentRecord | null {
    const row = connection.get(
      'SELECT record,revoked FROM enrollments WHERE id=?',
      id,
    );
    return row && row.revoked === 0 ? JSON.parse(String(row.record)) : null;
  }
  async function permitted(
    context: AuthorityContext,
    record: EnrollmentRecord,
    purpose: Parameters<DatabaseEnrollmentOptions['authorize']>[2],
  ) {
    if (
      fingerprint([
        context.principal.issuer,
        context.principal.subject,
        context.principal.clientId,
      ]) !==
      fingerprint([
        record.caller.issuer,
        record.caller.subject,
        record.caller.clientId,
      ])
    )
      return false;
    try {
      return (
        (await authorize(
          structuredClone(context),
          structuredClone(record),
          purpose,
        )) === true
      );
    } catch {
      return unavailable();
    }
  }
  function bindKey(
    context: AuthorityContext,
    purpose: 'begin' | 'submit',
    record: EnrollmentRecord,
    hash: string,
  ) {
    const caller = callerKey(context);
    const previous = connection.get(
      'SELECT enrollment_id,fingerprint FROM enrollment_keys WHERE caller_key=? AND purpose=? AND idempotency_key=?',
      caller,
      purpose,
      context.idempotencyKey,
    );
    if (
      previous &&
      (previous.enrollment_id !== record.enrollmentId ||
        previous.fingerprint !== hash)
    )
      throw new WalletProviderError('wallet_attempt_conflict');
    connection.run(
      'INSERT INTO enrollment_keys(caller_key,purpose,idempotency_key,enrollment_id,fingerprint) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING',
      caller,
      purpose,
      context.idempotencyKey,
      record.enrollmentId,
      hash,
    );
  }
  return {
    async begin(input, inputProposal) {
      const context = structuredClone(input);
      const proposal = structuredClone(inputProposal);
      callerKey(context);
      if (
        !uuid.test(proposal.enrollmentId) ||
        !uuid.test(proposal.accountId) ||
        !text(proposal.nonce) ||
        ![
          proposal.identityIssuer,
          proposal.identityClientId,
          proposal.identitySubject,
        ].every((v) => text(v)) ||
        !Number.isFinite(Date.parse(proposal.createdAt)) ||
        Date.parse(proposal.expiresAt) <= Date.now()
      )
        throw new WalletProviderError('wallet_provider_input');
      const record: EnrollmentRecord = {
        ...proposal,
        status: 'awaiting_identity',
      };
      if (!(await permitted(context, record, 'begin'))) return null;
      return connection.transaction(() => {
        const hash = fingerprint([
          proposal.identityIssuer,
          proposal.identityClientId,
          proposal.identitySubject,
        ]);
        const previous = connection.get(
          "SELECT enrollment_id,fingerprint FROM enrollment_keys WHERE caller_key=? AND purpose='begin' AND idempotency_key=?",
          callerKey(context),
          context.idempotencyKey,
        );
        if (previous) {
          if (previous.fingerprint !== hash)
            throw new WalletProviderError('wallet_attempt_conflict');
          return load(String(previous.enrollment_id));
        }
        connection.run(
          'INSERT INTO enrollments(id,account_id,nonce,record) VALUES(?,?,?,?)',
          record.enrollmentId,
          record.accountId,
          record.nonce,
          JSON.stringify(record),
        );
        bindKey(context, 'begin', record, hash);
        connection.audit('enrollment_started', record.enrollmentId);
        return record;
      });
    },
    async load(input, id) {
      const context = structuredClone(input);
      callerKey(context);
      const record = load(id);
      if (!record || !(await permitted(context, record, 'read'))) return null;
      return connection.transaction(() => {
        const latest = load(id);
        if (!latest || fingerprint(latest) !== fingerprint(record)) return null;
        bindKey(context, 'submit', latest, fingerprint(id));
        return latest;
      });
    },
    async decide(input, inputChallenge, inputIdentity) {
      const context = structuredClone(input);
      const challenge = structuredClone(inputChallenge);
      const identity = structuredClone(inputIdentity);
      callerKey(context);
      const record = load(challenge.enrollmentId);
      if (
        !record ||
        fingerprint({
          ...record,
          status: 'awaiting_identity',
          decision: undefined,
        }) !== fingerprint({ ...challenge, status: 'awaiting_identity' }) ||
        !(await permitted(context, record, 'decide'))
      )
        throw new WalletProviderError('wallet_authorization_denied');
      if (record.decision) {
        if (record.decision.proofHash !== identity.proofHash)
          throw new WalletProviderError('wallet_attempt_conflict');
        return connection.transaction(() => {
          const latest = load(record.enrollmentId);
          if (!latest || fingerprint(latest) !== fingerprint(record))
            unavailable();
          bindKey(context, 'submit', latest, fingerprint(latest.enrollmentId));
          return latest;
        });
      }
      if (
        Date.parse(record.expiresAt) <= Date.now() ||
        identity.issuer !== record.identityIssuer ||
        identity.subject !== record.identitySubject ||
        !/^[a-f0-9]{64}$/.test(identity.proofHash)
      )
        throw new WalletProviderError('wallet_authorization_denied');
      let outcome: Awaited<ReturnType<DatabaseEnrollmentOptions['decide']>>;
      try {
        outcome = await decide(
          structuredClone(context),
          structuredClone(challenge),
          structuredClone(identity),
        );
      } catch {
        return unavailable();
      }
      const decision = outcome.decision;
      if (
        !['accepted', 'needs_verification', 'rejected'].includes(
          outcome.status,
        ) ||
        !decision ||
        decision.proofHash !== identity.proofHash ||
        decision.identityIssuer !== identity.issuer ||
        decision.identitySubject !== identity.subject ||
        decision.verifiedAt !== identity.verifiedAt ||
        !Number.isFinite(Date.parse(decision.verifiedAt)) ||
        !text(decision.policyRevision) ||
        (outcome.status === 'accepted' &&
          (!text(decision.ownerSubject) ||
            !text(decision.consentReference) ||
            !(Date.parse(decision.acceptanceExpiresAt ?? '') > Date.now())))
      )
        unavailable();
      // Only allowlisted decision references survive; verified claims, tokens and documents do not.
      const persisted: EnrollmentDecision = {
        proofHash: decision.proofHash,
        identityIssuer: decision.identityIssuer,
        identitySubject: decision.identitySubject,
        verifiedAt: decision.verifiedAt,
        policyRevision: decision.policyRevision,
        ...(decision.ownerSubject
          ? { ownerSubject: decision.ownerSubject }
          : {}),
        ...(decision.consentReference
          ? { consentReference: decision.consentReference }
          : {}),
        ...(decision.acceptanceExpiresAt
          ? { acceptanceExpiresAt: decision.acceptanceExpiresAt }
          : {}),
      };
      if (!(await permitted(context, record, 'decide')))
        throw new WalletProviderError('wallet_authorization_denied');
      return connection.transaction(() => {
        const latest = load(record.enrollmentId);
        if (
          !latest ||
          fingerprint(latest) !== fingerprint(record) ||
          Date.parse(latest.expiresAt) <= Date.now()
        )
          unavailable();
        bindKey(context, 'submit', latest, fingerprint(latest.enrollmentId));
        if (outcome.status === 'accepted') {
          const identityKey = fingerprint([
            persisted.identityIssuer,
            persisted.identitySubject,
          ]);
          const previous = connection.get(
            'SELECT account_id,owner_subject FROM enrollment_owners WHERE identity_key=?',
            identityKey,
          );
          if (
            previous &&
            (previous.account_id !== latest.accountId ||
              previous.owner_subject !== persisted.ownerSubject)
          )
            throw new WalletProviderError('wallet_attempt_conflict');
          connection.run(
            'INSERT INTO enrollment_owners(identity_key,account_id,owner_subject) VALUES(?,?,?) ON CONFLICT DO NOTHING',
            identityKey,
            latest.accountId,
            persisted.ownerSubject!,
          );
        }
        const result = {
          ...latest,
          status: outcome.status,
          decision: persisted,
        };
        connection.run(
          'UPDATE enrollments SET record=? WHERE id=?',
          JSON.stringify(result),
          latest.enrollmentId,
        );
        connection.audit('enrollment_' + outcome.status, latest.enrollmentId);
        return result;
      });
    },
    async forAccount(input, accountId) {
      const context = structuredClone(input);
      callerKey(context);
      const row = connection.get(
        'SELECT id FROM enrollments WHERE account_id=?',
        accountId,
      );
      const record = row ? load(String(row.id)) : null;
      if (
        !record ||
        record.status !== 'accepted' ||
        !(
          Date.parse(record.decision?.acceptanceExpiresAt ?? '') > Date.now()
        ) ||
        !(await permitted(context, record, 'provision'))
      )
        return null;
      return connection.transaction(() => {
        const latest = load(record.enrollmentId);
        return latest &&
          fingerprint(latest) === fingerprint(record) &&
          Date.parse(latest.decision?.acceptanceExpiresAt ?? '') > Date.now()
          ? latest
          : null;
      });
    },
  };
}
