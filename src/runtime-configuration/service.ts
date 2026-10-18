import { randomUUID } from 'node:crypto';
import { Ajv } from 'ajv';
import { FunctionFragment, ZeroAddress, getAddress, id } from 'ethers';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import { serviceHash } from '../executor/auth.js';
import {
  application,
  deny,
  invalid,
  text,
  uuid,
} from '../onboarding/policy.js';
import type {
  OnboardingStore,
  ProviderState,
  ResolvedPolicy,
} from '../onboarding/types.js';
import { trustedHttpsUrl } from '../service/auth.js';
import { policyChangeSchema, runtimeConfigurationSchema } from './schemas.js';

export interface RuntimeConfigurationOptions {
  authorizeContracts?: boolean;
  operators: { issuer: string; clientId: string; subject: string }[];
}
export interface RuntimePolicy {
  version: '1';
  enabled: boolean;
  chain_id: 'eip155:84532';
  contracts: {
    address: string;
    code_hash: string;
    implementation?: { address: string; code_hash: string };
    methods: { signature: string; maximum_value_wei: string }[];
  }[];
  maximum_calls: number;
  maximum_native_value_wei: string;
  max_validity_seconds: number;
  claim_requirements: {
    name: string;
    allowed_values: string[];
    max_age_seconds: number;
  }[];
}
export interface RuntimePolicyChange {
  expected_revision: string;
  policy: RuntimePolicy;
}
export interface RuntimePolicyProposal {
  proposal_id: string;
  application_id: string;
  based_on_revision: string;
  policy_hash: string;
  policy: RuntimePolicy;
  created_at: string;
}
export interface RuntimePolicyRevision {
  published_by: string;
  application_id: string;
  revision: string;
  previous_revision: string;
  policy_hash: string;
  policy: RuntimePolicy;
  published_at: string;
  proposal_id?: string;
}
export interface RuntimeReview {
  mode: 'automatic' | 'manual';
  revision: string;
  approved_by: string;
}
export interface RuntimeConfigurationState {
  reviews?: Record<string, RuntimeReview>;
  reviewReceipts?: Record<string, RuntimeReview>;
  heads: Record<string, string>;
  proposals: Record<string, RuntimePolicyProposal>;
  revisions: Record<string, RuntimePolicyRevision>;
  idempotency: Record<
    string,
    { hash: string; kind: 'proposal' | 'revision' | 'review'; id: string }
  >;
}
const validator = new Ajv({ strict: true, allErrors: false });
const validChange = validator.compile(policyChangeSchema);
const validOptions = validator.compile(runtimeConfigurationSchema);
const conflict = (): never => {
  throw new WalletProviderError('wallet_attempt_conflict');
};
const empty = (): RuntimeConfigurationState => ({
  heads: {},
  proposals: {},
  revisions: {},
  idempotency: {},
});
export const runtimeApplicationId = (issuer: string, clientId: string) =>
  serviceHash(['runtime-application-v1', issuer, clientId]);
const revisionKey = (applicationId: string, revision: string) =>
  applicationId + ':' + revision;

export function validateRuntimeConfiguration(
  value: RuntimeConfigurationOptions,
  policy: ResolvedPolicy,
): void {
  if (!validOptions(value))
    throw new WalletProviderError('wallet_provider_configuration');
  const identities = new Set<string>();
  for (const operator of value.operators) {
    if (
      ![operator.issuer, operator.clientId, operator.subject].every((value) =>
        text(value),
      )
    )
      throw new WalletProviderError('wallet_provider_configuration');
    trustedHttpsUrl(operator.issuer);
    const key = serviceHash(operator);
    if (
      identities.has(key) ||
      policy.applications.some(
        (app) =>
          app.issuer === operator.issuer && app.clientId === operator.clientId,
      )
    )
      throw new WalletProviderError('wallet_provider_configuration');
    identities.add(key);
  }
}

function lexical(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
export function normalizeRuntimePolicy(
  change: RuntimePolicyChange,
): RuntimePolicyChange {
  if (
    !validChange(change) ||
    Buffer.byteLength(JSON.stringify(change)) > 24576 ||
    BigInt(change.expected_revision) >= 2n ** 64n
  )
    invalid();
  const result = structuredClone(change);
  const policy = result.policy;
  const uint = (value: string) => {
    if (BigInt(value) >= 2n ** 256n) invalid();
  };
  uint(policy.maximum_native_value_wei);
  const contracts = new Set<string>();
  for (const contract of policy.contracts) {
    try {
      contract.address = getAddress(contract.address);
    } catch {
      invalid();
    }
    if (contract.address === ZeroAddress || contracts.has(contract.address))
      invalid();
    contracts.add(contract.address);
    if (contract.implementation) {
      try {
        contract.implementation.address = getAddress(
          contract.implementation.address,
        );
      } catch {
        invalid();
      }
      if (contract.implementation.address === ZeroAddress) invalid();
    }
    const selectors = new Set<string>();
    for (const method of contract.methods) {
      try {
        const fragment = FunctionFragment.from(method.signature);
        const canonical = fragment.format('sighash');
        if (canonical !== method.signature) invalid();
        const selector = id(canonical).slice(0, 10);
        if (selectors.has(selector)) invalid();
        selectors.add(selector);
      } catch {
        invalid();
      }
      uint(method.maximum_value_wei);
      if (
        BigInt(method.maximum_value_wei) >
        BigInt(policy.maximum_native_value_wei)
      )
        invalid();
    }
    contract.methods.sort((a, b) => lexical(a.signature, b.signature));
  }
  policy.contracts.sort((a, b) => lexical(a.address, b.address));
  const claims = new Set<string>();
  for (const claim of policy.claim_requirements) {
    if (
      ['constructor', 'prototype'].includes(claim.name) ||
      claims.has(claim.name) ||
      claim.allowed_values.some((value) => !text(value, 128) || !value.trim())
    )
      invalid();
    claims.add(claim.name);
    claim.allowed_values.sort();
  }
  policy.claim_requirements.sort((a, b) => lexical(a.name, b.name));
  return result;
}

/** Durable configuration control plane. Published records do not authorize wallet effects. */
export class RuntimeConfigurationService {
  private readonly options: RuntimeConfigurationOptions;
  constructor(
    readonly onboardingPolicy: ResolvedPolicy,
    private readonly store: OnboardingStore,
    options: RuntimeConfigurationOptions,
    private readonly deploymentRevision: string,
    private readonly transportRevision?: string,
  ) {
    if (!text(deploymentRevision))
      throw new WalletProviderError('wallet_provider_configuration');
    validateRuntimeConfiguration(options, onboardingPolicy);
    this.options = structuredClone(options);
  }
  private application(principal: VerifiedPrincipal) {
    const app = application(this.onboardingPolicy, principal);
    return runtimeApplicationId(app.issuer, app.clientId);
  }
  assertOperator(principal: VerifiedPrincipal) {
    if (!principal.scopes.includes('wallet:configuration:write')) deny();
    if (
      !this.options.operators.some(
        (operator) =>
          operator.issuer === principal.issuer &&
          operator.clientId === principal.clientId &&
          operator.subject === principal.subject,
      )
    )
      deny();
  }
  assertOperatorState(principal: VerifiedPrincipal, state: ProviderState) {
    this.assertOperator(principal);
    const binding = state.deploymentBindings?.['service-v1'];
    if (
      binding?.activeRevision !== this.deploymentRevision ||
      binding.transportRevision !== this.transportRevision
    )
      deny();
  }
  private target(applicationId: string) {
    if (
      !this.onboardingPolicy.applications.some(
        (app) =>
          app.enabled !== false &&
          runtimeApplicationId(app.issuer, app.clientId) === applicationId,
      )
    )
      deny();
  }
  private transaction<T>(
    operation: (registry: RuntimeConfigurationState, state: ProviderState) => T,
  ) {
    return this.store.transaction((state) => {
      const binding = state.deploymentBindings?.['service-v1'];
      if (
        binding?.activeRevision !== this.deploymentRevision ||
        binding.transportRevision !== this.transportRevision
      )
        deny();
      return operation((binding.runtimeConfiguration ??= empty()), state);
    });
  }
  private key(
    context: AuthorityContext,
    scope: string,
    operation: string,
    resource: string,
  ) {
    if (
      !context.principal.scopes.includes(scope) ||
      !uuid.test(context.idempotencyKey)
    )
      deny();
    return serviceHash([
      context.principal.issuer,
      context.principal.clientId,
      context.principal.subject,
      operation,
      resource,
      context.idempotencyKey,
    ]);
  }
  private receipt(
    registry: RuntimeConfigurationState,
    key: string,
    hash: string,
  ) {
    const previous = registry.idempotency[key];
    if (!previous) return undefined;
    if (previous.hash !== hash) conflict();
    return previous.kind === 'proposal'
      ? (registry.proposals[previous.id] ?? conflict())
      : (registry.revisions[previous.id] ?? conflict());
  }
  private current(
    registry: RuntimeConfigurationState,
    applicationId: string,
    expected: string,
  ) {
    if ((registry.heads[applicationId] ?? '0') !== expected) conflict();
  }
  private publishRevision(
    registry: RuntimeConfigurationState,
    state: ProviderState,
    applicationId: string,
    change: RuntimePolicyChange,
    key: string,
    hash: string,
    actor: VerifiedPrincipal | string,
    proposalId?: string,
  ) {
    this.current(registry, applicationId, change.expected_revision);
    const revision = String(BigInt(change.expected_revision) + 1n);
    if (BigInt(revision) > 1024n) conflict();
    const record: RuntimePolicyRevision = {
      published_by:
        typeof actor === 'string'
          ? actor
          : serviceHash([actor.issuer, actor.clientId, actor.subject]),
      application_id: applicationId,
      revision,
      previous_revision: change.expected_revision,
      policy_hash: serviceHash(change.policy),
      policy: change.policy,
      published_at: new Date().toISOString(),
      ...(proposalId ? { proposal_id: proposalId } : {}),
    };
    const id = revisionKey(applicationId, revision);
    registry.revisions[id] = record;
    registry.heads[applicationId] = revision;
    registry.idempotency[key] = { hash, kind: 'revision', id };
    state.audit.push({
      at: Date.now(),
      event: 'runtime_policy_published',
      resource: applicationId,
      revision,
    });
    return record;
  }
  async propose(context: AuthorityContext, input: RuntimePolicyChange) {
    context = structuredClone(context);
    const applicationId = this.application(context.principal);
    const key = this.key(
      context,
      'wallet:configuration:propose',
      'propose',
      applicationId,
    );
    const change = normalizeRuntimePolicy(input);
    const hash = serviceHash(change);
    return this.transaction((registry, state) => {
      const previous = this.receipt(registry, key, hash);
      if (previous) return previous as RuntimePolicyProposal;
      this.current(registry, applicationId, change.expected_revision);
      if (
        Object.values(registry.proposals).filter(
          (record) => record.application_id === applicationId,
        ).length >= 256
      )
        conflict();
      const record: RuntimePolicyProposal = {
        proposal_id: randomUUID(),
        application_id: applicationId,
        based_on_revision: change.expected_revision,
        policy: change.policy,
        policy_hash: serviceHash(change.policy),
        created_at: new Date().toISOString(),
      };
      registry.proposals[record.proposal_id] = record;
      registry.idempotency[key] = {
        hash,
        kind: 'proposal',
        id: record.proposal_id,
      };
      state.audit.push({
        at: Date.now(),
        event: 'runtime_policy_proposed',
        resource: record.proposal_id,
        revision: change.expected_revision,
      });
      const review = registry.reviews?.[applicationId];
      const current =
        registry.revisions[
          revisionKey(applicationId, change.expected_revision)
        ];
      // Automatic acceptance delegates contract registration, never provider terms.
      if (review?.mode === 'automatic' && current) {
        const { contracts: _old, ...terms } = current.policy;
        const { contracts: _new, ...requestedTerms } = change.policy;
        if (
          current.policy.enabled &&
          serviceHash(terms) === serviceHash(requestedTerms)
        ) {
          this.publishRevision(
            registry,
            state,
            applicationId,
            change,
            serviceHash(['automatic-publication', record.proposal_id]),
            hash,
            review.approved_by,
            record.proposal_id,
          );
          state.audit.push({
            at: Date.now(),
            event: 'runtime_contracts_auto_accepted',
            resource: record.proposal_id,
            revision: review.revision,
          });
        }
      }
      return record;
    });
  }
  async workspace(principal: VerifiedPrincipal, applicationId?: string) {
    let provider = false;
    if (principal.scopes.includes('wallet:configuration:write')) {
      this.assertOperator(principal);
      provider = true;
    }
    const own = provider ? undefined : this.application(principal);
    if (!provider && !principal.scopes.includes('wallet:configuration:read'))
      deny();
    if (applicationId) {
      this.target(applicationId);
      if (own && applicationId !== own) deny();
    }
    return this.transaction((registry) => ({
      role: provider ? ('provider' as const) : ('application' as const),
      applications: this.onboardingPolicy.applications
        .filter((app) => app.enabled !== false)
        .map((app) => ({
          application_id: runtimeApplicationId(app.issuer, app.clientId),
          name: app.name,
        }))
        .filter((app) => !own || app.application_id === own)
        .map((app) => ({
          ...app,
          active_revision: registry.heads[app.application_id] ?? '0',
          review: registry.reviews?.[app.application_id],
          publications:
            applicationId === app.application_id
              ? Object.values(registry.revisions)
                  .filter(
                    (record) => record.application_id === app.application_id,
                  )
                  .slice(-20)
              : [],
          publication:
            applicationId === app.application_id
              ? registry.revisions[
                  revisionKey(
                    app.application_id,
                    registry.heads[app.application_id] ?? '0',
                  )
                ]
              : undefined,
          proposals_truncated:
            applicationId === app.application_id &&
            Object.values(registry.proposals).filter(
              (p) => p.application_id === app.application_id,
            ).length > 20,
          proposals: Object.values(registry.proposals)
            .filter(
              (p) =>
                p.application_id === applicationId &&
                p.application_id === app.application_id,
            )
            .slice(-20)
            .map((proposal) => ({
              ...proposal,
              published_revision: Object.values(registry.revisions).find(
                (r) => r.proposal_id === proposal.proposal_id,
              )?.revision,
            })),
        })),
    }));
  }
  async setReview(
    context: AuthorityContext,
    applicationId: string,
    input: {
      expected_revision: string;
      expected_review_revision: string;
      mode: 'automatic' | 'manual';
    },
  ) {
    context = structuredClone(context);
    input = structuredClone(input);
    this.assertOperator(context.principal);
    this.target(applicationId);
    if (
      !input ||
      Object.keys(input).some(
        (k) =>
          !['expected_revision', 'expected_review_revision', 'mode'].includes(
            k,
          ),
      ) ||
      !/^(0|[1-9][0-9]{0,19})$/.test(input.expected_revision) ||
      !/^(0|[1-9][0-9]{0,19})$/.test(input.expected_review_revision) ||
      !['automatic', 'manual'].includes(input.mode)
    )
      invalid();
    const key = this.key(
      context,
      'wallet:configuration:write',
      'review',
      applicationId,
    );
    return this.transaction((registry, state) => {
      // Review decisions share the policy revision fence so publication and mode changes cannot race.
      const previous = registry.idempotency[key];
      const hash = serviceHash(input);
      if (previous) {
        if (previous.hash !== hash) conflict();
        return registry.reviewReceipts?.[key] ?? conflict();
      }
      this.current(registry, applicationId, input.expected_revision);
      if (
        !registry.revisions[revisionKey(applicationId, input.expected_revision)]
      )
        conflict();
      if (
        Object.values(registry.idempotency).filter(
          (item) => item.kind === 'review' && item.id === applicationId,
        ).length >= 1024
      )
        conflict();
      const reviews = (registry.reviews ??= {});
      if (
        (reviews[applicationId]?.revision ?? '0') !==
        input.expected_review_revision
      )
        conflict();
      const revision = String(BigInt(input.expected_review_revision) + 1n);
      reviews[applicationId] = {
        mode: input.mode,
        revision,
        approved_by: serviceHash([
          context.principal.issuer,
          context.principal.clientId,
          context.principal.subject,
        ]),
      };
      // A separate receipt preserves the exact decision on retries, including after later changes.
      const review = reviews[applicationId];
      (registry.reviewReceipts ??= {})[key] = structuredClone(review);
      registry.idempotency[key] = { hash, kind: 'review', id: applicationId };
      state.audit.push({
        at: Date.now(),
        event: 'runtime_review_mode_changed',
        resource: applicationId,
        revision,
      });
      return review;
    });
  }
  async read(principal: VerifiedPrincipal, revision?: string) {
    const applicationId = this.application(principal);
    if (!principal.scopes.includes('wallet:configuration:read')) deny();
    if (revision !== undefined && !/^[1-9][0-9]{0,19}$/.test(revision))
      invalid();
    return this.readApplicationRevision(applicationId, revision);
  }
  async readApplication(principal: VerifiedPrincipal, applicationId: string) {
    this.assertOperator(principal);
    if (!principal.scopes.includes('wallet:configuration:write')) deny();
    this.target(applicationId);
    return this.readApplicationRevision(applicationId);
  }
  private readApplicationRevision(applicationId: string, revision?: string) {
    return this.transaction((registry) => {
      const selected = revision ?? registry.heads[applicationId] ?? '0';
      const record = registry.revisions[revisionKey(applicationId, selected)];
      if (revision && !record) deny();
      return {
        application_id: applicationId,
        active_revision: registry.heads[applicationId] ?? '0',
        revision: selected,
        ...(record ? { publication: record } : {}),
        authorizes_spending: false as const,
      };
    });
  }
  async proposal(principal: VerifiedPrincipal, proposalId: string) {
    if (!uuid.test(proposalId)) invalid();
    const isOperator =
      principal.scopes.includes('wallet:configuration:write') &&
      this.options.operators.some(
        (operator) =>
          operator.issuer === principal.issuer &&
          operator.clientId === principal.clientId &&
          operator.subject === principal.subject,
      );
    if (!isOperator && !principal.scopes.includes('wallet:configuration:read'))
      deny();
    const applicationId = isOperator ? undefined : this.application(principal);
    return this.transaction((registry) => {
      const record = registry.proposals[proposalId];
      if (!record || (applicationId && record.application_id !== applicationId))
        deny();
      this.target(record.application_id);
      return record;
    });
  }
  async publish(
    context: AuthorityContext,
    proposalId: string,
    expectedRevision: string,
  ) {
    context = structuredClone(context);
    this.assertOperator(context.principal);
    if (
      !uuid.test(proposalId) ||
      !/^(0|[1-9][0-9]{0,19})$/.test(expectedRevision)
    )
      invalid();
    const key = this.key(
      context,
      'wallet:configuration:write',
      'publish',
      proposalId,
    );
    const hash = serviceHash([proposalId, expectedRevision]);
    return this.transaction((registry, state) => {
      const proposal = registry.proposals[proposalId];
      if (!proposal) deny();
      this.target(proposal.application_id);
      const previous = this.receipt(registry, key, hash);
      if (previous) return previous as RuntimePolicyRevision;
      if (proposal.based_on_revision !== expectedRevision) conflict();
      return this.publishRevision(
        registry,
        state,
        proposal.application_id,
        { expected_revision: expectedRevision, policy: proposal.policy },
        key,
        hash,
        context.principal,
        proposalId,
      );
    });
  }
  async update(
    context: AuthorityContext,
    applicationId: string,
    input: RuntimePolicyChange,
  ) {
    context = structuredClone(context);
    this.assertOperator(context.principal);
    this.target(applicationId);
    const key = this.key(
      context,
      'wallet:configuration:write',
      'update',
      applicationId,
    );
    const change = normalizeRuntimePolicy(input),
      hash = serviceHash(change);
    return this.transaction((registry, state) => {
      const previous = this.receipt(registry, key, hash);
      if (previous) return previous as RuntimePolicyRevision;
      return this.publishRevision(
        registry,
        state,
        applicationId,
        change,
        key,
        hash,
        context.principal,
      );
    });
  }
}
