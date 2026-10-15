import type { AuthorityContext } from './principal.js';
import {
  WalletProviderError,
  type EmbeddedAccount,
  type TypedDataAction,
  type WalletSigningProvider,
} from './signing.js';

interface OwnerAuthority {
  sessionSubject: string;
  ownerSubject: string;
  currentUserStatus: string | null;
  accountId: string;
  attemptId: string;
}

export interface SigningAuthority extends OwnerAuthority {
  account: EmbeddedAccount;
  chainAccountId: string;
  bindingRevision: string;
  capabilityRevision: string;
  action: TypedDataAction;
}

/**
 * Server-owned port, deliberately without a production implementation yet.
 * Each call must verify the principal's current grant/session/proof and owner permission,
 * read current stored KYC, and durably admit the exact attempt and usage budget.
 * Signing additionally requires current consent, immutable committed plan/action,
 * active binding and lease. Return null on denial; throw on storage uncertainty.
 * Never construct these records from an HTTP body or a cached approval.
 */
export interface EmbeddedWalletAuthority {
  provision(
    context: AuthorityContext,
    accountId: string,
  ): Promise<OwnerAuthority | null>;
  sign(
    context: AuthorityContext,
    actionId: string,
  ): Promise<SigningAuthority | null>;
}

function requireOwner(
  authority: OwnerAuthority | null,
): asserts authority is OwnerAuthority {
  if (
    !authority ||
    !authority.ownerSubject ||
    authority.sessionSubject !== authority.ownerSubject ||
    authority.currentUserStatus !== 'ID VERIFIED'
  ) {
    throw new WalletProviderError('wallet_authorization_denied');
  }
}

/** Internal service only: HTTP-independent; the host supplies authoritative persistence and policy. */
export class EmbeddedWalletService {
  constructor(
    private readonly authority: EmbeddedWalletAuthority,
    private readonly provider: WalletSigningProvider,
  ) {}

  async provision(
    context: AuthorityContext,
    accountId: string,
    enrollmentGuard?: (ownerSubject: string) => Promise<void>,
  ): Promise<EmbeddedAccount> {
    const authority = structuredClone(
      await this.authority.provision(context, accountId),
    );
    requireOwner(authority);
    if (authority.accountId !== accountId) {
      throw new WalletProviderError('wallet_authorization_denied');
    }
    await enrollmentGuard?.(authority.ownerSubject);
    return this.provider.createAccount(accountId, authority.attemptId);
  }

  async sign(
    context: AuthorityContext,
    actionId: string,
    accessGuard?: (ownerSubject: string, accountId: string) => Promise<void>,
  ): Promise<string> {
    const authority = structuredClone(
      await this.authority.sign(context, actionId),
    );
    requireOwner(authority);
    if (
      authority.action.action_id !== actionId ||
      authority.account.accountId !== authority.accountId ||
      authority.action.chain_account_id !== authority.chainAccountId ||
      authority.action.binding_revision !== authority.bindingRevision ||
      authority.action.capability_revision !== authority.capabilityRevision ||
      authority.action.status !== 'ready'
    ) {
      throw new WalletProviderError('wallet_authorization_denied');
    }
    await accessGuard?.(authority.ownerSubject, authority.accountId);
    return this.provider.signTypedData(
      authority.account,
      authority.action,
      authority.attemptId,
    );
  }
}
