import type { FinancialApproval } from '../storage/types.js';
import type { AuthorityContext } from '../domain/principal.js';
import type { RuntimeUserOperationPreparationOptions } from './preparation.js';
import type { PaymasterStubV07 } from './paymaster.js';

export interface SponsorshipAdmission {
  id: string;
  source: FinancialApproval;
  context: AuthorityContext;
  preparation: RuntimeUserOperationPreparationOptions;
  configurationHash: string;
  consentReference: string;
  termsHash: string;
  gasBudgetId: string;
  funding?: import('./funding.js').FundingReservation;
  maximumCostWei: string;
  validAfter: string;
  validUntil: string;
  signingActionId: string;
  signatureCollection?: {
    batchId?: string;
    calls: import('../execution/approved-calls.js').ApprovedContractCall[];
    scanFromBlock: string;
    expiry?: import('./execution-types.js').UserOperationObservation['expiry'];
    action: import('../domain/signing.js').TypedDataAction;
    policy: import('./owner-policy.js').SafeOwnerPolicy;
    state: 'collecting' | 'cancelled';
    signatures: Record<string, string>;
  };
  phases: Partial<
    Record<
      'stub' | 'final',
      {
        requestHash: string;
        token: string;
        expiresAt: number;
        state: 'dispatch' | 'succeeded' | 'unknown';
        result?: PaymasterStubV07;
      }
    >
  >;
}
