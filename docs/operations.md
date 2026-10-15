# Operational visibility and deployment

The kit exports OTLP/HTTP to an existing OpenTelemetry collector. It does not
require Grafana Cloud, an enterprise monitoring plan or a custom dashboard.
The optional local profile uses Grafana's official `otel-lgtm` development image,
which includes collector, metric and trace stores and Grafana. Use Grafana Explore
and existing dashboards; it is not a production availability/retention design.

## Local Grafana

With Docker Engine and Compose available:

```sh
cp .env.example .env
# Edit .env locally and set a unique GRAFANA_ADMIN_PASSWORD.
docker compose --env-file .env -f ops/compose.yaml up --build -d
```

Open Grafana at `http://127.0.0.1:3000`, user `admin`, using the password from your
local file. Anonymous access and sign-up are disabled. Swagger is at
`http://127.0.0.1:8080/docs/`. In Grafana Explore select the provisioned Prometheus
source, find `http.server.requests` / `http.server.request.duration` (typically
normalized with underscores), and filter `service_name="wallet-provider-kit"`.
For traces select Tempo and search service `wallet-provider-kit`. Call
`/v1/capabilities` or `/health/live` to produce signals. Metrics export every 15
seconds. Default signing is unavailable; no wallet credentials are needed.

All published ports bind loopback. The compose profile opts into insecure HTTP
**only inside this development network**. The API is nonroot, drops capabilities,
uses a read-only filesystem and a writable temporary mount. The all-in-one
monitoring container needs writable internal storage. Its persistent volume can
consume local disk: inspect usage and stop it when unused. Use
`docker compose --env-file .env -f ops/compose.yaml down` to stop; adding `-v`
deletes local observability history and is an explicit operator choice.

Docker was not available on the extraction host. OTLP transport has a real local
receiver test, and Compose syntax/image digests are checked; container startup,
Grafana rendering and restart/volume behavior still require a Docker smoke test.

## Existing monitoring or enterprise deployment

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to a trusted HTTPS collector base URL; the SDK
adds `/v1/traces` and `/v1/metrics`. Export is disabled when unset. Use a local
sidecar/collector for authentication, tenant routing, TLS and retry/buffering; do
not embed credentials in endpoint URLs. Do not use the development HTTP override
in production. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Instrumented data is an allowlist: service name/version, registered route template,
normalized method, status and duration. The kit does not auto-instrument request
headers, queries, bodies, customer IDs, account addresses, signatures or process
environment. Unmatched routes are labeled `unmatched`. Access-token contents and
provider exceptions are not logged. Keep reverse-proxy and collector policies
consistent; avoid adding request/body logging downstream. Traces are independent
server spans, not an assertion of end-to-end parent context propagation.

Telemetry may be dropped and must never control authorization or financial
correctness. Export timeout is bounded; operational telemetry is **not** a durable
audit journal. The host must retain access-controlled business audit/attempt
records separately, with tamper evidence, retention and recovery policy. Grafana
viewer roles must not grant signing authority.

Terminate TLS at a trusted edge, restrict inbound clients, configure the IdP and
current-grant policy, enforce deployment-specific timeouts/quotas and disable docs
with `API_DOCUMENTATION=false` when appropriate. Fastify does not trust arbitrary
forwarded client IP headers. The local in-process rate limiter is an abuse guard,
not a distributed financial budget. Configure shared edge quotas for replicas;
prove durable host admission independently.

Readiness is false unless the integration explicitly supplies a service,
authenticator and a successful dependency check. Liveness does not establish
financial readiness. The default container is a documentation/integration shell;
it cannot be promoted to a production signer merely by configuring environment
variables. SIGTERM drains HTTP and flushes telemetry with a bounded shutdown.

New infrastructure must remain in the existing expense tier. Reuse existing
collector/monitoring capacity first; local development uses local resources.
Estimate vendor requests, retention, egress and deployment CPU/storage separately.
No actual invoice, production volume or hosting budget was available, so no claim
of zero total cost or production cost fit is made.

[Official Grafana OTEL LGTM development image](https://github.com/grafana/docker-otel-lgtm)
provides the local stack; operators own production authentication and retention.
