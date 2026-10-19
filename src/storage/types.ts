import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type { EmbeddedAccount, TypedDataAction } from '../domain/signing.js';
import type { RelayerExecutionAction } from '../domain/relayer-execution.js';

/** Explicit optional policy charge; units and meaning are defined by the selecting adapter. */
export interface PolicyBudgetCharge {
  budgetId: string;
  units: string;
  maximum: string;
}

/** Compatibility name for direct-token allowance charges. */
export interface AssetBudgetCharge extends PolicyBudgetCharge {}

/** Insert only from the host's trusted exact-action authorization flow, never an HTTP body. */
export interface FinancialApproval {
  ownerSubject: string;
  caller: Pick<VerifiedPrincipal, 'issuer' | 'subject' | 'clientId'>;
  grantId: string;
  consentReference: string;
  policyRevision: string;
  account: EmbeddedAccount;
  /** Original user authority for provider-owned application Safe signing. */
  userAccount?: EmbeddedAccount;
  action: TypedDataAction | RelayerExecutionAction;
  budgetId: string;
  units: string;
  additionalBudgets?: PolicyBudgetCharge[];
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
