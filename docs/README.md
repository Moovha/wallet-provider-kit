# Set up your wallet service

Run a wallet service with one Safe account per user. The bundled OWS engine
holds private signing identities; a private ERC-4337 bundler submits approved
operations and an application-owned paymaster covers gas. Users receive their
Safe address for deposits and transactions.

The service is experimental and single-host. Applications retain responsibility
for current identity evidence, consent, action requests and sponsorship funding.
Offline checks do not establish production custody or latency acceptance.

## Open the wizard

Use Node 24.22.0, npm 11.11.1 and Git:

```sh
git clone https://github.com/Moovha/wallet-provider-kit.git
cd wallet-provider-kit
npm ci
npm run build
npm start -- setup
```

Keep the terminal open. The temporary local wizard creates configuration and
can prepare an isolated local container deployment. Start with operations disabled.
See [local setup](local-setup.md) for runtime installation and recovery.

## 1. Provider

Enter your service name, intended HTTPS origin and privacy notice. Application
registrations and public discovery use this origin. Prepare the domain and gateway
before public deployment. See [domain preparation](operator-services.md).

## 2. Backend

Review the bundled OWS vault and stable wallet environment ID. Setup generates
missing local credentials privately. Keep the environment, vault and database
backups together. See [Safe wallets](self-hosted-sponsorship.md).

## 3. Services

Configure application authentication. The bundled issuer supplies application
tokens and has no second user login. The private bundler and durable Valkey queue
start with the API. RPC credentials, contract methods and funding agreements are
registered per application after connection.

## 4. Applications

Register each calling application, its identity/consent trust agreement and allowed
API permissions. Retain its generated client ID and secret reference across restarts.
Configure provider operators separately from application clients. See
[application-led access](application-access.md) and [application management](runtime-workspace.md).

## 5. Deployment

Review private storage, the local port, HTTPS and optional API explorer controls.
Leave wallet operations disabled until backend, recovery, authorization, bundler
and paymaster acceptance is complete. The service has one execution flow: each user Safe submits through the private
bundler and application verifying paymaster.

## 6. Export

Validate the configuration, then choose **Set up and run locally** or download
configuration and secret-reference templates for manual deployment. Validation
contacts no providers and establishes no funded readiness. See
[the wizard reference](setup-wizard.md) and [deployment](operator-deployment.md).

After deployment, accept the application's services and policy, fund its gas
address, prepare sponsorship infrastructure and provision its user Safes.
Applications use the account-scoped EIP-5792 endpoint and verified status stream.
[Execution latency](execution-latency.md) explains the execution sequence and
same-user burst measurement.

## When you need a custom integration

Low-level signing, authority and storage interfaces are available for reviewed
host integrations. They do not select another supported configured execution
flow. Configuration must include the Safe account and its application infrastructure.
