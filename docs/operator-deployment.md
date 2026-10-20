# Deploy a static source configuration

This page is for developers deploying an exported static configuration.
For a new API-managed provider, follow [installation](provider-installation.md).
The release bundle supplies prebuilt images, retained secrets and storage,
protected administrator claiming and zero-application startup. Source setup uses
the same management contract. See [maintenance](provider-maintenance.md) for
backups, restore uncertainty and reviewed image replacement.

## Deploy an advanced static configuration

Build the repository with Node.js 24.22 or later in the supported Node 24 range. Validate the [Safe configuration](setup.md), retain generated secrets and mount private persistent storage. The local setup command or wizard prepares the API, bundler, cache and HTTPS ingress from the source checkout.

Keep wallet operations disabled until backend acceptance, funding limits and restore evidence are recorded. Provision application infrastructure with a separate provider operator token. Verify readiness and perform controlled zero-value testnet calls before admitting users.

Restart with the same configuration identity, secrets and volumes. An uncertain operation requires reconciliation using its existing batch ID; a restart must not create a new identity or discard retained attempts.

Next, [test the application connection](staging-walkthrough.md) and arrange
[monitoring](operations.md).
