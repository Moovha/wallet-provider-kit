# Back up, recover and update a provider

Operate one active writer with retained configuration, database/journals, OWS
vault, encryption and issuer credentials, bundler state and the matching release
bundle. Installation and administrator access do not establish custody acceptance.

## Create an encrypted stopped-service backup

Use the `backup.sh` supplied with the reviewed release bundle:

```sh
export WPK_DIRECTORY=/home/wallet-provider/provider
bash backup.sh /private-backups/provider.tgz.enc
```

The backup path must be new and outside the installation. The script stops API,
bundler and cache writers without removing containers or volumes, then streams
an archive through password-based OpenSSL encryption. Keep the encryption
passphrase separately. The service remains stopped so the operator can review
pending and uncertain work before restarting it. A failed backup does not delete
the installation; inspect the incomplete output before creating another backup.

The archive contains custody and authentication material, including retained
private keys within the OWS vault. Protect it as strongly as the live deployment.
Test decryption and restore into an isolated environment using offline fixtures
before relying on a backup. Copying a live SQLite file is not this backup procedure.

## Restore with financial uncertainty preserved

Restore onto a new isolated host with the matching service release and compatible
storage schema. Never extract an untrusted archive over an active installation.
Inspect archive paths, file ownership and permissions before use. Keep the original
installation stopped and preserve all available recent journals and chain evidence.

Decrypt into a private location. Restore database, vault, retained credentials
and configuration as one recovery set. Keep wallet operations disabled and
reconcile outstanding attempts using their original operation identities. Review
observed chain state independently before admitting new actions.

An older backup can omit an operation that already reached a provider or chain.
Neither a missing journal record nor a timeout proves no financial effect occurred.
A restore must not recreate identities, silently replay calls or reset budgets to
make uncertain operations appear safe. The toolkit deliberately provides no
one-click financial rollback or generic key-export API.

## Review an upgrade before replacing images

Automatic unattended service updates are disabled. The installer rejects a
completed installation whose image digests differ from the selected release.
Use an explicit maintenance procedure:

1. Verify the target release's signatures/provenance, components and compatibility.
2. Stop affected admissions; inspect pending/unknown attempts, queued batches and
   application infrastructure work. Complete or reconcile them before replacement.
3. Stop writers and obtain an encrypted, verified recovery set with the old release.
4. Review configuration/schema requirements. Do not apply schema DDL to another
   application's database or infer compatibility from an image tag.
5. Change only the reviewed image digests in the retained Compose definition.
   Keep the same identity, secrets and volume paths. Retain the old definition.
6. Restart and verify management, authority denials, backend/recovery behavior and
   application execution separately before restoring admission.

Container replacement is not a universal rollback. A new schema or financial
operation can make returning to an older image unsafe. Plan any rollback against
actual schema and chain evidence. Do not promise zero downtime for the single-host
runtime. Operating-system updates and cloud resource replacement remain with the
provider's infrastructure tools; the wallet service has no host shell authority.

## Release and acceptance evidence

The **Package provider release** workflow builds amd64/arm64 images, immutable
manifest references, SBOM/provenance, an attested archive and experimental release
assets. Dispatching it publishes artifacts; it does not deploy a host, create a
provider account, fund a wallet or publish npm. Dispatch requires separate release
authority. Container and cloud acceptance must be reported independently from
offline application tests. Further cloud targets, SSO and offline installation
bundles require their own implementation and evidence.
