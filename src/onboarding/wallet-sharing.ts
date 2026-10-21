import { WalletProviderError } from '../domain/signing.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import type {
  AccessRequest,
  ApplicationUserAssertion,
  ProviderState,
  ResolvedPolicy,
} from './types.js';
import { application, deny, fingerprint } from './policy.js';
import { checkApplicationAssertion } from './application-access.js';

export const documentMatchFields = [
  'identity_number',
  'document_type',
  'issuing_country',
] as const;

/** A directional provider agreement permits matching; the requesting app still attests fresh consent. */
export function sharingTerms(
  policy: ResolvedPolicy,
  principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>,
  sourceId: string,
) {
  if (policy.access.mode !== 'application' || sourceId === principal.clientId)
    deny();
  const source = policy.applications.find(
    (a) => a.issuer === principal.issuer && a.clientId === sourceId,
  );
  const sharing = source?.walletSharing;
  if (
    !source ||
    source.enabled === false ||
    !source.assertionTrust ||
    !sharing?.applications.includes(principal.clientId) ||
    documentMatchFields.some(
      (field) => !sharing.matchingFields.includes(field),
    ) ||
    sharing.matchingFields.some(
      (field) => !policy.identity.application?.requiredFields.includes(field),
    )
  )
    deny();
  return {
    source_application_id: sourceId,
    matching_fields: [...sharing.matchingFields],
    revision: fingerprint([
      source.issuer,
      source.clientId,
      source.assertionTrust,
      sharing,
    ]),
  };
}

function sourceEvidence(
  policy: ResolvedPolicy,
  state: ProviderState,
  source: AccessRequest,
  principal: AccessRequest['caller'],
  user: ApplicationUserAssertion,
  sourceId: string,
) {
  const terms = sharingTerms(policy, principal, sourceId);
  const account = state.accounts[source.accountId];
  const evidence = source.input.user;
  const sourceApp = policy.applications.find(
    (a) =>
      a.issuer === source.caller.issuer &&
      a.clientId === source.caller.clientId,
  );
  const verifiedAt = Date.parse(evidence?.identity.verified_at ?? '');
  if (
    !account ||
    account.status !== 'active' ||
    account.acceptedUntil <= Date.now() ||
    account.acceptanceRevision !== policy.revision ||
    source.denied ||
    source.sharing ||
    source.revision !== policy.revision ||
    source.caller.issuer !== principal.issuer ||
    source.caller.clientId !== sourceId ||
    source.owner !== account.owner ||
    source.acceptance?.source !== 'application_attestation' ||
    source.acceptance.evidenceHash !== account.evidenceHash ||
    !Number.isFinite(verifiedAt) ||
    verifiedAt > Date.now() ||
    fingerprint([
      source.caller.issuer,
      source.caller.clientId,
      evidence?.identity,
      sourceApp?.assertionTrust,
    ]) !== account.evidenceHash ||
    !evidence ||
    source.acceptance.expiresAt <= Date.now() ||
    Date.parse(evidence.identity.verified_at) +
      policy.identity.maxAgeDays * 86400000 <=
      Date.now() ||
    evidence.identity.level !==
      policy.identity.application?.verificationLevel ||
    terms.matching_fields.some(
      (field) =>
        !evidence.identity.fields[field] ||
        !user.identity.fields[field] ||
        evidence.identity.fields[field] !== user.identity.fields[field],
    )
  )
    deny();
  return { terms, account };
}

export function matchSharedAccount(
  policy: ResolvedPolicy,
  state: ProviderState,
  request: AccessRequest,
  subjectOwner: string,
) {
  const user = request.input.user ?? deny();
  const sourceId = request.input.source_application_id ?? deny();
  const terms = sharingTerms(policy, request.caller, sourceId);
  if (
    user.consent.source_application_id !== sourceId ||
    user.consent.sharing_revision !== terms.revision
  )
    deny();
  const matches = new Map<string, AccessRequest>();
  for (const source of Object.values(state.requests)) {
    try {
      sourceEvidence(policy, state, source, request.caller, user, sourceId);
      matches.set(source.accountId, source);
    } catch (error) {
      if (
        !(error instanceof WalletProviderError) ||
        error.code !== 'wallet_authorization_denied'
      )
        throw error;
      /* Nonmatching records reveal no identity or wallet information. */
    }
  }
  if (matches.size !== 1) deny();
  const source = [...matches.values()][0];
  const account = state.accounts[source.accountId];
  const previous = Object.values(state.accounts).find(
    (a) => a.owner === subjectOwner || a.linkedOwners?.includes(subjectOwner),
  );
  if (previous && previous.id !== account.id) deny();
  request.accountId = account.id;
  request.owner = account.owner;
  request.sharing = {
    sourceApplicationId: sourceId,
    sourceRequestId: source.id,
    subjectOwner,
    revision: terms.revision,
    evidenceHash: account.evidenceHash,
  };
  account.linkedOwners = [
    ...new Set([...(account.linkedOwners ?? []), subjectOwner]),
  ];
}

/** Revalidate the relationship, both identity records and B's own consent before any account use. */
export function validateSharedAccess(
  policy: ResolvedPolicy,
  state: ProviderState,
  request: AccessRequest,
) {
  const sharing = request.sharing ?? deny();
  const user = request.input.user ?? deny();
  if (
    request.denied ||
    request.revision !== policy.revision ||
    request.consent?.revision !== policy.revision ||
    request.acceptance?.source !== 'application_attestation' ||
    request.acceptance.expiresAt <= Date.now() ||
    request.input.mode !== 'connect_from_application' ||
    request.input.source_application_id !== sharing.sourceApplicationId
  )
    deny();
  const source = state.requests[sharing.sourceRequestId] ?? deny();
  const { terms, account } = sourceEvidence(
    policy,
    state,
    source,
    request.caller,
    user,
    sharing.sourceApplicationId,
  );
  const asserted = checkApplicationAssertion(
    policy,
    { ...request.caller, scopes: [] },
    user,
    request.actionPolicyRevision,
    Object.keys(user.identity.fields),
  );
  application(policy, { ...source.caller, scopes: [] });
  if (
    terms.revision !== sharing.revision ||
    user.consent.sharing_revision !== sharing.revision ||
    user.consent.source_application_id !== sharing.sourceApplicationId ||
    asserted.owner !== sharing.subjectOwner ||
    asserted.evidenceHash !== request.acceptance?.evidenceHash ||
    request.accountId !== source.accountId ||
    request.owner !== account.owner ||
    account.evidenceHash !== sharing.evidenceHash ||
    !account.linkedOwners?.includes(sharing.subjectOwner)
  )
    deny();
}
