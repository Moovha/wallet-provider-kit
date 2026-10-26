import { providerNetwork, type ProviderNetwork } from '../networks.js';
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { walletDescription } from '../onboarding/wallets.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import type {
  ApplicationPolicy,
  OnboardingStore,
  ProviderState,
  UserCheckSettings,
} from '../onboarding/types.js';
import {
  defineOnboardingPolicy,
  deny,
  invalid,
  text,
  uuid,
} from '../onboarding/policy.js';
import { canonicalHash } from '../domain/canonical.js';
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
  federation?: { issuer: string; subject: string };
  scopes: string[];
  policy?: ApplicationPolicy;
}
export interface ManagementState {
  version: 1;
  installationId: string;
  claimHash: string;
  claimExpiresAt: number;
  claimed: boolean;
  networkSettings?: { revision: number; networks: ProviderNetwork[] };
  userChecks?: { revision: number; settings: UserCheckSettings };
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
  federation: _federation,
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
    private readonly accountNetwork?: (
      id: string,
    ) => import('../networks.js').ProviderNetwork | undefined,
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
  tokenLifetimeSeconds(principal: VerifiedPrincipal) {
    return this.identity(principal).role === 'administrator' ? 1800 : 300;
  }
  currentPrincipal(principal: VerifiedPrincipal) {
    this.identity(principal);
  }
  async users(
    principal: VerifiedPrincipal,
    input: { limit?: number; after?: string; application_id?: string } = {},
  ) {
    const limit = input.limit ?? 25;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (input.after !== undefined && !/^[a-f0-9]{64}$/.test(input.after)) ||
      (input.application_id !== undefined && !text(input.application_id))
    )
      invalid();
    return this.store.transaction((state) => {
      this.assertOperator(principal, this.state(state));
      const ids = Object.keys(state.verifiedUsers ?? {})
        .sort()
        .filter(
          (id) =>
            (!input.after || id > input.after) &&
            (!input.application_id ||
              state.verifiedUsers![id].clientId === input.application_id),
        );
      const page = ids.slice(0, limit);
      return {
        users: page.map((id) => this.userSummary(state.verifiedUsers![id])),
        next_cursor: ids.length > limit ? page.at(-1)! : null,
      };
    });
  }
  private userSummary(
    user: import('../onboarding/types.js').VerifiedUserRecord,
  ) {
    return {
      id: user.id,
      application_id: user.clientId,
      issuer: user.issuer,
      user_id: user.userId,
      kyc: {
        source: 'application_attestation' as const,
        level: user.identity.level,
        verified_at: user.identity.verified_at,
        accepted_until: new Date(user.acceptedUntil).toISOString(),
      },
    };
  }
  async user(principal: VerifiedPrincipal, id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) invalid();
    const result = await this.store.transaction((state) => {
      this.assertOperator(principal, this.state(state));
      const user = state.verifiedUsers?.[id];
      if (!user) return null;
      return {
        ...this.userSummary(user),
        kyc: {
          ...this.userSummary(user).kyc,
          reference: user.identity.reference,
          fields: { ...user.identity.fields },
        },
        wallets: Object.values(state.accounts ?? {})
          .flatMap((account) => {
            const member = account.members?.[id];
            const role =
              account.owner === id || account.linkedOwners?.includes(id)
                ? 'owner'
                : member && member.state !== 'removed'
                  ? 'member'
                  : undefined;
            return role
              ? [
                  {
                    account_id: account.id,
                    network: this.accountNetwork?.(account.id),
                    wallet: walletDescription(account),
                    role,
                    status: account.status,
                    address: account.address,
                    ...(role === 'member'
                      ? { membership_state: member!.state }
                      : {}),
                  },
                ]
              : [];
          })
          .sort((a, b) => a.account_id.localeCompare(b.account_id)),
      };
    });
    if (!result)
      throw Object.assign(new Error('Not found'), { statusCode: 404 });
    return result;
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
        management_identities: Object.values(state.identities)
          .filter((identity) => identity.role !== 'application')
          .map(publicIdentity),
        user_checks: this.userChecks(state),
        applications: Object.values(state.identities)
          .filter((i) => i.role === 'application')
          .map(publicIdentity),
      };
    });
  }
  currentUserChecks(): (UserCheckSettings & { revision: number }) | undefined {
    const current = this.snapshot()?.userChecks;
    return current
      ? structuredClone({ ...current.settings, revision: current.revision })
      : undefined;
  }
  private userChecks(state: ManagementState) {
    const policy = defineOnboardingPolicy({
      ...this.basePolicy,
      applications: [],
    });
    return {
      available: policy.access.mode === 'application',
      revision: state.userChecks?.revision ?? 1,
      ...(state.userChecks?.settings ?? {
        required_fields: policy.identity.application?.requiredFields ?? [],
        verification_level:
          policy.identity.application?.verificationLevel ?? '',
        max_identity_age_days: policy.identity.maxAgeDays,
        max_access_days: policy.access.maxAgeDays,
      }),
    };
  }
  async readUserChecks(principal: VerifiedPrincipal) {
    return this.store.transaction((s) => {
      const state = this.state(s);
      this.assertOperator(principal, state);
      return this.userChecks(state);
    });
  }
  async saveUserChecks(
    principal: VerifiedPrincipal,
    key: string,
    input: UserCheckSettings & { expected_revision: number },
  ) {
    if (!uuid.test(key)) invalid();
    if (
      !Number.isInteger(input.max_identity_age_days) ||
      !Number.isInteger(input.max_access_days)
    )
      invalid();
    let settings: UserCheckSettings;
    try {
      const policy = defineOnboardingPolicy({
        ...this.basePolicy,
        applications: [],
        identity: {
          maxAgeDays: input.max_identity_age_days,
          application: {
            requiredFields: input.required_fields,
            verificationLevel: input.verification_level,
          },
        },
        access: { mode: 'application', maxAgeDays: input.max_access_days },
      });
      settings = {
        required_fields: [...policy.identity.application!.requiredFields],
        verification_level: policy.identity.application!.verificationLevel,
        max_identity_age_days: policy.identity.maxAgeDays,
        max_access_days: policy.access.maxAgeDays,
      };
    } catch {
      invalid();
    }
    const digest = hash(JSON.stringify(['user-checks', input]));
    return this.store.transaction((s) => {
      const state = this.state(s);
      this.assertOperator(principal, state);
      const current = this.userChecks(state);
      if (!current.available) deny();
      const commandKey = hash(principal.clientId + ':' + key);
      const commands = (s.managementCommands ??= {});
      for (const [id, command] of Object.entries(commands))
        if (command.at + 86_400_000 <= this.now()) delete commands[id];
      const previous = commands[commandKey];
      if (previous) {
        if (previous.hash !== digest) conflict();
        return previous.result as ReturnType<ManagementService['userChecks']>;
      }
      if (Object.keys(commands).length >= 10000) conflict();
      if (input.expected_revision !== current.revision) conflict();
      const { available: _available, revision: _revision, ...before } = current;
      if (JSON.stringify(before) !== JSON.stringify(settings)) {
        state.userChecks = { revision: current.revision + 1, settings };
        for (const request of Object.values(s.requests ?? {}))
          request.denied = true;
        for (const grant of Object.values(s.grants)) grant.state = 'revoked';
        s.audit.push({
          at: this.now(),
          event: 'user_checks_updated',
          resource: hash(state.installationId),
          revision: String(state.userChecks.revision),
        });
      }
      const result = this.userChecks(state);
      commands[commandKey] = { hash: digest, result, at: this.now() };
      return result;
    });
  }
  storedNetworks(): ProviderNetwork[] | undefined {
    return this.snapshot()?.networkSettings?.networks.slice();
  }
  networkSettings(
    principal: VerifiedPrincipal,
    current: readonly ProviderNetwork[],
  ) {
    this.assertOperator(principal);
    return structuredClone(
      this.snapshot()?.networkSettings ?? {
        revision: 1,
        networks: [...current],
      },
    );
  }
  async saveNetworks(
    principal: VerifiedPrincipal,
    key: string,
    input: { expected_revision: number; networks: ProviderNetwork[] },
    current: readonly ProviderNetwork[],
  ) {
    if (
      !uuid.test(key) ||
      !Number.isInteger(input.expected_revision) ||
      input.expected_revision < 1 ||
      !Array.isArray(input.networks) ||
      input.networks.length < 1 ||
      input.networks.length > 4 ||
      new Set(input.networks).size !== input.networks.length ||
      !input.networks.includes(current[0])
    )
      invalid();
    for (const network of input.networks) {
      try {
        providerNetwork(network);
      } catch {
        invalid();
      }
    }
    const digest = hash(JSON.stringify(['networks', input]));
    return this.store.transaction((state) => {
      const management = this.state(state);
      this.assertOperator(principal, management);
      const commands = (state.managementCommands ??= {}),
        commandKey = hash(principal.clientId + ':' + key);
      for (const [id, command] of Object.entries(commands))
        if (command.at + 86_400_000 <= this.now()) delete commands[id];
      const previous = commands[commandKey];
      if (previous) {
        if (previous.hash !== digest) conflict();
        return previous.result as {
          revision: number;
          networks: ProviderNetwork[];
        };
      }
      if (Object.keys(commands).length >= 10000) conflict();
      const before = management.networkSettings ?? {
        revision: 1,
        networks: [...current],
      };
      if (before.revision !== input.expected_revision) conflict();
      const next = {
        revision: before.revision + 1,
        networks: [
          current[0],
          ...input.networks.filter((network) => network !== current[0]).sort(),
        ],
      };
      management.networkSettings = next;
      commands[commandKey] = { hash: digest, result: next, at: this.now() };
      state.audit.push({
        at: this.now(),
        event: 'network_settings_saved',
        resource: hash(management.installationId),
        revision: String(next.revision),
      });
      return next;
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
        current.federation !== undefined ||
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
  /** Called only after the configured external identity provider authenticates an approved administrator. */
  async federatedAdministrator(
    issuer: string,
    subject: string,
    bootstrap: boolean,
  ) {
    if (!text(issuer, 512) || !text(subject, 256)) deny();
    const id =
      'operator-cognito-' +
      hash(JSON.stringify([issuer, subject])).slice(0, 32);
    return this.store.transaction((s) => {
      const state = this.state(s);
      if (!state.claimed && !bootstrap) deny();
      let identity = state.identities[id];
      if (
        identity &&
        (!identity.enabled ||
          identity.federation?.issuer !== issuer ||
          identity.federation.subject !== subject)
      )
        deny();
      if (!identity) {
        if (Object.keys(state.identities).length >= 100) deny();
        identity = {
          id,
          name: 'Cognito administrator',
          role: 'administrator',
          enabled: true,
          revision: 1,
          credentialRevision: 1,
          salt: '',
          verifier: '',
          federation: { issuer, subject },
          scopes: [...managementScopes],
        };
        state.identities[id] = identity;
        s.audit.push({
          at: this.now(),
          event: 'federated_administrator_registered',
          resource: hash(id),
          revision: '1',
        });
      }
      if (!state.claimed) {
        state.claimed = true;
        state.claimHash = '';
        state.claimExpiresAt = 0;
        s.audit.push({
          at: this.now(),
          event: 'installation_claimed',
          resource: hash(id),
          revision: '1',
        });
      }
      return {
        issuer: this.issuer,
        subject: id,
        clientId: id,
        scopes: [...managementScopes],
        credentialRevision: identity.credentialRevision,
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
      wallet_sharing?: Omit<
        import('../onboarding/types.js').WalletSharingPolicy,
        'revision'
      > | null;
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
                'wallet:sign',
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
            input.permissions !== undefined ||
            input.wallet_sharing !== undefined
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
        const grantAuthority = () =>
          hash(
            JSON.stringify([
              identity.enabled,
              identity.policy?.assertionTrust,
              [...(identity.policy?.permissions ?? [])].sort(),
            ]),
          );
        const tokenAuthority = () =>
          hash(JSON.stringify([grantAuthority(), [...identity.scopes].sort()]));
        const previousSharing = JSON.stringify(identity.policy?.walletSharing);
        const previousGrantAuthority = grantAuthority(),
          previousTokenAuthority = tokenAuthority();
        if (operation === 'rotate') {
          if (identity.federation) invalid();
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
              ...(identity.policy?.walletSharing &&
              input.wallet_sharing !== null
                ? { walletSharing: identity.policy.walletSharing }
                : {}),
              permissions: input.permissions ??
                identity.policy?.permissions ?? ['account:read'],
              ...(agreement ? { assertionTrust: { agreement } } : {}),
            };
            if (agreement !== null && agreement !== undefined) {
              try {
                defineOnboardingPolicy({
                  ...this.basePolicy,
                  identity: {
                    application: {
                      requiredFields: this.userChecks(state).required_fields,
                      verificationLevel:
                        this.userChecks(state).verification_level,
                    },
                  },
                  applications: [policy],
                });
              } catch {
                invalid();
              }
            } else if (
              input.permissions !== undefined &&
              (!input.permissions.length ||
                input.permissions.some(
                  (p) =>
                    ![
                      'account:read',
                      'contracts:request',
                      'operations:request',
                      'members:manage',
                      'owners:manage',
                    ].includes(p),
                ))
            )
              invalid();
            identity.policy = policy;
          }
          if (input.wallet_sharing !== undefined) {
            if (
              identity.role !== 'application' ||
              (!identity.policy?.assertionTrust &&
                input.wallet_sharing !== null)
            )
              invalid();
            if (input.wallet_sharing === null) {
              if (identity.policy) delete identity.policy.walletSharing;
            } else {
              if (!identity.policy) invalid();
              const sharing = structuredClone(input.wallet_sharing);
              const fields = this.userChecks(state).required_fields;
              if (
                Object.keys(sharing).some(
                  (key) =>
                    !['applications', 'matchingFields', 'agreement'].includes(
                      key,
                    ),
                ) ||
                !Array.isArray(sharing.applications) ||
                !Array.isArray(sharing.matchingFields) ||
                sharing.matchingFields.some(
                  (field) => !fields.includes(field),
                ) ||
                sharing.applications.some(
                  (id) =>
                    id === identity.id ||
                    !state.identities[id]?.enabled ||
                    state.identities[id]?.role !== 'application' ||
                    !state.identities[id]?.policy?.assertionTrust,
                )
              )
                invalid();
              sharing.applications.sort();
              sharing.matchingFields.sort();
              try {
                defineOnboardingPolicy({
                  ...this.basePolicy,
                  identity: {
                    application: {
                      requiredFields: fields,
                      verificationLevel:
                        this.userChecks(state).verification_level,
                    },
                  },
                  access: { mode: 'application' },
                  applications: [
                    { ...identity.policy, walletSharing: sharing },
                  ],
                });
              } catch {
                invalid();
              }
              const { revision: _revision, ...before } =
                identity.policy.walletSharing ?? {};
              if (canonicalHash(before) !== canonicalHash(sharing))
                identity.policy.walletSharing = {
                  ...sharing,
                  revision: randomUUID(),
                };
            }
          }
          if (identity.policy) identity.policy.name = identity.name;
          if (tokenAuthority() !== previousTokenAuthority)
            identity.credentialRevision++;
        }
        const invalidatesGrants = grantAuthority() !== previousGrantAuthority;
        const invalidatesSharing =
          invalidatesGrants ||
          previousSharing !== JSON.stringify(identity.policy?.walletSharing);
        if (invalidatesSharing) {
          for (const request of Object.values(s.requests ?? {})) {
            if (
              (request.sharing?.sourceApplicationId === identity.id ||
                s.accounts?.[request.accountId]?.members?.[
                  request.membership?.personId ?? ''
                ]?.sourceSharing?.applicationId === identity.id) &&
              request.caller.issuer === this.issuer
            ) {
              request.denied = true;
              if (request.grantId && s.grants[request.grantId])
                s.grants[request.grantId].state = 'revoked';
            }
          }
        }
        for (const request of Object.values(s.requests ?? {})) {
          if (
            invalidatesGrants &&
            request.caller.clientId === identity.id &&
            request.caller.issuer === this.issuer
          )
            request.denied = true;
        }
        identity.revision++;
        for (const grant of Object.values(s.grants))
          if (
            invalidatesGrants &&
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
