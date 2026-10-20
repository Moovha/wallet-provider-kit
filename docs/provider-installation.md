---
prev: { 'text': 'Welcome', 'link': '/docs/' }
next: { 'text': 'Connect an application', 'link': '/docs/runtime-workspace' }
---

# Install your wallet service

Let’s get your service running and give you a place to manage it. You can finish
installation with no connected applications. User checks, transaction rules and
network-fee funding can wait until an application is ready to connect.

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

Source setup uses **Choose where to run → Review your setup → Start and sign in**.
The [advanced editor](setup-wizard.md) is available for static source integrations.

![Review the name, address and storage before starting installation](public/screenshots/provider-installation.png)

_Example setup screen using offline configuration._

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

Sign in again after reloading or when your session expires. The console keeps
its short-lived access token only in page memory. Protect the console, management
API and API explorer with the same access controls.

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
SSH key, restricted administrator CIDR, domain, privacy URL, release version and
verified archive SHA-256. Internet access is needed for packages, images and the
release. Put no cloud credentials or wallet secrets in template parameters.

The encrypted root EBS volume is retained after instance deletion and continues
to incur charges. Keep independent tested backups. Stack creation does not prove
DNS, HTTPS or wallet readiness; check the endpoint and private setup-code path.
The template has offline structural checks. Live AWS acceptance and performance
sizing remain separate requirements.

Next, [connect an application](runtime-workspace.md) or arrange
[backups and maintenance](provider-maintenance.md).
