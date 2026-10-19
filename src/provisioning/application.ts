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
import { QuorumExecutionObserver } from '../execution/chain.js';
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
  private async terms(principal: VerifiedPrincipal, applicationId: string) {
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
    if (sponsors.length !== 1) deny();
    const sponsor = sponsors[0],
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
      execution,
      endpoints: await this.resources.rpcEndpoints(applicationId),
    };
  }
  private async stored(applicationId: string) {
    return this.database.onboardingStore.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.revision
      )
        deny();
      return state.deploymentBindings['service-v1'].runtimeConfiguration
        ?.applicationSafes?.[applicationId];
    });
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
      await this.terms(saved.operator, saved.applicationId);
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
    const app =
      this.resources.onboardingPolicy.applications.find(
        (a) =>
          runtimeApplicationId(a.issuer, a.clientId) ===
          resources.application_id,
      ) ?? deny();
    const dynamicSponsor = await this.sponsors?.read(resources.application_id);
    const sponsors = this.sponsors
      ? dynamicSponsor?.status === 'ready'
        ? [dynamicSponsor.sponsor]
        : []
      : this.execution.sponsors.filter((s) => s.clientId === app.clientId);
    const saved = await this.stored(resources.application_id);
    const deployment = saved
      ? await this.database.onboardingStore.transaction(
          (state) =>
            state.deploymentBindings?.['service-v1']?.safeAccounts?.[
              saved.accountId
            ],
        )
      : undefined;
    return {
      application_id: resources.application_id,
      funding_addresses: sponsors.map((s) => s.binding.address),
      chain_id: providerNetwork(this.network).caip,
      funding_requirements: sponsors.map((sponsor) => ({
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
      status:
        deployment?.state ??
        (saved?.account
          ? 'signer_ready'
          : saved
            ? 'signer_pending'
            : 'unprovisioned'),
      ...(deployment ? { address: deployment.plan.address } : {}),
      asset_model: 'individual-user-wallets' as const,
      account_model: 'provider-controlled-application-safe' as const,
    };
  }
  async provision(context: AuthorityContext, applicationId: string) {
    context = structuredClone(context);
    if (!this.enabled || !uuid.test(context.idempotencyKey)) deny();
    this.resources.assertOperator(context.principal);
    const terms = await this.terms(context.principal, applicationId);
    const retained = await this.stored(applicationId);
    if (!retained?.account) {
      const observer = new QuorumExecutionObserver(
        terms.endpoints,
        terms.execution.rpc.genesisHash,
        terms.execution.maxLogRange,
        this.request,
        this.network,
      );
      const minimum =
        BigInt(terms.sponsor.gasLimit) * BigInt(terms.sponsor.maxFeePerGas) +
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
      const previous = accounts[applicationId];
      if (previous) {
        if (previous.provider !== this.backend.provider) deny();
        return previous;
      }
      return (accounts[applicationId] = {
        applicationId,
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
      const budgetId = fingerprint(['application-safe-signer', applicationId]);
      await this.database.setBudget(budgetId, '1', this.revision);
      await this.database.admitAttempt({ request, budgetId, units: '1' });
      await this.backend.reserveAccount?.(saved.accountId);
      const account = await this.backend.createAccount(
        saved.accountId,
        saved.attemptId,
      );
      await this.database.onboardingStore.transaction((state) => {
        const registry = state.deploymentBindings?.['service-v1'];
        const record =
          registry?.runtimeConfiguration?.applicationSafes?.[applicationId];
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
      const latest = await this.terms(context.principal, applicationId);
      const record = await this.stored(applicationId);
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
      terms.endpoints,
      this.network,
      this.request,
      undefined,
      undefined,
      current,
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
    return this.read(context.principal, applicationId);
  }
}
