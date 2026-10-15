import { createAuthenticator } from './service/auth.js';
import { createServer } from './service/server.js';
import { startTelemetry } from './service/telemetry.js';

async function main() {
  if (
    process.env.GAE_SERVICE === 'exchange' ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
  ) {
    throw new Error('Unsafe environment');
  }
  const oauth = [
    process.env.OAUTH_ISSUER,
    process.env.OAUTH_AUDIENCE,
    process.env.OAUTH_JWKS_URL,
  ];
  if (oauth.some(Boolean) && !oauth.every(Boolean))
    throw new Error('Incomplete OAuth configuration');
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid port');
  const telemetry = startTelemetry(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    process.env.NODE_ENV !== 'production' &&
      process.env.OTEL_ALLOW_INSECURE_DEVELOPMENT === 'true',
  );
  const app = await createServer({
    authenticate: oauth.every(Boolean)
      ? createAuthenticator({
          issuer: oauth[0]!,
          audience: oauth[1]!,
          jwksUrl: oauth[2]!,
        })
      : undefined,
    documentation: process.env.API_DOCUMENTATION !== 'false',
  });
  // The CLI deliberately has no durable authority. Providers compose createServer
  // with their reviewed authority/service; credentials alone cannot enable signing.
  await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
  process.stdout.write(
    `Wallet provider service listening on port ${port}; signing unconfigured\n`,
  );
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(1), 10000).unref();
    await app.close();
    await telemetry.shutdown();
    clearTimeout(timeout);
  }
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void shutdown().catch(() => process.exit(1));
    });
}
main().catch(() => {
  process.stderr.write('Wallet provider startup failed; check configuration\n');
  process.exitCode = 1;
});
