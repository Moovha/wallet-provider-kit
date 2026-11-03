# Submit a bounded Base UniswapX order

The optional order service signs one exact UniswapX V3 self-swap for a deployed
personal Safe 1.4.1 wallet. It requires one current owner, threshold one, the pinned
Safe4337 fallback handler, an explicit `orders:authorize` grant and a fresh price
review. Applications receive an order receipt; they never receive the signature.
Shared, multi-owner, external-owner and counterfactual wallets are outside this
profile. The service is experimental; offline checks do not establish live order
service acceptance or solver participation.

UniswapX uses signed Permit2 orders that fillers settle on-chain. A quote or an
accepted order does not guarantee a fill. See the [UniswapX overview](https://developers.uniswap.org/docs/liquidity/uniswapx/overview).

## Configure and obtain permission

Start with a configured [Safe wallet service](user-operation-execution.md), an
application RPC connection and the existing encrypted credential-storage key.
The default configuration omits `uniswapXOrders` and cannot submit orders. A Base
configuration may add `uniswapXOrders.policy`, an `apiKey.env` reference and an
explicit `uniswapXOrders.enabled` setting; the
[configuration schema](../spec/provider-config.schema.json) defines the complete
shape. Keep the Trading API key in the referenced private environment variable.
Do not put a key in JSON, an example, a request body or a repository.

The policy pins the reactor runtime, cosigner, input/output token runtimes and any
proxy implementation, price profile, fee recipient, fee rate, validity and gross
input ceilings. Each route has both `maximumInputUnits` and
`maximumLifetimeInputUnits`. The lifetime reservation is per application, account
and input token. A timeout, cancellation or expiry does not restore it. Increasing
a ceiling is a separate operator decision. This profile adds no paid service or
database dependency beyond the configured RPC and Trading API.

Prepare the capability with `enabled: false`. Set it to `true` only after reviewing
the configured limits, fresh consent and acceptance evidence. Set it back to
`false` to pause order signing and dispatch while preserving read-only recovery;
ordinary wallet-call activation remains independent.

Explicitly allow `orders:authorize` for the application. Read `GET /v1/access-policy`
on Base and disclose `order_authorization`, including fee denomination, net
minimum and limits. Obtain fresh owner consent using `order_policy_revision` as
`user.consent.action_policy_revision` in an account-connect access request. Existing
call grants retain their original permission and policy revision; they do not
authorize orders. Keep this new grant separately from any call grant. OAuth
`wallet:actions` and `wallet:sign` scopes are necessary but do not grant spending
authority.

## Submit and follow an order

1. Obtain an unsigned `DUTCH_V3` exact-input quote for the same Safe and a configured
   route. Include the configured fee as an output-token integrator fee. The entire
   input is the gross spending budget; the user receives the decoded net output.
2. Send `{ "quote": <unsigned quote> }` to
   `POST /v1/accounts/{accountId}/uniswapx-orders`, with the new `Wallet-Grant-Id`
   and a UUID `Idempotency-Key`. The provider independently decodes the canonical
   witness and derives the Permit2 and SafeMessage digests. It accepts no generic
   digest, arbitrary signing payload or caller-selected recipient.
3. If the receipt is `requires_approval`, review its exact Permit2 approval call
   through the existing separately authorized Safe call flow. This response has
   not signed or posted an order. Retry the original order request and key after
   confirming allowance. A fresh quote requires a new key and remains subject to
   all caps; an admitted nonce cannot be reassigned.
4. Retain `order_id`, `order_hash`, the original body and key. Read
   `GET /v1/accounts/{accountId}/uniswapx-orders/{orderId}` with current
   `account:read` permission and `wallet:execute:read` scope. These order IDs are
   independent of wallet-call batch IDs. Do not fabricate a batch receipt for an
   asynchronous fill.

The provider checks current owner, application, identity, grant, consent, runtime
policy, exact action and durable attempt before signing. It verifies chain identity,
code and proxy pins, actual Safe owner/threshold/handler/guard, balance, unused
Permit2 nonce and the price benchmark. A missing allowance prevents signing;
allowance is checked again before posting. The local owner signature is recovered
independently and checked through the actual Safe ERC-1271 handler. Signature
copies retained by the order service and its signing journal use authenticated
encryption under the existing private credential key.

## Price review

`solver-fiat-fx-v1` supports only the fixed Base ZARP/USDC token pair. It obtains
USD/ZAR from the public ExchangeRate-API feed and requires the decoded **net user
minimum after fees and auction decay** to be at least 90% of the full input's
nominal fiat value. Integer base-unit arithmetic rounds the required minimum up.
ZARP/ZAR and USDC/USD are explicit nominal peg assumptions, not redemption or
depeg guarantees. This profile performs no AMM pool price reads.

The fixed source is `https://open.er-api.com/v6/latest/USD`. Responses are cached
for at most one hour; source observations must be less than 36 hours old. Future
or missing timestamps, invalid rates, unavailable data, responses above 64 KiB and
requests exceeding five seconds deny admission. There is no static or stale-rate
fallback. The provider retrieves the reference independently; applications cannot
supply a rate or increase the 10% loss budget. Changing the profile changes the
order policy revision and requires fresh owner consent; existing call grants and
retained-order recovery remain independent.

[Rates By Exchange Rate API](https://www.exchangerate-api.com).
The [open feed](https://www.exchangerate-api.com/docs/free) updates daily; this is
an indicative fiat-value floor, not a real-time market execution guarantee.

The earlier profile remains supported for existing configurations and recovery:

`solver-twap-benchmark-v1` uses a pinned pool's spot and 30-minute time-weighted
average price from one canonical block no older than 30 seconds. It requires
active liquidity and successful observation history. Spot and average must agree
within 1%; the decoded **net user minimum after the output fee** must be at least
98% of the higher gross benchmark. Integer interval arithmetic and outward tick
rounding preserve a conservative bound in either token direction. Every integer
auction block must preserve the configured fee ratio within one base unit.

This is a bounded canary benchmark. A single thin pool can remain manipulated over
the observation window and is not an independent fiat-price or peg oracle. The
profile does not measure a solver's private liquidity impact, approve general
production routing, or replace an AMM integration's separate impact guard. Missing
history, divergent observations, stale blocks or an insufficient minimum deny the
order; there is no spot-only fallback.

## Recover uncertain effects

The signing attempt is durable before backend dispatch. A backend timeout retains
unknown signing exposure; a restart cannot issue a replacement signature. Before
the single Trading API POST, the provider records dispatch durably. An interrupted,
rejected or ambiguous POST is never automatically repeated. Retrying the same key
returns the retained order and performs read-only reconciliation.

The worker scans the bounded signed validity interval even after a long outage.
Success requires a canonical Base `safe` receipt with the pinned reactor's exact
Fill hash, swapper and nonce, exact gross input debit, user output and proportional
fee transfers. Ambiguous batch effects, unexplained consumed nonces or malformed
receipts become `needs_review`. API status and absent lookup results do not prove
success or failure. `chain_finalized` is separate from Base safe settlement; the
worker rechecks observations until finalized and holds contradictory effects.

Revoking permission prevents new signatures and dispatch but cannot retract a
signature already disclosed to fillers. To cancel it, use the receipt's bounded
`cancellation_calls` through the separately authorized Safe call service. That call
invalidates the exact Permit2 nonce; cancellation is confirmed only from its
canonical event and receipt. A successful fill wins a cancellation race. No
automatic refund, replacement order or budget release follows an uncertain
result. [Permit2's signature-transfer interface](https://github.com/Uniswap/permit2/blob/main/src/interfaces/ISignatureTransfer.sol)
defines the nonce bitmap and invalidation operation.

The [read-only storage catalog evidence](uniswapx-storage-schema-20261103.json)
establishes the existing JSON journal and attempt-result shape. No SQL migration,
helper RPC or probe row is required. Back up the database, vault and credential key
together; losing encrypted artifacts is not evidence that an order failed.
Once order records exist, do not roll back to a binary that cannot read their
collection or restore an older database over outstanding authority. Keep the
compatible recovery service running with order signing disabled until every
retained effect is accounted for. A code rollback cannot cancel a disclosed order.
