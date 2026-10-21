import type { VerifiedPrincipal } from '../domain/principal.js';
import { invalid, uuid } from '../onboarding/policy.js';

/** This header selects a grant; it supplies no authority beyond the authenticated caller's current approval. */
export function selectWalletGrant(
  principal: VerifiedPrincipal,
  value: unknown,
): VerifiedPrincipal {
  if (value === undefined) return principal;
  if (typeof value !== 'string' || !uuid.test(value)) invalid();
  return { ...principal, accessGrantId: value };
}
