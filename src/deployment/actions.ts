import { runtimeApplicationId } from '../runtime-configuration/service.js';
import {
  providerNetwork,
  type ProviderNetwork,
  type ProviderChainId,
} from '../networks.js';
import {
  adapterAllowanceCharges,
  prepareAdapterAllowances,
} from './adapter-allowances.js';
import { adapterInput } from '../execution/operation-adapters.js';
import {
  currentRuntimePolicy,
  runtimeCallPolicy,
  validateRuntimeCalls,
  validateSafeAddressParameters,
  type RuntimePolicySnapshot,
} from '../runtime-configuration/authority.js';
import { canonicalHash } from '../domain/canonical.js';
import {
  buildApprovedCallIntent,
  buildApprovedCallAction,
  validateApprovedCallAction,
  type ApprovedCallInput,
  type ApprovedCallIntent,
} from '../execution/approved-calls.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { ProviderState } from '../onboarding/types.js';
import { getAddress, TypedDataEncoder } from 'ethers';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type { TypedDataAction } from '../domain/signing.js';
import { WalletProviderError } from '../domain/signing.js';
import { deny, fingerprint, invalid, uuid } from '../onboarding/policy.js';
import type { OnboardingService } from '../onboarding/service.js';
import type {
  FinancialApproval,
  FinancialAuthorization,
  ProviderDatabase,
} from '../storage/index.js';
export interface ApprovedCallsRecord {
  nonceDomain?: 'safe-4337-v07';
  runtimePolicy?: RuntimePolicySnapshot;
  intent?: import('../execution/approved-calls.js').ApprovedCallIntent;
  nonceReleased?: boolean;
  approval: FinancialApproval & { action: TypedDataAction };
  revision: string;
  status: 'authorizing' | 'authorized' | 'denied';
}
export function amount(value: unknown): bigint {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]{0,77}$/.test(value) ||
    BigInt(value) >= 2n ** 256n
  )
    invalid();
  return BigInt(value);
}
function sameCaller(
  a: FinancialApproval['caller'],
  b: FinancialApproval['caller'],
) {
  return (
    a.issuer === b.issuer &&
    a.subject === b.subject &&
    a.clientId === b.clientId
  );
}
/** Construct exact policy-approved transfers and contract actions under explicit owner delegation. HTTP never supplies signing payloads or authority records. */
export class SupportedActions {
  private readonly validatedPlans = new Set<string>();
  readonly revision: string;
  readonly network: ReturnType<typeof providerNetwork>;
  private readonly callConfiguration?: import('../execution/approved-calls.js').ApprovedCallsConfiguration;
  constructor(
    readonly onboarding: OnboardingService,
    private readonly database: ProviderDatabase,
    revision?: string,
    callConfiguration?: import('../execution/approved-calls.js').ApprovedCallsConfiguration,
    network?: ProviderNetwork,
  ) {
    this.network = providerNetwork(network);
    this.callConfiguration = callConfiguration
      ? structuredClone(callConfiguration)
      : undefined;
    this.revision =
      revision ??
      fingerprint([
        onboarding.policy.revision,
        callConfiguration ?? null,
        ...(this.network.testnet ? [] : [this.network.name]),
      ]);
  }
  callConsentTerms(snapshot?: RuntimePolicySnapshot) {
    if (snapshot && snapshot.policy.chain_id !== this.network.caip) deny();
    if (
      !this.callConfiguration ||
      (this.onboarding.runtimeContracts && !snapshot)
    )
      return undefined;
    const effective = snapshot
      ? runtimeCallPolicy(this.callConfiguration.policy, snapshot, true)
      : this.callConfiguration.policy;
    const { accounts: _accounts, ...policy } = effective;
    return structuredClone({
      maxValiditySeconds: Math.min(
        this.callConfiguration.maxValiditySeconds,
        snapshot?.policy.max_validity_seconds ??
          this.callConfiguration.maxValiditySeconds,
      ),
      policy,
    });
  }
  private walletAuthority(
    state: ProviderState,
    principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>,
    accountId: string,
  ) {
    const applicationId = runtimeApplicationId(
      principal.issuer,
      principal.clientId,
    );
    const deployment = state.deploymentBindings?.['service-v1'];
    const registry = deployment?.runtimeConfiguration;
    const wallet = registry?.safeWalletAccounts?.[accountId];
    if (
      !wallet ||
      (wallet.applicationId !== applicationId &&
        !this.onboarding.hasSharedWalletAccess(
          state,
          applicationId,
          wallet.accountId,
        )) ||
      wallet.status !== 'ready' ||
      wallet.owner !== state.accounts[wallet.accountId]?.owner ||
      deployment?.activeRevision !== this.revision ||
      ['actions', 'services', 'sponsorship'].some(
        (kind) =>
          registry?.obligations?.records[applicationId + ':' + kind]
            ?.decision !== 'accepted',
      )
    )
      deny();
    return { signer: wallet.signer, binding: wallet.binding };
  }
  private async callAuthority(principal: VerifiedPrincipal, accountId: string) {
    const configuration = this.callConfiguration ?? deny();
    const snapshot = await this.onboarding.store.transaction((state) =>
      currentRuntimePolicy(state, principal),
    );
    if (snapshot.policy.chain_id !== this.network.caip) deny();
    const wallet = await this.onboarding.store.transaction((state) =>
      this.walletAuthority(state, principal, accountId),
    );
    return {
      snapshot,
      signer: wallet.signer,
      policy: runtimeCallPolicy(
        { ...configuration.policy, accounts: [wallet.binding] },
        snapshot,
      ),
      validity: Math.min(
        configuration.maxValiditySeconds,
        snapshot.policy.max_validity_seconds,
      ),
    };
  }
  private currentRuntime(state: ProviderState, record: ApprovedCallsRecord) {
    if (record.intent) {
      const wallet = this.walletAuthority(
        state,
        record.approval.caller,
        record.intent.input.account_id,
      );
      if (
        !record.approval.userAccount ||
        fingerprint(wallet.signer) !== fingerprint(record.approval.account) ||
        fingerprint(wallet.binding) !== fingerprint(record.intent.account)
      )
        deny();
      validateSafeAddressParameters(
        record.runtimePolicy ?? deny(),
        record.intent.input,
        wallet.binding.address,
      );
    } else if (record.approval.userAccount) deny();

    if (
      record.intent &&
      this.onboarding.runtimeContracts &&
      (!record.runtimePolicy ||
        canonicalHash(currentRuntimePolicy(state, record.approval.caller)) !==
          canonicalHash(record.runtimePolicy))
    )
      deny();
    if (record.runtimePolicy && !this.onboarding.runtimeContracts) deny();
  }
  private adapterCharges(intent: ApprovedCallIntent) {
    return adapterAllowanceCharges(
      intent,
      this.onboarding.policy.provider.origin,
    );
  }
  private current(
    record: ApprovedCallsRecord,
    includeDenied = false,
    allowExpired = false,
  ) {
    try {
      const { action, account, units } = record.approval;
      if (record.intent) {
        if (
          !this.callConfiguration?.policy ||
          record.intent.account.accountId !==
            (record.approval.userAccount ?? account).accountId ||
          record.intent.input.account_id !==
            (record.approval.userAccount ?? account).accountId ||
          record.revision !== this.revision ||
          (record.status === 'denied' && !includeDenied) ||
          (!allowExpired && Date.parse(action.expires_at) <= Date.now()) ||
          !Number.isFinite(Date.parse(action.expires_at)) ||
          Date.parse(action.expires_at) >
            Date.now() +
              Math.min(
                this.callConfiguration!.maxValiditySeconds,
                record.runtimePolicy?.policy.max_validity_seconds ??
                  this.callConfiguration!.maxValiditySeconds,
              ) *
                1000 ||
          units !== '1' ||
          action.operation_id !== action.action_id ||
          action.chain_id !== this.network.caip ||
          action.chain_account_id !==
            this.network.caip + ':' + account.address ||
          action.profile !== 'safe_owner_v1' ||
          action.status !== 'ready'
        )
          deny();
        if (this.onboarding.runtimeContracts !== !!record.runtimePolicy) deny();
        const planKey = fingerprint([
          record.approval,
          record.intent,
          record.runtimePolicy ?? null,
          record.revision,
        ]);
        if (this.validatedPlans.has(planKey)) return;
        const base = {
          ...(this.callConfiguration?.policy ?? deny()),
          accounts: [record.intent.account],
        };
        const policy = record.runtimePolicy
          ? runtimeCallPolicy(base ?? deny(), record.runtimePolicy)
          : base;
        if (record.runtimePolicy)
          validateRuntimeCalls(record.runtimePolicy, record.intent.input);
        validateApprovedCallAction(
          policy ?? deny(),
          record.intent,
          action,
          this.network.name,
        );
        if (
          fingerprint(record.approval.additionalBudgets ?? []) !==
          fingerprint(this.adapterCharges(record.intent))
        )
          deny();
        if (this.validatedPlans.size >= 128)
          this.validatedPlans.delete(
            this.validatedPlans.values().next().value!,
          );
        this.validatedPlans.add(planKey);
        return;
      }
      deny();
    } catch {
      deny();
    }
  }
  private async binding(
    principal: VerifiedPrincipal,
    accountId: string,
    permission: 'contracts:request' = 'contracts:request',
  ) {
    const grant = await this.onboarding.authorize(
      principal,
      accountId,
      permission,
    );
    const account = await this.onboarding.store.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.revision
      )
        deny();
      const current = state.accounts[accountId];
      if (
        fingerprint(state.grants[grant.id]) !== fingerprint(grant) ||
        !current ||
        !current.address ||
        current.owner !== grant.owner ||
        current.status !== 'active' ||
        current.acceptedUntil <= Date.now() ||
        current.acceptanceRevision !== this.onboarding.policy.revision
      )
        deny();
      return current;
    });
    return { grant, account };
  }
  private async permitted(
    principal: VerifiedPrincipal,
    record: ApprovedCallsRecord,
    includeDenied = false,
    allowExpired = false,
  ) {
    this.current(record, includeDenied, allowExpired);
    await this.onboarding.store.transaction((state) =>
      this.currentRuntime(state, record),
    );
    const approval = record.approval;
    if (!sameCaller(principal, approval.caller)) deny();
    const { grant, account } = await this.binding(
      principal,
      (approval.userAccount ?? approval.account).accountId,
      'contracts:request',
    );
    if (
      grant.id !== approval.grantId ||
      grant.owner !== approval.ownerSubject ||
      grant.requestId !== approval.consentReference ||
      approval.policyRevision !== this.revision ||
      account.address?.toLowerCase() !==
        (approval.userAccount ?? approval.account).address.toLowerCase()
    )
      deny();
    return grant;
  }
  /** Current delegation for an unsigned queued request; queue admission never authorizes signing by itself. */
  async queueAuthority(
    principal: VerifiedPrincipal,
    input: ApprovedCallInput,
    expiresAt: string,
  ) {
    if (!this.callConfiguration || !Number.isFinite(Date.parse(expiresAt)))
      deny();
    const { grant, account } = await this.binding(
      principal,
      input.account_id,
      'contracts:request',
    );
    const authority = await this.callAuthority(principal, input.account_id);
    if (authority.snapshot) validateRuntimeCalls(authority.snapshot, input);
    validateSafeAddressParameters(
      authority.snapshot ?? deny(),
      input,
      authority.policy.accounts.find((a) => a.accountId === input.account_id)!
        .address,
    );
    const intent = buildApprovedCallIntent(
      authority.policy,
      input,
      '0',
      expiresAt,
    );
    return {
      grantId: grant.id,
      owner: grant.owner,
      consentReference: grant.requestId,
      safeAddress: intent.account.address.toLowerCase(),
      address: account.address!,
    };
  }
  /** The transaction sender is the configured Safe, distinct from its EOA signing owner. */
  async walletCallsAccount(principal: VerifiedPrincipal, accountId: string) {
    if (!this.onboarding.runtimeContracts) deny();
    await this.binding(principal, accountId, 'contracts:request');
    const authority = await this.callAuthority(principal, accountId);
    const binding =
      authority.policy.accounts.find(
        (account) => account.accountId === accountId,
      ) ?? deny();
    return { address: binding.address, snapshot: authority.snapshot ?? deny() };
  }
  async walletSignerAccount(principal: VerifiedPrincipal, accountId: string) {
    const { account } = await this.binding(
      principal,
      accountId,
      'contracts:request',
    );
    return (
      (await this.callAuthority(principal, accountId)).signer ?? {
        accountId,
        address: account.address!,
      }
    );
  }
  /** Pure preview under current authority; it reserves no budget, nonce, action or signing attempt. */
  async previewWalletCalls(
    principal: VerifiedPrincipal,
    input: ApprovedCallInput,
  ) {
    const { account } = await this.binding(
      principal,
      input.account_id,
      'contracts:request',
    );
    const authority = await this.callAuthority(principal, input.account_id);
    const snapshot = authority.snapshot ?? deny();
    validateRuntimeCalls(snapshot, input);
    validateSafeAddressParameters(
      snapshot,
      input,
      authority.policy.accounts.find((a) => a.accountId === input.account_id)!
        .address,
    );
    const expiresAt = this.queueExpiry(authority.validity);
    const intent = buildApprovedCallIntent(
      authority.policy,
      input,
      String(2n ** 256n - 1n),
      expiresAt,
    );
    return {
      intent,
      runtimePolicy: snapshot,
      action: buildApprovedCallAction(
        intent,
        authority.signer?.address ?? account.address!,
        expiresAt,
        randomUUID(),
        this.network.name,
      ),
    };
  }
  async applicationQueueExpiry(
    principal: VerifiedPrincipal,
    maximumSeconds: number,
    accountId: string,
  ) {
    return this.queueExpiry(
      Math.min(
        maximumSeconds,
        (await this.callAuthority(principal, accountId)).validity,
      ),
    );
  }
  queueExpiry(maximumSeconds: number) {
    if (!this.callConfiguration) deny();
    return new Date(
      (Math.floor(Date.now() / 1000) +
        Math.min(maximumSeconds, this.callConfiguration.maxValiditySeconds)) *
        1000,
    ).toISOString();
  }
  /** Admit exact generic calls under the separately consented call policy. */
  async requestCalls(
    inputContext: AuthorityContext,
    input: ApprovedCallInput,
    nonce: (
      binding: import('../execution/approved-calls.js').SafeAccountBinding,
      owner: string,
      principal?: VerifiedPrincipal,
    ) => Promise<string>,
    requestedExpiresAt?: string,
  ) {
    const context = structuredClone(inputContext);
    input = structuredClone(input);
    if (
      !context.principal.scopes.includes('wallet:actions') ||
      !uuid.test(context.idempotencyKey) ||
      !uuid.test(input.account_id) ||
      !this.callConfiguration?.policy
    )
      deny();
    const { grant, account } = await this.binding(
      context.principal,
      input.account_id,
      'contracts:request',
    );
    const authority = await this.callAuthority(
      context.principal,
      input.account_id,
    );
    if (authority.snapshot) validateRuntimeCalls(authority.snapshot, input);
    validateSafeAddressParameters(
      authority.snapshot ?? deny(),
      input,
      authority.policy.accounts.find((a) => a.accountId === input.account_id)!
        .address,
    );
    const key = fingerprint([
      'supported-call',
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      context.idempotencyKey,
    ]);
    const hash = fingerprint([
      input,
      this.revision,
      ...(authority.snapshot ? [authority.snapshot] : []),
    ]);
    const previous = await this.onboarding.store.transaction((state) => {
      const entry = state.idempotency[key];
      if (!entry) return undefined;
      if (entry.hash !== hash || !state.supportedActions?.[entry.id])
        throw new WalletProviderError('wallet_attempt_conflict');
      return state.supportedActions[entry.id];
    });
    const expiresAt =
      requestedExpiresAt ?? this.queueExpiry(authority.validity);
    if (
      Date.parse(expiresAt) <= Date.now() ||
      Date.parse(expiresAt) > Date.now() + authority.validity * 1000
    )
      deny();
    const intent =
      previous?.intent ??
      buildApprovedCallIntent(
        authority.policy,
        input,
        await nonce(
          authority.policy.accounts.find(
            (binding) => binding.accountId === input.account_id,
          ) ?? deny(),
          authority.signer?.address ?? account.address!,
          context.principal,
        ),
        expiresAt,
      );
    if (
      adapterInput(intent).kind === 'swap' &&
      Number((adapterInput(intent) as { deadline: string }).deadline) * 1000 <=
        Date.now()
    )
      deny();
    const record = await this.onboarding.store.transaction((state) => {
      const entry = state.idempotency[key];
      if (entry) {
        if (entry.hash !== hash || !state.supportedActions?.[entry.id]) deny();
        return state.supportedActions[entry.id];
      }
      const records = (state.supportedActions ??= {});
      // Expired actions release a nonce only when the same transaction proves no signing admission ever existed.
      for (const record of Object.values(records)) {
        if (
          record.nonceDomain !== 'safe-4337-v07' ||
          record.nonceReleased ||
          record.intent?.account.address.toLowerCase() !==
            intent.account.address.toLowerCase() ||
          record.intent.nonce !== intent.nonce
        )
          continue;
        if (
          Date.parse(record.approval.action.expires_at) > Date.now() ||
          this.database.hasActionAttempts(record.approval.action.action_id)
        )
          throw new WalletProviderError('wallet_attempt_conflict');
        record.status = 'denied';
        record.nonceReleased = true;
        state.audit.push({
          at: Date.now(),
          event: 'unsigned_nonce_released',
          resource: record.approval.action.action_id,
          revision: this.revision,
        });
      }
      const id = randomUUID();
      const action = buildApprovedCallAction(
        intent,
        authority.signer?.address ?? account.address!,
        expiresAt,
        id,
        this.network.name,
      );
      const created: ApprovedCallsRecord = {
        nonceDomain: 'safe-4337-v07' as const,
        intent,
        ...(authority.snapshot ? { runtimePolicy: authority.snapshot } : {}),
        revision: this.revision,
        status: 'authorizing',
        approval: {
          ownerSubject: grant.owner,
          caller: {
            issuer: context.principal.issuer,
            subject: context.principal.subject,
            clientId: context.principal.clientId,
            ...(context.principal.accessGrantId
              ? { accessGrantId: context.principal.accessGrantId }
              : {}),
          },
          grantId: grant.id,
          consentReference: grant.requestId,
          policyRevision: this.revision,
          account: authority.signer ?? {
            accountId: input.account_id,
            address: account.address!,
          },
          ...(authority.signer
            ? {
                userAccount: {
                  accountId: input.account_id,
                  address: account.address!,
                },
              }
            : {}),
          action,
          budgetId: fingerprint([
            'contract-operations',
            this.onboarding.policy.provider.origin,
            input.account_id,
          ]),
          units: '1',
          ...(this.adapterCharges(intent).length
            ? { additionalBudgets: this.adapterCharges(intent) }
            : {}),
        },
      };
      this.currentRuntime(state, created);
      records[id] = created;
      state.idempotency[key] = { id, hash };
      state.audit.push({
        at: Date.now(),
        event: 'contract_action_requested',
        resource: id,
        revision: this.revision,
      });
      return created;
    });
    await this.permitted(context.principal, record);
    await this.database.setBudget(
      record.approval.budgetId,
      this.callConfiguration?.policy.lifetimeOperations,
      this.revision,
    );
    await prepareAdapterAllowances(
      this.database,
      record.intent!,
      this.onboarding.policy.provider.origin,
      this.revision,
    );
    await this.database.approveAction(record.approval);
    await this.permitted(context.principal, record);
    await this.onboarding.store.transaction((state) => {
      const latest = state.supportedActions?.[record.approval.action.action_id];
      if (
        !latest ||
        fingerprint(latest.approval) !== fingerprint(record.approval)
      )
        deny();
      this.currentRuntime(state, latest);
      this.current(latest);
      latest.status = 'authorized';
    });
    return this.read(context.principal, record.approval.action.action_id);
  }
  private receipt(record: ApprovedCallsRecord) {
    const action = record.approval.action;
    return {
      action_id: action.action_id,
      account_id: (record.approval.userAccount ?? record.approval.account)
        .accountId,
      status: record.status,
      expires_at: action.expires_at,
      payload_hash: action.payload_hash,
      payload: action.payload,
      ...(record.intent ? { intent: record.intent } : {}),
    };
  }
  async read(principal: VerifiedPrincipal, id: string) {
    const record = await this.load(id);
    await this.permitted(principal, record, true);
    return this.receipt(record);
  }
  private async load(id: string) {
    if (!uuid.test(id)) invalid();
    return this.onboarding.store.transaction((state) => {
      const record = state.supportedActions?.[id];
      if (!record) deny();
      return record;
    });
  }
  /** Current exact transfer authority, checked again inside the storage transaction. */
  async withAuthorizedCalls<T>(
    principal: VerifiedPrincipal,
    id: string,
    operation: (state: ProviderState, record: ApprovedCallsRecord) => T,
    allowExpired = false,
  ): Promise<T> {
    principal = structuredClone(principal);
    const before = await this.load(id);
    if (
      before.status !== 'authorized' ||
      !(await this.database.isApprovedAction(before.approval, allowExpired))
    )
      deny();
    return this.onboarding.withAccountAccess(
      principal,
      (before.approval.userAccount ?? before.approval.account).accountId,
      'contracts:request',
      (state, grant) => {
        const latest = state.supportedActions?.[id];
        const approval = before.approval;
        const account = state.accounts[grant.accountId];
        if (
          !latest ||
          latest.status !== 'authorized' ||
          fingerprint(latest.approval) !== fingerprint(approval) ||
          !sameCaller(principal, approval.caller) ||
          grant.id !== approval.grantId ||
          grant.owner !== approval.ownerSubject ||
          grant.requestId !== approval.consentReference ||
          approval.policyRevision !== this.revision ||
          !account ||
          account.owner !== grant.owner ||
          account.status !== 'active' ||
          account.acceptedUntil <= Date.now() ||
          account.acceptanceRevision !== this.onboarding.policy.revision ||
          account.address?.toLowerCase() !==
            (approval.userAccount ?? approval.account).address.toLowerCase() ||
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.revision
        )
          deny();
        this.currentRuntime(state, latest);
        this.current(latest, false, allowExpired);
        return operation(state, latest);
      },
    );
  }
  async authorize(
    context: AuthorityContext,
    approval: FinancialApproval,
  ): Promise<FinancialAuthorization | null> {
    try {
      if (approval.action.kind !== 'sign_typed_data') return null;
      const record = await this.load(approval.action.action_id);
      if (
        record.status !== 'authorized' ||
        fingerprint(record.approval) !== fingerprint(approval)
      )
        return null;
      await this.permitted(context.principal, record);
      const action = approval.action;
      return {
        ownerSubject: approval.ownerSubject,
        accountId: approval.account.accountId,
        address: approval.account.address,
        chainAccountId: action.chain_account_id,
        currentUserStatus: 'ID VERIFIED',
        grantId: approval.grantId,
        consentReference: approval.consentReference,
        policyRevision: this.revision,
        bindingRevision: action.binding_revision,
        capabilityRevision: action.capability_revision,
        planRevision: action.plan_revision,
        planHash: action.plan_hash,
        expiresAt: action.expires_at,
      };
    } catch (error) {
      if (
        error instanceof WalletProviderError &&
        error.code === 'wallet_authorization_denied'
      )
        return null;
      throw error;
    }
  }
}
