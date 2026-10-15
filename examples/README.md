# Wallet service examples

Use the examples in order after [installing the package](../docs/package.md).
They show the wallet/provider flow before you configure a real backend.

The **host** is your wallet service's server application. Its **authority** decides
who may use an account; the **backend** creates accounts and signs; the **journal**
records attempts and results across retries. A connected application is called a
**client** in OAuth configuration. Read [roles and terms](../docs/concepts.md)
for the account owner's role and the corresponding API fields.

| Example                                                        | Run from a source checkout                           | What you learn                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Inspect the API](inspect-api.mjs)                             | `npm run build` then `node examples/inspect-api.mjs` | Liveness, default unavailable readiness and implemented OpenAPI                                       |
| [Complete provider flow](provider-flow/README.md)              | `npm run example:provider`                           | Authentication, account creation, exact signing, replay, revocation, current KYC and unknown outcomes |
| [Onboarding configuration](../docs/provider.config.example.ts) | Copy and configure in your own application           | Existing login, approved application clients, identity vendors, storage and selected wallet backend   |

After installing a tarball, run the first two examples without building:

```sh
node node_modules/@moovha/wallet-provider-kit/examples/inspect-api.mjs
node node_modules/@moovha/wallet-provider-kit/examples/provider-flow/run.mjs
```

The runnable examples use offline fixtures and need no credentials or funds.
They print only safe progress/results and close their HTTP resources. The
onboarding file is a typed configuration template: it needs real integrations,
keeps readiness false, and isn't executed by the offline checks.

Continue with [Connect your wallet backend](../docs/backend-guide.md), then
[Integrate your host](../docs/provider-guide.md). The backend, host authority and
journal are separate replacement points; the walkthrough fixtures are not
persistent deployment adapters.
