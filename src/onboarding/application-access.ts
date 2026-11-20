import type { VerifiedPrincipal } from '../domain/principal.js';
import type {
  ApplicationUserAssertion,
  ApplicationPolicy,
  ResolvedPolicy,
} from './types.js';
import { application, deny, fingerprint, invalid, text } from './policy.js';

/** Identity evidence remains bound to the identity agreement across renewal-mode changes. */
export function applicationIdentityEvidenceHash(
  principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>,
  identity: ApplicationUserAssertion['identity'],
  trust: ApplicationPolicy['assertionTrust'],
): string {
  if (!trust) deny();
  return fingerprint([
    principal.issuer,
    principal.clientId,
    identity,
    { agreement: trust.agreement },
  ]);
}

/** Read evidence saved before renewal authority was separated from identity attestation. */
export function matchesApplicationIdentityEvidence(
  principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>,
  identity: ApplicationUserAssertion['identity'],
  trust: ApplicationPolicy['assertionTrust'],
  evidenceHash: string,
): boolean {
  if (!trust) return false;
  return [
    { agreement: trust.agreement },
    { agreement: trust.agreement, managedRenewal: false },
    { agreement: trust.agreement, managedRenewal: true },
  ].some(
    (terms) =>
      fingerprint([principal.issuer, principal.clientId, identity, terms]) ===
      evidenceHash,
  );
}

/** Omitted labels bind to the current agreement; saved assertions retain complete authority metadata. */
export function resolveApplicationAssertion(
  policy: ResolvedPolicy,
  principal: VerifiedPrincipal,
  user: ApplicationUserAssertion,
  idempotencyKey: string,
  actionRevision?: string,
): ApplicationUserAssertion {
  const rules = policy.identity.application;
  if (!rules || !user.identity || !user.consent) invalid();
  return {
    ...user,
    identity: {
      ...user.identity,
      level:
        user.identity.level === undefined
          ? rules.verificationLevel
          : user.identity.level,
    },
    consent: {
      ...user.consent,
      reference:
        user.consent.reference === undefined
          ? 'provider-consent-' +
            fingerprint([
              principal.issuer,
              principal.clientId,
              principal.subject,
              user.id,
              idempotencyKey,
            ])
          : user.consent.reference,
      policy_revision:
        user.consent.policy_revision === undefined
          ? (policy.consentRevision ?? policy.revision)
          : user.consent.policy_revision,
      ...(user.consent.action_policy_revision === undefined &&
      actionRevision !== undefined
        ? { action_policy_revision: actionRevision }
        : {}),
    },
  };
}

const day = 86400000;
function object(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function instant(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)
  )
    invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time)) invalid();
  const canonical = value.includes('.')
    ? value.replace(
        /\.(\d+)Z$/,
        (_match, digits: string) => '.' + digits.padEnd(3, '0') + 'Z',
      )
    : value.replace('Z', '.000Z');
  if (new Date(time).toISOString() !== canonical) invalid();
  return time;
}
/** The authenticated application attests user facts under a provider-approved agreement. */
export function checkApplicationAssertion(
  policy: ResolvedPolicy,
  principal: VerifiedPrincipal,
  value: ApplicationUserAssertion | undefined,
  actionRevision?: string,
  additionalFields: string[] = [],
) {
  const app = application(policy, principal);
  const rules = policy.identity.application;
  if (policy.access.mode !== 'application' || !app.assertionTrust || !rules)
    deny();
  if (
    !object(value, ['id', 'identity', 'consent']) ||
    !text(value.id) ||
    !object(value.identity, ['reference', 'level', 'verified_at', 'fields']) ||
    !object(value.consent, [
      'reference',
      'granted_at',
      'expires_at',
      'policy_revision',
      'action_policy_revision',
      'source_application_id',
      'sharing_revision',
      'account_id',
      'wallet_reference',
      'membership_revision',
    ])
  )
    invalid();
  const user = value as unknown as ApplicationUserAssertion;
  if (
    !text(user.identity.reference) ||
    !text(user.identity.level, 100) ||
    !text(user.consent.reference) ||
    !object(user.identity.fields, [
      ...rules.requiredFields,
      ...additionalFields,
    ]) ||
    rules.requiredFields.some(
      (field) =>
        !Object.hasOwn(user.identity.fields, field) ||
        !text(user.identity.fields[field], 512) ||
        !user.identity.fields[field].trim(),
    )
  )
    invalid();
  const verifiedAt = instant(user.identity.verified_at);
  const consentAt = instant(user.consent.granted_at);
  const consentExpiry = instant(user.consent.expires_at);
  const now = Date.now();
  const acceptedUntil = verifiedAt + policy.identity.maxAgeDays * day;
  if (
    user.identity.level !== rules.verificationLevel ||
    verifiedAt > now ||
    acceptedUntil <= now ||
    consentAt > now ||
    consentAt < now - policy.access.maxAgeDays * day ||
    consentExpiry <= now ||
    consentExpiry > consentAt + policy.access.maxAgeDays * day ||
    user.consent.policy_revision !==
      (policy.consentRevision ?? policy.revision) ||
    user.consent.action_policy_revision !== actionRevision
  )
    deny();
  return {
    owner: fingerprint([
      'application-user-v1',
      principal.issuer,
      principal.clientId,
      user.id,
    ]),
    acceptedUntil,
    consentAt,
    expiresAt: Math.min(acceptedUntil, consentExpiry),
    evidenceHash: applicationIdentityEvidenceHash(
      principal,
      user.identity,
      app.assertionTrust,
    ),
  };
}
