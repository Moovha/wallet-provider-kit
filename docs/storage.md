# Keep the service’s records safe

Your service needs its saved permissions, transaction attempts and keys after a
restart. Keep them on persistent local storage and back them up as one recovery
set. For the backup procedure, follow [maintenance](provider-maintenance.md).

## Storage contract for developers

The provider uses SQLite schema version 2 for approvals, admissions, attempts, reservations, audit evidence and structured service records. New databases are initialized explicitly. Unsupported schema versions fail closed; automatic schema migrations and compatibility adapters are not supplied.

Financial authority binds an immutable Safe operation to its owner, application, grant, policy revision and sponsorship reservation. A lost response preserves the original attempt. Uncertain dispatch never releases authority merely because a reply is absent.

Audit records are append-only under transactional validation. Backups must include a consistent SQLite backup, OWS vault, retained owner passphrase and credential encryption key. Restore into an isolated environment and reconcile retained outcomes before enabling writes.

## Records across networks

A multi-network instance retains schema version 2. Verified-user profiles,
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

SQLite point reads use the existing `(collection, id)` primary key. Owner,
account, caller and resource lookups use in-memory indexes of candidate IDs;
they reload current records inside the transaction before checking authority.
Appending audit evidence does not load earlier audit events. Administrative user
pagination selects a bounded window of IDs before reading user records.

Each index is built on first use and updated after successful local commits.
A write from another connection invalidates it before the next lookup. These
cold builds can scan a collection; frequent external writers can therefore
increase lookup costs. The index contains no cached authorization decisions.
Schema version 2 and its database tables are unchanged.

Full reports, whole-collection replacement and global revocation still enumerate
the records they affect. File-backed reference stores retain their existing
in-memory behavior. These paths are distinct from ordinary SQLite provisioning
and account lookup.

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
