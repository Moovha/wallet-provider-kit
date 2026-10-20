# Wallet Provider Kit

A Safe smart-account service with private OWS owner signing, ERC-4337 bundler submission and application-funded paymaster sponsorship. Each user has one Safe account for deposits, balances and approved calls.

Start with the [operator guide](docs/README.md), [configuration](docs/setup.md) and [application HTTP API](docs/http-api.md). See the [live documentation](https://moovha.github.io/wallet-provider-kit/).

Use Node.js 24.22 or later within Node 24. Run `npm ci`, `npm run verify` and `npm run build` from this repository. Wallet operations start disabled. The package is private and unpublished.

Identity, consent, current grants, immutable policy and durable financial authority remain mandatory. Offline checks and limited testnet measurements do not establish production readiness. See [security](SECURITY.md), [acceptance](docs/conformance.md) and [latency evidence](docs/execution-latency.md).

Licensed under Apache-2.0; separate runtime and contract licenses are listed in [NOTICE](NOTICE).
