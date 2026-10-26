# Understand how wallet access is protected

A connected application must identify itself and have the person’s current
permission. Your service checks those separately before allowing wallet effects.
This reference is for developers and reviewers validating that protection.

## Authority and recovery boundaries

OAuth authenticates the application. Current owner identity, consent and grant authorize account access. Published immutable action policy and durable financial admission authorize spending. These responsibilities are checked separately; possession of a token or funded paymaster is insufficient.

Each user is bound to their own Safe. Admission verifies ownership, threshold, modules, handler, guard, nonce and pinned code at canonical chain state. Calls, fees and sponsorship are immutable once signed. Replays recheck current authority and cannot rewrite retained evidence.

Durable claims serialize external effects. Unknown outcomes preserve reservations and payload identity until exact reconciliation; timeouts alone are never evidence of non-dispatch. Verified inclusion, finality and business settlement are distinct.

Protect the OWS vault, retained passphrase, encrypted application credentials, SQLite database and backups as one recovery boundary. Do not log secrets, raw requests, signatures, credential URLs or owner identifiers. The public API has no arbitrary signing or key export endpoint.

Local setup is an explicit operator tool. It pins a local Docker context, retains private deployment storage and requires acceptance before enabling operations. See [provider responsibilities](provider-guide.md) and [acceptance](conformance.md).

## On-chain co-owners

[Owner management](wallet-owners.md) requires separate owner-administration
consent and the current Safe quorum. Signature intake accepts only exact admitted
SafeOps, with current chain ownership and strict EIP-712 ECDSA verification.
Application membership and bearer scopes cannot replace an owner's signature.
The application must validate signing intent independently before automatically
signing with a device key. Cancellation cannot revoke a signature already issued.
