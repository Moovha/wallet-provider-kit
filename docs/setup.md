# Configuration reference

Use this page when a developer needs to inspect or maintain service configuration.
For ordinary installation, follow [Install your wallet service](provider-installation.md)
and add applications afterward. You do not need to fill out the example’s every
application setting before starting a new service.

## Find the setting you need

The [Safe example](provider.config.safe.example.json) shows the supported shape.
The backend kind is `ows`; `safeWallet`, `safeProvisioning`, `approvedCalls` and
`runtimeConfiguration` are required. Unknown properties or missing required
sections stop startup rather than silently enabling a partial service.

Installation settings describe the provider’s HTTPS identity and retained storage.
API-managed application registrations live in durable records. Static source
integrations instead configure startup clients and their identity agreements.
Keep provider operator credentials separate and choose one registration authority.

## Keep the service safe while configuring it

Start with `activation.enabled: false`. Keep secret values in retained environment
variables or the deployment’s secret store, outside JSON. Review the selected
chain’s pinned Safe, module, handler, EntryPoint and contract addresses. Applications
need accepted rules, services and bounded network-fee sponsorship before use.

Edit static configuration as JSON, validate it with `node dist/main.js validate --config provider.config.json`, or use [administration](runtime-workspace.md) for a running API-managed service.
Complete [launch checks](conformance.md), including backup and recovery, before activation.
