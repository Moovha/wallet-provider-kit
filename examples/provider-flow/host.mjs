import { createHash, randomUUID } from 'node:crypto';
import { TypedDataEncoder } from 'ethers';
import { WalletProviderError } from '@moovha/wallet-provider-kit/core';
import { createFixtureBackend } from './backend.mjs';

/** @typedef {import('@moovha/wallet-provider-kit/core').AuthorityContext} Context */
/** @typedef {import('@moovha/wallet-provider-kit/core').TypedDataAction} Action */
/** @typedef {import('@moovha/wallet-provider-kit/core').WalletAttemptRequest} Attempt */

export const oauth = {
  issuer: 'https://identity.example.test',
  audience: 'offline-provider-example',
  jwksUrl: 'https://identity.example.test/jwks',
};

/** Offline test fixture only: no environment configuration, network client or storage adapter. */
export function createFixtureHost() {
  const accountId = randomUUID();
  const owner = 'fixture-owner';
  const fixture = createFixtureBackend(accountId);
  const account = fixture.account;
  const state = {
    grantActive: true,
    consentActive: true,
    kyc: 'ID VERIFIED',
  };
  /** @type {Map<string, { request: string, attemptId: string }>} */
  const admissions = new Map();
  /** @type {Map<string, { kind: 'provision' | 'sign_typed_data', resourceId: string, requestHash?: string, resourceKey?: string }>} */
  const attempts = new Map();

  /** @param {string} challenge @returns {Action} */
  function approvedAction(challenge) {
    const payload = {
      domain: {
        name: 'OfflineWalletAccessExample',
        version: '1',
        chainId: '84532',
      },
      types: { Proof: [{ name: 'challenge', type: 'string' }] },
      primaryType: 'Proof',
      message: { challenge },
    };
    return {
      action_id: randomUUID(),
      operation_id: randomUUID(),
      kind: 'sign_typed_data',
      profile: 'evm_eoa_v1',
      profile_revision: '1',
      status: 'ready',
      chain_id: 'eip155:84532',
      chain_account_id: `eip155:84532:${account.address}`,
      binding_revision: '1',
      capability_revision: '1',
      plan_revision: '1',
      plan_hash: '0x' + createHash('sha256').update(challenge).digest('hex'),
      dependencies: [],
      expires_at: new Date(Date.now() + 300000).toISOString(),
      payload,
      payload_hash: TypedDataEncoder.hash(
        payload.domain,
        payload.types,
        payload.message,
      ),
    };
  }
  // A trusted host has already reviewed/committed these harmless proof actions.
  // There is intentionally no HTTP endpoint that accepts signable bytes.
  const action = approvedAction('ordinary-offline-proof');
  const uncertainAction = approvedAction('lost-response-offline-proof');
  const actions = new Map(
    [action, uncertainAction].map((value) => [
      value.action_id,
      structuredClone(value),
    ]),
  );

  /** @param {Context} context @param {string} scope */
  function currentOwner(context, scope) {
    const principal = context.principal;
    // Resolve the configured service principal through an owner/client-bound grant.
    // The service-account subject is deliberately DIFFERENT from the wallet owner.
    return (
      principal.issuer === oauth.issuer &&
      principal.clientId === 'fixture-client' &&
      principal.subject === 'fixture-application-service' &&
      principal.scopes.includes(scope) &&
      state.grantActive &&
      state.consentActive &&
      state.kyc === 'ID VERIFIED'
    );
  }

  /** @param {Context} context @param {'provision' | 'sign_typed_data'} kind @param {string} resourceId */
  function admit(context, kind, resourceId) {
    const key = [
      context.principal.issuer,
      context.principal.clientId,
      owner,
      context.idempotencyKey,
    ].join(':');
    const request = `${kind}:${resourceId}`;
    const existing = admissions.get(key);
    if (existing) {
      if (existing.request !== request)
        throw new WalletProviderError('wallet_attempt_conflict');
      return existing.attemptId;
    }
    const attemptId = randomUUID();
    admissions.set(key, { request, attemptId });
    attempts.set(attemptId, { kind, resourceId });
    return attemptId;
  }

  /** @type {import('@moovha/wallet-provider-kit/core').EmbeddedWalletAuthority} */
  const authority = {
    async provision(context, requestedAccount) {
      if (
        !currentOwner(context, 'wallet:provision') ||
        requestedAccount !== accountId
      )
        return null;
      return {
        sessionSubject: owner,
        ownerSubject: owner,
        currentUserStatus: state.kyc,
        accountId,
        attemptId: admit(context, 'provision', accountId),
      };
    },
    async sign(context, actionId) {
      const stored = actions.get(actionId);
      if (
        !currentOwner(context, 'wallet:sign') ||
        !fixture.isProvisioned() ||
        !stored ||
        stored.status !== 'ready' ||
        Date.parse(stored.expires_at) <= Date.now()
      )
        return null;
      return {
        sessionSubject: owner,
        ownerSubject: owner,
        currentUserStatus: state.kyc,
        accountId,
        attemptId: admit(context, 'sign_typed_data', actionId),
        account: { ...account },
        chainAccountId: stored.chain_account_id,
        bindingRevision: '1',
        capabilityRevision: '1',
        action: structuredClone(stored),
      };
    },
  };

  /** @param {Attempt} request */
  async function authorizeAttempt(request) {
    const admitted = attempts.get(request.attemptId);
    if (
      !admitted ||
      request.namespace !== 'offline-provider-example' ||
      request.provider !== 'offline-fixture' ||
      request.accountId !== accountId ||
      request.kind !== admitted.kind ||
      !state.grantActive ||
      !state.consentActive ||
      state.kyc !== 'ID VERIFIED'
    )
      return false;
    if (admitted.kind === 'sign_typed_data') {
      const stored = actions.get(admitted.resourceId);
      if (
        !fixture.isProvisioned() ||
        !stored ||
        stored.status !== 'ready' ||
        Date.parse(stored.expires_at) <= Date.now()
      )
        return false;
    }
    // All action bytes come from the private host map. Freeze their wrapper fingerprint
    // on first use and compare on every dispatch/replay in this single-run fixture.
    if (
      admitted.requestHash &&
      (admitted.requestHash !== request.requestHash ||
        admitted.resourceKey !== request.resourceKey)
    )
      return false;
    admitted.requestHash = request.requestHash;
    admitted.resourceKey = request.resourceKey;
    return true;
  }

  return {
    accountId,
    action: structuredClone(action),
    uncertainAction: structuredClone(uncertainAction),
    authority,
    backend: fixture.provider,
    loseNextSigningResponse: fixture.loseNextSigningResponse,
    authorizeAttempt,
    state,
    calls: fixture.calls,
  };
}
