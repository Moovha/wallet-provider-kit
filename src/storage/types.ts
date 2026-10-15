import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type { EmbeddedAccount, TypedDataAction } from '../domain/signing.js';
import type { RelayerExecutionAction } from '../domain/relayer-execution.js';

/** Insert only from the host's trusted exact-action approval flow, never an HTTP body. */
export interface FinancialApproval {
  ownerSubject: string;
  caller: Pick<VerifiedPrincipal, 'issuer' | 'subject' | 'clientId'>;
  grantId: string;
  consentReference: string;
  policyRevision: string;
  account: EmbeddedAccount;
  action: TypedDataAction | RelayerExecutionAction;
  budgetId: string;
  units: string;
}

/** Fresh host evidence; matching a stored approval is necessary but is not a policy check. */
export interface FinancialAuthorization {
  ownerSubject: string;
  accountId: string;
  address: string;
  chainAccountId: string;
  currentUserStatus: 'ID VERIFIED';
  grantId: string;
  consentReference: string;
  policyRevision: string;
  bindingRevision: string;
  capabilityRevision: string;
  planRevision: string;
  planHash: string;
  expiresAt: string;
}

export interface FinancialAuthorityOptions {
  namespace: string;
  provider: string;
  /** Recheck live owner/grant/KYC/consent, unchanged plan, dependencies and any step-up proof. No vendor effects. */
  authorize(
    context: AuthorityContext,
    approval: FinancialApproval,
    purpose: 'sign' | 'submit' | 'status',
  ): Promise<FinancialAuthorization | null>;
}
