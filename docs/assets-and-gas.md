# Blockchain assets and gas sponsorship

Wallet Provider Kit supports blockchain wallets for payments and decentralised
finance (DeFi).
It helps teams make blockchain wallets usable through familiar login, consent
and approval experiences. The assets and transactions still live on a blockchain;
the simpler experience should make them easier to understand.

## Assets people recognise

USDC and ZARP are examples of blockchain assets used in the wider Moovha project.
Connected applications can use wallet access to offer supported transfers, swaps
and DeFi operations. Each operation still needs the owner's approval and a tested
asset, network and execution path. The provider kit supplies account access and
approved-action signing; the connected application's business API coordinates
the financial operation.

An asset's symbol is its display name, not its technical identity. Integrations
must bind the actual chain, token contract, decimals and signing domain. Show
people the asset and network in their approval experience, and use exact integer
base units in API requests. Vault shares and the assets they represent are
different tokens with different units; a share balance must not be presented as
the same amount of its underlying asset.

The experimental Base Sepolia profiles support ERC-3009 transfer authorizations
and separately approved Safe contract calls, original Uniswap V3 swaps and
bounded ERC-4626 router deposits. The optional coordinator uses a configured
application sponsor and verifies the evidence required for each operation.
These are test-network capabilities, not production acceptance for USDC, ZARP or
any particular protocol. See [transfer execution](execution.md) and
[approved contract calls](approved-contract-calls.md).

## The application covers gas

<figure class="wallet-visual">
  <img src="./public/diagrams/assets-and-gas.webp" alt="Diagram: the wallet provider authorizes signing while the application arranges a separate network-fee budget, payer, execution and reconciliation." width="1536" height="1024" loading="lazy" decoding="async">
  <figcaption>The sponsor funds eligible network fees; the provider retains wallet authority. The optional coordinator uses a pre-existing application-funded sponsor; live acceptance remains pending.</figcaption>
</figure>

[View full-size diagram](public/diagrams/assets-and-gas.webp)

**Gas** is the blockchain network fee for executing a transaction. It is separate
from the asset being sent and from any disclosed product, swap or payout fee.

Gas sponsorship is a project-supported part of the wallet integration design.
Connected applications are expected to fund eligible network fees for the
supported operations they request. **When Moovha is the connected application,
Moovha is the sponsor.** A provider whose users approve Moovha access should be
able to rely on that rail, without building a separate gas-funding service or
requiring users to buy and maintain a gas token for those operations.

| Participant           | Responsibility                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account owner         | Approves application access and the exact financial action.                                                                                                                          |
| Wallet provider       | Keeps its wallet-control and recovery model, checks current authority and returns the approved signing or submission result.                                                         |
| Connected application | Arranges sponsorship, admits the operation's fee budget, coordinates execution and reconciles eligible network costs. Moovha takes this role for Moovha operations.                  |
| On-chain payer        | Pays the network transaction fee through the agreed execution path. It may be the application's relayer or a wallet funded for that exact step; it need not be the economic sponsor. |

Approving application access does not itself approve a spend or release gas
funding. The exact operation must pass current owner, grant, consent, identity,
capability and sponsor-budget checks before financial effects.

## Where sponsorship happens in the implemented flow

The application and operator arrange funding for a pre-existing sponsor account
before `/execute`. The operator configures its address, funding agreement, limits
and submission provider against the application's authenticated client ID.
Sponsor submission credentials stay in the executor's secret store. The caller
cannot select another payer or supply credentials in an execution request.

1. The application requests a policy-approved action and retains its action ID.
2. At `/execute`, the wallet chooses the registered sponsor, simulates the exact
   operation, checks its native ETH balance and admits a durable gas reservation.
   The designated executor independently checks funding and reserves its own
   provider attempt. Neither reservation transfers money or pays a second fee.
3. The sponsor submits the outer transaction. Network inclusion charges that
   account for execution and applicable chain fees, including a reverted
   transaction. Read-only simulation does not itself spend network gas.
4. The application consumes verified execution status and reconciles actual costs
   through chain receipts and provider billing. Wallet status is not a gas
   invoice, reimbursement record or automatic debit of the application.

| Operation                                                | Outer transaction paid by the sponsor                         | Principal assets                                  |
| -------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| ERC-3009 token transfer                                  | Token authorization call                                      | Tokens from the owner's EOA                       |
| Safe swap                                                | Safe execution containing approval, swap and cleanup calls    | Input tokens held by the Safe                     |
| Safe vault deposit                                       | Safe execution containing approval, deposit and cleanup calls | Underlying assets held by the Safe                |
| Approved contract calls, including Safe ERC-20 transfers | Safe execution of the approved call or batch                  | Tokens and any native call value held by the Safe |

A batch has one outer transaction; internal approvals and calls contribute to its
cost. Gas funding does not provide swap inputs, deposit assets or native value
transferred to a contract. Applications arrange and maintain sponsor funding,
obtain the owner's required delegation, request approved actions, call `/execute`
with their stored IDs and stable idempotency keys, then consume status/events.
The coordinated path does not require the application to broadcast transactions.

Each service reserves `gasLimit × maxFeePerGas + l1FeeReserveWei` against a
lifetime admission budget. A funded account can still be denied when that budget
is exhausted. Reservations remain after success, failure and uncertainty; there
is no automatic release, top-up or public budget-reset endpoint. The reservation
is an admission control, not a guarantee that all actual L1 or vendor recovery
costs stay below it. Review budget changes and provider charges with the operator.

The toolkit supplies neither automatic sponsor funding nor application billing.
Applications can fund a sponsor directly or arrange funding through their accepted
operator/vendor agreement. Installing the kit or obtaining an access grant does
not establish that commercial arrangement.

## What providers should expect from the rail

Before enabling a sponsored operation, the application and provider must agree
on the supported network/account path, who submits, fee limits, expiry and how
pending or uncertain results are reconciled. The application owns the funding
obligation; the provider integrates the agreed signing/submission path.

For Moovha's operation design:

- Sponsorship covers all admitted steps, including required approvals, eligible
  failed calls and replacements, and source/destination steps where applicable.
  Activated network fee components are included in the budget.
- Coverage is independent of the user's existing gas-token balance. An ordinary
  account call receives a bounded full step grant; personal ETH is not deducted
  from the sponsor's obligation.
- A relayer can pay directly for supported authorised calls. Where the wallet
  submits, funding must be confirmed before dispatch. A grant to an ordinary
  externally owned account is spendable native currency; its possible retention
  after rejection is disclosed and bounded.
- Funding retries preserve the original operation and attempt. Lost responses
  require reconciliation before another dispatch; eligible shortfalls are made
  good once against the existing credit.
- Unsupported paths or unavailable budgets are explicit before execution.
  A compliant mined operation cannot silently be charged to the user because a
  sponsor budget ran out. Calls edited outside the admitted terms do not gain an
  unrestricted funding entitlement.

Native currency being transferred as the transaction's principal and disclosed
business fees remain separate from sponsored gas. Sponsorship also leaves
private-key control, recovery and owner approval with their existing holders.

## Implementation and activation

The toolkit implements provider onboarding, access and approved-action signing.
Its optional [execution coordinator](execution.md) uses a dedicated application
sponsor and verifies operation-specific execution and asset effects. An advanced Relayer library profile
is also available. Neither supplies Moovha's funding rail or sponsorship promise.

Moovha's business-operation API owns the sponsorship and execution rail. The
packaged [orchestration draft](../spec/orchestration-draft.json) describes that
separate contract; its sponsorship routes are not implemented by this package.
Installing the kit, configuring a backend or approving a grant does not activate
gas funding. The Moovha sponsorship rail still requires implementation and
acceptance before providers can use it for live operations.

Other connected applications carry the same expectation for their admitted
operations and must supply their own accepted sponsorship integration; the kit
does not automatically fund their transactions. Record the actual sponsor,
submission path and activation evidence in your deployment profile. Validate
zero and existing personal gas balances, multi-step costs, rejection, budget
exhaustion and uncertain funding before advertising gas coverage. Continue with
[provider integration](provider-guide.md) and [acceptance checks](conformance.md).

See [durable Safe queues and sponsor pools](safe-queue-and-sponsor-pools.md) for concurrent request admission, per-Safe ordering, pool configuration and recovery limits.
