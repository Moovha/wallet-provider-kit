import assert from 'node:assert/strict';
import { createServer } from '../dist/index.js';

const app = await createServer();
try {
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const live = await fetch(`${origin}/health/live`);
  assert.equal(live.status, 200);
  assert.equal((await fetch(`${origin}/health/ready`)).status, 503);
  const schema = await (await fetch(`${origin}/openapi.json`)).json();
  assert.equal(schema.openapi, '3.0.3');
  assert.ok(schema.paths['/v1/accounts/{accountId}/wallet']);
  assert.ok(
    schema.paths['/v1/accounts/{accountId}/provision'].post.responses['403']
      .content['application/problem+json'],
  );
  const docs = await fetch(`${origin}/docs/`);
  assert.equal(docs.status, 200);
  assert.ok(docs.headers.get('content-security-policy'));
  assert.match(await docs.text(), /swagger-ui/);
  const mutation = await fetch(
    `${origin}/v1/accounts/10000000-0000-4000-8000-000000000001/provision`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    },
  );
  assert.equal(mutation.status, 503);
  console.log(
    'Built service HTTP, Swagger, Problem Details and default denial verified',
  );
} finally {
  await app.close();
}
