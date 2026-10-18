import {
  bindExecutionMechanism,
  approvalMechanism,
} from './execution-binding.js';
import { randomUUID } from 'node:crypto';
import type {
  EmbeddedWalletAuthority,
  SigningAuthority,
} from '../domain/embedded-wallet.js';
import type { AuthorityContext } from '../domain/principal.js';
import type {
  RelayerExecutionAuthority,
  RelayerExecutionAuthorityRecord,
} from '../domain/relayer-execution.js';
import { validateRelayerAction } from '../domain/relayer-execution.js';
import type { WalletAttemptRequest } from '../domain/attempt-journal.js';
import { WalletProviderError } from '../domain/signing.js';
import { baseSepoliaPayload } from '../providers/evm-typed-data.js';
import { createWalletAttemptRequest } from '../providers/attempt-lifecycle.js';
import { fingerprint, text, uuid } from '../onboarding/policy.js';
import { StorageConnection, unavailable } from './connection.js';
import { admission, sqliteJournal, units } from './journal.js';
import type {
  FinancialApproval,
  FinancialAuthorityOptions,
  FinancialAuthorization,
} from './types.js';

export function approvalId(approval: FinancialApproval) {
  return approval.action.kind === 'sign_typed_data'
    ? approval.action.action_id
    : approval.action.actionId;
}

function revisions(approval: FinancialApproval) {
  const action = approval.action;
  return action.kind === 'sign_typed_data'
    ? {
        bindingRevision: action.binding_revision,
        capabilityRevision: action.capability_revision,
        planRevision: action.plan_revision,
        planHash: action.plan_hash,
        expiresAt: action.expires_at,
      }
    : {
        bindingRevision: action.bindingRevision,
        capabilityRevision: action.capabilityRevision,
        planRevision: action.planRevision,
        planHash: action.planHash,
        expiresAt: action.expiresAt,
      };
}

export function validateApproval(
  approval: FinancialApproval,
  unexpired = true,
) {
  if (
    !approval ||
    ![
      approval.ownerSubject,
      approval.grantId,
      approval.consentReference,
      approval.policyRevision,
      approval.budgetId,
      approval.caller?.issuer,
      approval.caller?.subject,
      approval.caller?.clientId,
    ].every((v) => text(v)) ||
    !uuid.test(approvalId(approval))
  )
    throw new WalletProviderError('wallet_provider_input');
  units(approval.units);
  const revision = revisions(approval);
  if (
    ![
      revision.bindingRevision,
      revision.capabilityRevision,
      revision.planRevision,
    ].every((v) => /^[1-9][0-9]{0,19}$/.test(v)) ||
    !/^0x[0-9a-f]{64}$/.test(revision.planHash) ||
    !Number.isFinite(Date.parse(revision.expiresAt)) ||
    (unexpired && Date.parse(revision.expiresAt) <= Date.now())
  )
    throw new WalletProviderError('wallet_provider_input');
  if (approval.action.kind === 'sign_typed_data') {
    if (
      !uuid.test(approval.action.operation_id) ||
      !Array.isArray(approval.action.dependencies)
    )
      throw new WalletProviderError('wallet_provider_input');
    // Expired actions may be read for reconciliation, but can never authorize signing/replay.
    if (unexpired) baseSepoliaPayload(approval.account, approval.action);
  } else validateRelayerAction(approval.account, approval.action, unexpired);
}

export function loadApproval(
  connection: StorageConnection,
  id: string,
  unexpired = true,
): FinancialApproval | null {
  const row = connection.get(
    'SELECT record,revoked,fingerprint FROM approvals WHERE id=?',
    id,
  );
  if (!row || row.revoked !== 0) return null;
  const approval: FinancialApproval = JSON.parse(String(row.record));
  if (fingerprint(approval) !== row.fingerprint || approvalId(approval) !== id)
    unavailable();
  validateApproval(approval, unexpired);
  return approval;
}

export function storeApproval(
  connection: StorageConnection,
  input: FinancialApproval,
) {
  const approval = structuredClone(input);
  validateApproval(approval);
  return connection.transaction(() => {
    const id = approvalId(approval);
    const previous = connection.get(
      'SELECT fingerprint,revoked FROM approvals WHERE id=?',
      id,
    );
    const hash = fingerprint(approval);
    if (previous) {
      if (previous.fingerprint !== hash || previous.revoked !== 0)
        throw new WalletProviderError('wallet_attempt_conflict');
      return id;
    }
    if (!connection.get('SELECT id FROM budgets WHERE id=?', approval.budgetId))
      throw new WalletProviderError('wallet_authorization_denied');
    connection.run(
      'INSERT INTO approvals(id,account_id,kind,fingerprint,record) VALUES(?,?,?,?,?)',
      id,
      approval.account.accountId,
      approval.action.kind,
      hash,
      JSON.stringify(approval),
    );
    connection.audit('action_approved', id);
    return id;
  });
}

function attemptFor(
  options: Pick<FinancialAuthorityOptions, 'namespace' | 'provider'>,
  approval: FinancialApproval,
  attemptId: string,
) {
  return createWalletAttemptRequest(
    options.namespace,
    options.provider,
    approval.action.kind,
    approval.account.accountId,
    attemptId,
    approvalId(approval),
    {
      account: {
        accountId: approval.account.accountId,
        address: approval.account.address.toLowerCase(),
      },
      action: approval.action,
    },
  );
}

function sameCaller(context: AuthorityContext, approval: FinancialApproval) {
  return (
    context.principal.issuer === approval.caller.issuer &&
    context.principal.subject === approval.caller.subject &&
    context.principal.clientId === approval.caller.clientId
  );
}

function matches(
  approval: FinancialApproval,
  current: FinancialAuthorization | null,
) {
  const expected = revisions(approval);
  return (
    !!current &&
    current.currentUserStatus === 'ID VERIFIED' &&
    current.ownerSubject === approval.ownerSubject &&
    current.accountId === approval.account.accountId &&
    typeof current.address === 'string' &&
    current.address.toLowerCase() === approval.account.address.toLowerCase() &&
    typeof current.chainAccountId === 'string' &&
    current.chainAccountId.toLowerCase() ===
      (approval.action.kind === 'sign_typed_data'
        ? approval.action.chain_account_id
        : approval.action.chainAccountId
      ).toLowerCase() &&
    current.grantId === approval.grantId &&
    current.consentReference === approval.consentReference &&
    current.policyRevision === approval.policyRevision &&
    current.bindingRevision === expected.bindingRevision &&
    current.capabilityRevision === expected.capabilityRevision &&
    current.planRevision === expected.planRevision &&
    current.planHash === expected.planHash &&
    Number.isFinite(Date.parse(current.expiresAt)) &&
    Date.parse(current.expiresAt) > Date.now()
  );
}

export function sqliteFinancialAuthority(
  connection: StorageConnection,
  inputOptions: FinancialAuthorityOptions,
) {
  if (
    !inputOptions ||
    !/^[a-z][a-z0-9._-]{0,63}$/.test(inputOptions.namespace) ||
    !/^[a-z][a-z0-9._-]{0,63}$/.test(inputOptions.provider) ||
    typeof inputOptions.authorize !== 'function'
  )
    throw new WalletProviderError('wallet_provider_configuration');
  const { namespace, provider, authorize } = inputOptions;
  const options = { namespace, provider };

  async function permitted(
    input: AuthorityContext,
    approval: FinancialApproval,
    purpose: 'sign' | 'submit' | 'status',
  ): Promise<boolean> {
    const context = structuredClone(input);
    if (
      !sameCaller(context, approval) ||
      !uuid.test(context.idempotencyKey) ||
      (purpose === 'sign' && !context.principal.scopes.includes('wallet:sign'))
    )
      return false;
    let current: FinancialAuthorization | null;
    try {
      current = await authorize(
        structuredClone(context),
        structuredClone(approval),
        purpose,
      );
    } catch {
      return unavailable();
    }
    if (!matches(approval, current)) return false;
    return connection.transaction(() => {
      const latest = loadApproval(
        connection,
        approvalId(approval),
        purpose !== 'status',
      );
      return (
        !!latest &&
        fingerprint(latest) === fingerprint(approval) &&
        matches(latest, current)
      );
    });
  }

  async function admit(
    input: AuthorityContext,
    id: string,
    purpose: 'sign' | 'submit' | 'status',
  ) {
    const context = structuredClone(input);
    if (!uuid.test(id)) throw new WalletProviderError('wallet_provider_input');
    const approval = loadApproval(connection, id, purpose !== 'status');
    if (
      !approval ||
      ((purpose === 'sign') !== (approval.action.kind === 'sign_typed_data') &&
        purpose !== 'status') ||
      !(await permitted(context, approval, purpose))
    )
      return null;
    return connection.transaction(() => {
      const latest = loadApproval(connection, id, purpose !== 'status');
      if (!latest || fingerprint(latest) !== fingerprint(approval)) return null;
      if (purpose !== 'status')
        bindExecutionMechanism(
          connection,
          approval,
          approvalMechanism(approval),
        );
      const proposed = attemptFor(options, approval, randomUUID());
      const previous = connection.get(
        'SELECT attempt_id,request,approval_id FROM admissions WHERE namespace=? AND provider=? AND resource_key=?',
        namespace,
        provider,
        proposed.resourceKey,
      );
      const callerKey = fingerprint([
        approval.caller.issuer,
        approval.caller.subject,
        approval.caller.clientId,
      ]);
      const key = connection.get(
        'SELECT approval_id,attempt_id FROM idempotency WHERE namespace=? AND provider=? AND caller_key=? AND idempotency_key=?',
        namespace,
        provider,
        callerKey,
        context.idempotencyKey,
      );
      if (key && key.approval_id !== id)
        throw new WalletProviderError('wallet_attempt_conflict');
      if (purpose === 'status' && !previous) return null;
      const attemptId = previous
        ? String(previous.attempt_id)
        : proposed.attemptId;
      const request = attemptFor(options, approval, attemptId);
      if (
        previous &&
        (previous.approval_id !== id ||
          fingerprint(JSON.parse(String(previous.request))) !==
            fingerprint(request))
      )
        throw new WalletProviderError('wallet_attempt_conflict');
      if (!previous)
        admission(
          connection,
          { request, budgetId: approval.budgetId, units: approval.units },
          id,
          JSON.stringify(context),
        );
      if (purpose !== 'status')
        connection.run(
          'INSERT INTO idempotency(namespace,provider,caller_key,idempotency_key,approval_id,attempt_id) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING',
          namespace,
          provider,
          callerKey,
          context.idempotencyKey,
          id,
          attemptId,
        );
      return { approval, attemptId };
    });
  }

  const authority: EmbeddedWalletAuthority = {
    // Provisioning has its own onboarding or host authority; approvals never manufacture account ownership.
    provision: async () => null,
    async sign(context, id): Promise<SigningAuthority | null> {
      const admitted = await admit(context, id, 'sign');
      if (!admitted || admitted.approval.action.kind !== 'sign_typed_data')
        return null;
      const { approval, attemptId } = admitted;
      const action = admitted.approval.action;
      return {
        sessionSubject: approval.ownerSubject,
        ownerSubject: approval.ownerSubject,
        currentUserStatus: 'ID VERIFIED',
        accountId: approval.account.accountId,
        attemptId,
        account: approval.account,
        chainAccountId: action.chain_account_id,
        bindingRevision: action.binding_revision,
        capabilityRevision: action.capability_revision,
        action,
      };
    },
  };
  const executionAuthority: RelayerExecutionAuthority = {
    async execution(
      context,
      id,
      purpose,
    ): Promise<RelayerExecutionAuthorityRecord | null> {
      const admitted = await admit(context, id, purpose);
      if (!admitted || admitted.approval.action.kind !== 'relay_transaction')
        return null;
      const { approval, attemptId } = admitted;
      const action = admitted.approval.action;
      return {
        sessionSubject: approval.ownerSubject,
        ownerSubject: approval.ownerSubject,
        currentUserStatus: 'ID VERIFIED',
        accountId: approval.account.accountId,
        attemptId,
        account: approval.account,
        bindingRevision: action.bindingRevision,
        capabilityRevision: action.capabilityRevision,
        action,
      };
    },
  };

  async function authorizeRequest(
    input: WalletAttemptRequest,
    status: boolean,
  ) {
    const request = structuredClone(input);
    if (request.namespace !== namespace || request.provider !== provider)
      return false;
    const row = connection.get(
      'SELECT approval_id,context,request FROM admissions WHERE namespace=? AND provider=? AND attempt_id=?',
      namespace,
      provider,
      request.attemptId,
    );
    if (
      !row?.approval_id ||
      !row.context ||
      fingerprint(JSON.parse(String(row.request))) !== fingerprint(request)
    )
      return false;
    const approval = loadApproval(connection, String(row.approval_id), !status);
    if (
      !approval ||
      fingerprint(attemptFor(options, approval, request.attemptId)) !==
        fingerprint(request)
    )
      return false;
    const context: AuthorityContext = JSON.parse(String(row.context));
    return permitted(
      context,
      approval,
      status
        ? 'status'
        : approval.action.kind === 'sign_typed_data'
          ? 'sign'
          : 'submit',
    );
  }

  return {
    authority,
    executionAuthority,
    journal: sqliteJournal(connection),
    authorizeAttempt: (request: WalletAttemptRequest) =>
      authorizeRequest(request, false),
    authorizeStatus: (request: WalletAttemptRequest) =>
      authorizeRequest(request, true),
  };
}
