import { metrics, trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';

export function startTelemetry(
  endpoint?: string,
  allowInsecureDevelopment = false,
) {
  if (!endpoint) return { shutdown: async () => undefined };
  const url = new URL(endpoint);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(allowInsecureDevelopment && url.protocol === 'http:'))
  ) {
    throw new Error('Invalid OTLP endpoint configuration');
  }
  const base = endpoint.replace(/\/$/, '');
  const sdk = new NodeSDK({
    autoDetectResources: false,
    resource: resourceFromAttributes({
      'service.name': 'wallet-provider-kit',
      'service.version': '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${base}/v1/traces`,
      timeoutMillis: 2000,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${base}/v1/metrics`,
          timeoutMillis: 2000,
        }),
        exportIntervalMillis: 15000,
        exportTimeoutMillis: 3000,
      }),
    ],
    instrumentations: [],
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}

/** Allowlist only: no automatic HTTP instrumentation or user-controlled attributes. */
export function observeRequest(
  method: string,
  route: string,
  status: number,
  elapsedSeconds: number,
) {
  const attributes = {
    'http.request.method': method,
    'http.route': route,
    'http.response.status_code': status,
  };
  const meter = metrics.getMeter('wallet-provider-kit');
  meter.createCounter('http.server.requests').add(1, attributes);
  meter
    .createHistogram('http.server.request.duration', { unit: 's' })
    .record(elapsedSeconds, attributes);
  const end = Date.now();
  const span = trace
    .getTracer('wallet-provider-kit')
    .startSpan(`${method} ${route}`, {
      attributes,
      kind: SpanKind.SERVER,
      startTime: end - elapsedSeconds * 1000,
    });
  if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
  span.end(end);
}
