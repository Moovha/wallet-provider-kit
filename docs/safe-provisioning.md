# Automatic Safe provisioning

Use automatic Safe provisioning when your application needs contract calls from a smart account. The wallet backend creates the signing wallet; the provider then deploys a Safe 1.4.1 account owned only by that wallet, with threshold one. The signing wallet address and Safe address are separate. Fund the Safe with the assets its approved calls will use.

## Configure deployment

In **Deployment**, select the approved EVM execution profile with the bundled local execution engine. Enable approved contract calls, then **Automatically provision a Safe for each new wallet**. Existing Safe bindings can remain configured alongside automatic accounts.

The defaults pin the canonical Safe 1.4.1 factory and singleton from [safe-deployments v1.37.40](https://github.com/safe-global/safe-deployments/tree/v1.37.40/src/assets/v1.4.1), and the proxy runtime from [safe-contracts 1.4.1](https://github.com/safe-global/safe-smart-account/tree/v1.4.1). Before deployment, both configured RPC endpoints must agree on the selected chain, genesis, factory code, singleton code and factory proxy creation code. Review these pins before changing them.

Configure a separate application gas sponsor, including gas limit, fee ceilings, L1 fee reserve and lifetime gas budget. Safe deployment reserves its full configured ceiling from the same application budget used for transaction execution. Fund the sponsor before the first provisioning request and ensure the gas limit covers the simulated factory transaction. Unknown outcomes retain their reservation. The service does not install modules, a guard, a fallback handler, a delegatecall initializer or a setup payment.

The application registration and owner delegation must include `operations:request` for deployment and `contracts:request` for later contract actions. OAuth scope alone does not grant either permission. Before enabling wallet operations, record backend, recovery, execution and Safe provisioning acceptance references. These references are operator attestations; the wizard does not verify their contents.

## Provision and poll

Call `POST /v1/accounts/{accountId}/provision` with the accepted owner account UUID, provision scope, an empty object and a retained UUID idempotency key. The response contains the signing wallet `address` and a separate `smart_account` object with the Safe address, chain and deployment status.

Poll `GET /v1/accounts/{accountId}/safe` with account-read scope and current owner delegation. `ready` requires matching finalized proxy code across both RPCs, plus current singleton, owner, threshold, module, guard and fallback checks. Finality can take longer than inclusion. Approved calls use automatically provisioned accounts only after they are ready; every execution still verifies current on-chain account authority.

`pending` means deployment was accepted but has not passed finality checks. `unknown` means the provider cannot establish a successful outcome. Reading never submits or retries a deployment. Repeating provisioning reuses the retained attempt even if the HTTP idempotency key changes. Do not create another owner account to work around an uncertain submission. Retain the database, encrypted wallet vault and sponsor state, reconcile the original factory transaction, then poll again. Matching finalized state can recover an unknown deployment without another broadcast.

Deployment settings, signer ownership and the deterministic account binding are retained in the provider database. Back up this database with the wallet and sponsor stores using the [recovery procedure](stuck-transactions-and-recovery.md). Changing the deployment factory, singleton, proxy code pin or network cannot silently replace an existing automatic Safe binding.

Automatic deployment does not register application contracts, grant spending authority, supply asset balances or establish business settlement. Complete the application policy, action approval, signing, submission and receipt checks separately. Offline tests establish protocol behavior only; funded acceptance must exercise the exact deployed contracts and limits.
