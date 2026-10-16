import { createHash } from 'node:crypto';
import { trustedHttpsUrl } from '../service/auth.js';
import { WalletProviderError } from '../domain/signing.js';
import {
  accessType,
  permissions,
  defaultPermissions,
  type AccessInput,
  type ApplicationPolicy,
  type OnboardingPolicy,
  type ResolvedPolicy,
} from './types.js';
import type { VerifiedPrincipal } from '../domain/principal.js';

export function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value) ?? 'null')
    .digest('hex');
}
export function text(value: unknown, max = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
export function deny(): never {
  throw new WalletProviderError('wallet_authorization_denied');
}
export function invalid(): never {
  throw new WalletProviderError('wallet_provider_input');
}
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function keys(value: object, allowed: string[]) {
  if (Object.keys(value).some((k) => !allowed.includes(k))) throw new Error();
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function defineOnboardingPolicy(
  input: OnboardingPolicy,
): ResolvedPolicy {
  const policy = structuredClone(input);
  try {
    keys(policy, ['version', 'provider', 'applications', 'identity', 'access']);
    keys(policy.provider, ['name', 'origin', 'privacyUrl']);
    if (policy.identity) keys(policy.identity, ['maxAgeDays']);
    if (policy.access) keys(policy.access, ['maxAgeDays']);
    if (!text(policy.version) || !text(policy.provider.name, 100))
      throw new Error();
    const origin = trustedHttpsUrl(policy.provider.origin);
    if (origin.origin !== policy.provider.origin) throw new Error();
    trustedHttpsUrl(policy.provider.privacyUrl);
    if (
      !Array.isArray(policy.applications) ||
      policy.applications.length === 0 ||
      policy.applications.length > 100
    )
      throw new Error();
    const seen = new Set<string>();
    for (const app of policy.applications) {
      keys(app, [
        'issuer',
        'clientId',
        'name',
        'enabled',
        'permissions',
        'funding',
      ]);
      if (app.funding) keys(app.funding, ['agreement', 'monthlyLimitMinor']);
      trustedHttpsUrl(app.issuer);
      if (
        !text(app.clientId) ||
        !text(app.name, 100) ||
        (app.enabled !== undefined && typeof app.enabled !== 'boolean')
      )
        throw new Error();
      const key = JSON.stringify([app.issuer, app.clientId]);
      if (seen.has(key)) throw new Error();
      seen.add(key);
      if (
        app.permissions &&
        (!Array.isArray(app.permissions) ||
          !app.permissions.length ||
          app.permissions.some((p) => !permissions.includes(p)) ||
          new Set(app.permissions).size !== app.permissions.length)
      )
        throw new Error();
      if (
        app.funding &&
        (!text(app.funding.agreement) ||
          !Number.isSafeInteger(app.funding.monthlyLimitMinor) ||
          app.funding.monthlyLimitMinor < 0)
      )
        throw new Error();
    }
    const identity = { maxAgeDays: policy.identity?.maxAgeDays ?? 365 };
    const access = { maxAgeDays: policy.access?.maxAgeDays ?? 30 };
    for (const days of [identity.maxAgeDays, access.maxAgeDays])
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error();
    const resolved = { ...policy, identity, access };
    return freeze({ ...resolved, revision: fingerprint(resolved) });
  } catch {
    throw new WalletProviderError('wallet_provider_configuration');
  }
}
export function application(
  policy: ResolvedPolicy,
  principal: VerifiedPrincipal,
): ApplicationPolicy {
  const app = policy.applications.find(
    (a) =>
      a.issuer === principal.issuer &&
      a.clientId === principal.clientId &&
      a.enabled !== false,
  );
  if (!app) deny();
  return app;
}
export function normalizeInput(
  value: AccessInput,
  app: ApplicationPolicy,
): AccessInput {
  if (
    !value ||
    !['create', 'connect'].includes(value.mode) ||
    Object.keys(value).some(
      (k) => !['mode', 'account_id', 'authorization_details'].includes(k),
    )
  )
    invalid();
  if (
    value.mode === 'connect'
      ? !uuid.test(value.account_id ?? '')
      : value.account_id !== undefined
  )
    invalid();
  const details = value.authorization_details;
  if (
    !Array.isArray(details) ||
    details.length !== 1 ||
    !details[0] ||
    details[0].type !== accessType ||
    Object.keys(details[0]).some((k) => !['type', 'actions'].includes(k))
  )
    invalid();
  const actions = details[0].actions;
  if (
    !Array.isArray(actions) ||
    actions.length === 0 ||
    actions.some((p) => !(app.permissions ?? defaultPermissions).includes(p)) ||
    new Set(actions).size !== actions.length
  )
    invalid();
  return {
    mode: value.mode,
    ...(value.account_id ? { account_id: value.account_id } : {}),
    authorization_details: [{ type: accessType, actions: [...actions].sort() }],
  };
}
