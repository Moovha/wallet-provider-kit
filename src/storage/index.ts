import type {
  WalletAttemptRequest,
  WalletAttemptResult,
} from '../domain/attempt-journal.js';
import { WalletProviderError } from '../domain/signing.js';
import { text } from '../onboarding/policy.js';
import {
  StorageConnection,
  type ProviderDatabaseOptions,
} from './connection.js';
import { sqliteOnboardingStore } from './onboarding.js';
import {
  admission,
  reconcileAttempt,
  sqliteJournal,
  units,
  type AttemptAdmission,
} from './journal.js';
import { sqliteFinancialAuthority, storeApproval } from './financial.js';
import {
  sqliteEnrollmentAuthority,
  type DatabaseEnrollmentOptions,
} from './enrollment.js';
import type { FinancialApproval, FinancialAuthorityOptions } from './types.js';

export type { ProviderDatabaseOptions } from './connection.js';
export type { AttemptAdmission } from './journal.js';
export type {
  FinancialApproval,
  FinancialAuthorization,
  FinancialAuthorityOptions,
} from './types.js';
export type { DatabaseEnrollmentOptions } from './enrollment.js';

/** Opt-in toolkit-owned SQLite database. Initialization never activates a wallet backend. */
export function openProviderDatabase(options: ProviderDatabaseOptions) {
  const connection = new StorageConnection(options);
  return {
    onboardingStore: sqliteOnboardingStore(connection),
    journal: sqliteJournal(connection),
    ready: () => connection.ready(),
    close: () => connection.close(),
    /** Read-only ownership guard before assigning an empty toolkit store to a configured service. */
    async hasStoredRecords() {
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
            'deploymentBindings',
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
