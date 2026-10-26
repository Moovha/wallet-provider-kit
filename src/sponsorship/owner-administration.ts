import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type { SupportedActions } from '../deployment/actions.js';
import type { ProviderDatabase } from '../storage/index.js';
import type { PinnedContract } from '../execution/approved-calls.js';
import type { UserOperationWalletCallsDriver } from './wallet-calls.js';
import { Safe4337Verifier, type Safe4337Acceptance } from './verifier.js';
import {
  initialSafeOwnerPolicy,
  normalizeSafeOwnerPolicy,
  prepareSafeOwnerChange,
  sameSafeOwners,
  type SafeOwnerChange,
  type SafeOwnerPolicy,
} from './owner-policy.js';
import { deny, fingerprint, uuid } from '../onboarding/policy.js';
import { WalletProviderError } from '../domain/signing.js';
import { runtimeApplicationId } from '../runtime-configuration/service.js';

export interface SafeOwnerAdministrationState {
  status: 'confirmed' | 'suspended';
  changes?: Record<
    string,
    { requestHash: string; batchId: string; requested: SafeOwnerPolicy }
  >;
  observed?: {
    owners: string[];
    threshold: number;
    blockNumber: string;
    blockHash: string;
  };
  pending?: {
    batchId: string;
    requestHash: string;
    requested: SafeOwnerPolicy;
  };
}
/** On-chain administration is separate from application membership and contract-call delegation. */
export class SafeOwnerAdministration {
  constructor(
    private readonly actions: SupportedActions,
    private readonly database: ProviderDatabase,
    private readonly multiSend: PinnedContract,
    private readonly acceptance: (
      applicationId: string,
    ) => Promise<Safe4337Acceptance>,
    private readonly driver: (
      applicationId: string,
      accountId: string,
    ) => Promise<UserOperationWalletCallsDriver>,
    private readonly request: typeof fetch = fetch,
  ) {}
  private application(principal: VerifiedPrincipal) {
    return runtimeApplicationId(principal.issuer, principal.clientId);
  }
  private async wallet(
    principal: VerifiedPrincipal,
    accountId: string,
    administration = false,
  ) {
    return this.actions.onboarding.withAccountAccess(
      principal,
      accountId,
      administration ? 'owners:manage' : 'account:read',
      (state, grant) => {
        const wallet =
          state.deploymentBindings?.['service-v1']?.runtimeConfiguration
            ?.safeWalletAccounts?.[accountId];
        const request = state.requests[grant.requestId];
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.actions.revision ||
          !wallet ||
          wallet.status !== 'ready' ||
          (administration &&
            (!request ||
              request.membership ||
              request.sharing ||
              wallet.applicationId !== this.application(principal)))
        )
          deny();
        return wallet;
      },
    );
  }
  async read(principal: VerifiedPrincipal, accountId: string) {
    const wallet = await this.wallet(principal, accountId);
    const expected = normalizeSafeOwnerPolicy(
      wallet.binding.ownerPolicy ??
        initialSafeOwnerPolicy(wallet.signer.address),
    );
    const verifier = new Safe4337Verifier(
      await this.acceptance(this.application(principal)),
      this.request,
    );
    const observed = await verifier.observeOwners(wallet.binding.address);
    const pending = wallet.ownerAdministration?.pending;
    const batch = pending
      ? await this.database.onboardingStore.transaction((state) =>
          Object.values(state.userOperationBatches ?? {}).find(
            (b) =>
              b.metadata.id === pending.batchId &&
              b.input.account_id === accountId,
          ),
        )
      : undefined;
    const abandoned =
      !!pending &&
      !!batch &&
      ['expired', 'failed'].includes(batch.stage) &&
      (!batch.operationId ||
        !this.database.sponsorship.load(batch.operationId)
          ?.signatureCollection ||
        !!this.database.sponsorship.load(batch.operationId)?.signatureCollection
          ?.expiry);
    const execution = batch?.operationId
      ? await this.database.onboardingStore.transaction(
          (state) => state.userOperationExecutions?.[batch.operationId!],
        )
      : undefined;
    const confirm =
      !!pending &&
      sameSafeOwners(observed, pending.requested) &&
      !!execution?.observation.receipt &&
      execution.observation.receipt.status === '0x1' &&
      execution.observation.state === 'finalized';
    const candidate = confirm
      ? normalizeSafeOwnerPolicy({
          ...pending!.requested,
          owners: observed.owners,
        })
      : expected;
    const compatible = sameSafeOwners(observed, candidate);
    const policy = compatible
      ? { ...candidate, owners: observed.owners }
      : candidate;
    if (compatible)
      await verifier.verify(
        {
          account: { ...wallet.binding, ownerPolicy: policy },
          multiSend: this.multiSend,
          calls: [],
          contracts: [],
        },
        wallet.signer.address,
      );
    await this.actions.onboarding.withAccountAccess(
      principal,
      accountId,
      'account:read',
      (state) => {
        const current =
          state.deploymentBindings?.['service-v1']?.runtimeConfiguration
            ?.safeWalletAccounts?.[accountId] ?? deny();
        if (fingerprint(current) !== fingerprint(wallet))
          throw new WalletProviderError('wallet_attempt_conflict');
        current.ownerAdministration = {
          ...current.ownerAdministration,
          observed,
          status: compatible ? 'confirmed' : 'suspended',
        };
        if (compatible && current.binding.ownerPolicy)
          current.binding.ownerPolicy = policy;
        if (confirm) {
          current.binding.ownerPolicy = policy;
          delete current.ownerAdministration.pending;
        }
        if (abandoned && compatible) delete current.ownerAdministration.pending;
      },
    );
    return {
      account_id: accountId,
      safe_address: wallet.binding.address,
      confirmed: policy,
      observed,
      status: compatible ? 'confirmed' : 'suspended',
      ...(pending && !confirm && !abandoned ? { pending } : {}),
      capabilities: {
        owner_address_management: true,
        signature_collection: true,
        signature_scheme: 'eip712-ecdsa',
        maximum_owners: 32,
        automatic_signing: 'application-managed',
      },
    };
  }
  async change(
    context: AuthorityContext,
    accountId: string,
    input: { expected_policy_revision: string; change: SafeOwnerChange },
  ) {
    if (!uuid.test(context.idempotencyKey))
      throw new WalletProviderError('wallet_provider_input');
    const walletBefore = await this.wallet(context.principal, accountId, true);
    const requestHash = fingerprint([
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      accountId,
      context.idempotencyKey,
      input,
    ]);
    const commandKey = fingerprint([
      'owner-change',
      context.principal.issuer,
      context.principal.subject,
      context.principal.clientId,
      accountId,
      context.idempotencyKey,
    ]);
    const previous = walletBefore.ownerAdministration?.changes?.[commandKey];
    if (previous && previous.requestHash !== requestHash)
      throw new WalletProviderError('wallet_attempt_conflict');
    if (previous) {
      const queued = await this.database.onboardingStore.transaction((state) =>
        Object.values(state.userOperationBatches ?? {}).some(
          (b) =>
            b.metadata.id === previous.batchId &&
            b.input.account_id === accountId,
        ),
      );
      if (queued)
        return {
          account_id: accountId,
          batch_id: previous.batchId,
          requested: previous.requested,
          status: 'pending' as const,
        };
    }
    const read = await this.read(context.principal, accountId);
    if (
      read.status !== 'confirmed' ||
      read.confirmed.revision !== input.expected_policy_revision
    )
      deny();
    const { requested } = prepareSafeOwnerChange(read.confirmed, input.change);
    if (requested.owners.includes(read.safe_address.toLowerCase()))
      throw new WalletProviderError('wallet_provider_input');
    const batchId = '0x' + requestHash;
    const applicationId = this.application(context.principal);
    // Materialize the initial owner policy only while the account has no outstanding admitted work.
    await this.actions.onboarding.withAccountAccess(
      context.principal,
      accountId,
      'owners:manage',
      (state) => {
        const wallet =
          state.deploymentBindings?.['service-v1']?.runtimeConfiguration
            ?.safeWalletAccounts?.[accountId] ?? deny();
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
            this.actions.revision ||
          (wallet.binding.ownerPolicy &&
            fingerprint(wallet.binding.ownerPolicy) !==
              fingerprint(read.confirmed))
        )
          deny();
        if (
          wallet.ownerAdministration?.pending &&
          wallet.ownerAdministration.pending.requestHash !== requestHash
        )
          throw new WalletProviderError('wallet_attempt_conflict');
        if (!wallet.binding.ownerPolicy) {
          if (
            Object.values(state.userOperationBatches ?? {}).some(
              (b) =>
                b.input.account_id === accountId &&
                !['complete', 'expired', 'failed'].includes(b.stage),
            )
          )
            throw new WalletProviderError('wallet_attempt_conflict');
          wallet.binding.ownerPolicy = read.confirmed;
        }
        wallet.ownerAdministration = {
          ...wallet.ownerAdministration,
          status: 'confirmed',
          pending: { batchId, requestHash, requested },
          changes: {
            ...wallet.ownerAdministration?.changes,
            [commandKey]: { batchId, requestHash, requested },
          },
        };
      },
    );
    const binding = await this.actions.walletCallsAccount(
      context.principal,
      accountId,
    );
    const driver = await this.driver(applicationId, accountId);
    const queued = await this.database.onboardingStore.transaction((state) =>
      Object.values(state.userOperationBatches ?? {}).some(
        (b) => b.metadata.id === batchId && b.input.account_id === accountId,
      ),
    );
    if (!queued)
      await driver.enqueue(
        context,
        {
          account_id: accountId,
          kind: 'owner-change',
          expected_policy_revision: input.expected_policy_revision,
          change: input.change,
        },
        {
          version: '2.0.0',
          id: batchId,
          sender: binding.address,
          policyHash: binding.snapshot.policy_hash,
          policyRevision: binding.snapshot.revision,
        },
      );
    return {
      account_id: accountId,
      batch_id: batchId,
      requested,
      status: 'pending' as const,
    };
  }
}
