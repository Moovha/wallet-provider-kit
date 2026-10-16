# Get started: configure and operate a wallet service

The supported path is **prepare services → configure in FormKit → deploy → connect
applications over HTTP**. An operator does not write policy callbacks, a database
adapter or signing code. Product developers consume the API; custom adapters and
embedded composition are the advanced path.

This guide starts from an empty operator workstation. The current service is
experimental, single-host and Base Sepolia EOA only. Mainnet and production custody
acceptance remain pending. Signing does not submit transactions, sponsor gas or
establish settlement. Read [roles and terms](concepts.md) if wallet provider,
application, owner, grant or journal are new to you.

## Choose who does each part

| Role                               | Work                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Provider operator                  | Register external services, configure policies, store secrets, deploy, back up and operate the service         |
| Identity administrator / reviewers | Configure login/token issuance; staff independently accept identity evidence                                   |
| Connected application's developer  | Obtain scoped API tokens; integrate owner access, provisioning and approval/signing; arrange execution and gas |
| Advanced integration developer     | Implement an unsupported backend, custom financial actions or embedded host behavior                           |

You may wear several roles. The GUI removes provider setup code; it does not create
vendor accounts or replace infrastructure and product integration work.

## Install and open the local wizard

Install [Node.js](https://nodejs.org/en/download) **24.22.0**, npm **11.11.1** and
[Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) for your OS.
Open a terminal (macOS Terminal or your Linux terminal), then check:

```sh
node --version
npm --version
```

From a folder where you keep software, run:

```sh
git clone https://github.com/Moovha/wallet-provider-kit.git
cd wallet-provider-kit
npm ci
npm run build
npm start -- setup
```

`npm ci` installs the locked dependencies; `build` compiles the service and bundled
wizard. `setup` opens a temporary local browser session or prints a URL to open.
No external credentials are needed to explore the forms. Keep the terminal open;
Ctrl+C stops the session. If you already installed a reviewed tarball, use
`npx --no-install wallet-provider-kit setup` in that installation instead. The
[package guide](package.md) explains tarballs; the package is not published to npm.

![Provider setup screen with example values and all six steps](public/screenshots/provider.webp)

[Open full-size screenshot](public/screenshots/provider.webp)

_Real wizard screenshot using invented example values. Replace every placeholder
with your own prepared configuration; the screenshot is not a deployable setup._

## Follow the operator path

1. **[Prepare services and credentials](operator-services.md).** Choose a backend,
   domain, identity vendor and funding arrangements. Learn what each client ID,
   secret, issuer, audience and reviewer subject means and where it comes from.
   For a fresh login/token setup use the [Auth0 dashboard recipe](auth0-setup.md).
2. **[Complete the six wizard screens](setup-wizard.md#complete-the-six-steps).**
   Configure Provider, Backend, Services, Policies and Deployment. Validate under
   Export and download all three files. Enter secret variable names only.
3. **[Deploy the export](operator-deployment.md).** Supply actual secrets, prepare
   private persistent storage, initialize once, diagnose, start disabled and add
   HTTPS. Complete acceptance, explicitly activate and retain recovery evidence.
4. **[Hand the API to your product developer](operator-deployment.md#hand-the-api-to-the-product-developer).**
   Supply the origin, OpenAPI, client/token details and supported policies.
   Owners use provider-hosted login, consent and transfer approval pages.
5. **[Operate and recover](operator-deployment.md#keep-it-operating).** Supervise the
   process, monitor readiness, preserve storage/bindings and test encrypted backups.

A successful export means configuration validation passed. It does not mean
vendor connectivity, login, identity agreements or wallet recovery were tested.
Do not enable activation merely because every wizard tab has been visited.

## Advanced integrations

Start here only if supported configuration cannot meet your requirements:
[custom adapters](custom-adapters.md), [backend integration](backend-guide.md),
[embedded host authority](provider-guide.md) and [durable attempts](durable-attempts.md).
The [offline integration tutorial](integration-example.md) explains those interfaces
with ephemeral fixtures. It is useful for developers but is not an operator setup
prerequisite. The [technical configuration reference](setup.md) describes the JSON
and financial profile exported by the GUI.

## API reference

- [API guide](api.md): choose interfaces and understand authority and errors.
- [TypeScript reference](api-reference.md): public declarations by import path.
- [HTTP guide](http-api.md) and [schema reference](http-reference.md): authentication,
  scopes, request/response shapes and retry decisions.
- [Implemented OpenAPI](../spec/provider-api.json): the service contract.

## Integration guides

- [Coinbase CDP](backend-guide.md#coinbase-cdp): app-controlled test-network backend.
- [Open Wallet Standard](ows-adapter.md): local wallet engine and operator-held vault.
- [OpenZeppelin Relayer](openzeppelin-relayer.md): configured signers and separate execution profile.
- [Stored-action host backend](stored-backend.md): supplied account/recovery/signing lifecycle for existing authority ports.
- [Durable attempts](durable-attempts.md): claims, results, replay and reconciliation.
- [Built-in SQLite database](storage.md): onboarding, approvals, usage reservations,
  signing/execution journals and optional enrollment storage.
- [OIDC Identity Assurance enrollment](enrollment.md): an alternative for hosts
  with their own identity acceptance flow; choose this or bundled onboarding.
- [Architecture](architecture.md) and [security model](security-model.md): wallet
  control, application access and the implemented provider boundary.

## Contribute and maintain

Use [Contributing](../CONTRIBUTING.md), [security reporting](../SECURITY.md),
[governance](../GOVERNANCE.md), [branch workflow](branch-workflow.md) and
[release preparation](releases.md). [NOTICE](../NOTICE) and
[extraction.json](extraction.json) retain the source attribution and licensing provenance.

## Repository map

| Location                                     | Purpose                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `src/index.ts`, `src/core.ts`, `src/http.ts` | Public package entry points                                            |
| `src/backend.ts`                             | Supplied lifecycle for stored-action host integrations                 |
| `src/storage/`                               | Toolkit-owned SQLite storage, approvals and financial journals         |
| `src/domain/`                                | Wallet authority, signing, enrollment and execution contracts          |
| `src/service/`                               | HTTP composition, authentication, schemas and telemetry                |
| `src/onboarding/`, `src/identity/`           | Owner access, consent, review and identity verification                |
| `src/providers/`                             | Backend adapters and attempt handling                                  |
| `src/protocol/`, `spec/`                     | Generated types, implemented API and separate reference action schemas |
| `examples/`                                  | Runnable offline examples with replaceable backend/host fixtures       |
| `docs/provider.config.example.ts`            | Typed onboarding configuration template                                |
| `ops/`                                       | Local monitoring configuration                                         |
| `test/`, `scripts/`, `.github/`              | Tests, generated-reference checks and contributor tooling              |
| `dist/`                                      | Generated JavaScript/declarations included in the package              |
