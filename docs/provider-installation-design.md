# Provider installation and administration design

This design is for maintainers implementing deployment and administration, and
operators evaluating the intended lifecycle. It distinguishes implemented
contracts from acceptance criteria that still require implementation and evidence.
The provider has no deployed installations requiring compatibility migration.

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

Installation has three stages: **Choose destination → Review deployment → Deploy
and open administration**. Destinations are this computer, an existing Linux
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

## Bottom-up implementation and evidence

After each layer, reread the objective, authority contracts and this checklist.
Record code references, focused verification, remaining limits and the next layer.
Do not mark a layer complete from mocked UI behavior alone.

| Layer | Deliverable and acceptance                                                                                                            | Status                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0     | Research, scope, security boundaries and implementation record retained here.                                                         | Recorded                                                            |
| 1     | Verified storage contract; durable management identities, atomic claim and application records with offline tests.                    | Implemented; offline storage and claim tests pass                   |
| 2     | Current-state authentication, provider-only registration/rotation/suspension and runtime trust; existing financial denials preserved. | Implemented; current authority and isolation checks pass            |
| 3     | Protected management API, distinct management health and actionable diagnostics; generated contracts agree.                           | Implemented; generated contracts reviewed                           |
| 4     | Zero-application installation defaults, retained secret delivery and restart-safe deployment lifecycle.                               | Implemented; retained and interrupted setup tested                  |
| 5     | Short destination/review/deploy flow and persistent console backed by real management APIs.                                           | Implemented; 15 browser scenarios pass                              |
| 6     | Versioned inspectable Compose/release packaging, existing-server path and one qualified cloud template.                               | Release tooling and AWS template prepared; live acceptance separate |
| 7     | Backup/restore/upgrade guidance and implemented operations with explicit financial uncertainty limits.                                | Backup and recovery tools; reviewed manual upgrade contract         |
| 8     | End-to-end offline acceptance, generated references, public documentation, required checks and reviewed PR.                           | Final verification and PR publication in progress                   |

### Acceptance scenarios

- Install without applications, RPC credentials, sponsorship or external SSO.
- Claim once; reject expired/wrong/replayed claims and concurrent second claim.
- Restart with the same installation identity; reject a reopened bootstrap.
- Authenticate a dedicated provider identity and create bounded automation access.
- Register an application through API and console without restarting the service.
- Require separate trust configuration; untrusted registration cannot attest users.
- Rotate credentials and suspend an application; existing obsolete access fails.
- Reject ordinary application access to provider management operations.
- Publish application configuration without resetting other applications' grants.
- Explain unavailable execution without marking management unavailable.
- Resume interrupted installation without replacing secrets or durable records.
- Reject unsuitable hosts before starting deployment mutations.
- Preserve pending/unknown attempts during restart and maintenance.
- Verify packaging and documentation using offline fixtures; report Docker/cloud
  acceptance separately and never infer certification from fixtures.

### Evidence checkpoints

Layer 0: repository branch synchronized with main before edits. The current
toolkit schema is version 2 and includes transactional JSON onboarding records.
The current issuer and onboarding policy use static startup application lists;
these must be replaced by current durable authority before the simplified UI can
be considered functional. No compatibility migration is required by the intended
deployment scope.

Layer 1–3 checkpoint: `src/management/service.ts` uses the existing
`onboarding_records` schema through the transactional store and a bounded
management collection. Claim hashes, salted credential verifiers, revisions and
idempotency metadata persist without raw authentication credentials in management
records. Generated installation secrets remain in private retained files.
`test/provider-management.test.ts` covers claim races, expiration, restart,
registration replay, trust separation, grant revocation, rotation, suspension,
HTTP scope denial and management availability while execution is disabled.
The focused management, application-access, issuer and runtime-policy suites pass
66 tests. This is offline evidence; no container or cloud acceptance is implied.
The next layer connects zero-application defaults to installation and packages
the same service for operator deployment.

Layer 4–5 checkpoint: `src/deployment/installation.ts` builds zero-application
defaults and a private resumable preparation record. Exact retained-file matching
prevents replacement of generated credentials. Immutable Compose removes build
requirements from release installation. The default setup interface has three
stages; the advanced editor remains explicit. Browser scenarios exercise the real
management API through an offline transactional fixture, including claim, login,
registration, trust, suspension, logout and narrow-screen layout. The complete
browser suite passes 15 scenarios.

Layer 6–7 checkpoint: `packaging/install.sh`, `backup.sh` and the AWS template
use the same retained deployment files. The manual main-only release workflow
prepares pinned amd64/arm64 images, SBOM/provenance, attested archives and
experimental artifacts. It has not been dispatched. The existing-server installer
reuses a local Docker runtime; it does not install a package manager. Recovery
commands are host-only and cannot reopen a claimed installation. Upgrade and
restore remain reviewed host operations with financial uncertainty preserved.
Cloud qualification, performance sizing, offline bundles and external SSO remain
separate acceptance or future capabilities.

Verification checkpoint: the supported Node 24.22.0/npm 11.11.1 toolchain passes
670 unit/integration tests, generated contracts, formatting and the secret scan.
The documentation builds, npm audit reports zero vulnerabilities and npm pack
dry-run succeeds. The local Docker build could not start because containerd
reported a metadata-store input/output error. No daemon reset, data deletion or
cloud resource creation was attempted. Container acceptance must be reported
separately from offline and browser evidence.

The isolated package consumer check was attempted but could not finish installing
its temporary dependencies because the workstation filesystem reported ENOSPC.
It is not recorded as passing locally. Required CI runs the consumer and Docker
checks on its separate runner before integration. No unrelated files or Docker
volumes were removed to make those checks pass.
