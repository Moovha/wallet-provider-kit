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
  delete config.execution;
  delete config.activation.executionAcceptance;
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
    'Your configuration draft passed completeness and consistency checks. This checklist covers manual deployment. Downloading it does not deploy or update a service; the wizard offers a separate explicit local container setup action.',
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
  if (config.execution?.service)
    lines.push(
      `- Deploy and accept the separate execution service using ${docs}execution-service.html. Match provider/sponsor policy and service public keys on both sides; keep owner signing keys outside the executor. Back up and recover both stores without replacing execution identities.`,
    );
  if (config.execution)
    lines.push(
      `- Configure the dedicated application gas sponsors, private RPC endpoint variables and independent receipt verification described in ${docs}execution.html. Test lost-response recovery and record execution acceptance before activation. Gas admission reservations do not guarantee a hard cap on Relayer recovery or L1 costs.`,
    );
  lines.push(
    '',
    '## Prepare the deployment host and files',
    `Follow ${docs}operator-deployment.html for the complete native and container paths. The commands below use a source checkout on the deployment host, with Node 24.22.0 and npm 11.11.1. For an installed tarball, use its installed executable as described in the package guide.`,
    'Build the same reviewed toolkit revision used by the wizard. From that built checkout:',
    '',
    '```sh',
    'export PROVIDER_SOURCE="$PWD"',
    'export PROVIDER_STATE="$HOME/wallet-provider-state"',
    'umask 077',
    'mkdir -p "$PROVIDER_STATE"',
    'chmod 700 "$PROVIDER_STATE"',
    '```',
    '',
    'Use your private persistent deployment directory instead if preferred. Copy all three downloaded files there using your approved file-transfer tool. Rename provider.env.example to provider.env in that directory, then protect the files:',
    '',
    '```sh',
    'chmod 600 "$PROVIDER_STATE/provider.config.json" "$PROVIDER_STATE/provider.env" "$PROVIDER_STATE/provider-setup.md"',
    '```',
    '',
    'Open provider.env privately and fill its NAME=value entries with the issued secrets. Do not paste values into shell commands or source the file as a shell script. The service does not load this file automatically; the native commands below explicitly load it. If your secret manager injects these variables directly, omit --env-file. Existing process variables take precedence.',
    'Relative data and vault directories resolve beside provider.config.json. Follow the deployment guide to prepare private directories and, for OWS, its separate retained vault. Use the reference container instructions for Docker rather than these native start commands.',
    '',
    '## Validate, initialize once and start disabled',
    'Run as the unprivileged service account, with the path variables above set:',
    '',
    '```sh',
    'node "$PROVIDER_SOURCE/dist/main.js" validate --config "$PROVIDER_STATE/provider.config.json"',
    'node --env-file="$PROVIDER_STATE/provider.env" "$PROVIDER_SOURCE/dist/main.js" init-storage --config "$PROVIDER_STATE/provider.config.json"',
    'node --env-file="$PROVIDER_STATE/provider.env" "$PROVIDER_SOURCE/dist/main.js" doctor --config "$PROVIDER_STATE/provider.config.json"',
    'node --env-file="$PROVIDER_STATE/provider.env" "$PROVIDER_SOURCE/dist/main.js" run --config "$PROVIDER_STATE/provider.config.json"',
    '```',
    '',
    'Initialize storage only for a new, empty deployment. Skip init-storage on subsequent restarts and retain the origin/backend binding. Run never creates a missing store. Doctor checks local prerequisites, not external-service connectivity or credentials.',
    'Start with activation disabled. Liveness should return HTTP 200 and readiness HTTP 503 while disabled; wallet mutations cannot dispatch. This is expected for initial deployment. The wizard port is unrelated to the deployed service port.',
    'Add HTTPS ingress and private persistent backups using the deployment guide. Test application authority, wallet backend and recovery. Some end-to-end acceptance checks require an isolated test deployment with reviewed evidence and explicit activation; follow the staging walkthrough before admitting wider traffic.',
    'After acceptance, reopen the wizard and import provider.config.json. Record the actual backend/recovery reports in Deployment, plus the token report if signing. Enable wallet operations, validate and export again. Stop the service, replace the reviewed configuration, validate/diagnose and restart with the same storage and binding. No file is hot-reloaded.',
    '',
    '## Integrate',
    `- Consume the implemented HTTP API: ${docs}http-api.html`,
    `- Deployment instructions: ${docs}operator-deployment.html`,
    '- Experimental Base Sepolia EOA profile only. Signing alone does not submit a transaction. Optional execution requires a dedicated sponsor and independent RPC acceptance; otherwise the application owns submission and settlement verification.',
    '- To update settings, import your saved configuration in the wizard, edit, validate and export again. Deploy the reviewed files and restart the service. Policy changes invalidate previous grants and approvals; applications need consent to the current terms before requesting fresh access.',
    '- Stop the local setup wizard with Ctrl+C when finished.',
    '',
  );
  return lines.join('\n');
}
