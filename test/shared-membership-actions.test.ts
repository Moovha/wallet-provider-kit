import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Wallet } from 'ethers';
import { fingerprint } from '../src/onboarding/policy.js';
import { fixture } from './helpers/safe-4337.js';
import { currentRuntimePolicy } from '../src/runtime-configuration/authority.js';
import { runtimeApplicationId } from '../src/runtime-configuration/service.js';
import { Safe4337SigningService } from '../src/sponsorship/signing.js';

it('binds member admission to its grant, shares the Safe nonce, and denies signing after membership removal', async () => {
  const f = await fixture(undefined, undefined, undefined, true, false, true);
  const terms = await f.onboarding.applicationAccessPolicy(f.context.principal);
  const consent = () => ({
    reference: randomUUID(),
    granted_at: new Date(Date.now() - 1000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    policy_revision: terms.policy_revision,
    action_policy_revision: terms.action_policy_revision,
  });
  const owner = await f.onboarding.request(
    { ...f.context, idempotencyKey: randomUUID() },
    {
      mode: 'create',
      wallet: { reference: 'family', name: 'Family', kind: 'shared' },
      user: {
        id: 'owner',
        consent: { ...consent(), wallet_reference: 'family' },
      },
      authorization_details: [
        {
          type: 'https://moovha.com/wallet/account-access',
          actions: ['account:read', 'contracts:request', 'members:manage'],
        },
      ],
    },
  );
  const accountId = owner.account_id!,
    ownerPrincipal = { ...f.context.principal, accessGrantId: owner.grant_id };
  const ownerCtx = { principal: ownerPrincipal, idempotencyKey: randomUUID() };
  const binding = {
    ...f.config.basePolicy.accounts[0],
    accountId,
    address: Wallet.createRandom().address,
  };
  await f.db.onboardingStore.transaction((s) => {
    s.accounts[accountId].address = f.wallet.address;
    s.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.safeWalletAccounts![accountId] = {
      accountId,
      applicationId: runtimeApplicationId(
        ownerPrincipal.issuer,
        ownerPrincipal.clientId,
      ),
      owner: s.accounts[accountId].owner,
      signer: { accountId, address: f.wallet.address },
      binding,
      status: 'ready',
    };
  });
  await f.onboarding.saveMember(ownerCtx, accountId, {
    expected_revision: 0,
    user_id: 'guest',
    enabled: true,
    permissions: ['account:read'],
  });
  const access = (revision: number, spend: boolean) =>
    f.onboarding.request(
      { ...f.context, idempotencyKey: randomUUID() },
      {
        mode: 'connect',
        account_id: accountId,
        user: {
          id: 'guest',
          identity: {
            reference: 'guest-proof',
            level: 'verified',
            verified_at: new Date(Date.now() - 1000).toISOString(),
            fields: { country: 'ZA' },
          },
          consent: {
            ...consent(),
            ...(!spend ? { action_policy_revision: undefined } : {}),
            account_id: accountId,
            membership_revision: revision,
          },
        },
        authorization_details: [
          {
            type: 'https://moovha.com/wallet/account-access',
            actions: spend
              ? ['account:read', 'contracts:request']
              : ['account:read'],
          },
        ],
      },
    );
  const read = await access(1, false),
    input = { ...f.input, account_id: accountId };
  let nonceReads = 0;
  await expect(
    f.actions.requestCalls(
      {
        principal: { ...f.context.principal, accessGrantId: read.grant_id },
        idempotencyKey: randomUUID(),
      },
      input,
      async () => {
        nonceReads++;
        return '0';
      },
    ),
  ).rejects.toThrow();
  expect(nonceReads).toBe(0);
  await f.onboarding.saveMember(
    { ...ownerCtx, idempotencyKey: randomUUID() },
    accountId,
    {
      expected_revision: 1,
      user_id: 'guest',
      enabled: true,
      permissions: ['account:read', 'contracts:request'],
    },
  );
  const granted = await access(2, true),
    principal = { ...f.context.principal, accessGrantId: granted.grant_id },
    context = { principal, idempotencyKey: randomUUID() };
  await f.db.onboardingStore.transaction((s) => {
    const wallets =
      s.deploymentBindings!['service-v1'].runtimeConfiguration!
        .safeWalletAccounts!;
    delete wallets[f.input.account_id];
    wallets[accountId].applicationId = runtimeApplicationId(
      ownerPrincipal.issuer,
      'source-application',
    );
  });
  // The requesting application has no wallet of its own; its member grant selects this shared Safe.
  expect(
    Date.parse(
      await f.actions.applicationQueueExpiry(principal, 120, accountId),
    ),
  ).toBeGreaterThan(Date.now());
  const plan = await f.actions.requestCalls(context, input, async () => '0');
  const approval = await f.db.onboardingStore.transaction(
    (s) => s.supportedActions![plan.action_id].approval,
  );
  expect(approval.grantId).toBe(granted.grant_id);
  expect(approval.caller.accessGrantId).toBe(granted.grant_id);
  await expect(
    f.actions.requestCalls(
      { ...ownerCtx, idempotencyKey: randomUUID() },
      input,
      async () => '0',
    ),
  ).rejects.toMatchObject({ code: 'wallet_attempt_conflict' });
  const config = structuredClone(f.config);
  config.basePolicy.accounts = [binding];
  const signing = new Safe4337SigningService(
    f.actions,
    f.db,
    config,
    {
      backend: f.backend,
      authorization: async () => 'Bearer offline',
      authorizeSponsorship: async (_context, record) => ({
        termsHash: fingerprint(record),
        consentReference: record.operationId,
      }),
    },
    f.request,
  );
  const admitted = await signing.admit(context, plan.action_id, {
    ...f.operation,
    sender: binding.address,
  });
  expect(admitted).toBeDefined();
  await f.onboarding.saveMember(
    { ...ownerCtx, idempotencyKey: randomUUID() },
    accountId,
    {
      expected_revision: 2,
      user_id: 'guest',
      enabled: false,
      permissions: ['account:read'],
    },
  );
  await expect(signing.sign(context, plan.action_id)).rejects.toThrow();
  expect(f.state.signs).toBe(0);
  expect(await f.onboarding.account(ownerPrincipal, accountId)).toBeDefined();
  expect(
    await f.db.onboardingStore.transaction(
      (s) => currentRuntimePolicy(s, principal).application_id,
    ),
  ).toBe(runtimeApplicationId(principal.issuer, principal.clientId));
});
