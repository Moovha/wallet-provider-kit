import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { createServer } from '../src/service/server.js';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { serviceFixture } from './helpers/uniswapx.js';
it('signs and recovers an authorized adapter-checked order without pool reads', async () => {
  const f = await serviceFixture(true, true);
  try {
    const result = await f.service.submit(f.context, f.accountId, f.quote());
    expect(result.status).toBe('open');
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(1);
    expect(f.state.poolReads).toBe(0);
    await f.restart();
    expect(
      (await f.service.submit(f.context, f.accountId, f.quote())).order_id,
    ).toBe(result.order_id);
    expect(f.state.signs).toBe(1);
    expect(f.state.posts).toBe(1);
  } finally {
    await f.close();
  }
});
it('denies price adapter outages before signing or posting', async () => {
  const f = await serviceFixture(true, true);
  try {
    f.state.fxFails = true;
    await expect(
      f.service.submit(f.context, f.accountId, f.quote()),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(f.state.signs).toBe(0);
    expect(f.state.posts).toBe(0);
    expect(f.state.poolReads).toBe(0);
  } finally {
    await f.close();
  }
});

it('denies new orders without an installed application policy adapter', async () => {
  const f = await serviceFixture(true, true, false, {
    policy: { profile: 'fixture-price-policy-v1' },
    createAdapter: () => undefined,
  });
  try {
    await expect(
      f.service.submit(f.context, f.accountId, f.quote()),
    ).rejects.toThrow('wallet_authorization_denied');
    expect(f.state.signs).toBe(0);
    expect(f.state.posts).toBe(0);
  } finally {
    await f.close();
  }
});

it('preserves application policy fields and the original consent hash in HTTP discovery', async () => {
  const f = await serviceFixture(true, true);
  const app = await createServer({
    onboarding: { service: f.onboarding, reviewers: [] },
    ready: async () => true,
    service: new EmbeddedWalletService(
      f.onboarding.walletAuthority(),
      f.backend,
    ),
    authenticate: async () => f.context.principal,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/access-policy',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().order_authorization).toEqual(f.policy);
    const originalHash = createHash('sha256')
      .update(
        JSON.stringify(['uniswapx-v3-order-v1', 'financial-terms', f.policy]),
      )
      .digest('hex');
    expect(response.json().order_policy_revision).toBe(originalHash);
    expect(response.json().order_authorization).not.toHaveProperty(
      'pricePolicyAdapter',
    );
  } finally {
    await app.close();
    await f.close();
  }
});
