import { randomBytes, randomUUID } from 'node:crypto';
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
export interface TransferRecord {
  approval: FinancialApproval & { action: TypedDataAction };
  revision: string;
  status: 'authorizing' | 'authorized' | 'denied';
}
const transferTypes = {
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
/** Fixed transfer construction and provider policy authorization under an explicit owner delegation. HTTP never supplies typed data or authority records. */
export class SupportedActions {
  readonly revision: string;
  private readonly policy: TransferPolicy;
  constructor(
    readonly onboarding: OnboardingService,
    private readonly database: ProviderDatabase,
    policy: TransferPolicy,
    revision?: string,
  ) {
    this.policy = structuredClone(policy);
    this.revision =
      revision ?? fingerprint([onboarding.policy.revision, policy]);
  }
  /** Public terms shown when the owner delegates transfers during onboarding. */
  consentTerms() {
    return structuredClone(this.policy);
  }
  private current(record: TransferRecord, includeDenied = false) {
    try {
      const { action, account, units } = record.approval;
      const { domain, message, types, primaryType } = action.payload;
      const expiry = Date.parse(action.expires_at);
      const expectedDomain = {
        name: this.policy.token.name,
        version: this.policy.token.version,
        chainId: '84532',
        verifyingContract: this.policy.token.address,
      };
      if (
        record.revision !== this.revision ||
        !Number.isFinite(expiry) ||
        expiry <= Date.now() ||
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
  private async binding(principal: VerifiedPrincipal, accountId: string) {
    const grant = await this.onboarding.authorize(
      principal,
      accountId,
      'transfers:request',
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
  ) {
    this.current(record, includeDenied);
    const approval = record.approval;
    if (!sameCaller(principal, approval.caller)) deny();
    const { grant, account } = await this.binding(
      principal,
      approval.account.accountId,
    );
    if (
      grant.id !== approval.grantId ||
      grant.owner !== approval.ownerSubject ||
      grant.requestId !== approval.consentReference ||
      approval.policyRevision !== this.revision ||
      account.address?.toLowerCase() !== approval.account.address.toLowerCase()
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
        chainId: '84532',
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
        chain_id: 'eip155:84532',
        chain_account_id: `eip155:84532:${account.address}`,
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
  private receipt(record: TransferRecord) {
    const action = record.approval.action;
    return {
      action_id: action.action_id,
      account_id: record.approval.account.accountId,
      status: record.status,
      expires_at: action.expires_at,
      payload_hash: action.payload_hash,
      payload: action.payload,
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
