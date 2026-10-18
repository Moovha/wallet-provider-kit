/** Generate non-secret identities once when creating a configuration, then retain them. */
export function newClientId(role: 'application' | 'operator'): string {
  return `${role}-${crypto.randomUUID()}`;
}

export function newWalletBinding(): string {
  return `wallets-${crypto.randomUUID()}`;
}
