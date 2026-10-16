export function httpsUrl(node: { value: unknown }) {
  try {
    const url = new URL(String(node.value));
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
export function httpsOrigin(node: { value: unknown }) {
  return httpsUrl(node) && new URL(String(node.value)).origin === node.value;
}
export function explainIssue(issue: string) {
  const separator = issue.indexOf(': ');
  if (!issue.startsWith('/') || separator < 0) return issue;
  const path = issue.slice(0, separator);
  const reason = issue.slice(separator + 2);
  const area = issue.startsWith('/policy/provider')
    ? 'Provider'
    : /^\/identity\/(didit|sumsub)\/(importPrice|verificationPrice)(?:\/|$)/.test(
          path,
        )
      ? 'Policies'
      : issue.startsWith('/backend')
        ? 'Backend'
        : issue.startsWith('/ownerLogin') ||
            issue.startsWith('/oauth') ||
            issue.startsWith('/identity')
          ? 'Services'
          : issue.startsWith('/policy') || issue.startsWith('/reviewers')
            ? 'Policies'
            : issue.startsWith('/financial')
              ? 'Policies'
              : issue.startsWith('/activation') ||
                  issue.startsWith('/apiExplorer') ||
                  issue.startsWith('/http') ||
                  issue.startsWith('/storage')
                ? 'Deployment'
                : 'Configuration';
  const hints: Record<string, string> = {
    required: 'Complete this setting using the instructions beside the field.',
    uniqueItems: 'Remove duplicate entries.',
    pattern: 'Use the required format shown beside this field.',
    type: 'Use the value format shown beside this field. For secrets, enter a variable name rather than a secret value.',
    minProperties: 'Choose at least one identity vendor.',
    additionalProperties: 'This configuration contains an unsupported field.',
    minimum: 'The value is below the supported minimum.',
    maximum: 'The value exceeds the supported maximum.',
    minLength: 'Enter the required value shown in the field instructions.',
    maxLength: 'Shorten the value to the length allowed by this field.',
    minItems: 'Add or select at least one entry.',
    maxItems: 'Remove entries beyond the limit shown for this setting.',
    enum: 'Choose one of the supported options.',
    const: 'Use the supported configuration version or integration profile.',
    'login configuration is required for hosted access or staff token controls':
      'Configure login in Services for enabled staff token controls or hosted compatibility. Standard wallet users stay in the application.',
    'hosted access requires reviewers':
      'In Policies, add the staff account IDs allowed to review hosted requests.',
    'application-led access uses trusted application attestations, not hosted verification':
      'Keep application-led access selected in Policies and remove hosted identity-vendor settings. Configure application identity requirements and trust agreements instead.',
    'issuers must match /oauth/issuer':
      'Use the same token issuer for each application as in Services.',
    'documentation and enabled registered clients are required; duplicate clients are not allowed':
      'Enable the deployed API explorer, select enabled applications registered in Policies, and remove duplicate application entries.',
    'backendAcceptance and recoveryAcceptance are required when enabled; financial setup also requires tokenAcceptance':
      'Add the wallet backend and recovery test report references. Transfer signing also needs a token signing test report reference.',
    'must be an HTTPS origin':
      'Enter https:// and the Relayer hostname only, without a trailing slash or page path.',
    'duplicate addresses, relayers or signers are not allowed':
      'Use a different Relayer ID, signer ID and wallet address for each signer entry.',
    'must not exceed lifetimeAmount':
      'The maximum per transfer cannot exceed the total limit per account and token.',
    'use an absolute local path or ./ relative path':
      'Use an absolute local module path or a path starting with ./. Follow the advanced setup guide for custom wallet backends.',
    'custom adapters use the advanced setup guide':
      'Custom wallet backends cannot be configured in this wizard. Follow the advanced setup guide for custom adapters.',
    'invalid policy, integration or activation settings':
      'Review the service addresses, application trust agreements, identity/access policy and activation settings using their field instructions.',
  };
  return `${area} — ${fieldLabel(path)}: ${hints[reason] ?? 'Review this setting using its field instructions.'}`;
}

function fieldLabel(path: string): string {
  const labels: Record<string, string> = {
    '/': 'Configuration',
    '/version': 'Configuration version',
    '/policy': 'Access policy',
    '/policy/provider': 'Provider details',
    '/policy/provider/name': 'Provider name',
    '/policy/provider/origin': 'Public wallet service address',
    '/policy/provider/privacyUrl': 'Privacy notice URL',
    '/policy/version': 'Policy version',
    '/policy/identity/maxAgeDays': 'Maximum age of identity checks (days)',
    '/policy/access/mode': 'Access flow',
    '/policy/identity/application/verificationLevel': 'Required identity level',
    '/policy/identity/application/requiredFields': 'Required identity fields',
    '/policy/access/maxAgeDays': 'Maximum access duration (days)',
    '/policy/applications': 'Connected applications',
    '/reviewers': 'Reviewer account IDs',
    '/backend': 'Wallet backend',
    '/backend/kind': 'Wallet backend selection',
    '/backend/module': 'Custom wallet backend module',
    '/backend/binding': 'Wallet environment name',
    '/backend/apiKeyId': 'CDP API key ID variable name',
    '/backend/apiKeySecret': 'CDP API key secret variable name',
    '/backend/walletSecret': 'CDP wallet secret variable name',
    '/backend/vaultDirectory': 'OWS vault directory',
    '/backend/passphrase': 'OWS owner passphrase variable name',
    '/backend/url': 'Relayer service address',
    '/backend/apiKey': 'Relayer API key variable name',
    '/backend/signers': 'Relayer signer entries',
    '/ownerLogin': 'Staff or hosted login',
    '/policy/identity/application': 'Application identity requirements',
    '/policy/identity/records/requiredFields': 'Required record fields',
    '/ownerLogin/issuer': 'Login service issuer URL',
    '/ownerLogin/clientId': 'Wallet login client ID',
    '/ownerLogin/clientSecret': 'Wallet login client secret variable name',
    '/ownerLogin/idTokenAlgorithm': 'Login token signing algorithm',
    '/oauth/issuer': 'Application token issuer',
    '/oauth/audience': 'Wallet API audience',
    '/oauth/jwksUrl': 'Token verification keys URL (JWKS)',
    '/identity': 'Identity verification services',
    '/financial': 'Delegated transfer signing',
    '/financial/token/address': 'Token contract address',
    '/financial/token/name': 'Token signing-domain name',
    '/financial/token/version': 'Token signing-domain version',
    '/financial/token/symbol': 'Token symbol',
    '/financial/token/decimals': 'Token decimals',
    '/financial/maximumAmount': 'Maximum per transfer (base units)',
    '/financial/lifetimeAmount':
      'Total limit per account and token (base units)',
    '/financial/maxValiditySeconds':
      'Time to use a signed authorization (seconds)',
    '/financial/recipients': 'Allowed recipients',
    '/storage/directory': 'Private data directory',
    '/http/host': 'Service listen address',
    '/http/port': 'Service port',
    '/http/documentation': 'Deployed API explorer',
    '/activation': 'Wallet operations after deployment',
    '/activation/enabled': 'Enable wallet operations in this configuration',
    '/activation/backendAcceptance': 'Wallet backend test report reference',
    '/activation/recoveryAcceptance': 'Recovery test report reference',
    '/activation/tokenAcceptance': 'Token signing test report reference',
    '/apiExplorer': 'Application token controls for staff',
    '/apiExplorer/operators': 'Token operator account IDs (sub)',
    '/apiExplorer/clients': 'Applications available for staff tokens',
  };
  const settingPath = path.replace(/\/env$/, '');
  if (labels[settingPath]) return labels[settingPath];
  const application = settingPath.match(
    /^\/policy\/applications\/(\d+)(?:\/(.*))?$/,
  );
  if (application) {
    const fields: Record<string, string> = {
      'assertionTrust/agreement': 'identity and consent trust agreement',
      name: 'name',
      clientId: 'client ID',
      issuer: 'token issuer',
      permissions: 'allowed permissions',
      funding: 'identity funding agreement',
      'funding/agreement': 'funding agreement reference',
      'funding/monthlyLimitMinor': 'monthly identity budget (USD cents)',
    };
    return `Application ${Number(application[1]) + 1} ${fields[application[2] ?? ''] ?? 'settings'}`;
  }
  const explorerClient = settingPath.match(
    /^\/apiExplorer\/clients\/(\d+)(?:\/(.*))?$/,
  );
  if (explorerClient) {
    const fields: Record<string, string> = {
      clientId: 'calling application',
      clientSecret: 'Application client secret variable name',
      scopes: 'Allowed API permissions (scopes)',
    };
    const field = (explorerClient[2] ?? '').replace(/\/\d+$/, '');
    return `Token application ${Number(explorerClient[1]) + 1} — ${fields[field] ?? 'settings'}`;
  }
  const operator = settingPath.match(/^\/apiExplorer\/operators\/(\d+)$/);
  if (operator)
    return `Token operator ${Number(operator[1]) + 1} account ID (sub)`;
  const reviewer = settingPath.match(/^\/reviewers\/(\d+)$/);
  if (reviewer) return `Reviewer ${Number(reviewer[1]) + 1} account ID (sub)`;
  const recipient = settingPath.match(/^\/financial\/recipients\/(\d+)$/);
  if (recipient) return `Recipient ${Number(recipient[1]) + 1} address`;
  const signer = settingPath.match(/^\/backend\/signers\/(\d+)(?:\/(.*))?$/);
  if (signer) {
    const fields: Record<string, string> = {
      relayerId: 'Relayer ID',
      signerId: 'signer ID',
      address: 'wallet address',
      bindingRevision: 'binding revision',
    };
    return `Signer ${Number(signer[1]) + 1} ${fields[signer[2] ?? ''] ?? 'settings'}`;
  }
  const vendor = settingPath.match(/^\/identity\/(didit|sumsub)(?:\/(.*))?$/);
  if (vendor) {
    const fields: Record<string, string> = {
      workflowId: 'workflow ID',
      levelName: 'recipient level name',
      apiKey: 'API key variable name',
      appToken: 'app token variable name',
      secretKey: 'secret key variable name',
      importPrice: 'import price agreement',
      'importPrice/maximumMinor': 'import price limit (USD cents)',
      'importPrice/termsReference': 'import price agreement reference',
      verificationPrice: 'verification price agreement',
      'verificationPrice/maximumMinor': 'verification price limit (USD cents)',
      'verificationPrice/termsReference':
        'verification price agreement reference',
    };
    return `${vendor[1] === 'didit' ? 'Didit' : 'Sumsub'} ${fields[vendor[2] ?? ''] ?? 'settings'}`;
  }
  return 'Configuration setting';
}

export function fieldValidationMessages(guide: string): Record<string, string> {
  if (
    [
      'cdpKeyId',
      'cdpKeySecret',
      'cdpWalletSecret',
      'passphrase',
      'relayerKey',
      'loginSecret',
      'diditKey',
      'sumsubToken',
      'sumsubSecret',
      'applicationSecret',
    ].includes(guide)
  )
    return {
      matches:
        'Enter a variable name using uppercase letters, digits and underscores, starting with a letter. Put the secret value in your server’s private environment, not this field.',
    };
  if (['signerAddress', 'tokenAddress', 'recipient'].includes(guide))
    return {
      matches:
        'Enter the complete address: 0x followed by 40 hexadecimal characters. Copy it from your verified configuration.',
    };
  if (['relayerId', 'signerId'].includes(guide))
    return {
      matches:
        'Copy the registered ID. It must use 1–64 letters, digits, underscores or hyphens.',
    };
  if (guide === 'diditWorkflow')
    return {
      matches:
        'Copy the lowercase UUIDv4 workflow ID from Didit, including its hyphens. A workflow name or session ID cannot be used here.',
    };
  if (['maximumAmount', 'lifetimeAmount'].includes(guide))
    return {
      matches:
        'Enter a positive whole number of token base units, using digits only. Do not include a decimal point or commas.',
    };
  if (guide === 'tokenSymbol')
    return {
      matches:
        'Use 1–12 letters or digits for the token symbol, without spaces.',
    };
  return {};
}
