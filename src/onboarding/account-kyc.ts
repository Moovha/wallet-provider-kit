import { randomUUID } from 'node:crypto';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import type {
  AccountKycInput,
  CreateAccountInput,
  ProviderState,
  ResolvedPolicy,
} from './types.js';
import {
  application,
  deny,
  fingerprint,
  invalid,
  text,
  uuid,
} from './policy.js';
import { defaultWallet, userOwner, walletDescription } from './wallets.js';

export function creatorAccount(
  policy: ResolvedPolicy,
  state: ProviderState,
  principal: VerifiedPrincipal,
  accountId: string,
) {
  const app = application(policy, principal);
  const account = state.accounts[accountId];
  if (
    policy.access.mode !== 'application' ||
    !app.assertionTrust ||
    !account ||
    account.status !== 'active' ||
    account.creatorApplication?.issuer !== principal.issuer ||
    account.creatorApplication.clientId !== principal.clientId
  )
    deny();
  return account;
}
export function deferredAccount(
  policy: ResolvedPolicy,
  state: ProviderState,
  principal: VerifiedPrincipal,
  accountId: string,
) {
  const account = creatorAccount(policy, state, principal, accountId);
  if (
    !account.deferredCreation ||
    account.deferredCreation.revision !== policy.revision ||
    !principal.scopes.includes('wallet:provision')
  )
    deny();
  return account;
}
export function kycReceipt(
  policy: ResolvedPolicy,
  state: ProviderState,
  principal: VerifiedPrincipal,
  accountId: string,
) {
  const account = creatorAccount(policy, state, principal, accountId);
  const fields =
    account.kycDraft?.fields ??
    state.verifiedUsers?.[account.owner]?.identity.fields ??
    {};
  return {
    account_id: accountId,
    revision: account.kycDraft?.revision ?? 0,
    fields: structuredClone(fields),
    missing_fields: (policy.identity.application?.requiredFields ?? []).filter(
      (field) => !fields[field],
    ),
    status: 'draft' as const,
  };
}
export function createDeferredAccount(
  policy: ResolvedPolicy,
  state: ProviderState,
  context: AuthorityContext,
  input: CreateAccountInput,
) {
  const app = application(policy, context.principal);
  if (policy.access.mode !== 'application' || !app.assertionTrust) deny();
  if (
    !input ||
    Object.keys(input).some((k) => !['user_id', 'wallet'].includes(k)) ||
    !text(input.user_id)
  )
    invalid();
  const wallet = input.wallet ?? defaultWallet;
  if (
    !wallet ||
    Object.keys(wallet).some(
      (k) => !['reference', 'name', 'kind'].includes(k),
    ) ||
    !/^[a-z][a-z0-9_-]{0,63}$/.test(wallet.reference) ||
    !text(wallet.name, 80) ||
    !['personal', 'shared'].includes(wallet.kind) ||
    (wallet.reference === 'personal' &&
      fingerprint(wallet) !== fingerprint(defaultWallet))
  )
    invalid();
  const owner = userOwner(context.principal, input.user_id);
  const key = fingerprint([
    context.principal.issuer,
    context.principal.clientId,
    context.principal.subject,
    'create-deferred',
    context.idempotencyKey,
  ]);
  const hash = fingerprint(input);
  const previous = state.idempotency[key];
  if (previous && previous.hash !== hash)
    throw new WalletProviderError('wallet_attempt_conflict');
  const existing = previous
    ? state.accounts[previous.id]
    : Object.values(state.accounts).find(
        (a) =>
          a.owner === owner &&
          walletDescription(a).reference === wallet.reference,
      );
  if (existing) {
    creatorAccount(policy, state, context.principal, existing.id);
    if (fingerprint(walletDescription(existing)) !== fingerprint(wallet))
      throw new WalletProviderError('wallet_attempt_conflict');
    state.idempotency[key] = { hash, id: existing.id };
    return {
      account_id: existing.id,
      status: 'verification_required' as const,
      wallet: walletDescription(existing),
    };
  }
  if (
    Object.values(state.accounts).filter((a) => a.owner === owner).length >= 100
  )
    deny();
  const id = randomUUID();
  state.accounts[id] = {
    id,
    owner,
    creatorApplication: {
      issuer: context.principal.issuer,
      clientId: context.principal.clientId,
    },
    wallet: structuredClone(wallet),
    status: 'active',
    acceptedUntil: 0,
    acceptanceRevision: policy.revision,
    evidenceHash: '',
    deferredCreation: { revision: policy.revision },
    kycDraft: { revision: 0, fields: {} },
  };
  state.idempotency[key] = { hash, id };
  state.audit.push({
    at: Date.now(),
    event: 'account_created_without_kyc',
    resource: id,
    revision: policy.revision,
  });
  return {
    account_id: id,
    status: 'verification_required' as const,
    wallet: structuredClone(wallet),
  };
}
export function patchAccountKyc(
  policy: ResolvedPolicy,
  state: ProviderState,
  context: AuthorityContext,
  accountId: string,
  input: AccountKycInput,
) {
  if (!uuid.test(accountId)) invalid();
  const account = creatorAccount(policy, state, context.principal, accountId);
  const rules = policy.identity.application ?? deny();
  if (
    !input ||
    Object.keys(input).some(
      (k) => !['expected_revision', 'fields'].includes(k),
    ) ||
    !Number.isSafeInteger(input.expected_revision) ||
    input.expected_revision < 0 ||
    !input.fields ||
    typeof input.fields !== 'object' ||
    Array.isArray(input.fields) ||
    !Object.keys(input.fields).length ||
    Object.entries(input.fields).some(
      ([k, v]) =>
        !rules.requiredFields.includes(k) ||
        (v !== null && (!text(v, 512) || !v.trim())),
    )
  )
    invalid();
  const key = fingerprint([
    context.principal.issuer,
    context.principal.clientId,
    context.principal.subject,
    'patch-kyc',
    accountId,
    context.idempotencyKey,
  ]);
  const hash = fingerprint(input);
  const previous = state.managementCommands?.[key];
  if (previous) {
    if (previous.hash !== hash)
      throw new WalletProviderError('wallet_attempt_conflict');
    return structuredClone(previous.result) as ReturnType<typeof kycReceipt>;
  }
  if ((account.kycDraft?.revision ?? 0) !== input.expected_revision)
    throw new WalletProviderError('wallet_attempt_conflict');
  const fields = {
    ...(account.kycDraft?.fields ??
      state.verifiedUsers?.[account.owner]?.identity.fields ??
      {}),
  };
  for (const [key, value] of Object.entries(input.fields)) {
    if (value === null) delete fields[key];
    else fields[key] = value;
  }
  account.kycDraft = { revision: input.expected_revision + 1, fields };
  // Changed identity facts require new evidence and fresh consent across the owner's wallets.
  if (state.verifiedUsers) delete state.verifiedUsers[account.owner];
  for (const owned of Object.values(state.accounts))
    if (owned.owner === account.owner) owned.acceptedUntil = 0;
  for (const grant of Object.values(state.grants))
    if (grant.owner === account.owner) grant.state = 'revoked';
  for (const request of Object.values(state.requests))
    if (request.owner === account.owner) request.denied = true;
  const result = kycReceipt(policy, state, context.principal, accountId);
  (state.managementCommands ??= {})[key] = {
    hash,
    result: structuredClone(result),
    at: Date.now(),
  };
  state.audit.push({
    at: Date.now(),
    event: 'account_kyc_updated',
    resource: accountId,
    revision: policy.revision,
  });
  return result;
}
