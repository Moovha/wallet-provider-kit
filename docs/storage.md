# Keep the service’s records safe

Your service needs its saved permissions, transaction attempts and keys after a
restart. Keep them on persistent local storage and back them up as one recovery
set. For the backup procedure, follow [maintenance](provider-maintenance.md).

## Storage contract for developers

The provider uses SQLite schema version 3 for approvals, admissions, attempts, reservations, audit evidence and structured service records. New databases are initialized explicitly. Unsupported schema versions fail closed. Existing version 2 databases require the explicit, stopped-writer [storage upgrade](provider-maintenance.md#upgrade-sqlite-storage-from-version-2-to-3); ordinary startup never migrates them.

Financial authority binds an immutable Safe operation to its owner, application, grant, policy revision and sponsorship reservation. A lost response preserves the original attempt. Uncertain dispatch never releases authority merely because a reply is absent.

Audit records are append-only under transactional validation. Backups must include a consistent SQLite backup, OWS vault, retained owner passphrase and credential encryption key. Restore into an isolated environment and reconcile retained outcomes before enabling writes.

## Records across networks

A multi-network instance uses schema version 3. Verified-user profiles,
application registrations and provider administration share instance records.
The default network keeps its existing collection names and IDs. Additional
networks use namespaced operational collections for accounts, grants, policies,
credentials, execution and sponsorship. Network-specific gas ledgers and encrypted
credential keys prevent an application’s funding or credentials from being reused
on another network. The financial tables retain immutable, chain-bound approvals
and globally unique account and action IDs. Removing a configured network fences
its retained transaction writers without deleting records. Include all networks
in one consistent recovery set.

Older builds cannot read network-prefixed collections. Retain a consistent pre-upgrade backup before enabling additional networks.

## Record lookup and growth

SQLite point reads use the `(collection, id)` primary key. Owner, account,
caller and resource lookups use durable SQLite indexes of candidate IDs. They
reload current records inside the transaction before checking authority. These
indexes contain no cached authorization decisions. Counts use maintained totals;
pagination seeks a bounded window of IDs before reading records. Appending audit
evidence does not load earlier audit events.

Database triggers update candidate IDs, counts and the collection catalog in the
same transaction as each record insert, update or delete. Writes through another
SQLite connection update the same indexes, including replacement writes. Ordinary
lookups need neither a first-use collection scan nor an invalidation rebuild after
external commits. Integrations must write through the supported record adapters;
derived lookup tables are not a public write interface.

Schema version 3 adds these tables and triggers. Its explicit version 2 upgrade
builds them once, transactionally, from the retained records. Plan maintenance time
and disk space for that operation and its journal. Startup and the offline `doctor` command still verify database integrity and
foreign keys before acceptance. Request readiness checks verify the bounded schema
catalog, database identity and connection settings; they do not repeat a full
integrity scan or attest to every stored row. Physical corruption or I/O failures
observed by record reads or writes fence the connection. Full verification and a
complete backup still take time proportional to stored data.

SQLite reports use read-only transactions without reserving the writer lock.
The reviewer page and transaction ledger read bounded pages. Bulk account reports,
wallet recovery scans and bundler configuration publication yield between pages
of at most 100 records; no transaction spans a yield. Bundler configuration is
written in chunks and replaces the previous file only after completion. Current
authority is checked again before provider effects; a report is not authorization.

Pages are not a consistent full-database snapshot. Concurrent inserts, updates or
deletes can change later pages. Full exports and recovery scans still perform work
proportional to the relevant history and share CPU and disk capacity with the
service. Pagination bounds individual reads and permits provisioning between them;
it does not make bulk work free. File-backed reference stores remain suitable only
for small fixtures and retain their whole-file transaction behavior.

Global policy tightening, whole-collection replacement and revocation are writes
that still enumerate their affected records atomically. Schedule broad authority
changes and storage upgrades as maintenance; splitting those commits could expose
partially revoked authority. Full startup checks can delay service startup, before
it accepts provisioning requests. They are not repeated by request readiness.

Safe wallet metadata is stored as one `safeWalletAccounts` record per account,
scoped to its network. Runtime initialization moves an older inline wallet map
into these records in one database transaction. It preserves signer bindings,
owner policy and recovery recipes, rejects conflicting copies and rolls back
both sides if the transaction fails. Application capacity checks use the current
index count; a wallet driver reads its selected record. Bundler configuration
still includes all wallets currently authorized for that application.

Retain a consistent backup before upgrading. Earlier builds reject the new record
collection; do not downgrade the upgraded database. Restore the database and
entire vault together with a compatible build, following the
[recovery procedure](provider-maintenance.md).
