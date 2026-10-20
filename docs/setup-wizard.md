# Configure your wallet service in the wizard

The wizard prepares a Safe wallet service with bundled OWS signing, private
ERC-4337 bundling and an application-owned verifying paymaster. Every user has one
Safe asset address. See [getting started](README.md) to open it locally.

## Complete the six steps

Work through **Provider → Backend → Services → Applications → Deployment → Export**.
Field instructions explain names, accepted formats and security boundaries.
Secret fields contain environment variable names, never credential values.

## 1. Provider

Enter the service name, exact public HTTPS origin and privacy notice. The origin
binds token registrations, discovery and wallet identity. Prepare DNS and HTTPS
before public deployment. See [domain preparation](operator-services.md#provider-domain-and-privacy-notice).

## 2. Backend

The bundled OWS signer operates behind users' Safes. Review **Advanced vault
settings** for its private vault directory and owner-passphrase variable name.
**Advanced wallet environment settings** contains a stable deployment binding;
keep it across restarts. Setup generates missing local secrets privately.

Back up the vault, database and retained environment together. There is no
configured EOA, CDP asset-wallet or Relayer signer-pool selection.

## 3. Services

Choose the bundled application token service or an accepted existing issuer.
The bundled issuer generates registrations from the application IDs. Configure
scopes and secret references under its advanced controls when needed. See
[application token registration](operator-services.md#register-the-application-api-and-clients).

The private bundler and Valkey queue start automatically. Each application
registers RPC services and sponsorship through the deployed management API.
RPC keys and user signing keys stay on the server.

## 4. Applications

Register calling applications, allowed permissions and the trust agreement for
application-led user identity and consent. Review identity age/fields and consent
limits. Users stay in the connected application; OAuth scopes alone cannot
establish ownership or spending authority.

Provider operators are separate caller identities with configuration permissions.
Retain stable IDs and configure the actual trusted operator subjects.

<a id="_4-policies"></a>

### Application configuration after connection

Use [application management](runtime-workspace.md) to register action schemas,
service credentials, exact contracts/methods and bounded sponsorship terms.
Provider review and user consent apply independently. The service provisions
one Safe per admitted user after its funding and infrastructure are ready.

## 5. Deployment

Review private storage, listen address, host port and HTTPS gateway. Setup saves
the Caddy configuration; public certificate issuance starts only when the operator
starts the HTTPS profile. Existing infrastructure can supply that gateway instead.

### API explorer and staff token controls

Enable the optional deployed API explorer when needed. Token controls require
separate operator authentication and explicit caller/scope limits. They do not
expose application secrets to the browser or grant spending permission. See
[operator tokens](operator-tokens.md).

### Execution and sponsorship

The execution flow is fixed: Safe → private bundler → application paymaster.
Applications provide gas funding and bounded budgets after connection. There
are no EOA, relayer, shared Safe or sponsor-pool controls.

### Activation

Leave **Enable wallet operations in this configuration** off for the first setup.
Record backend and recovery acceptance before activation. Test current authority,
exact calls, sponsorship bounds, lost replies and canonical receipt verification.
Passing local configuration checks does not establish funded acceptance.

## 6. Export

Validate to enable downloads or local setup. Any edit invalidates that validation.
Old execution exports are rejected with migration guidance before configuration
or provider effects. Importing a file never migrates accounts or moves assets.

### Set up and run locally

Choose **Check local setup prerequisites**. Setup checks Docker, Compose and the
builder, and can install a missing local runtime. Review the plan and generated
secret references, then start setup. It saves private files, builds the image,
initializes new storage once and starts the disabled service with its dependencies.
A resumed session retains its setup progress and files. Stopping the local service
does not erase persistent storage. See [local setup](local-setup.md).

### Download for manual deployment

Download `provider.config.json`, `provider.env.example` and `provider-setup.md`.
Supply credential values privately on the deployment host. Follow
[deployment](operator-deployment.md); the wizard does not deploy a public service
or certify the configured credentials.

### Test, activate and connect

Complete authority, recovery and funded test-network acceptance. Accept the
application's service and policy declarations, fund its gas address, prepare its
paymaster/bundler infrastructure and provision user Safes. Use the standard wallet
endpoint and status stream. See [Safe sponsorship](self-hosted-sponsorship.md).

## Explore the provider API

The **API reference** shows schemas and configuration prerequisites without making
requests. The deployed Swagger explorer can make authenticated requests after
explicit operator setup. A pending response acknowledges a durable batch; verified
inclusion and business settlement remain distinct.

### Optional application token controls

Operators can request and renew tokens through configured server-side issuer
credentials. Current login, operator allowlist and selected application scopes
are checked independently. See [token controls](operator-tokens.md).

## Resume and privacy

Keep the local setup terminal open. Configuration and generated secret files are
private. Do not share raw deployment logs or environments. Restore saved state
through the reviewed maintenance process rather than resetting a funded store.

## Optional adapters and gas starting values

Configure optional token, swap or vault policy adapters in the deployed application
workspace. Generic calls remain the common execution boundary. Runtime adapter
publication does not increase gas budgets or change the submission mechanism.
See [generic calls and policy adapters](approved-contract-calls.md).
