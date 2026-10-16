import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import Fastify from 'fastify';
import { setupWarnings } from './setup-readiness.js';
import {
  ConfigurationError,
  secretReferences,
  validateProviderConfiguration,
} from './config.js';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

/** This separate local tool validates deployment inputs; it never opens a provider or database. */
export async function createSetupServer(options: {
  token: string;
  assetDirectory?: string;
}) {
  const app = Fastify({ logger: false, bodyLimit: 65536 });
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const token = Buffer.from(options.token);
  const directory =
    options.assetDirectory ??
    fileURLToPath(new URL('../setup-ui/', import.meta.url));
  const files = new Map<string, { bytes: Buffer; type: string }>();
  async function assets(folder: string, prefix = '') {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await assets(path, `${prefix}/${entry.name}`);
      else if (entry.isFile() && contentTypes[extname(entry.name)])
        files.set(`${prefix}/${entry.name}`, {
          bytes: await readFile(path),
          type: contentTypes[extname(entry.name)],
        });
    }
  }
  await assets(directory);
  if (!files.has('/index.html')) throw new Error('Setup assets unavailable');
  const example = JSON.parse(
    await readFile(
      new URL(
        '../../docs/provider.config.records.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  app.addHook('onRequest', async (request, reply) => {
    reply.headers({
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'content-security-policy':
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const host = `127.0.0.1:${port}`;
    const origin = `http://${host}`;
    // Exact Host rejects DNS rebinding. Origin and a fragment-delivered bearer
    // protect the local API from unrelated web pages and cross-site form posts.
    if (
      request.headers.host !== host ||
      (request.headers.origin && request.headers.origin !== origin) ||
      request.headers['sec-fetch-site'] === 'cross-site' ||
      Date.now() >= expiresAt
    )
      return reply.code(403).send({ error: 'setup_access_denied' });
    if (request.url.startsWith('/api/')) {
      const supplied = Buffer.from(
        request.headers.authorization?.replace(/^Bearer /, '') ?? '',
      );
      if (
        supplied.length !== token.length ||
        !timingSafeEqual(supplied, token) ||
        (request.method === 'POST' && request.headers.origin !== origin)
      )
        return reply.code(403).send({ error: 'setup_access_denied' });
    }
  });
  app.setErrorHandler((_error, _request, reply) => {
    void reply.code(400).send({
      issues: [
        'The setup request could not be read. Use valid configuration JSON no larger than 64 KiB (65,536 bytes), then try again.',
      ],
    });
  });
  const contract = JSON.parse(
    await readFile(
      new URL('../../spec/provider-api.json', import.meta.url),
      'utf8',
    ),
  );
  app.get('/api/openapi', async () => contract);
  app.get('/api/template', async () => ({ config: example }));
  app.post('/api/validate', async (request, reply) => {
    try {
      const config = validateProviderConfiguration(request.body);
      if (config.backend.kind === 'custom')
        throw new ConfigurationError([
          '/backend: custom adapters use the advanced setup guide',
        ]);
      const environment = [
        ...new Set(secretReferences(config).map((r) => r.env)),
      ];
      return {
        config,
        environment,
        warnings: setupWarnings(config),
        acceptance: 'not_verified',
      };
    } catch (error) {
      return reply.code(422).send({
        issues:
          error instanceof ConfigurationError
            ? error.issues
            : [
                'The configuration could not be checked. Reload the wizard and import your saved configuration. If the problem continues, restart the setup command.',
              ],
      });
    }
  });
  app.get('/*', async (request, reply) => {
    const path = request.url === '/' ? '/index.html' : request.url;
    const file = files.get(path);
    if (!file) return reply.code(404).send({ error: 'not_found' });
    return reply.type(file.type).send(file.bytes);
  });
  return app;
}

export async function startSetupWizard(port: number, openBrowser: boolean) {
  const token = randomBytes(32).toString('base64url');
  const app = await createSetupServer({ token });
  const close = () => void app.close();
  const expiry = setTimeout(close, 60 * 60 * 1000).unref();
  app.addHook('onClose', async () => {
    clearTimeout(expiry);
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.removeListener(signal, close);
  });
  const address = await app.listen({ host: '127.0.0.1', port });
  const url = `${address}/#${token}`;
  process.stdout.write(
    `Open the operator setup wizard: ${url}\nLocal session expires in one hour. Press Ctrl+C when finished.\n`,
  );
  if (openBrowser) {
    const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(command, [url], { stdio: 'ignore' });
    child.on('error', () => {
      process.stdout.write('Open the printed local URL in your browser.\n');
    });
    child.unref();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, close);
}
