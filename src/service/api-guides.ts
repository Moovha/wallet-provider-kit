export interface OperationGuide {
  title: string;
  group: string;
  scope?: string;
  serviceAuthenticated?: boolean;
  financial?: boolean;
  approvedAction?: boolean;
  enrollment?: boolean;
  execution?: boolean;
  safeQueue?: boolean;
  safeProvisioning?: boolean;
  walletCalls?: boolean;
  runtimeConfiguration?: boolean;
  applicationLed?: boolean;
  records?: boolean;
  vendor?: boolean;
  permission?:
    | 'account:read'
    | 'operations:request'
    | 'transfers:request'
    | 'contracts:request';
  prerequisite: string;
  success: string;
}
// Shared operator guidance. Runtime authentication and authority remain authoritative.
export const operationGuides: Record<string, OperationGuide> = {
  readApplicationObligations: {
    title: 'Read your application obligations',
    group: 'Application obligations',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Acceptance does not activate execution, resolve credentials, provision accounts or authorize spending. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  readProviderApplicationObligations: {
    title: 'Inspect application obligations as provider',
    group: 'Application obligations',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Acceptance does not activate execution, resolve credentials, provision accounts or authorize spending. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  submitApplicationActions: {
    title: 'Declare expected actions and off-chain fields',
    group: 'Application obligations',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Acceptance does not activate execution, resolve credentials, provision accounts or authorize spending. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  submitApplicationServices: {
    title: 'Declare application-paid service accounts',
    group: 'Application obligations',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Acceptance does not activate execution, resolve credentials, provision accounts or authorize spending. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  submitApplicationSponsorship: {
    title: 'Declare application gas sponsorship',
    group: 'Application obligations',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Acceptance does not activate execution, resolve credentials, provision accounts or authorize spending. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  decideApplicationActions: {
    title: 'Accept or reject declared actions',
    group: 'Application obligations',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Acceptance does not activate execution, resolve credentials, provision accounts or authorize spending. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  decideApplicationServices: {
    title: 'Accept or reject declared service accounts',
    group: 'Application obligations',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Acceptance does not activate execution, resolve credentials, provision accounts or authorize spending. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  decideApplicationSponsorship: {
    title: 'Accept or reject declared gas sponsorship',
    group: 'Application obligations',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an enabled registered application for its own declarations, or an exact configured provider operator for decisions and cross-application inspection. Writes require a UUIDv4 idempotency key and the current resource revision. Decisions also require the current decision revision.',
    success:
      '200: durable application-scoped declarations or provider decisions. Changes return to pending review. Acceptance does not activate execution, resolve credentials, provision accounts or authorize spending. Submit schema declarations and opaque application-local secret references, never actual user payloads or credentials.',
  },
  listApplicationConfigurations: {
    title: 'List application configurations',
    group: 'Runtime configuration',
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
    group: 'Runtime configuration',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Publish a baseline policy first. An exact configured provider operator chooses automatic or manual review using both expected_revision and expected_review_revision with a UUID idempotency key. Choose the review mode explicitly.',
    success:
      '200: a durable review decision. Automatic mode publishes subsequent contract/method changes only when provider terms exactly match the enabled current policy. Claims, value/call limits, validity, enablement and chain remain provider controlled. Existing pending proposals are not retroactively accepted.',
  },
  walletCallsRpc: {
    title: 'Submit or inspect a standard wallet call batch',
    group: 'Wallet calls',
    scope: 'wallet:access:read',
    walletCalls: true,
    prerequisite:
      'Enable runtime financial authority and the Safe queue. The account endpoint binds the authenticated application and current owner. Send requires wallet:actions, wallet:sign and wallet:execute plus contracts:request consent; status/discovery require wallet:execute:read.',
    success:
      '200: a JSON-RPC result or sanitized RPC error. Use EIP-5792 version 2.0.0, retain the batch ID and poll wallet_getCallsStatus. Inclusion is distinct from finality. HTTP authentication/readiness failures use the normal problem envelope.',
  },
  readRuntimeApplicationConfiguration: {
    title: 'Read an application policy as provider operator',
    group: 'Runtime configuration',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use a separately configured provider operator token. Application tokens cannot read another application’s registry or publish changes.',
    success:
      '200: the current durable publication and predecessor information. Read it before preparing a compare-and-set policy update. Configuration does not authorize spending.',
  },
  readRuntimeConfiguration: {
    title: 'Read the active application configuration',
    group: 'Runtime configuration',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  readRuntimeConfigurationRevision: {
    title: 'Read an immutable configuration revision',
    group: 'Runtime configuration',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  proposeRuntimeConfiguration: {
    title: 'Propose application contracts and policy',
    group: 'Runtime configuration',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  readRuntimeConfigurationProposal: {
    title: 'Read a configuration proposal',
    group: 'Runtime configuration',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  publishRuntimeConfiguration: {
    title: 'Publish an application proposal as provider operator',
    group: 'Runtime configuration',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  updateRuntimeConfiguration: {
    title: 'Publish a provider policy revision',
    group: 'Runtime configuration',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Configure runtimeConfiguration and use an explicitly registered application or provider operator. Write scope alone never confers operator authority. Configuration changes do not authorize signing or activate execution.',
    success:
      '200: a durable proposal, publication or current configuration. Publications are visible without restart. Mutations require an original UUIDv4 idempotency key and expected_revision; stale updates conflict. Historical revisions remain immutable. Applications can read only their own records.',
  },
  enqueueContractCall: {
    title: 'Queue an approved Safe operation for automatic execution',
    group: 'Safe execution queue',
    scope: 'wallet:actions',
    safeQueue: true,
    permission: 'contracts:request',
    prerequisite:
      'Enable the bounded Safe queue and approved-evm-executor-v1. Also require wallet:sign and wallet:execute. This request authorizes delayed execution of the exact policy-controlled input under the original owner, grant, consent and policy until its bounded expiry. The worker rechecks all current authority before signing and dispatch; queued requests contain no signature or assigned Safe nonce.',
    success:
      '202: a durable request ID. Per-Safe FIFO ordering survives restart. Only the head materializes an immutable action; action_id appears after admission. Follow this request and then its verified action execution. Unknown signed attempts block the lane. Acceptance is not execution or settlement.',
  },
  readContractCallRequest: {
    title: 'Read a queued Safe request',
    group: 'Safe execution queue',
    scope: 'wallet:execute:read',
    safeQueue: true,
    permission: 'contracts:request',
    prerequisite:
      'Use the original request ID and current owner-bound application access. Reading never signs, dispatches or advances the queue.',
    success:
      '200: queued, executing, succeeded, cancelled, expired or blocked and an action_id when materialized. Succeeded requires finalized RPC-quorum execution success. Signed failures and uncertainty require recovery; the queue does not skip or replace them.',
  },
  cancelContractCallRequest: {
    title: 'Cancel an unsigned queued Safe request',
    group: 'Safe execution queue',
    scope: 'wallet:execute',
    safeQueue: true,
    permission: 'contracts:request',
    prerequisite:
      'Use an empty body, UUIDv4 Idempotency-Key and current original-caller authority. Cancellation is allowed only when durable storage proves no signing admission exists, including after a crash during action materialization.',
    success:
      '200: cancelled. A signed or uncertain action returns conflict and retains its Safe nonce and queue position; cancellation cannot recall an issued signature.',
  },
  requestContractCall: {
    title: 'Authorize generic wallet calls',
    group: 'Approved contract calls',
    scope: 'wallet:actions',
    approvedAction: true,
    execution: true,
    permission: 'contracts:request',
    prerequisite:
      'Enable approved-evm-executor-v1 and the contract-call policy. Obtain contracts:request consent to the exact policy revision and use an explicitly bound Safe 1.4.1 account. Contract methods and native recipients follow published policy; optional adapters supply explicitly selected protocol checks. Callers cannot supply signing data, a nonce or provider identity.',
    success:
      '200: the immutable action, exact calls and Safe authorization. Execute by stored action ID. Contract-call signatures are retained for coordinated dispatch; /sign does not export them. Execution success alone does not establish an arbitrary business outcome.',
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
      '200: flow, policy_revision, required_fields, verification_level, age limits and provider login/review requirements. action_policy_revision identifies the configured transfer and contract terms; transfer_policy_revision remains a compatibility alias. Record the user’s consent to those terms in your application before requesting transfer access.',
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
  readProvisionedSafe: {
    title: 'Read the account’s provisioned Safe',
    group: 'Wallet accounts',
    scope: 'wallet:account:read',
    permission: 'account:read',
    prerequisite:
      'Enable automatic Safe provisioning and use the owner account UUID with current account-read delegation. Poll this endpoint after wallet provisioning returns a pending smart_account.',
    success:
      '200: the deterministic Safe address and deployment status. Ready requires matching finalized proxy code and current owner, threshold, singleton, module, guard and fallback checks across both configured RPCs. Reading never submits a deployment.',
  },
  provisionAccount: {
    title: 'Create the account’s wallet',
    group: 'Wallet accounts',
    scope: 'wallet:provision',
    prerequisite:
      'Use the accepted account_id with current owner-granted access and an empty JSON body: {}. Keep the original idempotency key when retrying. Investigate an unknown outcome before trying again.',
    success:
      '200: account_id and signing wallet address, plus smart_account when automatic Safe provisioning is configured. Safe deployment consumes the application sponsor’s gas budget and requires operations:request delegation. Pending deployment can be polled through the Safe read endpoint. A permitted retry reuses the saved deployment attempt. Wallet creation does not grant spending permission.',
  },
  requestTransferAuthorization: {
    title: 'Request provider transfer authorization',
    group: 'Provider-authorized transfers',
    scope: 'wallet:actions',
    financial: true,
    permission: 'transfers:request',
    prerequisite:
      'Configure ERC-3009 transfer signing, create the wallet and obtain the owner’s transfers:request delegation in the application for the exact transfer_policy_revision (or through hosted consent in compatibility mode). The provider checks current owner access, identity, consent, recipient and amount limits for each request without another owner prompt.',
    success:
      '200: authorized with the exact stored payload and expiry. Signing, submission and settlement are separate.',
  },
  getTransferAuthorization: {
    title: 'Read a stored approved action',
    group: 'Provider-authorized transfers',
    scope: 'wallet:actions:read',
    approvedAction: true,
    prerequisite:
      'Use the returned action_id with a token for the authorized application and caller. The provider rechecks current owner access, identity and policy.',
    success:
      '200: authorizing, authorized or denied. authorized means the provider has stored the approved action; signing, submission and completion are separate steps.',
  },
  checkExecutionAuthority: {
    title: 'Recheck wallet authority for the designated executor',
    group: 'Execution service authority',
    serviceAuthenticated: true,
    prerequisite:
      'Only the configured executor may call this read-only endpoint using a short-lived request-bound service proof. Application OAuth tokens are rejected. The stored execution plan, original caller and durable attempt must match, with an unexpired handoff lease. Current owner, grant, identity, consent and exact approval checks remain mandatory.',
    success:
      '200: signed permission for the exact current execution callback. This response does not create an action, sign a payload, dispatch a transaction or renew a handoff lease.',
  },
  getExecutionCapabilities: {
    title: 'Discover execution profiles and verification requirements',
    group: 'Execution coordination',
    prerequisite:
      'Public discovery. Read the exact profile ID and revision before requesting execution. Implemented, configured and ready are distinct; none establishes provider certification or production custody acceptance.',
    success:
      '200: implemented transfer and approved EVM execution profiles on the configured Base network, their revisions, required scopes and finalized RPC-quorum verification policy. Unsupported wallet/account standards are not advertised as executable capabilities.',
  },
  reconcileExecution: {
    title: 'Reconcile an existing execution without provider mutations',
    group: 'Execution recovery',
    scope: 'wallet:execute:read',
    execution: true,
    approvedAction: true,
    prerequisite:
      'Use the original action ID, an empty body, exact execution profile headers and a UUIDv4 Idempotency-Key. Current original caller, owner, grant, identity, consent and approval remain required; status reconciliation is allowed after signing expiry. Optional recovery configuration adds nonce diagnostics and durable payer quarantine.',
    success:
      '200: refreshed original execution and operational diagnosis. The procedure performs only read-only provider and RPC lookup, preserves attempts and budgets, and never signs, claims dispatch, reprices, cancels or clears a nonce. Only exact verified finalized receipts clear corresponding quarantine reasons; nonce consumption without matching effects requires operator review.',
  },
  authorizeSafeNonceCancellation: {
    title: 'Authorize cancellation of an unsubmitted signed Safe action',
    group: 'Execution recovery',
    scope: 'wallet:actions',
    permission: 'contracts:request',
    approvedAction: true,
    execution: true,
    prerequisite:
      'Use bundled local Safe execution, the original caller and current owner, grant, identity, consent and action policy. Supply the stored action ID, exact expected_nonce and expected_payload_hash, authorization: invalidate-signed-action, and a stable UUIDv4 Idempotency-Key. Any submission admission, including an unclaimed one, prevents cancellation. Unknown or submitted actions require reconciliation.',
    success:
      '200: a separate immutable cancellation action ID. Execute it through the normal execute endpoint with signing and execution scopes. It sends zero value and empty calldata to the same Safe at the original nonce. The original action is blocked immediately; its queue is cancelled only after RPC-quorum finalized cancellation. Gas and lifetime reservations remain retained. Signatures are never exported.',
  },
  executeTransfer: {
    title: 'Execute an approved action with a gas sponsor',
    group: 'Execution coordination',
    scope: 'wallet:execute',
    approvedAction: true,
    execution: true,
    prerequisite:
      'Also require wallet:sign. Configure dedicated application sponsors, admitted gas budgets, two independent RPC origins, the accepted genesis and operation-specific runtime hashes and execution acceptance. Send {} with the explicitly configured Execution-Profile (erc3009-relayer-v1, erc3009-executor-v1 or approved-evm-executor-v1), Execution-Profile-Revision: 1 and a UUIDv4 Idempotency-Key. The provider keeps its current owner, grant, identity, consent, exact approval and durable signing/dispatch checks. Callers cannot supply calldata, signatures, fees, sponsors or transaction nonces.',
    success:
      '200: durable execution/dispatch status, not a settlement guarantee. One execution identity per action survives retries and restart. A lost submission response remains unknown and is never dispatched again. Read execution status to obtain independently checked chain effects and finality. Gas reservations and signing exposure are not refunded automatically.',
  },
  getTransferExecution: {
    title: 'Read independently verified execution and finality',
    group: 'Execution coordination',
    scope: 'wallet:execute:read',
    approvedAction: true,
    execution: true,
    prerequisite:
      'Use the original action ID and exact Execution-Profile/Execution-Profile-Revision headers. Current caller, owner, action delegation, identity, consent and approval must still pass; reads remain possible after signing expiry. The observer checks receipts, canonical blocks, code pins and operation-specific execution/asset evidence through all configured RPC sources.',
    success:
      '200: separate dispatch, chain, outcome and settlement fields. Only finalized matching effects have settlement succeeded or reverted. Relayer acceptance, application reports and inclusion alone do not establish settlement. RPC outages return unavailable; contradictory finalized evidence fences the execution for operator investigation.',
  },
  getExecutionEvents: {
    title: 'Read durable CloudEvents execution observations',
    group: 'Execution coordination',
    scope: 'wallet:execute:read',
    approvedAction: true,
    execution: true,
    prerequisite:
      'Use the exact execution profile headers and current owner-bound access for the action. Pass the last next_sequence as the after query parameter. Event data uses the pinned execution profile revision; the envelope uses CloudEvents specversion 1.0. Reading this feed never refreshes or dispatches a transaction.',
    success:
      '200: up to 64 durable observed transitions. Persist event IDs for deduplication. history_truncated requires resynchronization through verified execution status; a cursor beyond stored history returns 409. Events distinguish unverified observations, inclusion and finalized effects and do not form an exhaustive chain or accounting ledger.',
  },
  reportTransactionEvent: {
    title: 'Report a transaction event',
    group: 'Transaction telemetry',
    scope: 'wallet:events',
    approvedAction: true,
    prerequisite:
      'Use an existing authorized action_id for the same application, caller, owner and current delegation for the action. Report submitted, confirmed or failed with the configured network’s transaction hash and observation time. Keep the original idempotency key for retries. Reports may arrive after signing authorization expires; current access and policy must still pass.',
    success:
      '200: a durable application report marked unverified. Recording a report does not broadcast, verify a receipt, establish settlement, reconcile a signing attempt or release a budget reservation. At most 32 reports are retained per action; reports can arrive out of order and do not form an authoritative transaction status.',
  },
  getTransactionEvents: {
    title: 'Read reported transaction events',
    group: 'Transaction telemetry',
    scope: 'wallet:events:read',
    approvedAction: true,
    prerequisite:
      'Use an action_id belonging to the same application and caller with current owner access, identity and transfer delegation. Signing expiry does not prevent report reads; revoked access or changed policy denies them.',
    success:
      '200: application reports in recording order, each marked unverified. An empty list is not proof that no transaction was submitted. Confirm settlement independently from chain receipts, exact transfer effects and your finality policy.',
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
  signAction: {
    title: 'Sign an approved action (no submission)',
    group: 'Provider-authorized transfers',
    scope: 'wallet:sign',
    financial: true,
    permission: 'transfers:request',
    prerequisite:
      'Transfer signature export only; contract calls use coordinated execution. Use the stored action_id and an empty JSON body: {}. The provider rechecks its exact authorization, the owner’s current delegation for the action, identity, consent, policy, budget and recorded attempt before signing. Keep the original idempotency key when retrying, including after a timeout.',
    success:
      '200: a verified signature, or the saved signature for a permitted retry. The application must submit the transaction and arrange network fees separately. A signature can remain usable until its on-chain expiry even if access is later revoked.',
  },
};

export interface ApiFeatures {
  nonceCancellation?: boolean;
  onboarding: boolean;
  enrollment: boolean;
  financial: boolean;
  execution?: boolean;
  safeQueue?: boolean;
  safeProvisioning?: boolean;
  walletCalls?: boolean;
  runtimeConfiguration?: boolean;
  executionService?: boolean;
  contractCalls?: boolean;
  signing?: boolean;
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
  if (!guide || id === 'getCapabilities' || id === 'getExecutionCapabilities')
    return undefined;
  if (id === 'authorizeSafeNonceCancellation' && !features.nonceCancellation)
    return 'Bundled local Safe execution is not configured';
  if (id === 'readProvisionedSafe' && !features.safeProvisioning)
    return 'Automatic Safe provisioning is not configured';
  if (guide.runtimeConfiguration)
    return features.runtimeConfiguration
      ? undefined
      : 'Runtime configuration control plane is not configured';
  if (guide.walletCalls && !features.walletCalls)
    return 'Runtime financial authority and Safe queue are not configured';
  if (guide.safeQueue && !features.safeQueue)
    return 'Durable Safe execution queue is not configured';
  if (id === 'requestContractCall' && !features.contractCalls)
    return 'Approved contract-call policy and execution mechanism are not configured';
  if (guide.serviceAuthenticated && !features.executionService)
    return 'The designated execution service is not configured';
  if (guide.execution && !features.execution)
    return 'Execution coordination and RPC verification are not configured';
  if (guide.enrollment)
    return features.enrollment
      ? undefined
      : 'Advanced OIDC enrollment is not configured';
  if (id === 'signAction' && features.signing && features.wallet)
    return undefined;
  if (guide.approvedAction && !features.financial && !features.contractCalls)
    return 'Approved-action policy is not configured';
  if (guide.financial && !features.financial)
    return 'Transfer signing is off in Policies';
  if (['provisionAccount', 'signAction'].includes(id))
    return features.wallet ? undefined : 'Wallet authority is not configured';
  if (!features.onboarding)
    return 'Application access onboarding is not configured';
  if (guide.applicationLed && features.flow !== 'application')
    return 'Requires application-led access';
  if ((guide.records || guide.vendor) && features.flow === 'application')
    return 'Requires hosted compatibility access';
  if (guide.records && !features.records)
    return 'Select application records in Policies to use batch submission';
  if (guide.vendor && !features.vendor)
    return 'Select an identity vendor in Services to import verification';
  return undefined;
}

export const transactionBoundaryDescription = `Signing, execution and transaction reports are separate contracts. POST /v1/transfer-authorizations stores an exact authorized ERC-3009 transfer; POST /v1/actions/{actionId}/sign returns its transfer signature without broadcasting. POST /v1/actions/contract-calls stores exact policy-approved generic calls, including accepted native transfers and optional adapter protections, for an explicitly bound Safe account; those signatures remain private to coordinated execution. With an optional explicitly selected execution profile, POST /v1/actions/{actionId}/execute coordinates signing, simulation, gas-budget admission and one durable direct-provider dispatch or authenticated designated-service handoff. The designated service has its own provider journal and calls back for fresh wallet authority. GET /v1/actions/{actionId}/execution independently checks chain effects through configured RPC sources and separates inclusion, safe and finalized status. Applications can still arrange submission separately when coordination is absent. Transaction-event reports remain unverified and never determine settlement or release budgets. Monitoring metrics and traces are exported separately to an OTLP collector.`;
