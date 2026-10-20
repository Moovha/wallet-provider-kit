/** Constructed by a trusted authentication adapter, never from a request body. */
export interface VerifiedPrincipal {
  readonly issuer: string;
  readonly subject: string;
  readonly clientId: string;
  readonly credentialRevision?: number;
  readonly scopes: readonly string[];
}

export interface AuthorityContext {
  readonly principal: VerifiedPrincipal;
  /** Bind this key to principal, operation, resource and exact request durably. */
  readonly idempotencyKey: string;
}
