import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';

/** Public shell; every data request still requires provider API authorization. */
export async function registerOperatorUi(app: FastifyInstance) {
  const root = new URL('../setup-ui/', import.meta.url);
  app.get('/operator/', { schema: { hide: true } }, async (_request, reply) => {
    const html = await readFile(new URL('operator.html', root), 'utf8');
    return reply
      .header('cache-control', 'no-store')
      .type('text/html')
      .send(html.replaceAll('/assets/', '/operator/assets/'));
  });
  app.get(
    '/operator/notices',
    { schema: { hide: true } },
    async (_request, reply) =>
      reply
        .type('text/plain')
        .send(await readFile(new URL('THIRD_PARTY_NOTICES.txt', root), 'utf8')),
  );
  app.get<{ Params: { file: string } }>(
    '/operator/assets/:file',
    {
      schema: { hide: true },
    },
    async (request, reply) => {
      const file = request.params.file;
      if (!/^[A-Za-z0-9._-]+\.(js|css)$/.test(file))
        return reply.code(404).send();
      try {
        const data = await readFile(new URL('assets/' + file, root));
        return reply
          .header('cache-control', 'no-store')
          .type(file.endsWith('.js') ? 'text/javascript' : 'text/css')
          .send(data);
      } catch {
        return reply.code(404).send();
      }
    },
  );
}
