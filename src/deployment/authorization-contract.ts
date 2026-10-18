import type { SecretReference } from './config.js';

/** Application API scopes; financial authority is checked separately for every action. */
export { apiTokenScopes as applicationScopes } from '../service/api-token-scopes.js';
export const initialApplicationScopes = [
  'wallet:access',
  'wallet:access:read',
  'wallet:account:read',
  'wallet:provision',
] as const;

export interface BundledAuthorizationConfiguration {
  signingKey: SecretReference;
  operatorClients?: { clientId: string; clientSecret: SecretReference }[];
  clients: {
    clientId: string;
    clientSecret: SecretReference;
    scopes: string[];
  }[];
}

export function bundledOAuth(origin: string) {
  return {
    issuer: origin ? `${origin}/oauth` : '',
    audience: origin ? `${origin}/api` : '',
    jwksUrl: origin ? `${origin}/oauth/jwks` : '',
  };
}

/** Dedicated provider operators, never ordinary application registrations. */
export const operatorScopes = [
  'wallet:configuration:read',
  'wallet:configuration:write',
  'wallet:execute:read',
] as const;
