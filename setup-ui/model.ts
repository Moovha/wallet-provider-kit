import type { ProviderConfiguration } from '../src/deployment/config.js';
export type { ProviderConfiguration };
export type Backend = Exclude<
  ProviderConfiguration['backend'],
  { kind: 'custom' }
>;
export type BackendKind = Backend['kind'];

export const docs = 'https://moovha.github.io/wallet-provider-kit/docs/';
export const backends = [
  {
    kind: 'cdp' as const,
    name: 'Coinbase CDP',
    image: 'coinbase.png',
    description: 'Connect an existing Coinbase Developer Platform project.',
    detail: 'Managed wallet API',
    url: 'https://docs.cdp.coinbase.com/',
    guide: `${docs}setup.html#select-a-built-in-backend`,
  },
  {
    kind: 'ows' as const,
    name: 'Open Wallet Standard',
    image: 'ows.png',
    description: 'Use a private, persistent wallet vault on your own host.',
    detail: 'Local wallet engine',
    url: 'https://docs.openwallet.sh/',
    guide: `${docs}ows-adapter.html`,
  },
  {
    kind: 'openzeppelin-relayer' as const,
    name: 'OpenZeppelin Relayer',
    image: 'openzeppelin.png',
    description:
      'Connect an existing Relayer and its preconfigured signer pool.',
    detail: 'Self-hosted signing service',
    url: 'https://docs.openzeppelin.com/relayer',
    guide: `${docs}openzeppelin-relayer.html`,
  },
];

export function newBackend(kind: BackendKind): Backend {
  if (kind === 'ows')
    return {
      kind,
      binding: '',
      vaultDirectory: '.provider-vault',
      passphrase: { env: 'OWS_OWNER_PASSPHRASE' },
    };
  if (kind === 'openzeppelin-relayer')
    return {
      kind,
      binding: '',
      url: '',
      apiKey: { env: 'RELAYER_API_KEY' },
      signers: [
        { relayerId: '', signerId: '', address: '', bindingRevision: '1' },
      ],
    };
  return {
    kind,
    binding: '',
    apiKeyId: { env: 'WALLET_CDP_API_KEY_ID' },
    apiKeySecret: { env: 'WALLET_CDP_API_KEY_SECRET' },
    walletSecret: { env: 'WALLET_CDP_WALLET_SECRET' },
  };
}

export function emptyConfiguration(
  template: ProviderConfiguration,
): ProviderConfiguration {
  const config = structuredClone(template);
  config.policy.provider = { name: '', origin: '', privacyUrl: '' };
  config.policy.applications = [
    {
      issuer: '',
      clientId: '',
      name: '',
      permissions: ['account:read'],
      assertionTrust: { agreement: '' },
    },
  ];
  config.oauth = { issuer: '', audience: '', jwksUrl: '' };
  delete config.ownerLogin;
  delete config.reviewers;
  config.identity = {};
  config.policy.identity = {
    maxAgeDays: 90,
    application: { requiredFields: ['country'], verificationLevel: 'verified' },
  };
  config.policy.access = { mode: 'application', maxAgeDays: 7 };
  delete config.financial;
  config.backend = newBackend('cdp');
  return config;
}

export function deploymentChecklist(
  config: ProviderConfiguration,
  environment: string[],
  warnings: string[] = [],
) {
  const backend = backends.find((b) => b.kind === config.backend.kind)!;
  const lines = [
    '# Wallet provider deployment checklist',
    '',
    'Your local configuration draft passed completeness and consistency checks. This checklist is the handoff from the wizard to your deployment host; no service has been deployed or updated by the wizard.',
    'Keep provider.config.json (service settings and policy), provider.env.example (secret variable names) and this provider-setup.md checklist together privately. Supply secret values on the deployment host or through its secret manager. Validation has not tested your credentials or external integrations.',
    'Before enabling wallet operations, test your external services, wallet recovery and token signing where configured.',
    `Configure and export in the wizard, deploy with the CLI, then test application-led access through the deployed API explorer. Hosted compatibility deployments also test their owner/reviewer pages. Follow ${docs}staging-walkthrough.html`,
    'If a required login, application, identity or HTTPS service is unavailable, mark the corresponding test as blocked. Offline fixtures cannot validate that external service or your recovery process.',
    `Service activation in this export: ${config.activation.enabled ? 'enabled in this configuration' : 'disabled'}.`,
    '',
    '## Settings to complete before serving users',
    ...warnings.map((warning) => '- ' + warning),
    '',
    '## Register and prepare',
    `- Backend: ${backend.name}. Follow ${backend.url} and ${backend.guide}`,
    ...(config.ownerLogin
      ? [
          `- Register staff/hosted login callback: ${config.policy.provider.origin}/onboarding/callback`,
          '- Configure OIDC code flow, PKCE S256, client_secret_post and fresh signed ID tokens for staff/hosted login.',
        ]
      : []),
    '- Register connected application clients separately. Issue dedicated-audience RFC 9068 at+jwt API tokens with the required wallet scopes and a lifetime no longer than ten minutes.',
    ...(config.policy.access?.mode === 'application'
      ? [
          '- Review each application trust agreement. Test identity and consent attestations, user isolation, revocation and stale evidence through the access API. Users remain in the application.',
        ]
      : config.policy.identity?.records
        ? [
            '- Application-record evaluation: submit only the configured required fields, obtain owner consent and complete provider review. No vendor key or verification budget is required. Do not fund these wallets or enable financial signing.',
          ]
        : [
            '- Configure the selected identity vendor workflows/levels and sharing agreements.',
            '- Confirm the agreed price limit for each identity route and the application’s funding agreement, including for free routes.',
          ]),
    '- Supply these environment variables through the deployment secret store: ' +
      environment.join(', '),
    '- Use one persistent POSIX host. Secure and back up its SQLite data directory; run as its owning unprivileged user.',
    '- Put provider.config.json in a private deployment directory (mode 0600). Relative data/vault paths resolve beside this file.',
  ];
  if (config.backend.kind === 'ows')
    lines.push(
      '- Install @open-wallet-standard/core@1.4.3 and prepare a private vault (0700). Back up the vault AND SQLite. Supply an owner passphrase of 16–4096 characters, never an agent token. The reference Docker image omits the OWS engine.',
    );
  if (config.backend.kind === 'openzeppelin-relayer')
    lines.push(
      '- Provision and verify each Relayer/signer/address binding first. Retain assigned signers and stable backend binding across deployments; never replace them to recover an uncertain result.',
    );
  lines.push(
    '',
    '## Deploy',
    'From the private deployment directory, with secrets supplied by your environment:',
    '',
    '```sh',
    'npx --no-install wallet-provider-kit validate --config provider.config.json',
    'npx --no-install wallet-provider-kit init-storage --config provider.config.json',
    'npx --no-install wallet-provider-kit doctor --config provider.config.json',
    'npx --no-install wallet-provider-kit run --config provider.config.json',
    '```',
    '',
    'Initialize storage only for a new, empty deployment. Existing stores must retain their origin/backend binding.',
    'Expose the service through HTTPS with restricted ingress. Configure container port binding deliberately if using Docker.',
    'The doctor command checks local setup only. Test your external services separately; a successful diagnosis does not confirm that they work.',
    'Complete wallet backend and recovery tests before enabling operations. For transfer signing, also test the exact token contract and signing settings. Record the report references in Deployment, then export and restart.',
    '',
    '## Integrate',
    `- Consume the implemented HTTP API: ${docs}http-api.html`,
    `- Deployment instructions: ${docs}setup.html`,
    '- Experimental Base Sepolia EOA profile only. Signing does not broadcast, sponsor gas or establish settlement.',
    '- To update settings, import your saved configuration in the wizard, edit, validate and export again. Deploy the reviewed files and restart the service. Policy changes invalidate previous grants and approvals; applications need consent to the current terms before requesting fresh access.',
    '- Stop the local setup wizard with Ctrl+C when finished.',
    '',
  );
  return lines.join('\n');
}
