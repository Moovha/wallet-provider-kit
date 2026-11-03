import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServer } from '../src/service/server.js';
import { serviceFixture } from './helpers/uniswapx.js';
const fixtures: Awaited<ReturnType<typeof serviceFixture>>[] = [];
const apps: Awaited<ReturnType<typeof createServer>>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const f of fixtures.splice(0)) await f.close();
});
async function fixture(permission = true) {
  const f = await serviceFixture(permission);
  fixtures.push(f);
  const app = await createServer({
    uniswapXOrders: f.service,
    authenticate: async () => f.context.principal,
  });
  apps.push(app);
  return { ...f, app };
}
it('returns private durable receipts with cancellation instructions and no signature', async () => {
  const f = await fixture();
  const r = await f.app.inject({
    method: 'POST',
    url: `/v1/accounts/${f.accountId}/uniswapx-orders`,
    headers: { 'idempotency-key': f.context.idempotencyKey },
    payload: { quote: f.quote() },
  });
  expect(r.statusCode).toBe(202);
  expect(r.headers['cache-control']).toBe('no-store');
  expect(r.json()).toMatchObject({ status: 'open', chain_finalized: false });
  expect(r.json().cancellation_calls).toHaveLength(1);
  expect(r.json()).not.toHaveProperty('signature');
  const read = await f.app.inject({
    method: 'GET',
    url: `/v1/accounts/${f.accountId}/uniswapx-orders/${r.json().order_id}`,
  });
  expect(read.statusCode).toBe(200);
  const cross = await f.app.inject({
    method: 'GET',
    url: `/v1/accounts/${randomUUID()}/uniswapx-orders/${r.json().order_id}`,
  });
  expect(cross.statusCode).toBe(403);
});
it('denies an old call grant before signing, posting and RPC', async () => {
  const f = await fixture(false);
  const r = await f.app.inject({
    method: 'POST',
    url: `/v1/accounts/${f.accountId}/uniswapx-orders`,
    headers: { 'idempotency-key': randomUUID() },
    payload: { quote: f.quote() },
  });
  expect(r.statusCode).toBe(403);
  expect(f.state.rpc).toBe(0);
  expect(f.state.signs).toBe(0);
  expect(f.state.posts).toBe(0);
});
it('rejects raw signing payloads and requires an idempotency key', async () => {
  const f = await fixture();
  const r = await f.app.inject({
    method: 'POST',
    url: `/v1/accounts/${f.accountId}/uniswapx-orders`,
    headers: { 'idempotency-key': randomUUID() },
    payload: { quote: f.quote(), digest: '0x' + '11'.repeat(32) },
  });
  expect(r.statusCode).toBe(400);
  expect(f.state.signs).toBe(0);
  const missing = await f.app.inject({
    method: 'POST',
    url: `/v1/accounts/${f.accountId}/uniswapx-orders`,
    payload: { quote: f.quote() },
  });
  expect(missing.statusCode).toBe(400);
  expect(f.state.rpc).toBe(0);
});
it('exposes disabled endpoints without making them executable', async () => {
  const app = await createServer();
  apps.push(app);
  const r = await app.inject({
    method: 'POST',
    url: `/v1/accounts/${randomUUID()}/uniswapx-orders`,
    headers: { 'idempotency-key': randomUUID() },
    payload: {
      quote: {
        encodedOrder: '0x1234',
        orderId: '0x' + '11'.repeat(32),
        orderInfo: { chainId: 8453 },
      },
    },
  });
  expect(r.statusCode).toBe(503);
});
