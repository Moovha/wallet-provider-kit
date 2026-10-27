# Deploy a static source configuration

This page is for developers deploying an saved static configuration.
For a new API-managed provider, follow [installation](provider-installation.md).
The release bundle supplies prebuilt images, retained secrets and storage,
protected administrator claiming and zero-application startup. Source setup uses
the same management contract. See [maintenance](provider-maintenance.md) for
backups, restore uncertainty and reviewed image replacement.

## Deploy an advanced static configuration

The API container uses a digest-pinned minimal glibc runtime with Node.js 26.12.1.
It contains no shell, package manager or filesystem administration commands.
Use `docker compose exec api node ...` for reviewed Node.js diagnostics; shell
commands such as `docker compose exec api sh` are unavailable. The container's
health check executes Node.js directly. Run `node scripts/check-container.mjs IMAGE`
after building an API image to verify the native wallet worker, SQLite,
TLS and compression with isolated disposable fixtures and no host mounts.

Node.js 26 is the Current release line. The OIDC dependency supports LTS releases
and emits a warning on Current releases; toolkit compatibility tests do not
establish upstream support for this runtime.

Build the repository with Node.js 26.12.1 or later in the supported Node 26 range. Validate the [Safe configuration](setup.md), retain generated secrets and mount private persistent storage. The terminal local-setup command prepares the API, bundler, cache and HTTPS ingress from the source checkout.

Keep wallet operations disabled until backend acceptance, funding limits and restore evidence are recorded. Provision application infrastructure with a separate provider operator token. Verify readiness and perform controlled zero-value testnet calls before admitting users.

Restart with the same configuration identity, secrets and volumes. An uncertain operation requires reconciliation using its existing batch ID; a restart must not create a new identity or discard retained attempts.

Next, [test the application connection](staging-walkthrough.md) and arrange
[monitoring](operations.md).
