import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers/safe-4337.js';
import { currentRuntimePolicy } from '../src/runtime-configuration/authority.js';
import { runtimeApplicationId } from '../src/runtime-configuration/service.js';
import type { AccessInput } from '../src/onboarding/types.js';

it('uses A’s existing Safe with B’s publication and consent, then fences B after withdrawal', async () => {
  const f = await fixture(undefined, undefined, undefined, true, true);
  const a = f.context.principal;
  const b = { ...a, clientId: 'application-b', subject: 'service-b' };
  const ctx = { principal: b, idempotencyKey: randomUUID() };
  const sourceId = runtimeApplicationId(a.issuer, a.clientId);
  const targetId = runtimeApplicationId(b.issuer, b.clientId);
  const sourcePolicy = await f.db.onboardingStore.transaction((s) => {
    const registry = s.deploymentBindings!['service-v1'].runtimeConfiguration!;
    return structuredClone(
      registry.revisions[sourceId + ':' + registry.heads[sourceId]].policy,
    );
  });
  // B must publish its own rules rather than inheriting A's publication.
  await expect(
    f.onboarding.applicationAccessPolicy(b, a.clientId),
  ).rejects.toThrow();
  const proposed = await f.runtime.propose(ctx, {
    expected_revision: '0',
    policy: sourcePolicy,
  });
  await f.runtime.publish(f.operatorContext, proposed.proposal_id, '0');
  await f.db.onboardingStore.transaction((s) => {
    const registry = s.deploymentBindings!['service-v1'].runtimeConfiguration!;
    for (const kind of ['actions', 'services', 'sponsorship']) {
      const source = registry.obligations!.records[sourceId + ':' + kind];
      registry.obligations!.records[targetId + ':' + kind] = {
        ...structuredClone(source),
        application_id: targetId,
      };
    }
  });
  const terms = await f.onboarding.applicationAccessPolicy(b, a.clientId);
  const input: AccessInput = {
    mode: 'connect_from_application',
    source_application_id: a.clientId,
    user: {
      id: 'different-id-for-same-person',
      identity: {
        reference: 'b-proof',
        level: 'verified',
        verified_at: new Date(Date.now() - 1000).toISOString(),
        fields: {
          country: 'ZA',
          identity_number: '0000000000001',
          document_type: 'national_id',
          issuing_country: 'ZA',
        },
      },
      consent: {
        reference: 'b-consent',
        granted_at: new Date(Date.now() - 1000).toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        policy_revision: terms.policy_revision,
        sharing_revision: terms.wallet_sharing!.revision,
        source_application_id: a.clientId,
      },
    },
    authorization_details: [
      {
        type: 'https://moovha.com/wallet/account-access',
        actions: ['account:read', 'contracts:request'],
      },
    ],
  };
  const aTerms = await f.onboarding.applicationAccessPolicy(a);
  input.user!.consent.action_policy_revision = aTerms.action_policy_revision;
  await expect(f.onboarding.request(ctx, input)).rejects.toThrow();
  input.user!.consent.action_policy_revision = terms.action_policy_revision;
  const grant = await f.onboarding.request(ctx, input);
  expect(grant.account_id).toBe(f.grant.account_id);
  const binding = await f.actions.walletCallsAccount(b, grant.account_id!);
  expect(binding.snapshot.application_id).toBe(targetId);
  expect(binding.address).toBe(f.config.basePolicy.accounts[0].address);
  expect(await f.actions.walletSignerAccount(b, grant.account_id!)).toEqual({
    accountId: grant.account_id,
    address: f.wallet.address,
  });
  const planned = await f.actions.requestCalls(ctx, f.input, async () => '0');
  const approval = await f.db.onboardingStore.transaction(
    (state) => state.supportedActions![planned.action_id].approval,
  );
  expect(approval.caller.clientId).toBe(b.clientId);
  expect(approval.grantId).toBe(grant.grant_id);
  await expect(f.source()).rejects.toMatchObject({
    code: 'wallet_attempt_conflict',
  });
  await f.onboarding.revokeApplicationGrant(
    { principal: b, idempotencyKey: randomUUID() },
    grant.grant_id!,
  );
  await expect(
    f.actions.walletCallsAccount(b, grant.account_id!),
  ).rejects.toThrow();
  expect(
    (await f.actions.walletCallsAccount(a, grant.account_id!)).snapshot
      .application_id,
  ).toBe(sourceId);
  expect(
    await f.db.onboardingStore.transaction(
      (s) => currentRuntimePolicy(s, b).application_id,
    ),
  ).toBe(targetId);
});
