import {
  currentRuntimePolicy,
  validateRuntimeClaims,
} from '../runtime-configuration/authority.js';
import {
  matchSharedAccount,
  sharingTerms,
  validateSharedAccess,
} from './wallet-sharing.js';
import { runtimeApplicationId } from '../runtime-configuration/service.js';
import {
  defaultWallet,
  walletDescription,
  requestPerson,
  resolveWalletInput,
  saveVerifiedUser,
  connectWalletMember,
  validateWalletMember,
  userOwner,
} from './wallets.js';
import { checkApplicationAssertion } from './application-access.js';
import { randomUUID } from 'node:crypto';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type { EmbeddedWalletAuthority } from '../domain/embedded-wallet.js';
import { WalletProviderError } from '../domain/signing.js';
import type { WalletSigningProvider } from '../domain/signing.js';
import { getAddress } from 'ethers';
import {
  application,
  defineOnboardingPolicy,
  deny,
  fingerprint,
  invalid,
  normalizeInput,
  text,
  uuid,
} from './policy.js';
import type {
  AccessGrant,
  AccessInput,
  AccessRequestInput,
  WalletMember,
  AccessRequest,
  IdentityAdapter,
  IdentityEvidence,
  OnboardingPolicy,
  OnboardingStore,
  OwnerIdentity,
  Permission,
  ProviderState,
  Vendor,
  ApplicationIdentityRecord,
} from './types.js';

export function ownerKey(
  owner: Pick<OwnerIdentity, 'issuer' | 'subject'>,
): string {
  return fingerprint([owner.issuer, owner.subject]);
}
function sameCaller(a: AccessRequest['caller'], b: AccessRequest['caller']) {
  return (
    a.issuer === b.issuer &&
    a.subject === b.subject &&
    a.clientId === b.clientId
  );
}
function conflict(): never {
  throw new WalletProviderError('wallet_attempt_conflict');
}
function audit(
  state: ProviderState,
  event: string,
  resource: string,
  revision: string,
) {
  state.audit.push({ at: Date.now(), event, resource, revision });
}
const day = 86400000;

/** Provider decisions are stored locally. Vendor results, OAuth scopes and share tokens cannot grant access. */
export class OnboardingService {
  readonly policy: import('./types.js').ResolvedPolicy;
  readonly installationPolicyRevision: string;
  private readonly adapters: Map<Vendor, IdentityAdapter>;
  constructor(
    input: OnboardingPolicy,
    readonly store: OnboardingStore,
    adapters: IdentityAdapter[] = [],
    private readonly walletReader?: Pick<WalletSigningProvider, 'findAccount'>,
    private readonly actionPolicyRevision?: string,
    readonly runtimeContracts = false,
    readonly safeOnlyWallet = false,
    liveApplications?: {
      userChecks?():
        | (import('./types.js').UserCheckSettings & { revision: number })
        | undefined;
      list(): import('./types.js').ApplicationPolicy[];
      current(
        principal: VerifiedPrincipal,
      ): import('./types.js').ApplicationPolicy;
    },
  ) {
    const resolved = defineOnboardingPolicy(input);
    if (
      (resolved.identity.records &&
        (adapters.length || actionPolicyRevision)) ||
      (resolved.access.mode === 'application' && adapters.length > 0) ||
      (runtimeContracts &&
        (resolved.access.mode !== 'application' || !actionPolicyRevision))
    )
      throw new WalletProviderError('wallet_provider_configuration');
    this.policy = Object.freeze({
      ...resolved,
      ...(liveApplications
        ? { currentApplication: liveApplications.current }
        : {}),
      revision: fingerprint([
        resolved.revision,
        adapters.map((a) => [a.vendor, a.policyFingerprint ?? a.vendor]).sort(),
      ]),
    });
    this.installationPolicyRevision = this.policy.revision;
    if (liveApplications) {
      const livePolicy = { ...this.policy };
      Object.defineProperty(livePolicy, 'applications', {
        enumerable: true,
        get: liveApplications.list,
      });
      if (liveApplications.userChecks) {
        const initialRevision = this.policy.revision;
        Object.defineProperties(livePolicy, {
          identity: {
            enumerable: true,
            get: () => {
              const checks = liveApplications.userChecks!();
              return checks
                ? Object.freeze({
                    ...resolved.identity,
                    maxAgeDays: checks.max_identity_age_days,
                    application: Object.freeze({
                      requiredFields: Object.freeze([
                        ...checks.required_fields,
                      ]),
                      verificationLevel: checks.verification_level,
                    }),
                  })
                : resolved.identity;
            },
          },
          access: {
            enumerable: true,
            get: () => {
              const checks = liveApplications.userChecks!();
              return checks
                ? Object.freeze({
                    ...resolved.access,
                    maxAgeDays: checks.max_access_days,
                  })
                : resolved.access;
            },
          },
          revision: {
            enumerable: true,
            get: () => {
              const checks = liveApplications.userChecks!();
              return checks
                ? fingerprint([initialRevision, checks])
                : initialRevision;
            },
          },
        });
      }
      this.policy = Object.freeze(livePolicy);
    }
    this.adapters = new Map(
      adapters.map((a) => [
        a.vendor,
        {
          vendor: a.vendor,
          price: a.price && structuredClone(a.price),
          verificationPrice:
            a.verificationPrice && structuredClone(a.verificationPrice),
          startVerification: a.startVerification?.bind(a),
          readByCorrelation: a.readByCorrelation?.bind(a),
          importShared: a.importShared.bind(a),
          read: a.read.bind(a),
        },
      ]),
    );
    if (this.adapters.size !== adapters.length)
      throw new WalletProviderError('wallet_provider_configuration');
  }
  private context(
    input: AuthorityContext,
    scope = 'wallet:access',
  ): AuthorityContext {
    const context = structuredClone(input);
    if (
      !uuid.test(context.idempotencyKey) ||
      !text(context.principal.subject) ||
      !context.principal.scopes.includes(scope)
    )
      deny();
    application(this.policy, context.principal);
    return context;
  }
  private actionRevision(
    state: ProviderState,
    principal: AccessRequest['caller'],
  ) {
    return this.runtimeContracts
      ? fingerprint([
          this.actionPolicyRevision,
          currentRuntimePolicy(state, principal),
        ])
      : this.actionPolicyRevision;
  }
  private requestRevisionCurrent(state: ProviderState, request: AccessRequest) {
    try {
      return (
        request.actionPolicyRevision ===
        this.actionRevision(state, request.caller)
      );
    } catch {
      return false;
    }
  }
  async applicationAccessPolicy(
    principal: VerifiedPrincipal,
    sourceApplicationId?: string,
  ) {
    return this.store.transaction((state) => {
      const terms = {
        ...this.accessPolicy(principal),
        ...(sourceApplicationId
          ? {
              wallet_sharing: sharingTerms(
                this.policy,
                principal,
                sourceApplicationId,
              ),
            }
          : {}),
      };
      if (!this.runtimeContracts) return terms;
      const snapshot = currentRuntimePolicy(state, principal);
      return {
        ...terms,
        action_policy_revision: this.actionRevision(state, principal),
        required_fields: [
          ...new Set([
            ...terms.required_fields,
            ...snapshot.policy.claim_requirements.map((claim) => claim.name),
          ]),
        ],
        runtime_contract_terms: snapshot,
      };
    });
  }
  private current(
    state: ProviderState,
    id: string,
    allowExpired = false,
  ): AccessRequest {
    const request = state.requests[id];
    if (
      !request ||
      request.revision !== this.policy.revision ||
      (!allowExpired && request.expiresAt <= Date.now()) ||
      (request.input.authorization_details[0].actions.some((permission) =>
        ['contracts:request'].includes(permission),
      ) &&
        (!this.actionPolicyRevision ||
          !this.requestRevisionCurrent(state, request)))
    )
      deny();
    application(this.policy, { ...request.caller, scopes: [] });
    return request;
  }
  private caller(state: ProviderState, context: AuthorityContext, id: string) {
    const request = this.current(state, id);
    if (!sameCaller(request.caller, context.principal)) deny();
    return request;
  }
  private freshOwner(identity: OwnerIdentity): string {
    if (
      !text(identity.issuer) ||
      !text(identity.subject) ||
      !Number.isFinite(identity.authenticatedAt) ||
      identity.authenticatedAt > Date.now() + 5000 ||
      identity.authenticatedAt < Date.now() - 300000
    )
      deny();
    return ownerKey(identity);
  }
  private stateOf(state: ProviderState, request: AccessRequest) {
    if (request.denied) return 'denied';
    if (
      request.revision !== this.policy.revision ||
      (request.input.authorization_details[0].actions.some((permission) =>
        ['contracts:request'].includes(permission),
      ) &&
        !this.requestRevisionCurrent(state, request))
    )
      return 'policy_changed';
    if (request.grantId) {
      const grant = state.grants[request.grantId];
      if (grant.state !== 'active') return grant.state;
      if (grant.expiresAt <= Date.now()) return 'expired';
      const account = state.accounts[grant.accountId];
      if (
        !account ||
        account.status !== 'active' ||
        account.acceptedUntil <= Date.now()
      )
        return 'verification_required';
      if (request.sharing || request.membership) {
        try {
          if (request.sharing)
            validateSharedAccess(this.policy, state, request);
          if (request.membership)
            validateWalletMember(this.policy, state, request);
        } catch {
          return 'policy_changed';
        }
      }
      return 'granted';
    }
    if (request.expiresAt <= Date.now()) return 'expired';
    if (!request.consent) return 'consent_required';
    if (request.fundingRequired) return 'funding_approval_required';
    if (request.importAttempt?.state === 'unknown')
      return 'reconciliation_required';
    if (request.importAttempt?.state === 'pending')
      return request.importAttempt.startedAt + 30000 <= Date.now()
        ? 'reconciliation_required'
        : 'identity_pending';
    if (request.evidence?.status === 'rejected') return 'denied';
    if (
      request.evidence ||
      request.verification ||
      request.input.identity_record
    )
      return 'provider_review_required';
    return 'verification_required';
  }
  private receipt(state: ProviderState, request: AccessRequest) {
    const status = this.stateOf(state, request);
    return {
      request_id: request.id,
      status,
      ...(this.policy.access.mode === 'hosted'
        ? {
            consent_url: `${this.policy.provider.origin}/onboarding/${request.id}`,
          }
        : {}),
      ...(request.grantId ? { grant_id: request.grantId } : {}),
      ...(status === 'granted'
        ? {
            account_id: request.accountId,
            ...(this.policy.access.mode === 'application'
              ? { wallet: walletDescription(state.accounts[request.accountId]) }
              : {}),
            ...(request.membership
              ? { membership_revision: request.membership.revision }
              : {}),
            permissions: state.grants[request.grantId!].permissions,
            expires_at: new Date(
              state.grants[request.grantId!].expiresAt,
            ).toISOString(),
          }
        : {}),
    };
  }
  async request(inputContext: AuthorityContext, value: AccessRequestInput) {
    const context = this.context(inputContext);
    const normalized = normalizeInput(
      structuredClone(value) as AccessInput,
      application(this.policy, context.principal),
      this.policy.identity.records,
      this.policy.access.mode === 'application',
    );
    if (
      normalized.mode !== 'connect_from_application' &&
      (normalized.user?.consent.source_application_id !== undefined ||
        normalized.user?.consent.sharing_revision !== undefined)
    )
      invalid();
    const delegatesTransfers = normalized.authorization_details[0].actions.some(
      (permission) => ['contracts:request'].includes(permission),
    );
    if (delegatesTransfers && !this.actionPolicyRevision) deny();
    const key = fingerprint([
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      'request',
      context.idempotencyKey,
    ]);
    return this.store.transaction((state) => {
      const input = resolveWalletInput(
        this.policy,
        state,
        context.principal,
        normalized,
      );
      const snapshot =
        delegatesTransfers && this.runtimeContracts
          ? currentRuntimePolicy(state, context.principal)
          : undefined;
      const actionRevision = delegatesTransfers
        ? this.actionRevision(state, context.principal)
        : undefined;
      const assertion =
        this.policy.access.mode === 'application'
          ? checkApplicationAssertion(
              this.policy,
              context.principal,
              input.user,
              actionRevision,
              snapshot?.policy.claim_requirements.map((claim) => claim.name),
            )
          : undefined;
      if (snapshot) validateRuntimeClaims(snapshot, input.user);
      const hash = delegatesTransfers
        ? fingerprint([normalized, actionRevision])
        : fingerprint(normalized);
      const previous = state.idempotency[key];
      if (previous) {
        if (previous.hash !== hash) conflict();
        return this.receipt(state, state.requests[previous.id]);
      }
      const request: AccessRequest = {
        id: randomUUID(),
        caller: {
          issuer: context.principal.issuer,
          subject: context.principal.subject,
          clientId: context.principal.clientId,
        },
        input,
        ...(snapshot ? { runtimePolicy: snapshot } : {}),
        revision: this.policy.revision,
        ...(delegatesTransfers ? { actionPolicyRevision: actionRevision } : {}),
        createdAt: Date.now(),
        expiresAt: Date.now() + day,
        accountId: input.account_id ?? randomUUID(),
      };
      if (assertion) {
        const evidenceKey = fingerprint([
          'application-evidence',
          context.principal.issuer,
          context.principal.clientId,
          input.user!.identity.reference,
        ]);
        if (
          state.evidenceOwners[evidenceKey] &&
          state.evidenceOwners[evidenceKey] !== assertion.owner
        )
          deny();
        state.evidenceOwners[evidenceKey] = assertion.owner;
        request.userOwner = assertion.owner;
        request.owner = assertion.owner;
        if (input.mode === 'create') {
          const description = input.wallet ?? defaultWallet;
          if (
            input.wallet &&
            input.user!.consent.wallet_reference !== description.reference
          )
            deny();
          const existing = Object.values(state.accounts).find(
            (account) =>
              walletDescription(account).reference === description.reference &&
              (account.owner === assertion.owner ||
                (description.reference === 'personal' &&
                  account.linkedOwners?.includes(assertion.owner))),
          );
          if (existing) {
            if (
              existing.owner !== assertion.owner ||
              existing.status !== 'active'
            )
              deny();
            if (
              input.wallet &&
              fingerprint(walletDescription(existing)) !==
                fingerprint(description)
            )
              conflict();
            request.accountId = existing.id;
          }
        } else if (input.mode === 'connect') {
          const account = state.accounts[request.accountId] ?? deny();
          if (account.owner !== assertion.owner)
            connectWalletMember(this.policy, state, request, assertion.owner);
          else if (
            walletDescription(account).reference !== 'personal' &&
            input.user!.consent.account_id !== account.id
          )
            deny();
        }
        request.consent = {
          at: assertion.consentAt,
          revision: this.policy.revision,
          privacyUrl: this.policy.provider.privacyUrl,
        };
        request.acceptance = {
          reviewer: 'application-policy',
          evidenceHash: assertion.evidenceHash,
          at: Date.now(),
          expiresAt: assertion.acceptedUntil,
          source: 'application_attestation',
        };
        if (input.mode === 'connect_from_application') {
          matchSharedAccount(this.policy, state, request, assertion.owner);
        } else if (!request.membership) {
          const existing = state.accounts[request.accountId];
          if (
            !existing &&
            Object.values(state.accounts).filter(
              (account) => account.owner === assertion.owner,
            ).length >= 100
          )
            deny();
          state.accounts[request.accountId] = {
            ...existing,
            creatorApplication: existing?.creatorApplication ?? {
              issuer: context.principal.issuer,
              clientId: context.principal.clientId,
            },
            wallet: existing?.wallet ?? input.wallet ?? { ...defaultWallet },
            id: request.accountId,
            owner: assertion.owner,
            status: 'active',
            acceptedUntil: assertion.acceptedUntil,
            acceptanceRevision: this.policy.revision,
            evidenceHash: assertion.evidenceHash,
            identitySource: 'application_attestation',
          };
        }
        for (const grant of Object.values(state.grants)) {
          const previousRequest = state.requests[grant.requestId];
          if (
            grant.accountId === request.accountId &&
            requestPerson(previousRequest) === assertion.owner &&
            grant.withdrawnAt !== undefined &&
            previousRequest?.input.user &&
            (previousRequest.input.user.consent.reference ===
              input.user!.consent.reference ||
              assertion.consentAt <= grant.withdrawnAt)
          )
            deny();
        }
        for (const previous of Object.values(state.requests)) {
          if (
            requestPerson(previous) === assertion.owner &&
            previous.input.user?.consent.reference ===
              input.user!.consent.reference &&
            previous.accountId !== request.accountId
          )
            deny();
        }
        saveVerifiedUser(
          this.policy,
          state,
          context.principal,
          input.user!,
          assertion,
        );
        this.grant(state, request);
        state.grants[request.grantId!].expiresAt = Math.min(
          state.grants[request.grantId!].expiresAt,
          assertion.expiresAt,
        );
        audit(
          state,
          'application_access_accepted',
          request.id,
          this.policy.revision,
        );
      }
      state.requests[request.id] = request;
      state.idempotency[key] = { hash, id: request.id };
      audit(state, 'access_requested', request.id, this.policy.revision);
      return this.receipt(state, request);
    });
  }
  async read(context: AuthorityContext, id: string) {
    const current = this.context(context, 'wallet:access:read');
    return this.store.transaction((state) => {
      const request = state.requests[id];
      if (!request || !sameCaller(request.caller, current.principal)) deny();
      return this.receipt(state, request);
    });
  }
  accessPolicy(principal: VerifiedPrincipal) {
    application(this.policy, principal);
    return {
      flow: this.policy.access.mode,
      policy_revision: this.policy.revision,
      ...(this.actionPolicyRevision
        ? {
            action_policy_revision: this.actionPolicyRevision,
          }
        : {}),
      max_identity_age_days: this.policy.identity.maxAgeDays,
      max_access_days: this.policy.access.maxAgeDays,
      ...(this.policy.identity.application
        ? {
            verification_level:
              this.policy.identity.application.verificationLevel,
          }
        : {}),
      source:
        this.policy.access.mode === 'application'
          ? 'application_attestation'
          : this.policy.identity.records
            ? 'application_record'
            : 'vendor_verification',
      evaluation_only: Boolean(this.policy.identity.records),
      required_fields: [
        ...(this.policy.identity.application?.requiredFields ??
          this.policy.identity.records?.requiredFields ??
          []),
      ],
      maximum_field_characters: 512,
      owner_consent_required: true,
      provider_login_required: this.policy.access.mode === 'hosted',
      provider_review_required: this.policy.access.mode === 'hosted',
    };
  }
  async submitRecords(
    inputContext: AuthorityContext,
    records: ApplicationIdentityRecord[],
  ) {
    const context = this.context(inputContext);
    if (!this.policy.identity.records) deny();
    if (!Array.isArray(records) || !records.length || records.length > 50)
      invalid();
    const policy = this.policy.identity.records;
    const app = application(this.policy, context.principal);
    const seen = new Set<string>();
    const inputs = structuredClone(records).map((record) => {
      try {
        const input = normalizeInput(
          {
            mode: 'create',
            identity_record: record,
            authorization_details: [
              {
                type: 'https://moovha.com/wallet/account-access',
                actions: ['account:read'],
              },
            ],
          },
          app,
          policy,
        );
        if (seen.has(input.identity_record!.reference)) return undefined;
        seen.add(input.identity_record!.reference);
        return input;
      } catch (error) {
        if (
          error instanceof WalletProviderError &&
          error.code === 'wallet_provider_input'
        )
          return undefined;
        throw error;
      }
    });
    const key = fingerprint([
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      'record-batch',
      context.idempotencyKey,
    ]);
    const hash = fingerprint(
      records.map((record, index) => inputs[index] ?? record),
    );
    await this.store.transaction((state) => {
      const previous = state.idempotency[key];
      if (previous && previous.hash !== hash) conflict();
      state.idempotency[key] = { hash, id: context.idempotencyKey };
    });
    const results: (
      | { index: number; status: 'invalid'; required_fields: string[] }
      | {
          index: number;
          status: 'submitted';
          receipt: Awaited<ReturnType<OnboardingService['request']>>;
        }
    )[] = [];
    for (const [index, input] of inputs.entries()) {
      if (!input) {
        results.push({
          index,
          status: 'invalid',
          required_fields: [...policy.requiredFields],
        });
        continue;
      }
      const bytes = fingerprint(['record-item', context.idempotencyKey, index])
        .slice(0, 32)
        .split('');
      bytes[12] = '4';
      bytes[16] = '8';
      const id = bytes.join('');
      const itemKey = [
        id.slice(0, 8),
        id.slice(8, 12),
        id.slice(12, 16),
        id.slice(16, 20),
        id.slice(20),
      ].join('-');
      const receipt = await this.request(
        { ...context, idempotencyKey: itemKey },
        input,
      );
      results.push({ index, status: 'submitted', receipt });
    }
    return { results };
  }
  async consentView(id: string, identity: OwnerIdentity) {
    const owner = this.freshOwner(identity);
    return this.store.transaction((state) => {
      const request = this.current(state, id, true);
      if (request.owner && request.owner !== owner) deny();
      if (
        request.input.mode === 'connect' &&
        state.accounts[request.accountId]?.owner !== owner
      )
        deny();
      const status = this.stateOf(state, request);
      return {
        application: application(this.policy, { ...request.caller, scopes: [] })
          .name,
        provider: this.policy.provider.name,
        privacyUrl: this.policy.provider.privacyUrl,
        permissions: request.input.authorization_details[0].actions,
        mode: request.input.mode,
        durationDays: this.policy.access.maxAgeDays,
        status,
        ...(this.policy.identity.records
          ? { identitySource: 'application_record' as const }
          : {}),
        ...(status === 'provider_review_required' &&
        request.verification &&
        !request.evidence
          ? { verificationUrl: request.verification.url }
          : {}),
      };
    });
  }
  private grant(state: ProviderState, request: AccessRequest) {
    const account = state.accounts[request.accountId];
    if (
      !request.owner ||
      !request.consent ||
      !account ||
      account.owner !== request.owner ||
      account.status !== 'active' ||
      account.acceptedUntil <= Date.now() ||
      account.acceptanceRevision !== this.policy.revision
    )
      deny();
    if (request.grantId) return;
    for (const previous of Object.values(state.grants)) {
      if (
        previous.accountId === request.accountId &&
        sameCaller(previous.caller, request.caller) &&
        requestPerson(state.requests[previous.requestId]) ===
          requestPerson(request) &&
        previous.state !== 'revoked'
      ) {
        previous.state = 'revoked';
        audit(state, 'access_superseded', previous.id, this.policy.revision);
      }
    }
    const grant: AccessGrant = {
      id: randomUUID(),
      requestId: request.id,
      accountId: request.accountId,
      owner: request.owner,
      caller: request.caller,
      permissions: [...request.input.authorization_details[0].actions],
      ...(request.actionPolicyRevision
        ? { actionPolicyRevision: request.actionPolicyRevision }
        : {}),
      revision: this.policy.revision,
      expiresAt: Math.min(
        Date.now() + this.policy.access.maxAgeDays * day,
        account.acceptedUntil,
      ),
      state: 'active',
    };
    state.grants[grant.id] = grant;
    request.grantId = grant.id;
    audit(state, 'access_granted', grant.id, this.policy.revision);
  }
  async consent(id: string, identity: OwnerIdentity, approve: boolean) {
    const owner = this.freshOwner(identity);
    return this.store.transaction((state) => {
      const request = this.current(state, id);
      if (request.denied || (request.owner && request.owner !== owner)) deny();
      if (
        request.input.mode === 'connect' &&
        state.accounts[request.accountId]?.owner !== owner
      )
        deny();
      request.owner = owner;
      request.ownerIdentity = {
        issuer: identity.issuer,
        subject: identity.subject,
      };
      if (!approve) {
        request.denied = true;
        if (request.grantId) state.grants[request.grantId].state = 'revoked';
      } else if (!request.consent)
        request.consent = {
          at: Date.now(),
          revision: this.policy.revision,
          privacyUrl: this.policy.provider.privacyUrl,
        };
      if (approve) {
        // One account per authenticated owner in this provider product. Concurrent create requests converge.
        const existing = Object.values(state.accounts).find(
          (a) => a.owner === owner,
        );
        if (request.input.mode === 'create' && existing)
          request.accountId = existing.id;
        const account = state.accounts[request.accountId];
        if (
          account &&
          account.status === 'active' &&
          account.acceptedUntil > Date.now() &&
          account.acceptanceRevision === this.policy.revision &&
          !this.policy.identity.records
        )
          this.grant(state, request);
      }
      audit(
        state,
        approve ? 'owner_consented' : 'owner_declined',
        request.id,
        this.policy.revision,
      );
      return this.receipt(state, request);
    });
  }
  async importIdentity(
    inputContext: AuthorityContext,
    id: string,
    vendor: Vendor,
    token: string,
  ) {
    const context = this.context(inputContext);
    const adapter = this.adapters.get(vendor);
    if (!adapter || !text(token, vendor === 'sumsub' ? 1024 : 16384)) invalid();
    const hash = fingerprint([vendor, token]);
    const mutationKey = fingerprint([
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      'identity',
      context.idempotencyKey,
    ]);
    const mutationHash = fingerprint([id, hash]);
    const admission = await this.store.transaction((state) => {
      const request = this.caller(state, context, id);
      const previous = state.idempotency[mutationKey];
      if (previous && previous.hash !== mutationHash) conflict();
      if (!request.consent || !request.owner) deny();
      if (request.importAttempt) {
        if (request.importAttempt.fingerprint !== hash) conflict();
        state.idempotency[mutationKey] = { hash: mutationHash, id };
        return { dispatch: false, receipt: this.receipt(state, request) };
      }
      if (request.denied || request.grantId) deny();
      state.idempotency[mutationKey] = { hash: mutationHash, id };
      const app = application(this.policy, context.principal);
      const terms = adapter.price;
      const budgetKey = fingerprint([
        app.issuer,
        app.clientId,
        new Date().toISOString().slice(0, 7),
      ]);
      const used = state.budgets[budgetKey] ?? 0;
      if (
        !terms ||
        !app.funding ||
        used + terms.maximumMinor > app.funding.monthlyLimitMinor
      ) {
        request.fundingRequired = true;
        return {
          dispatch: false,
          receipt: {
            ...this.receipt(state, request),
            status: 'funding_approval_required',
          },
        };
      }
      delete request.fundingRequired;
      state.budgets[budgetKey] = used + terms.maximumMinor;
      request.importAttempt = {
        vendor,
        fingerprint: hash,
        state: 'pending',
        budgetKey,
        reservedMinor: terms.maximumMinor,
        startedAt: Date.now(),
      };
      audit(state, 'identity_import_reserved', id, this.policy.revision);
      return { dispatch: true, receipt: this.receipt(state, request) };
    });
    if (!admission.dispatch) return admission.receipt;
    let evidence: IdentityEvidence;
    try {
      await this.store.transaction((state) => {
        const current = this.caller(state, context, id);
        if (
          !current.consent ||
          current.denied ||
          current.grantId ||
          current.importAttempt?.state !== 'pending'
        )
          deny();
      });
      evidence = await adapter.importShared(token, id);
    } catch {
      await this.store.transaction((state) => {
        const attempt = state.requests[id]?.importAttempt;
        if (attempt?.fingerprint === hash) attempt.state = 'unknown';
        audit(state, 'identity_import_unknown', id, this.policy.revision);
      });
      throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
    }
    return this.store.transaction((state) => {
      const request = state.requests[id];
      if (
        request.importAttempt?.fingerprint !== hash ||
        request.importAttempt.state !== 'pending'
      )
        conflict();
      if (evidence.vendor !== vendor || evidence.correlation !== id)
        throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
      request.evidence = evidence;
      request.importAttempt.state = 'complete';
      audit(state, 'identity_imported', id, this.policy.revision);
      return this.receipt(state, request);
    });
  }
  verificationVendors() {
    return [...this.adapters.values()]
      .filter((a) => a.startVerification)
      .map((a) => a.vendor);
  }
  async startVerification(id: string, identity: OwnerIdentity, vendor: Vendor) {
    const owner = this.freshOwner(identity);
    const adapter = this.adapters.get(vendor);
    if (!adapter?.startVerification) invalid();
    const admitted = await this.store.transaction((state) => {
      const request = this.current(state, id);
      if (
        request.owner !== owner ||
        !request.consent ||
        request.denied ||
        request.grantId
      )
        deny();
      if (request.verification)
        return {
          dispatch: false,
          url: request.verification.url,
          status: 'verification_started',
        };
      if (request.importAttempt)
        return { dispatch: false, status: this.stateOf(state, request) };
      const app = application(this.policy, { ...request.caller, scopes: [] });
      const terms = adapter.verificationPrice;
      const budgetKey = fingerprint([
        app.issuer,
        app.clientId,
        new Date().toISOString().slice(0, 7),
      ]);
      const used = state.budgets[budgetKey] ?? 0;
      if (
        !terms ||
        !app.funding ||
        used + terms.maximumMinor > app.funding.monthlyLimitMinor
      ) {
        request.fundingRequired = true;
        return { dispatch: false, status: 'funding_approval_required' };
      }
      delete request.fundingRequired;
      state.budgets[budgetKey] = used + terms.maximumMinor;
      request.importAttempt = {
        vendor,
        fingerprint: fingerprint(['fresh', vendor]),
        state: 'pending',
        budgetKey,
        reservedMinor: terms.maximumMinor,
        startedAt: Date.now(),
      };
      audit(state, 'verification_reserved', id, this.policy.revision);
      return { dispatch: true, status: 'identity_pending' };
    });
    if (!admitted.dispatch) return admitted;
    let started: { url: string; reference?: string };
    try {
      await this.store.transaction((state) => {
        const current = this.current(state, id);
        if (
          current.owner !== owner ||
          !current.consent ||
          current.denied ||
          current.grantId ||
          current.importAttempt?.state !== 'pending'
        )
          deny();
      });
      started = await adapter.startVerification(id);
    } catch {
      await this.store.transaction((state) => {
        state.requests[id].importAttempt!.state = 'unknown';
        audit(state, 'verification_unknown', id, this.policy.revision);
      });
      throw new WalletProviderError('wallet_identity_unavailable', 'unknown');
    }
    return this.store.transaction((state) => {
      const request = state.requests[id];
      request.verification = { vendor, ...started };
      request.importAttempt!.state = 'complete';
      return {
        dispatch: false,
        status: 'verification_started',
        url: started.url,
      };
    });
  }
  private reviewer(principal: VerifiedPrincipal) {
    // Staff principals are authenticated by a separate provider-owned authentication adapter at HTTP boundary.
    if (
      !principal.scopes.includes('wallet:review') ||
      !text(principal.issuer) ||
      !text(principal.subject)
    )
      deny();
    return fingerprint([principal.issuer, principal.subject]);
  }
  async reviews(principal: VerifiedPrincipal) {
    this.reviewer(principal);
    return this.store.transaction((state) =>
      Object.values(state.requests)
        .filter(
          (r) =>
            r.consent &&
            !r.denied &&
            !r.grantId &&
            !r.acceptance &&
            r.revision === this.policy.revision,
        )
        .map((r) => ({
          requestId: r.id,
          owner: r.ownerIdentity,
          vendor: r.evidence?.vendor ?? r.importAttempt?.vendor,
          reference: r.evidence?.reference ?? r.verification?.reference,
          verifiedAt: r.evidence?.verifiedAt,
          status: this.stateOf(state, r),
          ...(this.policy.identity.records && r.input.identity_record
            ? {
                applicationRecord: structuredClone(r.input.identity_record),
                application: application(this.policy, {
                  ...r.caller,
                  scopes: [],
                }).name,
              }
            : {}),
        })),
    );
  }
  async providerAccounts(principal: VerifiedPrincipal) {
    this.reviewer(principal);
    return this.store.transaction((state) =>
      Object.values(state.accounts).map((a) => ({
        id: a.id,
        status: a.status,
        provisioned: Boolean(a.address),
      })),
    );
  }
  async suspendAccount(principal: VerifiedPrincipal, id: string) {
    this.reviewer(principal);
    return this.store.transaction((state) => {
      const account = state.accounts[id];
      if (!account) deny();
      account.status = 'suspended';
      for (const grant of Object.values(state.grants))
        if (grant.accountId === id) grant.state = 'revoked';
      audit(state, 'provider_suspended_account', id, this.policy.revision);
    });
  }
  async reconcileAccount(principal: VerifiedPrincipal, id: string) {
    this.reviewer(principal);
    if (!this.walletReader || !uuid.test(id)) invalid();
    await this.store.transaction((state) => {
      if (!state.accounts[id]) deny();
      if (
        Object.values(state.attempts).some(
          (a) =>
            a.request.accountId === id &&
            a.state === 'dispatch' &&
            a.expiresAt > Date.now(),
        )
      )
        conflict();
    });
    let account;
    try {
      account = await this.walletReader.findAccount(id);
    } catch {
      throw new WalletProviderError('wallet_onboarding_unavailable', 'unknown');
    }
    if (!account) return { status: 'not_found' };
    let address: string;
    try {
      if (account.accountId !== id || /^0x0{40}$/.test(account.address))
        throw new Error();
      address = getAddress(account.address);
    } catch {
      throw new WalletProviderError('wallet_onboarding_unavailable', 'unknown');
    }
    return this.store.transaction((state) => {
      const record = state.accounts[id];
      if (!record || (record.address && record.address !== address)) conflict();
      const attempts = Object.values(state.attempts).filter(
        (a) => a.request.accountId === id && a.request.kind === 'provision',
      );
      if (
        !attempts.length ||
        attempts.some((a) => a.state === 'dispatch' && a.expiresAt > Date.now())
      )
        conflict();
      record.address = address;
      for (const attempt of attempts) {
        attempt.state = 'succeeded';
        attempt.result = {
          kind: 'provision',
          account: { accountId: id, address },
        };
        delete attempt.failure;
      }
      audit(state, 'wallet_reconciled_read_only', id, this.policy.revision);
      return { status: 'reconciled' };
    });
  }
  async review(
    principal: VerifiedPrincipal,
    id: string,
    input: {
      decision: 'accept' | 'reject';
      identity_matches_owner: boolean;
      verified_at?: string;
      reference?: string;
      vendor?: Vendor;
    },
  ) {
    const reviewer = this.reviewer(principal);
    if (
      !['accept', 'reject'].includes(input.decision) ||
      typeof input.identity_matches_owner !== 'boolean'
    )
      invalid();
    const before = await this.store.transaction((state) => {
      const request = this.current(state, id, true);
      if (
        !request.owner ||
        !request.consent ||
        request.denied ||
        request.grantId
      )
        deny();
      return request;
    });
    if (input.decision === 'reject')
      return this.store.transaction((state) => {
        const request = this.current(state, id, true);
        if (request.grantId) conflict();
        request.denied = true;
        audit(state, 'provider_rejected', id, this.policy.revision);
        return this.receipt(state, request);
      });
    if (this.policy.identity.records) {
      const record = before.input.identity_record;
      if (!record || !input.identity_matches_owner) deny();
      if (input.vendor || input.reference || input.verified_at) invalid();
      return this.acceptReviewed(reviewer, id, before, {
        evidenceKey: fingerprint([
          'application-record',
          before.caller.issuer,
          before.caller.clientId,
          record.reference,
        ]),
        evidenceHash: fingerprint([before.caller, record, before.revision]),
        expiresAt: Date.now() + this.policy.identity.maxAgeDays * day,
        source: 'application_record',
      });
    }
    const vendor =
      before.evidence?.vendor ??
      before.verification?.vendor ??
      before.importAttempt?.vendor ??
      input.vendor;
    let reference =
      before.evidence?.reference ??
      before.verification?.reference ??
      input.reference;
    if (
      !vendor ||
      (input.reference && reference && input.reference !== reference) ||
      (input.vendor && input.vendor !== vendor)
    )
      invalid();
    const adapter = this.adapters.get(vendor);
    if (!adapter) invalid();
    const expectedReference = reference;
    const evidence = reference
      ? await adapter.read(reference, id)
      : adapter.readByCorrelation
        ? await adapter.readByCorrelation(id)
        : invalid();
    reference = evidence.reference;
    const verifiedAt = evidence.verifiedAt ?? input.verified_at;
    if (
      input.verified_at &&
      evidence.verifiedAt &&
      Date.parse(input.verified_at) !== Date.parse(evidence.verifiedAt)
    )
      invalid();
    const verifiedTime = Date.parse(verifiedAt ?? '');
    // Reviewer explicitly attests correspondence with the authenticated owner and source freshness.
    if (
      !input.identity_matches_owner ||
      typeof verifiedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(verifiedAt) ||
      evidence.status !== 'approved' ||
      evidence.vendor !== vendor ||
      evidence.correlation !== id ||
      evidence.reference !== reference ||
      (expectedReference !== undefined &&
        evidence.reference !== expectedReference) ||
      !Number.isFinite(verifiedTime) ||
      verifiedTime > Date.now() + 5000 ||
      verifiedTime < Date.now() - this.policy.identity.maxAgeDays * day
    )
      deny();
    if (
      new Date(verifiedTime).toISOString().slice(0, 19) !==
      verifiedAt.slice(0, 19)
    )
      deny();
    return this.acceptReviewed(reviewer, id, before, {
      evidenceKey: fingerprint([vendor, reference]),
      expiresAt: verifiedTime + this.policy.identity.maxAgeDays * day,
      evidence: {
        ...evidence,
        verifiedAt: new Date(verifiedTime).toISOString(),
      },
    });
  }
  private async acceptReviewed(
    reviewer: string,
    id: string,
    before: AccessRequest,
    proof: {
      evidenceKey: string;
      evidenceHash?: string;
      expiresAt: number;
      evidence?: IdentityEvidence;
      source?: 'application_record';
    },
  ) {
    return this.store.transaction((state) => {
      const request = this.current(state, id, true);
      if (
        request.owner !== before.owner ||
        request.denied ||
        !request.consent ||
        request.grantId ||
        fingerprint(request.evidence) !== fingerprint(before.evidence) ||
        fingerprint(request.input) !== fingerprint(before.input)
      )
        conflict();
      const { evidenceKey, expiresAt } = proof;
      const evidenceHash = proof.evidenceHash ?? evidenceKey;
      if (
        state.evidenceOwners[evidenceKey] &&
        state.evidenceOwners[evidenceKey] !== request.owner
      )
        deny();
      const existing = Object.values(state.accounts).find(
        (a) => a.owner === request.owner,
      );
      if (request.input.mode === 'create' && existing)
        request.accountId = existing.id;
      const account = state.accounts[request.accountId];
      if (account && account.owner !== request.owner) deny();
      if (proof.evidence) request.evidence = proof.evidence;
      request.acceptance = {
        reviewer,
        evidenceHash,
        at: Date.now(),
        expiresAt,
        ...(proof.source ? { source: proof.source } : {}),
      };
      if (request.importAttempt) request.importAttempt.state = 'complete';
      state.evidenceOwners[evidenceKey] = request.owner!;
      state.accounts[request.accountId] = {
        ...account,
        id: request.accountId,
        owner: request.owner!,
        status: 'active',
        acceptedUntil: expiresAt,
        acceptanceRevision: this.policy.revision,
        evidenceHash,
        ...(proof.source ? { identitySource: proof.source } : {}),
      };
      if (!proof.source)
        delete state.accounts[request.accountId].identitySource;
      // A completed identity review can be reused, but expired application consent cannot create access.
      if (request.expiresAt > Date.now()) this.grant(state, request);
      audit(state, 'provider_accepted', id, this.policy.revision);
      return this.receipt(state, request);
    });
  }
  private activeGrant(
    state: ProviderState,
    principal: AccessRequest['caller'] & { accessGrantId?: string },
    accountId: string,
    permission?: Permission,
  ) {
    const account = state.accounts[accountId];
    if (
      !account ||
      account.status !== 'active' ||
      account.acceptedUntil <= Date.now() ||
      account.acceptanceRevision !== this.policy.revision
    )
      deny();
    application(this.policy, { ...principal, scopes: [] });
    if (
      walletDescription(account).kind === 'shared' &&
      !principal.accessGrantId
    )
      deny();
    const grant = Object.values(state.grants).find(
      (g) =>
        (!principal.accessGrantId || g.id === principal.accessGrantId) &&
        g.accountId === accountId &&
        sameCaller(g.caller, principal) &&
        g.owner === account.owner &&
        g.state === 'active' &&
        g.expiresAt > Date.now() &&
        g.revision === this.policy.revision &&
        (!permission || g.permissions.includes(permission)),
    );
    if (!grant) deny();
    const accessRequest = state.requests[grant.requestId];
    if (accessRequest?.sharing)
      validateSharedAccess(this.policy, state, accessRequest);
    if (accessRequest?.membership)
      validateWalletMember(this.policy, state, accessRequest);
    if (
      permission &&
      !application(this.policy, {
        ...principal,
        scopes: [],
      }).permissions?.includes(permission) &&
      application(this.policy, { ...principal, scopes: [] }).permissions !==
        undefined
    )
      deny();
    if (permission === 'contracts:request') {
      const request = state.requests[grant.requestId];
      const consent = request?.consent;
      if (
        !this.actionPolicyRevision ||
        grant.actionPolicyRevision !== this.actionRevision(state, principal) ||
        !request ||
        !this.requestRevisionCurrent(state, request) ||
        !consent ||
        !Number.isFinite(consent.at) ||
        consent.at > Date.now() ||
        consent.revision !== this.policy.revision ||
        request.revision !== this.policy.revision ||
        request.denied ||
        request.grantId !== grant.id ||
        request.accountId !== accountId ||
        request.owner !== grant.owner ||
        !sameCaller(request.caller, principal) ||
        !request.input.authorization_details[0].actions.includes(permission) ||
        !application(this.policy, {
          ...principal,
          scopes: [],
        }).permissions?.includes(permission)
      )
        deny();
      if (this.runtimeContracts)
        validateRuntimeClaims(
          currentRuntimePolicy(state, principal),
          request.input.user,
        );
    }
    return grant;
  }
  /** Verify a current, independently consented sharing grant for an application-bound Safe. */
  hasSharedWalletAccess(
    state: ProviderState,
    applicationId: string,
    accountId: string,
  ): boolean {
    for (const grant of Object.values(state.grants)) {
      if (
        grant.accountId !== accountId ||
        (!state.requests[grant.requestId]?.sharing &&
          !state.requests[grant.requestId]?.membership) ||
        runtimeApplicationId(grant.caller.issuer, grant.caller.clientId) !==
          applicationId
      )
        continue;
      try {
        this.activeGrant(
          state,
          { ...grant.caller, accessGrantId: grant.id },
          accountId,
          'contracts:request',
        );
        return true;
      } catch (error) {
        if (
          !(error instanceof WalletProviderError) ||
          error.code !== 'wallet_authorization_denied'
        )
          throw error;
        /* A stale grant cannot extend wallet infrastructure authority. */
      }
    }
    return false;
  }
  async authorize(
    principal: VerifiedPrincipal,
    accountId: string,
    permission: Permission,
  ) {
    return this.store.transaction((state) =>
      this.activeGrant(state, principal, accountId, permission),
    );
  }
  /** Run synchronous trusted storage work in the same transaction as current account-access checks. */
  async withAccountAccess<T>(
    principal: VerifiedPrincipal,
    accountId: string,
    permission: Permission,
    operation: (state: ProviderState, grant: AccessGrant) => T,
  ): Promise<T> {
    return this.store.transaction((state) =>
      operation(
        state,
        this.activeGrant(state, principal, accountId, permission),
      ),
    );
  }
  async account(principal: VerifiedPrincipal, accountId: string) {
    return this.store.transaction((state) => {
      this.activeGrant(state, principal, accountId, 'account:read');
      const account = state.accounts[accountId];
      return {
        account_id: account.id,
        ...(this.policy.access.mode === 'application'
          ? { wallet: walletDescription(account) }
          : {}),
        ...(account.identitySource
          ? {
              identity_source: account.identitySource,
              evaluation_only: account.identitySource === 'application_record',
            }
          : {}),
        ...(this.safeOnlyWallet
          ? state.deploymentBindings?.['service-v1']?.runtimeConfiguration
              ?.safeWalletAccounts?.[accountId]?.status === 'ready'
            ? {
                address:
                  state.deploymentBindings['service-v1'].runtimeConfiguration!
                    .safeWalletAccounts![accountId].binding.address,
              }
            : {}
          : account.address
            ? { address: account.address }
            : {}),
        status: (
          this.safeOnlyWallet
            ? state.deploymentBindings?.['service-v1']?.runtimeConfiguration
                ?.safeWalletAccounts?.[accountId]?.status === 'ready'
            : !!account.address
        )
          ? 'provisioned'
          : 'accepted',
      };
    });
  }
  /** Return only this application's currently consented wallets for its exact private user reference. */
  async wallets(context: AuthorityContext, userId: string) {
    const current = this.context(context, 'wallet:account:read');
    if (!text(userId)) invalid();
    const personId = userOwner(current.principal, userId);
    return this.store.transaction((state) => {
      const accounts = [];
      const defaultAccount =
        Object.values(state.accounts).find(
          (account) =>
            account.owner === personId &&
            walletDescription(account).reference === 'personal',
        ) ??
        Object.values(state.accounts).find(
          (account) =>
            account.linkedOwners?.includes(personId) &&
            walletDescription(account).reference === 'personal',
        );
      for (const grant of Object.values(state.grants)) {
        if (
          !sameCaller(grant.caller, current.principal) ||
          requestPerson(state.requests[grant.requestId]) !== personId
        )
          continue;
        try {
          this.activeGrant(
            state,
            { ...current.principal, accessGrantId: grant.id },
            grant.accountId,
            'account:read',
          );
          const account = state.accounts[grant.accountId];
          accounts.push({
            account_id: account.id,
            is_default: defaultAccount?.id === account.id,
            wallet: walletDescription(account),
            grant_id: grant.id,
            permissions: [...grant.permissions],
            expires_at: new Date(grant.expiresAt).toISOString(),
            role: state.requests[grant.requestId].membership
              ? 'member'
              : 'owner',
          });
        } catch (error) {
          if (
            !(error instanceof WalletProviderError) ||
            error.code !== 'wallet_authorization_denied'
          )
            throw error;
        }
      }
      accounts.sort(
        (a, b) =>
          Number(b.wallet.reference === 'personal') -
            Number(a.wallet.reference === 'personal') ||
          a.account_id.localeCompare(b.account_id),
      );
      return { accounts };
    });
  }
  private memberManager(
    state: ProviderState,
    principal: VerifiedPrincipal,
    accountId: string,
  ) {
    if (this.policy.access.mode !== 'application') deny();
    const grant = this.activeGrant(
      state,
      principal,
      accountId,
      'members:manage',
    );
    const account = state.accounts[accountId],
      request = state.requests[grant.requestId];
    if (
      walletDescription(account).kind !== 'shared' ||
      request.membership ||
      (requestPerson(request) !== account.owner && !request.sharing)
    )
      deny();
    return { account, request };
  }
  private memberReceipt(
    account: import('./types.js').AccountRecord,
    principal: VerifiedPrincipal,
  ) {
    return {
      account_id: account.id,
      wallet: walletDescription(account),
      revision: account.membersRevision ?? 0,
      members: Object.values(account.members ?? {}).map((member) => ({
        member_id: member.id,
        application_id: member.clientId,
        name: member.name ?? 'Member',
        ...(member.issuer === principal.issuer &&
        member.clientId === principal.clientId
          ? { user_id: member.userId }
          : {}),
        permissions: [...member.permissions],
        membership_revision: member.revision,
        status: member.state,
      })),
    };
  }
  async members(principal: VerifiedPrincipal, accountId: string) {
    return this.store.transaction((state) =>
      this.memberReceipt(
        this.memberManager(state, principal, accountId).account,
        principal,
      ),
    );
  }
  async saveMember(
    context: AuthorityContext,
    accountId: string,
    input: {
      expected_revision: number;
      user_id?: string;
      member_id?: string;
      name?: string;
      enabled: boolean;
      permissions: Permission[];
    },
  ) {
    const current = this.context(context);
    if (
      !Number.isInteger(input.expected_revision) ||
      input.expected_revision < 0 ||
      typeof input.enabled !== 'boolean' ||
      !Array.isArray(input.permissions) ||
      !input.permissions.length ||
      input.permissions.some(
        (p) => !['account:read', 'contracts:request'].includes(p),
      ) ||
      !input.permissions.includes('account:read') ||
      new Set(input.permissions).size !== input.permissions.length ||
      (input.user_id !== undefined
        ? !text(input.user_id) || input.member_id !== undefined
        : !/^[a-f0-9]{64}$/.test(input.member_id ?? '')) ||
      (input.name !== undefined && !text(input.name, 80))
    )
      invalid();
    const digest = fingerprint(input),
      commandKey = fingerprint([
        'wallet-member',
        current.principal.issuer,
        current.principal.clientId,
        current.principal.accessGrantId,
        accountId,
        current.idempotencyKey,
      ]);
    return this.store.transaction((state) => {
      const { account, request: managerRequest } = this.memberManager(
        state,
        current.principal,
        accountId,
      );
      const commands = (state.managementCommands ??= {});
      const previous = commands[commandKey];
      if (previous) {
        if (previous.hash !== digest) conflict();
        return previous.result as ReturnType<
          OnboardingService['memberReceipt']
        >;
      }
      if (input.expected_revision !== (account.membersRevision ?? 0))
        conflict();
      const id = input.user_id
        ? userOwner(current.principal, input.user_id)
        : input.member_id!;
      if (id === account.owner || id === requestPerson(managerRequest)) deny();
      const members = (account.members ??= {}),
        before = members[id];
      if (
        !before &&
        (!input.user_id || !input.enabled || Object.keys(members).length >= 100)
      )
        deny();
      const source = account.creatorApplication ?? deny();
      const issuer = before?.issuer ?? current.principal.issuer,
        clientId = before?.clientId ?? current.principal.clientId;
      const sourceSharing =
        input.enabled &&
        (issuer !== source.issuer || clientId !== source.clientId)
          ? {
              applicationId: source.clientId,
              revision: sharingTerms(
                this.policy,
                { issuer, clientId },
                source.clientId,
              ).revision,
            }
          : before?.sourceSharing;
      const permissions = [...input.permissions].sort();
      if (
        !before ||
        before.state === 'removed' ||
        fingerprint([before.permissions, before.name, before.sourceSharing]) !==
          fingerprint([
            permissions,
            input.name ?? before?.name,
            sourceSharing,
          ]) ||
        !input.enabled
      ) {
        const member: WalletMember = {
          id,
          issuer,
          clientId,
          userId: before?.userId ?? input.user_id!,
          name: input.name ?? before?.name,
          permissions,
          revision: (before?.revision ?? 0) + 1,
          state: input.enabled ? 'invited' : 'removed',
          ...(sourceSharing ? { sourceSharing } : {}),
        };
        members[id] = member;
        account.membersRevision = (account.membersRevision ?? 0) + 1;
        for (const request of Object.values(state.requests))
          if (
            request.accountId === accountId &&
            request.membership?.personId === id
          ) {
            request.denied = true;
            if (request.grantId)
              state.grants[request.grantId].state = 'revoked';
          }
        audit(
          state,
          input.enabled ? 'wallet_member_invited' : 'wallet_member_removed',
          fingerprint([accountId, id]),
          String(member.revision),
        );
      }
      for (const [id, value] of Object.entries(commands))
        if (value.at + day <= Date.now()) delete commands[id];
      if (Object.keys(commands).length >= 10000) conflict();
      const result = this.memberReceipt(account, current.principal);
      commands[commandKey] = { hash: digest, result, at: Date.now() };
      return result;
    });
  }
  async revokeApplicationGrant(context: AuthorityContext, id: string) {
    const current = this.context(context);
    if (this.policy.access.mode !== 'application') deny();
    return this.store.transaction((state) => {
      const grant = state.grants[id];
      if (!grant || !sameCaller(grant.caller, current.principal)) deny();
      const key = fingerprint([
        current.principal.issuer,
        current.principal.subject,
        current.principal.clientId,
        'revoke',
        current.idempotencyKey,
      ]);
      const hash = fingerprint(id);
      if (state.idempotency[key] && state.idempotency[key].hash !== hash)
        conflict();
      state.idempotency[key] = { hash, id };
      const withdrawnAt = grant.withdrawnAt ?? Date.now();
      const reference =
        state.requests[grant.requestId]?.input.user?.consent.reference;
      for (const related of Object.values(state.grants)) {
        if (
          related.id === grant.id ||
          (reference &&
            related.accountId === grant.accountId &&
            requestPerson(state.requests[related.requestId]) ===
              requestPerson(state.requests[grant.requestId]) &&
            related.owner === grant.owner &&
            related.caller.issuer === grant.caller.issuer &&
            related.caller.clientId === grant.caller.clientId &&
            state.requests[related.requestId]?.input.user?.consent.reference ===
              reference)
        ) {
          related.state = 'revoked';
          related.withdrawnAt ??= withdrawnAt;
        }
      }
      audit(state, 'application_access_revoked', id, this.policy.revision);
      return { grant_id: id, status: 'revoked' as const };
    });
  }
  async ownerRequests(identity: OwnerIdentity) {
    const owner = this.freshOwner(identity);
    return this.store.transaction((state) =>
      Object.values(state.requests)
        .filter(
          (r) => r.owner === owner && !r.denied && !r.grantId && !r.acceptance,
        )
        .map((r) => ({
          id: r.id,
          application:
            this.policy.applications.find(
              (a) =>
                a.issuer === r.caller.issuer &&
                a.clientId === r.caller.clientId,
            )?.name ?? 'Disconnected application',
          status: this.stateOf(state, r),
        })),
    );
  }
  async cancelPending(id: string, identity: OwnerIdentity) {
    const owner = this.freshOwner(identity);
    return this.store.transaction((state) => {
      const request = state.requests[id];
      if (
        !request ||
        request.owner !== owner ||
        request.grantId ||
        request.acceptance
      )
        deny();
      request.denied = true;
      audit(state, 'owner_cancelled_request', id, this.policy.revision);
      return this.receipt(state, request);
    });
  }
  async ownerGrants(identity: OwnerIdentity) {
    const owner = this.freshOwner(identity);
    return this.store.transaction((state) =>
      Object.values(state.grants)
        .filter((g) => g.owner === owner)
        .map((g) => ({
          id: g.id,
          application:
            this.policy.applications.find(
              (a) =>
                a.issuer === g.caller.issuer &&
                a.clientId === g.caller.clientId,
            )?.name ?? 'Disconnected application',
          permissions: g.permissions,
          state: g.state,
          expiresAt: g.expiresAt,
        })),
    );
  }
  async changeGrant(
    id: string,
    stateValue: 'suspended' | 'revoked',
    identity: OwnerIdentity | VerifiedPrincipal,
  ) {
    if (!['suspended', 'revoked'].includes(stateValue)) invalid();
    const owner =
      'authenticatedAt' in identity ? this.freshOwner(identity) : undefined;
    if (!owner) this.reviewer(identity as VerifiedPrincipal);
    return this.store.transaction((state) => {
      const grant = state.grants[id];
      if (!grant || (owner && grant.owner !== owner)) deny();
      if (grant.state === 'revoked' && stateValue !== 'revoked') deny();
      grant.state = stateValue;
      if (stateValue === 'revoked') grant.withdrawnAt ??= Date.now();
      audit(state, 'access_' + stateValue, id, this.policy.revision);
      return { grant_id: id, status: grant.state };
    });
  }
  /** Use on an existing financial authority; exact-action approval still belongs to that authority. */
  bindWalletAuthority(
    authority: EmbeddedWalletAuthority,
  ): EmbeddedWalletAuthority {
    return {
      provision: async (context, accountId) => {
        const grant = await this.store.transaction((state) =>
          this.activeGrant(state, context.principal, accountId),
        );
        const result = await authority.provision(context, accountId);
        if (!result || result.ownerSubject !== grant.owner) deny();
        await this.authorizeCurrent(context.principal, accountId);
        return result;
      },
      sign: async (context, actionId) => {
        const result = await authority.sign(context, actionId);
        if (!result) deny();
        const grant = await this.authorize(
          context.principal,
          result.accountId,
          'operations:request',
        );
        if (grant.owner !== result.ownerSubject) deny();
        return result;
      },
    };
  }
  async authorizeCurrent(principal: VerifiedPrincipal, accountId: string) {
    return this.store.transaction((state) =>
      this.activeGrant(state, principal, accountId),
    );
  }
  /** Ready-to-compose creation authority. No signing is enabled without an exact-action host integration. */
  walletAuthority(): EmbeddedWalletAuthority {
    return {
      provision: async (input, accountId) => {
        const context = this.context(input, 'wallet:provision');
        return this.store.transaction((state) => {
          const grant = this.activeGrant(state, context.principal, accountId);
          const access = state.requests[grant.requestId];
          if (access?.membership || access?.sharing) deny();
          const key = fingerprint([
            context.principal.issuer,
            context.principal.subject,
            context.principal.clientId,
            'provision',
            context.idempotencyKey,
          ]);
          const hash = fingerprint(accountId);
          const previous = state.idempotency[key];
          if (previous && previous.hash !== hash) conflict();
          // One durable creation attempt per account, even if the requester changes its idempotency key.
          const prior = Object.entries(state.admissions).find(
            ([, a]) => a.accountId === accountId,
          );
          const attemptId = previous?.id ?? prior?.[0] ?? randomUUID();
          state.idempotency[key] = { hash, id: attemptId };
          if (!state.admissions[attemptId])
            state.admissions[attemptId] = {
              accountId,
              grantId: grant.id,
              caller: { ...grant.caller },
            };
          return {
            sessionSubject: grant.owner,
            ownerSubject: grant.owner,
            currentUserStatus: 'ID VERIFIED',
            accountId,
            attemptId,
          };
        });
      },
      sign: async () => null,
    };
  }
  async canDispatchProvision(attemptId: string, accountId: string) {
    try {
      return await this.store.transaction((state) => {
        const admission = state.admissions[attemptId];
        if (!admission || admission.accountId !== accountId) return false;
        const grant = state.grants[admission.grantId];
        if (!grant) return false;
        const current = this.activeGrant(
          state,
          { ...admission.caller, accessGrantId: admission.grantId },
          accountId,
        );
        return current.owner === grant.owner;
      });
    } catch {
      return false;
    }
  }
}
