import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { serviceFixture } from './helpers/uniswapx.js';
const fixtures: Awaited<ReturnType<typeof serviceFixture>>[] = [];
async function fixture(permission = true) {
  const f = await serviceFixture(permission);
  fixtures.push(f);
  return f;
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.close();
});
describe('durable exact-order provider signing', () => {
  it('signs a SafeMessage once, encrypts both retained copies, and never posts twice across restart', async () => {
    const f = await fixture();
    const result = await f.service.submit(f.context, f.accountId, f.quote());
    expect(result.status).toBe('open');
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(1);
    const signature = JSON.parse(
      String(
        f.send.mock.calls.find(([url]) =>
          String(url).includes('/v1/order'),
        )![1]!.body,
      ),
    ).signature;
    expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
    for (const name of await readdir(f.directory)) {
      const bytes = await readFile(f.directory + '/' + name);
      expect(bytes.includes(Buffer.from(signature)), name).toBe(false);
    }
    expect(JSON.stringify(result)).not.toContain(signature);
    await f.restart();
    const replay = await f.service.submit(f.context, f.accountId, f.quote());
    expect(replay.order_id).toBe(result.order_id);
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(1);
  });
  it('retains a lost POST outcome without replacement posting or signing', async () => {
    const f = await fixture();
    f.state.postFails = true;
    const first = await f.service.submit(f.context, f.accountId, f.quote());
    expect(first.status).toBe('unknown');
    expect(first.code).toBe('post_unknown');
    await f.restart();
    await f.service.runOnce();
    await f.service.submit(f.context, f.accountId, f.quote());
    expect(f.state.posts).toBe(1);
    expect(f.state.signs).toBe(1);
  });
  it('requires the distinct order permission before RPC, approval or signing', async () => {
    const f = await fixture(false);
    await expect(
      f.service.submit(f.context, f.accountId, f.quote()),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(f.state.rpc).toBe(0);
    expect(f.state.signs).toBe(0);
    expect(f.state.posts).toBe(0);
    expect(
      await f.db.onboardingStore.transaction((s) =>
        Object.keys(s.uniswapXOrders ?? {}),
      ),
    ).toHaveLength(0);
  });
  it('refuses to infer an order-policy revision for fresh consent', async () => {
    const f = await fixture();
    const input = await f.db.onboardingStore.transaction((s) =>
      structuredClone(Object.values(s.requests)[0].input),
    );
    input.mode = 'connect';
    input.account_id = f.accountId;
    delete input.user!.consent.action_policy_revision;
    await expect(
      f.onboarding.request(
        { ...f.context, idempotencyKey: randomUUID() },
        input,
      ),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(
      await f.db.onboardingStore.transaction((s) => Object.keys(s.grants)),
    ).toHaveLength(1);
    expect(f.state.rpc).toBe(0);
    expect(f.state.signs).toBe(0);
  });
  it('denies expired current identity before RPC and all financial effects', async () => {
    const f = await fixture();
    await f.db.onboardingStore.transaction((s) => {
      s.accounts[f.accountId].acceptedUntil = Date.now() - 1;
    });
    await expect(
      f.service.submit(f.context, f.accountId, f.quote()),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(f.state.rpc).toBe(0);
    expect(f.state.signs).toBe(0);
    expect(f.state.posts).toBe(0);
  });
  it('returns only a bounded approval call while allowance is missing', async () => {
    const f = await fixture();
    f.state.allowance = 0n;
    const result = await f.service.submit(f.context, f.accountId, f.quote());
    expect(result.status).toBe('requires_approval');
    expect(result.approval_calls).toHaveLength(1);
    expect(f.state.signs).toBe(0);
    expect(f.state.posts).toBe(0);
    f.state.allowance = 1000000n;
    expect(
      (await f.service.submit(f.context, f.accountId, f.quote())).status,
    ).toBe('open');
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(1);
  });
  it('rejects a reused idempotency key with a different quote', async () => {
    const f = await fixture();
    await f.service.submit(f.context, f.accountId, f.quote());
    await expect(
      f.service.submit(f.context, f.accountId, {
        ...f.quote(),
        quoteId: 'changed',
      }),
    ).rejects.toThrow('wallet_attempt_conflict');
    expect(f.state.posts).toBe(1);
  });
  it('holds unknown backend signing across restart without a second backend dispatch', async () => {
    const f = await fixture();
    const original = vi
      .mocked(f.backend.signTypedData)
      .getMockImplementation()!;
    vi.mocked(f.backend.signTypedData).mockImplementation(async (...args) => {
      await original(...args);
      throw new Error('offline response lost');
    });
    await expect(
      f.service.submit(f.context, f.accountId, f.quote()),
    ).rejects.toThrow();
    await f.restart();
    await expect(
      f.service.submit(f.context, f.accountId, f.quote()),
    ).rejects.toThrow();
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(0);
  });
  it('retains the lifetime gross-input reservation for a second order', async () => {
    const f = await fixture();
    await f.service.submit(f.context, f.accountId, f.quote());
    f.order.info.nonce += 1;
    await expect(
      f.service.submit(
        { ...f.context, idempotencyKey: randomUUID() },
        f.accountId,
        f.quote(),
      ),
    ).rejects.toThrow('wallet_attempt_unavailable');
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(1);
  });
  it('fences budget writers against the current separate order-policy head', async () => {
    const f = await fixture();
    const revision = await f.db.onboardingStore.transaction(
      (s) => s.deploymentBindings!['service-v1'].uniswapXOrderPolicyRevision!,
    );
    await f.db.setBudget(
      'offline-order-limit',
      '5',
      revision,
      'uniswapXOrderPolicyRevision',
    );
    await f.db.onboardingStore.transaction((s) => {
      s.deploymentBindings!['service-v1'].uniswapXOrderPolicyRevision =
        'replacement';
    });
    await expect(
      f.db.setBudget(
        'offline-order-limit',
        '10',
        revision,
        'uniswapXOrderPolicyRevision',
      ),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(await f.db.budget('offline-order-limit')).toEqual({
      maximum: '5',
      reserved: '0',
    });
  });
  it('holds a previously observed fill when its canonical block changes', async () => {
    const f = await fixture();
    const admitted = await f.service.submit(f.context, f.accountId, f.quote());
    await f.db.onboardingStore.transaction((s) => {
      const record = s.uniswapXOrders![admitted.order_id];
      record.state = 'succeeded';
      record.chainFinalized = false;
      record.fill = {
        transactionHash: '0x' + 'ee'.repeat(32),
        blockHash: '0x' + '34'.repeat(32),
        blockNumber: 100,
        finality: 'base-safe',
        safeBlockHash: '0x' + 'ab'.repeat(32),
        inputAmountUnits: '1000000',
        outputAmountUnits: '990000',
        feeAmountUnits: '10000',
      };
    });
    expect(
      await f.service.read(f.context.principal, f.accountId, admitted.order_id),
    ).toMatchObject({
      status: 'needs_review',
      chain_finalized: false,
      code: 'unexpected_effect',
    });
    expect(f.state.posts).toBe(1);
    expect(f.state.signs).toBe(1);
  });
});
