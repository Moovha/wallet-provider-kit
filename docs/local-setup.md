# Run a local deployment from the wizard

Use **Export → Set up and run locally** to turn a validated configuration into a
running, isolated Docker Compose deployment. Downloads and manual preparation
commands are optional for this path. The wizard shows progress and retains the
files needed to operate the service.

This is the recommended local evaluation path for CDP and Relayer. It builds the
same repository Dockerfile used by the single-host container deployment: pinned
Node base image, production dependencies, unprivileged user, read-only filesystem,
private persistent SQLite storage and read-only configuration. Docker manages the
service independently of the browser with an `unless-stopped` restart policy. See
[Compose in production](https://docs.docker.com/compose/how-tos/production/) for
the single-host model. Local startup does not establish production acceptance.

## Prepare the machine

Use a built source checkout, Node 24.22.0 and npm 11.11.1, as an unprivileged macOS
or Linux account. Install and start [Docker with Compose](https://docs.docker.com/compose/install/).
Select a local Linux engine context using a Unix socket. Remote Docker engines and
`DOCKER_HOST` overrides are rejected. Docker administrators can access container
secrets; use a trusted machine. Allow disk space and network access for the image
build and pinned dependency downloads.

Prepare isolated backend credentials and application trust settings through
[services and credentials](operator-services.md). The wizard does not create
vendor accounts, issue credentials or install Docker. OWS uses a separate native
vault and engine omitted from the reference image; use the
[native deployment path](operator-deployment.md) for OWS.

## Review and start

1. Complete the six wizard steps. Leave **Enable wallet operations in this
   configuration** off and choose an unused service port in Deployment.
2. In Export, choose **Validate configuration**, then **Check local setup prerequisites**.
   This checks Docker without creating files or containers.
3. Review the private directory, local API address and container settings. The saved
   config uses `0.0.0.0:8080` internally and `.provider-data` storage. Your selected
   port is published only on `127.0.0.1`; policies and the public HTTPS origin are
   retained. Manual downloads preserve the original form settings.
4. Supply missing secret values. Referenced secrets already in the wizard process
   environment are copied into the private file. Values entered here are sent to
   the authenticated loopback API and saved as plaintext in owner-only `provider.env`.
   They are cleared from the form after submission, excluded from downloads and
   progress, and never saved in browser storage.
5. Choose **Start local setup** to authorize the displayed build, private file
   creation, new database initialization and container start. Follow the statuses;
   the first build can take several minutes.

The executor saves files, builds the image, validates in a container, initializes
new storage once, runs diagnostics, starts the container and checks health. Commands
are fixed and run without a shell or user-supplied scripts. Only missing secret names
in the reviewed plan are accepted. Runtime-control names such as `NODE_OPTIONS`
cannot be secret references for this path.

Node loads the mounted environment file directly; Compose does not interpolate
secret contents. Multiline values are preserved. Values containing carriage returns,
NULs or all three quote styles need the manual secret-manager path. The file is not
encrypted; protect host storage and backups. Never paste secrets into commands or
public reports.

## Understand the result

**Local service running · wallet operations disabled** means startup completed,
liveness returned **200** and readiness returned **503**, as expected before
activation. Checks run inside this project's container, so an unrelated host
listener cannot supply a successful response. The screen periodically checks
whether Docker still reports the service running.

Open local liveness or capabilities from the result. The API reference remains a
contract preview; authenticated requests and deployed Swagger use the configured
HTTPS origin. Local HTTP alone does not complete that connection.

The private directory under `~/.wallet-provider-kit-deployments/` contains:

| File or directory            | Purpose                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| `provider.config.json`       | Normalized container configuration, with activation disabled.             |
| `provider.env`               | Actual secret values, mode 0600; keep private.                            |
| `compose.json`               | Service definition, mounts, loopback port and restart policy.             |
| `provider-setup.md`          | Status, stop, restart, diagnosis and acceptance instructions.             |
| `provider-setup.status.json` | Last observed setup step, including failures or an interrupted action.    |
| `.provider-data/`            | Persistent private records; never erase to repair an uncertain operation. |

Closing the browser or wizard does not stop the container. Docker must remain
running; Docker Desktop startup after reboot depends on your host settings. Use
**Stop local service** or the saved Compose command to stop deliberately. Stopping
retains files and records. Setup never activates wallet operations automatically.

## Recover without repeating initialization

![Completed local setup screen using an offline command fixture](public/screenshots/local-setup.webp)

_Fictional settings and offline executor responses. This screenshot demonstrates
progress and controls; it is not evidence of a deployed or accepted wallet service._

Setup stops on the first failed step. It attempts to remove its project containers
without deleting host data and reports unconfirmed cleanup. It never automatically
reruns initialization or overwrites an existing deployment.
Read the private status file after interruption. A step recorded as running has an
uncertain outcome; investigate it before retrying. Saved operation commands pin
the local Docker daemon selected during setup.

For image failures, check Docker, network access and disk space. For diagnosis or
startup failures, check secrets, permissions, port availability and optional
staff/hosted login reachability. Use the saved status and diagnosis commands. If
files could not be saved, correct directory permissions first. Do not share raw logs
that could contain credentials or personal data.

Reopen the complete private URL printed in the terminal to return to an execution
within its one-hour setup session. Saved instructions remain usable after expiry.
A new session does not attach to existing containers. Existing deployments use
their saved commands and the reviewed [maintenance process](operator-deployment.md).

## Carry the pattern to the final host

Reuse the reviewed revision, image and container security pattern on one persistent
final host. Supply that environment's separate secrets, origin, backend binding and
private storage. Add HTTPS ingress, monitoring and encrypted backups. Do not clone
the local database to create a second authoritative provider.

Follow [deployment](operator-deployment.md) and the [staging walkthrough](staging-walkthrough.md)
for application authority, backend and restore tests. Record actual evidence before
explicit activation. Setup does not provision wallets or sign actions to test
credentials. Health checks do not validate token issuance, KYC assertions, vendor
credentials, signing, sponsorship or settlement.
