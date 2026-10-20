import { readFile } from 'node:fs/promises';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import { localCompose } from '../src/deployment/setup-executor.js';
import {
  generatedSecretNames,
  generateDeploymentSecrets,
} from '../src/deployment/deployment-secrets.js';
import { currentRuntimePolicy } from '../src/runtime-configuration/authority.js';
import { serviceHash } from '../src/executor/auth.js';
import { safeUserOperationCallData } from '../src/sponsorship/preparation.js';
import { buildApprovedCallIntent } from '../src/execution/approved-calls.js';
import { randomUUID } from 'node:crypto';
import { Wallet, Interface } from 'ethers';
import { expect, it } from 'vitest';
import { fixture } from './helpers/safe-4337.js';
import { SupportedActions } from '../src/deployment/actions.js';
import { Safe4337SigningService } from '../src/sponsorship/signing.js';
import { fingerprint } from '../src/onboarding/policy.js';
import { runtimeApplicationId } from '../src/runtime-configuration/service.js';
import { OnboardingService } from '../src/onboarding/service.js';

async function safeOnlyFixture() {
  const f = await fixture(undefined, undefined, { maximumAmount: '10' }, false);
  const applicationId = runtimeApplicationId(
    f.context.principal.issuer,
    f.context.principal.clientId,
  );
  const userAddress = Wallet.createRandom().address;
  const signer = { accountId: randomUUID(), address: f.wallet.address };
  await f.db.onboardingStore.transaction((s) => {
    s.accounts[f.input.account_id].address = userAddress;
    const r = s.deploymentBindings!['service-v1'].runtimeConfiguration!;
    r.safeWalletAccounts = {
      [f.input.account_id]: {
        applicationId,
        accountId: f.input.account_id,
        owner: s.accounts[f.input.account_id].owner,
        signer,
        binding: f.config.basePolicy.accounts[0],
        status: 'ready',
      },
    };
    const values = {
      actions: [
        {
          name: 'certify',
          description: 'Offline certification',
          fields: [{ name: 'user', required: true, allowed_values: ['self'] }],
        },
      ],
      services: [],
      sponsorship: {
        funding_agreement: 'offline',
        maximum_gas_budget_wei: '10000000',
        account_model: 'provider-controlled-user-safe',
        maximum_execution_accounts: 10,
        asset_model: 'individual-user-wallets',
        chain_id: 'eip155:84532',
      },
    };
    for (const kind of ['actions', 'services', 'sponsorship'] as const) {
      (r.obligations ??= { records: {}, receipts: {} }).records[
        applicationId + ':' + kind
      ] = {
        application_id: applicationId,
        kind,
        revision: '1',
        value: values[kind],
        decision: 'accepted',
        submitted_at: new Date().toISOString(),
        decision_revision: '1',
      } as never;
    }
    const publication =
      r.revisions[applicationId + ':' + r.heads[applicationId]];
    publication.policy.contracts[0].methods[0].user_address_parameters = [0];
    publication.policy_hash = serviceHash(publication.policy);
    const snapshot = currentRuntimePolicy(s, f.context.principal);
    const revision = fingerprint(['financial-terms', snapshot]);
    for (const grant of Object.values(s.grants)) {
      grant.transferPolicyRevision = revision;
      const request = s.requests[grant.requestId];
      request.transferPolicyRevision = revision;
      request.runtimePolicy = snapshot;
    }
  });
  f.input.calls[0].data = new Interface(['function transfer(address,uint256)'])
    .encodeFunctionData('transfer', [f.operation.sender, 0])
    .toLowerCase();
  Object.assign(f.input, {
    application_action: { name: 'certify', payload: { user: 'self' } },
  });
  const snapshot = await f.db.onboardingStore.transaction((s) =>
    currentRuntimePolicy(s, f.context.principal),
  );
  const intent = buildApprovedCallIntent(
    { ...f.config.basePolicy, contracts: f.config.basePolicy.contracts },
    f.input,
    '0',
    new Date(Date.now() + 60000).toISOString(),
  );
  f.operation.callData = safeUserOperationCallData(intent);
  const actions = new SupportedActions(
    f.onboarding,
    f.db,
    undefined,
    f.actions.revision,
    { policy: f.config.basePolicy, maxValiditySeconds: 120 },
    undefined,
    false,
    true,
    1,
    true,
  );
  const service = new Safe4337SigningService(
    actions,
    f.db,
    f.config,
    {
      backend: f.backend,
      authorization: async () => 'Bearer offline-fixture',
      authorizeSponsorship: async (_c, terms) => ({
        termsHash: fingerprint(terms),
        consentReference: 'safe-only-consent',
      }),
    },
    f.request,
  );
  return { f, actions, service, signer, applicationId, userAddress };
}
it('signs through the private Safe owner while retaining the logical user grant and returns only the Safe address', async () => {
  const { f, actions, service, signer } = await safeOnlyFixture();
  expect(
    await actions.walletSignerAccount(f.context.principal, f.input.account_id),
  ).toEqual(signer);
  expect(
    (await actions.walletCallsAccount(f.context.principal, f.input.account_id))
      .address,
  ).toBe(f.operation.sender);
  const admitted = await service.requestCalls(f.context, f.input, f.operation);
  await service.sponsor(f.context, admitted.operation_id);
  const signed = await service.sign(f.context, admitted.operation_id);
  expect(signed.sender).toBe(f.operation.sender);
  expect(f.state.signs).toBe(1);
  await expect(
    service.withExecutionRead(
      f.context.principal,
      admitted.operation_id,
      () => true,
    ),
  ).resolves.toBe(true);
  const onboarding = new OnboardingService(
    (({ revision: _revision, ...policy }) => policy)(f.onboarding.policy),
    f.db.onboardingStore,
    [],
    f.backend,
    'financial-terms',
    true,
    true,
  );
  expect(
    (await onboarding.account(f.context.principal, f.input.account_id)).address,
  ).toBe(f.operation.sender);
});
it('hides the internal signer and refuses execution until the Safe is ready', async () => {
  const { f, actions, service } = await safeOnlyFixture();
  await f.db.onboardingStore.transaction((s) => {
    s.deploymentBindings![
      'service-v1'
    ].runtimeConfiguration!.safeWalletAccounts![f.input.account_id].status =
      'prepared';
  });
  const onboarding = new OnboardingService(
    (({ revision: _revision, ...policy }) => policy)(f.onboarding.policy),
    f.db.onboardingStore,
    [],
    f.backend,
    'financial-terms',
    true,
    true,
  );
  expect(
    await onboarding.account(f.context.principal, f.input.account_id),
  ).not.toHaveProperty('address');
  await expect(
    actions.walletCallsAccount(f.context.principal, f.input.account_id),
  ).rejects.toThrow();
  await expect(
    service.requestCalls(f.context, f.input, f.operation),
  ).rejects.toThrow();
  expect(f.state.posts).toBe(0);
  expect(f.state.signs).toBe(0);
});

it('rejects revoked user consent after admission and before paymaster signing', async () => {
  const { f, service } = await safeOnlyFixture();
  const admitted = await service.requestCalls(f.context, f.input, f.operation);
  await f.db.onboardingStore.transaction((s) => {
    for (const grant of Object.values(s.grants)) grant.state = 'revoked';
  });
  await expect(
    service.sponsor(f.context, admitted.operation_id),
  ).rejects.toThrow();
  expect(f.state.posts).toBe(0);
  expect(f.state.signs).toBe(0);
});

it('configures a Safe-only deployment without a relayer, user asset EOA or sponsor pool and isolates the bundler journal', async () => {
  const original = JSON.parse(
    await readFile(
      new URL(
        '../docs/provider.config.application.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const config = structuredClone(original);
  delete config.execution;
  delete config.localExecution;
  delete config.operations;
  delete config.financial;
  delete config.runtimeConfiguration.sharedApplicationSafes;
  delete config.runtimeConfiguration.executionPool;
  config.runtimeConfiguration.rpcVerification = 'single';
  config.safeWallet = {
    profile: 'safe-only-4337-v1',
    genesisHash: '0x' + '12'.repeat(32),
    entryPoint: {
      address: '0x' + '11'.repeat(20),
      codeHash: '0x' + '13'.repeat(32),
    },
    module: {
      address: '0x' + '22'.repeat(20),
      codeHash: '0x' + '14'.repeat(32),
    },
    bundlerAuthorization: { env: 'LOCAL_BUNDLER_AUTHORIZATION' },
    runtimeDirectory: '.provider-data/bundler',
    maximumSetupCostWei: '100000000000000',
    executorBalanceWei: '10000000000000',
    paymasterDepositWei: '10000000000000',
  };
  const validated = validateProviderConfiguration(config);
  expect(generatedSecretNames(validated)).toContain(
    'LOCAL_BUNDLER_AUTHORIZATION',
  );
  const secrets = generateDeploymentSecrets(validated, {});
  expect(secrets.LOCAL_BUNDLER_AUTHORIZATION).toMatch(/^[A-Za-z0-9_-]{64}$/);
  expect(
    generateDeploymentSecrets(validated, secrets).LOCAL_BUNDLER_AUTHORIZATION,
  ).toBe(secrets.LOCAL_BUNDLER_AUTHORIZATION);
  expect(validated).not.toHaveProperty('execution');
  const compose = localCompose(
    {
      config: validated,
      directory: '/tmp/offline-safe-wallet',
      project: 'offline',
      port: 8080,
    } as never,
    '/tmp/source',
  );
  expect(compose.services).toHaveProperty('bundler');
  expect(compose.services).not.toHaveProperty('local-execution');
  expect(compose.services.bundler).not.toHaveProperty('ports');
  expect(compose.services['bundler-store']!.command).toContain('always');
  expect(compose.networks!.bundler!.internal).toBe(true);
  expect(() =>
    validateProviderConfiguration({ ...config, execution: original.execution }),
  ).toThrow();
});
