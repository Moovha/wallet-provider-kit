import { SupportedActions } from '../src/deployment/actions.js';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fixture } from './helpers/safe-4337.js';
import { assetBudgetId } from '../src/storage/index.js';
import { fingerprint } from '../src/onboarding/policy.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
const origin = 'https://wallet.example.test';
function id(f: Awaited<ReturnType<typeof fixture>>) {
  return assetBudgetId(origin, f.input.account_id, f.input.calls[0].to);
}
async function record(
  f: Awaited<ReturnType<typeof fixture>>,
  actionId: string,
) {
  return f.actions.withAuthorizedTransfer(
    f.context.principal,
    actionId,
    (_s, r) => structuredClone(r),
  );
}
describe('cumulative direct token transfer allowances', () => {
  it('uses the unchanged ERC-3009 key and retains its usage and ceiling', async () => {
    const f = await fixture(undefined, undefined, {
      maximumAmount: '10',
      lifetimeAmount: '20',
    });
    const budget = id(f);
    expect(budget).toBe(
      fingerprint([
        'transfer',
        origin,
        f.input.account_id,
        f.input.calls[0].to.toLowerCase(),
      ]),
    );
    await f.db.setBudget(budget, '7');
    const oldRequest = createWalletAttemptRequest(
      'legacy',
      'offline',
      'sign_typed_data',
      f.input.account_id,
      randomUUID(),
      'old',
      {},
    );
    await f.db.admitAttempt({
      request: oldRequest,
      budgetId: budget,
      units: '4',
    });
    await f.db.journal.claim(oldRequest);
    const source = await f.source();
    await expect(
      f.service.admit(f.context, source.action_id, f.operation),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    expect(await f.db.budget(budget)).toEqual({ maximum: '7', reserved: '4' });
    const r = await record(f, source.action_id);
    expect(await f.db.budget(r.approval.budgetId)).toEqual({
      maximum: '3',
      reserved: '0',
    });
    expect(f.state.posts).toBe(0);
    expect(f.state.signs).toBe(0);
  });
  it('reserves once through sponsorship, SafeOp signing and restart, and blocks the relayer path', async () => {
    const f = await fixture(undefined, undefined, {
      maximumAmount: '10',
      lifetimeAmount: '8',
    });
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    expect(await f.db.budget(id(f))).toEqual({ maximum: '8', reserved: '4' });
    await f.service.sponsor(f.context, source.action_id);
    await f.service.sign(f.context, source.action_id);
    await f.restart();
    await f.service.sponsor(f.context, source.action_id);
    await f.service.sign(f.context, source.action_id);
    expect(await f.db.budget(id(f))).toEqual({ maximum: '8', reserved: '4' });
    const relay = f.relay();
    await expect(
      relay.authority.sign(f.context, source.action_id),
    ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
    expect(f.state.signs).toBe(1);
  });
  it('applies the configured ERC-3009 lifetime ceiling when generic calls initialize the allowance first', async () => {
    const f = await fixture(undefined, undefined, {
      maximumAmount: '10',
      lifetimeAmount: '20',
    });
    const actions = new SupportedActions(
      f.onboarding,
      f.db,
      {
        profile: 'provider-authorized-erc3009-v1',
        token: {
          address: f.input.calls[0].to,
          name: 'Offline token',
          version: '1',
          symbol: 'TEST',
          decimals: 6,
        },
        recipients: [f.wallet.address],
        maximumAmount: '10',
        lifetimeAmount: '5',
        maxValiditySeconds: 120,
      },
      'active-1',
      { policy: f.config.basePolicy, maxValiditySeconds: 120 },
    );
    const source = await actions.requestCalls(
      f.context,
      f.input,
      async () => '0',
    );
    const stored = await actions.withAuthorizedTransfer(
      f.context.principal,
      source.action_id,
      (_s, r) => structuredClone(r),
    );
    expect(stored.approval.additionalBudgets).toEqual([
      { budgetId: id(f), units: '4', maximum: '5' },
    ]);
    expect(await f.db.budget(id(f))).toEqual({ maximum: '5', reserved: '0' });
  });
  it('rolls back operation and asset reservations when the gas budget cannot cover admission', async () => {
    const f = await fixture(
      (config) => {
        config.sponsors[0].lifetimeBudgetWei = '1';
      },
      undefined,
      { maximumAmount: '10', lifetimeAmount: '8' },
    );
    const source = await f.source(),
      stored = await record(f, source.action_id);
    await expect(
      f.service.admit(f.context, source.action_id, f.operation),
    ).rejects.toThrow();
    expect(await f.db.budget(id(f))).toEqual({ maximum: '8', reserved: '0' });
    expect(await f.db.budget(stored.approval.budgetId)).toEqual({
      maximum: '3',
      reserved: '0',
    });
    expect(f.state.posts).toBe(0);
    expect(f.state.signs).toBe(0);
  });
  it('retains asset usage after an uncertain paymaster response', async () => {
    const f = await fixture(undefined, undefined, {
      maximumAmount: '10',
      lifetimeAmount: '8',
    });
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    f.state.lostPaymaster = true;
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toThrow();
    await f.restart();
    expect(await f.db.budget(id(f))).toEqual({ maximum: '8', reserved: '4' });
    await expect(
      f.service.sponsor(f.context, source.action_id),
    ).rejects.toThrow();
    expect(await f.db.budget(id(f))).toEqual({ maximum: '8', reserved: '4' });
  });
  it('backfills earlier sponsored direct transfers once, including revoked sources and overdrawn allowances', async () => {
    const f = await fixture(undefined, undefined, { maximumAmount: '10' });
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await f.db.revokeAction(source.action_id);
    await f.db.setBudget(id(f), '3');
    await f.db.ensureAssetBudget(
      origin,
      f.input.account_id,
      f.input.calls[0].to,
      '20',
      'active-1',
    );
    expect(await f.db.budget(id(f))).toEqual({ maximum: '3', reserved: '4' });
    await f.restart();
    await f.db.ensureAssetBudget(
      origin,
      f.input.account_id,
      f.input.calls[0].to,
      '100',
      'active-1',
    );
    expect(await f.db.budget(id(f))).toEqual({ maximum: '3', reserved: '4' });
  });
  it('counts a prior SafeTx signing admission once without requiring a receipt', async () => {
    const f = await fixture(undefined, undefined, { maximumAmount: '10' });
    const source = await f.source();
    const relay = f.relay();
    const service = new EmbeddedWalletService(
      relay.authority,
      createJournaledWalletProvider(f.backend, {
        namespace: 'relay-signing',
        journal: relay.journal,
        authorizeAttempt: relay.authorizeAttempt,
      }),
    );
    await service.sign(f.context, source.action_id);
    await f.db.ensureAssetBudget(
      origin,
      f.input.account_id,
      f.input.calls[0].to,
      '9',
      'active-1',
    );
    expect(await f.db.budget(id(f))).toEqual({ maximum: '9', reserved: '4' });
    await f.db.ensureAssetBudget(
      origin,
      f.input.account_id,
      f.input.calls[0].to,
      '20',
      'active-1',
    );
    expect(await f.db.budget(id(f))).toEqual({ maximum: '9', reserved: '4' });
  });
  it('inventories later unbudgeted authorizations after an earlier activation without resetting prior usage', async () => {
    const f = await fixture(undefined, undefined, { maximumAmount: '10' });
    const relay = f.relay();
    const service = new EmbeddedWalletService(
      relay.authority,
      createJournaledWalletProvider(f.backend, {
        namespace: 'relay-signing',
        journal: relay.journal,
        authorizeAttempt: relay.authorizeAttempt,
      }),
    );
    const first = await f.source();
    await service.sign(
      { ...f.context, idempotencyKey: randomUUID() },
      first.action_id,
    );
    await f.db.ensureAssetBudget(
      origin,
      f.input.account_id,
      f.input.calls[0].to,
      '9',
      'active-1',
    );
    const next = await f.actions.requestCalls(
      { ...f.context, idempotencyKey: randomUUID() },
      f.input,
      async () => '1',
    );
    await service.sign(
      { ...f.context, idempotencyKey: randomUUID() },
      next.action_id,
    );
    await f.db.ensureAssetBudget(
      origin,
      f.input.account_id,
      f.input.calls[0].to,
      '20',
      'active-1',
    );
    expect(await f.db.budget(id(f))).toEqual({ maximum: '9', reserved: '8' });
    await f.db.ensureAssetBudget(
      origin,
      f.input.account_id,
      f.input.calls[0].to,
      '20',
      'active-1',
    );
    expect(await f.db.budget(id(f))).toEqual({ maximum: '9', reserved: '8' });
  });
  it('does not charge unsigned historical calls and fences stale activation', async () => {
    const f = await fixture(undefined, undefined, { maximumAmount: '10' });
    await f.source();
    await expect(
      f.db.ensureAssetBudget(
        origin,
        f.input.account_id,
        f.input.calls[0].to,
        '9',
        'old-revision',
      ),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
    await f.db.ensureAssetBudget(
      origin,
      f.input.account_id,
      f.input.calls[0].to,
      '9',
      'active-1',
    );
    expect(await f.db.budget(id(f))).toEqual({ maximum: '9', reserved: '0' });
  });
  it('fails activation closed for opaque prior calls rather than creating fresh capacity', async () => {
    const f = await fixture();
    const source = await f.source();
    await f.service.admit(f.context, source.action_id, f.operation);
    await expect(
      f.db.ensureAssetBudget(
        origin,
        f.input.account_id,
        f.input.calls[0].to,
        '9',
        'active-1',
      ),
    ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
    expect(await f.db.budget(id(f))).toBeNull();
  });
});
