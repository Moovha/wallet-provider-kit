import { etherscanEndpoint } from '../execution/etherscan.js';
import { RpcEndpointPool } from '../execution/rpc-pool.js';
import {
  ApplicationCredentialCipher,
  credentialMetadata,
  credentialOrigin,
  type ApplicationCredential,
  type CredentialMetadata,
} from './credentials.js';
import {
  normalizeObligation,
  type ApplicationObligations,
  type ObligationKind,
  type ObligationRegistry,
  type ObligationRecord,
} from './obligations.js';
import {
  providerNetwork,
  type ProviderNetwork,
  type ProviderChainId,
} from '../networks.js';
import { randomUUID } from 'node:crypto';
import { Ajv } from 'ajv';
import { FunctionFragment, ZeroAddress, getAddress, id } from 'ethers';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import { canonicalHash } from '../domain/canonical.js';
import {
  application,
  fingerprint,
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
  rpcVerification?: 'single' | 'quorum';
  authorizeContracts?: boolean;
  credentialKey?: { env: string };
  operators: { issuer: string; clientId: string; subject: string }[];
}
export interface RuntimePolicy {
  action_requirements?: ApplicationObligations['actions'];
  application_resources_hash?: string;
  version: '1';
  native_transfers?: {
    address: string;
    code_hash: string;
    maximum_value_wei: string;
  }[];
  call_adapters?: import('../execution/operation-adapters.js').OperationAdapters;
  enabled: boolean;
  chain_id: ProviderChainId;
  contracts: {
    address: string;
    code_hash: string;
    implementation?: { address: string; code_hash: string };
    methods: {
      signature: string;
      maximum_value_wei: string;
      user_address_parameters?: number[];
    }[];
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
  safeWalletAccounts?: Record<
    string,
    import('../sponsorship/safe-wallet.js').SafeWalletAccount
  >;
  safeWalletInfrastructure?: Record<
    string,
    import('../sponsorship/safe-wallet.js').SafeWalletInfrastructure
  >;

  obligations?: ObligationRegistry;
  credentials?: Record<string, ApplicationCredential>;
  credentialReceipts?: Record<
    string,
    { hash: string; metadata: CredentialMetadata }
  >;
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
  canonicalHash(['runtime-application-v1', issuer, clientId]);
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
    const key = canonicalHash(operator);
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
  if (policy.action_requirements)
    policy.action_requirements = normalizeObligation(
      'actions',
      policy.action_requirements,
    );
  const uint = (value: string) => {
    if (BigInt(value) >= 2n ** 256n) invalid();
  };
  uint(policy.maximum_native_value_wei);
  const recipients = new Set<string>();
  for (const recipient of policy.native_transfers ?? []) {
    try {
      recipient.address = getAddress(recipient.address);
    } catch {
      invalid();
    }
    if (
      recipient.address === ZeroAddress ||
      recipients.has(recipient.address) ||
      BigInt(recipient.maximum_value_wei) === 0n ||
      BigInt(recipient.maximum_value_wei) >
        BigInt(policy.maximum_native_value_wei)
    )
      invalid();
    recipients.add(recipient.address);
  }
  policy.native_transfers?.sort((a, b) => lexical(a.address, b.address));
  const normalizePin = (pin: {
    address: string;
    codeHash: string;
    implementation?: { address: string; codeHash: string };
  }) => {
    try {
      pin.address = getAddress(pin.address);
      if (pin.implementation)
        pin.implementation.address = getAddress(pin.implementation.address);
    } catch {
      invalid();
    }
  };
  for (const transfer of policy.call_adapters?.tokenTransfers ?? []) {
    normalizePin(transfer.token);
    try {
      transfer.recipients = transfer.recipients.map(getAddress).sort();
    } catch {
      invalid();
    }
    uint(transfer.maximumAmount);
    if (transfer.lifetimeAmount !== undefined) {
      uint(transfer.lifetimeAmount);
      if (BigInt(transfer.lifetimeAmount) === 0n) invalid();
    }
  }
  for (const swap of policy.call_adapters?.swaps ?? []) {
    [swap.router, swap.tokenIn, swap.tokenOut].forEach(normalizePin);
    uint(swap.maximumInput);
  }
  for (const vault of policy.call_adapters?.vaults ?? []) {
    [vault.router, vault.vault, vault.asset].forEach(normalizePin);
    uint(vault.maximumAssets);
  }
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
        if (method.user_address_parameters) {
          if (
            method.user_address_parameters.some(
              (index) => fragment.inputs[index]?.type !== 'address',
            )
          )
            invalid();
          method.user_address_parameters.sort((a, b) => a - b);
        }
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
  private readonly rpcPools = new Map<
    string,
    { hash: string; pool: RpcEndpointPool; transport: typeof fetch }
  >();
  get rpcVerification() {
    return this.options.rpcVerification ?? 'single';
  }
  async withRpc<T>(
    applicationId: string,
    work: (endpoints: string[]) => Promise<T>,
    transport: typeof fetch = fetch,
  ): Promise<T> {
    const endpoints = await this.rpcEndpoints(applicationId);
    if (this.rpcVerification === 'quorum') return work(endpoints);
    const hash = fingerprint(endpoints);
    let cached = this.rpcPools.get(applicationId);
    if (cached?.hash !== hash || cached.transport !== transport) {
      cached = {
        hash,
        pool: new RpcEndpointPool(endpoints, transport),
        transport,
      };
      this.rpcPools.set(applicationId, cached);
    }
    return cached!.pool.run((endpoint) => work([endpoint]));
  }
  async withSubmissionRpc<T>(
    applicationId: string,
    work: (endpoint: string, unavailable: () => void) => Promise<T>,
    transport: typeof fetch = fetch,
  ): Promise<T> {
    const endpoints = await this.rpcEndpoints(applicationId, 'rpc-submission');
    const hash = fingerprint(endpoints),
      key = applicationId + ':submission';
    let cached = this.rpcPools.get(key);
    if (cached?.hash !== hash || cached.transport !== transport) {
      cached = {
        hash,
        pool: new RpcEndpointPool(endpoints, transport),
        transport,
      };
      this.rpcPools.set(key, cached);
    }
    const pool = cached!.pool;
    return pool.run((endpoint) =>
      work(endpoint, () => pool.cooldown(endpoint)),
    );
  }
  constructor(
    readonly onboardingPolicy: ResolvedPolicy,
    private readonly store: OnboardingStore,
    options: RuntimeConfigurationOptions,
    private readonly deploymentRevision: string,
    private readonly transportRevision?: string,
    private readonly network?: ProviderNetwork,
    private readonly credentialCipher?: ApplicationCredentialCipher,
    private readonly currentOperator?: (principal: VerifiedPrincipal) => void,
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
    if (this.currentOperator) {
      this.currentOperator(principal);
      return;
    }
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
  /** Initialize the current deployment's empty registry without publishing policy or granting access. */
  async initialize() {
    await this.transaction(() => undefined);
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
    return canonicalHash([
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
          : canonicalHash([actor.issuer, actor.clientId, actor.subject]),
      application_id: applicationId,
      revision,
      previous_revision: change.expected_revision,
      policy_hash: canonicalHash(change.policy),
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
  async readCredentials(principal: VerifiedPrincipal, applicationId?: string) {
    const selected = applicationId ?? this.application(principal);
    if (applicationId) {
      this.assertOperator(principal);
      this.target(selected);
    } else if (!principal.scopes.includes('wallet:configuration:read')) deny();
    return this.transaction((registry) =>
      Object.values(registry.credentials ?? {})
        .filter((entry) => entry.application_id === selected)
        .map(credentialMetadata),
    );
  }
  async writeCredential(
    context: AuthorityContext,
    reference: string,
    input: { expected_revision: string; endpoint: string | null },
  ) {
    context = structuredClone(context);
    input = structuredClone(input);
    const applicationId = this.application(context.principal);
    const key = this.key(
      context,
      'wallet:configuration:propose',
      'credential-' + reference,
      applicationId,
    );
    if (!this.credentialCipher) deny();
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(reference) ||
      !input ||
      Object.keys(input).sort().join(',') !== 'endpoint,expected_revision' ||
      !/^(0|[1-9][0-9]{0,3})$/.test(input.expected_revision)
    )
      invalid();
    const origin =
      input.endpoint === null ? '' : credentialOrigin(input.endpoint);
    const hash = this.credentialCipher.digest([
      applicationId,
      reference,
      input,
    ]);
    return this.transaction((registry) => {
      const receipts = (registry.credentialReceipts ??= {});
      if (receipts[key]) {
        if (receipts[key].hash !== hash) conflict();
        return structuredClone(receipts[key].metadata);
      }
      const records = (registry.credentials ??= {}),
        id = applicationId + ':' + reference;
      const previous = records[id];
      if ((previous?.revision ?? '0') !== input.expected_revision) conflict();
      if (
        Number(input.expected_revision) >= 256 ||
        (!previous &&
          Object.values(records).filter(
            (r) => r.application_id === applicationId,
          ).length >= 32)
      )
        deny();
      const metadata: CredentialMetadata = {
        application_id: applicationId,
        reference,
        revision: String(Number(input.expected_revision) + 1),
        origin,
        status: input.endpoint === null ? 'revoked' : 'active',
      };
      records[id] = this.credentialCipher!.seal(metadata, input.endpoint ?? '');
      const services =
        registry.obligations?.records[applicationId + ':services'];
      if (
        services &&
        (services.value as ApplicationObligations['services']).some(
          (s) => s.credential_reference === reference,
        )
      ) {
        services.decision = 'pending';
        services.decision_revision = String(
          Number(services.decision_revision) + 1,
        );
        delete services.decided_at;
      }
      receipts[key] = { hash, metadata };
      return structuredClone(metadata);
    });
  }
  /** Resolve only accepted resources belonging to the authenticated application's identity. */
  async rpcEndpoints(
    applicationId: string,
    kind:
      | 'rpc-verification'
      | 'rpc-submission'
      | 'rpc-observation' = 'rpc-verification',
  ): Promise<string[]> {
    this.target(applicationId);
    return this.transaction((registry) => {
      if (!this.credentialCipher) deny();
      const services =
        registry.obligations?.records[applicationId + ':services'];
      if (services?.decision !== 'accepted') deny();
      const endpoints = (services.value as ApplicationObligations['services'])
        .filter((s) => s.kind === kind)
        .map((s) => {
          const record =
            registry.credentials?.[
              applicationId + ':' + s.credential_reference
            ];
          if (
            !record ||
            record.application_id !== applicationId ||
            record.status !== 'active'
          )
            deny();
          return this.credentialCipher!.open(record);
        });
      if (
        endpoints.length <
          (kind === 'rpc-verification' && this.rpcVerification === 'quorum'
            ? 2
            : kind === 'rpc-observation'
              ? 0
              : 1) ||
        endpoints.length > 3 ||
        (kind !== 'rpc-observation' &&
          endpoints.some((e) => etherscanEndpoint(e))) ||
        new Set(endpoints.map((e) => new URL(e).origin)).size !==
          endpoints.length
      )
        deny();
      return endpoints;
    });
  }
  async acceptedSponsorship(applicationId: string) {
    this.target(applicationId);
    return this.transaction((registry) => {
      const record =
        registry.obligations?.records[applicationId + ':sponsorship'];
      if (record?.decision !== 'accepted') deny();
      return structuredClone(record);
    });
  }
  async readObligations(principal: VerifiedPrincipal, applicationId?: string) {
    principal = structuredClone(principal);
    if (applicationId !== undefined) {
      this.assertOperator(principal);
      this.target(applicationId);
    } else {
      if (!principal.scopes.includes('wallet:configuration:read')) deny();
      applicationId = this.application(principal);
    }
    const selected = applicationId;
    return this.transaction((registry) => ({
      application_id: selected,
      resources: Object.values(registry.obligations?.records ?? {})
        .filter((record) => record.application_id === selected)
        .map((record) => structuredClone(record)),
      authorizes_spending: false as const,
      activates_execution: false as const,
    }));
  }
  async proposeSponsorship(
    context: AuthorityContext,
    applicationId: string,
    input: {
      expected_revision: string;
      value: ApplicationObligations['sponsorship'];
    },
  ) {
    this.assertOperator(context.principal);
    this.target(applicationId);
    return this.writeObligation(context, 'sponsorship', input, applicationId);
  }
  async submitObligation<K extends ObligationKind>(
    context: AuthorityContext,
    kind: K,
    input: { expected_revision: string; value: ApplicationObligations[K] },
  ): Promise<ObligationRecord> {
    return this.writeObligation(context, kind, input);
  }
  private async writeObligation<K extends ObligationKind>(
    context: AuthorityContext,
    kind: K,
    input: { expected_revision: string; value: ApplicationObligations[K] },
    providerApplicationId?: string,
  ): Promise<ObligationRecord> {
    context = structuredClone(context);
    const applicationId =
      providerApplicationId ?? this.application(context.principal);
    const key = this.key(
      context,
      providerApplicationId
        ? 'wallet:configuration:write'
        : 'wallet:configuration:propose',
      (providerApplicationId ? 'provider-' : '') + 'obligation-' + kind,
      applicationId,
    );
    if (
      !input ||
      Object.keys(input).sort().join(',') !== 'expected_revision,value' ||
      !/^(0|[1-9][0-9]{0,3})$/.test(input.expected_revision)
    )
      invalid();
    const expected = input.expected_revision;
    const value = normalizeObligation(kind, input.value);
    if (
      kind === 'sponsorship' &&
      (value as ApplicationObligations['sponsorship']).chain_id !==
        providerNetwork(this.network).caip
    )
      invalid();
    const hash = canonicalHash([expected, value]);
    return this.transaction((registry) => {
      const obligations = (registry.obligations ??= {
        records: {},
        receipts: {},
      });
      const previous = obligations.receipts[key];
      if (previous) {
        if (previous.hash !== hash) conflict();
        return structuredClone(previous.record);
      }
      const id = applicationId + ':' + kind;
      const current = obligations.records[id];
      if ((current?.revision ?? '0') !== expected || BigInt(expected) >= 256n)
        conflict();
      const record: ObligationRecord = {
        application_id: applicationId,
        kind,
        ...(providerApplicationId ? { proposed_by: 'provider' as const } : {}),
        revision: String(BigInt(expected) + 1n),
        value,
        submitted_at: new Date().toISOString(),
        decision: 'pending',
        decision_revision: '0',
      };
      obligations.records[id] = record;
      obligations.receipts[key] = { hash, record: structuredClone(record) };
      return structuredClone(record);
    });
  }
  async acceptSponsorship(
    context: AuthorityContext,
    input: {
      expected_revision: string;
      expected_decision_revision: string;
      decision: 'accepted' | 'rejected';
    },
  ) {
    const applicationId = this.application(context.principal);
    return this.recordObligationDecision(
      context,
      applicationId,
      'sponsorship',
      input,
      true,
    );
  }
  async decideObligation(
    context: AuthorityContext,
    applicationId: string,
    kind: ObligationKind,
    input: {
      expected_revision: string;
      expected_decision_revision: string;
      decision: 'accepted' | 'rejected';
    },
  ): Promise<ObligationRecord> {
    return this.recordObligationDecision(context, applicationId, kind, input);
  }
  private async recordObligationDecision(
    context: AuthorityContext,
    applicationId: string,
    kind: ObligationKind,
    input: {
      expected_revision: string;
      expected_decision_revision: string;
      decision: 'accepted' | 'rejected';
    },
    applicationDecision = false,
  ): Promise<ObligationRecord> {
    context = structuredClone(context);
    input = structuredClone(input);
    if (!applicationDecision) this.assertOperator(context.principal);
    this.target(applicationId);
    if (
      !['actions', 'services', 'sponsorship'].includes(kind) ||
      !input ||
      Object.keys(input).sort().join(',') !==
        'decision,expected_decision_revision,expected_revision' ||
      !['accepted', 'rejected'].includes(input.decision) ||
      !/^[1-9][0-9]{0,3}$/.test(input.expected_revision) ||
      !/^(0|[1-9][0-9]{0,3})$/.test(input.expected_decision_revision)
    )
      invalid();
    const key = this.key(
      context,
      applicationDecision
        ? 'wallet:configuration:propose'
        : 'wallet:configuration:write',
      (applicationDecision ? 'application-' : '') + 'decide-obligation-' + kind,
      applicationId,
    );
    const hash = canonicalHash(input);
    return this.transaction((registry) => {
      const obligations = registry.obligations ?? conflict();
      const previous = obligations?.receipts[key];
      if (previous) {
        if (previous.hash !== hash) conflict();
        return structuredClone(previous.record);
      }
      const record =
        obligations.records[applicationId + ':' + kind] ?? conflict();
      if (
        !obligations ||
        !record ||
        record.revision !== input.expected_revision ||
        record.decision_revision !== input.expected_decision_revision ||
        BigInt(record.decision_revision) >= 16n
      )
        conflict();
      if (applicationDecision) {
        if (
          kind !== 'sponsorship' ||
          record.proposed_by !== 'provider' ||
          record.decision_by === 'provider'
        )
          deny();
      } else if (
        record.proposed_by === 'provider' &&
        input.decision === 'accepted'
      )
        deny();
      record.decision = input.decision;
      record.decision_by = applicationDecision ? 'application' : 'provider';
      record.decision_revision = String(BigInt(record.decision_revision) + 1n);
      record.decided_at = new Date().toISOString();
      obligations.receipts[key] = { hash, record: structuredClone(record) };
      return structuredClone(record);
    });
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
    if (change.policy.chain_id !== providerNetwork(this.network).caip)
      invalid();
    const hash = canonicalHash(change);
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
        policy_hash: canonicalHash(change.policy),
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
          canonicalHash(terms) === canonicalHash(requestedTerms)
        ) {
          this.publishRevision(
            registry,
            state,
            applicationId,
            change,
            canonicalHash(['automatic-publication', record.proposal_id]),
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
  async listApplications(principal: VerifiedPrincipal, applicationId?: string) {
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
      network: providerNetwork(this.network).name,
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
      const hash = canonicalHash(input);
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
        approved_by: canonicalHash([
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
    let isOperator = false;
    if (principal.scopes.includes('wallet:configuration:write')) {
      try {
        this.assertOperator(principal);
        isOperator = true;
      } catch (error) {
        if (
          !(error instanceof WalletProviderError) ||
          error.code !== 'wallet_authorization_denied'
        )
          throw error;
      }
    }
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
    const hash = canonicalHash([proposalId, expectedRevision]);
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
    const change = normalizeRuntimePolicy(input);
    if (change.policy.chain_id !== providerNetwork(this.network).caip)
      invalid();
    const hash = canonicalHash(change);
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
