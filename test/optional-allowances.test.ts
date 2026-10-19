import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './helpers/safe-4337.js';
import {
  SupportedActions,
  type TransferPolicy,
} from '../src/deployment/actions.js';
import { assetBudgetId } from '../src/storage/index.js';
import { createWalletAttemptRequest } from '../src/providers/attempt-lifecycle.js';
import { EmbeddedWalletService } from '../src/domain/embedded-wallet.js';
import { createJournaledWalletProvider } from '../src/providers/journaled.js';
const origin = 'https://wallet.example.test';
async function exhaustLegacyAllowance(f: Awaited<ReturnType<typeof fixture>>) {
  const token = f.input.calls[0].to;
  const budgetId = assetBudgetId(origin, f.input.account_id, token);
  await f.db.setBudget(budgetId, '1');
  const request = createWalletAttemptRequest(
    'legacy',
    'offline',
    'sign_typed_data',
    f.input.account_id,
    randomUUID(),
    'legacy-exposure',
    {},
  );
  await f.db.admitAttempt({ request, budgetId, units: '1' });
  await f.db.journal.claim(request);
  const compatibility: TransferPolicy = {
    profile: 'provider-authorized-erc3009-v1',
    token: {
      address: token,
      name: 'Offline token',
      version: '1',
      symbol: 'TEST',
      decimals: 6,
    },
    recipients: [f.wallet.address],
    maximumAmount: '1',
    lifetimeAmount: '1',
    maxValiditySeconds: 120,
  };
  const actions = new SupportedActions(
    f.onboarding,
    f.db,
    compatibility,
    'active-1',
    { policy: f.config.basePolicy, maxValiditySeconds: 120 },
  );
  return { budgetId, actions };
}
describe('optional allowance adapters and separate gas sponsorship', () => {
  it.each(['no-adapter', 'per-transfer-only'] as const)(
    'does not inherit ERC-3009 allowances or run asset migration: %s',
    async (mode) => {
      const f = await fixture(
        undefined,
        undefined,
        { maximumAmount: '10' },
        mode !== 'no-adapter',
      );
      const { budgetId, actions } = await exhaustLegacyAllowance(f);
      const activation = vi
        .spyOn(f.db, 'ensureAssetBudget')
        .mockRejectedValue(new Error('Asset migration must not run'));
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
      expect(stored.intent?.assetBudgets).toBeUndefined();
      expect(stored.approval.additionalBudgets).toBeUndefined();
      expect(stored.intent?.adapterInput?.kind).toBe(
        mode === 'no-adapter' ? undefined : 'token-transfer',
      );
      await f.service.admit(f.context, source.action_id, f.operation);
      await f.service.sponsor(f.context, source.action_id);
      await f.service.sign(f.context, source.action_id);
      expect(await f.db.budget(budgetId)).toEqual({
        maximum: '1',
        reserved: '1',
      });
      expect(activation).not.toHaveBeenCalled();
      const sponsorship = f.db.sponsorship.load(source.action_id)!;
      expect(sponsorship.gasBudgetId).not.toBe(budgetId);
      expect(sponsorship.gasBudgetId).not.toBe(stored.approval.budgetId);
      expect((await f.db.budget(sponsorship.gasBudgetId))?.reserved).toBe(
        sponsorship.maximumCostWei,
      );
      expect(
        await f.db.onboardingStore.transaction((s) =>
          Object.keys(s.assetReservations ?? {}),
        ),
      ).toEqual([]);
      expect(
        await f.db.onboardingStore.transaction((s) =>
          Object.keys(s.assetBudgetMigrations ?? {}),
        ),
      ).toEqual([]);
      expect(f.state.signs).toBe(1);
    },
  );
  it('signs generic calls without reserving sponsorship gas or creating an asset allowance', async () => {
    const f = await fixture(
      (config) => {
        config.sponsors[0].lifetimeBudgetWei = '1';
      },
      undefined,
      { maximumAmount: '1' },
      false,
    );
    const source = await f.source(),
      relay = f.relay();
    const service = new EmbeddedWalletService(
      relay.authority,
      createJournaledWalletProvider(f.backend, {
        namespace: 'relay-signing',
        journal: relay.journal,
        authorizeAttempt: relay.authorizeAttempt,
      }),
    );
    await service.sign(f.context, source.action_id);
    expect(f.db.sponsorship.load(source.action_id)).toBeNull();
    expect(
      await f.db.budget(
        assetBudgetId(origin, f.input.account_id, f.input.calls[0].to),
      ),
    ).toBeNull();
    expect(f.state.posts).toBe(0);
    expect(f.state.signs).toBe(1);
  });
  it.each([false, true])(
    'requires gas capacity independently of cumulative policy selection: %s',
    async (cumulative) => {
      const f = await fixture(
        (config) => {
          config.sponsors[0].lifetimeBudgetWei = '1';
        },
        undefined,
        {
          maximumAmount: '10',
          ...(cumulative ? { lifetimeAmount: '20' } : {}),
        },
        cumulative,
      );
      const source = await f.source();
      await expect(
        f.service.admit(f.context, source.action_id, f.operation),
      ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
      expect(f.db.sponsorship.load(source.action_id)).toBeNull();
      expect(f.state.posts).toBe(0);
      expect(f.state.signs).toBe(0);
      const budget = await f.db.budget(
        assetBudgetId(origin, f.input.account_id, f.input.calls[0].to),
      );
      expect(budget).toEqual(
        cumulative ? { maximum: '20', reserved: '0' } : null,
      );
    },
  );
});
