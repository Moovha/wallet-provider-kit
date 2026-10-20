# Durable storage

The provider uses SQLite schema version 2 for approvals, admissions, attempts, reservations, audit evidence and structured service records. New databases are initialized explicitly. Unsupported schema versions fail closed; this undeployed format does not include migration or compatibility adapters.

Financial authority binds an immutable Safe operation to its owner, application, grant, policy revision and sponsorship reservation. A lost response preserves the original attempt. Uncertain dispatch never releases authority merely because a reply is absent.

Audit records are append-only under transactional validation. Backups must include the SQLite online backup, OWS vault, retained owner passphrase and credential encryption key. Restore into an isolated environment and reconcile retained outcomes before enabling writes.
