import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { VerifiedPrincipal } from '../domain/principal.js';
import type {
  ApplicationPolicy,
  OnboardingStore,
  ProviderState,
} from '../onboarding/types.js';
import {
  defineOnboardingPolicy,
  deny,
  invalid,
  text,
  uuid,
} from '../onboarding/policy.js';
import { WalletProviderError } from '../domain/signing.js';
import {
  applicationScopes,
  operatorScopes,
} from '../deployment/authorization-contract.js';

export const managementScope = 'provider:manage';
export const managementScopes = [managementScope, ...operatorScopes];
export interface ManagedIdentity {
  id: string;
  name: string;
  role: 'administrator' | 'automation' | 'application';
  enabled: boolean;
  revision: number;
  credentialRevision: number;
  salt: string;
  verifier: string;
  scopes: string[];
  policy?: ApplicationPolicy;
}
export interface ManagementState {
  version: 1;
  installationId: string;
  claimHash: string;
  claimExpiresAt: number;
  claimed: boolean;
  identities: Record<string, ManagedIdentity>;
}
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function equal(a: string, b: string) {
  return (
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function credentials(secret: string) {
  const salt = randomBytes(24).toString('hex');
  return { salt, verifier: scryptSync(secret, salt, 32).toString('hex') };
}
const conflict = (): never => {
  throw new WalletProviderError('wallet_attempt_conflict');
};
export const publicIdentity = ({
  salt: _salt,
  verifier: _verifier,
  ...value
}: ManagedIdentity) => value;

/** Installation authority is durable and independent of wallet activation. */
export class ManagementService {
  constructor(
    private readonly store: OnboardingStore,
    private readonly snapshot: () => ManagementState | undefined,
    readonly issuer: string,
    private readonly basePolicy: import('../onboarding/types.js').OnboardingPolicy,
    private readonly now = Date.now,
  ) {}
  async initialize(claim: string) {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(claim)) invalid();
    await this.store.transaction((s) => {
      s.management ??= {};
      const binding = s.deploymentBindings?.['service-v1'];
      if (s.management.provider) {
        if (
          binding &&
          binding.managementInstallationId !==
            s.management.provider.installationId
        )
          deny();
        return;
      }
      if (binding?.managementInstallationId) deny();
      s.management.provider = {
        version: 1,
        installationId: randomUUID(),
        claimHash: hash(claim),
        claimExpiresAt: this.now() + 30 * 60_000,
        claimed: false,
        identities: {},
      };
      if (binding)
        binding.managementInstallationId = s.management.provider.installationId;
    });
  }
  /** Host-only recovery. Never exposed by a network route. */
  async renewUnclaimedInstallation(claim: string) {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(claim)) invalid();
    await this.store.transaction((s) => {
      const state = this.state(s);
      if (state.claimed) deny();
      state.claimHash = hash(claim);
      state.claimExpiresAt = this.now() + 30 * 60_000;
      s.audit.push({
        at: this.now(),
        event: 'installation_claim_renewed',
        resource: hash(state.installationId),
        revision: '1',
      });
    });
  }
  /** Recover administration through possession of private host storage, without enabling execution. */
  async recoverAdministrator(secret: string) {
    if (!text(secret, 256) || secret.length < 32) invalid();
    const credential = credentials(secret);
    return this.store.transaction((s) => {
      const state = this.state(s);
      if (!state.claimed) deny();
      const id = 'operator-recovery',
        previous = state.identities[id];
      const identity: ManagedIdentity = {
        id,
        name: 'Recovery administrator',
        role: 'administrator',
        enabled: true,
        revision: (previous?.revision ?? 0) + 1,
        credentialRevision: (previous?.credentialRevision ?? 0) + 1,
        ...credential,
        scopes: [...managementScopes],
      };
      state.identities[id] = identity;
      s.audit.push({
        at: this.now(),
        event: 'administrator_recovered',
        resource: hash(id),
        revision: String(identity.revision),
      });
      return publicIdentity(identity);
    });
  }
  private state(s: ProviderState) {
    const state = s.management?.provider;
    if (!state || state.version !== 1) deny();
    return state;
  }
  private identity(principal: VerifiedPrincipal, state = this.snapshot()) {
    const identity = state?.identities[principal.clientId];
    if (
      !state?.claimed ||
      principal.issuer !== this.issuer ||
      !identity?.enabled ||
      principal.subject !== identity.id ||
      principal.credentialRevision !== identity.credentialRevision ||
      principal.scopes.some((scope) => !identity.scopes.includes(scope))
    )
      deny();
    return identity;
  }
  assertOperator(principal: VerifiedPrincipal, state = this.snapshot()) {
    const identity = this.identity(principal, state);
    if (
      identity.role === 'application' ||
      !principal.scopes.includes(managementScope)
    )
      deny();
  }
  currentPrincipal(principal: VerifiedPrincipal) {
    this.identity(principal);
  }
  applications(): ApplicationPolicy[] {
    return Object.values(this.snapshot()?.identities ?? {})
      .filter(
        (i) =>
          i.role === 'application' && i.enabled && i.policy?.assertionTrust,
      )
      .map((i) => structuredClone(i.policy!));
  }
  application(principal: VerifiedPrincipal) {
    const record = this.snapshot()?.identities[principal.clientId];
    if (
      !record?.enabled ||
      record.role !== 'application' ||
      !record.policy?.assertionTrust ||
      principal.issuer !== this.issuer
    )
      deny();
    // Stored grants carry caller identity; live requests also carry the credential revision.
    if (principal.credentialRevision !== undefined) this.identity(principal);
    return structuredClone(record.policy);
  }
  async status(principal: VerifiedPrincipal) {
    return this.store.transaction((s) => {
      const state = this.state(s);
      this.assertOperator(principal, state);
      return {
        installation_id: state.installationId,
        claimed: true,
        applications: Object.values(state.identities)
          .filter((i) => i.role === 'application')
          .map(publicIdentity),
      };
    });
  }
  async claim(input: { claim: string; username: string; password: string }) {
    if (
      !/^[a-z][a-z0-9-]{2,47}$/.test(input.username) ||
      !text(input.password, 256) ||
      input.password.length < 14 ||
      typeof input.claim !== 'string' ||
      input.claim.length > 128
    )
      invalid();
    const credential = credentials(input.password);
    return this.store.transaction((s) => {
      const state = this.state(s);
      if (
        state.claimed ||
        state.claimExpiresAt <= this.now() ||
        !equal(hash(input.claim), state.claimHash)
      )
        deny();
      const id = 'operator-' + input.username;
      const identity: ManagedIdentity = {
        id,
        name: input.username,
        role: 'administrator',
        enabled: true,
        revision: 1,
        credentialRevision: 1,
        ...credential,
        scopes: [...managementScopes],
      };
      state.identities[id] = identity;
      state.claimed = true;
      state.claimHash = '';
      state.claimExpiresAt = 0;
      s.audit.push({
        at: this.now(),
        event: 'installation_claimed',
        resource: hash(id),
        revision: '1',
      });
      return publicIdentity(identity);
    });
  }
  async verifyCredentials(id: string, secret: string, scopes: string[]) {
    if (
      !text(id) ||
      !text(secret, 256) ||
      !scopes.length ||
      new Set(scopes).size !== scopes.length
    )
      deny();
    const candidate = this.snapshot()?.identities[id];
    // Match verification work for unknown identities without persisting fake accounts.
    const salt = candidate?.salt ?? 'unknown-installation-identity';
    const verifier = scryptSync(secret, salt, 32).toString('hex');
    return this.store.transaction((s) => {
      const state = this.state(s),
        current = state.identities[id];
      if (
        !state.claimed ||
        !current?.enabled ||
        current.verifier !== candidate?.verifier ||
        !equal(verifier, current.verifier)
      )
        deny();
      if (scopes.some((scope) => !current.scopes.includes(scope))) invalid();
      return {
        issuer: this.issuer,
        subject: id,
        clientId: id,
        scopes,
        credentialRevision: current.credentialRevision,
      } satisfies VerifiedPrincipal;
    });
  }
  async mutate(
    principal: VerifiedPrincipal,
    key: string,
    operation: 'create' | 'update' | 'rotate',
    input: {
      id?: string;
      name?: string;
      role?: 'automation' | 'application';
      scopes?: string[];
      expected_revision?: number;
      enabled?: boolean;
      trust_agreement?: string | null;
      permissions?: ApplicationPolicy['permissions'];
    },
  ) {
    if (!uuid.test(key)) invalid();
    const secret =
      operation === 'update'
        ? undefined
        : randomBytes(48).toString('base64url');
    const credential = secret ? credentials(secret) : undefined;
    const digest = hash(JSON.stringify([principal.clientId, operation, input]));
    return this.store.transaction((s) => {
      const state = this.state(s);
      this.assertOperator(principal, state);
      const commandKey = hash(principal.clientId + ':' + key);
      const commands = (s.managementCommands ??= {});
      for (const [id, command] of Object.entries(commands))
        if (command.at + 86_400_000 <= this.now()) delete commands[id];
      const previous = commands[commandKey];
      if (previous) {
        if (previous.hash !== digest) conflict();
        // Credentials are never retained for replay. A repeated creation exposes metadata only.
        return { ...(previous.result as object), credential_replayed: false };
      }
      if (Object.keys(commands).length >= 10000) conflict();
      let identity: ManagedIdentity;
      if (operation === 'create') {
        if (
          !text(input.name, 100) ||
          !['automation', 'application'].includes(input.role ?? '') ||
          Object.keys(state.identities).length >= 100
        )
          invalid();
        const role = input.role!,
          allowed =
            role === 'application' ? applicationScopes : managementScopes;
        const scopes =
          input.scopes ??
          (role === 'application'
            ? [
                'wallet:access',
                'wallet:access:read',
                'wallet:account:read',
                'wallet:provision',
                'wallet:configuration:read',
                'wallet:configuration:propose',
                'wallet:actions',
                'wallet:execute',
                'wallet:execute:read',
              ]
            : [...managementScopes]);
        if (
          !scopes.length ||
          scopes.some((v) => !(allowed as readonly string[]).includes(v)) ||
          new Set(scopes).size !== scopes.length
        )
          invalid();
        const id =
          (role === 'application' ? 'app-' : 'automation-') + randomUUID();
        identity = {
          id,
          name: input.name,
          role,
          enabled: true,
          revision: 1,
          credentialRevision: 1,
          ...credential!,
          scopes,
        };
        state.identities[id] = identity;
      } else {
        identity = state.identities[input.id ?? ''];
        if (!identity || identity.revision !== input.expected_revision)
          conflict();
        if (identity.role === 'administrator') {
          const actor = this.identity(principal, state);
          if (
            actor.role !== 'administrator' ||
            (operation === 'rotate' && identity.id !== actor.id)
          )
            deny();
          if (
            input.trust_agreement !== undefined ||
            input.permissions !== undefined
          )
            invalid();
          if (
            input.enabled === false &&
            identity.enabled &&
            Object.values(state.identities).filter(
              (i) => i.role === 'administrator' && i.enabled,
            ).length <= 1
          )
            conflict();
        }
        if (operation === 'rotate') {
          Object.assign(identity, credential);
          identity.credentialRevision++;
        } else {
          if (input.scopes !== undefined) {
            if (identity.role === 'administrator') invalid();
            const allowed: readonly string[] =
              identity.role === 'application'
                ? applicationScopes
                : managementScopes;
            if (
              !input.scopes.length ||
              new Set(input.scopes).size !== input.scopes.length ||
              input.scopes.some((scope) => !allowed.includes(scope))
            )
              invalid();
            identity.scopes = [...input.scopes];
          }
          if (input.enabled !== undefined) identity.enabled = input.enabled;
          if (input.name !== undefined) {
            if (!text(input.name, 100)) invalid();
            identity.name = input.name;
          }
          if (
            input.trust_agreement !== undefined ||
            input.permissions !== undefined
          ) {
            if (identity.role !== 'application') invalid();
            const agreement =
              input.trust_agreement === undefined
                ? identity.policy?.assertionTrust?.agreement
                : input.trust_agreement;
            const policy: ApplicationPolicy = {
              issuer: this.issuer,
              clientId: identity.id,
              name: identity.name,
              permissions: input.permissions ??
                identity.policy?.permissions ?? ['account:read'],
              ...(agreement ? { assertionTrust: { agreement } } : {}),
            };
            if (agreement !== null && agreement !== undefined)
              defineOnboardingPolicy({
                ...this.basePolicy,
                applications: [policy],
              });
            else if (
              input.permissions !== undefined &&
              (!input.permissions.length ||
                input.permissions.some(
                  (p) =>
                    ![
                      'account:read',
                      'contracts:request',
                      'operations:request',
                    ].includes(p),
                ))
            )
              invalid();
            identity.policy = policy;
          }
          if (identity.policy) identity.policy.name = identity.name;
          identity.credentialRevision++;
        }
        for (const request of Object.values(s.requests ?? {})) {
          if (
            request.caller.clientId === identity.id &&
            request.caller.issuer === this.issuer
          )
            request.denied = true;
        }
        identity.revision++;
        for (const grant of Object.values(s.grants))
          if (
            grant.caller.clientId === identity.id &&
            grant.caller.issuer === this.issuer
          )
            grant.state = 'revoked';
      }
      const result = structuredClone(publicIdentity(identity));
      commands[commandKey] = { hash: digest, result, at: this.now() };
      s.audit.push({
        at: this.now(),
        event: 'management_identity_' + operation,
        resource: hash(identity.id),
        revision: String(identity.revision),
      });
      return { ...result, ...(secret ? { client_secret: secret } : {}) };
    });
  }
  identities(principal: VerifiedPrincipal) {
    this.assertOperator(principal);
    return Object.values(this.snapshot()!.identities).map(publicIdentity);
  }
}
