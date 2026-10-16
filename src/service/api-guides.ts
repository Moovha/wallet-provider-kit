export interface OperationGuide {
  title: string;
  group: string;
  scope?: string;
  financial?: boolean;
  permission?: 'account:read' | 'operations:request' | 'transfers:request';
  prerequisite: string;
  success: string;
}
// Shared operator guidance. Runtime authentication and authority remain authoritative.
export const operationGuides: Record<string, OperationGuide> = {
  getCapabilities: {
    title: 'Discover this provider',
    group: 'Discovery',
    prerequisite: 'Public discovery. configured reflects deployed readiness.',
    success:
      '200: profile and configured status. An unconfigured or disabled service can still return 200.',
  },
  requestAccountAccess: {
    title: 'Request owner access',
    group: 'Application access',
    scope: 'wallet:access',
    prerequisite:
      'Allowed application registration. Open the returned consent_url in a top-level owner browser. Identity work needs agreed vendor prices and application funding, including free routes.',
    success:
      '200: an access receipt, initially requiring consent. This is not yet an access grant or a provisioned wallet.',
  },
  getAccountAccessRequest: {
    title: 'Read access request status',
    group: 'Application access',
    scope: 'wallet:access:read',
    prerequisite:
      'Use the request_id from the access receipt and the same authorized caller. Wait for owner consent, identity verification and provider review.',
    success:
      '200: current receipt. Only granted includes usable account/grant details; funding_approval_required, provider_review_required or reconciliation_required need follow-up.',
  },
  importAccessIdentity: {
    title: 'Import shared identity',
    group: 'Application access',
    scope: 'wallet:access',
    prerequisite:
      'Owner consent, an enabled recipient vendor/workflow, a fresh vendor share token and an agreed import price/application funding. Vendor evidence still needs provider acceptance.',
    success:
      '200: updated access receipt. Vendor acceptance alone is not provider acceptance; unknown imports must be reconciled.',
  },
  readGrantedAccount: {
    title: 'Read a granted account',
    group: 'Wallet accounts',
    scope: 'wallet:account:read',
    permission: 'account:read',
    prerequisite:
      'A current owner-bound account:read grant, accepted identity and matching application/caller.',
    success:
      '200: accepted or provisioned account status. An address is present after provisioning.',
  },
  provisionAccount: {
    title: 'Provision an accepted account',
    group: 'Wallet accounts',
    scope: 'wallet:provision',
    prerequisite:
      'Use the accepted account_id and a current owner-bound grant. Empty JSON body. Retain the original idempotency key on retries; never replace an unknown attempt.',
    success:
      '200: account_id and address, including authorized replay. This does not approve spending.',
  },
  requestTransferAuthorization: {
    title: 'Request provider transfer authorization',
    group: 'Provider-authorized transfers',
    scope: 'wallet:actions',
    financial: true,
    permission: 'transfers:request',
    prerequisite:
      'Configured ERC-3009 profile, provisioned account and explicit transfers:request delegation recorded during onboarding. The provider checks current owner, identity, consent, recipient and amount limits without a second owner prompt.',
    success:
      '200: authorized with the exact stored payload and expiry. Signing, submission and settlement are separate.',
  },
  getTransferAuthorization: {
    title: 'Read transfer authorization status',
    group: 'Provider-authorized transfers',
    scope: 'wallet:actions:read',
    financial: true,
    permission: 'transfers:request',
    prerequisite:
      'Use the returned action_id with the authorized application/caller. Current owner/grant/identity and policy checks still apply.',
    success:
      '200: authorizing, authorized or denied. An authorized action is not a signing or settlement receipt.',
  },
  signAction: {
    title: 'Sign the authorized stored action',
    group: 'Provider-authorized transfers',
    scope: 'wallet:sign',
    financial: true,
    permission: 'transfers:request',
    prerequisite:
      'Exact stored provider authorization, current transfer delegation/identity/consent, unchanged policy, budget and durable attempt authority. Empty JSON body. Preserve the original idempotency key, including after timeouts.',
    success:
      '200: verified signature, including authorized replay. Submission, gas and settlement are separate; a signature may remain executable until its on-chain expiry.',
  },
};
