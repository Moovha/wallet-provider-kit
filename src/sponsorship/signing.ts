import { solidityPacked } from 'ethers';
import {
  initialSafeOwnerPolicy,
  normalizeSafeOwnerPolicy,
} from './owner-policy.js';
import { safeUserOperationCallData } from './preparation.js';
import { fingerprint, deny, uuid } from '../onboarding/policy.js';
import type { AuthorityContext } from '../domain/principal.js';
import {
  WalletProviderError,
  type WalletSigningProvider,
} from '../domain/signing.js';
import type { SupportedActions } from '../deployment/actions.js';
import type {
  ProviderDatabase,
  FinancialApproval,
  FinancialAuthorization,
} from '../storage/index.js';
import type {
  ApprovedCallPolicy,
  ApprovedCallInput,
} from '../execution/approved-calls.js';
import { createJournaledWalletProvider } from '../providers/journaled.js';
import { prepareRuntimeUserOperationV07 } from './preparation.js';
import {
  normalizeUserOperationV07,
  maximumUserOperationCostV07,
  type UserOperationV07,
} from './user-operation.js';
import {
  applicationGasBudgetLimit,
  applicationGasFunding,
  applicationGasLifetimeBudget,
  applicationGasBudgetId,
  type ApplicationGasAllowance,
} from './budget.js';
import {
  createPaymasterClientV07,
  type PaymasterClientOptionsV07,
  type PaymasterStubV07,
} from './paymaster.js';
import { Safe4337Verifier, type Safe4337Acceptance } from './verifier.js';
import {
  safeOpPayloadV07,
  safeOpActionV07,
  safeOpSignatureV07,
  safeOpSignaturesV07,
} from './safe-op.js';
import type { SponsorshipAdmission } from './admission.js';
import {
  localPaymasterUrl,
  type LocalPaymasterAuthorization,
} from './local-paymaster.js';

export interface Safe4337SigningConfiguration {
  submissionBinding?: string;
  acceptance: Safe4337Acceptance;
  basePolicy: ApprovedCallPolicy;
  sponsors: ApplicationGasAllowance[];
  maxValiditySeconds: number;
  paymaster: Omit<
    PaymasterClientOptionsV07,
    | 'authorization'
    | 'authorizeRequest'
    | 'domain'
    | 'paymaster'
    | 'maximumCostWei'
  >;
}
export interface SponsorshipConsentTerms {
  operationId: string;
  sourceApprovalHash: string;
  configurationHash: string;
  preparation: ReturnType<typeof prepareRuntimeUserOperationV07>;
  validAfter: string;
  validUntil: string;
  maximumCostWei: string;
}
export interface Safe4337SigningOptions {
  /** Unwrapped protected signing backend; this service supplies its financial journal. */
  backend: WalletSigningProvider;
  authorization: PaymasterClientOptionsV07['authorization'];
  /** Resolve fresh persisted owner consent to these exact sponsorship/driver terms. Access scopes or contract registration alone are insufficient. */
  authorizeSponsorship(
    context: AuthorityContext,
    terms: SponsorshipConsentTerms,
  ): Promise<{
    termsHash: string;
    consentReference: string;
    funding?: import('./funding.js').FundingSnapshot;
  } | null>;
}
/** Advanced embedded-host AS2 adapter. Signs only admitted exact SafeOps; never broadcasts or installs modules. */
export class Safe4337SigningService {
  private readonly preparedTerms = new Map<string, SponsorshipConsentTerms>();
  private readonly config: Safe4337SigningConfiguration;
  private readonly configurationHash: string;
  private readonly verifier: Safe4337Verifier;
  private readonly financial: ReturnType<
    ProviderDatabase['financialAuthority']
  >;
  private readonly signer: WalletSigningProvider;
  private readonly authorizeConsent: Safe4337SigningOptions['authorizeSponsorship'];
  private readonly credential: Safe4337SigningOptions['authorization'];
  constructor(
    private readonly actions: SupportedActions,
    private readonly database: ProviderDatabase,
    configuration: Safe4337SigningConfiguration,
    options: Safe4337SigningOptions,
    private readonly request: typeof fetch = fetch,
  ) {
    this.config = structuredClone(configuration);
    if (
      BigInt(this.config.acceptance.domain.chainId) !==
      BigInt(this.actions.network.chainId)
    )
      throw new WalletProviderError('wallet_provider_configuration');
    if (
      typeof options?.authorizeSponsorship !== 'function' ||
      typeof options.authorization !== 'function'
    )
      throw new WalletProviderError('wallet_provider_configuration');
    const financialConfiguration = structuredClone(this.config);
    for (const account of financialConfiguration.basePolicy.accounts)
      delete account.ownerPolicy;
    delete financialConfiguration.acceptance.aggregateReads;
    delete financialConfiguration.acceptance.observationRpcUrls;
    this.configurationHash = fingerprint([
      financialConfiguration,
      options.backend.provider,
    ]);
    this.authorizeConsent = options.authorizeSponsorship;
    this.credential = options.authorization;
    this.verifier = new Safe4337Verifier(this.config.acceptance, request);
    createPaymasterClientV07(
      {
        ...this.config.paymaster,
        domain: this.config.acceptance.domain,
        paymaster: this.config.acceptance.paymaster.address,
        maximumCostWei: (2n ** 256n - 1n).toString(),
        authorization: this.credential,
        authorizeRequest: async () => false,
      },
      request,
    );
    this.financial = database.financialAuthority({
      namespace: 'safe4337-signing-v1',
      provider: options.backend.provider,
      authorize: (context, approval) =>
        this.authorizeSigning(context, approval),
    });
    this.signer = createJournaledWalletProvider(options.backend, {
      namespace: 'safe4337-signing-v1',
      journal: this.financial.journal,
      authorizeAttempt: this.financial.authorizeAttempt,
    });
  }
  /** Bind the stored intent approval and exact UserOperation to one idempotency identity. */
  async requestCalls(
    context: AuthorityContext,
    input: ApprovedCallInput,
    operation: UserOperationV07,
    expiresAt?: string,
  ) {
    context = structuredClone(context);
    operation = normalizeUserOperationV07(operation);
    const source = await this.actions.requestCalls(
      context,
      input,
      async () => BigInt(operation.nonce).toString(),
      expiresAt,
    );
    return this.admit(context, source.action_id, operation);
  }
  executionBinding() {
    return {
      configurationHash: this.configurationHash,
      submissionBinding: this.config.submissionBinding,
      acceptance: structuredClone(this.config.acceptance),
      paymasterUrl: this.config.paymaster.url,
      accountIds: this.config.basePolicy.accounts.map((a) => a.accountId),
    };
  }
  async prepareCalls(
    principal: import('../domain/principal.js').VerifiedPrincipal,
    input: ApprovedCallInput,
    gas: Pick<
      UserOperationV07,
      | 'callGasLimit'
      | 'verificationGasLimit'
      | 'preVerificationGas'
      | 'maxFeePerGas'
      | 'maxPriorityFeePerGas'
    >,
  ) {
    const preview = await this.actions.previewWalletCalls(principal, input);
    const nonce = await this.verifier.prepareNonce(
      preview.intent.account.address,
    );
    const intent = { ...preview.intent, nonce };
    return normalizeUserOperationV07({
      ...gas,
      sender: intent.account.address,
      nonce: '0x' + BigInt(nonce).toString(16),
      callData: safeUserOperationCallData(intent),
    });
  }
  async assertAccepted(
    principal: import('../domain/principal.js').VerifiedPrincipal,
    accountId: string,
  ) {
    if (
      BigInt(
        applicationGasBudgetLimit(this.config.sponsors, principal.clientId),
      ) === 0n
    )
      deny();
    const binding = await this.actions.walletCallsAccount(principal, accountId);
    const account =
      this.config.basePolicy.accounts.find((a) => a.accountId === accountId) ??
      deny();
    const owner = (await this.actions.walletSignerAccount(principal, accountId))
      .address;
    if (binding.address.toLowerCase() !== account.address.toLowerCase()) deny();
    await this.verifier.verify(
      {
        account,
        multiSend: this.config.basePolicy.multiSend,
        calls: [],
        contracts: [],
      },
      owner,
    );
  }
  async authorizeSubmission(
    context: AuthorityContext,
    id: string,
    verifyChain = true,
  ) {
    await this.current(context, this.load(id), verifyChain);
  }
  /** Internal paymaster port. A claimed durable phase and current authority are required before usable sponsorship. */
  async authorizeLocalPaymaster(request: LocalPaymasterAuthorization) {
    if (this.config.paymaster.url !== localPaymasterUrl) deny();
    const id = request.context.actionId;
    const record = this.load(id);
    const stage =
      request.method === 'pm_getPaymasterStubData'
        ? 'stub'
        : request.method === 'pm_getPaymasterData'
          ? 'final'
          : deny();
    const expected = {
      applicationId: record.preparation.runtimePolicy.application_id,
      policyRevision: record.preparation.runtimePolicy.revision,
      policyHash: record.preparation.runtimePolicy.policy_hash,
      actionId: id,
    };
    if (
      fingerprint(request.context) !== fingerprint(expected) ||
      request.maximumCostWei !== record.maximumCostWei
    )
      deny();
    await this.current(record.context, record, false);
    await this.actions.withAuthorizedCalls(record.context.principal, id, () => {
      const phase = this.load(id).phases[stage] ?? deny();
      return this.database.sponsorship.assertDispatch(
        id,
        stage,
        phase.token,
        fingerprint(normalizeUserOperationV07(request.operation)),
      );
    });
    return { validAfter: record.validAfter, validUntil: record.validUntil };
  }
  async withExecutionRead<T>(
    principal: import('../domain/principal.js').VerifiedPrincipal,
    id: string,
    operation: (
      state: import('../onboarding/types.js').ProviderState,
      record: SponsorshipAdmission,
    ) => T,
  ) {
    const record = this.load(id);
    return this.actions.onboarding.withAccountAccess(
      principal,
      (record.source.userAccount ?? record.source.account).accountId,
      'account:read',
      (state, grant) => {
        if (
          record.configurationHash !== this.configurationHash ||
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.actions.revision ||
          grant.owner !== record.source.ownerSubject ||
          ['issuer', 'subject', 'clientId'].some(
            (key) =>
              principal[key as 'issuer' | 'subject' | 'clientId'] !==
              record.source.caller[key as 'issuer' | 'subject' | 'clientId'],
          ) ||
          state.accounts[grant.accountId].address?.toLowerCase() !==
            (
              record.source.userAccount ?? record.source.account
            ).address.toLowerCase() ||
          fingerprint(state.supportedActions?.[id]?.approval) !==
            fingerprint(record.source)
        )
          deny();
        return operation(state, record);
      },
    );
  }
  private load(id: string) {
    return this.database.sponsorship.load(id) ?? deny();
  }
  private source(context: AuthorityContext, id: string) {
    return this.actions.withAuthorizedCalls(
      context.principal,
      id,
      (_state, record) => record,
    );
  }
  private terms(record: SponsorshipAdmission): SponsorshipConsentTerms {
    const key = fingerprint([
      record.id,
      record.source,
      record.configurationHash,
      record.preparation,
      record.validAfter,
      record.validUntil,
      record.maximumCostWei,
    ]);
    const until = Date.parse(record.preparation.expiresAt);
    if (
      !Number.isFinite(until) ||
      until <= Date.now() ||
      until >
        Date.now() +
          Math.min(
            record.preparation.maxValiditySeconds,
            record.preparation.runtimePolicy.policy.max_validity_seconds,
          ) *
            1000
    )
      deny();
    const cached = this.preparedTerms.get(key);
    if (cached) return structuredClone(cached);
    const terms = {
      operationId: record.id,
      sourceApprovalHash: fingerprint(record.source),
      configurationHash: record.configurationHash,
      preparation: prepareRuntimeUserOperationV07(record.preparation),
      validAfter: record.validAfter,
      validUntil: record.validUntil,
      maximumCostWei: record.maximumCostWei,
    };
    if (this.preparedTerms.size >= 128)
      this.preparedTerms.delete(this.preparedTerms.keys().next().value!);
    this.preparedTerms.set(key, structuredClone(terms));
    return terms;
  }
  private async current(
    context: AuthorityContext,
    record: SponsorshipAdmission,
    verifyChain = true,
  ) {
    if (record.signatureCollection?.state === 'cancelled') deny();
    if (
      !context.principal.scopes.includes('wallet:actions') ||
      !uuid.test(context.idempotencyKey) ||
      record.configurationHash !== this.configurationHash
    )
      deny();
    const source = await this.source(context, record.id);
    if (
      fingerprint(source.approval) !== fingerprint(record.source) ||
      !source.intent ||
      !source.runtimePolicy
    )
      deny();
    const terms = this.terms(record);
    if (
      fingerprint(terms) !== record.termsHash ||
      fingerprint(terms.preparation.runtimePolicy) !==
        fingerprint(source.runtimePolicy)
    )
      deny();
    let consent: Awaited<
      ReturnType<Safe4337SigningOptions['authorizeSponsorship']>
    >;
    try {
      consent = await this.authorizeConsent(
        structuredClone(context),
        structuredClone(terms),
      );
    } catch {
      throw new WalletProviderError('wallet_attempt_unavailable');
    }
    if (
      !consent ||
      consent.termsHash !== record.termsHash ||
      consent.consentReference !== record.consentReference
    )
      deny();
    if (verifyChain)
      await this.verifier.verify(
        terms.preparation.intent,
        record.source.account.address,
        record.preparation.operation.nonce,
      );
    if (record.funding) {
      if (!consent.funding) deny();
      await this.actions.withAuthorizedCalls(context.principal, record.id, () =>
        this.database.sponsorship.assertFunding(record.id, consent!.funding!),
      );
    }
    // Re-read current owner, claims, grant, publication and deployment after external reads.
    await this.source(context, record.id);
    return terms;
  }
  async admit(
    context: AuthorityContext,
    id: string,
    operation: UserOperationV07,
  ) {
    context = structuredClone(context);
    operation = normalizeUserOperationV07(operation);
    if (
      [
        operation.callGasLimit,
        operation.verificationGasLimit,
        operation.preVerificationGas,
        operation.maxFeePerGas,
      ].some((v) => BigInt(v) === 0n)
    )
      throw new WalletProviderError('wallet_provider_input');
    if (operation.paymaster)
      throw new WalletProviderError('wallet_provider_input');
    const source = await this.source(context, id),
      previous = this.database.sponsorship.load(id);
    if (previous) {
      if (
        fingerprint(previous.preparation.operation) !== fingerprint(operation)
      )
        throw new WalletProviderError('wallet_attempt_conflict');
      await this.current(context, previous);
      return {
        operation_id: id,
        terms_hash: previous.termsHash,
        maximum_cost_wei: previous.maximumCostWei,
      };
    }
    if (
      !source.intent ||
      !source.runtimePolicy ||
      source.approval.action.kind !== 'sign_typed_data'
    )
      deny();
    const config = this.config,
      principal = context.principal;
    const validUntil = String(
      Math.floor(Date.parse(source.approval.action.expires_at) / 1000),
    );
    const preparation = {
      ...(this.database.networkScope
        ? { budgetNetworkScope: this.database.networkScope }
        : {}),
      providerOrigin: this.actions.onboarding.policy.provider.origin,
      principal: { issuer: principal.issuer, clientId: principal.clientId },
      runtimePolicy: source.runtimePolicy,
      basePolicy: { ...config.basePolicy, accounts: [source.intent.account] },
      input: source.intent.input,
      operation,
      domain: config.acceptance.domain,
      sponsors: config.sponsors,
      expiresAt: new Date(Number(validUntil) * 1000).toISOString(),
      maxValiditySeconds: config.maxValiditySeconds,
      l1FeeReserveWei: config.paymaster.l1FeeReserveWei,
    };
    const prepared = prepareRuntimeUserOperationV07(preparation);
    if (
      fingerprint({ ...prepared.intent, nonce: source.intent.nonce }) !==
      fingerprint(source.intent)
    )
      deny();
    const maximumCostWei = maximumUserOperationCostV07(
      {
        ...operation,
        paymaster: config.acceptance.paymaster.address,
        paymasterData: '0x',
        paymasterVerificationGasLimit: config.paymaster.maximumVerificationGas,
        paymasterPostOpGasLimit: config.paymaster.maximumPostOpGas,
      },
      config.paymaster.l1FeeReserveWei,
    );
    const maximum = applicationGasBudgetLimit(
      config.sponsors,
      principal.clientId,
    );
    if (BigInt(maximumCostWei) > BigInt(maximum)) deny();
    const terms: SponsorshipConsentTerms = {
      operationId: id,
      sourceApprovalHash: fingerprint(source.approval),
      configurationHash: this.configurationHash,
      preparation: prepared,
      validAfter: '0',
      validUntil,
      maximumCostWei,
    };
    const termsHash = fingerprint(terms);
    let consent: Awaited<
      ReturnType<Safe4337SigningOptions['authorizeSponsorship']>
    >;
    try {
      consent = await this.authorizeConsent(context, structuredClone(terms));
    } catch {
      throw new WalletProviderError('wallet_attempt_unavailable');
    }
    if (
      !consent ||
      consent.termsHash !== termsHash ||
      typeof consent.consentReference !== 'string' ||
      !consent.consentReference.length ||
      consent.consentReference.length > 512
    )
      deny();
    await this.verifier.verify(
      prepared.intent,
      source.approval.account.address,
      operation.nonce,
    );
    const gasBudgetId = applicationGasBudgetId(
      preparation.providerOrigin,
      principal.issuer,
      principal.clientId,
      this.database.networkScope,
    );
    const fundingPolicy = applicationGasFunding(
      config.sponsors,
      principal.clientId,
    );
    const lifetimeBudget = applicationGasLifetimeBudget(
      config.sponsors,
      principal.clientId,
    );
    if (fundingPolicy && !consent.funding) deny();
    if (lifetimeBudget !== undefined)
      await this.database.setBudget(
        gasBudgetId,
        lifetimeBudget,
        this.actions.revision,
      );
    const record = await this.actions.withAuthorizedCalls(
      principal,
      id,
      (_state, latest) => {
        if (fingerprint(latest.approval) !== fingerprint(source.approval))
          deny();
        return this.database.sponsorship.reserve({
          id,
          source: source.approval,
          context,
          preparation,
          configurationHash: this.configurationHash,
          consentReference: consent!.consentReference,
          termsHash,
          gasBudgetId,
          ...(fundingPolicy
            ? {
                funding: {
                  ...consent!.funding!,
                  maximumPendingWei: fundingPolicy.maximumPendingWei,
                  maximumPendingOperations:
                    fundingPolicy.maximumPendingOperations,
                  accountingOnly: lifetimeBudget === undefined,
                },
              }
            : {}),
          maximumCostWei,
          validAfter: '0',
          validUntil,
        });
      },
    );
    return {
      operation_id: id,
      terms_hash: record.termsHash,
      maximum_cost_wei: record.maximumCostWei,
    };
  }
  private async phase(
    context: AuthorityContext,
    id: string,
    stage: 'stub' | 'final',
    operation: UserOperationV07,
  ): Promise<PaymasterStubV07> {
    operation = normalizeUserOperationV07(operation);
    const record = this.load(id);
    await this.current(context, record);
    const requestHash = fingerprint(operation);
    const claim = await this.actions.withAuthorizedCalls(
      context.principal,
      id,
      () => this.database.sponsorship.claim(id, stage, requestHash),
    );
    if (claim.state === 'succeeded') return claim.result;
    const client = createPaymasterClientV07(
      {
        ...this.config.paymaster,
        domain: this.config.acceptance.domain,
        paymaster: this.config.acceptance.paymaster.address,
        maximumCostWei: record.maximumCostWei,
        authorization: this.credential,
        authorizeRequest: async (request) => {
          if (
            fingerprint(request.operation) !== requestHash ||
            request.maximumCostWei !== record.maximumCostWei
          )
            deny();
          await this.current(context, this.load(id), false);
          return this.actions.withAuthorizedCalls(context.principal, id, () =>
            this.database.sponsorship.assertDispatch(
              id,
              stage,
              claim.token,
              requestHash,
            ),
          );
        },
      },
      this.request,
    );
    try {
      const contextValue = {
        applicationId: record.preparation.runtimePolicy.application_id,
        policyRevision: record.preparation.runtimePolicy.revision,
        policyHash: record.preparation.runtimePolicy.policy_hash,
        actionId: id,
      };
      const result = await (stage === 'stub'
        ? client.stub(operation, contextValue)
        : client.data(operation, contextValue));
      this.database.sponsorship.complete(id, stage, claim.token, result);
      return result;
    } catch (error) {
      this.database.sponsorship.complete(id, stage, claim.token, null);
      throw error;
    }
  }
  /** Replays only recorded successful quotes. Unknown/leased phases cannot contact the paymaster again. */
  async sponsor(context: AuthorityContext, id: string) {
    context = structuredClone(context);
    const record = this.load(id);
    const stub = await this.phase(
      context,
      id,
      'stub',
      record.preparation.operation,
    );
    let operation = {
      ...record.preparation.operation,
      paymaster: stub.paymaster,
      paymasterData: stub.paymasterData,
      paymasterVerificationGasLimit: stub.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: stub.paymasterPostOpGasLimit,
    };
    if (!stub.isFinal) {
      const final = await this.phase(context, id, 'final', operation);
      operation = {
        ...operation,
        paymaster: final.paymaster,
        paymasterData: final.paymasterData,
        paymasterVerificationGasLimit: final.paymasterVerificationGasLimit,
        paymasterPostOpGasLimit: final.paymasterPostOpGasLimit,
      };
    }
    await this.current(context, this.load(id), false);
    return operation;
  }
  private finalOperation(record: SponsorshipAdmission) {
    const stub = record.phases.stub?.result;
    const final = stub?.isFinal ? stub : record.phases.final?.result;
    if (!final || !final.isFinal) deny();
    const operation = {
      ...record.preparation.operation,
      paymaster: final.paymaster,
      paymasterData: final.paymasterData,
      paymasterVerificationGasLimit: final.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: final.paymasterPostOpGasLimit,
    };
    if (
      BigInt(
        maximumUserOperationCostV07(
          operation,
          this.config.paymaster.l1FeeReserveWei,
        ),
      ) > BigInt(record.maximumCostWei)
    )
      deny();
    return operation;
  }
  private approval(record: SponsorshipAdmission): FinancialApproval {
    const payload = safeOpPayloadV07(
      this.finalOperation(record),
      this.config.acceptance.domain,
      this.config.acceptance.module.address,
      record.validAfter,
      record.validUntil,
    );
    return {
      ...record.source,
      action: safeOpActionV07(
        payload,
        record.source.account,
        record.signingActionId,
        record.id,
      ),
      units: '0',
    };
  }
  private async authorizeSigning(
    context: AuthorityContext,
    approval: FinancialApproval,
  ): Promise<FinancialAuthorization | null> {
    if (approval.action.kind !== 'sign_typed_data') return null;
    const record = this.load(approval.action.operation_id);
    if (fingerprint(this.approval(record)) !== fingerprint(approval))
      return null;
    await this.current(context, record, false);
    const action = approval.action;
    return {
      ownerSubject: approval.ownerSubject,
      accountId: approval.account.accountId,
      address: approval.account.address,
      chainAccountId: action.chain_account_id,
      currentUserStatus: 'ID VERIFIED',
      grantId: approval.grantId,
      consentReference: approval.consentReference,
      policyRevision: approval.policyRevision,
      bindingRevision: action.binding_revision,
      capabilityRevision: action.capability_revision,
      planRevision: action.plan_revision,
      planHash: action.plan_hash,
      expiresAt: action.expires_at,
    };
  }
  private collectionView(record: SponsorshipAdmission) {
    const collection = record.signatureCollection ?? deny();
    const received = Object.keys(collection.signatures).sort();
    const expired = Number(record.validUntil) * 1000 <= Date.now();
    return {
      operation_id: record.id,
      batch_id: collection.batchId ?? null,
      account_id: record.preparation.input.account_id,
      payload_revision: collection.action.payload_hash,
      chain_id: collection.action.chain_id,
      safe_address: record.preparation.operation.sender,
      nonce: record.preparation.operation.nonce,
      expires_at: collection.action.expires_at,
      owner_policy: collection.policy,
      signing_payload: collection.action.payload,
      signing_hash: collection.action.payload_hash,
      calls: collection.calls,
      requested_action: record.preparation.input,
      collected_owners: received,
      signatures_required: collection.policy.threshold,
      additional_signatures_required: Math.max(
        0,
        collection.policy.threshold -
          received.length -
          (received.includes(collection.policy.providerSigner) ? 0 : 1),
      ),
      state:
        collection.state === 'cancelled'
          ? 'cancelled'
          : expired
            ? 'expired'
            : received.length >= collection.policy.threshold
              ? 'quorum-ready'
              : 'collecting',
    };
  }
  /** Publish only the immutable admitted SafeOp after final sponsorship fields are fixed. */
  async prepareSignatureRequest(
    context: AuthorityContext,
    id: string,
    anchor?: string,
  ) {
    const record = this.load(id);
    await this.current(context, record);
    const approval = this.approval(record);
    const account = this.terms(record).preparation.intent.account;
    const scanFromBlock =
      record.signatureCollection?.scanFromBlock ??
      anchor ??
      (await this.verifier.observeOwners(account.address)).blockNumber;
    const policy = normalizeSafeOwnerPolicy(
      account.ownerPolicy ??
        initialSafeOwnerPolicy(record.source.account.address),
    );
    await this.actions.withAuthorizedCalls(context.principal, id, (state) => {
      const latest = state.sponsorships?.[id] ?? deny();
      if (latest.signatureCollection) {
        if (
          fingerprint(latest.signatureCollection.action) !==
            fingerprint(approval.action) ||
          fingerprint(latest.signatureCollection.policy) !== fingerprint(policy)
        )
          deny();
      } else
        latest.signatureCollection = {
          batchId: Object.values(state.userOperationBatches ?? {}).find(
            (batch) => batch.operationId === id,
          )?.metadata.id,
          scanFromBlock,
          calls: this.terms(record).preparation.intent.calls,
          action:
            approval.action as import('../domain/signing.js').TypedDataAction,
          policy,
          signatures: {},
          state: 'collecting',
        };
    });
    return this.collectionView(this.load(id));
  }
  /** Observation-only operation identity; placeholder signatures can never be dispatched through this port. */
  signingExposure(id: string) {
    const record = this.load(id),
      collection = record.signatureCollection ?? deny();
    if (record.configurationHash !== this.configurationHash) deny();
    return {
      operation: {
        ...this.finalOperation(record),
        signature: solidityPacked(
          ['uint48', 'uint48', 'bytes'],
          [
            record.validAfter,
            record.validUntil,
            '0x' + '00'.repeat(collection.policy.threshold * 65),
          ],
        ),
      },
      record,
    };
  }
  async signatureRequest(
    principal: import('../domain/principal.js').VerifiedPrincipal,
    id: string,
  ) {
    await this.withExecutionRead(principal, id, () => true);
    return this.collectionView(this.load(id));
  }
  async submitOwnerSignature(
    context: AuthorityContext,
    id: string,
    input: { payload_revision: string; owner: string; signature: string },
  ) {
    context = structuredClone(context);
    input = structuredClone(input);
    const record = this.load(id);
    const collection = record.signatureCollection ?? deny();
    const owner = input.owner.toLowerCase();
    if (
      input.payload_revision === collection.action.payload_hash &&
      collection.signatures[owner] === input.signature.toLowerCase()
    ) {
      await this.withExecutionRead(context.principal, id, () => true);
      return this.collectionView(record);
    }
    await this.current(context, record);
    if (
      input.payload_revision !== collection.action.payload_hash ||
      collection.state !== 'collecting' ||
      !collection.policy.owners.includes(owner) ||
      owner === collection.policy.providerSigner
    )
      deny();
    try {
      safeOpSignatureV07(collection.action, owner, input.signature);
    } catch {
      throw new WalletProviderError('wallet_provider_input');
    }
    await this.actions.withAuthorizedCalls(context.principal, id, (state) => {
      const current = state.sponsorships?.[id]?.signatureCollection ?? deny();
      if (
        current.state !== 'collecting' ||
        fingerprint(current.action) !== fingerprint(collection.action) ||
        fingerprint(current.policy) !== fingerprint(collection.policy)
      )
        deny();
      const previous = current.signatures[owner];
      if (previous && previous !== input.signature.toLowerCase())
        throw new WalletProviderError('wallet_attempt_conflict');
      current.signatures[owner] = input.signature.toLowerCase();
    });
    return this.collectionView(this.load(id));
  }
  async cancelSignatureRequest(context: AuthorityContext, id: string) {
    const record = this.load(id);
    if (record.signatureCollection?.state === 'cancelled') {
      await this.withExecutionRead(context.principal, id, () => true);
      return this.collectionView(record);
    }
    await this.current(context, record);
    await this.actions.withAuthorizedCalls(context.principal, id, (state) => {
      if (state.userOperationExecutions?.[id]?.dispatch)
        throw new WalletProviderError('wallet_attempt_conflict');
      const collection =
        state.sponsorships?.[id]?.signatureCollection ?? deny();
      collection.state = 'cancelled';
    });
    return this.collectionView(this.load(id));
  }
  async sign(context: AuthorityContext, id: string) {
    context = structuredClone(context);
    const record = this.load(id);
    await this.current(context, record);
    const approval = this.approval(record);
    const policy = normalizeSafeOwnerPolicy(
      record.preparation.basePolicy.accounts.find(
        (a) => a.accountId === record.preparation.input.account_id,
      )?.ownerPolicy ?? initialSafeOwnerPolicy(record.source.account.address),
    );
    const collection = record.signatureCollection;
    if (collection?.state === 'cancelled') deny();
    const external = Object.entries(collection?.signatures ?? {})
      .filter(([owner]) => owner !== policy.providerSigner)
      .map(([owner, signature]) => ({ owner, signature }));
    if (
      policy.threshold > 1 &&
      (!collection || external.length < policy.threshold - 1)
    )
      throw new WalletProviderError('wallet_signatures_pending');
    if (
      collection &&
      (fingerprint(collection.policy) !== fingerprint(policy) ||
        collection.action.payload_hash !== approval.action.payload_hash)
    )
      deny();
    if (external.length >= policy.threshold) {
      return {
        ...this.finalOperation(record),
        signature: safeOpSignaturesV07(
          approval.action as import('../domain/signing.js').TypedDataAction,
          policy,
          external
            .sort((a, b) => a.owner.localeCompare(b.owner))
            .slice(0, policy.threshold),
        ),
      };
    }
    await this.database.approveAction(approval);
    const authority = await this.financial.authority.sign(
      context,
      record.signingActionId,
    );
    if (!authority) deny();
    const signature = await this.signer.signTypedData(
      authority.account,
      authority.action,
      authority.attemptId,
    );
    await this.current(context, this.load(id), false);
    const members = [
      ...external
        .sort((a, b) => a.owner.localeCompare(b.owner))
        .slice(0, policy.threshold - 1),
      { owner: authority.account.address, signature },
    ];
    await this.actions.withAuthorizedCalls(context.principal, id, (state) => {
      const current = state.sponsorships?.[id]?.signatureCollection;
      if (current?.state === 'cancelled') deny();
      if (current) current.signatures[policy.providerSigner] = signature;
    });
    return {
      ...this.finalOperation(record),
      signature: safeOpSignaturesV07(authority.action, policy, members),
    };
  }
}
