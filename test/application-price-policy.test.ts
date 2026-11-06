import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  assessApplicationPrice,
  loadOrderPricePolicyAdapter,
  type OrderPricePolicyAdapter,
} from '../src/orders/application-price-policy.js';
import { orderFixture, serviceFixture } from './helpers/uniswapx.js';
import { reviewUniswapXV3Order } from '../src/orders/uniswapx-v3.js';
const paths: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const path of paths.splice(0))
    await rm(path, { recursive: true, force: true });
});
function fixture() {
  const f = orderFixture();
  const review = reviewUniswapXV3Order(f.encode(), f.safe, f.policy);
  const now = Math.floor(Date.now() / 1000);
  const assessment = {
    minimumRequiredOutUnits: review.minimumAmountOutUnits,
    validUntil: now + 10,
    proof: { source: 'offline-fixture' },
  };
  const adapter: OrderPricePolicyAdapter = {
    version: 1,
    validate: () => true,
    assess: async () => assessment,
  };
  return { ...f, review, now, assessment, adapter };
}
it('enforces the returned floor and fresh evidence, never trusting a mere approval flag', async () => {
  const f = fixture();
  expect(
    await assessApplicationPrice(f.adapter, f.policy.pricePolicy, f.review),
  ).toEqual(f.assessment.proof);
  for (const value of [
    {
      ...f.assessment,
      minimumRequiredOutUnits: (
        BigInt(f.review.minimumAmountOutUnits) + 1n
      ).toString(),
    },
    { ...f.assessment, minimumRequiredOutUnits: '0' },
    { ...f.assessment, validUntil: f.now },
    { approved: true },
    { ...f.assessment, proof: { data: 'x'.repeat(8193) } },
  ]) {
    await expect(
      assessApplicationPrice(
        { ...f.adapter, assess: async () => value as never },
        f.policy.pricePolicy,
        f.review,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
  }
  await expect(
    assessApplicationPrice(undefined, f.policy.pricePolicy, f.review),
  ).rejects.toThrow('wallet_authorization_denied');
});
it('detaches policy/review inputs and bounds an unresponsive adapter', async () => {
  const f = fixture();
  const original = structuredClone(f.review);
  f.adapter.assess = async ({ review, policy }) => {
    review.minimumAmountOutUnits = '0';
    policy.profile = 'changed';
    return f.assessment;
  };
  await assessApplicationPrice(f.adapter, f.policy.pricePolicy, f.review);
  expect(f.review).toEqual(original);
  expect(f.policy.pricePolicy.profile).toBe('solver-twap-benchmark-v1');
  vi.useFakeTimers();
  f.adapter.assess = () => new Promise(() => undefined);
  const result = expect(
    assessApplicationPrice(f.adapter, f.policy.pricePolicy, f.review),
  ).rejects.toThrow('wallet_authorization_denied');
  await vi.advanceTimersByTimeAsync(5001);
  await result;
});
it('checks the exact module hash before executing code and rejects incompatible modules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-policy-module-'));
  paths.push(directory);
  const source =
    'export function createOrderPricePolicyAdapter() { return {version:1,validate:()=>true,assess:async()=>({})}; }';
  const path = join(directory, 'policy.mjs');
  await writeFile(path, source);
  const sha256 = createHash('sha256').update(source).digest('hex');
  expect(
    (
      await loadOrderPricePolicyAdapter(
        { path: 'policy.mjs', sha256 },
        directory,
      )
    )?.version,
  ).toBe(1);
  await writeFile(path, 'throw new Error("must not execute changed bytes");');
  await expect(
    loadOrderPricePolicyAdapter({ path, sha256 }, directory),
  ).rejects.toThrow('wallet_provider_configuration');
  await expect(
    loadOrderPricePolicyAdapter({ path: 'missing.mjs', sha256 }, directory),
  ).rejects.toThrow('wallet_provider_configuration');
  const invalid =
    'export function createOrderPricePolicyAdapter(){return {version:2}}';
  await writeFile(path, invalid);
  await expect(
    loadOrderPricePolicyAdapter(
      { path, sha256: createHash('sha256').update(invalid).digest('hex') },
      directory,
    ),
  ).rejects.toThrow('wallet_provider_configuration');
});
it('keeps retained orders recoverable without asking the adapter to price them again', async () => {
  const f = await serviceFixture(true, true);
  try {
    const original = await f.service.submit(f.context, f.accountId, f.quote());
    f.state.fxFails = true;
    await f.restart(true);
    const retained = await f.service.submit(f.context, f.accountId, f.quote());
    expect(retained.order_id).toBe(original.order_id);
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(1);
  } finally {
    await f.close();
  }
});
