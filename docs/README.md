# Wallet Provider Kit documentation

Start with the task you want to complete. The package is experimental; the
[verification record](verification.md) describes what has actually been checked.

## Adopt the toolkit

1. [Install the package and run an example](package.md) without credentials.
2. Follow the [end-to-end provider tutorial](integration-example.md), then use the
   [API guide](api.md), [TypeScript reference](api-reference.md) and
   [HTTP usage/schema reference](http-api.md).
3. Choose [new-user onboarding and access](onboarding.md) or an
   [existing financial host integration](provider-guide.md).
4. Review [custody and authorization](security-model.md),
   [durable attempts and recovery](durable-attempts.md) and
   [acceptance requirements](conformance.md) for your deployment.
5. [Run and monitor your configured service](operations.md).

## Select a backend

- [Coinbase CDP supported profile](provider-guide.md#current-adapter-profile)
- [Open Wallet Standard adapter](ows-adapter.md)
- [OpenZeppelin Relayer adapter and execution profile](openzeppelin-relayer.md)
- [OIDC Identity Assurance enrollment](enrollment.md) for existing host login flows

Each adapter guide describes key control, supported actions and recovery limits.
Read [wallet access and Moovha scope](moovha-scope.md) for the kit's role in
independently controlled wallet access, the embedded backend and the separate
DeFi operation/execution and device-recovery scopes.

## Understand the design

- [Wallet access, custody models and Moovha scope](moovha-scope.md)
- [Architecture, standards and contract ownership](architecture.md)
- [Adoption assessment against maintained public projects](adoption-assessment.md)
- [Related projects and reuse decisions](related-projects.md)
- [Implemented provider OpenAPI](../spec/provider-api.json)
- [Orchestration draft](../spec/orchestration-draft.json) — reference only

## Contribute and operate releases

- [Contributing](../CONTRIBUTING.md) and [writing guide](writing-guide.md)
- [Branch workflow](branch-workflow.md) and [release process](releases.md)
- [Security reporting](../SECURITY.md), [governance](../GOVERNANCE.md) and
  [changelog](../CHANGELOG.md)
- [Extraction provenance](extraction.json)

## Repository map

| Location                                     | Responsibility                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/index.ts`, `src/core.ts`, `src/http.ts` | Public convenience, domain and HTTP entry points                             |
| `src/domain/`                                | Authority contracts, signing/enrollment and execution services               |
| `src/service/`                               | HTTP routes, token verification, schemas and telemetry                       |
| `src/onboarding/`                            | Consent/review, access policy, login, identity vendors and reference storage |
| `src/identity/`                              | Lower-level OIDC identity verification                                       |
| `src/providers/`                             | Backend adapters and durable-attempt wrapper                                 |
| `src/protocol/`                              | Generated contract types; don't edit manually                                |
| `spec/`                                      | Implemented provider contract and separate orchestration draft               |
| `examples/`                                  | Inspection and complete offline provider walkthrough fixtures                |
| `docs/provider.config.example.ts`            | Canonical typed onboarding startup example                                   |
| `ops/`                                       | Optional local monitoring configuration                                      |
| `test/`, `scripts/`, `.github/`              | Offline tests, maintenance/distribution checks and CI                        |
| `dist/`                                      | Generated JavaScript/declarations; included in tarballs, ignored in Git      |

One source package keeps the current project small. New applications consume its
public entry points; they don't need to understand the contributor scripts or
rearrange internal directories.
