# Configure the Safe service

Use [provider.config.safe.example.json](provider.config.safe.example.json) as the configuration reference. The only backend kind is `ows`; `safeWallet`, `safeProvisioning`, `approvedCalls` and `runtimeConfiguration` are required. Unknown properties and missing required sections are rejected before service startup.

Configure the provider HTTPS identity, application clients and trusted application identity assertions. Retain separate provider operator credentials. Set pinned Safe, module, handler, EntryPoint and contract addresses for the chosen chain. Accepted runtime policy defines actions, services and bounded sponsorship.

Secret values belong in retained environment variables, never the JSON export. Start with `activation.enabled: false`. Complete backup/recovery and backend acceptance before enabling wallet operations. See [setup wizard](setup-wizard.md) and [deployment](operator-deployment.md).
