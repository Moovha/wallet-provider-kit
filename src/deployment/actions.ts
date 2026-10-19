import { sponsorshipGas } from '../runtime-configuration/obligations.js';
import { runtimeApplicationId } from '../runtime-configuration/service.js';
import {
  safeProvisioningIdentity,
  type SafeProvisioningConfiguration,
} from '../provisioning/safe.js';
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
  validateRuntimeUserCalls,
  type RuntimePolicySnapshot,
} from '../runtime-configuration/authority.js';
import { serviceHash } from '../executor/auth.js';
import {
  buildApprovedCallIntent,
  buildNonceCancellationIntent,
  buildApprovedCallAction,
  validateApprovedCallAction,
  type ApprovedCallInput,
  type ApprovedCallIntent,
} from '../execution/approved-calls.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { TransferExecutionRecord } from '../execution/types.js';
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

export interface TransferPolicy {
  profile: 'provider-authorized-erc3009-v1';
  token: {
    address: string;
    name: string;
    version: string;
    symbol: string;
    decimals: number;
  };
  recipients: string[];
  maximumAmount: string;
  /** Lifetime authorized atomic units per account/token; unknown effects retain usage. */
  lifetimeAmount: string;
  maxValiditySeconds: number;
}
export interface TransferInput {
  account_id: string;
  recipient: string;
  amount: string;
}
export interface TransactionEventInput {
  event: 'submitted' | 'confirmed' | 'failed';
  chain_id: ProviderChainId;
  transaction_hash: string;
  observed_at: string;
}
export interface TransactionEventReport extends TransactionEventInput {
  report_id: string;
  recorded_at: string;
  verification: 'unverified';
}
export interface TransferRecord {
  runtimePolicy?: RuntimePolicySnapshot;
  intent?: import('../execution/approved-calls.js').ApprovedCallIntent;
  nonceReleased?: boolean;
  cancellationId?: string;
  execution?: TransferExecutionRecord;
  transactionEvents?: TransactionEventReport[];
  approval: FinancialApproval & { action: TypedDataAction };
  revision: string;
  status: 'authorizing' | 'authorized' | 'denied';
}
export const transferTypes = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};
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
  readonly revision: string;
  readonly network: ReturnType<typeof providerNetwork>;
  private readonly transferPolicy?: TransferPolicy;
  private readonly callConfiguration?: import('../execution/approved-calls.js').ApprovedCallsConfiguration;
  private readonly configuredAccounts: import('../execution/approved-calls.js').SafeAccountBinding[];
  private get policy(): TransferPolicy {
    return this.transferPolicy ?? deny();
  }
  constructor(
    readonly onboarding: OnboardingService,
    private readonly database: ProviderDatabase,
    policy: TransferPolicy | undefined,
    revision?: string,
    callConfiguration?: import('../execution/approved-calls.js').ApprovedCallsConfiguration,
    network?: ProviderNetwork,
    private readonly automaticSafes:
      SafeProvisioningConfiguration | false = false,
    private readonly sharedApplicationSafes = false,
  ) {
    this.network = providerNetwork(network);
    this.transferPolicy = policy ? structuredClone(policy) : undefined;
    this.callConfiguration = callConfiguration
      ? structuredClone(callConfiguration)
      : undefined;
    this.configuredAccounts = structuredClone(
      callConfiguration?.policy.accounts ?? [],
    );
    this.revision =
      revision ??
      fingerprint([
        onboarding.policy.revision,
        policy ?? null,
        callConfiguration ?? null,
        ...(this.network.testnet ? [] : [this.network.name]),
      ]);
  }
  /** Public terms shown when the owner delegates transfers during onboarding. */
  consentTerms() {
    return this.transferPolicy
      ? structuredClone(this.transferPolicy)
      : undefined;
  }
  callConsentTerms(snapshot?: RuntimePolicySnapshot) {
    if (snapshot && snapshot.policy.chain_id !== this.network.caip) deny();
    if (
      !this.callConfiguration ||
      (this.onboarding.runtimeContracts && !snapshot)
    )
      return undefined;
    const effective = snapshot
      ? runtimeCallPolicy(
          this.callConfiguration.policy,
          snapshot,
          !!this.automaticSafes,
        )
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
  private async refreshAccounts() {
    if (
      this.sharedApplicationSafes ||
      !this.automaticSafes ||
      !this.callConfiguration
    )
      return;
    const accounts = await this.onboarding.store.transaction((state) => {
      const deployment = state.deploymentBindings?.['service-v1'];
      if (deployment?.activeRevision !== this.revision) deny();
      return Object.values(deployment.safeAccounts ?? {})
        .filter(
          (record) =>
            record.state === 'ready' &&
            record.configurationHash ===
              safeProvisioningIdentity(
                this.automaticSafes as SafeProvisioningConfiguration,
                this.network.name,
              ) &&
            record.plan.chainId === this.network.chainId &&
            state.accounts[record.plan.accountId]?.address?.toLowerCase() ===
              record.plan.owner.toLowerCase(),
        )
        .map((record) => ({
          accountId: record.plan.accountId,
          address: record.plan.address,
          codeHash: record.plan.proxyCodeHash,
          singleton: record.plan.singleton,
        }));
    });
    for (const account of accounts) {
      const previous = this.configuredAccounts.find(
        (a) => a.accountId === account.accountId,
      );
      if (previous && fingerprint(previous) !== fingerprint(account)) deny();
    }
    this.callConfiguration.policy.accounts = [
      ...this.configuredAccounts,
      ...accounts.filter(
        (a) =>
          !this.configuredAccounts.some((b) => b.accountId === a.accountId),
      ),
    ];
  }
  private shared(
    state: ProviderState,
    principal: Pick<VerifiedPrincipal, 'issuer' | 'clientId'>,
    accountId?: string,
  ) {
    const applicationId = runtimeApplicationId(
      principal.issuer,
      principal.clientId,
    );
    const deployment = state.deploymentBindings?.['service-v1'];
    const registry = deployment?.runtimeConfiguration;
    const signer = registry?.applicationSafes?.[applicationId];
    const safe = signer && deployment?.safeAccounts?.[signer.accountId];
    if (
      deployment?.activeRevision !== this.revision ||
      !signer?.account ||
      !safe ||
      safe.state !== 'ready' ||
      signer.provider !== deployment.provider ||
      safe.plan.accountId !== signer.account.accountId ||
      safe.plan.owner.toLowerCase() !== signer.account.address.toLowerCase() ||
      safe.plan.chainId !== this.network.chainId ||
      safe.configurationHash !==
        safeProvisioningIdentity(
          this.automaticSafes as SafeProvisioningConfiguration,
          this.network.name,
        ) ||
      ['actions', 'services', 'sponsorship'].some(
        (kind) =>
          registry?.obligations?.records[applicationId + ':' + kind]
            ?.decision !== 'accepted',
      )
    )
      deny();
    const sponsorship = registry!.obligations!.records[
      applicationId + ':sponsorship'
    ]
      .value as import('../runtime-configuration/obligations.js').ApplicationObligations['sponsorship'];
    if (
      safe.plan.sponsor.fundingAgreement !== sponsorship.funding_agreement ||
      BigInt(safe.plan.sponsor.lifetimeBudgetWei) >
        BigInt(sponsorship.maximum_gas_budget_wei)
    )
      deny();
    const sponsor = registry?.applicationSponsors?.[applicationId];
    if (
      sponsor &&
      (sponsor.status !== 'ready' ||
        fingerprint(sponsor.sponsor) !== fingerprint(safe.plan.sponsor) ||
        Object.entries(sponsorshipGas(sponsorship)).some(
          ([field, value]) =>
            sponsor.sponsor[field as keyof typeof sponsor.sponsor] !== value,
        ))
    )
      deny();
    return {
      signer: signer.account,
      binding: {
        accountId: accountId ?? signer.accountId,
        address: safe.plan.address,
        codeHash: safe.plan.proxyCodeHash,
        singleton: safe.plan.singleton,
      },
    };
  }
  private async callAuthority(
    principal: VerifiedPrincipal,
    accountId?: string,
  ) {
    await this.refreshAccounts();
    if (!this.callConfiguration) deny();
    const snapshot = this.onboarding.runtimeContracts
      ? await this.onboarding.store.transaction((state) =>
          currentRuntimePolicy(state, principal),
        )
      : undefined;
    if (snapshot && snapshot.policy.chain_id !== this.network.caip) deny();
    const shared = this.sharedApplicationSafes
      ? await this.onboarding.store.transaction((state) =>
          this.shared(state, principal, accountId),
        )
      : undefined;
    const base = shared
      ? { ...this.callConfiguration.policy, accounts: [shared.binding] }
      : this.callConfiguration.policy;
    return {
      snapshot,
      signer: shared?.signer,
      policy: snapshot ? runtimeCallPolicy(base, snapshot) : base,
      validity: Math.min(
        this.callConfiguration.maxValiditySeconds,
        snapshot?.policy.max_validity_seconds ??
          this.callConfiguration.maxValiditySeconds,
      ),
    };
  }
  private currentRuntime(state: ProviderState, record: TransferRecord) {
    if (this.sharedApplicationSafes && record.intent) {
      const shared = this.shared(
        state,
        record.approval.caller,
        record.intent.input.account_id,
      );
      if (
        !record.approval.userAccount ||
        fingerprint(shared.signer) !== fingerprint(record.approval.account) ||
        fingerprint(shared.binding) !== fingerprint(record.intent.account)
      )
        deny();
      if (!record.intent.cancellation)
        validateRuntimeUserCalls(
          record.runtimePolicy ?? deny(),
          record.intent.input,
          record.approval.userAccount.address,
        );
    } else if (record.approval.userAccount) deny();
    if (record.intent?.cancellation) {
      const reference = record.intent.cancellation;
      const original = state.supportedActions?.[reference.actionId];
      if (
        !original?.intent ||
        original.intent.cancellation ||
        original.cancellationId !== record.approval.action.action_id ||
        original.approval.action.payload_hash !== reference.payloadHash ||
        original.intent.nonce !== record.intent.nonce ||
        fingerprint(original.intent.account) !==
          fingerprint(record.intent.account) ||
        fingerprint(original.approval.caller) !==
          fingerprint(record.approval.caller) ||
        original.approval.ownerSubject !== record.approval.ownerSubject ||
        !original.execution?.plan ||
        this.database.hasExecutionAdmission(original.execution.executionId)
      )
        deny();
    }

    if (
      record.intent &&
      this.onboarding.runtimeContracts &&
      (!record.runtimePolicy ||
        serviceHash(currentRuntimePolicy(state, record.approval.caller)) !==
          serviceHash(record.runtimePolicy))
    )
      deny();
    if (record.runtimePolicy && !this.onboarding.runtimeContracts) deny();
  }
  private adapterCharges(intent: ApprovedCallIntent) {
    return adapterAllowanceCharges(
      intent,
      this.onboarding.policy.provider.origin,
      this.transferPolicy,
    );
  }
  private current(
    record: TransferRecord,
    includeDenied = false,
    allowExpired = false,
  ) {
    try {
      const { action, account, units } = record.approval;
      if (record.intent) {
        const base = this.sharedApplicationSafes
          ? {
              ...(this.callConfiguration?.policy ?? deny()),
              accounts: [record.intent.account],
            }
          : this.callConfiguration?.policy;
        const policy = record.runtimePolicy
          ? runtimeCallPolicy(base ?? deny(), record.runtimePolicy)
          : base;
        if (this.onboarding.runtimeContracts !== !!record.runtimePolicy) deny();
        if (record.runtimePolicy && !record.intent.cancellation)
          validateRuntimeCalls(record.runtimePolicy, record.intent.input);
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
          action.profile !== 'evm_eoa_v1' ||
          action.status !== 'ready'
        )
          deny();
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
        return;
      }
      const { domain, message, types, primaryType } = action.payload;
      const expiry = Date.parse(action.expires_at);
      const expectedDomain = {
        name: this.policy.token.name,
        version: this.policy.token.version,
        chainId: this.network.chainId,
        verifyingContract: this.policy.token.address,
      };
      if (
        record.revision !== this.revision ||
        !Number.isFinite(expiry) ||
        (!allowExpired && expiry <= Date.now()) ||
        expiry > Date.now() + this.policy.maxValiditySeconds * 1000 ||
        (record.status === 'denied' && !includeDenied) ||
        primaryType !== 'TransferWithAuthorization' ||
        fingerprint(domain) !== fingerprint(expectedDomain) ||
        fingerprint(types) !== fingerprint(transferTypes) ||
        message.from !== account.address ||
        !this.policy.recipients.some(
          (address) =>
            address.toLowerCase() === String(message.to).toLowerCase(),
        ) ||
        message.value !== units ||
        amount(units) > amount(this.policy.maximumAmount) ||
        message.validAfter !== '0' ||
        Number(message.validBefore) * 1000 !== expiry ||
        !/^0x[0-9a-f]{64}$/.test(String(message.nonce)) ||
        TypedDataEncoder.hash(domain, types, message) !== action.payload_hash ||
        action.plan_hash !== action.payload_hash ||
        action.operation_id !== action.action_id
      )
        deny();
    } catch {
      deny();
    }
  }
  private async binding(
    principal: VerifiedPrincipal,
    accountId: string,
    permission: 'transfers:request' | 'contracts:request' = 'transfers:request',
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
    record: TransferRecord,
    includeDenied = false,
    allowExpired = false,
  ) {
    await this.refreshAccounts();
    if (!allowExpired && record.cancellationId) deny();
    this.current(record, includeDenied, allowExpired);
    await this.onboarding.store.transaction((state) =>
      this.currentRuntime(state, record),
    );
    const approval = record.approval;
    if (!sameCaller(principal, approval.caller)) deny();
    const { grant, account } = await this.binding(
      principal,
      (approval.userAccount ?? approval.account).accountId,
      record.intent ? 'contracts:request' : 'transfers:request',
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
  async request(inputContext: AuthorityContext, input: TransferInput) {
    const context = structuredClone(inputContext);
    input = structuredClone(input);
    if (
      !context.principal.scopes.includes('wallet:actions') ||
      !uuid.test(context.idempotencyKey) ||
      !uuid.test(input.account_id)
    )
      deny();
    if (Object.keys(input).sort().join(',') !== 'account_id,amount,recipient')
      invalid();
    let recipient: string;
    try {
      recipient = getAddress(input.recipient);
    } catch {
      return invalid();
    }
    if (
      !this.policy.recipients.some(
        (a) => a.toLowerCase() === recipient.toLowerCase(),
      ) ||
      amount(input.amount) > amount(this.policy.maximumAmount)
    )
      deny();
    const { grant, account } = await this.binding(
      context.principal,
      input.account_id,
    );
    if (!account.address) deny();
    const key = fingerprint([
      'supported-action',
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      context.idempotencyKey,
    ]);
    const hash = fingerprint([
      input.account_id,
      recipient,
      input.amount,
      this.revision,
    ]);
    const record = await this.onboarding.store.transaction((state) => {
      const records = (state.supportedActions ??= {});
      const previous = state.idempotency[key];
      if (previous) {
        if (previous.hash !== hash || !records[previous.id])
          throw new WalletProviderError('wallet_attempt_conflict');
        return records[previous.id];
      }
      const id = randomUUID();
      const expires =
        Math.floor(Date.now() / 1000) + this.policy.maxValiditySeconds;
      const domain = {
        name: this.policy.token.name,
        version: this.policy.token.version,
        chainId: this.network.chainId,
        verifyingContract: this.policy.token.address,
      };
      const message = {
        from: account.address!,
        to: recipient,
        value: input.amount,
        validAfter: '0',
        validBefore: String(expires),
        nonce: '0x' + randomBytes(32).toString('hex'),
      };
      const payload = {
        types: transferTypes,
        domain,
        primaryType: 'TransferWithAuthorization',
        message,
      };
      const digest = TypedDataEncoder.hash(domain, transferTypes, message);
      const action: TypedDataAction = {
        action_id: id,
        operation_id: id,
        kind: 'sign_typed_data',
        profile: 'evm_eoa_v1',
        profile_revision: '1',
        status: 'ready',
        chain_id: this.network.caip,
        chain_account_id: `${this.network.caip}:${account.address}`,
        binding_revision: '1',
        capability_revision: '1',
        plan_revision: '1',
        plan_hash: digest,
        payload_hash: digest,
        expires_at: new Date(expires * 1000).toISOString(),
        dependencies: [],
        payload,
      };
      const record: TransferRecord = {
        revision: this.revision,
        status: 'authorizing',
        approval: {
          ownerSubject: grant.owner,
          caller: {
            issuer: context.principal.issuer,
            subject: context.principal.subject,
            clientId: context.principal.clientId,
          },
          grantId: grant.id,
          consentReference: grant.requestId,
          policyRevision: this.revision,
          account: { accountId: input.account_id, address: account.address! },
          action,
          budgetId: fingerprint([
            'transfer',
            this.onboarding.policy.provider.origin,
            input.account_id,
            this.policy.token.address.toLowerCase(),
          ]),
          units: input.amount,
        },
      };
      records[id] = record;
      state.idempotency[key] = { hash, id };
      state.audit.push({
        at: Date.now(),
        event: 'action_requested',
        resource: id,
        revision: this.revision,
      });
      return record;
    });
    await this.permitted(context.principal, record);
    if (record.status === 'authorizing') {
      // Both writes are idempotent. A crash leaves an unsigned action that the same
      // request can resume, preserving its nonce, digest and action identity.
      await this.database.setBudget(
        record.approval.budgetId,
        this.policy.lifetimeAmount,
        this.revision,
      );
      await this.database.approveAction(record.approval);
      await this.permitted(context.principal, record);
      await this.onboarding.store.transaction((state) => {
        const latest =
          state.supportedActions?.[record.approval.action.action_id];
        if (
          !latest ||
          fingerprint(latest.approval) !== fingerprint(record.approval)
        )
          deny();
        this.current(latest);
        if (latest.status === 'authorizing') {
          latest.status = 'authorized';
          state.audit.push({
            at: Date.now(),
            event: 'action_provider_authorized',
            resource: latest.approval.action.action_id,
            revision: this.revision,
          });
        }
      });
    }
    return this.read(context.principal, record.approval.action.action_id);
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
    if (this.sharedApplicationSafes)
      validateRuntimeUserCalls(
        authority.snapshot ?? deny(),
        input,
        account.address!,
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
    if (this.sharedApplicationSafes)
      validateRuntimeUserCalls(snapshot, input, account.address!);
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
  ) {
    return this.queueExpiry(
      Math.min(maximumSeconds, (await this.callAuthority(principal)).validity),
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
    queued?: { id: string; expiresAt: string },
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
    if (this.sharedApplicationSafes)
      validateRuntimeUserCalls(
        authority.snapshot ?? deny(),
        input,
        account.address!,
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
      queued?.expiresAt ??
      requestedExpiresAt ??
      this.queueExpiry(authority.validity);
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
      const pending = Object.values(state.safeRequests ?? {})
        .filter(
          (entry) =>
            entry.safeAddress === intent.account.address.toLowerCase() &&
            ['queued', 'executing', 'blocked'].includes(entry.status),
        )
        .sort((a, b) => a.sequence - b.sequence);
      if (pending.length && (!queued || pending[0].id !== queued.id))
        throw new WalletProviderError('wallet_attempt_conflict');
      if (
        queued &&
        (!pending.length ||
          pending[0].id !== queued.id ||
          pending[0].revision !== this.revision ||
          pending[0].grantId !== grant.id ||
          pending[0].owner !== grant.owner ||
          pending[0].consentReference !== grant.requestId ||
          !sameCaller(pending[0].principal, context.principal) ||
          pending[0].address !== account.address ||
          fingerprint(pending[0].input) !== fingerprint(input) ||
          pending[0].expiresAt !== expiresAt)
      )
        deny();
      // Expired actions release a nonce only when the same transaction proves no signing admission ever existed.
      for (const record of Object.values(records)) {
        if (
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
      const created: TransferRecord = {
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
      this.transferPolicy,
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
  /** Explicit recovery authority; callers can select only the stored action, never replacement calldata. */
  async requestNonceCancellation(
    context: AuthorityContext,
    id: string,
    input: {
      expected_nonce: string;
      expected_payload_hash: string;
      authorization: 'invalidate-signed-action';
    },
    nonce: (
      binding: import('../execution/approved-calls.js').SafeAccountBinding,
      owner: string,
      principal?: VerifiedPrincipal,
    ) => Promise<string>,
  ) {
    if (
      !context.principal.scopes.includes('wallet:actions') ||
      !uuid.test(context.idempotencyKey) ||
      input.authorization !== 'invalidate-signed-action'
    )
      deny();
    const original = await this.load(id);
    await this.permitted(context.principal, original, false, true);
    if (
      !original.intent ||
      original.intent.cancellation ||
      !original.execution?.plan ||
      original.execution.integrityFailure ||
      original.execution.effectObserved ||
      original.intent.nonce !== input.expected_nonce ||
      original.approval.action.payload_hash !== input.expected_payload_hash ||
      !this.database.hasActionAttempts(id) ||
      !(await this.database.isApprovedAction(original.approval, true))
    )
      deny();
    const authority = await this.callAuthority(
      context.principal,
      (original.approval.userAccount ?? original.approval.account).accountId,
    );
    if (
      (await nonce(
        original.intent.account,
        original.approval.account.address,
        context.principal,
      )) !== original.intent.nonce
    )
      deny();
    const key = fingerprint([
      'nonce-cancellation',
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      context.idempotencyKey,
    ]);
    const hash = fingerprint([id, input, this.revision]);
    const record = await this.onboarding.withAccountAccess(
      context.principal,
      (original.approval.userAccount ?? original.approval.account).accountId,
      'contracts:request',
      (state, grant) => {
        const latest = state.supportedActions?.[id] ?? deny();
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.revision ||
          latest.status !== 'authorized' ||
          latest.execution?.integrityFailure ||
          latest.execution?.effectObserved ||
          fingerprint(latest.execution?.plan) !==
            fingerprint(original.execution?.plan) ||
          fingerprint(latest.approval) !== fingerprint(original.approval) ||
          grant.id !== original.approval.grantId ||
          grant.owner !== original.approval.ownerSubject ||
          grant.requestId !== original.approval.consentReference ||
          this.database.hasExecutionAdmission(original.execution!.executionId)
        )
          deny();
        this.currentRuntime(state, latest);
        const previous = state.idempotency[key];
        if (previous) {
          if (previous.hash !== hash || latest.cancellationId !== previous.id)
            throw new WalletProviderError('wallet_attempt_conflict');
          return state.supportedActions![previous.id] ?? deny();
        }
        if (latest.cancellationId)
          throw new WalletProviderError('wallet_attempt_conflict');
        const cancellationId = randomUUID();
        const intent = buildNonceCancellationIntent(
          authority.policy,
          (original.approval.userAccount ?? original.approval.account)
            .accountId,
          original.intent!.nonce,
          { actionId: id, payloadHash: original.approval.action.payload_hash },
        );
        if (
          fingerprint(intent.account) !== fingerprint(original.intent!.account)
        )
          deny();
        const action = buildApprovedCallAction(
          intent,
          original.approval.account.address,
          this.queueExpiry(authority.validity),
          cancellationId,
          this.network.name,
        );
        const { additionalBudgets: _originalBudgets, ...baseApproval } =
          structuredClone(original.approval);
        const created: TransferRecord = {
          intent,
          ...(authority.snapshot ? { runtimePolicy: authority.snapshot } : {}),
          revision: this.revision,
          status: 'authorizing',
          approval: {
            ...baseApproval,
            action,
            units: '1',
          },
        };
        latest.cancellationId = cancellationId;
        state.supportedActions![cancellationId] = created;
        state.idempotency[key] = { id: cancellationId, hash };
        this.currentRuntime(state, created);
        state.audit.push({
          at: Date.now(),
          event: 'safe_nonce_cancellation_authorized',
          resource: id,
          revision: this.revision,
        });
        return created;
      },
    );
    await this.permitted(context.principal, record);
    await this.database.approveAction(record.approval);
    await this.onboarding.store.transaction((state) => {
      const latest =
        state.supportedActions?.[record.approval.action.action_id] ?? deny();
      this.currentRuntime(state, latest);
      this.current(latest);
      latest.status = 'authorized';
    });
    return {
      action_id: record.approval.action.action_id,
      cancelled_action_id: id,
      nonce: record.intent!.nonce,
      payload_hash: record.approval.action.payload_hash,
      expires_at: record.approval.action.expires_at,
    };
  }
  private receipt(record: TransferRecord) {
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
  /** Read retained runtime execution evidence under current account-read access, without granting dispatch authority. */
  async withExecutionRead<T>(
    principal: VerifiedPrincipal,
    id: string,
    operation: (state: ProviderState, record: TransferRecord) => T,
  ): Promise<T> {
    await this.refreshAccounts();
    const record = await this.load(id);
    if (!record.runtimePolicy)
      return this.withAuthorizedTransfer(principal, id, operation, true);
    if (!sameCaller(principal, record.approval.caller)) deny();
    return this.onboarding.withAccountAccess(
      principal,
      (record.approval.userAccount ?? record.approval.account).accountId,
      'account:read',
      (state, grant) => {
        const latest = state.supportedActions?.[id];
        if (
          !latest?.runtimePolicy ||
          !latest.execution?.plan ||
          grant.owner !== latest.approval.ownerSubject ||
          fingerprint(latest.approval) !== fingerprint(record.approval) ||
          state.accounts[grant.accountId]?.address !==
            (latest.approval.userAccount ?? latest.approval.account).address ||
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.revision
        )
          deny();
        this.current(latest, false, true);
        return operation(state, latest);
      },
    );
  }
  /** Current exact transfer authority, checked again inside the storage transaction. */
  async withAuthorizedTransfer<T>(
    principal: VerifiedPrincipal,
    id: string,
    operation: (state: ProviderState, record: TransferRecord) => T,
    allowExpired = false,
  ): Promise<T> {
    principal = structuredClone(principal);
    const before = await this.load(id);
    const grant = await this.permitted(principal, before, false, allowExpired);
    if (
      before.status !== 'authorized' ||
      !(await this.database.isApprovedAction(before.approval, allowExpired))
    )
      deny();
    return this.onboarding.withAccountAccess(
      principal,
      (before.approval.userAccount ?? before.approval.account).accountId,
      before.intent ? 'contracts:request' : 'transfers:request',
      (state, currentGrant) => {
        const latest = state.supportedActions?.[id];
        if (
          !latest ||
          latest.status !== 'authorized' ||
          (!allowExpired && !!latest.cancellationId) ||
          fingerprint(latest.approval) !== fingerprint(before.approval) ||
          fingerprint(grant) !== fingerprint(currentGrant) ||
          state.accounts[grant.accountId]?.address?.toLowerCase() !==
            (
              before.approval.userAccount ?? before.approval.account
            ).address.toLowerCase() ||
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
  /** Store caller observations separately from signing authority and verified settlement. */
  async reportTransactionEvent(
    inputContext: AuthorityContext,
    id: string,
    input: TransactionEventInput,
  ) {
    const context = structuredClone(inputContext);
    input = structuredClone(input);
    if (
      !context.principal.scopes.includes('wallet:events') ||
      !uuid.test(context.idempotencyKey)
    )
      deny();
    if (
      Object.keys(input).sort().join(',') !==
        'chain_id,event,observed_at,transaction_hash' ||
      !['submitted', 'confirmed', 'failed'].includes(input.event) ||
      input.chain_id !== this.network.caip ||
      !/^0x[0-9a-f]{64}$/.test(input.transaction_hash) ||
      typeof input.observed_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
        input.observed_at,
      ) ||
      !Number.isFinite(Date.parse(input.observed_at)) ||
      new Date(input.observed_at).toISOString().replace('.000Z', 'Z') !==
        input.observed_at.replace('.000Z', 'Z') ||
      Date.parse(input.observed_at) > Date.now() + 60000
    )
      invalid();
    const record = await this.load(id);
    const grant = await this.permitted(context.principal, record, false, true);
    const key = fingerprint([
      'transaction-event',
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      context.idempotencyKey,
    ]);
    const hash = fingerprint([id, input]);
    return this.onboarding.withAccountAccess(
      context.principal,
      (record.approval.userAccount ?? record.approval.account).accountId,
      record.intent ? 'contracts:request' : 'transfers:request',
      (state, currentGrant) => {
        const latest = state.supportedActions?.[id];
        if (
          !latest ||
          latest.status !== 'authorized' ||
          fingerprint(latest.approval) !== fingerprint(record.approval) ||
          fingerprint(currentGrant) !== fingerprint(grant) ||
          state.accounts[grant.accountId]?.owner !== grant.owner ||
          state.accounts[grant.accountId]?.address?.toLowerCase() !==
            (
              record.approval.userAccount ?? record.approval.account
            ).address.toLowerCase() ||
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.revision
        )
          deny();
        this.current(latest, false, true);
        const events = (latest.transactionEvents ??= []);
        const previous = state.idempotency[key];
        if (previous) {
          const report = events.find(
            (event) => event.report_id === previous.id,
          );
          if (previous.hash !== hash || !report)
            throw new WalletProviderError('wallet_attempt_conflict');
          return { action_id: id, ...report };
        }
        if (events.length >= 32)
          throw new WalletProviderError('wallet_attempt_conflict');
        const report: TransactionEventReport = {
          ...input,
          report_id: randomUUID(),
          recorded_at: new Date(Date.now()).toISOString(),
          verification: 'unverified',
        };
        events.push(report);
        state.idempotency[key] = { hash, id: report.report_id };
        state.audit.push({
          at: Date.now(),
          event: 'transaction_event_reported',
          resource: id,
          revision: this.revision,
        });
        return { action_id: id, ...report };
      },
    );
  }
  async transactionEvents(principal: VerifiedPrincipal, id: string) {
    principal = structuredClone(principal);
    if (!principal.scopes.includes('wallet:events:read')) deny();
    const record = await this.load(id);
    const originalGrant = await this.permitted(principal, record, false, true);
    if (record.status !== 'authorized') deny();
    return this.onboarding.withAccountAccess(
      principal,
      (record.approval.userAccount ?? record.approval.account).accountId,
      record.intent ? 'contracts:request' : 'transfers:request',
      (state, grant) => {
        const latest = state.supportedActions?.[id];
        if (
          !latest ||
          latest.status !== 'authorized' ||
          fingerprint(latest.approval) !== fingerprint(record.approval) ||
          fingerprint(grant) !== fingerprint(originalGrant) ||
          state.accounts[grant.accountId]?.address?.toLowerCase() !==
            (
              record.approval.userAccount ?? record.approval.account
            ).address.toLowerCase() ||
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.revision
        )
          deny();
        this.current(latest, false, true);
        return { action_id: id, events: latest.transactionEvents ?? [] };
      },
    );
  }
  async assertSignatureExport(id: string) {
    if ((await this.load(id)).intent) deny();
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
