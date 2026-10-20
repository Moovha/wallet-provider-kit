---
prev: { 'text': 'Before welcoming users', 'link': '/docs/conformance' }
next:
  { 'text': 'Backups and maintenance', 'link': '/docs/provider-maintenance' }
---

# Keep an eye on your service

Start with the administration overview. It shows whether management is available,
which applications are connected and whether wallet operations are enabled. A new
installation can be healthy with no applications and wallet operations disabled.
See [health checks](provider-installation.md#interpret-health-correctly) for what
each probe means.

## Decide who responds when something needs attention

Assign responsibility for unavailable services, expiring access, low network-fee
balances and requests with uncertain outcomes. Keep private recovery records and
original request IDs so the team can investigate without repeating effects.
[Backups and maintenance](provider-maintenance.md) cover recovery planning.

Your developer should monitor RPC availability, finality lag, unknown dispatches,
budget usage and integrity failures using the [verified wallet status](wallet-calls.md).
A request accepted by the service is not yet a verified transaction. Background
observation cannot clear an uncertain attempt without the required evidence.

## Use your existing monitoring

The service can send request traces and metrics to an OpenTelemetry collector.
This helps find slow or failing requests; it does not replace transaction journals
or establish permission to sign. Monitoring can drop data, so financial correctness
must never depend on it.

<details>
<summary>Configure OpenTelemetry export</summary>

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to a trusted HTTPS collector base URL. The SDK
adds `/v1/traces` and `/v1/metrics`; export is disabled when unset. Use a local
collector for authentication, tenant routing, TLS and buffering. Keep credentials
out of endpoint URLs and do not disable TLS verification.

Exported fields are limited to service name/version, registered route template,
normalised method, status and duration. Unmatched routes are `unmatched`. The kit
does not automatically export request headers, queries, bodies, customer IDs,
account addresses, signatures or process environment. Tokens and provider
exceptions are not logged. Apply the same restrictions to proxies and collectors.
Traces are independent server spans, not an end-to-end propagation guarantee.

Export timeouts are bounded. SIGTERM drains HTTP and flushes telemetry within a
bounded shutdown. Plan collector access, retention, capacity and egress costs for
your workload. Keep business audit and attempt records separately with access,
tamper-evidence and recovery controls.

</details>

## Explore metrics locally

Developers can use the optional Grafana stack without a cloud subscription.
It runs separately from the installation flow and needs Docker Engine and Compose.

<details>
<summary>Start and stop the development Grafana stack</summary>

From the repository, copy the environment example and set a unique
`GRAFANA_ADMIN_PASSWORD` privately before starting:

```sh
cp .env.example .env
docker compose --env-file .env -f ops/compose.yaml up --build -d
```

Open `http://127.0.0.1:3000` as `admin` with that password. Anonymous access and
sign-up are disabled. The development API explorer is at
`http://127.0.0.1:8080/docs/`. Call `/health/live` or `/v1/capabilities` to produce
signals; default signing is unavailable and needs no wallet credentials.

In Grafana Explore, choose Prometheus, find `http.server.requests` or
`http.server.request.duration` (often normalised with underscores), and filter
`service_name="wallet-provider-kit"`. Choose Tempo for traces of the same service.
Metrics export every 15 seconds.

All published ports bind loopback. Insecure HTTP is enabled only inside this
development network. The API runs nonroot with dropped capabilities, a read-only
filesystem and writable temporary storage. Monitoring has writable persistent
storage; inspect its disk use and stop it when unused:

```sh
docker compose --env-file .env -f ops/compose.yaml down
```

Adding `-v` deletes observability history. Review that separately before doing it.
Test startup, restart and storage on your Docker host; a CI image build alone does
not establish those behaviours. The
[Grafana development image](https://github.com/grafana/docker-otel-lgtm) bundles
the collector and stores; production availability and retention need separate planning.

</details>

## Protect the operating environment

Terminate TLS at a trusted edge, restrict access and set deployment-specific
quotas and timeouts. Disable the API explorer when appropriate. The in-process
rate limiter is an abuse guard, not a financial budget; forwarded client IPs are
not trusted automatically. The supported runtime has one active writer, so
independent writable replicas are not a scaling option.

Rehearse recovery with the old writer stopped or fenced out. Missing evidence in
a backup does not prove an operation never happened. Use [launch checks](conformance.md)
to review the distinction between offline checks and deployment acceptance.
