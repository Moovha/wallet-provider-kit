import { defaultSafeProvisioning } from '../src/provisioning/defaults.js';
import { ApplicationCredentialCipher } from '../src/runtime-configuration/credentials.js';
import { currentRuntimePolicy } from '../src/runtime-configuration/authority.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { defineOnboardingPolicy } from '../src/onboarding/policy.js';
import {
  openProviderDatabase,
  type ProviderDatabase,
} from '../src/storage/index.js';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../src/domain/principal.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
  type RuntimePolicy,
} from '../src/runtime-configuration/service.js';
import { createServer } from '../src/service/server.js';
import { AuthenticationError } from '../src/service/auth.js';
import { validateProviderConfiguration } from '../src/deployment/config.js';
import { runtimeConfigurationSchema } from '../src/runtime-configuration/schemas.js';
import configurationSchema from '../spec/provider-config.schema.json' with { type: 'json' };

const issuer = 'https://issuer.example.test';
const policy = defineOnboardingPolicy({
  version: '1',
  provider: {
    name: 'Offline provider',
    origin: 'https://wallet.example.test',
    privacyUrl: 'https://wallet.example.test/privacy',
  },
  access: { mode: 'application' },
  identity: {
    application: { verificationLevel: 'verified', requiredFields: ['country'] },
  },
  applications: ['first', 'second'].map((clientId) => ({
    issuer,
    clientId,
    name: clientId,
    assertionTrust: { agreement: 'offline-trust' },
  })),
});
const application = (clientId = 'first'): VerifiedPrincipal => ({
  issuer,
  clientId,
  subject: 'service',
  scopes: ['wallet:configuration:read', 'wallet:configuration:propose'],
});
const operator: VerifiedPrincipal = {
  issuer,
  clientId: 'operator',
  subject: 'provider-operator',
  scopes: ['wallet:configuration:write'],
};
const options = {
  operators: [
    { issuer, clientId: operator.clientId, subject: operator.subject },
  ],
};
const context = (principal = application()): AuthorityContext => ({
  principal,
  idempotencyKey: randomUUID(),
});
function document(): RuntimePolicy {
  return {
    version: '1',
    enabled: true,
    chain_id: 'eip155:84532',
    maximum_calls: 4,
    maximum_native_value_wei: '10',
    max_validity_seconds: 120,
    contracts: [
      {
        address: '0x1111111111111111111111111111111111111111',
        code_hash: '0x' + '1'.repeat(64),
        methods: [
          {
            signature: 'customMethod(uint256,address)',
            maximum_value_wei: '0',
          },
        ],
      },
    ],
    claim_requirements: [
      { name: 'country', allowed_values: ['ZA', 'ZW'], max_age_seconds: 3600 },
    ],
  };
}
const directories: string[] = [];
const databases: ProviderDatabase[] = [];
const servers: Awaited<ReturnType<typeof createServer>>[] = [];
afterEach(async () => {
  for (const app of servers.splice(0)) await app.close();
  for (const db of databases.splice(0)) db.close();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wpk-runtime-'));
  directories.push(directory);
  const db = openProviderDatabase({ directory, initialize: true });
  databases.push(db);
  await db.onboardingStore.transaction((state) => {
    state.deploymentBindings = {
      'service-v1': {
        origin: policy.provider.origin,
        provider: 'offline',
        binding: 'offline',
        activeRevision: 'deployment-1',
      },
    };
  });
  const service = new RuntimeConfigurationService(
    policy,
    db.onboardingStore,
    options,
    'deployment-1',
  );
  return { directory, db, service };
}
const denied = { code: 'wallet_authorization_denied' };
const conflicted = { code: 'wallet_attempt_conflict' };

describe('runtime application contracts and provider policies', () => {
  it('publishes and updates policies without replacing a running service, retaining exact history', async () => {
    const { service, db } = await fixture();
    const secondHost = new RuntimeConfigurationService(
      policy,
      db.onboardingStore,
      options,
      'deployment-1',
    );
    expect(await service.read(application())).toMatchObject({
      active_revision: '0',
      authorizes_spending: false,
    });
    const proposal = await service.propose(context(), {
      expected_revision: '0',
      policy: document(),
    });
    expect((await service.read(application())).active_revision).toBe('0');
    const published = await service.publish(
      context(operator),
      proposal.proposal_id,
      '0',
    );
    expect(published).toMatchObject({
      revision: '1',
      previous_revision: '0',
      proposal_id: proposal.proposal_id,
    });
    expect((await secondHost.read(application())).publication).toEqual(
      published,
    );
    const update = document();
    update.enabled = false;
    const next = await service.update(
      context(operator),
      proposal.application_id,
      { expected_revision: '1', policy: update },
    );
    expect(next).toMatchObject({
      revision: '2',
      previous_revision: '1',
      policy: { enabled: false },
    });
    expect((await secondHost.read(application(), '1')).publication).toEqual(
      published,
    );
    expect((await secondHost.read(application())).publication).toEqual(next);
    expect(
      (await secondHost.readApplication(operator, proposal.application_id))
        .publication,
    ).toEqual(next);
    await expect(
      service.readApplication(application(), proposal.application_id),
    ).rejects.toMatchObject(denied);
    expect((await service.read(application('second'))).active_revision).toBe(
      '0',
    );
  });
  it('preserves registry state and normalized method signatures across a process restart', async () => {
    const { service, db, directory } = await fixture();
    const proposal = await service.propose(context(), {
      expected_revision: '0',
      policy: document(),
    });
    const publication = await service.publish(
      context(operator),
      proposal.proposal_id,
      '0',
    );
    db.close();
    const restored = openProviderDatabase({ directory });
    databases.push(restored);
    const registry = new RuntimeConfigurationService(
      policy,
      restored.onboardingStore,
      options,
      'deployment-1',
    );
    expect((await registry.read(application())).publication).toEqual(
      publication,
    );
    expect(await registry.proposal(operator, proposal.proposal_id)).toEqual(
      proposal,
    );
  });
  it('scopes proposals to the registered application and never treats write scope as operator identity', async () => {
    const { service } = await fixture();
    const proposal = await service.propose(context(), {
      expected_revision: '0',
      policy: document(),
    });
    await expect(
      service.proposal(application('second'), proposal.proposal_id),
    ).rejects.toMatchObject(denied);
    await expect(
      service.read({ ...application(), issuer: 'https://other.example.test' }),
    ).rejects.toMatchObject(denied);
    await expect(
      service.publish(
        context({ ...application(), scopes: ['wallet:configuration:write'] }),
        proposal.proposal_id,
        '0',
      ),
    ).rejects.toMatchObject(denied);
    await expect(
      service.publish(
        context({ ...operator, subject: 'wrong' }),
        proposal.proposal_id,
        '0',
      ),
    ).rejects.toMatchObject(denied);
    await expect(
      service.propose(context({ ...application(), scopes: [] }), {
        expected_revision: '0',
        policy: document(),
      }),
    ).rejects.toMatchObject(denied);
    expect(
      await service.proposal(
        {
          ...application(),
          scopes: [...application().scopes, 'wallet:configuration:write'],
        },
        proposal.proposal_id,
      ),
    ).toEqual(proposal);
  });
  it('deduplicates canonical retries and never reactivates an old revision during publication replay', async () => {
    const { service } = await fixture();
    const request = context(),
      change = { expected_revision: '0', policy: document() };
    const proposed = await service.propose(request, change);
    change.policy.claim_requirements[0].allowed_values.reverse();
    expect(await service.propose(request, change)).toEqual(proposed);
    change.policy.maximum_calls = 5;
    await expect(service.propose(request, change)).rejects.toMatchObject(
      conflicted,
    );
    const publish = context(operator),
      first = await service.publish(publish, proposed.proposal_id, '0');
    await service.update(context(operator), proposed.application_id, {
      expected_revision: '1',
      policy: document(),
    });
    expect(await service.publish(publish, proposed.proposal_id, '0')).toEqual(
      first,
    );
    expect((await service.read(application())).active_revision).toBe('2');
    await expect(
      service.publish(context(operator), proposed.proposal_id, '0'),
    ).rejects.toMatchObject(conflicted);
  });
  it('admits only one concurrent publication and rejects stale updates and proposals', async () => {
    const { service } = await fixture();
    const app = runtimeApplicationId(issuer, 'first');
    const results = await Promise.allSettled([
      service.update(context(operator), app, {
        expected_revision: '0',
        policy: document(),
      }),
      service.update(context(operator), app, {
        expected_revision: '0',
        policy: document(),
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      service.propose(context(), {
        expected_revision: '0',
        policy: document(),
      }),
    ).rejects.toMatchObject(conflicted);
  });
  it('fences readers and writers after deployment or transport authority changes', async () => {
    const { service, db } = await fixture();
    await db.onboardingStore.transaction((state) => {
      state.deploymentBindings!['service-v1'].transportRevision = 'new-key';
    });
    await expect(service.read(application())).rejects.toMatchObject(denied);
    await expect(
      service.propose(context(), {
        expected_revision: '0',
        policy: document(),
      }),
    ).rejects.toMatchObject(denied);
    const current = new RuntimeConfigurationService(
      policy,
      db.onboardingStore,
      options,
      'deployment-1',
      'new-key',
    );
    expect((await current.read(application())).active_revision).toBe('0');
    await db.onboardingStore.transaction((state) => {
      state.deploymentBindings!['service-v1'].activeRevision = 'deployment-2';
    });
    await expect(
      current.update(context(operator), runtimeApplicationId(issuer, 'first'), {
        expected_revision: '0',
        policy: document(),
      }),
    ).rejects.toMatchObject(denied);
  });
  it.each([
    'signature',
    'chain',
    'duplicate',
    'zero',
    'value',
    'unknown',
    'claims',
    'overflow',
  ] as const)('rejects invalid %s before creating a proposal', async (kind) => {
    const { service } = await fixture();
    const value = document();
    if (kind === 'signature')
      value.contracts[0].methods[0].signature =
        'function customMethod(uint256 x,address to)';
    if (kind === 'chain') value.chain_id = 'eip155:1' as never;
    if (kind === 'duplicate')
      value.contracts.push(structuredClone(value.contracts[0]));
    if (kind === 'zero') value.contracts[0].address = '0x' + '0'.repeat(40);
    if (kind === 'value')
      value.contracts[0].methods[0].maximum_value_wei = '11';
    if (kind === 'unknown') Object.assign(value, { signer: 'caller' });
    if (kind === 'claims')
      value.claim_requirements.push(
        structuredClone(value.claim_requirements[0]),
      );
    if (kind === 'overflow')
      value.maximum_native_value_wei = String(2n ** 256n);
    await expect(
      service.propose(context(), { expected_revision: '0', policy: value }),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
    expect((await service.read(application())).active_revision).toBe('0');
  });
  it('does not create financial approvals, admissions, attempts or budgets', async () => {
    const { service, directory } = await fixture();
    const proposal = await service.propose(context(), {
      expected_revision: '0',
      policy: document(),
    });
    await service.publish(context(operator), proposal.proposal_id, '0');
    const database = new DatabaseSync(join(directory, 'provider.sqlite'), {
      readOnly: true,
    });
    try {
      for (const table of ['approvals', 'admissions', 'attempts', 'budgets'])
        expect(
          database.prepare(`SELECT count(*) AS count FROM ${table}`).get()
            ?.count,
        ).toBe(0);
      expect(database.prepare('PRAGMA user_version').get()?.user_version).toBe(
        2,
      );
    } finally {
      database.close();
    }
  });
  it('validates bootstrap operator separation and keeps its generated configuration schema current', async () => {
    const input = JSON.parse(
      await readFile(
        new URL('../docs/provider.config.safe.example.json', import.meta.url),
        'utf8',
      ),
    );
    input.runtimeConfiguration = {
      ...input.runtimeConfiguration,
      ...structuredClone(options),
    };
    input.runtimeConfiguration.operators[0].subject =
      input.runtimeConfiguration.operators[0].clientId;
    input.authorizationServer.operatorClients[0].clientId =
      input.runtimeConfiguration.operators[0].clientId;
    // The sample issuer is independent of this fixture's issuer.
    input.runtimeConfiguration.operators[0].issuer = input.oauth.issuer;
    expect(
      validateProviderConfiguration(input).runtimeConfiguration,
    ).toBeDefined();
    input.runtimeConfiguration.operators[0].clientId =
      input.policy.applications[0].clientId;
    await expect(async () =>
      validateProviderConfiguration(input),
    ).rejects.toMatchObject({ name: 'Error' });
    expect(configurationSchema.properties.runtimeConfiguration).toEqual(
      runtimeConfigurationSchema,
    );
  });
});

describe('runtime configuration HTTP contract', () => {
  it('supports application proposal, operator publication and live discovery with no wallet activation', async () => {
    const { service } = await fixture();
    const app = await createServer({
      documentation: false,
      runtimeConfiguration: service,
      authenticate: async (token, scope) => {
        if (!token) throw new AuthenticationError(401);
        const principal =
          token === 'Bearer operator' ? operator : application();
        if (!principal.scopes.includes(scope))
          throw new AuthenticationError(403);
        return principal;
      },
    });
    servers.push(app);
    const proposal = await app.inject({
      method: 'POST',
      url: '/v1/application/policy/proposals',
      headers: { authorization: 'Bearer app', 'idempotency-key': randomUUID() },
      payload: { expected_revision: '0', policy: document() },
    });
    expect(proposal.statusCode).toBe(200);
    const publication = await app.inject({
      method: 'POST',
      url: `/v1/provider/policy/proposals/${proposal.json().proposal_id}/publish`,
      headers: {
        authorization: 'Bearer operator',
        'idempotency-key': randomUUID(),
      },
      payload: { expected_revision: '0' },
    });
    expect(publication.statusCode).toBe(200);
    const current = await app.inject({
      url: '/v1/application/policy',
      headers: { authorization: 'Bearer app' },
    });
    expect(current.json()).toMatchObject({
      active_revision: '1',
      authorizes_spending: false,
    });
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
    expect((await app.inject('/v1/application/policy')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/provider/applications/${proposal.json().application_id}/policy/revisions`,
          headers: {
            authorization: 'Bearer app',
            'idempotency-key': randomUUID(),
          },
          payload: { expected_revision: '1', policy: document() },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/application/policy/proposals',
          headers: {
            authorization: 'Bearer app',
            'idempotency-key': randomUUID(),
          },
          payload: {
            expected_revision: '1',
            policy: document(),
            application_id: 'caller-selected',
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('keeps optional endpoints unavailable without configured runtime authority', async () => {
    const app = await createServer({ documentation: false });
    servers.push(app);
    expect((await app.inject('/v1/application/policy')).statusCode).toBe(503);
    const result = await app.inject({
      method: 'POST',
      url: '/v1/application/policy/proposals',
      headers: { 'idempotency-key': randomUUID() },
      payload: { expected_revision: '0', policy: document() },
    });
    expect(result.statusCode).toBe(503);
  });
});

describe('application configuration listing and delegated contract registration', () => {
  it('automatically publishes contract changes only after provider approval and preserves exact replay across restart', async () => {
    const { service, db } = await fixture();
    const appId = runtimeApplicationId(issuer, 'first');
    const first = await service.propose(context(), {
      expected_revision: '0',
      policy: document(),
    });
    expect((await service.read(application())).active_revision).toBe('0');
    await expect(
      service.setReview(context(operator), appId, {
        expected_revision: '0',
        expected_review_revision: '0',
        mode: 'automatic',
      }),
    ).rejects.toMatchObject(conflicted);
    await service.publish(context(operator), first.proposal_id, '0');
    const decisionContext = context(operator);
    const decision = await service.setReview(decisionContext, appId, {
      expected_revision: '1',
      expected_review_revision: '0',
      mode: 'automatic',
    });
    const change = document();
    change.contracts[0].methods.push({
      signature: 'anotherMethod(bytes32)',
      maximum_value_wei: '1',
    });
    const submission = context();
    const proposal = await service.propose(submission, {
      expected_revision: '1',
      policy: change,
    });
    const publication = (await service.read(application())).publication!;
    expect(publication).toMatchObject({
      revision: '2',
      proposal_id: proposal.proposal_id,
      published_by: decision.approved_by,
    });
    expect(publication.policy.contracts[0].methods).toHaveLength(2);
    expect(
      (
        await service.listApplications(operator, appId)
      ).applications[0].proposals.find(
        (p) => p.proposal_id === proposal.proposal_id,
      )?.published_revision,
    ).toBe('2');
    await service.setReview(context(operator), appId, {
      expected_revision: '2',
      expected_review_revision: '1',
      mode: 'manual',
    });
    const restarted = new RuntimeConfigurationService(
      policy,
      db.onboardingStore,
      options,
      'deployment-1',
    );
    expect(
      await restarted.propose(submission, {
        expected_revision: '1',
        policy: change,
      }),
    ).toEqual(proposal);
    expect(
      await restarted.setReview(decisionContext, appId, {
        expected_revision: '1',
        expected_review_revision: '0',
        mode: 'automatic',
      }),
    ).toEqual(decision);
    expect(
      (await restarted.listApplications(operator, appId)).applications[0].review
        ?.mode,
    ).toBe('manual');
    expect((await restarted.read(application())).active_revision).toBe('2');
    expect(
      await db.onboardingStore.transaction((state) =>
        state.audit.some(
          (event) => event.event === 'runtime_contracts_auto_accepted',
        ),
      ),
    ).toBe(true);
  });
  it.each([
    'claim_requirements',
    'maximum_calls',
    'maximum_native_value_wei',
    'max_validity_seconds',
    'native_transfers',
    'call_adapters',
    'enabled',
  ] as const)(
    'keeps proposals changing %s pending even in automatic mode',
    async (field) => {
      const { service } = await fixture();
      const appId = runtimeApplicationId(issuer, 'first');
      await service.update(context(operator), appId, {
        expected_revision: '0',
        policy: document(),
      });
      await service.setReview(context(operator), appId, {
        expected_revision: '1',
        expected_review_revision: '0',
        mode: 'automatic',
      });
      const value = document();
      if (field === 'claim_requirements') value.claim_requirements = [];
      else if (field === 'native_transfers')
        value.native_transfers = [
          {
            address: '0x2222222222222222222222222222222222222222',
            code_hash: '0x' + '2'.repeat(64),
            maximum_value_wei: '1',
          },
        ];
      else if (field === 'call_adapters')
        value.call_adapters = { tokenTransfers: [] };
      else if (field === 'enabled') value.enabled = false;
      else if (field === 'maximum_native_value_wei')
        value.maximum_native_value_wei = '11';
      else value[field] += 1;
      const proposed = await service.propose(context(), {
        expected_revision: '1',
        policy: value,
      });
      expect((await service.read(application())).active_revision).toBe('1');
      expect(
        (await service.proposal(operator, proposed.proposal_id)).policy,
      ).toEqual(value);
    },
  );
  it('keeps disabled policies disabled and does not retroactively accept pending proposals', async () => {
    const { service } = await fixture();
    const appId = runtimeApplicationId(issuer, 'first');
    const disabled = document();
    disabled.enabled = false;
    await service.update(context(operator), appId, {
      expected_revision: '0',
      policy: disabled,
    });
    const pending = await service.propose(context(), {
      expected_revision: '1',
      policy: disabled,
    });
    await service.setReview(context(operator), appId, {
      expected_revision: '1',
      expected_review_revision: '0',
      mode: 'automatic',
    });
    await service.propose(context(), {
      expected_revision: '1',
      policy: disabled,
    });
    expect((await service.read(application())).active_revision).toBe('1');
    expect(
      (
        await service.listApplications(application(), appId)
      ).applications[0].proposals.every((p) => !p.published_revision),
    ).toBe(true);
    expect(await service.proposal(operator, pending.proposal_id)).toBeDefined();
  });
  it('isolates application configuration lists, rejects scope-only operators and fences simultaneous review decisions', async () => {
    const { service } = await fixture();
    const appId = runtimeApplicationId(issuer, 'first');
    expect(
      (await service.listApplications(application())).applications.map(
        (app) => app.application_id,
      ),
    ).toEqual([appId]);
    expect(
      (await service.listApplications(operator)).applications,
    ).toHaveLength(2);
    await expect(
      service.listApplications(
        application(),
        runtimeApplicationId(issuer, 'second'),
      ),
    ).rejects.toMatchObject(denied);
    await expect(
      service.listApplications({
        ...application(),
        scopes: ['wallet:configuration:write'],
      }),
    ).rejects.toMatchObject(denied);
    await expect(
      service.setReview(context(), appId, {
        expected_revision: '0',
        expected_review_revision: '0',
        mode: 'automatic',
      }),
    ).rejects.toMatchObject(denied);
    await service.update(context(operator), appId, {
      expected_revision: '0',
      policy: document(),
    });
    const results = await Promise.allSettled(
      ['automatic', 'manual'].map((mode) =>
        service.setReview(context(operator), appId, {
          expected_revision: '1',
          expected_review_revision: '0',
          mode: mode as 'automatic' | 'manual',
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: conflicted });
    await expect(
      service.setReview(context(operator), appId, {
        expected_revision: '0',
        expected_review_revision: '1',
        mode: 'automatic',
      }),
    ).rejects.toMatchObject(conflicted);
  });
});

describe('application obligations', () => {
  const actions = [
    {
      name: 'pay_invoice',
      description: 'Pay an invoice under the accepted application policy.',
      fields: [
        {
          name: 'invoice_status',
          required: true,
          allowed_values: ['approved', 'issued'],
        },
      ],
    },
  ];
  it('requires the target application to accept each exact provider fee revision', async () => {
    const { service, db } = await fixture();
    const appId = runtimeApplicationId(issuer, 'first');
    const value = {
      chain_id: 'eip155:84532' as const,
      funding_agreement: 'Provider fee terms',
      funding_mode: 'balance' as const,
      maximum_transaction_fee_wei: '1000',
      maximum_pending_fees_wei: '2000',
      account_model: 'provider-controlled-user-safe' as const,
      asset_model: 'individual-user-wallets' as const,
      maximum_execution_accounts: 10,
    };
    const proposalContext = context(operator);
    const proposal = await service.proposeSponsorship(proposalContext, appId, {
      expected_revision: '0',
      value,
    });
    expect(proposal).toMatchObject({
      proposed_by: 'provider',
      decision: 'pending',
      revision: '1',
    });
    expect(
      await service.proposeSponsorship(proposalContext, appId, {
        expected_revision: '0',
        value,
      }),
    ).toEqual(proposal);
    await expect(service.acceptedSponsorship(appId)).rejects.toMatchObject(
      denied,
    );
    const decision = {
      expected_revision: '1',
      expected_decision_revision: '0',
      decision: 'accepted' as const,
    };
    await expect(
      service.decideObligation(
        context(operator),
        appId,
        'sponsorship',
        decision,
      ),
    ).rejects.toMatchObject(denied);
    await expect(
      service.acceptSponsorship(context(operator), decision),
    ).rejects.toMatchObject(denied);
    await expect(
      service.proposeSponsorship(context(), appId, {
        expected_revision: '1',
        value,
      }),
    ).rejects.toMatchObject(denied);
    await expect(
      service.acceptSponsorship(context(application('second')), decision),
    ).rejects.toMatchObject(conflicted);
    const acceptContext = context();
    const accepted = await service.acceptSponsorship(acceptContext, decision);
    expect(accepted.decision).toBe('accepted');
    expect(await service.acceptSponsorship(acceptContext, decision)).toEqual(
      accepted,
    );
    expect(await service.acceptedSponsorship(appId)).toEqual(accepted);
    await service.proposeSponsorship(context(operator), appId, {
      expected_revision: '1',
      value: { ...value, maximum_transaction_fee_wei: '500' },
    });
    await expect(service.acceptedSponsorship(appId)).rejects.toMatchObject(
      denied,
    );
    await expect(
      service.acceptSponsorship(context(), decision),
    ).rejects.toMatchObject(conflicted);
    const restarted = new RuntimeConfigurationService(
      policy,
      db.onboardingStore,
      options,
      'deployment-1',
    );
    expect(
      (await restarted.readObligations(application())).resources[0],
    ).toMatchObject({
      proposed_by: 'provider',
      decision: 'pending',
      revision: '2',
    });
    await restarted.decideObligation(context(operator), appId, 'sponsorship', {
      ...decision,
      expected_revision: '2',
      decision: 'rejected',
    });
    await expect(
      restarted.acceptSponsorship(context(), {
        ...decision,
        expected_revision: '2',
        expected_decision_revision: '1',
      }),
    ).rejects.toMatchObject(denied);
    await service.proposeSponsorship(context(operator), appId, {
      expected_revision: '2',
      value,
    });
    const declined = await restarted.acceptSponsorship(context(), {
      ...decision,
      expected_revision: '3',
      decision: 'rejected',
    });
    expect(declined.decision).toBe('rejected');
    await expect(restarted.acceptedSponsorship(appId)).rejects.toMatchObject(
      denied,
    );
    await service.submitObligation(context(), 'sponsorship', {
      expected_revision: '3',
      value,
    });
    await expect(
      service.acceptSponsorship(context(), {
        ...decision,
        expected_revision: '4',
      }),
    ).rejects.toMatchObject(denied);
  });
  it('isolates declarations, retains retry results and requires provider decisions on exact revisions', async () => {
    const { service, db } = await fixture();
    const caller = context();
    const first = await service.submitObligation(caller, 'actions', {
      expected_revision: '0',
      value: actions,
    });
    const appId = runtimeApplicationId(issuer, 'first');
    expect(first).toMatchObject({
      application_id: appId,
      revision: '1',
      decision: 'pending',
    });
    expect(
      (await service.readObligations(application('second'))).resources,
    ).toEqual([]);
    await expect(
      service.readObligations(application(), appId),
    ).rejects.toMatchObject(denied);
    await expect(
      service.decideObligation(
        context({ ...application(), scopes: ['wallet:configuration:write'] }),
        appId,
        'actions',
        {
          expected_revision: '1',
          expected_decision_revision: '0',
          decision: 'accepted',
        },
      ),
    ).rejects.toMatchObject(denied);
    const decisionCaller = context(operator);
    const decision = {
      expected_revision: '1',
      expected_decision_revision: '0',
      decision: 'accepted' as const,
    };
    const accepted = await service.decideObligation(
      decisionCaller,
      appId,
      'actions',
      decision,
    );
    expect(accepted).toMatchObject({
      decision: 'accepted',
      decision_revision: '1',
    });
    expect(
      await service.submitObligation(caller, 'actions', {
        expected_revision: '0',
        value: actions,
      }),
    ).toEqual(first);
    await expect(
      service.submitObligation(context(), 'actions', {
        expected_revision: '0',
        value: actions,
      }),
    ).rejects.toMatchObject(conflicted);
    const next = await service.submitObligation(context(), 'actions', {
      expected_revision: '1',
      value: [],
    });
    expect(next).toMatchObject({
      revision: '2',
      decision: 'pending',
      decision_revision: '0',
    });
    expect(
      await service.decideObligation(
        decisionCaller,
        appId,
        'actions',
        decision,
      ),
    ).toEqual(accepted);
    await expect(
      service.decideObligation(context(operator), appId, 'actions', decision),
    ).rejects.toMatchObject(conflicted);
    const restarted = new RuntimeConfigurationService(
      policy,
      db.onboardingStore,
      options,
      'deployment-1',
    );
    expect(await restarted.readObligations(operator, appId)).toMatchObject({
      resources: [next],
      authorizes_spending: false,
      activates_execution: false,
    });
    await db.onboardingStore.transaction((state) => {
      state.deploymentBindings!['service-v1'].activeRevision = 'deployment-2';
    });
    await expect(service.readObligations(application())).rejects.toMatchObject(
      denied,
    );
  });
  it('rejects duplicate actions, ambiguous fields, credentials, wrong-chain sponsorship and oversized budgets', async () => {
    const { service } = await fixture();
    const invalidInput = { code: 'wallet_provider_input' };
    for (const value of [
      [actions[0], actions[0]],
      [{ ...actions[0], fields: [actions[0].fields[0], actions[0].fields[0]] }],
      [
        {
          ...actions[0],
          fields: [{ ...actions[0].fields[0], name: 'constructor' }],
        },
      ],
    ])
      await expect(
        service.submitObligation(context(), 'actions', {
          expected_revision: '0',
          value,
        }),
      ).rejects.toMatchObject(invalidInput);
    await expect(
      service.submitObligation(context(), 'services', {
        expected_revision: '0',
        value: [
          {
            id: 'verifier',
            kind: 'rpc-verification',
            vendor: 'example',
            credential_reference: 'https://example.test/private-token',
            billing_owner: 'application',
          },
        ],
      }),
    ).rejects.toMatchObject(invalidInput);
    const sponsorship = {
      chain_id: 'eip155:8453' as const,
      funding_agreement: 'Application pays gas',
      maximum_gas_budget_wei: '100',
      account_model: 'provider-controlled-user-safe' as const,
      maximum_execution_accounts: 10,
      asset_model: 'individual-user-wallets' as const,
    };
    await expect(
      service.submitObligation(context(), 'sponsorship', {
        expected_revision: '0',
        value: sponsorship,
      }),
    ).rejects.toMatchObject(invalidInput);
    await expect(
      service.submitObligation(context(), 'sponsorship', {
        expected_revision: '0',
        value: {
          ...sponsorship,
          chain_id: 'eip155:84532',
          maximum_gas_budget_wei: String(2n ** 256n),
        },
      }),
    ).rejects.toMatchObject(invalidInput);
  });
  it('serves protected application and provider resources without enabling financial effects', async () => {
    const { service } = await fixture();
    const server = await createServer({
      runtimeConfiguration: service,
      authenticate: async (authorization, scope) => {
        const caller =
          authorization === 'Bearer application'
            ? application()
            : authorization === 'Bearer operator'
              ? operator
              : undefined;
        if (!caller) throw new AuthenticationError(401);
        if (!caller.scopes.includes(scope)) throw new AuthenticationError(403);
        return caller;
      },
    });
    servers.push(server);
    for (const url of [
      '/operator/',
      '/v1/runtime-configuration/workspace',
      '/v1/runtime-configuration/batches',
    ]) {
      expect(
        (
          await server.inject({
            method: 'GET',
            url,
            headers: { authorization: 'Bearer operator' },
          })
        ).statusCode,
      ).toBe(404);
    }
    const listing = await server.inject({
      method: 'GET',
      url: '/v1/applications/configurations',
      headers: { authorization: 'Bearer application' },
    });
    expect(listing.statusCode).toBe(200);
    expect(listing.json().applications).toHaveLength(1);
    expect(
      (
        await server.inject({
          method: 'GET',
          url: '/v1/application/obligations',
        })
      ).statusCode,
    ).toBe(401);
    const response = await server.inject({
      method: 'PUT',
      url: '/v1/application/obligations/actions',
      headers: {
        authorization: 'Bearer application',
        'idempotency-key': randomUUID(),
      },
      payload: { expected_revision: '0', value: actions },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().value).toEqual(actions);
    const providerRead = await server.inject({
      method: 'GET',
      url:
        '/v1/provider/applications/' +
        runtimeApplicationId(issuer, 'first') +
        '/obligations',
      headers: { authorization: 'Bearer operator' },
    });
    const offered = await server.inject({
      method: 'PUT',
      url:
        '/v1/provider/applications/' +
        runtimeApplicationId(issuer, 'first') +
        '/obligations/sponsorship',
      headers: {
        authorization: 'Bearer operator',
        'idempotency-key': randomUUID(),
      },
      payload: {
        expected_revision: '0',
        value: {
          chain_id: 'eip155:84532',
          funding_agreement: 'Provider terms',
          funding_mode: 'balance',
          maximum_transaction_fee_wei: '1000',
          maximum_pending_fees_wei: '2000',
          account_model: 'provider-controlled-user-safe',
          asset_model: 'individual-user-wallets',
          maximum_execution_accounts: 10,
        },
      },
    });
    expect(offered.statusCode).toBe(200);
    expect(offered.json()).toMatchObject({
      proposed_by: 'provider',
      decision: 'pending',
    });
    const acceptance = await server.inject({
      method: 'POST',
      url: '/v1/application/obligations/sponsorship/decision',
      headers: {
        authorization: 'Bearer application',
        'idempotency-key': randomUUID(),
      },
      payload: {
        expected_revision: '1',
        expected_decision_revision: '0',
        decision: 'accepted',
      },
    });
    expect(acceptance.statusCode).toBe(200);
    expect(acceptance.json()).toMatchObject({
      proposed_by: 'provider',
      decision: 'accepted',
    });
    expect(providerRead.statusCode).toBe(200);
    expect(providerRead.json()).toMatchObject({
      authorizes_spending: false,
      activates_execution: false,
      resources: [{ kind: 'actions', decision: 'pending' }],
    });
  });
});

describe('provider blockchain connections', () => {
  it('requires operator authority, encrypts connections and preserves exact retries and revision conflicts', async () => {
    const { db } = await fixture();
    const cipher = new ApplicationCredentialCipher(
      Buffer.alloc(32, 7).toString('base64'),
    );
    const make = () =>
      new RuntimeConfigurationService(
        policy,
        db.onboardingStore,
        options,
        'deployment-1',
        undefined,
        undefined,
        cipher,
      );
    const service = make();
    const appId = runtimeApplicationId(issuer, 'first');
    const connections = [
      {
        kind: 'rpc-verification' as const,
        endpoint: 'https://first.example.test/private-first-token',
      },
      {
        kind: 'rpc-verification' as const,
        endpoint: 'https://second.example.test/private-second-token',
      },
      {
        kind: 'rpc-submission' as const,
        endpoint: 'https://first.example.test/private-submit-token',
      },
    ];
    const input = { expected_revision: '0', connections };
    await expect(
      service.configureConnections(context(), appId, input),
    ).rejects.toMatchObject(denied);
    await expect(
      service.configureConnections(
        context({ ...application(), scopes: ['wallet:configuration:write'] }),
        appId,
        input,
      ),
    ).rejects.toMatchObject(denied);
    const actor = context(operator);
    const saved = await service.configureConnections(actor, appId, input);
    expect(saved).toMatchObject({
      decision: 'accepted',
      revision: '1',
      kind: 'services',
    });
    expect(JSON.stringify(saved)).not.toContain('private-');
    expect(await make().configureConnections(actor, appId, input)).toEqual(
      saved,
    );
    expect(await make().rpcEndpoints(appId)).toEqual(
      connections.slice(0, 2).map((c) => c.endpoint),
    );
    expect(
      (await service.readCredentials(application())).map((c) => c.origin),
    ).toEqual([
      'https://first.example.test',
      'https://second.example.test',
      'https://first.example.test',
    ]);
    expect(await service.readCredentials(application('second'))).toEqual([]);
    const state = await db.onboardingStore.transaction((s) =>
      structuredClone(s),
    );
    expect(JSON.stringify(state)).not.toContain('private-first-token');
    await expect(
      service.configureConnections(context(operator), appId, input),
    ).rejects.toMatchObject(conflicted);
    await expect(
      service.configureConnections(context(operator), appId, {
        ...input,
        expected_revision: '1',
        connections: [
          connections[0],
          {
            ...connections[1],
            endpoint: 'https://first.example.test/another-key',
          },
          connections[2],
        ],
      }),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
    await expect(
      service.configureConnections(context(operator), appId, {
        ...input,
        expected_revision: '1',
        connections: [
          { ...connections[0], endpoint: 'http://localhost/private' },
          ...connections.slice(1),
        ],
      }),
    ).rejects.toMatchObject({ code: 'wallet_provider_input' });
    const changed = await service.configureConnections(
      context(operator),
      appId,
      {
        ...input,
        expected_revision: '1',
        connections: connections.map((c) => ({
          ...c,
          endpoint: c.endpoint + '-replacement',
        })),
      },
    );
    expect(changed.revision).toBe('2');
    expect(await make().rpcEndpoints(appId)).toEqual(
      connections.slice(0, 2).map((c) => c.endpoint + '-replacement'),
    );
    const server = await createServer({
      runtimeConfiguration: service,
      authenticate: async (authorization, scope) => {
        const caller =
          authorization === 'Bearer operator'
            ? operator
            : authorization === 'Bearer application'
              ? application()
              : undefined;
        if (!caller) throw new AuthenticationError(401);
        if (!caller.scopes.includes(scope)) throw new AuthenticationError(403);
        return caller;
      },
    });
    servers.push(server);
    const url = '/v1/provider/applications/' + appId + '/connections';
    const payload = { ...input, expected_revision: '2' };
    for (const [authorization, status] of [
      [undefined, 401],
      ['Bearer application', 403],
    ] as const) {
      const response = await server.inject({
        method: 'PUT',
        url,
        payload,
        headers: {
          ...(authorization ? { authorization } : {}),
          'idempotency-key': randomUUID(),
        },
      });
      expect(response.statusCode).toBe(status);
    }
    const response = await server.inject({
      method: 'PUT',
      url,
      payload,
      headers: {
        authorization: 'Bearer operator',
        'idempotency-key': randomUUID(),
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: 'services',
      decision: 'accepted',
      revision: '3',
    });
    expect(response.body).not.toContain('private-first-token');
  });
});

describe('application credentials', () => {
  it('accepts one application RPC in single mode while preserving the quorum minimum', async () => {
    const { db } = await fixture();
    const cipher = new ApplicationCredentialCipher(
      Buffer.alloc(32, 7).toString('base64'),
    );
    const make = (rpcVerification: 'single' | 'quorum') =>
      new RuntimeConfigurationService(
        policy,
        db.onboardingStore,
        { ...options, rpcVerification },
        'deployment-1',
        undefined,
        undefined,
        cipher,
      );
    const service = make('single'),
      appId = runtimeApplicationId(issuer, 'first');
    await service.writeCredential(context(), 'primary', {
      expected_revision: '0',
      endpoint: 'https://rpc.first.test/private-token',
    });
    await service.submitObligation(context(), 'services', {
      expected_revision: '0',
      value: [
        {
          id: 'primary',
          kind: 'rpc-verification',
          vendor: 'primary',
          credential_reference: 'primary',
          billing_owner: 'application',
        },
      ],
    });
    await service.decideObligation(context(operator), appId, 'services', {
      expected_revision: '1',
      expected_decision_revision: '0',
      decision: 'accepted',
    });
    expect(
      await service.withRpc(appId, async (endpoints) => endpoints),
    ).toEqual(['https://rpc.first.test/private-token']);
    await expect(make('quorum').rpcEndpoints(appId)).rejects.toThrow();
  });
  it('encrypts, isolates, fences rotations and retains idempotent receipts', async () => {
    const { db } = await fixture();
    const cipher = new ApplicationCredentialCipher(
      Buffer.alloc(32, 7).toString('base64'),
    );
    const service = new RuntimeConfigurationService(
      policy,
      db.onboardingStore,
      options,
      'deployment-1',
      undefined,
      undefined,
      cipher,
    );
    const appId = runtimeApplicationId(issuer, 'first');
    const request = context();
    const first = await service.writeCredential(request, 'primary', {
      expected_revision: '0',
      endpoint: 'https://rpc.first.test/private-token',
    });
    expect(first).toMatchObject({
      revision: '1',
      origin: 'https://rpc.first.test',
      status: 'active',
    });
    expect(await service.readCredentials(application('second'))).toEqual([]);
    expect(await service.readCredentials(operator, appId)).toEqual([first]);
    expect(
      JSON.stringify(await db.onboardingStore.transaction((s) => s)),
    ).not.toContain('private-token');
    const saved = await db.onboardingStore.transaction(
      (s) =>
        s.deploymentBindings!['service-v1'].runtimeConfiguration!.credentials![
          appId + ':primary'
        ],
    );
    expect(cipher.open(saved)).toBe('https://rpc.first.test/private-token');
    expect(() =>
      cipher.open({ ...saved, application_id: 'a'.repeat(64) }),
    ).toThrow();
    await service.writeCredential(context(), 'secondary', {
      expected_revision: '0',
      endpoint: 'https://rpc.second.test/other-token',
    });
    await service.submitObligation(context(), 'services', {
      expected_revision: '0',
      value: ['primary', 'secondary'].map((id) => ({
        id,
        kind: 'rpc-verification' as const,
        vendor: id,
        credential_reference: id,
        billing_owner: 'application' as const,
      })),
    });
    await expect(service.rpcEndpoints(appId)).rejects.toThrow();
    await service.decideObligation(context(operator), appId, 'services', {
      expected_revision: '1',
      expected_decision_revision: '0',
      decision: 'accepted',
    });
    expect(await service.rpcEndpoints(appId)).toEqual([
      'https://rpc.first.test/private-token',
      'https://rpc.second.test/other-token',
    ]);
    await service.writeCredential(context(), 'primary', {
      expected_revision: '1',
      endpoint: 'https://rpc.changed.test/new-token',
    });
    await expect(service.rpcEndpoints(appId)).rejects.toThrow();
    expect(
      await service.writeCredential(request, 'primary', {
        expected_revision: '0',
        endpoint: 'https://rpc.first.test/private-token',
      }),
    ).toEqual(first);
    await expect(
      service.writeCredential(request, 'primary', {
        expected_revision: '0',
        endpoint: 'https://rpc.first.test/different',
      }),
    ).rejects.toThrow();
    await expect(
      service.writeCredential(context(), 'primary', {
        expected_revision: '1',
        endpoint: null,
      }),
    ).rejects.toThrow();
    const revoked = await service.writeCredential(context(), 'primary', {
      expected_revision: '2',
      endpoint: null,
    });
    expect(revoked.status).toBe('revoked');
  });
  it('binds action acceptance revisions to consent snapshots and denies pending or rejected manifests', async () => {
    const { db, service } = await fixture();
    const appId = runtimeApplicationId(issuer, 'first');
    await service.update(context(operator), appId, {
      expected_revision: '0',
      policy: document(),
    });
    await service.submitObligation(context(), 'actions', {
      expected_revision: '0',
      value: [
        {
          name: 'purchase',
          description: 'Purchase',
          fields: [
            { name: 'tier', required: true, allowed_values: ['retail'] },
          ],
        },
      ],
    });
    const snapshot = () =>
      db.onboardingStore.transaction((state) =>
        currentRuntimePolicy(state, application()),
      );
    await expect(snapshot()).rejects.toThrow();
    await service.decideObligation(context(operator), appId, 'actions', {
      expected_revision: '1',
      expected_decision_revision: '0',
      decision: 'accepted',
    });
    const first = await snapshot();
    expect(first.policy.action_requirements![0].name).toBe('purchase');
    await service.decideObligation(context(operator), appId, 'actions', {
      expected_revision: '1',
      expected_decision_revision: '1',
      decision: 'rejected',
    });
    await expect(snapshot()).rejects.toThrow();
    await service.decideObligation(context(operator), appId, 'actions', {
      expected_revision: '1',
      expected_decision_revision: '2',
      decision: 'accepted',
    });
    expect((await snapshot()).policy_hash).not.toBe(first.policy_hash);
  });
});
