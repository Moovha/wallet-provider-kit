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
  readonly policy;
  private readonly adapters: Map<Vendor, IdentityAdapter>;
  constructor(
    input: OnboardingPolicy,
    readonly store: OnboardingStore,
    adapters: IdentityAdapter[] = [],
    private readonly walletReader?: Pick<WalletSigningProvider, 'findAccount'>,
    private readonly transferPolicyRevision?: string,
  ) {
    const resolved = defineOnboardingPolicy(input);
    if (
      (resolved.identity.records &&
        (adapters.length || transferPolicyRevision)) ||
      (resolved.access.mode === 'application' && adapters.length > 0)
    )
      throw new WalletProviderError('wallet_provider_configuration');
    this.policy = Object.freeze({
      ...resolved,
      revision: fingerprint([
        resolved.revision,
        adapters.map((a) => [a.vendor, a.policyFingerprint ?? a.vendor]).sort(),
      ]),
    });
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
      (request.input.authorization_details[0].actions.includes(
        'transfers:request',
      ) &&
        (!this.transferPolicyRevision ||
          request.transferPolicyRevision !== this.transferPolicyRevision))
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
      (request.input.authorization_details[0].actions.includes(
        'transfers:request',
      ) &&
        request.transferPolicyRevision !== this.transferPolicyRevision)
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
            permissions: state.grants[request.grantId!].permissions,
            expires_at: new Date(
              state.grants[request.grantId!].expiresAt,
            ).toISOString(),
          }
        : {}),
    };
  }
  async request(inputContext: AuthorityContext, value: AccessInput) {
    const context = this.context(inputContext);
    const input = normalizeInput(
      structuredClone(value),
      application(this.policy, context.principal),
      this.policy.identity.records,
      this.policy.access.mode === 'application',
    );
    const delegatesTransfers =
      input.authorization_details[0].actions.includes('transfers:request');
    if (delegatesTransfers && !this.transferPolicyRevision) deny();
    const assertion =
      this.policy.access.mode === 'application'
        ? checkApplicationAssertion(
            this.policy,
            context.principal,
            input.user,
            delegatesTransfers ? this.transferPolicyRevision : undefined,
          )
        : undefined;
    const key = fingerprint([
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      'request',
      context.idempotencyKey,
    ]);
    const hash = delegatesTransfers
      ? fingerprint([input, this.transferPolicyRevision])
      : fingerprint(input);
    return this.store.transaction((state) => {
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
        revision: this.policy.revision,
        ...(delegatesTransfers
          ? { transferPolicyRevision: this.transferPolicyRevision }
          : {}),
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
        for (const grant of Object.values(state.grants)) {
          const previousRequest = state.requests[grant.requestId];
          if (
            grant.owner === assertion.owner &&
            grant.withdrawnAt !== undefined &&
            previousRequest?.input.user &&
            (previousRequest.input.user.consent.reference ===
              input.user!.consent.reference ||
              assertion.consentAt <= grant.withdrawnAt)
          )
            deny();
        }
        const existing = Object.values(state.accounts).find(
          (account) => account.owner === assertion.owner,
        );
        if (
          input.mode === 'connect' &&
          state.accounts[request.accountId]?.owner !== assertion.owner
        )
          deny();
        if (existing) {
          if (
            existing.status !== 'active' ||
            (input.mode === 'connect' && existing.id !== request.accountId)
          )
            deny();
          request.accountId = existing.id;
        }
        request.owner = assertion.owner;
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
        state.accounts[request.accountId] = {
          ...existing,
          id: request.accountId,
          owner: assertion.owner,
          status: 'active',
          acceptedUntil: assertion.acceptedUntil,
          acceptanceRevision: this.policy.revision,
          evidenceHash: assertion.evidenceHash,
          identitySource: 'application_attestation',
        };
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
      ...(this.transferPolicyRevision
        ? { transfer_policy_revision: this.transferPolicyRevision }
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
      ...(request.transferPolicyRevision
        ? { transferPolicyRevision: request.transferPolicyRevision }
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
    principal: AccessRequest['caller'],
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
    const grant = Object.values(state.grants).find(
      (g) =>
        g.accountId === accountId &&
        sameCaller(g.caller, principal) &&
        g.owner === account.owner &&
        g.state === 'active' &&
        g.expiresAt > Date.now() &&
        g.revision === this.policy.revision &&
        (!permission || g.permissions.includes(permission)),
    );
    if (!grant) deny();
    if (permission === 'transfers:request') {
      const request = state.requests[grant.requestId];
      const consent = request?.consent;
      if (
        !this.transferPolicyRevision ||
        grant.transferPolicyRevision !== this.transferPolicyRevision ||
        request?.transferPolicyRevision !== this.transferPolicyRevision ||
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
        !request.input.authorization_details[0].actions.includes(
          'transfers:request',
        ) ||
        !application(this.policy, {
          ...principal,
          scopes: [],
        }).permissions?.includes('transfers:request')
      )
        deny();
    }
    return grant;
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
  async account(principal: VerifiedPrincipal, accountId: string) {
    return this.store.transaction((state) => {
      this.activeGrant(state, principal, accountId, 'account:read');
      const account = state.accounts[accountId];
      return {
        account_id: account.id,
        ...(account.identitySource
          ? {
              identity_source: account.identitySource,
              evaluation_only: account.identitySource === 'application_record',
            }
          : {}),
        ...(account.address ? { address: account.address } : {}),
        status: account.address ? 'provisioned' : 'accepted',
      };
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
            related.owner === grant.owner &&
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
        const current = this.activeGrant(state, admission.caller, accountId);
        return current.owner === grant.owner;
      });
    } catch {
      return false;
    }
  }
}
