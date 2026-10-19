# Evaluate a local Base deployment

Use the local preview to exercise application tokens, provider approval, account
access and encrypted wallet creation without a vendor account. It runs the real
OWS engine and SQLite store on a loopback HTTP listener. Identity and consent are
synthetic evaluation records. This is an operator evaluation, not certification
of identity verification, production custody, sponsorship or funded execution.

Use Node 24.22.0 and npm 11.11.1. From a built source checkout:

```sh
npm ci
npm run build
npm run preview:local
```

Open [the operator workspace](http://127.0.0.1:8088/operator/) or
[the API explorer](http://127.0.0.1:8088/docs/). The command saves a private
configuration, credentials, encrypted vault, SQLite database and exercise receipt
in `artifacts/local-preview`, with network `base` (chain 8453). Keep this directory
private and excluded from Git. An alternative empty private directory can be
passed after `--`. Do not copy its evaluation acceptance values into production.

The initial exercise requests a disabled application policy, publishes it using
a separate operator token, grants the synthetic owner access and provisions the
wallet twice with the same idempotency key. Both replies must identify the same
wallet. No contract is automatically registered or accepted. The operator workspace
lets you propose contracts/methods and approve policy revisions. Register only
reviewed network-specific addresses, ABI methods and bytecode pins.

Load `operator.token` from that private directory into the workspace's token
field. Use `application.token` for the connected application's API requests.
Tokens expire after five minutes. Restart the command to renew them; its retained
storage keeps wallet and approval identities. Stop with Ctrl-C. An incomplete
first-run directory is retained for inspection and cannot be initialized again.
The synthetic access grant expires after one hour; renew consent through the API
before further owner operations. Never reset storage to recover a wallet.

The preview omits financial policy, execution sponsors and transaction submission.
It cannot spend. Mainnet dispatch needs reviewed token domains, recipients,
amounts, account bindings, contract policies and sponsor limits. Run the normal
[deployment acceptance](operator-deployment.md) process for those settings.
The native preview does not test Docker, public HTTPS or backup restoration.

## Select and bind the network

Set top-level `network` to `base` or `base-sepolia`. New wizard drafts and CLI
`init` select Base mainnet. Imported configurations that omit it retain Base
Sepolia. The selector controls typed-data domains, account chain identifiers,
Relayer network checks, local Relayer generation, RPC verification, runtime
policies, contract discovery and EIP-5792 status/capabilities. Base uses `8453`
(`0x2105`); Sepolia uses `84532` (`0x14a34`). See
[Base's chain identity reference](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId).

Use a separate database, vault and backend binding for each network. The service
persists its network binding and rejects switching an occupied deployment.
Existing stored deployments without that field are Sepolia. Do not edit the
binding or remove records to bypass this guard. Network-specific policy
publications and signed domains cannot be reused across chains.

For the separate execution service, select the same `network` on its provider
registration. The executor rejects actions for another network. Configure at
least two RPC origins and verify their chain IDs and genesis hashes before
activation. Public RPCs can limit historical or simulation methods; chain-ID
availability alone does not satisfy the verifier. Supply the accepted genesis
hash and independently verified code hashes through normal deployment settings.

## Record evidence at each boundary

| Check                                   | Evidence required                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Application and operator authentication | Separate client tokens; application cannot publish provider policy                                                  |
| Registration and approval               | Exact contract addresses, selectors, bytecode pins and policy revision; wrong-network policy denied                 |
| Owner access                            | Current identity, consent, owner-bound grant, expiry and revocation                                                 |
| Wallet lifecycle                        | Same address after replay/restart; encrypted vault and durable attempt identity retained                            |
| Delegated financial signing             | Exact network/account/domain, recipient, amount, budget and unchanged action; signature recovers the expected owner |
| Submission                              | Dedicated funded sponsor, exact approved payload, gas limits and durable dispatch/recovery                          |
| Outcome                                 | Independent RPC agreement and attributable finalized effects; business settlement checked separately                |

`test/base-network.test.ts` uses actual HTTP sockets, the bundled issuer, SQLite
and real OWS cryptography with ephemeral offline token/contract fixtures. It
checks registration approval, provisioning/replay, network-bound transfer signing,
restart, revoked replay and cross-network rejection. These tests neither access
real financial contracts nor establish mainnet execution acceptance.

## Transaction coverage to complete before certification

| Transaction family                            | Current toolkit path                          | Remaining acceptance                                                            |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| Token transfer                                | EOA ERC-3009 or bound Safe calls              | Verify token domain/code and exact finalized transfer                           |
| Native transfer and ordered contract batch    | Bound Safe 1.4.1 calls                        | Automatic or existing account binding, funding and gas acceptance               |
| Swap                                          | Generic calls; optional reviewed swap adapter | Actual router/version, bounded debit, minimum output and recipient effects      |
| Vault deposit                                 | Generic calls; optional vault adapter         | Actual asset/vault/router and minimum shares                                    |
| Withdrawal, redemption, approval and wrapping | Registered exact calls                        | Reviewed calldata and required product-specific outcome checks                  |
| Bridge                                        | Source and destination calls                  | Route-specific attestation, finality, fees and durable cross-chain continuation |
| Payout or off-chain cashout                   | Approved chain-side action                    | Separate payout authority, settlement and refund orchestration                  |

OWS provisioning creates an EOA. Use [automatic Safe provisioning](safe-provisioning.md)
with the normal bundled deployment process to create its Safe, or configure an
existing Safe with verified owner, singleton, threshold and module state. The
unfunded native preview does not deploy Safes. Safe deployment requires a funded
application sponsor and separate acceptance evidence. Generic transaction
success cannot certify swap, bridge, vault or payout business completion.
