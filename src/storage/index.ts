import { providerNetwork, type ProviderNetwork } from '../networks.js';
import { ensureAssetBudget } from './asset-budgets.js';
export { assetBudgetId } from './asset-budgets.js';
import { sqliteSponsorshipStore } from './sponsorship.js';
import type {
  WalletAttemptRequest,
  WalletAttemptResult,
} from '../domain/attempt-journal.js';
import { WalletProviderError } from '../domain/signing.js';
import { text, fingerprint } from '../onboarding/policy.js';
import {
  StorageConnection,
  type ProviderDatabaseOptions,
} from './connection.js';
import { sqliteOnboardingStore, scopedCollection } from './onboarding.js';
import {
  admission,
  reconcileAttempt,
  sqliteJournal,
  units,
  type AttemptAdmission,
} from './journal.js';
import {
  sqliteFinancialAuthority,
  storeApproval,
  loadApproval,
} from './financial.js';
import {
  sqliteEnrollmentAuthority,
  type DatabaseEnrollmentOptions,
} from './enrollment.js';
import type { FinancialApproval, FinancialAuthorityOptions } from './types.js';

export type { ProviderDatabaseOptions } from './connection.js';
export type { AttemptAdmission } from './journal.js';
export type {
  AssetBudgetCharge,
  PolicyBudgetCharge,
  FinancialApproval,
  FinancialAuthorization,
  FinancialAuthorityOptions,
} from './types.js';
export type { DatabaseEnrollmentOptions } from './enrollment.js';

/** Opt-in toolkit-owned SQLite database. Initialization never activates a wallet backend. */
export function openProviderDatabase(options: ProviderDatabaseOptions) {
  options = Object.freeze({ ...options });
  const connection = new StorageConnection(options);
  return {
    networkScope: options.networkScope,
    hasResource(id: string) {
      return !!connection.get(
        'SELECT 1 FROM onboarding_records WHERE id=? AND collection IN (?,?,?) LIMIT 1',
        id,
        ...['accounts', 'requests', 'grants'].map((collection) =>
          scopedCollection(collection, options.networkScope),
        ),
      );
    },
    /** Operator transactions can revoke grants atomically across retained networks. */
    managementStore: sqliteOnboardingStore(connection, undefined, true),
    accountNetwork(id: string): ProviderNetwork | undefined {
      const rows = connection.all(
        'SELECT collection FROM onboarding_records WHERE id=? AND collection IN (?,?,?,?,?)',
        id,
        'accounts',
        'base:accounts',
        'base-sepolia:accounts',
        'ethereum:accounts',
        'ethereum-sepolia:accounts',
      );
      if (rows.length > 1)
        throw new WalletProviderError('wallet_provider_configuration');
      if (!rows.length) return undefined;
      if (rows[0].collection !== 'accounts')
        return providerNetwork(
          String(rows[0].collection).split(':')[0] as ProviderNetwork,
        ).name;
      const binding = connection.get(
        'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
        'deploymentBindings',
        'service-v1',
      );
      return providerNetwork(
        binding ? JSON.parse(String(binding.record)).network : undefined,
      ).name;
    },
    managementSnapshot():
      import('../management/service.js').ManagementState | undefined {
      const row = connection.get(
        'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
        'management',
        'provider',
      );
      return row ? JSON.parse(String(row.record)) : undefined;
    },
    onboardingStore: sqliteOnboardingStore(connection, options.networkScope),
    sponsorship: sqliteSponsorshipStore(connection),
    journal: sqliteJournal(connection),
    ready: () => connection.ready(),
    close: () => connection.close(),
    /** Read-only ownership guard before assigning an empty toolkit store to a configured service. */
    async hasStoredRecords() {
      if (options.networkScope)
        return !!connection.get(
          'SELECT 1 FROM onboarding_records WHERE collection LIKE ? LIMIT 1',
          options.networkScope + ':%',
        );
      return !!connection.get(`SELECT 1 FROM onboarding_records UNION ALL SELECT 1 FROM onboarding_audit
        UNION ALL SELECT 1 FROM budgets UNION ALL SELECT 1 FROM approvals UNION ALL SELECT 1 FROM admissions
        UNION ALL SELECT 1 FROM attempts UNION ALL SELECT 1 FROM financial_audit UNION ALL SELECT 1 FROM enrollments LIMIT 1`);
    },
    /** Configured writers must fence budget changes against the active service revision. */
    async setBudget(id: string, maximum: string, configuredRevision?: string) {
      if (!text(id)) throw new WalletProviderError('wallet_provider_input');
      const limit = units(maximum);
      connection.transaction(() => {
        if (configuredRevision !== undefined) {
          const binding = connection.get(
            'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
            scopedCollection('deploymentBindings', options.networkScope),
            'service-v1',
          );
          if (
            !binding ||
            JSON.parse(String(binding.record)).activeRevision !==
              configuredRevision
          )
            throw new WalletProviderError('wallet_authorization_denied');
        }
        const previous = connection.get(
          'SELECT reserved FROM budgets WHERE id=?',
          id,
        );
        if (previous && units(String(previous.reserved)) > limit)
          throw new WalletProviderError('wallet_attempt_conflict');
        connection.run(
          'INSERT INTO budgets(id,maximum) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET maximum=excluded.maximum',
          id,
          maximum,
        );
        connection.audit('budget_configured', id);
      });
    },
    async ensureAssetBudget(
      origin: string,
      accountId: string,
      token: string,
      maximum: string,
      revision: string,
    ) {
      return ensureAssetBudget(
        connection,
        origin,
        accountId,
        token,
        maximum,
        revision,
      );
    },
    async budget(id: string) {
      const row = connection.get(
        'SELECT maximum,reserved FROM budgets WHERE id=?',
        id,
      );
      return row
        ? { maximum: String(row.maximum), reserved: String(row.reserved) }
        : null;
    },
    async approveAction(approval: FinancialApproval) {
      return storeApproval(connection, approval);
    },
    /** Read current immutable approval and revocation without admitting a financial attempt. */
    async isApprovedAction(approval: FinancialApproval, allowExpired = false) {
      const id = approval.action.action_id;
      const current = loadApproval(connection, id, !allowExpired);
      return current !== null && fingerprint(current) === fingerprint(approval);
    },
    hasAttemptAdmission(request: WalletAttemptRequest): boolean {
      return !!connection.get(
        'SELECT 1 FROM admissions WHERE namespace=? AND provider=? AND (attempt_id=? OR resource_key=?) LIMIT 1',
        request.namespace,
        request.provider,
        request.attemptId,
        request.resourceKey,
      );
    },
    /** Synchronous inside the shared storage transaction; any admission retains possible signing exposure. */
    hasActionAttempts(id: string): boolean {
      return !!connection.get(
        'SELECT 1 FROM admissions WHERE approval_id=? LIMIT 1',
        id,
      );
    },
    async revokeAction(id: string) {
      connection.transaction(() => {
        connection.run('UPDATE approvals SET revoked=1 WHERE id=?', id);
        connection.audit('action_revoked', id);
      });
    },
    financialAuthority: (configuration: FinancialAuthorityOptions) =>
      sqliteFinancialAuthority(connection, configuration),
    enrollmentAuthority: (configuration: DatabaseEnrollmentOptions) =>
      sqliteEnrollmentAuthority(connection, configuration),
    async revokeEnrollment(id: string) {
      connection.transaction(() => {
        connection.run('UPDATE enrollments SET revoked=1 WHERE id=?', id);
        connection.audit('enrollment_revoked', id);
      });
    },
    /** For existing trusted host authorities. Supply current authorizeAttempt when wrapping the backend. */
    async admitAttempt(input: AttemptAdmission) {
      const value = structuredClone(input);
      return connection.transaction(() => admission(connection, value));
    },
    reconcileAttempt: (
      request: WalletAttemptRequest,
      result: WalletAttemptResult,
      evidenceReference: string,
      verify: (
        request: WalletAttemptRequest,
        result: WalletAttemptResult,
        evidenceReference: string,
      ) => Promise<boolean>,
    ) =>
      reconcileAttempt(connection, request, result, evidenceReference, verify),
  };
}

export type ProviderDatabase = ReturnType<typeof openProviderDatabase>;
