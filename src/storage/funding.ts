import {
  pendingFunding,
  type FundingReservation,
} from '../sponsorship/funding.js';
import type { SponsorshipAdmission } from '../sponsorship/admission.js';
import type { UserOperationExecution } from '../sponsorship/execution-types.js';
import type { StorageConnection } from './connection.js';

/** The enclosing authority transaction serializes funding admission with the durable reservation. */
export function assertFundingCapacity(
  connection: StorageConnection,
  budgetId: string,
  funding: FundingReservation,
  additionalCost?: string,
) {
  connection.requireTransaction();
  const records = connection
    .all(
      "SELECT record FROM onboarding_records WHERE collection=? AND json_extract(record,'$.gasBudgetId')=?",
      connection.recordCollection('sponsorships'),
      budgetId,
    )
    .map((row) => {
      const record = JSON.parse(String(row.record)) as SponsorshipAdmission;
      const execution = connection.get(
        'SELECT record FROM onboarding_records WHERE collection=? AND id=?',
        connection.recordCollection('userOperationExecutions'),
        record.id,
      );
      return {
        costWei: record.maximumCostWei,
        observation: record.signatureCollection?.expiry
          ? {
              state: 'expired' as const,
              expiry: record.signatureCollection.expiry,
              observedAt: new Date().toISOString(),
              scanNextBlock: (
                BigInt(record.signatureCollection.expiry.finalizedBlock) + 1n
              ).toString(),
            }
          : execution
            ? (JSON.parse(String(execution.record)) as UserOperationExecution)
                .observation
            : undefined,
      };
    });
  return pendingFunding(records, funding, additionalCost);
}
