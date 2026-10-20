# Deploy the service

Build the repository with Node.js 24.22 or later in the supported Node 24 range. Validate the [Safe configuration](setup.md), retain generated secrets and mount private persistent storage. The local setup command or wizard prepares the API, bundler, cache and HTTPS ingress from the source checkout.

Keep wallet operations disabled until backend acceptance, funding limits and restore evidence are recorded. Provision application infrastructure with a separate provider operator token. Verify readiness and perform controlled zero-value testnet calls before admitting users.

Restart with the same configuration identity, secrets and volumes. An uncertain operation requires reconciliation using its existing batch ID; a restart must not create a new identity or discard retained attempts.
