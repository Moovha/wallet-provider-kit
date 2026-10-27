import { randomUUID } from 'node:crypto';
import { Wallet } from 'ethers';
import { expect, it } from 'vitest';
import { fixture } from './helpers/safe-4337.js';
import { runtimeApplicationId } from '../src/runtime-configuration/service.js';
import { safeUserOperationCallData } from '../src/sponsorship/index.js';
import { currentRuntimePolicy } from '../src/runtime-configuration/authority.js';

it('requires fresh owner consent, prepares arbitrary calls without action declarations and invalidates them when restricted', async () => {
  const f = await fixture();
  const principal = f.context.principal;
  const appId = runtimeApplicationId(principal.issuer, principal.clientId);
  const target = Wallet.createRandom().address;
  const input = {
    ...f.input,
    calls: [{ to: target, data: '0x12345678', value: '100' }],
  };
  await expect(
    f.actions.previewWalletCalls(principal, input),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  await f.runtime.setTransactionMode(
    { ...f.operatorContext, idempotencyKey: randomUUID() },
    appId,
    { expected_revision: '1', mode: 'unrestricted' },
  );
  await expect(
    f.actions.previewWalletCalls(principal, input),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  const terms = await f.onboarding.applicationAccessPolicy(principal);
  const previous = await f.db.onboardingStore.transaction(
    (s) => s.requests[f.grant.request_id].input.user!,
  );
  await f.onboarding.request(
    { ...f.context, idempotencyKey: randomUUID() },
    {
      mode: 'connect',
      account_id: f.input.account_id,
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: ['account:read', 'contracts:request'],
        },
      ],
      user: {
        ...previous,
        consent: {
          ...previous.consent,
          account_id: f.input.account_id,
          reference: randomUUID(),
          granted_at: new Date().toISOString(),
          policy_revision: terms.policy_revision,
          action_policy_revision: terms.action_policy_revision,
        },
      },
    },
  );
  await f.db.onboardingStore.transaction((s) => {
    const registry = s.deploymentBindings!['service-v1'].runtimeConfiguration!;
    delete registry.obligations!.records[appId + ':actions'];
  });
  // Resource changes are consent changes; obtain the current terms again.
  const latest = await f.onboarding.applicationAccessPolicy(principal);
  await f.onboarding.request(
    { ...f.context, idempotencyKey: randomUUID() },
    {
      mode: 'connect',
      account_id: f.input.account_id,
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: ['account:read', 'contracts:request'],
        },
      ],
      user: {
        ...previous,
        consent: {
          ...previous.consent,
          account_id: f.input.account_id,
          reference: randomUUID(),
          granted_at: new Date().toISOString(),
          policy_revision: latest.policy_revision,
          action_policy_revision: latest.action_policy_revision,
        },
      },
    },
  );
  const prepared = await f.actions.previewWalletCalls(principal, input);
  expect(prepared.intent.calls).toEqual(input.calls);
  expect(prepared.intent.contracts).toEqual([]);
  const native = {
    ...input,
    calls: [{ to: target, data: '0x', value: '100' }],
  };
  expect(
    (await f.actions.previewWalletCalls(principal, native)).intent.calls,
  ).toEqual(native.calls);
  for (const to of [
    prepared.intent.account.address,
    prepared.intent.multiSend.address,
  ])
    await expect(
      f.actions.previewWalletCalls(principal, {
        ...input,
        calls: [{ to, data: '0x12345678', value: '0' }],
      }),
    ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  const source = await f.actions.requestCalls(
    { ...f.context, idempotencyKey: randomUUID() },
    input,
    async () => '0',
  );
  const operation = {
    ...f.operation,
    callData: safeUserOperationCallData(prepared.intent),
  };
  await f.service.admit(f.context, source.action_id, operation);
  f.state.finalStub = true;
  await f.service.sponsor(f.context, source.action_id);
  await f.service.sign(f.context, source.action_id);
  expect(f.state.signs).toBe(1);
  await f.restart();
  expect(
    (await f.actions.previewWalletCalls(principal, input)).intent.calls,
  ).toEqual(input.calls);
  await f.runtime.setTransactionMode(
    { ...f.operatorContext, idempotencyKey: randomUUID() },
    appId,
    { expected_revision: '2', mode: 'restricted' },
  );
  await expect(
    f.actions.previewWalletCalls(principal, input),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  const current = await f.db.onboardingStore.transaction((s) =>
    currentRuntimePolicy(s, principal),
  );
  expect(current.policy.transaction_mode).toBeUndefined();
  const signs = f.state.signs;
  await expect(
    f.service.sign(f.context, source.action_id),
  ).rejects.toMatchObject({ code: 'wallet_authorization_denied' });
  expect(f.state.signs).toBe(signs);
});
