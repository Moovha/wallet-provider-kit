# Payer events and health

Operators can monitor native gas balances and transaction recovery incidents in
both the wallet service and designated execution service. Optional signed
webhooks deliver operational transitions to trusted receivers. These events
report payer conditions; financial results continue to require the existing
independent transaction verification and current authorization checks.

## Configure monitoring

Add the following top-level `operations` configuration to each service. The
wallet service also requires `execution`. Configure
[recovery detection](stuck-transactions-and-recovery.md) to generate incident and
quarantine transitions; balance monitoring works without an active transaction.

```json
{
  "operations": {
    "pollIntervalSeconds": 15,
    "lowBalanceWei": "1000000000000000",
    "webhooks": [
      {
        "id": "payer-alerts",
        "endpoint": { "env": "PAYER_WEBHOOK_URL" },
        "signingSecrets": [{ "env": "PAYER_WEBHOOK_SECRET" }]
      }
    ]
  }
}
```

Choose the threshold from measured gas use, transaction volume and replenishment
latency. It is a native balance in wei, not an estimate of future transaction
capacity. A balance strictly below the threshold is `low`; equality is
`sufficient`. Low-balance alerts do not fund or automatically quarantine a payer.
Recovery quarantine has its own explicit policy. Configure a threshold high enough
to alert before admission or simulation fails for insufficient funds.

The endpoint environment value must be a trusted HTTPS URL without userinfo,
query parameters or a fragment. Destinations are operator configuration, never
application input. Control network egress and DNS for those destinations;
redirects are rejected. Supply a unique random 24–64 byte base64 key prefixed
`whsec_` for each destination. Keep keys in ignored environment files or a secret
store. Up to eight destinations and two overlapping signing keys per destination
are supported. During rotation, distribute the new verification key to the
receiver, configure both keys, then remove the old key after the acceptance
window. Exported configuration contains environment names only.

Monitoring starts only after activation. It checks up to four distinct addresses
per interval, rotating across the configured sponsors. Every balance requires
chain identity and common block-hash/balance agreement across the configured RPC
sources. When the same address appears in multiple provider revisions, all its
configured observations must agree. RPC failure or disagreement produces
`unknown`, rather than a zero balance or a recovered payer. Backlog and RPC latency
increase detection time. Repeated identical balance classes and incident reasons
are suppressed; low/sufficient, available/unavailable, incident and recovery
transitions generate events. A first sufficient observation is quiet; a first
low or unavailable observation alerts.

## Receive and verify events

Each HTTP POST uses [CloudEvents 1.0 JSON structured mode](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md)
with `Content-Type: application/cloudevents+json`. The event type is
`com.moovha.wallet-provider.payer.observed.v1`. Its source identifies the service
through a fingerprint, and its subject is a stable fingerprint of the payer
address. Map configured addresses using the exported `payerKey` helper when
operator correlation is needed. The data contains:

| Field           | Meaning                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| `balance`       | `low`, `sufficient` or `unknown`.                                                |
| `affected`      | An unresolved recovery incident or integrity failure affects this payer.         |
| `reason`        | `none`, `payer-quarantined`, `integrity-failure` or a recovery diagnosis reason. |
| `balance_wei`   | Last sampled native balance when the current balance observation is available.   |
| `threshold_wei` | Configured alert threshold.                                                      |

The event has a unique `id`, an RFC 3339 `time`, `specversion: "1.0"` and JSON data.
It contains no raw payer address, action body, signature, authorization header,
provider URL or upstream error text. A recovery event may retain the balance from
the last sample; balance freshness is evaluated separately in health. These
operational fingerprints and balances remain confidential operational data;
restrict receiver access and retention.

Delivery uses [Standard Webhooks 1.0 signing](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md):

1. Read `webhook-id`, `webhook-timestamp` and `webhook-signature`.
2. Verify HMAC-SHA256 over the exact bytes of
   `{webhook-id}.{webhook-timestamp}.{raw HTTP body}` using the decoded configured
   key. Compare the base64 result with an accepted `v1,` signature in constant time.
3. Enforce a short timestamp tolerance, such as five minutes, and synchronize
   clocks. Verify against pinned keys; never obtain a trusted key from the request.
4. Deduplicate the stable `webhook-id` transactionally with receiver processing.
   Acknowledge with 2xx only after durable acceptance.

The ID and event body remain unchanged across retries; each delivery attempt has
a fresh signed timestamp. Overlapping rotation signatures are separated by a
space. Deliveries are at least once, can arrive out of order and can repeat after
a response loss or crash. Use the event time for operational history and refresh
authoritative transaction status separately. Receipt of an operational event
never authorizes spending, nonce reuse or settlement.

## Inspect health and delivery

`GET /health/ready` retains its existing readiness status and adds an `operations`
object when configured. `GET /health/live` remains process liveness. Readiness
continues to describe durable service configuration/authority dependencies;
a low balance or webhook outage does not restart the service or mark every
healthy pool member unavailable. Alert on `operations.status` separately.

The operational status is `healthy` or `degraded`. It exposes total payer count,
affected, low-balance, unavailable and stale payer counts; pending, failed and
unroutable webhook counts; oldest delivery age; and an optional last successful
delivery timestamp. It exposes no payer addresses, destination IDs, URLs, keys or
transaction identifiers. A health storage failure returns operational
`status: "unavailable"`. Restrict health ingress to the monitoring network.

A condition is stale after three full configured sampling cycles, accounting for
the four-address batch size. Initial unsampled payers count as unavailable and
stale. Health reports failed deliveries until a 2xx acknowledgment is stored.
An empty `webhooks` array enables health monitoring without outbound delivery.

## Durable delivery and recovery

Conditions and delivery intents use JSON records in the existing verified SQLite
catalog. Recovery diagnostic transitions and their delivery intents commit
atomically; balance samples commit their condition and delivery intents together.
No webhook secrets or destination URLs are stored in the outbox. Pending entries
pin the original destination fingerprint. Changing the URL or destination ID
leaves old deliveries unroutable and visible in health; it never silently sends
historical data to a different receiver. Restore the original destination to
resume those deliveries, or carry out a reviewed storage migration.

Workers claim up to four due deliveries with a 30-second durable lease. Each HTTP
attempt has a ten-second timeout. Failures, including 4xx and 5xx responses, retry
indefinitely with exponential delay capped at one hour plus bounded jitter.
Response bodies are discarded and never copied into events or health. Crashes
resume pending deliveries after lease expiry. Acknowledged deliveries are removed;
health retains the last success timestamp. The outbox is a delivery queue, not an
unbounded audit feed of acknowledged events. Receivers own their accepted history.

Retain enough disk space for an outage backlog and alert on delivery age and
storage capacity. Both service stores require their existing backup, fencing and
failover procedures. A restored stale backup can redeliver previously acknowledged
events, so receiver deduplication must outlive the backup recovery window. Fence
the old process and its egress before starting a replacement. An endpoint/key
configuration change fences the previous wallet monitor; executor configuration
fencing remains independent.

Offline fixtures cover signed payloads, rotation, SQLite concurrency, lost
acknowledgments, retry after restart, RPC disagreement, stale evidence and
independent service health. Before activation, test the actual receiver's signature
verification, deduplication, network policy, outage handling, disk monitoring and
backup restore. No live webhook or funded-provider behavior is certified by these
fixtures.
