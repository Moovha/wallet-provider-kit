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
  maximumCostWei: string;
  validAfter: string;
  validUntil: string;
  signingActionId: string;
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
