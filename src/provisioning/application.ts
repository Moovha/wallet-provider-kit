import { quoteNetworkFees } from '../execution/network-fees.js';
import { createRpcObserver } from '../execution/single-rpc.js';
import { poolKey, poolMembers, retainPoolConfiguration } from './pools.js';
import { randomUUID } from 'node:crypto';
import type {
  AuthorityContext,
  VerifiedPrincipal,
} from '../domain/principal.js';
import type {
  EmbeddedAccount,
  WalletSigningProvider,
} from '../domain/signing.js';
import type { WalletAttemptRequest } from '../domain/attempt-journal.js';
import type { ProviderDatabase } from '../storage/index.js';
import { deny, fingerprint, uuid } from '../onboarding/policy.js';
import type { OnboardingService } from '../onboarding/service.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
import type { ExecutionConfiguration } from '../execution/types.js';
import { RpcReader } from '../execution/chain.js';
import { createWalletAttemptRequest } from '../providers/attempt-lifecycle.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
} from '../runtime-configuration/service.js';
import {
  minimumSponsorFunding,
  sponsorshipGas,
  type ApplicationObligations,
} from '../runtime-configuration/obligations.js';
import {
  SafeProvisioningService,
  type SafeProvisioningConfiguration,
  type SafeDeploymentDriver,
} from './safe.js';

export interface ApplicationSafeAccount {
  applicationId: string;
  poolIndex?: number;
  userAccountId?: string;
  userOwner?: string;
  accountId: string;
  attemptId: string;
  provider: string;
  operator: VerifiedPrincipal;
  account?: EmbeddedAccount;
}
export const applicationAccountNamespace = 'application-safe-signers-v1';
/** Provider-owned infrastructure identity. It is never inserted into user accounts or exposed as a generic signing account. */
export class ApplicationSafeService {
  constructor(
    private readonly resources: RuntimeConfigurationService,
    private readonly onboarding: OnboardingService,
    private readonly database: ProviderDatabase,
    private readonly backend: WalletSigningProvider & {
      reserveAccount?(id: string): Promise<void>;
    },
    private readonly safe: SafeProvisioningConfiguration,
    private readonly execution: ExecutionConfiguration,
    private readonly driver: SafeDeploymentDriver,
    private readonly revision: string,
    private readonly enabled: boolean,
    private readonly network?: ProviderNetwork,
    private readonly request: typeof fetch = fetch,
    private readonly sponsors?: import('./application-sponsor.js').ApplicationSponsorService,
    private readonly executionDriver?: (
      config: ExecutionConfiguration,
    ) => SafeDeploymentDriver,
  ) {}
  private async terms(
    principal: VerifiedPrincipal,
    applicationId: string,
    index = 0,
  ) {
    const resources = await this.resources.readObligations(
      principal,
      applicationId,
    );
    const sponsorship = resources.resources.find(
      (r) => r.kind === 'sponsorship',
    );
    if (sponsorship?.decision !== 'accepted') deny();
    const application = this.resources.onboardingPolicy.applications.find(
      (a) => runtimeApplicationId(a.issuer, a.clientId) === applicationId,
    );
    if (!application) deny();
    const execution = this.sponsors
      ? await this.sponsors.configuration(applicationId)
      : this.execution;
    const sponsors = execution.sponsors.filter(
      (s) => s.clientId === application.clientId,
    );
    if (!sponsors.length) deny();
    const sponsor = sponsors[index % sponsors.length],
      agreement = sponsorship.value as ApplicationObligations['sponsorship'];
    if (
      sponsor.fundingAgreement !== agreement.funding_agreement ||
      BigInt(sponsor.lifetimeBudgetWei) >
        BigInt(agreement.maximum_gas_budget_wei) ||
      (this.sponsors &&
        Object.entries(sponsorshipGas(agreement)).some(
          ([field, value]) => sponsor[field as keyof typeof sponsor] !== value,
        ))
    )
      deny();
    return {
      application,
      sponsor,
      execution: {
        ...execution,
        sponsors: [sponsor, ...sponsors.filter((s) => s !== sponsor)],
      },
      endpoints: await this.resources.rpcEndpoints(applicationId),
    };
  }
  private async stored(
    applicationId: string,
    index = 0,
    userAccountId?: string,
  ) {
    return this.database.onboardingStore.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.revision
      )
        deny();
      return state.deploymentBindings['service-v1'].runtimeConfiguration
        ?.applicationSafes?.[this.key(applicationId, index, userAccountId)];
    });
  }
  private key(applicationId: string, index: number, userAccountId?: string) {
    return userAccountId
      ? fingerprint(['user-execution-safe-v1', applicationId, userAccountId])
      : poolKey(applicationId, index);
  }
  private async userAuthority(
    applicationId: string,
    accountId: string,
    expectedOwner?: string,
  ) {
    const caller = await this.onboarding.store.transaction((state) => {
      const account = state.accounts[accountId];
      if (!account || (expectedOwner && account.owner !== expectedOwner))
        deny();
      return (
        Object.values(state.grants).find(
          (g) =>
            g.accountId === accountId &&
            g.owner === account.owner &&
            g.state === 'active' &&
            g.expiresAt > Date.now() &&
            runtimeApplicationId(g.caller.issuer, g.caller.clientId) ===
              applicationId,
        )?.caller ?? deny()
      );
    });
    return this.onboarding.authorize(
      { ...caller, scopes: [] },
      accountId,
      'contracts:request',
    );
  }
  async authorizeProvision(request: WalletAttemptRequest): Promise<boolean> {
    try {
      if (!this.enabled || request.kind !== 'provision') return false;
      const saved = await this.database.onboardingStore.transaction((state) => {
        if (
          state.deploymentBindings?.['service-v1']?.activeRevision !==
          this.revision
        )
          deny();
        return Object.values(
          state.deploymentBindings['service-v1'].runtimeConfiguration
            ?.applicationSafes ?? {},
        ).find((r) => r.accountId === request.accountId);
      });
      if (!saved || saved.provider !== this.backend.provider) return false;
      const agreement = (
        await this.resources.acceptedSponsorship(saved.applicationId)
      ).value as ApplicationObligations['sponsorship'];
      if (
        (agreement.account_model === 'provider-controlled-user-safe') !==
        !!saved.userAccountId
      )
        return false;
      if (saved.userAccountId)
        await this.userAuthority(
          saved.applicationId,
          saved.userAccountId,
          saved.userOwner,
        );
      await this.terms(
        saved.operator,
        saved.applicationId,
        saved.poolIndex ?? 0,
      );
      return (
        fingerprint(request) ===
        fingerprint(
          createWalletAttemptRequest(
            applicationAccountNamespace,
            this.backend.provider,
            'provision',
            saved.accountId,
            saved.attemptId,
            saved.accountId,
            { accountId: saved.accountId },
          ),
        )
      );
    } catch {
      return false;
    }
  }
  async read(principal: VerifiedPrincipal, applicationId?: string) {
    const resources = await this.resources.readObligations(
      principal,
      applicationId,
    );
    const agreement = resources.resources.find((r) => r.kind === 'sponsorship')
      ?.value as ApplicationObligations['sponsorship'] | undefined;
    const perUser =
      agreement?.account_model === 'provider-controlled-user-safe';
    const app =
      this.resources.onboardingPolicy.applications.find(
        (a) =>
          runtimeApplicationId(a.issuer, a.clientId) ===
          resources.application_id,
      ) ?? deny();
    const dynamicSponsors = await this.sponsors?.members(
      resources.application_id,
    );
    const sponsors = this.sponsors
      ? (dynamicSponsors ?? [])
          .filter((r) => r.status === 'ready')
          .map((r) => r.sponsor)
      : this.execution.sponsors.filter((s) => s.clientId === app.clientId);
    const saved = perUser
      ? undefined
      : await this.stored(resources.application_id);
    const deployment = saved
      ? await this.database.onboardingStore.transaction(
          (state) =>
            state.deploymentBindings?.['service-v1']?.safeAccounts?.[
              saved.accountId
            ],
        )
      : undefined;
    const members = await this.database.onboardingStore.transaction((state) =>
      poolMembers(
        state.deploymentBindings?.['service-v1']?.runtimeConfiguration
          ?.applicationSafes,
        resources.application_id,
      ).map((member) => {
        const safe =
          state.deploymentBindings?.['service-v1']?.safeAccounts?.[
            member.accountId
          ];
        return {
          pool_index: member.poolIndex ?? 0,
          status:
            safe?.state ?? (member.account ? 'signer_ready' : 'signer_pending'),
          ...(safe ? { address: safe.plan.address } : {}),
        };
      }),
    );
    const funding = this.sponsors
      ? await this.sponsors.funding.read(principal, applicationId)
      : undefined;
    const userAccounts = await this.database.onboardingStore.transaction(
      (state) =>
        Object.values(
          state.deploymentBindings?.['service-v1']?.runtimeConfiguration
            ?.applicationSafes ?? {},
        )
          .filter(
            (r) =>
              r.applicationId === resources.application_id && r.userAccountId,
          )
          .map(
            (r) =>
              state.deploymentBindings?.['service-v1']?.safeAccounts?.[
                r.accountId
              ]?.state,
          ),
    );
    let userStatus = 'unprovisioned';
    if (userAccounts.length) userStatus = 'pending';
    if (userAccounts.includes('ready')) userStatus = 'ready';
    return {
      safes: perUser ? [] : members,
      ...(perUser
        ? {
            execution_account_count: userAccounts.length,
            maximum_execution_accounts: agreement!.maximum_execution_accounts,
            maximum_in_flight_per_sponsor:
              agreement!.maximum_in_flight_per_sponsor ?? 2,
          }
        : {}),
      pool_size: perUser
        ? 0
        : (await this.resources.poolConfiguration(resources.application_id))
            .safeCount,
      application_id: resources.application_id,
      funding_addresses: funding
        ? funding.funding_address
          ? [funding.funding_address]
          : []
        : sponsors.map((s) => s.binding.address),
      chain_id: providerNetwork(this.network).caip,
      funding_requirements: funding
        ? funding.funding_address && sponsors[0]
          ? [
              {
                address: funding.funding_address,
                minimum_balance_wei: funding.minimum_initial_funding_wei,
                maximum_gas_budget_wei: sponsors[0].lifetimeBudgetWei,
                gas_limits: {
                  gas_limit: sponsors[0].gasLimit,
                  max_fee_per_gas: sponsors[0].maxFeePerGas,
                  max_priority_fee_per_gas: sponsors[0].maxPriorityFeePerGas,
                  l1_fee_reserve_wei: sponsors[0].l1FeeReserveWei,
                },
              },
            ]
          : []
        : sponsors.map((sponsor) => ({
            address: sponsor.binding.address,
            minimum_balance_wei: minimumSponsorFunding(sponsor).toString(),
            maximum_gas_budget_wei: sponsor.lifetimeBudgetWei,
            gas_limits: {
              gas_limit: sponsor.gasLimit,
              max_fee_per_gas: sponsor.maxFeePerGas,
              max_priority_fee_per_gas: sponsor.maxPriorityFeePerGas,
              l1_fee_reserve_wei: sponsor.l1FeeReserveWei,
            },
          })),
      status: perUser
        ? userStatus
        : ((deployment?.state === 'ready' &&
          (members.length !==
            (await this.resources.poolConfiguration(resources.application_id))
              .safeCount ||
            members.some((r) => r.status !== 'ready'))
            ? 'pending'
            : deployment?.state) ??
          (saved?.account
            ? 'signer_ready'
            : saved
              ? 'signer_pending'
              : 'unprovisioned')),
      ...(deployment ? { address: deployment.plan.address } : {}),
      asset_model: 'individual-user-wallets' as const,
      account_model:
        agreement?.account_model ?? 'provider-controlled-application-safe',
    };
  }
  async provision(
    context: AuthorityContext,
    applicationId: string,
    index = 0,
    userAccountId?: string,
  ) {
    return this.resources.withRpc(
      applicationId,
      (endpoints) =>
        this.provisionAt(
          context,
          applicationId,
          index,
          endpoints,
          userAccountId,
        ),
      this.request,
    );
  }
  private async provisionAt(
    context: AuthorityContext,
    applicationId: string,
    index: number,
    endpoints: string[],
    userAccountId?: string,
  ) {
    const pool = await this.resources.poolConfiguration(applicationId);
    if (
      (!userAccountId && index >= pool.safeCount) ||
      (userAccountId && (!uuid.test(userAccountId) || index !== 0))
    )
      deny();
    const key = this.key(applicationId, index, userAccountId);
    context = structuredClone(context);
    if (!this.enabled || !uuid.test(context.idempotencyKey)) deny();
    this.resources.assertOperator(context.principal);
    const agreement = (await this.resources.acceptedSponsorship(applicationId))
      .value as ApplicationObligations['sponsorship'];
    if (
      (agreement.account_model === 'provider-controlled-user-safe') !==
      !!userAccountId
    )
      deny();
    const grant = userAccountId
      ? await this.userAuthority(applicationId, userAccountId)
      : undefined;
    const selectedIndex = userAccountId
      ? await this.database.onboardingStore.transaction((state) => {
          const records = Object.values(
            state.deploymentBindings?.['service-v1']?.runtimeConfiguration
              ?.applicationSafes ?? {},
          );
          return (
            records.find(
              (r) =>
                r.applicationId === applicationId &&
                r.userAccountId === userAccountId,
            )?.poolIndex ??
            records.filter(
              (r) => r.applicationId === applicationId && r.userAccountId,
            ).length % pool.sponsorCount
          );
        })
      : index;
    const terms = await this.terms(
      context.principal,
      applicationId,
      selectedIndex,
    );
    const retained = await this.stored(applicationId, index, userAccountId);
    if (!retained?.account) {
      const observer = createRpcObserver(
        endpoints,
        terms.execution.rpc.genesisHash,
        terms.execution.maxLogRange,
        this.request,
        this.network,
        this.resources.rpcVerification,
      );
      const fees = await quoteNetworkFees(
        new RpcReader(endpoints[0], this.request, 4, true),
        terms.sponsor,
      );
      const minimum =
        BigInt(terms.sponsor.gasLimit) *
          BigInt(fees?.maxFeePerGas ?? terms.sponsor.maxFeePerGas) +
        BigInt(terms.sponsor.l1FeeReserveWei);
      if (
        BigInt(await observer.payerBalance(terms.sponsor.binding.address)) <
        minimum
      )
        deny();
    }
    const saved = await this.database.onboardingStore.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.revision
      )
        deny();
      const registry =
        state.deploymentBindings['service-v1'].runtimeConfiguration ?? deny();
      const accounts = (registry.applicationSafes ??= {});
      retainPoolConfiguration(registry, applicationId, pool);
      if (
        userAccountId &&
        (!grant || state.accounts[userAccountId]?.owner !== grant.owner)
      )
        deny();
      const previous = accounts[key];
      if (previous) {
        if (
          previous.provider !== this.backend.provider ||
          (userAccountId && previous.userOwner !== grant?.owner)
        )
          deny();
        return previous;
      }
      if (
        userAccountId &&
        Object.values(accounts).filter(
          (r) => r.applicationId === applicationId && r.userAccountId,
        ).length >= (agreement.maximum_execution_accounts ?? 0)
      )
        deny();
      return (accounts[key] = {
        applicationId,
        poolIndex: selectedIndex,
        ...(userAccountId ? { userAccountId, userOwner: grant!.owner } : {}),
        accountId: randomUUID(),
        attemptId: randomUUID(),
        provider: this.backend.provider,
        operator: context.principal,
      });
    });
    if (!saved.account) {
      const request = createWalletAttemptRequest(
        applicationAccountNamespace,
        this.backend.provider,
        'provision',
        saved.accountId,
        saved.attemptId,
        saved.accountId,
        { accountId: saved.accountId },
      );
      if (!(await this.authorizeProvision(request))) deny();
      const budgetId = fingerprint(['application-safe-signer', key]);
      await this.database.setBudget(budgetId, '1', this.revision);
      await this.database.admitAttempt({ request, budgetId, units: '1' });
      await this.backend.reserveAccount?.(saved.accountId);
      const account = await this.backend.createAccount(
        saved.accountId,
        saved.attemptId,
      );
      await this.database.onboardingStore.transaction((state) => {
        const registry = state.deploymentBindings?.['service-v1'];
        const record = registry?.runtimeConfiguration?.applicationSafes?.[key];
        if (
          registry?.activeRevision !== this.revision ||
          !record ||
          record.accountId !== account.accountId ||
          (record.account &&
            fingerprint(record.account) !== fingerprint(account))
        )
          deny();
        record.account = account;
      });
      saved.account = account;
    }
    const current = async () => {
      const latest = await this.terms(
        context.principal,
        applicationId,
        selectedIndex,
      );
      const record = await this.stored(applicationId, index, userAccountId);
      const currentAgreement = (
        await this.resources.acceptedSponsorship(applicationId)
      ).value as ApplicationObligations['sponsorship'];
      if (
        (currentAgreement.account_model === 'provider-controlled-user-safe') !==
        !!userAccountId
      )
        deny();
      if (userAccountId)
        await this.userAuthority(applicationId, userAccountId, saved.userOwner);
      if (
        !record?.account ||
        fingerprint(record.account) !== fingerprint(saved.account) ||
        fingerprint(latest) !== fingerprint(terms)
      )
        deny();
      return {
        owner: record.account.address,
        caller: {
          issuer: terms.application.issuer,
          clientId: terms.application.clientId,
          subject: applicationId,
        },
      };
    };
    const service = new SafeProvisioningService(
      this.onboarding,
      this.database,
      this.safe,
      terms.execution,
      this.revision,
      this.executionDriver
        ? this.executionDriver(terms.execution)
        : this.driver,
      endpoints,
      this.network,
      this.request,
      undefined,
      undefined,
      current,
      this.resources.rpcVerification,
      'included',
    );
    await service.provision(
      {
        principal: {
          issuer: terms.application.issuer,
          clientId: terms.application.clientId,
          subject: applicationId,
          scopes: [],
        },
        idempotencyKey: context.idempotencyKey,
      },
      saved.accountId,
    );
    if (userAccountId) {
      const deployment = await this.database.onboardingStore.transaction(
        (state) =>
          state.deploymentBindings?.['service-v1']?.safeAccounts?.[
            saved.accountId
          ],
      );
      return {
        ...(await this.read(context.principal, applicationId)),
        user_account_id: userAccountId,
        status: deployment?.state ?? 'signer_ready',
        ...(deployment ? { address: deployment.plan.address } : {}),
      };
    }
    return this.read(context.principal, applicationId);
  }
}
