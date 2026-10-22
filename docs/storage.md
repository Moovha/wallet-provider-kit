# Keep the service’s records safe

Your service needs its saved permissions, transaction attempts and keys after a
restart. Keep them on persistent local storage and back them up as one recovery
set. For the backup procedure, follow [maintenance](provider-maintenance.md).

## Storage contract for developers

The provider uses SQLite schema version 2 for approvals, admissions, attempts, reservations, audit evidence and structured service records. New databases are initialized explicitly. Unsupported schema versions fail closed; automatic migrations and compatibility adapters are not supplied.

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
