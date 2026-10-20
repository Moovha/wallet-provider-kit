export interface OperationGuide {
  management?: boolean;
  title: string;
  group: string;
  scope?: string;
  serviceAuthenticated?: boolean;
  enrollment?: boolean;
  walletCalls?: boolean;
  safeWallet?: boolean;
  runtimeConfiguration?: boolean;
  applicationLed?: boolean;
  records?: boolean;
  vendor?: boolean;
  permission?: 'account:read' | 'operations:request' | 'contracts:request';
  prerequisite: string;
  success: string;
}
// Shared operator guidance. Runtime authentication and authority remain authoritative.
export const operationGuides: Record<string, OperationGuide> = {
  rotateProviderIdentityCredential: {
    title: 'Rotate a provider identity credential',
    group: 'Provider administration',
    management: true,
    prerequisite:
      'Use a dedicated provider operator, current revision and an idempotency key.',
    success:
      '200: a replacement secret shown once. Obsolete credentials and tokens are rejected.',
    scope: 'provider:manage',
  },
  updateProviderIdentity: {
    title: 'Update application trust or suspend an identity',
    group: 'Provider administration',
    management: true,
    prerequisite:
      'Supply the current revision and an idempotency key. Application identities cannot perform this operation.',
    success:
      '200: updated registration. Authority changes invalidate obsolete tokens; suspension, trust and owner-permission changes revoke related grants. Renaming preserves authority. Wallet activation is unchanged.',
    scope: 'provider:manage',
  },
  createProviderIdentity: {
    title: 'Register an application or automation identity',
    group: 'Provider administration',
    management: true,
    prerequisite:
      'Use a dedicated provider operator and a fresh idempotency key.',
    success:
      '200: registration metadata and a secret shown once. Replay returns metadata only; registration does not accept identity trust.',
    scope: 'provider:manage',
  },
  listProviderIdentities: {
    title: 'List provider identities',
    group: 'Provider administration',
    management: true,
    prerequisite: 'Authenticate as a current dedicated provider operator.',
    success:
      '200: identity metadata without authentication verifiers or secrets.',
    scope: 'provider:manage',
  },
  readProviderStatus: {
    title: 'Read provider management status',
    group: 'Provider administration',
    management: true,
    prerequisite: 'Authenticate as a current dedicated provider operator.',
    success:
      '200: management availability, application registrations and wallet activation status.',
    scope: 'provider:manage',
  },
  claimProviderInstallation: {
    title: 'Claim a provider installation',
    group: 'Provider administration',
    management: true,
    prerequisite:
      'Use the privately delivered, unexpired installation claim credential. This succeeds once.',
    success:
      '200: a provider administrator registration; wallet execution remains disabled.',
  },
  getExecutionCapabilities: {
    title: 'Read the execution contract',
    group: 'Discovery',
    prerequisite: 'No authentication required.',
    success: '200: the Safe ERC-4337 contract and configuration availability.',
  },
  readSafeWalletInfrastructure: {
    title: 'Inspect Safe-only sponsorship',
    group: 'Application infrastructure',
    scope: 'wallet:configuration:write',
    safeWallet: true,
    prerequisite:
      'Use a configured provider operator and an accepted application ID.',
    success:
      '200: the retained funding address, paymaster and setup status. Private signer credentials are never returned.',
  },
  provisionSafeWalletInfrastructure: {
    title: 'Prepare the application paymaster and bundler',
    group: 'Application infrastructure',
    scope: 'wallet:configuration:write',
    safeWallet: true,
    prerequisite:
      'Accept the application RPC and sponsorship terms. Fund the returned application address and retry with the original application identity.',
    success:
      '200: journaled paymaster deployment and gas funding. Uncertain transactions retain their original signed payload and hash.',
  },
  readApplicationGasFunding: {
    title: 'Read the application gas funding address',
    group: 'Application infrastructure',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Have the provider accept sponsorship and prepare the application infrastructure.',
    success:
      '200: one stable application gas-funding address and infrastructure status for the application.',
  },
  readWalletExecutionAccount: {
    title: 'Read the user’s assigned execution Safe',
    group: 'Wallet calls',
    scope: 'wallet:execute:read',
    walletCalls: true,
    prerequisite:
      'Use current account access and contract delegation after the application bundler and paymaster are ready.',
    success:
      '200: the Safe address and chain ID. This is the user’s deposit, balance and execution address.',
  },
  readApplicationCredentials: {
    title: 'Read application credential metadata',
    group: 'Application configuration',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use the registered application identity. Credential values are never returned.',
    success:
      '200: application-local references, revisions, origins and active or revoked status.',
  },
  readProviderApplicationCredentials: {
    title: 'Review application credential origins',
    group: 'Application configuration',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an exact configured provider identity and the application ID. Review each origin before accepting the service declaration.',
    success:
      '200: credential metadata without secret paths. Reject service declarations to prevent their use.',
  },
  writeApplicationCredential: {
    title: 'Store or revoke an application credential',
    group: 'Application configuration',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Configure a retained runtimeConfiguration.credentialKey. Use the application identity, an original idempotency key and the current credential revision. Supply a vendor HTTPS endpoint or null to revoke it.',
    success:
      '200: encrypted credential retained and metadata returned. Referencing service declarations return to pending review. No provider secrets can be selected.',
  },
  readApplicationObligations: {
    title: 'Read your application obligations',
    group: 'Application obligations',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Accepted actions constrain off-chain payloads; accepted services enable application-owned verifier credentials when credential storage is configured. Acceptance does not activate execution or authorize spending. Safe provisioning requires accepted application infrastructure and funded sponsorship. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  readProviderApplicationObligations: {
    title: 'Inspect application obligations as provider',
    group: 'Application obligations',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Accepted actions constrain off-chain payloads; accepted services enable application-owned verifier credentials when credential storage is configured. Acceptance does not activate execution or authorize spending. Safe provisioning requires accepted application infrastructure and funded sponsorship. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  submitApplicationActions: {
    title: 'Declare expected actions and off-chain fields',
    group: 'Application obligations',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Accepted actions constrain off-chain payloads; accepted services enable application-owned verifier credentials when credential storage is configured. Acceptance does not activate execution or authorize spending. Safe provisioning requires accepted application infrastructure and funded sponsorship. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  submitApplicationServices: {
    title: 'Declare application-paid service accounts',
    group: 'Application obligations',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Accepted actions constrain off-chain payloads; accepted services enable application-owned verifier credentials when credential storage is configured. Acceptance does not activate execution or authorize spending. Safe provisioning requires accepted application infrastructure and funded sponsorship. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  submitApplicationSponsorship: {
    title: 'Declare application gas sponsorship',
    group: 'Application obligations',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Accepted actions constrain off-chain payloads; accepted services enable application-owned verifier credentials when credential storage is configured. Acceptance does not activate execution or authorize spending. Safe provisioning requires accepted application infrastructure and funded sponsorship. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  decideApplicationActions: {
    title: 'Accept or reject declared actions',
    group: 'Application obligations',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Accepted actions constrain off-chain payloads; accepted services enable application-owned verifier credentials when credential storage is configured. Acceptance does not activate execution or authorize spending. Safe provisioning requires accepted application infrastructure and funded sponsorship. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  decideApplicationServices: {
    title: 'Accept or reject declared service accounts',
    group: 'Application obligations',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Accepted actions constrain off-chain payloads; accepted services enable application-owned verifier credentials when credential storage is configured. Acceptance does not activate execution or authorize spending. Safe provisioning requires accepted application infrastructure and funded sponsorship. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  decideApplicationSponsorship: {
    title: 'Accept or reject declared gas sponsorship',
    group: 'Application obligations',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Accepted actions constrain off-chain payloads; accepted services enable application-owned verifier credentials when credential storage is configured. Acceptance does not activate execution or authorize spending. Safe provisioning requires accepted application infrastructure and funded sponsorship. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  listApplicationConfigurations: {
    title: 'List application configurations',
    group: 'Application configuration',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use application configuration read scope or an exact configured provider operator with configuration write scope. Supply application_id to load one application’s policy and latest 20 proposals. Application callers cannot select another namespace.',
    success:
      '200: enabled application summaries and selected policy/proposal details. The provider sees its configured applications; applications see only their own registration. No spending authority is granted.',
  },
  listWalletBatches: {
    title: 'List readable wallet batches',
    group: 'Wallet calls',
    scope: 'wallet:execute:read',
    walletCalls: true,
    runtimeConfiguration: true,
    prerequisite:
      'Applications need current owner account-read access and execute read scope. Exact configured provider operators can inspect the provider ledger using configuration write scope. No application token can become an operator through scopes alone.',
    success:
      '200: up to 100 readable batch summaries, queue stages and retained finalized RPC-quorum receipts. Unfinalized observations remain pending in this list; applications can refresh individual wallet_getCallsStatus results. Listing never signs, submits or retries.',
  },
  setRuntimeReviewMode: {
    title: 'Allow automatic application contract registration',
    group: 'Application configuration',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Publish a baseline policy first. An exact configured provider operator chooses automatic or manual review using both expected_revision and expected_review_revision with a UUID idempotency key. Choose the review mode explicitly.',
    success:
      '200: a durable review decision. Automatic mode publishes subsequent contract/method changes only when provider terms exactly match the enabled current policy. Claims, value/call limits, validity, enablement and chain remain provider controlled. Existing pending proposals are not retroactively accepted.',
  },
  streamWalletCallsStatus: {
    title: 'Stream wallet batch status',
    group: 'Wallet calls',
    scope: 'wallet:execute:read',
    walletCalls: true,
    prerequisite:
      'Retain the admitted batch ID and use an authenticated fetch stream. Account ownership and batch access are checked before opening; authorization is checked before each update. Reconnect after 55 seconds or use wallet_getCallsStatus.',
    success:
      '200: text/event-stream status events after durable observations. Preconfirmation remains pending; verified inner execution determines success. Connections are bounded to two per account, 16 per application and 64 per service.',
  },
  walletCallsRpc: {
    title: 'Submit or inspect a standard wallet call batch',
    group: 'Wallet calls',
    scope: 'wallet:access:read',
    walletCalls: true,
    prerequisite:
      'Enable Safe wallet calls. The account endpoint binds the authenticated application and current owner. Send requires wallet:actions, wallet:sign and wallet:execute plus contracts:request consent; status/discovery require wallet:execute:read.',
    success:
      '200: a JSON-RPC result or sanitized RPC error. Use EIP-5792 version 2.0.0, retain the batch ID and poll wallet_getCallsStatus. Inclusion is distinct from finality. HTTP authentication/readiness failures use the normal problem envelope.',
  },
  readRuntimeApplicationConfiguration: {
    title: 'Read an application policy as provider operator',
    group: 'Application configuration',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use a separately configured provider operator token. Application tokens cannot read another application’s registry or publish changes.',
    success:
      '200: the current durable publication and predecessor information. Read it before preparing a compare-and-set policy update. Configuration does not authorize spending.',
  },
  readRuntimeConfiguration: {
    title: 'Read the active application configuration',
    group: 'Application configuration',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  readRuntimeConfigurationRevision: {
    title: 'Read an immutable configuration revision',
    group: 'Application configuration',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  proposeRuntimeConfiguration: {
    title: 'Propose application contracts and policy',
    group: 'Application configuration',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  readRuntimeConfigurationProposal: {
    title: 'Read a configuration proposal',
    group: 'Application configuration',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  publishRuntimeConfiguration: {
    title: 'Publish an application proposal as provider operator',
    group: 'Application configuration',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  updateRuntimeConfiguration: {
    title: 'Publish a provider policy revision',
    group: 'Application configuration',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
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
      'Standard application-led access: read GET /v1/access-policy, then include user with the application’s stable user ID, accepted identity evidence and recorded consent for the returned policy revision. The provider must explicitly trust this application’s attestations. Users stay in the application. Hosted compatibility deployments instead return consent_url and require provider login/review.',
    success:
      '200: request ID and policy outcome. granted includes account_id, grant_id, permissions and expiry; it does not create the wallet. A consent_url appears only in hosted compatibility mode. Missing, stale or unauthorized attestations are rejected before access is granted.',
  },
  getAccountAccessPolicy: {
    title: 'Read access policy and evidence requirements',
    group: 'Application access',
    scope: 'wallet:access:read',
    prerequisite:
      'Use an enabled application registration and its API token. The response identifies the provider’s identity source and required submission fields without returning customer records.',
    success:
      '200: flow, policy_revision, required_fields, verification_level, age limits and provider login/review requirements. action_policy_revision identifies the configured Safe call policy. Record the user’s consent to those terms before requesting contract access.',
  },
  submitAccountAccessRecords: {
    records: true,
    title: 'Submit application records',
    group: 'Application access',
    scope: 'wallet:access',
    prerequisite:
      'Select application-record evaluation in provider policy. Read GET /v1/access-policy, then submit up to 50 records in a body no larger than 512 KiB. Each reference must be unique within the batch and fields must contain every required policy field. Only required fields are retained. Keep the batch idempotency key; a changed batch requires a new key.',
    success:
      '200: an indexed result for each record. Complete records receive their own access request and consent URL; incomplete or duplicate records are marked invalid. Replaying the original batch resumes its requests without duplicate creation. Submission makes no wallet or vendor call. Owner consent and explicit provider review are still required.',
  },
  revokeAccountAccess: {
    applicationLed: true,
    title: 'Revoke application wallet access',
    group: 'Application access',
    scope: 'wallet:access',
    prerequisite:
      'Use the grant_id returned to this application and the same caller. Send an empty JSON body. Your application must provide the user’s access-revocation control and call this endpoint when consent is withdrawn.',
    success:
      '200: revoked. Current wallet access and subsequent signing are denied. Already issued signatures are not cancelled. A renewed grant requires fresh consent evidence and a new request.',
  },
  getAccountAccessRequest: {
    title: 'Read access request status',
    group: 'Application access',
    scope: 'wallet:access:read',
    prerequisite:
      'Use the returned request_id and a token for the same application and caller. Application-led access is decided from the trusted application’s submitted identity and consent evidence. Hosted compatibility mode requires its separate browser steps.',
    success:
      '200: the current request status. granted includes account and access-grant details. For funding_approval_required, arrange identity funding; for provider_review_required, wait for staff review; for reconciliation_required, ask the operator to investigate the original attempt.',
  },
  importAccessIdentity: {
    vendor: true,
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
      '200: the user Safe account address and provisioning status. Deployment uses accepted application infrastructure. Pending deployment retains its original attempt; retry with the same identity. Wallet creation does not grant spending permission.',
  },
  beginEnrollment: {
    title: 'Begin advanced OIDC enrollment',
    group: 'Advanced OIDC enrollment',
    scope: 'wallet:enroll',
    enrollment: true,
    prerequisite:
      'Compose the separate EnrollmentService with host-owned durable authority and OIDC identity verification. This profile is unavailable in the configured setup service and cannot be combined with application access onboarding.',
    success:
      '201: reserved enrollment/account IDs and a nonce-bound identity challenge. No wallet or spending grant is created.',
  },
  submitEnrollmentIdentity: {
    title: 'Submit advanced enrollment identity',
    group: 'Advanced OIDC enrollment',
    scope: 'wallet:enroll',
    enrollment: true,
    prerequisite:
      'Complete the provider-owned OIDC flow using the reserved nonce. Submit a provider-audience OIDC Identity Assurance ID token only to this identity endpoint; the HTTP Authorization header still requires an application access token.',
    success:
      '200: the provider enrollment decision. A verified identity token does not grant wallet access or spending authority.',
  },
  getEnrollment: {
    title: 'Read advanced enrollment status',
    group: 'Advanced OIDC enrollment',
    scope: 'wallet:enroll:read',
    enrollment: true,
    prerequisite:
      'Use the reserved enrollment ID with the original authorized caller and current host permission.',
    success:
      '200: the current enrollment receipt without identity attributes or proof tokens.',
  },
};

export interface ApiFeatures {
  management?: boolean;
  onboarding: boolean;
  enrollment: boolean;
  walletCalls?: boolean;
  safeWallet?: boolean;
  runtimeConfiguration?: boolean;
  wallet: boolean;
  flow?: 'application' | 'hosted';
  records?: boolean;
  vendor?: boolean;
}

/** Configuration availability only; current authentication, authority and readiness still apply. */
export function operationUnavailableReason(
  id: string,
  features: ApiFeatures,
): string | undefined {
  const guide = operationGuides[id];
  if (
    !guide ||
    [
      'getCapabilities',
      'getExecutionCapabilities',
      'readAccessPolicy',
    ].includes(id)
  )
    return undefined;
  if (guide.management)
    return features.management
      ? undefined
      : 'Durable provider administration is not configured';
  if (guide.safeWallet && !features.safeWallet)
    return 'Safe wallet infrastructure is not configured';
  if (guide.walletCalls && !features.walletCalls)
    return 'The Safe UserOperation driver is not configured';
  if (guide.runtimeConfiguration && !features.runtimeConfiguration)
    return 'Application configuration is not configured';
  if (guide.enrollment)
    return features.enrollment
      ? undefined
      : 'OIDC enrollment is not configured';
  if (id === 'provisionAccount' && (!features.safeWallet || !features.wallet))
    return 'Safe wallet provisioning is not configured';
  if (!features.onboarding)
    return 'Application access onboarding is not configured';
  if (guide.applicationLed && features.flow !== 'application')
    return 'Requires application-led access';
  if ((guide.records || guide.vendor) && features.flow === 'application')
    return 'Requires hosted identity access';
  if (guide.records && !features.records)
    return 'Application identity records are not configured';
  if (guide.vendor && !features.vendor)
    return 'Identity verification is not configured';
  return undefined;
}
export const transactionBoundaryDescription =
  'Applications submit policy-approved calls through the account wallet endpoint. Every user execution is a sponsored Safe ERC-4337 UserOperation. Durable acknowledgement precedes chain inclusion; independently verified inclusion and business settlement remain separate. Signing authority, sponsor reservations and immutable dispatch are checked at their respective boundaries.';
