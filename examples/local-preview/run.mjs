import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { generateDeploymentSecrets } from '../../dist/deployment/deployment-secrets.js';
import { createConfiguredProvider } from '../../dist/deployment/provider.js';
import { openProviderDatabase } from '../../dist/storage/index.js';
import { apiTokenScopes } from '../../dist/service/api-token-scopes.js';

const args = process.argv.slice(2);
if (args.length > 1)
  throw new Error('Usage: npm run preview:local -- [private-directory]');
const directory = resolve(args[0] ?? 'artifacts/local-preview');
await mkdir(directory, { recursive: true, mode: 0o700 });
const info = await lstat(directory);
if (
  info.isSymbolicLink() ||
  info.mode & 0o077 ||
  info.uid !== process.getuid?.()
)
  throw new Error('Use an operator-owned private directory with mode 0700');
const configPath = join(directory, 'provider.config.json');
let config, secrets, receipt;
try {
  config = JSON.parse(await readFile(configPath, 'utf8'));
  secrets = JSON.parse(
    await readFile(join(directory, 'credentials.json'), 'utf8'),
  );
  receipt = JSON.parse(
    await readFile(join(directory, 'exercise.json'), 'utf8'),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // An incomplete deployment is retained for inspection, never initialized again.
  const { readdir } = await import('node:fs/promises');
  if ((await readdir(directory)).length)
    throw new Error(
      'Incomplete preview directory; retain it and use a new empty directory',
    );
  config = JSON.parse(
    await readFile(
      new URL(
        '../../docs/provider.config.bundled.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  config.network = 'base';
  delete config.localExecution;
  config.policy.provider = {
    name: 'Local Wallet Preview',
    origin: 'https://wallet.preview.test',
    privacyUrl: 'https://wallet.preview.test/privacy',
  };
  config.oauth = {
    issuer: 'https://wallet.preview.test/oauth',
    audience: 'https://wallet.preview.test/api',
    jwksUrl: 'https://wallet.preview.test/oauth/jwks',
  };
  const application = config.policy.applications[0];
  application.issuer = config.oauth.issuer;
  application.clientId = 'preview-application';
  application.name = 'Local Preview Application';
  application.permissions = ['account:read', 'operations:request'];
  application.assertionTrust.agreement =
    'isolated synthetic identity and consent exercise';
  config.backend.binding = randomUUID();
  config.backend.vaultDirectory = join(directory, 'vault');
  config.storage.directory = join(directory, 'data');
  config.http = {
    host: '127.0.0.1',
    port: 8088,
    documentation: true,
    ingress: 'existing',
  };
  config.authorizationServer.clients[0].clientId = application.clientId;
  config.authorizationServer.clients[0].scopes = [...apiTokenScopes];
  config.authorizationServer.operatorClients = [
    {
      clientId: 'preview-operator',
      clientSecret: { env: 'PREVIEW_OPERATOR_SECRET' },
    },
  ];
  config.runtimeConfiguration = {
    operators: [
      {
        issuer: config.oauth.issuer,
        clientId: 'preview-operator',
        subject: 'preview-operator',
      },
    ],
  };
  // Acceptance applies only to this synthetic, unfunded local account lifecycle.
  config.activation = {
    enabled: true,
    backendAcceptance: 'local encrypted OWS lifecycle exercise only',
    recoveryAcceptance:
      'retained local vault and journal restart exercise only',
  };
  secrets = generateDeploymentSecrets(config, {});
  await mkdir(config.backend.vaultDirectory, { mode: 0o700 });
  const db = openProviderDatabase({
    directory: config.storage.directory,
    initialize: true,
  });
  db.close();
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  await writeFile(
    join(directory, 'credentials.json'),
    JSON.stringify(secrets) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
}
if (
  config.network !== 'base' ||
  config.backend.kind !== 'ows' ||
  config.financial ||
  config.approvedCalls ||
  config.execution
)
  throw new Error(
    'The preview requires its isolated unfunded OWS profile; use the normal deployment process for financial configuration',
  );
for (const [name, value] of Object.entries(secrets)) process.env[name] = value;
const app = await createConfiguredProvider(config);
await app.listen({ host: '127.0.0.1', port: config.http.port });
const origin = 'http://127.0.0.1:' + config.http.port;
async function token(operator) {
  const client = operator
    ? config.authorizationServer.operatorClients[0]
    : config.authorizationServer.clients[0];
  const scope = operator
    ? 'wallet:configuration:read wallet:configuration:write'
    : client.scopes.join(' ');
  const r = await fetch(origin + '/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: client.clientId,
      client_secret: secrets[client.clientSecret.env],
      scope,
      resource: config.oauth.audience,
    }),
  });
  assert.equal(r.status, 200, 'Application token issuance failed');
  return (await r.json()).access_token;
}
const applicationToken = await token(false),
  operatorToken = await token(true);
await writeFile(join(directory, 'application.token'), applicationToken + '\n', {
  mode: 0o600,
});
await writeFile(join(directory, 'operator.token'), operatorToken + '\n', {
  mode: 0o600,
});
async function api(path, body, operator = false, key = randomUUID()) {
  const r = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: 'Bearer ' + (operator ? operatorToken : applicationToken),
      'content-type': 'application/json',
      'idempotency-key': key,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(r.status, 200, 'Preview API exercise failed');
  return r.json();
}
if (!receipt) {
  const policy = {
    version: '1',
    enabled: false,
    chain_id: 'eip155:8453',
    contracts: [],
    maximum_calls: 1,
    maximum_native_value_wei: '0',
    max_validity_seconds: 60,
    claim_requirements: [],
  };
  const proposed = await api('/v1/runtime-configuration/proposals', {
    expected_revision: '0',
    policy,
  });
  await api(
    '/v1/runtime-configuration/proposals/' + proposed.proposal_id + '/publish',
    { expected_revision: '0' },
    true,
  );
  const terms = await api('/v1/access-policy');
  const grant = await api('/v1/access-requests', {
    mode: 'create',
    user: {
      id: 'synthetic-preview-owner',
      identity: {
        reference: 'synthetic-preview-identity',
        level: 'verified',
        verified_at: new Date(Date.now() - 1000).toISOString(),
        fields: { country: 'ZA' },
      },
      consent: {
        reference: 'synthetic-preview-consent',
        granted_at: new Date(Date.now() - 1000).toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        policy_revision: terms.policy_revision,
      },
    },
    authorization_details: [
      {
        type: 'https://moovha.com/wallet/account-access',
        actions: ['account:read', 'operations:request'],
      },
    ],
  });
  const key = randomUUID();
  const account = await api(
    '/v1/accounts/' + grant.account_id + '/provision',
    {},
    false,
    key,
  );
  assert.deepEqual(
    await api(
      '/v1/accounts/' + grant.account_id + '/provision',
      {},
      false,
      key,
    ),
    account,
  );
  receipt = {
    accountId: grant.account_id,
    grantId: grant.grant_id,
    provisionKey: key,
    expiresAt: grant.expires_at,
  };
  await writeFile(
    join(directory, 'exercise.json'),
    JSON.stringify(receipt, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
}
const restored = await api('/v1/accounts/' + receipt.accountId);
assert.equal(
  restored.account_id,
  receipt.accountId,
  'Retained owner access is unavailable; renew the synthetic consent through the API',
);
assert.equal((await api('/v1/applications/configurations')).network, 'base');
await writeFile(
  join(directory, 'preview-evidence.json'),
  JSON.stringify(
    {
      network: 'base',
      chainId: 8453,
      localHttp: true,
      realOwsEngine: true,
      syntheticApplicationEvidence: true,
      policyApproval: true,
      walletProvisioning: true,
      financialSigning: false,
      submission: false,
      certified: false,
    },
    null,
    2,
  ) + '\n',
  { mode: 0o600 },
);
console.log('Local Base preview: ' + origin + '/docs/');
console.log('API explorer: ' + origin + '/docs/');
console.log(
  'Private application/operator tokens are saved in the preview directory and expire after five minutes. Restart this command to renew them.',
);
console.log(
  'Synthetic unfunded wallet lifecycle only. No transfer policy, sponsor, broadcasts or mainnet certification. Press Ctrl-C to stop; private storage is retained.',
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
