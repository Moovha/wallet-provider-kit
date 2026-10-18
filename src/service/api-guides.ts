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
    title: 'Approve contract calls, swaps or vault deposits',
    group: 'Approved contract calls',
    scope: 'wallet:actions',
    approvedAction: true,
    execution: true,
    permission: 'contracts:request',
    prerequisite:
      'Enable approved-evm-executor-v1 and the contract-call policy. Obtain contracts:request consent to the exact policy revision and use an explicitly bound Safe 1.4.1 account. Contract targets/functions, swap routes and vault routes are operator policies. Callers cannot supply signing data, a nonce or provider identity.',
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
      '200: implemented transfer and approved EVM execution profiles on Base Sepolia, their revisions, required scopes and finalized RPC-quorum verification policy. Unsupported wallet/account standards are not advertised as executable capabilities.',
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
      'Use an existing authorized action_id for the same application, caller, owner and current delegation for the action. Report submitted, confirmed or failed with the Base Sepolia transaction hash and observation time. Keep the original idempotency key for retries. Reports may arrive after signing authorization expires; current access and policy must still pass.',
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
  onboarding: boolean;
  enrollment: boolean;
  financial: boolean;
  execution?: boolean;
  safeQueue?: boolean;
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

export const transactionBoundaryDescription = `Signing, execution and transaction reports are separate contracts. POST /v1/transfer-authorizations stores an exact authorized ERC-3009 transfer; POST /v1/actions/{actionId}/sign returns its transfer signature without broadcasting. POST /v1/actions/contract-calls stores exact policy-approved contract calls, swaps or vault deposits for an explicitly bound Safe account; those signatures remain private to coordinated execution. With an optional explicitly selected execution profile, POST /v1/actions/{actionId}/execute coordinates signing, simulation, gas-budget admission and one durable direct-provider dispatch or authenticated designated-service handoff. The designated service has its own provider journal and calls back for fresh wallet authority. GET /v1/actions/{actionId}/execution independently checks chain effects through configured RPC sources and separates inclusion, safe and finalized status. Applications can still arrange submission separately when coordination is absent. Transaction-event reports remain unverified and never determine settlement or release budgets. Monitoring metrics and traces are exported separately to an OTLP collector.`;
