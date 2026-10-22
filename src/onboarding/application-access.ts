import type { VerifiedPrincipal } from '../domain/principal.js';
import type { ApplicationUserAssertion, ResolvedPolicy } from './types.js';
import { application, deny, fingerprint, invalid, text } from './policy.js';

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
    evidenceHash: fingerprint([
      principal.issuer,
      principal.clientId,
      user.identity,
      app.assertionTrust,
    ]),
  };
}
