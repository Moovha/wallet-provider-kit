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
  permission?:
    | 'account:read'
    | 'operations:request'
    | 'contracts:request'
    | 'members:manage'
    | 'owners:manage';
  audience: string;
  purpose: string;
  whenToUse: string;
  prerequisite: string;
  success: string;
}
export const apiTasks = [
  {
    name: 'Wallet access',
    description:
      'Connect a person, obtain permission, create their wallet and support disconnection. Start here for the standard wallet journey.',
  },
  {
    name: 'Wallets and members',
    description:
      'Switch between a person’s consented personal and shared wallets. Wallet owners invite members; each member gives their own wallet-specific permission.',
  },
  {
    name: 'Wallet owners and signatures',
    description:
      'Manage on-chain owner addresses and signature thresholds, fetch exact admitted signing payloads and deliver owner signatures. Application access, custody and transaction authorization remain separate.',
  },
  {
    name: 'Transactions',
    description:
      'Send approved transactions and track their outcomes after wallet access, transaction rules and fee funding are ready.',
  },
  {
    name: 'Service administration',
    description:
      'Installers and service operators manage administrator access, application connections and shared user-check requirements. Most operators can use /admin/ instead of calling these routes directly.',
  },
  {
    name: 'Application agreements',
    description:
      'Application developers submit the transactions, network services and fee terms they need. A separate service operator accepts or declines each agreement.',
  },
  {
    name: 'Transaction rules',
    description:
      'Define the exact contract calls and limits an application may request. Proposals and provider decisions are separate so an application cannot grant itself permission.',
  },
  {
    name: 'Network connections and fees',
    description:
      'Save and review application-owned network connections, prepare fee-paying infrastructure and find its funding address. These addresses and costs are separate from user assets.',
  },
  {
    name: 'Service status',
    description:
      'Check connectivity and supported features. These public reads report capabilities; they do not create wallets or enable transactions.',
  },
  {
    name: 'Optional identity integrations',
    description:
      'Advanced host integrations only. Skip these for standard application-led identity checks and consent. Hosted evidence import, read-only evaluation and custom provider-login enrollment are separate optional flows.',
  },
] as const;

export const apiOperationOrder = [
  'getAccountAccessPolicy',
  'createAccountWithoutKyc',
  'getAccountKyc',
  'updateAccountKyc',
  'requestAccountAccess',
  'getAccountAccessRequest',
  'provisionAccount',
  'readGrantedAccount',
  'revokeAccountAccess',
  'listUserWallets',
  'getSafeOwnerPolicy',
  'requestSafeOwnerChange',
  'listSafeSigningRequests',
  'getSafeSigningRequest',
  'submitSafeOwnerSignature',
  'cancelSafeSigningRequest',
  'readWalletMembers',
  'saveWalletMember',
  'readWalletExecutionAccount',
  'walletCallsRpc',
  'streamWalletCallsStatus',
  'listWalletBatches',
  'claimProviderInstallation',
  'readProviderStatus',
  'readProviderNetworks',
  'saveProviderNetworks',
  'readNetworkExecution',
  'saveNetworkExecution',
  'listProviderUsers',
  'readProviderUser',
  'listProviderIdentities',
  'createProviderIdentity',
  'readProviderUserChecks',
  'saveProviderUserChecks',
  'updateProviderIdentity',
  'rotateProviderIdentityCredential',
  'listApplicationConfigurations',
  'readApplicationObligations',
  'submitApplicationActions',
  'submitApplicationServices',
  'submitApplicationSponsorship',
  'configureProviderConnections',
  'proposeProviderSponsorship',
  'acceptProviderSponsorship',
  'readProviderApplicationObligations',
  'decideApplicationActions',
  'decideApplicationServices',
  'decideApplicationSponsorship',
  'readRuntimeConfiguration',
  'proposeRuntimeConfiguration',
  'readRuntimeConfigurationProposal',
  'readRuntimeApplicationConfiguration',
  'publishRuntimeConfiguration',
  'updateRuntimeConfiguration',
  'readRuntimeConfigurationRevision',
  'setApplicationTransactionMode',
  'setRuntimeReviewMode',
  'readApplicationCredentials',
  'writeApplicationCredential',
  'readProviderApplicationCredentials',
  'readWalletServices',
  'provisionWalletServices',
  'prepareApplicationFundingAddress',
  'readApplicationGasFunding',
  'listNetworks',
  'getCapabilities',
  'getExecutionCapabilities',
  'submitAccountAccessRecords',
  'importAccessIdentity',
  'beginEnrollment',
  'submitEnrollmentIdentity',
  'getEnrollment',
];

/** Swagger passes immutable operation records to the sorter. */
export function sortApiOperations(a: unknown, b: unknown) {
  if (typeof a === 'string' || typeof b === 'string')
    return String(a).localeCompare(String(b));
  type Operation = {
    get(key: string): { get(key: string): number | undefined };
  };
  const first = a as Operation,
    second = b as Operation;
  return (
    (first.get('operation').get('x-task-order') ?? 100) -
    (second.get('operation').get('x-task-order') ?? 100)
  );
}

export function operationGuideDescription(guide: OperationGuide) {
  return [
    `**Why this exists:** ${guide.purpose}`,
    `**Who uses it:** ${guide.audience}.`,
    `**When you need it:** ${guide.whenToUse}`,
    `**Before you start:** ${guide.prerequisite}`,
    `**Result and next step:** ${guide.success}`,
  ].join('\n\n');
}

// Shared operator guidance. Runtime authentication and authority remain authoritative.
export const operationGuides: Record<string, OperationGuide> = {
  getSafeOwnerPolicy: {
    title: 'Read on-chain wallet owners',
    group: 'Wallet owners and signatures',
    audience: 'Application backend developer',
    safeWallet: true,
    scope: 'wallet:access',
    permission: 'account:read',
    purpose:
      'Inspect current owners and threshold, compare observed chain state with the confirmed policy and reconcile finalized owner changes.',
    whenToUse:
      'Read before changing ownership and after the owner-change batch reaches finality.',
    prerequisite:
      'Current wallet access. Unexpected chain changes suspend execution; the original address initializer remains unchanged.',
    success:
      '200: confirmed policy, canonical observation, pending change and supported signature capabilities.',
  },
  requestSafeOwnerChange: {
    title: 'Change wallet owners or threshold',
    group: 'Wallet owners and signatures',
    audience: 'Application backend developer',
    safeWallet: true,
    scope: 'wallet:execute',
    permission: 'owners:manage',
    purpose:
      'Queue an exact standard Safe owner-management transaction under the current on-chain quorum.',
    whenToUse:
      'Add or remove a signer address or change the number of required owner signatures.',
    prerequisite:
      'Owner-only owners:manage and contracts:request consent, execution scopes and current policy revision. No external-wallet onboarding or private keys are required.',
    success:
      '200: pending change and batch ID. Poll batch status and read owners after finality to confirm.',
  },
  listSafeSigningRequests: {
    title: 'Find wallet signing requests',
    group: 'Wallet owners and signatures',
    audience: 'Application backend developer',
    safeWallet: true,
    scope: 'wallet:access',
    permission: 'account:read',
    purpose:
      'List the most recent exact signing requests available to this caller and wallet.',
    whenToUse:
      'Discover operations awaiting signatures after normal wallet-call admission.',
    prerequisite:
      'Current wallet access. Preparation fixes fees and sponsorship before publishing the signing payload.',
    success:
      '200: up to 100 recent requests, including their payloads, owner policies and collection states.',
  },
  getSafeSigningRequest: {
    title: 'Read an exact signing request',
    group: 'Wallet owners and signatures',
    audience: 'Application backend developer',
    safeWallet: true,
    scope: 'wallet:access',
    permission: 'account:read',
    purpose:
      'Fetch the immutable SafeOp typed payload, signing hash and quorum progress.',
    whenToUse:
      'Deliver the exact payload to a local wallet or another owner-controlled signer.',
    prerequisite:
      'Current access for the original caller and wallet. Check the transaction independently before signing.',
    success:
      '200: payload revision, transaction details, expiry and collected owner addresses. Signatures are not exported.',
  },
  submitSafeOwnerSignature: {
    title: 'Deliver an owner signature',
    group: 'Wallet owners and signatures',
    audience: 'Application backend developer',
    safeWallet: true,
    scope: 'wallet:sign',
    permission: 'contracts:request',
    purpose:
      'Verify and retain an external owner signature for the exact admitted operation, then wake its execution worker.',
    whenToUse:
      'Return a signature produced by a device or another supported ECDSA signer.',
    prerequisite:
      'Current caller authority, operation ID, payload revision, owner address and strict EIP-712 signature. Private keys remain with the signer.',
    success:
      '200: quorum progress. Identical deliveries are idempotent; mismatched payloads or repeated owners with different signatures are rejected.',
  },
  cancelSafeSigningRequest: {
    title: 'Cancel signature collection',
    group: 'Wallet owners and signatures',
    audience: 'Application backend developer',
    safeWallet: true,
    scope: 'wallet:actions',
    permission: 'contracts:request',
    purpose:
      'Stop further toolkit signing and submission before dispatch while retaining nonce and budget evidence.',
    whenToUse: 'Stop an operation that is still collecting signatures.',
    prerequisite:
      'Current original caller authority and an operation that has not been dispatched. Already issued signatures cannot be recalled.',
    success:
      '200: cancelled collection. Requests already dispatched conflict and require receipt reconciliation.',
  },

  listUserWallets: {
    title: 'Find a person’s approved wallets',
    group: 'Wallets and members',
    audience: 'Application developer',
    purpose:
      'Build a wallet switcher from the wallets this person has currently approved for your application.',
    whenToUse:
      'Use after access is granted and when switching wallets. The existing Personal wallet is listed first.',
    scope: 'wallet:account:read',
    applicationLed: true,
    prerequisite:
      'Send your private user_id in the JSON body and an application token. Only current grants for that exact application user are returned; keep stored account references for later renewal.',
    success:
      '200: accounts with wallet names, kind, roles, grant IDs, permissions and expiry. Send Wallet-Grant-Id with the selected grant on shared-wallet requests. No KYC records or other users’ wallets are returned.',
  },
  readWalletMembers: {
    title: 'Review a shared wallet’s members',
    group: 'Wallets and members',
    audience: 'Application developer acting for the wallet owner',
    purpose:
      'Show the owner who has been invited and the permissions available to each member.',
    whenToUse:
      'Use before inviting someone, changing their permissions or removing them.',
    scope: 'wallet:access',
    permission: 'members:manage',
    applicationLed: true,
    prerequisite:
      'Use the owner’s current Wallet-Grant-Id for this shared wallet. The application and the owner must explicitly allow members:manage. Being a member or knowing a wallet ID cannot grant administration.',
    success:
      '200: current settings revision and invited, active or removed members. Use the revision when saving. Another application’s private user reference is omitted.',
  },
  saveWalletMember: {
    title: 'Invite someone or change their wallet access',
    group: 'Wallets and members',
    audience: 'Application developer acting for the wallet owner',
    purpose:
      'Invite a verified application user to a shared wallet, limit their permissions or remove their future access.',
    whenToUse:
      'Use after the owner chooses View wallet or View and request approved transactions for a member.',
    scope: 'wallet:access',
    permission: 'members:manage',
    applicationLed: true,
    prerequisite:
      'Send Wallet-Grant-Id for the owner, a UUIDv4 Idempotency-Key, expected_revision, enabled and permissions. Use user_id to invite someone from your application or member_id to update a saved member. New or changed permissions need the member’s fresh consent to account_id and membership_revision through mode=connect.',
    success:
      '200: member settings and their revisions. Invitations do not grant account or spending access. Removing or changing a member invalidates their previous grants. The provider signer and on-chain owner threshold are unchanged; issued signatures remain subject to their on-chain validity.',
  },

  listProviderUsers: {
    title: 'Browse provider users',
    group: 'Service administration',
    audience: 'Provider operator',
    management: true,
    scope: 'provider:manage',
    purpose:
      'Browse stored application-scoped users and their KYC evidence summaries.',
    whenToUse:
      'Use when building a provider user directory or reviewing users registered through application-led access.',
    prerequisite:
      'Authenticate as a current administrator or management tool. Use limit (1–100, default 25), optional application_id and next_cursor as after for the next page. Keep filters unchanged between pages. Concurrent changes are not a snapshot.',
    success:
      '200: users and next_cursor, or null at the end. Each application user remains distinct; expired evidence remains visible. Hosted compatibility identities are excluded. This read does not establish current wallet or spending authority.',
  },
  readProviderUser: {
    title: 'Review a user’s KYC and wallets',
    group: 'Service administration',
    audience: 'Provider operator',
    management: true,
    scope: 'provider:manage',
    purpose:
      'Read an application-scoped user’s stored identity information and associated wallets.',
    whenToUse: 'Use after selecting a provider user ID from the directory.',
    prerequisite:
      'Authenticate as a current administrator or management tool. Use the directory id, not the application user_id. Treat identity fields and wallet addresses as private customer data.',
    success:
      '200: application-attested KYC evidence and owned, linked, invited or active member wallets, including suspended accounts. Removed memberships are omitted. Stored evidence is not a fresh KYC decision or wallet authorization. Unknown IDs return 404.',
  },
  readProviderUserChecks: {
    title: 'See required user information',
    group: 'Service administration',
    audience: 'Service operator',
    purpose:
      'See the identity information and permission limits every connected application must follow.',
    whenToUse:
      'Use when reviewing your service’s user checks. The same settings are available under User checks in administration.',
    management: true,
    scope: 'provider:manage',
    prerequisite:
      'Sign in as a provider operator. These shared settings are also shown under User checks in administration.',
    success:
      '200: required identity fields, the agreed verification label, maximum check age, permission duration and current settings revision. This returns requirements, not anyone’s KYC records.',
  },
  saveProviderUserChecks: {
    title: 'Change required user information',
    group: 'Service administration',
    audience: 'Service operator',
    purpose:
      'Set required identity information, the maximum age of checks and how long wallet permission lasts.',
    whenToUse:
      'Use when your shared requirements change. Applications read the resulting requirements through GET /v1/access-policy.',
    management: true,
    scope: 'provider:manage',
    prerequisite:
      'Review the requirements with the applications you trust. Read the current revision first and send it as expected_revision with a new UUIDv4 idempotency key. Repeat an uncertain request with the same key and body.',
    success:
      '200: saved requirements, effective immediately and retained across restarts. Changed settings end existing wallet approvals and pending access requests across all applications; people must approve the new terms. Identical settings preserve approvals. Applications must read GET /v1/access-policy for the new policy revision.',
  },
  rotateProviderIdentityCredential: {
    title: 'Replace an application or tool secret',
    group: 'Service administration',
    audience: 'Service operator',
    purpose:
      'Replace lost or exposed connection details so the old secret and its tokens stop working.',
    whenToUse:
      'Use for an existing application or management tool. You can also choose Replace secret in administration.',
    management: true,
    prerequisite:
      'Use a dedicated provider operator, current revision and an idempotency key.',
    success:
      '200: a replacement secret shown once. Obsolete credentials and tokens are rejected.',
    scope: 'provider:manage',
  },
  updateProviderIdentity: {
    title: 'Change or pause an application connection',
    group: 'Service administration',
    audience: 'Service operator',
    purpose:
      'Rename a connection, pause access, or change the agreement and permissions for an application.',
    whenToUse:
      'Use after adding a connection. Changing trust or permissions ends its current wallet approvals; renaming alone preserves them.',
    management: true,
    prerequisite:
      'Supply the current revision and an idempotency key. Application identities cannot perform this operation.',
    success:
      '200: updated registration. Authority changes invalidate obsolete tokens; suspension, trust and owner-permission changes revoke related grants. Renaming preserves authority. Wallet activation is unchanged.',
    scope: 'provider:manage',
  },
  createProviderIdentity: {
    title: 'Add an application or management tool',
    group: 'Service administration',
    audience: 'Service operator',
    purpose:
      'Give an application or administration tool its own connection ID and secret.',
    whenToUse:
      'Use once per new connection. Most operators can use Add application or Add management tool in administration.',
    management: true,
    prerequisite:
      'Use a dedicated provider operator and a fresh idempotency key.',
    success:
      '200: registration metadata and a secret shown once. Replay returns metadata only; registration does not accept identity trust.',
    scope: 'provider:manage',
  },
  listProviderIdentities: {
    title: 'See connected applications and tools',
    group: 'Service administration',
    audience: 'Service operator',
    purpose:
      'List registered connections so you can find the one to inspect or change.',
    whenToUse:
      'Use when managing registrations. This lists application and tool connections, not wallet owners.',
    management: true,
    prerequisite: 'Authenticate as a current dedicated provider operator.',
    success:
      '200: identity metadata without authentication verifiers or secrets.',
    scope: 'provider:manage',
  },
  readProviderStatus: {
    title: 'Check your service administration status',
    group: 'Service administration',
    audience: 'Service operator',
    purpose:
      'See whether administration is available, which applications are registered and whether wallet operations are enabled.',
    whenToUse:
      'Use on your administration dashboard or when troubleshooting service setup.',
    management: true,
    prerequisite: 'Authenticate as a current dedicated provider operator.',
    success:
      '200: management availability, application registrations and wallet activation status.',
    scope: 'provider:manage',
  },
  claimProviderInstallation: {
    title: 'Create the first administrator account',
    group: 'Service administration',
    audience: 'Installer',
    purpose:
      'Establish the administrator for a new, unclaimed installation using its private setup code.',
    whenToUse:
      'Use once after installation. The First-time setup form in administration sends this request; ordinary sign-in does not use it.',
    management: true,
    prerequisite:
      'Use the privately delivered, unexpired installation claim credential. This succeeds once.',
    success:
      '200: a provider administrator registration; wallet execution remains disabled.',
  },
  getExecutionCapabilities: {
    title: 'See supported transaction features',
    group: 'Service status',
    audience: 'Application developer',
    purpose:
      'Learn which transaction methods, network and execution features the service supports.',
    whenToUse:
      'Use when implementing wallet transactions or checking integration compatibility. GET /v1/capabilities is the simpler first connectivity check.',
    prerequisite: 'No authentication required.',
    success: '200: the Safe ERC-4337 contract and configuration availability.',
  },
  readWalletServices: {
    title: 'Check application wallet services',
    group: 'Network connections and fees',
    audience: 'Service operator',
    purpose:
      'See whether the application’s fee-paying infrastructure is prepared and whether it needs funding.',
    whenToUse:
      'Use before preparing or troubleshooting wallet creation. This concerns application fee funding, not a person’s wallet balance.',
    scope: 'wallet:configuration:write',
    safeWallet: true,
    prerequisite:
      'Use a configured provider operator and an accepted application ID.',
    success:
      '200: the retained funding address, paymaster and setup status. Private signer credentials are never returned.',
  },
  prepareApplicationFundingAddress: {
    scope: 'wallet:configuration:write',
    safeWallet: true,
    title: 'Prepare an application fee-funding address',
    group: 'Network connections and fees',
    audience: 'Service operator',
    purpose:
      'Create or retrieve the retained address used to fund an application’s accepted network-fee infrastructure.',
    whenToUse:
      'Use after offering provider fee terms or approving application-submitted terms, including while wallet execution is disabled.',
    prerequisite:
      'Authenticate as a current provider operator. The application must be active with pending provider-offered terms or accepted fee terms on the selected network.',
    success:
      '200: the stable application funding address and infrastructure status. No chain access, contract deployment, transfer or wallet activation occurs. Complete infrastructure acceptance separately before funding or wallet use.',
  },
  provisionWalletServices: {
    title: 'Provision application wallet services',
    group: 'Network connections and fees',
    audience: 'Service operator',
    purpose:
      'Deploy the application paymaster, fund its fee deposit and transaction submitter, and configure its private bundler service.',
    whenToUse:
      'Use after accepting its network services and fee agreement. This setup may deploy contracts and consume application funding; it does not create a user wallet.',
    scope: 'wallet:configuration:write',
    safeWallet: true,
    prerequisite:
      'Accept the application RPC and sponsorship terms. Fund the returned application address and retry with the original application identity.',
    success:
      '200: journaled paymaster deployment, fee funding and submission configuration, with preparation progress. Current operator authority and the displayed preparation-cost ceiling apply even while user execution is disabled. Uncertain transactions retain their original signed payload and hash.',
  },
  readApplicationGasFunding: {
    title: 'Find where to fund application network fees',
    group: 'Network connections and fees',
    audience: 'Application developer',
    purpose:
      'Get the application’s stable funding address and setup status so its operator knows where eligible network fees are funded.',
    whenToUse:
      'Use after the provider accepts fee sponsorship and prepares the application infrastructure. This address is separate from users’ receiving addresses.',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Have the provider accept sponsorship and prepare the application infrastructure.',
    success:
      '200: one stable application gas-funding address and infrastructure status for the application.',
  },
  readWalletExecutionAccount: {
    title: 'See the wallet address and transaction network',
    group: 'Transactions',
    audience: 'Application developer',
    purpose:
      'Get the user’s assigned Safe address and chain for wallet transactions. This is also their receiving address.',
    whenToUse:
      'Use when preparing transaction calls. GET /v1/accounts/{accountId} is the general account-details read and can be used before the wallet is provisioned.',
    scope: 'wallet:execute:read',
    walletCalls: true,
    prerequisite:
      'Use current account access and contract delegation after the application bundler and paymaster are ready.',
    success:
      '200: the Safe address and chain ID. This is the user’s deposit, balance and execution address.',
  },
  readApplicationCredentials: {
    title: 'See saved network connection details',
    group: 'Network connections and fees',
    audience: 'Application developer',
    purpose:
      'List your saved service connection references and their status without returning secret values.',
    whenToUse:
      'Use before adding, replacing or removing an application-owned network connection.',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use the registered application identity. Credential values are never returned.',
    success:
      '200: application-local references, revisions, origins and active or revoked status.',
  },
  readProviderApplicationCredentials: {
    title: 'Review an application’s network connections',
    group: 'Network connections and fees',
    audience: 'Service operator',
    purpose:
      'Inspect the service origins and saved connection references an application wants the provider to use.',
    whenToUse:
      'Use while reviewing its network-service agreement. The separate operator route lets you inspect the chosen application without sharing its secret values.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use an exact configured provider identity and the application ID. Review each origin before accepting the service declaration.',
    success:
      '200: credential metadata without secret paths. Reject service declarations to prevent their use.',
  },
  writeApplicationCredential: {
    title: 'Save or remove a network service connection',
    group: 'Network connections and fees',
    audience: 'Application developer',
    purpose:
      'Securely retain an application-owned service endpoint, or revoke it, for use by approved network services.',
    whenToUse:
      'Use when a service connection is added, changed or removed. The provider must review affected service declarations again; metadata reads never reveal the saved value.',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Configure a retained runtimeConfiguration.credentialKey. Use the application identity, an original idempotency key and the current credential revision. Supply a vendor HTTPS endpoint or null to revoke it.',
    success:
      '200: encrypted credential retained and metadata returned. Referencing service declarations return to pending review. No provider secrets can be selected.',
  },
  readApplicationObligations: {
    title: 'Check your application agreements',
    group: 'Application agreements',
    audience: 'Application developer',
    purpose:
      'See the transactions, network services and fee terms your application submitted, and whether the provider accepted each one.',
    whenToUse:
      'Use before changing an agreement or investigating why wallet setup or transactions are blocked.',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use your application token. Read the saved revisions before preparing an agreement update.',
    success:
      '200: your action, service and fee declarations with their review decisions. Submit changed terms through the matching agreement endpoint, then wait for provider acceptance.',
  },
  readProviderApplicationObligations: {
    title: 'Review an application’s submitted agreements',
    group: 'Application agreements',
    audience: 'Service operator',
    purpose:
      'See one application’s proposed transactions, network services and fee terms before deciding whether to accept them.',
    whenToUse:
      'Use during application onboarding and after agreement changes. Applications read their own agreements through the separate application route.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use a provider operator token and the selected application ID.',
    success:
      '200: the selected application’s declarations, revisions and decisions. Review the matching connection metadata and policy before accepting each declaration.',
  },
  submitApplicationActions: {
    title: 'Submit the transactions your application needs',
    group: 'Application agreements',
    audience: 'Application developer',
    purpose:
      'Describe the business actions and supporting information your application expects to submit for provider review.',
    whenToUse:
      'Use during application setup or when supported business actions change. Send field definitions, not an actual person’s transaction data.',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Use your application token, the current action-declaration revision and a UUIDv4 idempotency key. Submit action definitions and required fields, never actual user payloads.',
    success:
      '200: a saved action declaration awaiting provider review. Send its current revisions to the provider operator for a decision. This does not publish call policy or authorize a transaction.',
  },
  submitApplicationServices: {
    title: 'Submit the network services your application will use',
    group: 'Application agreements',
    audience: 'Application developer',
    purpose:
      'Declare the network-reading and verification services the application will pay for and their saved connection references.',
    whenToUse:
      'Use after saving service connections, or when the selected services change. Submit references rather than secret values.',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Save application-owned service connections first. Use your application token, the current service-declaration revision and a UUIDv4 idempotency key. Submit opaque saved references rather than secrets.',
    success:
      '200: saved service declarations awaiting provider review. Changes require a new provider decision before eligible connections can be used.',
  },
  configureProviderConnections: {
    title: 'Save and approve application blockchain connections',
    group: 'Network connections and fees',
    audience: 'Service operator',
    purpose:
      'Save encrypted application-scoped RPC URLs and approve their verification, submission and observation roles in one revision.',
    whenToUse:
      'Use the administration console to configure or replace the complete connection set for one application and selected network.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Authenticate as a current provider operator with an enabled application. Supply the expected services revision, HTTPS endpoints and a UUIDv4 idempotency key. Independent verification requires two different origins.',
    success:
      '200: accepted service declarations. Endpoint secrets are never returned. Connections remain subject to chain and contract checks; saving neither deploys contracts nor enables user wallets.',
  },
  proposeProviderSponsorship: {
    title: 'Offer application network-fee terms',
    group: 'Application agreements',
    audience: 'Service operator',
    purpose:
      'Set the network, fee limits and wallet limits the provider offers to a connected application.',
    whenToUse:
      'Use to create or replace fee terms before the application accepts and funds its dedicated address.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use a current operator token, application ID, expected fee-agreement revision and UUIDv4 idempotency key.',
    success:
      '200: pending provider-offered terms. The application must accept the exact revision before infrastructure spending or sponsorship; saving does not activate execution.',
  },
  acceptProviderSponsorship: {
    title: 'Accept or decline provider network-fee terms',
    group: 'Application agreements',
    audience: 'Application developer',
    purpose:
      'Record whether this application agrees to the provider’s current network-fee limits and funding terms.',
    whenToUse:
      'Read the offered terms first, then accept the exact revision before funding or requesting infrastructure preparation.',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Use the target application token, current agreement and decision revisions, and UUIDv4 idempotency key. Only provider-offered sponsorship can be accepted here.',
    success:
      '200: the application’s decision on the exact provider-offered revision. Funding, readiness and current transaction authority remain separate requirements.',
  },
  submitApplicationSponsorship: {
    title: 'Submit who pays network fees and the limits',
    group: 'Application agreements',
    audience: 'Application developer',
    purpose:
      'Declare the application’s agreement to pay eligible network fees, with bounded costs and account limits.',
    whenToUse:
      'Use before preparing fee-paying infrastructure or changing fee terms. Saving this agreement does not transfer money or fund the address.',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Use your application token, the current fee-agreement revision and a UUIDv4 idempotency key. Include bounded funding and account limits for the configured network.',
    success:
      '200: a saved fee agreement awaiting provider review. After acceptance, the provider can prepare the application’s fee infrastructure and the application can fund its returned address.',
  },
  decideApplicationActions: {
    title: 'Accept or decline an application’s transactions',
    group: 'Application agreements',
    audience: 'Service operator',
    purpose:
      'Record your decision on the current submitted business actions and information requirements.',
    whenToUse:
      'Use after reviewing an application’s transaction declaration. Acceptance alone does not publish transaction rules or approve anyone’s spending.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use a provider operator token, the application ID, current declaration and decision revisions, and a UUIDv4 idempotency key.',
    success:
      '200: accepted or rejected action definitions. Acceptance constrains supporting transaction data; the active call policy, owner consent and every transaction check remain required.',
  },
  decideApplicationServices: {
    title: 'Accept or decline an application’s network services',
    group: 'Application agreements',
    audience: 'Service operator',
    purpose:
      'Record whether the declared network services and saved connection origins are acceptable.',
    whenToUse:
      'Use after reviewing the current service declaration and connection metadata. Acceptance permits eligible connections to be used; it does not fund them.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Review the declared services and credential origins. Use a provider operator token, both current revisions and a UUIDv4 idempotency key.',
    success:
      '200: accepted or rejected service declarations. Accepted references can resolve only application-owned credentials when credential storage is configured.',
  },
  decideApplicationSponsorship: {
    title: 'Accept or decline an application’s fee agreement',
    group: 'Application agreements',
    audience: 'Service operator',
    purpose:
      'Record your decision on who pays network fees and the proposed cost limits.',
    whenToUse:
      'Use before preparing application fee infrastructure, and whenever fee terms change. Actual funding remains a separate step.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Review the network, funding agreement and limits. Use a provider operator token, both current revisions and a UUIDv4 idempotency key.',
    success:
      '200: accepted or rejected fee terms. Acceptance permits eligible infrastructure setup; it does not fund gas or approve user transactions.',
  },
  listApplicationConfigurations: {
    title: 'Find an application and its setup progress',
    group: 'Application agreements',
    audience: 'Application developer or service operator',
    purpose:
      'List visible application setups and optionally load one application’s current rules and recent proposals.',
    whenToUse:
      'Use for a setup dashboard. Operators can inspect their configured applications; applications can see only their own setup.',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use application configuration read scope or an exact configured provider operator with configuration write scope. Supply application_id to load one application’s policy and latest 20 proposals. Application callers cannot select another namespace.',
    success:
      '200: enabled application summaries and selected policy/proposal details. The provider sees its configured applications; applications see only their own registration. No spending authority is granted.',
  },
  listWalletBatches: {
    title: 'See recent transaction requests',
    group: 'Transactions',
    audience: 'Application developer or service operator',
    purpose:
      'List the transaction requests you may read, including their queue stages and retained verified outcomes.',
    whenToUse:
      'Use for history and monitoring. Read an individual transaction’s current status through the wallet endpoint when an observation is still pending.',
    scope: 'wallet:execute:read',
    walletCalls: true,
    runtimeConfiguration: true,
    prerequisite:
      'Applications need current owner account-read access and execute read scope. Exact configured provider operators can inspect the provider ledger using configuration write scope. No application token can become an operator through scopes alone.',
    success:
      '200: up to 100 readable batch summaries, queue stages and retained finalized RPC-quorum receipts. Unfinalized observations remain pending in this list; applications can refresh individual wallet_getCallsStatus results. Listing never signs, submits or retries.',
  },
  setApplicationTransactionMode: {
    title: 'Choose transaction permissions for a trusted application',
    group: 'Transaction rules',
    audience: 'Provider operator',
    purpose:
      'Allow an approved application to submit arbitrary external contract calls and native transfers without transaction proposals or contract restrictions.',
    whenToUse:
      'Choose unrestricted mode only for an application you trust to enforce transaction rules. Restricted mode is the default.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use provider operator credentials, the runtime application ID, selected Wallet-Network, expected_revision and an original UUIDv4 Idempotency-Key. The application must be active with an accepted user-check agreement.',
    success:
      '200: a published authority revision. Current identity, ownership, consent, Safe control checks and network-fee limits remain enforced. Mode changes require fresh transaction consent. Returning to restricted mode clears allowed contracts; publish transaction rules before execution.',
  },
  setRuntimeReviewMode: {
    title: 'Choose how future transaction-rule changes are reviewed',
    group: 'Transaction rules',
    audience: 'Service operator',
    purpose:
      'Choose manual review or limited automatic publication for future application contract and method changes.',
    whenToUse:
      'Optional: use after publishing baseline rules. Automatic review accepts only changes whose provider-controlled terms exactly match the current policy; it does not approve existing pending proposals.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Publish a baseline policy first. An exact configured provider operator chooses automatic or manual review using both expected_revision and expected_review_revision with a UUID idempotency key. Choose the review mode explicitly.',
    success:
      '200: a durable review decision. Automatic mode publishes subsequent contract/method changes only when provider terms exactly match the enabled current policy. Claims, value/call limits, validity, enablement and chain remain provider controlled. Existing pending proposals are not retroactively accepted.',
  },
  streamWalletCallsStatus: {
    title: 'Follow a transaction’s progress live',
    group: 'Transactions',
    audience: 'Application developer',
    purpose:
      'Receive status updates for an admitted transaction request without repeatedly polling.',
    whenToUse:
      'Optional: use for live progress in your interface. Poll wallet_getCallsStatus through the wallet endpoint if you do not need a stream.',
    scope: 'wallet:execute:read',
    walletCalls: true,
    prerequisite:
      'Retain the admitted batch ID and use an authenticated fetch stream. Account ownership and batch access are checked before opening; authorization is checked before each update. Reconnect after 55 seconds or use wallet_getCallsStatus.',
    success:
      '200: text/event-stream status events after durable observations. Preconfirmation remains pending; verified inner execution determines success. Connections are bounded to two per account, 16 per application and 64 per service.',
  },
  walletCallsRpc: {
    title: 'Send a transaction or check its result',
    group: 'Transactions',
    audience: 'Application developer',
    purpose:
      'Request approved contract calls, discover wallet call capabilities, or check a retained transaction result through one wallet endpoint.',
    whenToUse:
      'Use after wallet access, transaction rules and fee funding are ready. Choose wallet_sendCalls to submit or wallet_getCallsStatus to inspect; these methods have different effects and permissions.',
    scope: 'wallet:access:read',
    walletCalls: true,
    prerequisite:
      'Enable Safe wallet calls. The account endpoint binds the authenticated application and current owner. Send requires wallet:actions, wallet:sign and wallet:execute plus contracts:request consent; status/discovery require wallet:execute:read.',
    success:
      '200: a JSON-RPC result or sanitized RPC error. Use EIP-5792 version 2.0.0, retain the batch ID and poll wallet_getCallsStatus. Inclusion is distinct from finality. HTTP authentication/readiness failures use the normal problem envelope.',
  },
  readRuntimeApplicationConfiguration: {
    title: 'Review an application’s current transaction rules',
    group: 'Transaction rules',
    audience: 'Service operator',
    purpose:
      'Inspect the active transaction rules for a selected application before approving or changing them.',
    whenToUse:
      'Use for provider review. The separate application route lets an application read only its own current rules.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use a separately configured provider operator token. Application tokens cannot read another application’s registry or publish changes.',
    success:
      '200: the current durable publication and predecessor information. Read it before preparing a compare-and-set policy update. Configuration does not authorize spending.',
  },
  readRuntimeConfiguration: {
    title: 'See your application’s current transaction rules',
    group: 'Transaction rules',
    audience: 'Application developer',
    purpose:
      'Read the active allowed calls, identity claims and transaction limits before requesting permission or preparing a change.',
    whenToUse:
      'Use during application integration and before proposing changes. This reads the published policy, not business declarations or anyone’s wallet permission.',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use your registered application token with configuration-read permission.',
    success:
      '200: the current published transaction policy and its revision, or the unpublished state. Retain the revision before proposing changes and show current terms before collecting transaction consent.',
  },
  readRuntimeConfigurationRevision: {
    title: 'Look up an earlier version of transaction rules',
    group: 'Transaction rules',
    audience: 'Application developer',
    purpose:
      'Read an immutable published rules version to understand which terms applied at that point.',
    whenToUse:
      'Optional: use for audit and troubleshooting. Reading history does not reactivate those rules or restore wallet permission.',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use your application token and the exact saved policy revision. Historical versions remain immutable.',
    success:
      '200: the requested historical publication. Compare it with the current policy when investigating a request; its presence does not make it current.',
  },
  proposeRuntimeConfiguration: {
    title: 'Submit transaction-rule changes for review',
    group: 'Transaction rules',
    audience: 'Application developer',
    purpose:
      'Propose the contract calls and limits your application needs without publishing them yourself.',
    whenToUse:
      'Use when initially configuring transactions or requesting changes. A provider operator reviews and publishes the proposal unless an explicitly enabled automatic-review rule applies.',
    scope: 'wallet:configuration:propose',
    runtimeConfiguration: true,
    prerequisite:
      'Read the current policy first. Use your application token, expected_revision and an original UUIDv4 idempotency key.',
    success:
      '200: a durable proposal and its outcome. Keep its ID and inspect it through the proposal-status endpoint. Publication follows the provider’s explicit review mode; proposing never authorizes spending.',
  },
  readRuntimeConfigurationProposal: {
    title: 'Check a transaction-rule proposal',
    group: 'Transaction rules',
    audience: 'Application developer',
    purpose:
      'Inspect a saved proposal to see its requested rules and publication outcome.',
    whenToUse:
      'Use after submitting a proposal or losing its response. Keep its ID so you can check the original request.',
    scope: 'wallet:configuration:read',
    runtimeConfiguration: true,
    prerequisite:
      'Use your application token and the original proposal ID. Applications cannot inspect another application’s proposals.',
    success:
      '200: the retained proposal and any publication result. If it still needs manual review, ask the provider operator to review that proposal rather than submitting duplicates.',
  },
  publishRuntimeConfiguration: {
    title: 'Approve and publish proposed transaction rules',
    group: 'Transaction rules',
    audience: 'Service operator',
    purpose:
      'Make a reviewed application proposal the active transaction policy.',
    whenToUse:
      'Use for the normal proposal-and-review workflow. This is separate from accepting business declarations; publication defines the exact calls and limits that may be requested.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Read the proposal and current policy. Use a provider operator token, the proposal ID, expected_revision and a UUIDv4 idempotency key.',
    success:
      '200: the published policy revision, effective without restart. Applications must read the new terms and obtain any required fresh consent. The published rules do not authorize a transaction by themselves.',
  },
  updateRuntimeConfiguration: {
    title: 'Set transaction rules directly as the provider',
    group: 'Transaction rules',
    audience: 'Service operator',
    purpose:
      'Publish a provider-authored rules version without first creating an application proposal.',
    whenToUse:
      'Alternative setup path: use for a baseline or provider-controlled policy change. Use proposal publication instead when reviewing an application’s saved proposal; both retain version history.',
    scope: 'wallet:configuration:write',
    runtimeConfiguration: true,
    prerequisite:
      'Use a provider operator token, the application ID, current expected_revision and a UUIDv4 idempotency key. Submit a complete reviewed policy.',
    success:
      '200: a new immutable policy publication, effective without restart. Earlier publications remain available for audit. Applications still need current owner consent and approved agreements before transactions.',
  },
  readProviderNetworks: {
    management: true,
    title: 'Review the networks your service offers',
    group: 'Service administration',
    scope: 'provider:manage',
    audience: 'Service operator',
    purpose:
      'See saved network choices and whether a restart is needed to apply them.',
    whenToUse:
      'Use the Networks page in administration, or this request for management tools.',
    prerequisite:
      'Use a current provider administrator or management-tool token.',
    success:
      '200: the fixed default, saved choices, running choices and restart requirement. Network selection does not grant spending authority.',
  },
  readNetworkExecution: {
    title: 'Check wallet execution on a network',
    group: 'Service administration',
    audience: 'Provider operator',
    purpose:
      'Read the retained execution setting, completed-check references and running readiness for one configured network.',
    whenToUse:
      'Use Networks & execution in the portal or read before changing a network setting.',
    scope: 'provider:manage',
    management: true,
    prerequisite:
      'Use a current provider management token and a network already running on this instance.',
    success:
      '200: the current revision, enabled setting and readiness. Enabled does not prove application funding or wallet readiness.',
  },
  saveNetworkExecution: {
    title: 'Enable or pause wallet execution on a network',
    group: 'Service administration',
    audience: 'Provider operator',
    purpose:
      'Apply a durable network execution setting without restarting the service.',
    whenToUse:
      'Enable after completing wallet setup and recovery checks, or pause new requests during maintenance.',
    scope: 'provider:manage',
    management: true,
    prerequisite:
      'Supply expected_revision, an original UUIDv4 Idempotency-Key and enabled. Enabling needs backendAcceptance and recoveryAcceptance references. Mainnet enabling also requires mainnet_confirmed: true.',
    success:
      '200: saved setting and current readiness. Changing the setting fences prior transaction consent and pending authority on that network. Issued signatures and submitted transactions may still execute. Other networks and application permissions remain separate.',
  },
  saveProviderNetworks: {
    management: true,
    title: 'Choose the networks your service offers',
    group: 'Service administration',
    scope: 'provider:manage',
    audience: 'Service operator',
    purpose:
      'Save network choices while preserving the default used by existing applications.',
    whenToUse:
      'Use when adding or removing a network, then restart the provider to apply the saved choices.',
    prerequisite:
      'Read the current revision first. Keep the default selected. Additional networks start disabled and need separate application agreements and funding.',
    success:
      '200: saved choices and restart requirement. Existing wallets and previously issued transactions are retained.',
  },
  listNetworks: {
    title: 'Choose a wallet network',
    group: 'Service status',
    audience: 'Application developer',
    purpose:
      'Discover the networks offered by this instance and its default for existing integrations.',
    whenToUse:
      'Read before presenting a network choice or configuring an application’s network services.',
    prerequisite:
      'No token is needed. Select a network with Wallet-Network on access-policy, access-request and application-configuration calls. Stored account, request and grant IDs route automatically.',
    success:
      '200: network names, chain IDs and execution status. Each network needs its own wallet consent, transaction rules and fee funding.',
  },
  getCapabilities: {
    title: 'Check the service connection',
    group: 'Service status',
    audience: 'Anyone connecting an application',
    purpose:
      'Confirm that the provider responds and see whether it is configured for wallet operations.',
    whenToUse:
      'Start here when connecting or troubleshooting. This public request needs no token.',
    prerequisite:
      'No token is needed. The configured field says whether the service is ready for wallet operations.',
    success:
      '200: the service profile and configured status. A 200 response confirms that discovery works; check configured before trying wallet operations.',
  },
  createAccountWithoutKyc: {
    title: 'Create an account before KYC',
    group: 'Wallet access',
    audience: 'Application developer',
    applicationLed: true,
    scope: 'wallet:access',
    purpose:
      'Bind a new account to your application and stable user reference before identity information is available.',
    whenToUse:
      'Use when the person needs a wallet address before completing identity checks.',
    prerequisite:
      'Your application must have an accepted identity trust agreement. Supply user_id and a saved idempotency key. Named wallets can include their wallet description. This endpoint does not create a grant.',
    success:
      '200: account_id, wallet and verification_required status. Call provisionAccount as the creating application to obtain the Safe address. Submit KYC drafts through updateAccountKyc and complete verified identity and fresh consent through requestAccountAccess before transactions.',
  },
  getAccountKyc: {
    title: 'Read the account’s draft KYC',
    group: 'Wallet access',
    audience: 'Application developer',
    applicationLed: true,
    scope: 'wallet:access',
    purpose:
      'Read saved identity fields and the revision needed for the next incremental update.',
    whenToUse:
      'Use before editing KYC or to recover the current draft after a response is lost.',
    prerequisite:
      'Authenticate as the original creating application. Shared wallet access does not allow reading another application’s KYC draft.',
    success:
      '200: revision, draft fields and missing_fields. Draft completeness does not establish verified identity or transaction authority.',
  },
  updateAccountKyc: {
    title: 'Add or correct the account’s KYC',
    group: 'Wallet access',
    audience: 'Application developer',
    applicationLed: true,
    scope: 'wallet:access',
    purpose:
      'Merge configured identity fields into a draft while preserving omitted fields.',
    whenToUse:
      'Use as identity information arrives or existing facts need correction.',
    prerequisite:
      'Authenticate as the original creating application. Supply expected_revision from getAccountKyc, configured fields and a saved idempotency key. Null removes a field. A changed request needs a new key.',
    success:
      '200: the saved draft and advanced revision. Existing identity acceptance and grants across the owner’s wallets are invalidated. Fresh verified evidence and consent are required for transactions. Stale revisions and changed retries return 409.',
  },
  requestAccountAccess: {
    title: 'Submit a person’s checks and wallet permission',
    group: 'Wallet access',
    audience: 'Application developer',
    purpose:
      'Ask the provider to accept completed identity checks and the person’s recorded permission, then obtain account access IDs.',
    whenToUse:
      'Use after reading the access requirements and obtaining consent inside the application. Creating or reconnecting access is separate from creating the blockchain wallet.',
    scope: 'wallet:access',
    prerequisite:
      'After the person completes the agreed identity checks and approves wallet access in your application, submit those records here. First read GET /v1/access-policy for the required fields and current terms. Use mode=create without wallet to preserve the default Personal account. To add a wallet, supply wallet.reference, name and kind (personal or shared), and consent.wallet_reference. A verified user can omit identity while their saved checks remain current. Each wallet needs its own consent. Use mode=connect with account_id and consent.account_id to renew a selected wallet; invited members also supply consent.membership_revision. To request a wallet from a selected source application, read GET /v1/access-policy?source_application_id=SOURCE_CONNECTION_ID, then use mode=connect_from_application and source_application_id without account_id. Omit source_account_id to connect the source Personal wallet, or select another source_account_id and include consent.account_id. Include the returned sharing revision and source application in fresh consent for the requesting application. All configured identity fields must match exactly; ambiguous matches are denied. The provider must trust your application’s checks. Hosted compatibility mode uses a separate provider login and review.',
    success:
      '200: the access decision. Application receipts include saved consent metadata. Omitted consent.reference is assigned by the provider; omitted consent policy revisions bind current terms, and omitted identity.level uses the agreed application level. Explicit mismatches are rejected. Consent times and valid identity evidence remain required. A granted response includes account_id, grant_id, allowed actions and expiry. Save those IDs, then let the creating application provision the blockchain wallet. Shared-wallet account requests require Wallet-Grant-Id; use the selected person’s grant_id. List consented wallets with POST /v1/accounts/query. Reconnecting preserves the existing account. This request does not create an on-chain wallet or send money. Missing, stale or unauthorized evidence is rejected; consent_url is only for hosted compatibility mode.',
  },
  getAccountAccessPolicy: {
    title: 'See what to collect before connecting a wallet',
    group: 'Wallet access',
    audience: 'Application developer',
    purpose:
      'Learn which identity information, check age and consent terms your application must meet before requesting wallet access.',
    whenToUse:
      'Use before asking someone for permission, and after shared requirements or transaction policies change.',
    scope: 'wallet:access:read',
    prerequisite:
      'Call this before asking a person for wallet permission. Use your application token to learn which identity information to send, how recent the checks must be and how long permission can last. The provider operator sets these shared requirements under User checks in administration; this endpoint reads them and does not change settings or return customer records.',
    success:
      '200: required_fields lists the identity field names; verification_level is the agreed check label. max_identity_age_days limits check age and max_access_days limits permission duration. Show the requested actions and terms, record the person’s consent to policy_revision (and action_policy_revision for transactions), then submit POST /v1/access-requests. For cross-application access, supply source_application_id as a query parameter to receive wallet_sharing.matching_fields and wallet_sharing.revision. Record consent to that revision and source application. Reading these requirements does not grant wallet access.',
  },
  submitAccountAccessRecords: {
    records: true,
    title: 'Submit identity records for a read-only evaluation',
    group: 'Optional identity integrations',
    audience: 'Host integration developer',
    purpose:
      'Submit a batch of application records into the optional hosted, unfunded evaluation flow.',
    whenToUse:
      'Use only when application-record evaluation is explicitly configured. The standard application-led flow submits each person’s evidence with POST /v1/access-requests instead.',
    scope: 'wallet:access',
    prerequisite:
      'Select application-record evaluation in provider policy. Read GET /v1/access-policy, then submit up to 50 records in a body no larger than 512 KiB. Each reference must be unique within the batch and fields must contain every required policy field. Only required fields are retained. Keep the batch idempotency key; a changed batch requires a new key.',
    success:
      '200: an indexed result for each record. Complete records receive their own access request and consent URL; incomplete or duplicate records are marked invalid. Replaying the original batch resumes its requests without duplicate creation. Submission makes no wallet or vendor call. Owner consent and explicit provider review are still required.',
  },
  revokeAccountAccess: {
    applicationLed: true,
    title: 'Disconnect an application from a person’s wallet',
    group: 'Wallet access',
    audience: 'Application developer',
    purpose:
      'End the application’s saved wallet permission when the person withdraws consent.',
    whenToUse:
      'Use when the person chooses Disconnect or withdraws wallet access in your application. Reconnecting requires new consent; existing signatures cannot be recalled.',
    scope: 'wallet:access',
    prerequisite:
      'Use the grant_id returned to this application and the same caller. Send an empty JSON body. Your application must provide the user’s access-revocation control and call this endpoint when consent is withdrawn.',
    success:
      '200: revoked. Current wallet access and subsequent signing are denied. Already issued signatures are not cancelled. A renewed grant requires fresh consent evidence and a new request.',
  },
  getAccountAccessRequest: {
    title: 'Check whether wallet access was approved',
    group: 'Wallet access',
    audience: 'Application developer',
    purpose:
      'Look up the decision for a saved access request and recover its returned account and permission details.',
    whenToUse:
      'Use after requesting access, after a lost response, or while a hosted review is pending. This does not submit new evidence or create a wallet.',
    scope: 'wallet:access:read',
    prerequisite:
      'Use the returned request_id and a token for the same application and caller. Application-led access is decided from the trusted application’s submitted identity and consent evidence. Hosted compatibility mode requires its separate browser steps.',
    success:
      '200: the current request status. granted includes account and access-grant details. For funding_approval_required, arrange identity funding; for provider_review_required, wait for staff review; for reconciliation_required, ask the operator to investigate the original attempt.',
  },
  importAccessIdentity: {
    vendor: true,
    title: 'Reuse checks from an identity-verification service',
    group: 'Optional identity integrations',
    audience: 'Host integration developer',
    purpose:
      'Import shared verification evidence for a pending hosted identity request using a vendor sharing token.',
    whenToUse:
      'Use only for a separately configured hosted identity integration, with owner consent and agreed vendor funding. It is not used by the standard application-led flow.',
    scope: 'wallet:access',
    prerequisite:
      'Obtain owner consent and a valid share token from the selected identity vendor. Configure the recipient workflow, agreed import price and application funding first. Provider staff still review the imported evidence.',
    success:
      '200: the updated access request status. Vendor approval does not grant wallet access. If the import outcome is unknown, investigate that attempt before requesting another import.',
  },
  readGrantedAccount: {
    title: 'See a person’s wallet account details',
    group: 'Wallet access',
    audience: 'Application developer',
    purpose:
      'Read an approved account’s status and, once provisioned, its receiving address.',
    whenToUse:
      'Use for the wallet overview or to check whether wallet creation completed. The transaction-wallet read provides the execution address and chain once transaction access is ready.',
    scope: 'wallet:account:read',
    permission: 'account:read',
    prerequisite:
      'The same application and caller need current account:read permission for this owner’s account, with accepted identity evidence.',
    success:
      '200: accepted or provisioned account status. An address is present after provisioning.',
  },
  provisionAccount: {
    title: 'Create the person’s blockchain wallet',
    group: 'Wallet access',
    audience: 'Application developer',
    purpose:
      'Create or locate the Safe wallet using current approved access or creator-only setup authority for an account created without KYC.',
    whenToUse:
      'Use after createAccountWithoutKyc returns an account ID, or after requestAccountAccess grants access. Keep the original retry key if creation is pending or its outcome is uncertain.',
    scope: 'wallet:provision',
    prerequisite:
      'Supply an empty JSON body and the saved account_id. Verified accounts need current transaction consent. For an account created without KYC, only its creating application can provision it, without a Wallet-Grant-Id header. Accepted fee terms, funded infrastructure and service readiness remain required. Keep the original idempotency key for retries; uncertain setup retains its durable attempt.',
    success:
      '200: the user Safe account address and provisioning status. Deployment uses accepted application infrastructure. Pending deployment retains its original attempt; retry with the same identity. Wallet creation does not grant spending permission.',
  },
  beginEnrollment: {
    title: 'Start a custom provider-login identity flow',
    group: 'Optional identity integrations',
    audience: 'Host integration developer',
    purpose:
      'Reserve an identity-enrollment request and a login challenge for a custom host-owned identity integration.',
    whenToUse:
      'Use only when embedding the separate EnrollmentService with your own identity and authority integration. It is not available in the standard configured service.',
    scope: 'wallet:enroll',
    enrollment: true,
    prerequisite:
      'Compose the separate EnrollmentService with host-owned durable authority and OIDC identity verification. This profile is unavailable in the configured setup service and cannot be combined with application access onboarding.',
    success:
      '201: reserved enrollment/account IDs and a nonce-bound identity challenge. No wallet or spending grant is created.',
  },
  submitEnrollmentIdentity: {
    title: 'Submit identity proof from a custom provider login',
    group: 'Optional identity integrations',
    audience: 'Host integration developer',
    purpose:
      'Submit the completed provider-login identity proof for a reserved enrollment request.',
    whenToUse:
      'Use only in the custom EnrollmentService flow, after its nonce-bound login. This does not grant application wallet access or spending authority.',
    scope: 'wallet:enroll',
    enrollment: true,
    prerequisite:
      'Complete the provider-owned OIDC flow using the reserved nonce. Submit a provider-audience OIDC Identity Assurance ID token only to this identity endpoint; the HTTP Authorization header still requires an application access token.',
    success:
      '200: the provider enrollment decision. A verified identity token does not grant wallet access or spending authority.',
  },
  getEnrollment: {
    title: 'Check a custom identity-enrollment request',
    group: 'Optional identity integrations',
    audience: 'Host integration developer',
    purpose:
      'Read the decision for a previously reserved custom identity enrollment without returning private identity attributes.',
    whenToUse:
      'Use only in the separate EnrollmentService integration. Standard applications check their wallet-access request instead.',
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
      'listNetworks',
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
