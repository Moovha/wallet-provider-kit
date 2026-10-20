# Provider installation and administration design

This reference is for maintainers reviewing installation and management changes.
Operators can follow [installation](provider-installation.md) without reading it.
It records design rationale, authority contracts and the limits of available
acceptance evidence. It is not a setup checklist.

## Objective

Deploy a manageable wallet provider with zero connected applications. Establish
protected provider access, then register and configure applications through the
running service. Installation success does not authorize wallet operations.

The normal operator path must not require cloning source, installing Node/npm,
building images, writing callbacks, registering an application, funding gas or
connecting an external identity provider. Source installation remains available
for contributors. npm publication remains disabled.

## Research and decisions

| Evidence                                                                                                                                                                                         | Insight                                                                                 | Decision                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [Keycloak installation](https://www.keycloak.org/getting-started/getting-started-docker)                                                                                                         | Administrative access precedes application realms and clients.                          | Separate installation from application connection.                                                                      |
| [authentik automated installation](https://docs.goauthentik.io/install-config/automated-install)                                                                                                 | First-start administration supports unattended automation.                              | Support interactive and unattended claiming through the same service contract.                                          |
| [ZITADEL Compose installation](https://zitadel.com/docs/self-hosting/deploy/compose)                                                                                                             | A short entry point can coexist with separate initialization, setup and runtime stages. | Keep initialization explicit and runtime credentials separate.                                                          |
| [Portainer initial setup](https://docs.portainer.io/start/install-ce/server/setup)                                                                                                               | Setup tokens protect initial administration; local environments can be detected.        | Require installation ownership proof and reuse detected infrastructure.                                                 |
| [Coolify installation](https://coolify.io/docs/start-with-self-hosted)                                                                                                                           | Public first-admin registration permits an ownership race.                              | Never allow an unauthenticated visitor to claim an installation.                                                        |
| [Harbor installers](https://goharbor.io/docs/edge/install-config/download-installer/)                                                                                                            | Online and offline installers consume prebuilt release images.                          | Package pinned images and inspectable deployment files. Separate offline installation from network-dependent execution. |
| [GitLab containers](https://docs.gitlab.com/install/docker/installation/)                                                                                                                        | Version pins and retained configuration/data define reproducible installations.         | Keep installation identity, configuration, secrets and volumes across restarts.                                         |
| [Docker Compose production](https://docs.docker.com/compose/how-tos/production/)                                                                                                                 | Compose supports single-server deployment.                                              | Use Compose for the supported single-active-host runtime. Do not imply Kubernetes or high availability support.         |
| [AWS quick-create links](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-create-stacks-quick-create-links.html)                                                       | Existing cloud consoles can review prepopulated deployment templates.                   | Add one cloud template around the same release bundle; do not collect broad cloud credentials in the wallet console.    |
| [DigitalOcean Marketplace](https://docs.digitalocean.com/products/marketplace/)                                                                                                                  | Preconfigured images are an established cloud installation path.                        | Treat additional cloud destinations as independently qualified integrations.                                            |
| [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)                                                                                                               | Common tasks should precede optional complexity.                                        | Ask only infrastructure questions during installation; retain visible security consequences.                            |
| [Recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/)                                                                                                               | Visible actions and contextual guidance reduce memory demands.                          | Use familiar destination choices, named progress stages and actionable empty states.                                    |
| [Portainer API](https://docs.portainer.io/api/docs)                                                                                                                                              | UI operations can share an automation API.                                              | Make the console a client of protected management services, with equivalent unattended operations.                      |
| [Grafana service accounts](https://grafana.com/docs/grafana/latest/administration/service-accounts/) and [Harbor robot accounts](https://goharbor.io/docs/2.15.0/administration/robot-accounts/) | Automation identities have separate permissions and credential lifecycles.              | Separate provider operators, automation clients and connected applications.                                             |
| [OAuth registration](https://www.rfc-editor.org/info/rfc7591/)                                                                                                                                   | Programmatic registration can require authorization.                                    | Provider-only registration is sufficient; anonymous registration is not required.                                       |
| [Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)                                                                                                     | Competing file and UI ownership can overwrite changes.                                  | Durable runtime records own applications; startup configuration must not overwrite them.                                |
| [Docker attestations](https://docs.docker.com/build/metadata/attestations/) and [Sigstore verification](https://docs.sigstore.dev/cosign/verifying/verify/)                                      | Release inventories, provenance and signature verification support inspection.          | Record component digests; publish verification material with release artifacts.                                         |
| [Docker secrets](https://docs.docker.com/compose/how-tos/use-secrets/)                                                                                                                           | Services can receive explicitly granted secret files.                                   | Prefer private file/secret-store delivery; never put credentials into URLs, images or general logs.                     |
| [Docker security](https://docs.docker.com/engine/security/)                                                                                                                                      | Daemon access carries host-level authority.                                             | Do not mount the Docker socket into the wallet service or expose arbitrary execution.                                   |
| [Replicated preflights](https://docs.replicated.com/embedded-cluster/v2/embedded-overview)                                                                                                       | Named host checks identify actionable installation blockers.                            | Check architecture, resources, permissions, storage, ports and connectivity before mutation.                            |
| [GitLab backup](https://docs.gitlab.com/install/docker/backup/) and [restore](https://docs.gitlab.com/administration/backup_restore/restore_gitlab/)                                             | Recovery includes secrets and compatible software, not just data.                       | Document complete recovery material and explicit rollback limits.                                                       |
| [Render disks](https://render.com/docs/disks)                                                                                                                                                    | Cloud storage and replacement behavior can constrain stateful workloads.                | Qualify persistence, single-writer behavior and shutdown for every cloud target.                                        |

These sources describe product behavior, not comparative usability measurements.
Adopting these patterns does not establish production custody readiness.

## Authority and persistence contracts

1. Deployment succeeds with zero applications, no application credentials, no
   application RPCs and no sponsor funding. Wallet operations remain disabled.
2. Provider identity, origin, chain, storage and retained encryption/signing
   material belong to the installation. Generation happens once, never on restart.
3. Claiming requires a high-entropy credential with a bounded lifetime, constant
   time verification, atomic single use and protected delivery. Store verifiers
   rather than recoverable authentication secrets where practical. Rate-limit
   unauthenticated attempts and never log their inputs.
4. Claiming establishes a dedicated provider administrator or automation identity.
   It does not create a connected application, grant owner access or enable funds.
5. Restart cannot reopen claiming. Recovery requires separately held host or
   secret-store authority; public reset endpoints are prohibited.
6. Runtime application registrations are durable, bounded and versioned. Create,
   suspend, rotate and trust updates use explicit concurrency/idempotency rules.
   Secret values are returned only at creation/rotation over protected responses.
7. Application authentication and all authority decisions consult current state.
   Suspension and credential rotation invalidate obsolete access. No application
   can become a provider operator through its own configuration proposals.
8. Registration, authentication, trust acceptance, policy publication, sponsorship
   acceptance, activation and owner authorization are distinct decisions.
9. Financial effects retain current owner, grant, KYC, consent, immutable action,
   durable attempt and chain authority checks. Management access is not spending
   authority. Pending or unknown attempts retain their original identities.
10. Installation settings and application runtime settings have one owner each.
    Import/export must not silently overwrite live records or reset revisions.
11. Inspect the toolkit-owned SQLite catalog and existing JSON record collections
    before implementing storage. Use the existing verified schema where possible;
    no routine test creates schemas or calls live providers.
12. Default unconfigured startup remains fail closed. Management readiness and
    wallet execution readiness are separate capabilities.

## Operator experience

Installation has three stages: **Choose where to run → Review your setup → Start and sign in**. Destinations are this computer, an existing Linux
server and an explicitly supported cloud template. Detect/reuse an existing
runtime; explain privileged host changes before running them. Advanced ingress,
storage and secret-store settings appear in their relevant context.

Show destination, version, data location and exposure before starting. Named
progress stages report actual work; do not invent percentages. Failed stages
give a safe retry and preserve completed work. Re-running installation is not a
reset. Data removal is a separate explicit action.

Local access uses loopback with a documented transport boundary. Remote access
requires HTTPS or an authenticated private connection. DNS and certificate
requirements are explicit; browser certificate warnings are not an onboarding
instruction. Existing ingress can be used without installing a second proxy.

The console initially exposes Overview, Applications, Access and API reference.
Operations, Maintenance and Settings are additional task areas when their working
controls are available; do not add empty navigation to imply functionality.
An empty application list is a valid state with actions to register through the
console or API. Keep API reference tools available for integration.

Health distinguishes process liveness, management availability, registered
applications, per-application readiness and wallet activation. Public probes
contain minimal information; protected diagnostics explain blocked capabilities.

## Release and maintenance contracts

- Ship a pinned Compose bundle, release manifest, images, checksums, signatures,
  SBOM/provenance and matching documentation. Operators need not build source.
- Publish container/release artifacts only through the repository's authorized
  release process. Implementing a workflow does not authorize running a release,
  deploying an application or publishing npm.
- Keep runtime service permissions minimal; do not expose internal bundler/cache
  ports or the container daemon. Host lifecycle stays with deployment tooling.
- Backups include database/journals, OWS vault, retained credentials, encryption
  keys, configuration identity and release compatibility information. An older
  backup cannot prove that an external financial effect never occurred.
- Upgrades check compatibility, stop new affected admissions, preserve/reconcile
  in-flight work, back up, replace the pinned release and verify capabilities.
  Do not promise zero downtime or automatic rollback across schema changes.
- Offline bundles, enterprise SSO and additional cloud targets are subsequent
  independently qualified capabilities. Do not present them as delivered merely
  because configuration examples exist.

## Verify changes from storage to interface

Review each layer against the authority contracts before proceeding upward:
persistence and atomic claim; current-state authentication; protected management
APIs; retained installation lifecycle; console and setup; release packaging;
backup/recovery; then end-to-end acceptance. Keep failing cases and unresolved
limits visible. A mocked interface alone cannot establish a layer’s correctness.

### Acceptance scenarios

- Install with zero applications, RPC credentials, sponsorship or external SSO.
- Claim once; reject expired, incorrect, replayed and concurrent claims.
- Restart without reopening claim or changing installation identity.
- Keep provider administrators, management tools and applications separate.
- Add, pause and replace application secrets without restarting the service.
- Require a separate user-check agreement and current owner consent.
- Invalidate obsolete credentials and deny cross-application management/access.
- Publish one application’s rules without resetting another’s approvals.
- Report available management separately from disabled wallet execution.
- Resume interrupted installation without replacing retained secrets or records.
- Reject unsuitable hosts before starting deployment mutations.
- Preserve pending and unknown operations through maintenance.

### Evidence and limits

| Evidence                                                  | What it establishes                                                                                                                                                    | What remains separate                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Offline management/storage tests                          | Claim races, expiry, replay, durable registration, authority isolation and restart behaviour                                                                           | Container, cloud and custody acceptance                             |
| Browser fixtures                                          | Console claim, sign-in, connection settings, pause, replacement, sign-out and narrow-screen layout                                                                     | Live identity-service compatibility and financial effects           |
| CI checks                                                 | Source contracts, generated references, package consumption, image builds and Compose structure                                                                        | Deployed service recovery and funded acceptance                     |
| Clean source-built local deployment at revision `756caa0` | Fresh ARM64 VM, empty storage, claim once, API application registration, secret-once replay, token isolation and restart persistence; wallet execution stayed disabled | Published installer, public HTTPS, AWS and funded wallet operations |
| AWS template structural checks                            | Template shape and retained-storage configuration                                                                                                                      | Live cloud acceptance, costs and performance sizing                 |

[PR 73](https://github.com/Moovha/wallet-provider-kit/pull/73) retains implementation
verification and [PR 74](https://github.com/Moovha/wallet-provider-kit/pull/74)
records clean local acceptance. Evidence from fixtures does not establish
production custody readiness or provider certification. Release tooling exists
independently of release publication; verify available artifacts before installation.

## Keep the reader’s journey intact

The ordinary journey is installation, administrator access, application connection,
application agreements, testing and operation. Ask for application settings when
that application connects. Explain the operator’s decision before introducing
configuration or protocol terms. Keep exact API fields in developer references.

Use **Add application**, **connection details**, **Replace secret**, **Pause connection**
and **management tool** in operator guidance. Explain the user-check agreement
and what people still need to approve. Registration is not consent; an agreement
reference is not verified identity. Changed trust/permissions and pauses revoke
related approvals, while secret replacement preserves approvals and invalidates
old credentials. Renaming affects display metadata. Existing admitted operations
keep their original financial checks and identities.

Put optional technical detail behind a clear summary or in a linked reference.
Do not hide costs, irreversible consequences, uncertain outcomes or required
permission checks. The [public writing guide](public-writing.md) describes the
editorial review for both documentation and interface changes.
