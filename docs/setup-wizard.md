# Set up through the operator wizard

The FormKit wizard configures the supported provider service through labelled
forms. Operators do not implement callbacks, policies in code, database adapters
or signing journals. Product developers still consume the HTTP API. Unsupported
backends use the separate [custom adapter path](custom-adapters.md).

## Open the wizard

Install a [reviewed package](package.md), then run:

```sh
npx --no-install wallet-provider-kit setup
```

From a source checkout, run `npm ci`, `npm run build`, then
`npm start -- setup`. The command opens the default browser on macOS/Linux, or
prints a local URL to open manually. Use `setup --no-open` to print the URL only,
or `setup --port 4319 --no-open` to choose an available port. The URL includes a
private, temporary setup-session token. Do not share it.

Run this on your operator workstation. The wizard always binds to `127.0.0.1`,
regardless of `HOST`, `PORT` or the provider service's listen settings. The session
expires after one hour; press Ctrl+C when finished. It is a separate local tool,
not an unauthenticated administrative screen on the deployed provider API.

## Before you begin

Have these registrations or plans available. The wizard links to each selected
vendor's documentation; it cannot create those external accounts for you.

| Input            | What the provider must prepare                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider         | Public HTTPS origin, display name and privacy notice.                                                                                                                                                                                                               |
| Wallet backend   | CDP project credentials, a pinned OWS engine/private vault, or an existing OpenZeppelin Relayer signer pool.                                                                                                                                                        |
| Owner login      | A compatible confidential OIDC client with the exact `/onboarding/callback` redirect, code flow, PKCE S256, `client_secret_post`, RS256/ES256 ID tokens, a lifetime no greater than ten minutes and fresh `auth_time`. The IdP owns registration, MFA and recovery. |
| Application API  | A dedicated OAuth audience, HTTPS issuer/JWKS and separate application registrations. Tokens must meet the kit's RFC 9068 `at+jwt`, claims, scopes and ten-minute lifetime requirements. Not every IdP's default token profile is compatible.                       |
| Identity         | Didit recipient workflow and credentials, Sumsub recipient level/credentials with reusable KYC Share enabled, or both.                                                                                                                                              |
| Identity funding | Confirmed import/verification upper bounds in USD cents and terms references, plus each requesting application's reimbursement agreement and monthly USD-cent cap. Even a free workflow needs an explicit agreed zero bound.                                        |
| Reviewers        | Provider staff subject IDs from the configured owner-login issuer, with a process to check identity evidence, freshness and owner correspondence.                                                                                                                   |
| Deployment       | One persistent POSIX host, a secret store, private SQLite storage, HTTPS ingress and recovery/backups.                                                                                                                                                              |

These values are configuration. Provisioning vendor accounts, choosing identity
requirements, agreeing reimbursement and proving recovery remain operational
responsibilities. A provider with incompatible login or unsupported infrastructure
needs an advanced integration; entering its URL does not make it supported.

## Complete the six steps

1. **Provider:** set the service's public identity and origin.
2. **Backend:** choose CDP, OWS or OpenZeppelin Relayer and name its stable binding.
   Changing the backend discards the previous backend settings. Enter only secret
   **environment variable names**, never credential values, keys or seed phrases.
3. **Services:** configure owner login, API authentication and identity vendors.
   Application policy issuers inherit the API token issuer. Configure agreed
   identity price bounds for the verification/import routes you intend to use.
4. **Policies:** add applications, permissions, identity funding, reviewers and
   freshness periods. Optionally configure exact owner-approved ERC-3009 token,
   recipient and integer base-unit limits. There is no arbitrary signing policy.
5. **Deployment:** choose private data storage and service listen settings. Keep
   activation disabled until backend/recovery acceptance is complete. Financial
   activation also needs token acceptance evidence. Those references are operator
   attestations, not certification performed by the wizard.
6. **Export:** validate the entire configuration using the service's existing
   strict JSON Schema and semantic checks. Review the configuration observations,
   then download configuration, deployment checklist and environment template.

Step tabs allow returning to any section. Their position indicates navigation,
not proof of operational readiness. Every edit invalidates the validated export.
The final validator catches cross-field errors, duplicate bindings, missing
required configuration and financial bounds; frontend validation alone cannot
approve an export.

The wizard distinguishes a structurally valid configuration from a usable
onboarding flow. Missing vendor prices or application funding pause new identity
work. Disabled applications, read-only permissions, unavailable secrets, unprepared
storage and incompatible external services can also prevent the intended flow.
The review screen and checklist call out configuration prerequisites; they do not
claim to test services remotely.

## Use the exported files

- `provider.config.json`: the existing version-1 provider service configuration.
- `provider.env.example`: required variable names with empty values. Supply actual
  values through your deployment's secret store; the CLI does not automatically
  load an environment file.
- `provider-setup.md`: selected backend instructions, login callback, outstanding
  configuration observations, initialization, diagnostics and run commands.

Move the files to your private deployment directory and follow the checklist and
[deployment guide](setup.md). Relative data/vault paths resolve beside the config
on the deployment host. A container must use an appropriate listen address and
volume mapping; the [reference Compose file](../ops/provider.compose.yaml) has
explicit private mounts and UID/GID inputs. It omits the optional OWS engine/vault.

For a new empty deployment, run `init-storage`, then `doctor`, then `run --config`
using the exported configuration. For an existing store, preserve its origin,
backend binding and signer assignments; follow reviewed migration procedures
instead of reinitializing or replacing wallets. The wizard does not apply config
to a running service, initialize storage, deploy containers or create wallets.

## Resume and privacy

Use **Import configuration** to review a saved, valid supported configuration.
Unknown fields, plaintext credentials, oversized files and custom adapter modules
are rejected. Import never executes a module. Imported activation settings are
preserved; review acceptance again before deploying any changes.

The wizard holds edits in browser memory. It does not save them in localStorage,
sessionStorage, cookies or server files, and does not request external scripts,
fonts, analytics or logos. Refreshing discards edits; reopen the terminal's full
setup link to start again. Download configuration before closing to retain work.
Local API access requires the session token and exact local host/origin. Assets
are bundled with the installable package; no FormKit Pro subscription is needed.
Third-party marks identify integrations and do not imply endorsement. Asset
sources are recorded in the source checkout's `setup-ui/ASSETS.md`.

## Verification and limits

Offline browser tests cover a new CDP configuration, OWS/Sumsub selection,
Relayer pool editing, application funding, financial bounds and activation,
import/export round-trips, rejected configurations and mobile layout. Local API
tests exercise origin/session controls, sanitized diagnostics and custom-module
denial. Installed-package checks verify that the wizard assets work without the
frontend development dependencies.

Those checks establish that the UI produces usable configuration inputs. They do
not prove live vendor registration, login compatibility, identity-sharing
agreements, wallet recovery or token acceptance. The current configured service
remains experimental, single-host and Base Sepolia EOA only. Signing does not
broadcast, sponsor gas or establish settlement. Complete the provider acceptance
and deployment process independently before enabling it.
