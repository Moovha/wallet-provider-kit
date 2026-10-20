# Private bundler and paymaster

Each accepted application has retained funding infrastructure, a verifying paymaster and a private bundler. Each user has their own Safe. The provider’s encrypted credential registry retains infrastructure secrets; credential metadata never exposes values.

Provision application infrastructure with a dedicated operator token after accepting services and sponsorship terms. Fund the returned gas address within explicit limits. Infrastructure deployment and module setup have durable transaction journals and reconcile their exact signed transactions after uncertainty.

The bundler uses source-pinned Pimlico Alto v1.2.8 at `37cade5d2804a60ab30362ea27054514e1d7a7c8`. Its scheduler waits for executor submission before releasing the next bundle; retained waiting operations can share a bundle. The external process and scheduler patch are GPL-3.0, with source and license material in the image. See [NOTICE](../NOTICE).

The local verifying paymaster includes pinned MIT-licensed contract sources listed in [contract provenance](../contracts/vendor/README.md). Keep the paymaster deposit and bundler submission-gas balance funded separately. A funded paymaster does not authorize user spending.

See [deployment](operator-deployment.md), [gas](assets-and-gas.md), [wallet calls](wallet-calls.md) and [latency evidence](execution-latency.md).
