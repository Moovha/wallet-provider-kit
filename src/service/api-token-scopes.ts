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
