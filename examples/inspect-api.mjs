import { createServer } from '@moovha/wallet-provider-kit/http';

// Explore the HTTP contract without credentials, a provider or financial effects.
const app = await createServer();
try {
  const live = await app.inject('/health/live');
  const ready = await app.inject('/health/ready');
  const contract = await app.inject('/openapi.json');
  console.log({
    live: live.statusCode,
    ready: ready.statusCode,
    openapi: contract.json().openapi,
  });
} finally {
  await app.close();
}
