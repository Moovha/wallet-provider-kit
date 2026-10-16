# Deploy the wizard export

This walkthrough follows a completed [wizard](setup-wizard.md) export. It uses a
reviewed source checkout and a single persistent macOS or glibc Linux host. The
commands configure and run the supplied service; no host application or adapter code is required.
For a packaged installation use the [tarball guide](package.md) and its installed
executable instead. Windows, network/shared disks, ephemeral storage and independent
replicas sharing a database are unsupported.

The workstation runs the local wizard. The **deployment host** runs the wallet
service and owns its persistent records. They can be the same machine for an
isolated evaluation. A hosted deployment needs HTTPS, service supervision and
backups in addition to the exported files. The profile remains experimental and
Base Sepolia only and is not approved for production custody.

For a repeatable acceptance run, use the [standard staging walkthrough](staging-walkthrough.md).
It specifies which work happens in the configuration GUI, deployment CLI and
deployed browser pages, with expected results and a checklist for missing
services or untested recovery cases.

## Prepare the host and files

Install Node **24.22.0**, npm **11.11.1** and Git. Follow the
[Node downloads](https://nodejs.org/en/download) and [Git installation guide](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
for your operating system. Confirm `node --version` and `npm --version` match
these versions before proceeding.
Use a dedicated unprivileged operating-system account for the service. This account
must own the data and optional vault; do not run the wallet service as root.

On the deployment host, build the reviewed source revision using the
[get-started commands](README.md#install-and-open-the-local-wizard). If the wizard
ran elsewhere, use the same reviewed commit here and securely transfer its three
exports. Record the revision with `git rev-parse HEAD`. From the built checkout:

```sh
export PROVIDER_SOURCE="$PWD"
export PROVIDER_STATE="$HOME/wallet-provider-state"
umask 077
mkdir -p "$PROVIDER_STATE/.provider-data"
chmod 700 "$PROVIDER_STATE" "$PROVIDER_STATE/.provider-data"
```

These variables contain paths, not secrets. Use your organization's dedicated
persistent directory instead if preferred. The example assumes the wizard's data
directory is `.provider-data`. Its location resolves **beside the config file**,
so the database will be under `$PROVIDER_STATE/.provider-data`.

Copy `provider.config.json`, `provider.env.example` and `provider-setup.md` from the
wizard download into `$PROVIDER_STATE`. Rename the variable template to
`provider.env` there. Use your file manager or approved secure file-transfer tool;
keep the files outside the source checkout and public web directories. Then:

```sh
chmod 600 "$PROVIDER_STATE/provider.config.json" "$PROVIDER_STATE/provider.env" "$PROVIDER_STATE/provider-setup.md"
```

Downloads themselves contain no secret values, but do contain your operational
policy. Keep them private. Do not copy an existing deployment's database to start
an independent second provider or run two authoritative copies.

## Supply the secret values

Open `provider.env` with a local text editor or have your secret manager render it
for the service account. Replace each empty value with the matching issued secret
from the [credential guide](operator-services.md#put-references-in-the-wizard-values-in-the-deployment).
For example, `PROVIDER_LOGIN_SECRET=` receives the login-client secret, while
`DIDIT_API_KEY=` receives the Didit application's API key. Keep the names exactly
as exported. Do not put values in the wizard or JSON configuration.

This file uses Node environment-file syntax: `NAME=value`, one entry per variable.
Quote values containing spaces or `#`; preserve vendor key material exactly,
including any required newlines. Node documents quoting and multiline values in
[`--env-file`](https://nodejs.org/docs/latest-v24.x/api/cli.html#--env-filefile).
Do not paste credentials into shell commands or source the file as a shell script.
The service does **not** load `.env` automatically; every native command below
explicitly loads the private file using Node. Environment variables already set
in the process take precedence, so remove conflicting old deployment settings.
Your platform may inject the same variables directly from a secret store instead.

Keep access to your secret store recoverable by the appropriate operators.
The environment file is not encrypted by the kit. Use protected/encrypted host
storage and encrypted backups according to your organization's access policy.
Rotate secrets at their issuer if exposed; a config export cannot rotate them.

## Prepare the optional OWS vault

Skip this section for CDP and Relayer. The source checkout's `npm ci` installs the
pinned OWS engine used by its build/tests; confirm `npm ls @open-wallet-standard/core`
reports `1.4.3`. For an installed tarball deployment, install the optional engine
in that installation's application directory:

```sh
npm install --save-exact @open-wallet-standard/core@1.4.3
```

With `.provider-vault` selected in the wizard, create it beside the configuration:

```sh
mkdir -p "$PROVIDER_STATE/.provider-vault"
chmod 700 "$PROVIDER_STATE/.provider-vault"
```

It must be owned by the service account and must not be a symlink. Protect parent
directories too. Supply the retained owner passphrase in `OWS_OWNER_PASSPHRASE`.
The vault and SQLite database are different stores; back up both. Do not export
seeds or create wallets manually to prepare the directory. See [OWS](ows-adapter.md).

## Validate, initialize once, then diagnose

Run from the built source checkout, as the service account:

```sh
node dist/main.js validate --config "$PROVIDER_STATE/provider.config.json"
node --env-file="$PROVIDER_STATE/provider.env" dist/main.js init-storage --config "$PROVIDER_STATE/provider.config.json"
node --env-file="$PROVIDER_STATE/provider.env" dist/main.js doctor --config "$PROVIDER_STATE/provider.config.json"
```

`validate` checks configuration structure and policy offline, without reading
secrets. `init-storage` explicitly creates the kit's empty SQLite store after
catalog checks; use it for a **new deployment only**. It refuses incompatible
schemas and does not upgrade them. `run` never creates a missing store.
`doctor` checks secret availability, private paths, actual database catalog/integrity
and binding, plus OWS prerequisites where selected. It does not print secret values,
contact vendors, authenticate a user, provision a wallet or sign anything.

With activation disabled, acceptance is reported pending. That is expected.
Resolve missing secrets, permissions, engine or storage errors first. A diagnosis
with no local errors is not proof that external credentials or services work.

## Start in the disabled state

For the native path, choose **Local IPv4 / 127.0.0.1**, port **8080** in the wizard.
Then run:

```sh
node --env-file="$PROVIDER_STATE/provider.env" dist/main.js run --config "$PROVIDER_STATE/provider.config.json"
```

Keep this terminal open during evaluation. Ctrl+C stops it. In another terminal:

```sh
curl -i http://127.0.0.1:8080/health/live
curl -i http://127.0.0.1:8080/health/ready
```

Expected: liveness **200**, readiness **503** while activation is disabled. API
mutations cannot dispatch. Startup still requires reachable compatible owner-login
discovery; a failure here must be fixed with your identity administrator. The
setup wizard's browser port is unrelated to the deployed service's port.

## Publish through HTTPS

An **ingress/reverse proxy** accepts public HTTPS and forwards requests to the
private local service. A **TLS certificate** proves the hostname and encrypts the
connection. The kit itself listens on HTTP; owners need the final HTTPS origin
for login, cookies and consent checks.

Have your host/domain administrator point the hostname's DNS A record (and AAAA
only if IPv6 is served) to the ingress host. Route the entire hostname to the wallet
service without adding/removing a path prefix. Keep port 8080 private. Permit
outbound HTTPS to owner-login discovery/token/JWKS, application JWKS and the selected
identity/wallet services; the service needs those external dependencies at runtime.

For a simple single-host reference, install [Caddy](https://caddyserver.com/docs/install)
as instructed for your operating system. In its Caddyfile use your real hostname:

```text
wallet.your-company.com {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy's [automatic HTTPS guide](https://caddyserver.com/docs/automatic-https) explains
the domain, certificate storage and port 80/443 prerequisites. Start/reload Caddy
using its [service instructions](https://caddyserver.com/docs/running). Your hosting
platform may already provide an equivalent managed ingress instead.
Check `https://wallet.your-company.com/health/live` returns 200 with a trusted
certificate. Readiness should still be 503 while disabled. Do not expose configuration,
secret files, SQLite/vault files or proxy logs containing tokens/consent URLs.
Do not frame the hosted consent/access pages; open them as top-level navigation.

## Optional CDP/Relayer container path

Use this instead of the native run command. It requires Docker Engine with Compose
on the deployment host; follow [Docker's installation guide](https://docs.docker.com/engine/install/).
The source checkout's [reference Compose file](../ops/provider.compose.yaml) builds
the kit, mounts config read-only and publishes 8080 only on loopback. It omits OWS.

In the wizard choose **Container / all IPv4 / 0.0.0.0**, port **8080**, storage
`.provider-data`, then export and replace the private configuration. From the
source checkout, as the account owning the prepared state directory:

```sh
export PROVIDER_CONFIG="$PROVIDER_STATE/provider.config.json"
export PROVIDER_DATA="$PROVIDER_STATE/.provider-data"
export PROVIDER_SECRETS_FILE="$PROVIDER_STATE/provider.env"
export PROVIDER_UID="$(id -u)"
export PROVIDER_GID="$(id -g)"
docker compose -f ops/provider.compose.yaml build api
docker compose -f ops/provider.compose.yaml run --rm api node dist/main.js validate --config /config/provider.json
docker compose -f ops/provider.compose.yaml run --rm api node dist/main.js init-storage --config /config/provider.json
docker compose -f ops/provider.compose.yaml run --rm api node dist/main.js doctor --config /config/provider.json
docker compose -f ops/provider.compose.yaml up -d api
```

Run initialization only for new storage, not during ordinary restarts. UID/GID are
numeric operating-system owner/group identifiers used inside the container; they
must match the host directory owner and must not be root. Compose's `env_file`
loads the selected secret file into the container. These path/UID variables are
Compose inputs, separate from backend/login secret names. Persist the non-secret
Compose inputs in your deployment tooling for subsequent commands. For supervision,
set your reviewed restart policy through your deployment tooling; the reference
file does not set one. HTTPS ingress remains necessary. Use
`docker compose -f ops/provider.compose.yaml stop api` to stop before maintenance.

## Acceptance and explicit activation

Before admitting real traffic, retain reviewable evidence for your exact environment:

| Evidence                     | What your team must establish                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend acceptance           | Supported network/account type, exact account binding, restart/replay, concurrent denial and uncertain-result handling for the selected backend                                      |
| Recovery acceptance          | Restorable private records and backend/vault access, retained assignments/attempts, recovery of unknown outcomes without replacement effects                                         |
| Token acceptance, if signing | Exact Base Sepolia ERC-3009 contract/domain, recipients, limits, delegation consent and independently verified signature behavior                                                    |
| Service acceptance           | Compatible owner login/API tokens, selected identity source, staff review, consent, revocation and HTTPS operation; vendor routes also require workflow/sharing and identity funding |

Use the [conformance checklist](conformance.md), your selected backend guide and
[Auth0 verification steps](auth0-setup.md#_6-confirm-the-tenant-works-before-admitting-traffic).
Perform staged checks with approved test identities and test-network fixtures under
your team's acceptance process. Financial signing authorizes a later effect; it
is not a harmless connectivity probe. The wizard cannot perform these checks.
Where end-to-end checks need activation, use an isolated test deployment and your
reviewed test evidence before progressing to wider admission.

Reopen the wizard, import the saved configuration and review every section.
In Deployment enable activation and enter references to the actual backend and
recovery evidence; signing also requires token evidence. A reference can be an
internal reviewed report/ticket ID. It is not a secret, vendor-issued code or
automatic certification. Export again, stop the old service, replace the config,
run validation/diagnostics, and restart with the same storage and binding.
No file is hot-reloaded. Readiness can become 200 once local gates pass; that
still does not continuously prove vendor availability or settlement.

## Test the deployed API in Swagger

Use the wizard's **API reference → Try it out** controls to enable the deployed
explorer, export and restart, then open your HTTPS origin at `/docs/`. Begin with
public discovery; add a short-lived application token for protected calls.
The [step-by-step live testing guide](http-api.md#try-deployed-apis) covers token
issuance, actual responses, idempotency keys, required owner steps and troubleshooting.
This is real API execution, including any admitted records, charges and signatures.
Use your isolated acceptance deployment before wider admission.

If you configure [operator token controls](operator-tokens.md), supply the selected
M2M client secrets in their exported environment variables before restarting.
Operators can then sign in and obtain/renew tokens directly in Swagger. No client
secret belongs in the browser or plaintext configuration.

## Hand the API to the product developer

Provide the final HTTPS origin, [implemented OpenAPI](../spec/provider-api.json),
application client registration/token instructions, allowed permissions/scopes,
identity funding agreement and supported token/recipient limits. Keep wallet/vendor
and owner-login secrets with the provider operator.

The developer integrates these stages using [the HTTP guide](http-api.md),
[request/response schemas](http-reference.md) and [configured service flow](setup.md#consume-the-api):

1. Create an access request and open the returned provider consent URL in the
   owner's top-level browser. Use its returned URL, not a guessed route.
2. Complete owner login, consent and staff acceptance of the submitted record.
   Vendor configurations also require funded identity verification/import. Poll for the accepted account/grant; do not assume instant approval.
3. Provision the accepted account with an empty JSON body and retain its ID.
4. If signing is configured, obtain `transfers:request` delegation during onboarding,
   request an exact transfer authorization, then sign the provider-authorized
   stored action. There is no additional owner approval URL or browser prompt.
5. Arrange submission, gas and settlement separately. A signature is not a receipt.

Use UUIDv4 `Idempotency-Key` values for mutation requests and preserve each original
key across retries. OAuth authentication, application-access consent and exact
provider transfer authorization are distinct. Owners manage access at `/onboarding/access`;
staff use `/onboarding/review`. No adapter development is required for this flow.

## Keep it operating

Run one supervised service under the same unprivileged UID, with persistent local
data and `/health/ready` for traffic admission. A foreground terminal command does
not survive logout or reboot.

### Linux native service example

Use your platform's service manager. For a systemd-based Linux host, an administrator
can create `/etc/systemd/system/wallet-provider.service` using this template. Replace
`walletprovider` with your dedicated service account, `/opt/wallet-provider-kit`
with its built checkout and `/srv/wallet-provider` with its state directory.
Use the absolute Node 24 executable path returned by `command -v node` for that
account; this example assumes `/usr/local/bin/node`.

```ini
[Unit]
Description=Wallet Provider Kit
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=walletprovider
Group=walletprovider
WorkingDirectory=/opt/wallet-provider-kit
ExecStart=/usr/local/bin/node --env-file=/srv/wallet-provider/provider.env /opt/wallet-provider-kit/dist/main.js run --config /srv/wallet-provider/provider.config.json
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

The configured data directory and optional vault must be owned by that account;
copying them as root without correcting ownership will fail diagnosis. Confirm the
administrator's paths and run `doctor` as the service account before starting.
Then the administrator runs:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now wallet-provider
sudo systemctl status wallet-provider
```

For maintenance use `sudo systemctl stop wallet-provider`; after a reviewed config
replacement use `sudo systemctl start wallet-provider`. Restrict access to the
service's journal/logs and avoid proxy request logging of consent/token URLs.
See [systemd service behavior](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).
On macOS or a managed host, use its supported process supervisor with the same
account, absolute command and persistent directories; this Linux unit is not portable.

### Container supervision

The reference Compose file does not set a restart policy. To add one, save this
non-secret override as `$PROVIDER_STATE/compose.restart.yaml`:

```yaml
services:
  api:
    restart: unless-stopped
```

With the [Compose path/UID variables](#optional-cdp-relayer-container-path) restored
in your deployment environment, start using both files:

```sh
docker compose -f ops/provider.compose.yaml -f "$PROVIDER_STATE/compose.restart.yaml" up -d api
```

Use that same pair of files for subsequent Compose operations. Ensure the host
starts Docker after reboot, then verify liveness and readiness. Restarting a process
never replaces backend/recovery acceptance or resolves an uncertain attempt.

### Backups and configuration changes

Take encrypted backups using a SQLite-aware backup process, or stop **all** kit
processes and copy the complete private data directory, plus the OWS vault when
selected. A live copy of `provider.sqlite` alone can lose committed WAL records.
Test restoration with dispatch stopped, preserve private ownership and run `doctor`.
Reconcile effects in any backup gap before accepting new work; an absent restored
attempt is not proof it never happened. Keep one authoritative active copy.
See [storage recovery](storage.md#recovery-backup-and-operations) and
[operations](operations.md) for telemetry and lifecycle controls.

For later changes, import the prior configuration, preserve the public origin and
backend binding, and review policy consequences. Policy/workflow changes may revoke
grants and invalidate approvals; changing financial policy also invalidates prior
authorizations and revokes transfer delegations tied to old terms; renew consent
while reusing still-current KYC. Never reinitialize storage, replace assigned signers, clear unknown
attempts or roll back policy to force a retry. Uncertain financial reconciliation
currently needs the advanced trusted storage interface and independently verified
evidence; there is no operator wizard button for it.

## Troubleshooting

| Symptom                                       | Check and next step                                                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Wizard session expired or blank after refresh | Restart `setup`, open the new full terminal URL and import your last saved config; unsaved edits are lost                                       |
| Validation reports a path/rule                | Return to that wizard section, correct the field and validate again; do not put secret values in JSON                                           |
| Missing environment variable                  | Verify the exported name, secret-store mapping and explicit `--env-file`/Compose injection                                                      |
| Storage/vault permissions or binding error    | Check service UID, 0700 directories, private files and preserved origin/backend binding; do not create a replacement store                      |
| Startup login/discovery failure               | Check exact issuer, HTTPS reachability and registration with your identity administrator                                                        |
| API returns 401 / 403                         | Check RFC 9068 profile, audience, issuer, lifetime, client ID and scope; then current grant/policy. Do not log the token                        |
| `funding_approval_required`                   | Configure the selected vendor route's agreed price and the requesting application's funding agreement/cap, including explicit zero-price routes |
| Provisioning has no capacity                  | For Relayer, verify unused accepted signer-pool entries; never reuse an assigned signer                                                         |
| Ready is 503                                  | Review `doctor`, activation evidence, database and current-policy gates; liveness 200 alone is insufficient                                     |
| Wallet/signing result is unknown              | Preserve request/attempt IDs and reservations; use the documented review/reconciliation process rather than submitting replacement work         |
