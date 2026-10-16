/** Explicit operator token limits; all API authority checks still apply. */
export const apiTokenScopes = [
  'wallet:access',
  'wallet:access:read',
  'wallet:account:read',
  'wallet:provision',
  'wallet:actions',
  'wallet:actions:read',
  'wallet:sign',
] as const;

/** Plain-language labels for application API permissions. */
export const apiTokenScopeLabels: Record<
  (typeof apiTokenScopes)[number],
  string
> = {
  'wallet:access': 'Request or revoke wallet access',
  'wallet:access:read': 'Read access request status',
  'wallet:account:read': 'Read wallet account details',
  'wallet:provision': 'Create an accepted account’s wallet',
  'wallet:actions': 'Request transfer authorization',
  'wallet:actions:read': 'Read transfer authorization status',
  'wallet:sign': 'Sign an authorized transfer',
};
