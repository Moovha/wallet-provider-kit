# How transaction signatures stay bound to permission

This page is for developers reviewing signing and recovery. A signature must
cover the exact approved operation and its limits. Applications use the
[wallet API](wallet-calls.md); internal signing ports are for provider implementation.

## Signing and retry contract

A SafeOp signature binds the exact calls, EntryPoint nonce, gas and fee bounds, validity and sponsorship to the configured module domain. Current owner identity, grant, consent, published policy and chain proof remain mandatory at signing boundaries.

The provider records a single immutable operation identity before financial admission. Sponsorship and owner signing share the same durable reservations. A replay cannot change payload, account, application, policy or mechanism. Uncertain signing preserves its claim; it never grants fresh dispatch permission.

OWS returns only the signature through its protected signing port. The public wallet API returns durable batch state. Native Safe signatures are used solely by fixed infrastructure bootstrap calls that install the ERC-4337 module and handler before activation. No public arbitrary-signature route exists.

See [storage](storage.md) and [execution](user-operation-execution.md).
