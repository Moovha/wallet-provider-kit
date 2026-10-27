---
prev: { 'text': 'Welcome', 'link': '/docs/' }
next: { 'text': 'Connect an application', 'link': '/docs/runtime-workspace' }
---

# Install your wallet service

Let’s get your service running and give you a place to manage it. You can finish
installation with no connected applications. User checks, transaction rules and
network-fee funding can wait until an application is ready to connect. In administration, choose **Networks & execution → Available networks** to offer additional supported networks from the same instance. Each starts with its own disabled wallet operations and needs separate application consent and fee funding. See [multiple networks](provider-guide.md#offer-multiple-networks).

The toolkit is experimental and runs on one active host with persistent local
storage. Installation leaves wallet operations disabled. Complete the
[launch checks](conformance.md) before accepting real wallet use.

## Choose a destination

| Where would you like to run it? | What to have ready                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| This computer                   | A local Linux Docker engine and Compose v2. Access stays on this computer.                                                                  |
| Existing Linux server           | Docker/Compose, a dedicated service account, your final domain and a privacy notice URL.                                                    |
| AWS                             | A person who can review the supplied template, network access, retained storage and ongoing costs. See [AWS details](#aws-template-limits). |

The installer needs at least two runtime CPUs, 2 GiB runtime memory and 5 GiB free
host storage. These are installation minimums, not production capacity estimates.
It reuses Docker rather than replacing your installation.

## Install a release bundle

Check [available releases](https://github.com/Moovha/wallet-provider-kit/releases)
for a published `provider-release.tgz`. Download that bundle and its checksum,
verify them under your release policy, then extract into an empty directory.
A version in source code does not mean an installable release has been published.
For source evaluation, follow [Run from source](local-setup.md) instead.

<details>
<summary>Verify who published the bundle</summary>

A checksum detects corruption; it does not authenticate the publisher. Where your
release policy requires provenance, verify the downloaded archive before extraction:

```sh
gh attestation verify provider-release.tgz   --repo Moovha/wallet-provider-kit   --signer-workflow Moovha/wallet-provider-kit/.github/workflows/provider-release.yml
```

Keep the verified archive and its version for recovery. Release bundles contain
pinned prebuilt images, so installing one does not require Node, npm, Git or a
source build.

</details>

For this computer, run the installer from the extracted directory:

```sh
bash install.sh
```

Review the destination, service address, data location and image before confirming.
Keep the installation directory: it holds configuration, private credentials and
the persistent data your service needs after a restart.

<details>
<summary>Install on an existing Linux server</summary>

Run as a dedicated service account with access to the local Docker engine. Set
these non-secret settings to your own values:

```sh
export WPK_LOCAL=false
export WPK_ORIGIN=https://wallet.example.com
export WPK_PRIVACY_URL=https://example.com/privacy
export WPK_NAME='Example wallet provider'
export WPK_DIRECTORY=/home/wallet-provider/provider
bash install.sh
```

Arrange DNS for the chosen domain and reachability on ports 80 and 443. Bundled
Caddy manages public HTTPS. Restrict SSH to trusted operator networks. Remote
administration requires HTTPS or an authenticated private connection; a browser
certificate warning is not a setup step.

For unattended installation, set `WPK_ACCEPT_PLAN=true` only after reviewing the
same resource and exposure choices. Private files belong to the service account
with restrictive permissions. Keep secrets out of URLs, messages and cloud outputs.

</details>

Source installations use the terminal [local-setup command](local-setup.md) and then the administration console.
The [configuration reference](setup.md) covers static source integrations.

## Claim administrator access

Open the administration address printed by the installer. The default local
address is `http://127.0.0.1:8080/admin/`; use the printed address if you selected a
different port. Local HTTP is limited to configured loopback administration.

1. On the installation host, read the private `installation-claim` file.
2. Select **First-time setup** and enter its code in **Setup code**.
3. Choose an administrator username and a password of at least 14 characters.
4. Save the password in your password manager.

The setup code works once and expires 30 minutes after the service first
initializes. Restarting does not reopen setup. If it has expired, follow
[setup recovery](#recover-an-interrupted-or-expired-setup).

You should now see the overview with an empty application list. Management can be
available while **wallet operations are disabled**. That is the expected result.

Administrator sessions last 30 minutes. Sign in again after reloading or when
your session expires. The console keeps its access token only in page memory. Protect the console, management
API and API explorer with the same access controls.

### Sign in with Amazon Cognito

For AWS installations, you can use an approved Cognito administrator account
instead of maintaining another provider password. Cognito hosts password changes,
multi-factor authentication and account recovery. This is separate from signing
in to the AWS Management Console; it does not give administrators AWS credentials.
The provider's approved-network restriction still applies after sign-in.

Your infrastructure operator can deploy the optional bundle template
`aws-cognito.json` (`packaging/aws-cognito.json` in source) in the provider's
selected Region. Supply the existing `ProviderHostname` and a unique
`DomainPrefix`. It creates a dedicated directory with public self-registration
disabled, required authenticator-app MFA, a managed login page and an approval
group named `ProviderAdministrators`. Review [Cognito pricing](https://aws.amazon.com/cognito/pricing/)
and retain the directory during recovery or stack replacement.

Create each approved administrator in that directory and add them to the
approval group through authenticated AWS administration. Send invitations only
to addresses approved by your organization. Each person completes their own
password and authenticator setup on Cognito's hosted page. If their email is not
yet verified, the provider shows a verification step before granting any
administration session. The person requests and enters Cognito's email code,
then signs in again to continue.
Creating a directory user or matching an email address alone does not grant
provider access.

Add the template outputs to the private provider configuration, then restart
the API with its existing data and secrets:

```json
{
  "management": {
    "claim": { "env": "WPK_INSTALLATION_CLAIM" },
    "cognito": {
      "userPoolId": "eu-north-1_Example",
      "clientId": "exampleclientid",
      "domain": "https://example-admin.auth.eu-north-1.amazoncognito.com",
      "administratorGroup": "ProviderAdministrators",
      "bootstrap": true
    }
  }
}
```

This is a fragment of the complete configuration. Open `/admin/` and choose
**Sign in with Amazon Cognito**. With `bootstrap: true`, the first verified member
of the approved group can establish administration without copying a setup code.
That setting is an explicit host authorization for the configured directory and
group. Omit it or set it to `false` if administration must first be claimed through
the private setup code. A claimed installation is never reopened, and a locally
suspended administrator cannot regain access simply by signing in again.

The integration uses authorization code flow with PKCE, browser-bound single-use
state, a nonce and signature validation against the configured directory. The
public app client has no secret; it must allow only the exact callback
`https://<provider-hostname>/admin/auth/callback` and logout address
`https://<provider-hostname>/admin/`, with ID tokens lasting five minutes.
Administrator tokens stay in page memory for 30 minutes; refresh tokens are discarded.
The `aws.cognito.signin.user.admin` scope permits only the signed-in person's
Cognito profile operations and is used for email verification; it is not an IAM
permission or provider administrator approval. Unverified accounts receive no
provider token. Their verification access token stays in server memory and expires after five
minutes.
Removing directory group membership prevents new provider sessions. An already
issued administrator token can remain usable for up to 30 minutes; suspend its local
administrator identity through the protected management API for immediate denial.
Sign out ends the page session and redirects to Cognito logout. A copied provider
token remains subject to its short expiry and current local permissions.

Preserve a reviewed host-access recovery path. Local administrator credentials
continue to work when configured, and [host recovery](#recover-an-interrupted-or-expired-setup)
does not depend on Cognito availability. Neither Cognito sign-in nor successful
bootstrap enables wallet execution or authorizes spending.

## Connect an application after installation

You can stop here until an application is ready. When it is, follow
[Connect your first application](runtime-workspace.md) to add it, save its
connection details and agree user checks and permissions. Both the console and
protected API support this without restarting the service.

![An application and its access settings in the administration console](public/screenshots/provider-administration.png)

_Example console using invented identities and no financial effects._

## Automate provider administration

Open **Access** and add a management tool. Give it separate connection details and
only the administrative permissions it needs. The tool can use the same protected
management APIs as the console; ordinary applications cannot use those credentials
or grant themselves an administrator role.

<details>
<summary>Management API contract for developers</summary>

Use the bundled `/oauth/token` endpoint with `grant_type=client_credentials`, the
client ID and secret, and explicitly requested permitted scopes. Management requires
`provider:manage` and a current operator identity. Policy publication additionally
requires its documented configuration scope. The console requests the full
management scope set; a tool can request an allowed subset.

Inventory and status use `GET /v1/provider/identities` and
`GET /v1/provider/status`. Create with `POST /v1/provider/identities`, update with
`PATCH /v1/provider/identities/{id}`, and replace secrets with
`POST /v1/provider/identities/{id}/credentials`.

Writes require an idempotency key. Updates and secret replacement also require
`expected_revision`; stale revisions conflict. Identical creation retries return
metadata without the secret. Idempotency metadata is retained for 24 hours; use
a new key for a new operation. Limits are 100 management identities and 10,000
management commands within that window. Inventories return no secrets or password
verifiers. Current credential revisions are checked for token admission and live
authority. See the [HTTP reference](http-reference.md).

Changing scopes invalidates obsolete tokens. Changing trust, suspension or owner
permissions revokes related grants. Replacing a secret preserves grants, while
invalidating the old credential and tokens. Existing admitted operations retain
their identities and financial checks. Management cannot bypass owner permission,
identity, consent, action, attempt or chain checks. It exposes no shell, Docker
control, generic signing or key export.

</details>

## Interpret health correctly

| Check                                   | What it tells you                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `/health/live`                          | The process is running.                                                          |
| `/health/management`                    | Management storage is available, including before claim or with no applications. |
| `/health/ready`                         | The wallet-execution activation gate is satisfied.                               |
| Protected overview and application APIs | Which applications are connected and which prerequisites still block their use.  |

Public probes contain no identity details. A healthy console does not mean an
application is ready to transact. Resolve its missing policy, service or funding
requirements instead of bypassing authority checks.

## Recover an interrupted or expired setup

If installation was interrupted, repeat the installer with the same reviewed
settings and release. It preserves the preparation record and generated secrets.
Differing existing files require explicit repair. A completed installation reuses
its retained data; rerunning is neither an upgrade nor a reset.

<details>
<summary>The setup code expired before I created an administrator</summary>

Stop the API and run this host-only command with the existing configuration and
environment. Replace the example installation path with yours:

```sh
docker compose --env-file /dev/null --file /path/to/provider/compose.json stop api
docker compose --env-file /dev/null --file /path/to/provider/compose.json run --rm --no-deps api   renew-claim --config /config/provider.json
```

The new code is saved privately in `renewed-installation-claim` beside the
configuration. Restart the API and use it within 30 minutes. It cannot reopen an
already claimed installation. Preserve any prior recovery output; files are never
overwritten by a later recovery command.

</details>

<details>
<summary>I lost administrator access</summary>

Use the same stopped-API procedure with `recover-admin --config /config/provider.json`.
It creates or replaces credentials for the separate `operator-recovery`
administrator, saving its client ID and secret in the private
`recovery-administrator` file. Protect access to host storage: it carries this
recovery authority. Recovery does not activate wallets.

Once another enabled administrator exists, an administrator can suspend obsolete
administrators through the identity API. The last administrator cannot be suspended.
Management tools cannot modify administrator credentials or status. Administrators
can replace their own credentials through the API; save the response before
signing in again.

</details>

## AWS template limits

The release’s `aws-cloudformation.json` starts an Ubuntu 24.04 VM and runs the
same installer. Have your infrastructure operator review the VPC, public subnet,
management access, domain, privacy URL, release version and
verified archive SHA-256. Internet access is needed for packages, images and the
release. Put no cloud credentials or wallet secrets in template parameters.

### Point your domain to the deployed host

Choose your final hostname before creating the stack so installation records the
correct HTTPS identity. Its DNS record can be created after AWS assigns the host
an address. The template does not create DNS records, including when your domain
uses an external DNS provider.

1. Create the stack with the chosen hostname in `DomainName`. Wait for the
   `PublicIP` output, then confirm through Systems Manager or restricted SSH that the host installer
   and containers have started. Stack completion alone does not confirm that
   the installer finished successfully.
2. At your authoritative DNS provider, create an **A record** for the hostname
   pointing to `PublicIP`. Remove conflicting address records. Do not add an
   AAAA record unless IPv6 is configured and reachable on this host. For a
   subdomain such as `wallet.example.com`, the record name is commonly `wallet`;
   follow your DNS provider's naming convention.
3. Wait until public DNS resolves the hostname to that address. Allow inbound
   TCP port 80 for certificate validation and port 443 only from approved
   backend and operator networks through the host and AWS firewalls. The bundled Caddy
   gateway requests a public TLS certificate and retries while DNS is becoming
   available. Certificate issuance exposes the hostname in public certificate
   transparency logs.
4. Open `https://<your-hostname>/health/management` and confirm a successful
   response with a valid HTTPS certificate, then open `/admin/`. Check that the
   configured privacy-notice URL is reachable before onboarding users.
5. Read the private claim file at the stack's `ClaimLocation` through a private host session and
   [claim administrator access](#claim-administrator-access). The 30-minute
   claim lifetime starts when the service initializes, independently of DNS.
   If it expired while DNS or HTTPS was being prepared, use
   [claim renewal](#recover-an-interrupted-or-expired-setup) with the existing
   installation; do not delete its data or reinstall with a different identity.

The template associates a stable Elastic IP with the host. By default it allocates
an address and retains it when the stack is deleted or replaced. To use an address
you already control in the selected Region, supply its allocation ID in
`ElasticIPAllocationId`; that allocation remains under your management. The
`PublicIP` output is the DNS destination after association. Public IPv4 addresses
incur charges while allocated, including when the host is stopped. Release retained
allocations only after checking DNS, recovery and replacement plans.

`AccessMethod=ssm` is the default: the host receives the AWS-managed Systems
Manager core permissions, with no inbound SSH rule or key pair. Use a private
Systems Manager session for administration. Application containers do not receive
those host permissions. For SSH instead, select `AccessMethod=ssh`, supply an
existing `KeyName` and set `AdminCIDR` to your trusted operator IPv4 range.

Select an instance type your AWS plan permits. The default `t3.medium` requires
a plan that supports it; `c7i-flex.large` and `m7i-flex.large` are additional
choices for the new Free plan. Credits cover eligible usage while available;
Free-plan eligibility does not mean there is no hourly charge. The installer
requires at least 2 GiB of available runtime memory, so a nominal 2 GiB instance
may not satisfy its check after operating-system overhead.

For a staged installation, set `InstallOnBoot=false` to prepare the host without
fetching a release. Install a verified release separately before checking the
provider endpoints. With the default `InstallOnBoot=true`, both `ReleaseVersion`
and `ReleaseArchiveSHA256` are required. Host preparation alone does not run a
provider or create administrator credentials.

### Restrict acceptance network access

User devices communicate with the connected application's backend. That backend
calls the wallet provider. Limit provider HTTPS and administration to approved
backend and operator networks through your organization's access controls.

Set `HTTPSAllowedCIDR` to an approved backend's public egress IPv4 range when
using direct network admission. The default loopback range denies remote HTTPS.
Keep API, bundler and storage ports private. Port 80 remains public for certificate
validation and HTTPS redirects; verify it does not return provider API content.

Verify both approved and denied connections before onboarding applications.
Network admission does not replace API authentication, application trust or
wallet-authority checks. Keep deployment-specific network procedures in your
private operational runbook.

Keep wallet operations disabled during DNS, HTTPS and administrator setup. A
working management endpoint does not establish wallet-execution readiness.

The encrypted root EBS volume is retained after instance deletion and continues
to incur charges. Keep independent tested backups. Stack creation does not prove
DNS, HTTPS or wallet readiness; check the endpoint and private setup-code path.
The template has offline structural checks. Live AWS acceptance and performance
sizing remain separate requirements.

Next, [connect an application](runtime-workspace.md) or arrange
[backups and maintenance](provider-maintenance.md).

## Manage execution and application setup

In **Networks & execution → Execution**, choose a running network to see whether
wallet execution is enabled or paused. Supply references to completed wallet
setup and recovery checks before enabling it. Mainnet enabling also requires
confirmation that approved applications can transact with real assets. Saved
settings apply immediately; app-specific permissions and fee funding still apply.
Pausing blocks new wallet requests and changes the transaction-authority revision.
Re-enabling requires fresh transaction consent and never restores old queued
approvals. Previously issued signatures or submitted transactions may still execute.

Use **Available networks** to add or remove network runtimes; those network-list
changes still need a service restart. Existing execution settings are retained.

Under **Applications**, select one application rather than scrolling through every
application’s forms. **Wallet setup** separates **Transactions**, **Connections**,
**Fees** and **Readiness**. **People & permissions**, **Connection** and
**Wallet sharing** have their own panels. Keyboard users can move between tabs
with the arrow keys, Home and End. Connection secrets remain hidden after their
initial display.

For unattended operators, read and update
`/v1/provider/networks/{network}/execution` with a provider management token.
Updates require a saved UUIDv4 idempotency key and `expected_revision`. Enabling
uses `enabled: true`, `backendAcceptance` and `recoveryAcceptance`; mainnet
transitions also require `mainnet_confirmed: true`. Reads report the saved setting
separately from current readiness. A failed runtime start leaves the setting
retained and the network unavailable; inspect service health before retrying.
Keep the matching service image with backups: older toolkit versions do not
enforce retained execution controls and must not be used to resume an installation
that relies on a saved pause.
