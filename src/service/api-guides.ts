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
    prerequisite:
      'No token is needed. The configured field says whether the service is ready for wallet operations.',
    success:
      '200: the service profile and configured status. A 200 response confirms that discovery works; check configured before trying wallet operations.',
  },
  requestAccountAccess: {
    title: 'Request access to a wallet',
    group: 'Application access',
    scope: 'wallet:access',
    prerequisite:
      'Register and enable the calling application in your provider settings. Open consent_url as a full browser page so the owner can sign in and consent. Identity checks need an agreed vendor price and an application funding agreement, even for free checks.',
    success:
      '200: a request ID, consent link and status. Wait for owner consent and provider review before using the account; this response does not create a wallet.',
  },
  getAccountAccessRequest: {
    title: 'Read access request status',
    group: 'Application access',
    scope: 'wallet:access:read',
    prerequisite:
      'Use the returned request_id and a token for the same application and caller. The owner must complete consent and identity checks, and provider staff must accept the evidence.',
    success:
      '200: the current request status. granted includes account and access-grant details. For funding_approval_required, arrange identity funding; for provider_review_required, wait for staff review; for reconciliation_required, ask the operator to investigate the original attempt.',
  },
  importAccessIdentity: {
    title: 'Reuse shared identity evidence',
    group: 'Application access',
    scope: 'wallet:access',
    prerequisite:
      'Obtain owner consent and a valid share token from the selected identity vendor. Configure the recipient workflow, agreed import price and application funding first. Provider staff still review the imported evidence.',
    success:
      '200: the updated access request status. Vendor approval does not grant wallet access. If the import outcome is unknown, investigate that attempt before requesting another import.',
  },
  readGrantedAccount: {
    title: 'Read wallet account details',
    group: 'Wallet accounts',
    scope: 'wallet:account:read',
    permission: 'account:read',
    prerequisite:
      'The same application and caller need current account:read permission for this owner’s account, with accepted identity evidence.',
    success:
      '200: accepted or provisioned account status. An address is present after provisioning.',
  },
  provisionAccount: {
    title: 'Create the account’s wallet',
    group: 'Wallet accounts',
    scope: 'wallet:provision',
    prerequisite:
      'Use the accepted account_id with current owner-granted access and an empty JSON body: {}. Keep the original idempotency key when retrying. Investigate an unknown outcome before trying again.',
    success:
      '200: account_id and wallet address. A permitted retry returns the saved result without creating another wallet. Wallet creation does not grant spending permission.',
  },
  requestTransferAuthorization: {
    title: 'Request provider transfer authorization',
    group: 'Provider-authorized transfers',
    scope: 'wallet:actions',
    financial: true,
    permission: 'transfers:request',
    prerequisite:
      'Configure ERC-3009 transfer signing, create the wallet and obtain the owner’s transfers:request delegation during onboarding. The provider checks current owner access, identity, consent, recipient and amount limits for each request without another owner prompt.',
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
      'Use the returned action_id with a token for the authorized application and caller. The provider rechecks current owner access, identity and policy.',
    success:
      '200: authorizing, authorized or denied. authorized means the provider has stored the approved transfer; signing, submission and completion are separate steps.',
  },
  signAction: {
    title: 'Sign an authorized transfer',
    group: 'Provider-authorized transfers',
    scope: 'wallet:sign',
    financial: true,
    permission: 'transfers:request',
    prerequisite:
      'Use the stored action_id and an empty JSON body: {}. The provider rechecks its exact authorization, the owner’s current transfer delegation, identity, consent, policy, budget and recorded attempt before signing. Keep the original idempotency key when retrying, including after a timeout.',
    success:
      '200: a verified signature, or the saved signature for a permitted retry. The application must submit the transaction and arrange network fees separately. A signature can remain usable until its on-chain expiry even if access is later revoked.',
  },
};
