---
prev: { 'text': 'Monitor your service', 'link': '/docs/operations' }
next: false
---

# Back up and look after your service

Plan backups before welcoming users, and agree who can restore the service. A
backup contains private keys and credentials as well as records; protect it as
strongly as the running service. Keep the backup recovery identity separately.

Run one active writer. Retain configuration, database/journals, OWS vault,
encryption and issuer credentials, bundler state and the matching release bundle
together. Administrator access alone does not establish custody readiness.

## Prepare private backup storage

The release bundle includes `backup.sh`, `verify-backup.sh`, `restore.sh` and
`recovery.py`. Run them on a POSIX host as the service operator. Install Python
**3.10 or newer**, `age` **1.1 or newer** and Docker Compose v2 from trusted
packages. Verification and restoration need Python and age, but do not need Docker
or contact a provider. Keep the matching release bundle available separately.
The tools support the self-contained OWS/SQLite release profile with immutable
container images and installation-local bind mounts. External storage, symbolic
links, hard links, named Docker volumes and separately supplied secrets are
rejected. Do not use the tools on an embedded or custom layout without reviewing
its recovery requirements.

Choose a private backup directory outside the installation, ideally on a separate
disk. For example, `/var/backups/wallet-provider/` must be owned by the service
operator with mode `0700`. The manual tools do not create cloud storage. The optional scheduled S3 job below uploads encrypted archives to your existing bucket.
Copy successful encrypted backups to separately controlled off-site storage and
verify the copied bytes before relying on them. Set retention and access policies
for that storage; a copy on the provider disk alone does not protect against its loss.

On a separate recovery computer, create an age identity and its public recipient:

```sh
umask 077
mkdir -m 700 /private-recovery
age-keygen -o /private-recovery/provider.key
age-keygen -y /private-recovery/provider.key > /private-recovery/recipients.txt
```

Keep `provider.key` in separately protected recovery storage with another secured
copy. Transfer only `recipients.txt` to the provider host, outside its installation.
The backup job needs the public recipient; it does not need the recovery private
key. Native age X25519 recipients are supported. Multiple recipient lines allow
**any one** recipient to decrypt; they do not create a multi-person quorum.
Losing every recovery identity makes the archive unrecoverable. Rotating a backup
recipient does not revoke access to older archives.

## Create an encrypted stopped-service backup

Stop external admissions and coordinate maintenance so no other process or
operator restarts writers during the backup. Use a local Unix-socket Docker context.
The installation and backup directories must be private and owned by the operator.
If host maintenance has retained administrator-owned files, run the backup explicitly
as the host administrator with `--host-administrator`. This permits private
service-owned directories without changing their ownership or widening file access.
The encrypted output belongs to the invoking operator; restore remains a separate
operation on the recovery computer.

```sh
export WPK_DIRECTORY=/home/wallet-provider/provider
bash backup.sh /var/backups/wallet-provider/provider-2026-10-26.age \
  --recipients /home/wallet-provider/recovery/recipients.txt
```

The output must be a new absolute path outside the installation. The script stops
all Compose services, checks that containers are stopped and archives the complete
installation (excluding previous recovery reports) with an encrypted inventory of file checksums, required paths,
SQLite schema identity and immutable image references. It checks the inventory
again before publishing the encrypted file. Files added or changed during capture
cause failure. The service remains stopped after success or failure; no containers
or volumes are deleted. Inspect source state before restarting the original writer.

The archive contains the signer vault, retained passphrase, credential-encryption
and issuer keys, database, bundler queues, configuration and any other files in the
installation. Every configured environment-secret reference must be retained in
`provider.env`. The archive uses age authenticated encryption; it replaces the
older password-encrypted `.tgz.enc` format. These tools do not import legacy
archives. Preserve the matching legacy procedure if you retain older backups.

Only complete encrypted output is published. Failed temporary encrypted output is
removed during ordinary error handling; an interrupted process can leave a private
`.wpk-encrypted-*` file for inspection. Do not treat it as a completed backup.

A backup covers its stopped-writer snapshot. New wallets and subsequent operations
are not covered until the next successful backup. A provisioning gate that requires
off-site backup before exposing a new deposit address is not supplied. Choose an
acceptable recovery-point policy before enabling use.

## Schedule encrypted backups to S3

Use `scheduled-backup.py` with AWS CLI **v2** supporting `IfNoneMatch` and SHA-256
checksums, Python, age and Docker Compose. It uses the same stopped-writer snapshot
format. Every scheduled run briefly interrupts the original services. Choose a
maintenance window that fits your application; this is not an online backup.

The job creates an encrypted local archive, resumes only the original source
containers, then uploads and verifies the S3 checksum. It does not need the age
recovery identity. Keep that identity on the recovery computer or in separate
recovery storage. Installation does not create a bucket, grant IAM permissions or
authorize a different cloud Region.

Prepare a private general purpose S3 bucket in your selected Region with all four
Block Public Access controls enabled. Verify the owner independently. The supplied
`backup-iam-policy.example.json` grants bucket inspection and object write/read
permissions only for the selected prefix. Replace its bucket, prefix and owner
with your own values. The write permission requires a conditional create request;
keep other policies from granting this job unconditional overwrite or deletion.
Attach the reviewed policy to the host's existing instance
role, or use a separately configured AWS CLI profile for non-EC2 hosts. On AWS,
confirm the selected Region in **AWS Settings → View all projects → Overview →
Additional Info → Region**. Keep instance roles managed through your infrastructure
configuration. No static AWS keys belong in the backup configuration or release bundle.

Copy `backup.config.example.json` to a private operator-owned file and edit it:

```json
{
  "configVersion": 1,
  "enabled": true,
  "directory": "/home/wallet-provider/provider",
  "outputDirectory": "/var/backups/wallet-provider",
  "recipients": "/etc/wallet-provider-backup/recipients.txt",
  "resumeSource": true,
  "hostAdministrator": true,
  "localKeep": 7,
  "schedule": "*-*-* 02:00:00 UTC",
  "s3": {
    "bucket": "your-private-backup-bucket",
    "prefix": "wallet-provider/daily",
    "region": "eu-north-1",
    "expectedOwner": "123456789012"
  }
}
```

Replace the Region with your selected Region. Bucket names without dots in the
commercial AWS partition are supported. `prefix` selects this installation's
remote backup namespace. `schedule` is a systemd calendar with an explicit timezone;
for example, `*-*-* 02:00:00 Africa/Johannesburg`. `localKeep` counts successfully
uploaded local snapshots; **zero keeps all**. It does not delete S3 objects or
unmanaged local files. Failed or unverified uploads are retained locally and can
consume disk space until an operator reviews them.

`enabled` starts false in the example. `resumeSource` explicitly allows continued
operation of the unchanged original writer after capture; it never starts a
restored installation. The system installer requires both settings and
`hostAdministrator` to be true. Unprivileged operators can use `run` with their own
scheduler and appropriate Docker access instead of installing the privileged unit.
Optional `s3.profile` selects an existing AWS CLI profile. Optional `s3.kmsKeyArn`
selects an existing KMS key in the same Region; also grant `kms:GenerateDataKey`
and `kms:Decrypt` for that exact key in its key policy and the caller's IAM policy.
Without that option, uploaded objects use S3-managed AES-256 encryption in addition
to the archive's age encryption. The recovery identity remains required either way.

On Linux, prepare the output directory and public recipients, then install the job
from the reviewed release bundle as the host administrator:

```sh
sudo install -d -m 700 /var/backups/wallet-provider /etc/wallet-provider-backup
sudo install -m 600 /private-settings/recipients.txt /etc/wallet-provider-backup/recipients.txt
sudo install -m 600 /private-settings/backup.config.json /etc/wallet-provider-backup/settings.json
sudo python3 scheduled-backup.py validate --config /etc/wallet-provider-backup/settings.json
sudo python3 scheduled-backup.py install --config /etc/wallet-provider-backup/settings.json
sudo systemctl start wallet-provider-backup.service
sudo systemctl status wallet-provider-backup.service
sudo systemctl list-timers wallet-provider-backup.timer
```

The installer copies the reviewed Python tools to root-owned
`/usr/local/lib/wallet-provider-backup/`, retains the effective private configuration
at `/etc/wallet-provider-backup/config.json`, and enables the timer. It refuses an
existing job unless you explicitly use `install --replace`. Review and stop the
timer before changing the effective configuration or tools. Missed calendar runs
are not automatically caught up after downtime. Run the service once after
installation or maintenance to establish current backup evidence.

Check `systemctl status wallet-provider-backup.service`, the journal and
`/var/backups/wallet-provider/backup-status.json`. The status file records the last
attempt, current phase and last successful upload time; receipts retain private
object locations and checksums. Treat a failed service, a stale last success or a
persistent `running` state as requiring operator attention. Monitor those signals
with your infrastructure monitoring; notification delivery is not bundled.

S3 checksums are verified with a conditional upload and a checksum-enabled HEAD
request for the returned object version. Existing object keys cannot be overwritten
by the job's upload. This uploader supports encrypted archives up to
**5,000,000,000 bytes**; larger archives stay local and fail the upload phase rather
than using an unreviewed multipart path. Check archive growth and allow local space
for failures. Archive verification and signer recovery drills remain separate from
successful S3 upload checks.

Set S3 retention through reviewed bucket lifecycle or Object Lock settings, with a
prefix dedicated to this provider. The job has no S3 deletion permission and does
not expire existing backups. Each run stores a full encrypted snapshot, so storage,
PUT/HEAD requests and any configured KMS use incur charges; cross-location downloads
can add transfer charges. Review [S3 pricing](https://aws.amazon.com/s3/pricing/) and
your bucket's retention policy before enabling a frequent schedule.

The source directory, credential/configuration hashes and container identities must
remain unchanged before resumption. Only containers that were running before the
snapshot are restarted; previously stopped services remain stopped. Original
pending and uncertain work stays in its existing journal. Upload failures leave
the resumed source running and keep local ciphertext. A changed source or failed
restart leaves a failed job for operator review. Process termination or host loss
during capture can leave the source stopped; the job cannot promise unattended
recovery from those events. Never substitute a restored copy to clear that failure.

## Verify and restore in isolation

On the recovery computer, use the separately retained identity. Choose private
working storage: verification temporarily decrypts the full installation. Temporary
plaintext is removed on ordinary completion or error, but interrupted processes
can leave `.wpk-recovery-*` directories. Use encrypted disks and inspect interrupted
work privately; deletion does not guarantee physical erasure on SSDs or snapshots.
The current format limits recovery sets to 64 GiB and 100,000 entries, with a
32 MiB manifest. Allow space for both the decrypted archive and restored files.

```sh
bash verify-backup.sh /private-backups/provider-2026-10-26.age \
  --identity /private-recovery/provider.key
bash restore.sh /private-backups/provider-2026-10-26.age \
  /private-recovery/restored-provider --identity /private-recovery/provider.key
```

Archive authentication must finish before any files are extracted. Verification
checks the inventory, required files, database identity, schema version, integrity
and foreign keys. Unsafe paths, links, duplicate members, missing components and
changed checksums fail closed. Encryption authentication detects alteration; it
does not establish the archive's author or freshness. Keep independently trusted
backup records and compare the intended snapshot before choosing a recovery set.

Restore refuses any existing destination. Files use private permissions and
ownership of the current operator; owner executable permission is retained where
needed. The restored `provider.config.json` disables execution on every configured
network. The restored `compose.json` uses a new project name, rebases bind mounts
to the destination and fences **all services** with a failing entrypoint, no
network, no published ports and no automatic restart. No container is started.
This also prevents copied bundler queues from resuming unexpectedly.

`recovery-manifest.json` describes the original snapshot. `recovery-status.json`
records that chain reconciliation and original-writer fencing are required; it
does not claim signer recovery. `recovery-originals.json` retains the original
configuration and a Compose definition rebased to the destination for private
operator review. Treat these files as sensitive. Historical installation files
are also retained; never run an older Compose definition from the recovered set.
The guarded configuration and Compose file intentionally differ from their
original inventory checksums. Database, vault and credentials are not rewritten.

## Prove recovery before resuming service

First rehearse with ephemeral offline fixtures and the matching toolkit image.
Verify that the restored passphrase can unlock the restored signer and produce an
offline proof for its original address. Compare wallet bindings and retained
unknown attempts, nonce reservations, sponsorship budgets and queues. A readable
archive or SQLite integrity pass does not prove those signing and financial contracts.

For a real recovery, stop or fence the original host and retain all recent
journals and independent chain evidence. Keep the recovered containers fenced
while reconciling outstanding attempts with their original identities. Do not
sign, broadcast or replay transactions as a backup verification step.

An older backup can omit an operation that already reached a provider or chain.
Neither a missing journal record nor a timeout proves no financial effect occurred.
A restore must not recreate identities, silently replay calls or reset budgets to
make uncertain operations appear safe. Cross-check current owner policies,
credentials, grants and revocations; restoring old records can restore old authority.

After reconciliation, review `recovery-originals.json` against the matching release
and actual destination. Confirm the destination user, bind paths, private access
boundary and image availability. Prepare a reviewed Compose definition and
configuration for resumption; do not run both installations or blindly restore
old activation settings. Restoration deliberately has no automatic resume command,
one-click financial rollback, signer replacement or generic key-export API.
Repeat affected [launch checks](conformance.md) before admitting wallet operations.

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

## Choose the right release

Use a reviewed release bundle with verified provenance and compatibility.
[Release preparation](releases.md) is a maintainer task, separate from updating
your installation. Image builds and offline tests do not establish container,
cloud or custody acceptance. After maintenance, repeat the affected
[launch checks](conformance.md) before enabling wallet operations.
