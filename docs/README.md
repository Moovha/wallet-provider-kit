# Safe wallet service

Build a provider-hosted wallet service with one Safe smart account per user. Applications submit approved calls as ERC-4337 v0.7 UserOperations through a private bundler and an application-funded verifying paymaster. Open Wallet Standard (OWS) stores the private Safe owner signer.

Start with [setup](setup.md), then integrate [wallet calls](wallet-calls.md). The service starts with wallet operations disabled. Use the [configuration example](provider.config.safe.example.json) and retain its generated secrets across restarts.

Identity acceptance, owner consent, application grants and published policy are prerequisites to financial authority. OAuth scopes alone never authorize spending. This toolkit has offline tests and limited testnet evidence; deployment acceptance remains an operator responsibility.
