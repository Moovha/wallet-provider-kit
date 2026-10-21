import type { VerifiedPrincipal } from '../domain/principal.js';
import type {
  AccessInput,
  AccessRequest,
  AccessRequestInput,
  AccountRecord,
  ApplicationUserAssertion,
  ProviderState,
  ResolvedPolicy,
  VerifiedUserRecord,
} from './types.js';
import { application, deny, fingerprint, invalid, text } from './policy.js';
import { sharingTerms } from './wallet-sharing.js';

export const defaultWallet = {
  reference: 'personal',
  name: 'Personal',
  kind: 'personal' as const,
};
export function userOwner(
  principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>,
  userId: string,
) {
  return fingerprint([
    'application-user-v1',
    principal.issuer,
    principal.clientId,
    userId,
  ]);
}
export function walletDescription(account: AccountRecord) {
  return account.wallet ?? defaultWallet;
}
export function requestPerson(request: AccessRequest | undefined) {
  return request?.userOwner ?? request?.sharing?.subjectOwner ?? request?.owner;
}

/** Identity reuse is restricted to the authenticated application's exact user binding and current trust. */
export function resolveWalletInput(
  policy: ResolvedPolicy,
  state: ProviderState,
  principal: VerifiedPrincipal,
  raw: AccessRequestInput,
): AccessInput {
  const result = structuredClone(raw);
  if (result.user && result.user.identity === undefined) {
    if (!text(result.user.id)) invalid();
    const id = userOwner(principal, result.user.id),
      app = application(policy, principal);
    let profile = state.verifiedUsers?.[id];
    if (!profile) {
      for (const request of Object.values(state.requests)) {
        const user = request.input.user;
        if (
          !request.denied &&
          request.revision === policy.revision &&
          requestPerson(request) === id &&
          user &&
          request.acceptance?.source === 'application_attestation' &&
          request.acceptance.expiresAt > Date.now() &&
          fingerprint([
            principal.issuer,
            principal.clientId,
            user.identity,
            app.assertionTrust,
          ]) === request.acceptance.evidenceHash
        ) {
          profile = {
            id,
            issuer: principal.issuer,
            clientId: principal.clientId,
            userId: user.id,
            identity: user.identity,
            evidenceHash: request.acceptance.evidenceHash,
            acceptedUntil: request.acceptance.expiresAt,
            revision: policy.revision,
          };
        }
      }
    }
    if (
      !profile ||
      profile.revision !== policy.revision ||
      profile.acceptedUntil <= Date.now() ||
      fingerprint([
        principal.issuer,
        principal.clientId,
        profile.identity,
        app.assertionTrust,
      ]) !== profile.evidenceHash
    )
      deny();
    result.user.identity = structuredClone(profile.identity);
  }
  return result as AccessInput;
}
export function saveVerifiedUser(
  policy: ResolvedPolicy,
  state: ProviderState,
  principal: VerifiedPrincipal,
  user: ApplicationUserAssertion,
  assertion: { owner: string; acceptedUntil: number; evidenceHash: string },
) {
  const profile: VerifiedUserRecord = {
    id: assertion.owner,
    issuer: principal.issuer,
    clientId: principal.clientId,
    userId: user.id,
    identity: structuredClone(user.identity),
    evidenceHash: assertion.evidenceHash,
    acceptedUntil: assertion.acceptedUntil,
    revision: policy.revision,
  };
  (state.verifiedUsers ??= {})[profile.id] = profile;
  // Refresh identity facts across owned wallets, without issuing or extending any consent grant.
  for (const account of Object.values(state.accounts))
    if (account.owner === profile.id) {
      account.acceptedUntil = profile.acceptedUntil;
      account.acceptanceRevision = profile.revision;
      account.evidenceHash = profile.evidenceHash;
    }
}
export function connectWalletMember(
  policy: ResolvedPolicy,
  state: ProviderState,
  request: AccessRequest,
  personId: string,
) {
  const account = state.accounts[request.accountId] ?? deny();
  const member = account.members?.[personId] ?? deny();
  const consent = request.input.user!.consent;
  if (
    walletDescription(account).kind !== 'shared' ||
    member.state === 'removed' ||
    member.issuer !== request.caller.issuer ||
    member.clientId !== request.caller.clientId ||
    consent.account_id !== account.id ||
    consent.membership_revision !== member.revision ||
    request.input.authorization_details[0].actions.some(
      (permission) => !member.permissions.includes(permission),
    )
  )
    deny();
  if (
    member.sourceSharing &&
    sharingTerms(policy, request.caller, member.sourceSharing.applicationId)
      .revision !== member.sourceSharing.revision
  )
    deny();
  member.state = 'active';
  request.owner = account.owner;
  request.membership = { personId, revision: member.revision };
}
export function validateWalletMember(
  policy: ResolvedPolicy,
  state: ProviderState,
  request: AccessRequest,
) {
  const membership = request.membership ?? deny();
  const account = state.accounts[request.accountId] ?? deny();
  const member = account.members?.[membership.personId] ?? deny();
  const profile = state.verifiedUsers?.[membership.personId] ?? deny();
  const app = application(policy, { ...request.caller, scopes: [] });
  if (
    request.denied ||
    request.revision !== policy.revision ||
    request.userOwner !== membership.personId ||
    profile.revision !== policy.revision ||
    profile.acceptedUntil <= Date.now() ||
    fingerprint([
      request.caller.issuer,
      request.caller.clientId,
      profile.identity,
      app.assertionTrust,
    ]) !== profile.evidenceHash ||
    member.state !== 'active' ||
    member.revision !== membership.revision ||
    member.issuer !== request.caller.issuer ||
    member.clientId !== request.caller.clientId ||
    request.input.user?.consent.account_id !== account.id ||
    request.input.user.consent.membership_revision !== member.revision ||
    request.input.authorization_details[0].actions.some(
      (permission) => !member.permissions.includes(permission),
    ) ||
    request.acceptance?.expiresAt === undefined ||
    request.acceptance.expiresAt <= Date.now()
  )
    deny();
  if (
    member.sourceSharing &&
    sharingTerms(policy, request.caller, member.sourceSharing.applicationId)
      .revision !== member.sourceSharing.revision
  )
    deny();
}
