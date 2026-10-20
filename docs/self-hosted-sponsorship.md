# Private bundler and paymaster

Each accepted application has retained funding infrastructure, a verifying paymaster and a private bundler. Each user has their own Safe. The provider’s encrypted credential registry retains infrastructure secrets; credential metadata never exposes values.

Provision application infrastructure with a dedicated operator token after accepting services and sponsorship terms. Fund the returned gas address within explicit limits. Infrastructure deployment and module setup have durable transaction journals and reconcile their exact signed transactions after uncertainty.

New user Safes deploy with their owner, ERC-4337 module and fallback handler in
one factory transaction. The service checks the pinned Safe 0.3.0
`SafeModuleSetup` helper before its initialization delegate call, then verifies
the exact owner, threshold, singleton, module, handler, guard and EntryPoint
configuration before returning the Safe as ready. Each new account retains its
initializer. Existing addresses and prepared accounts keep their original setup
path; a retry never replaces an account with a differently initialized Safe.

Repeated provisioning of a ready Safe still checks current access and chain
configuration, but skips installation reads and setup signatures. Independent
fee, estimate, balance and nonce reads run concurrently before the bounded gas
reservation and durable admission.

Application infrastructure shares a funding nonce, so setup transactions remain
ordered. Receipt observation retries transient RPC failures. Before creating a
new setup transaction, provisioning observes retained transaction hashes from the
same application without rebroadcasting another user's transaction. Verified
inclusion advances the funding queue; expired or unknown journal attempts settle
through verified reconciliation. An active dispatch lease retains its fence until
completion or expiry. Unknown outcomes retain their gas reservations.

The bundler uses source-pinned Pimlico Alto v1.2.8 at `37cade5d2804a60ab30362ea27054514e1d7a7c8`. Its scheduler waits for executor submission before releasing the next bundle; retained waiting operations can share a bundle. The external process and scheduler patch are GPL-3.0, with source and license material in the image. See [NOTICE](../NOTICE).

The local verifying paymaster includes pinned MIT-licensed contract sources listed in [contract provenance](../contracts/vendor/README.md). Keep the paymaster deposit and bundler submission-gas balance funded separately. A funded paymaster does not authorize user spending.

See [deployment](operator-deployment.md), [gas](assets-and-gas.md), [wallet calls](wallet-calls.md) and [execution recovery](user-operation-execution.md).
