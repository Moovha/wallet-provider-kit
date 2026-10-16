/** Explicit operator token limits; all API authority checks still apply. */
export const apiTokenScopes = [
  'wallet:access',
  'wallet:access:read',
  'wallet:account:read',
  'wallet:provision',
  'wallet:actions',
  'wallet:actions:read',
  'wallet:events',
  'wallet:events:read',
  'wallet:sign',
  'wallet:execute',
  'wallet:execute:read',
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
  'wallet:events': 'Report unverified transaction events',
  'wallet:events:read': 'Read reported transaction events',
  'wallet:sign': 'Sign an authorized transfer',
  'wallet:execute': 'Execute an approved transfer with an admitted gas sponsor',
  'wallet:execute:read':
    'Read independently verified transfer execution status',
};
