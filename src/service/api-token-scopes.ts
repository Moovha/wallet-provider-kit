/** Explicit operator token limits; all API authority checks still apply. */
export const apiTokenScopes = [
  'wallet:configuration:read',
  'wallet:configuration:propose',
  'wallet:access',
  'wallet:access:read',
  'wallet:account:read',
  'wallet:provision',
  'wallet:actions',
  'wallet:sign',
  'wallet:execute',
  'wallet:execute:read',
] as const;

/** Plain-language labels for application API permissions. */
export const apiTokenScopeLabels: Record<
  (typeof apiTokenScopes)[number],
  string
> = {
  'wallet:configuration:read': 'Read application configuration',
  'wallet:configuration:propose': 'Propose application contracts and policies',
  'wallet:access': 'Request or revoke wallet access',
  'wallet:access:read': 'Read access request status',
  'wallet:account:read': 'Read wallet account details',
  'wallet:provision': 'Create an accepted account’s wallet',
  'wallet:actions': 'Request approved Safe calls',
  'wallet:sign': 'Authorize a Safe UserOperation',
  'wallet:execute': 'Submit sponsored Safe calls',
  'wallet:execute:read': 'Read verified Safe execution status',
};
