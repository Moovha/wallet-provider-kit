import { randomUUID } from 'node:crypto';
import { Wallet } from 'ethers';
import { fingerprint, deny, uuid } from '../onboarding/policy.js';
import type { AuthorityContext } from '../domain/principal.js';
import type { ProviderDatabase } from '../storage/index.js';
import type { ProviderNetwork } from '../networks.js';
import { providerNetwork } from '../networks.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
} from '../runtime-configuration/service.js';
import {
  sponsorshipGas,
  minimumSponsorFunding,
  type ApplicationObligations,
} from '../runtime-configuration/obligations.js';
import {
  ApplicationCredentialCipher,
  type ApplicationCredential,
} from '../runtime-configuration/credentials.js';
import type {
  ExecutionConfiguration,
  ExecutionSponsor,
} from '../execution/types.js';
import {
  localSponsorIds,
  localExecutionOrigin,
} from '../deployment/local-execution-contract.js';
import { createRelayerClient } from '../providers/relayer-client.js';

export interface ApplicationSponsorRecord {
  applicationId: string;
  sponsor: ExecutionSponsor;
  key: ApplicationCredential;
  status: 'prepared' | 'ready';
}
/** Deterministic private Relayer identities allow read-before-create reconciliation without replacing an uncertain signer. */
export class ApplicationSponsorService {
  private readonly client: ReturnType<typeof createRelayerClient>;
  constructor(
    private readonly resources: RuntimeConfigurationService,
    private readonly database: ProviderDatabase,
    private readonly cipher: ApplicationCredentialCipher,
    private readonly template: ExecutionConfiguration,
    private readonly revision: string,
    apiKey: string,
    private readonly transport: typeof fetch,
    private readonly network?: ProviderNetwork,
  ) {
    this.client = createRelayerClient(
      {
        url: localExecutionOrigin,
        apiKey,
        network,
        resolveAccount: async () => null,
      },
      transport,
    );
  }
  async read(applicationId: string) {
    return this.database.onboardingStore.transaction((state) => {
      if (
        state.deploymentBindings?.['service-v1']?.activeRevision !==
        this.revision
      )
        deny();
      return state.deploymentBindings['service-v1'].runtimeConfiguration
        ?.applicationSponsors?.[applicationId];
    });
  }
  async configuration(applicationId: string): Promise<ExecutionConfiguration> {
    const record = await this.read(applicationId);
    if (record?.status !== 'ready') deny();
    return {
      ...structuredClone(this.template),
      sponsors: [structuredClone(record.sponsor)],
    };
  }
  async provision(context: AuthorityContext, applicationId: string) {
    context = structuredClone(context);
    if (!uuid.test(context.idempotencyKey)) deny();
    const resources = await this.resources.readObligations(
      context.principal,
      applicationId,
    );
    const declaration = resources.resources.find(
      (r) => r.kind === 'sponsorship',
    );
    if (declaration?.decision !== 'accepted') deny();
    const agreement =
      declaration.value as ApplicationObligations['sponsorship'];
    const gas = sponsorshipGas(agreement);
    if (BigInt(agreement.maximum_gas_budget_wei) < minimumSponsorFunding(gas))
      deny();
    const application =
      this.resources.onboardingPolicy.applications.find(
        (a) => runtimeApplicationId(a.issuer, a.clientId) === applicationId,
      ) ?? deny();
    const endpoints = await this.resources.rpcEndpoints(
      applicationId,
      'rpc-submission',
    );
    const assertCurrent = async () => {
      const current = await this.resources.readObligations(
        context.principal,
        applicationId,
      );
      if (
        fingerprint(current.resources.find((r) => r.kind === 'sponsorship')) !==
          fingerprint(declaration) ||
        fingerprint(
          await this.resources.rpcEndpoints(applicationId, 'rpc-submission'),
        ) !== fingerprint(endpoints)
      )
        deny();
    };
    const saved = await this.database.onboardingStore.transaction((state) => {
      this.resources.assertOperatorState(context.principal, state);
      const registry =
        state.deploymentBindings!['service-v1'].runtimeConfiguration ?? deny();
      const records = (registry.applicationSponsors ??= {});
      if (records[applicationId]) return records[applicationId];
      const accountId = randomUUID(),
        wallet = Wallet.createRandom();
      return (records[applicationId] = {
        applicationId,
        sponsor: {
          ...gas,
          accountId,
          clientId: application.clientId,
          binding: {
            ...localSponsorIds(accountId),
            address: wallet.address,
            bindingRevision: '1',
          },
          fundingAgreement: agreement.funding_agreement,
          lifetimeBudgetWei: agreement.maximum_gas_budget_wei,
        },
        key: this.cipher.seal(
          {
            application_id: applicationId,
            reference: 'private-sponsor-key',
            revision: '1',
            origin: '',
            status: 'active',
          },
          wallet.privateKey,
        ),
        status: 'prepared',
      });
    });
    if (
      saved.sponsor.fundingAgreement !== agreement.funding_agreement ||
      saved.sponsor.lifetimeBudgetWei !== agreement.maximum_gas_budget_wei ||
      Object.entries(gas).some(
        ([field, value]) =>
          saved.sponsor[field as keyof ExecutionSponsor] !== value,
      )
    )
      deny();
    const ids = saved.sponsor.binding;
    // Creation is constrained to retained deterministic IDs; an existing resource is never overwritten.
    let signer = await this.client.call('GET', '/signers/' + ids.signerId);
    if (!signer) {
      await assertCurrent();
      await this.client.call(
        'POST',
        '/signers',
        JSON.stringify({
          id: ids.signerId,
          type: 'plain',
          config: { key: this.cipher.open(saved.key).slice(2) },
        }),
      );
      signer = await this.client.call('GET', '/signers/' + ids.signerId);
    }
    if (!signer || signer.id !== ids.signerId || signer.type !== 'local')
      deny();
    let relayer = await this.client.call('GET', '/relayers/' + ids.relayerId);
    if (!relayer) {
      await assertCurrent();
      await this.client.call(
        'POST',
        '/relayers',
        JSON.stringify({
          id: ids.relayerId,
          name: 'Application gas sponsor',
          network: providerNetwork(this.network).name,
          network_type: 'evm',
          paused: false,
          signer_id: ids.signerId,
          custom_rpc_urls: endpoints.map((url) => ({ url, weight: 100 })),
          policies: {
            min_balance: 0,
            gas_limit_estimation: false,
            eip1559_pricing: true,
            gas_price_cap: Number(saved.sponsor.maxFeePerGas),
          },
        }),
      );
      relayer = await this.client.call('GET', '/relayers/' + ids.relayerId);
    }
    if (
      !relayer ||
      relayer.id !== ids.relayerId ||
      relayer.signer_id !== ids.signerId ||
      String(relayer.address).toLowerCase() !== ids.address.toLowerCase() ||
      relayer.network !== providerNetwork(this.network).name
    )
      deny();
    await assertCurrent();
    await this.database.onboardingStore.transaction((state) => {
      this.resources.assertOperatorState(context.principal, state);
      const record =
        state.deploymentBindings!['service-v1'].runtimeConfiguration
          ?.applicationSponsors?.[applicationId];
      if (!record || fingerprint(record.sponsor) !== fingerprint(saved.sponsor))
        deny();
      record.status = 'ready';
    });
    return {
      application_id: applicationId,
      funding_address: ids.address,
      status: 'ready' as const,
    };
  }
  /** Install this application's accepted submission RPCs before relayer RPC or transaction work. */
  request(): typeof fetch {
    return (async (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== localExecutionOrigin) deny();
      const id =
        /^\/api\/v1\/relayers\/([^/]+)\/(?:transactions|rpc)(?:\/|$)/.exec(
          url.pathname,
        )?.[1];
      if (id) {
        const record = await this.database.onboardingStore.transaction(
          (state) => {
            if (
              state.deploymentBindings?.['service-v1']?.activeRevision !==
              this.revision
            )
              deny();
            return Object.values(
              state.deploymentBindings['service-v1'].runtimeConfiguration
                ?.applicationSponsors ?? {},
            ).find(
              (r) => r.status === 'ready' && r.sponsor.binding.relayerId === id,
            );
          },
        );
        if (!record) deny();
        const endpoints = await this.resources.rpcEndpoints(
          record.applicationId,
          'rpc-submission',
        );
        await this.client.call(
          'PATCH',
          '/relayers/' + id,
          JSON.stringify({
            custom_rpc_urls: endpoints.map((url) => ({ url, weight: 100 })),
          }),
        );
        if (
          fingerprint(
            await this.resources.rpcEndpoints(
              record.applicationId,
              'rpc-submission',
            ),
          ) !== fingerprint(endpoints)
        )
          deny();
      }
      return this.transport(input, init);
    }) as typeof fetch;
  }
}
