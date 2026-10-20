import { rpcCapacity } from '../execution/rpc-capacity.js';
import { quoteNetworkFees } from '../execution/network-fees.js';
import { WalletProviderError } from '../domain/signing.js';
import { randomUUID } from 'node:crypto';
import { Wallet, keccak256, toQuantity } from 'ethers';
import { deny, fingerprint } from '../onboarding/policy.js';
import type { VerifiedPrincipal } from '../domain/principal.js';
import type { ProviderDatabase } from '../storage/index.js';
import { RpcReader } from '../execution/chain.js';
import { QuorumExecutionObserver } from '../execution/chain.js';
import { providerNetwork, type ProviderNetwork } from '../networks.js';
import {
  ApplicationCredentialCipher,
  type ApplicationCredential,
} from '../runtime-configuration/credentials.js';
import {
  RuntimeConfigurationService,
  runtimeApplicationId,
  type RuntimeConfigurationState,
} from '../runtime-configuration/service.js';
import {
  minimumSponsorFunding,
  sponsorshipGas,
  type ApplicationObligations,
} from '../runtime-configuration/obligations.js';
import { createWalletAttemptRequest } from '../providers/attempt-lifecycle.js';
import { applicationGasBudgetId } from '../sponsorship/budget.js';
import { poolMembers } from './pools.js';

interface Distribution {
  id: string;
  nonce: number;
  to: string;
  value: string;
  hash: string;
  raw: ApplicationCredential;
  terms: string;
  feeReserve: string;
}
export interface ApplicationFundingRecord {
  applicationId: string;
  accountId: string;
  address: string;
  key: ApplicationCredential;
  transfers: Distribution[];
  nextNonce?: number;
  totalDistributedWei?: string;
  finalizedCheckpoint?: { blockNumber: string; blockHash: string };
  health?: {
    state: 'healthy' | 'routing' | 'needs-funding' | 'paused';
    checked_at: string;
  };
}

/** A separate EOA nonce lane routes native gas only to retained application sponsors. */
export class ApplicationFundingService {
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  constructor(
    private readonly resources: RuntimeConfigurationService,
    private readonly database: ProviderDatabase,
    private readonly cipher: ApplicationCredentialCipher,
    private readonly revision: string,
    private readonly genesisHash: string,
    private readonly transport: typeof fetch,
    private readonly network?: ProviderNetwork,
  ) {}
  private transaction<T>(fn: (registry: RuntimeConfigurationState) => T) {
    return this.database.onboardingStore.transaction((state) => {
      const binding = state.deploymentBindings?.['service-v1'];
      if (
        binding?.activeRevision !== this.revision ||
        !binding.runtimeConfiguration
      )
        deny();
      return fn(binding.runtimeConfiguration);
    });
  }
  async ensure(applicationId: string) {
    await this.resources.acceptedSponsorship(applicationId);
    return this.transaction((registry) => {
      const records = (registry.applicationFunding ??= {});
      if (records[applicationId]) return records[applicationId].address;
      const wallet = Wallet.createRandom();
      records[applicationId] = {
        applicationId,
        accountId: randomUUID(),
        address: wallet.address,
        key: this.cipher.seal(
          {
            application_id: applicationId,
            reference: 'private-gas-funding-key',
            revision: '1',
            origin: '',
            status: 'active',
          },
          wallet.privateKey,
        ),
        transfers: [],
        nextNonce: 0,
        totalDistributedWei: '0',
      };
      return wallet.address;
    });
  }
  async read(principal: VerifiedPrincipal, applicationId?: string) {
    const authorized = await this.resources.readObligations(
      principal,
      applicationId,
    );
    const pool = await this.resources.poolConfiguration(
      authorized.application_id,
    );
    return this.transaction((registry) => {
      const funding = registry.applicationFunding?.[authorized.application_id];
      const members = poolMembers(
        registry.applicationSponsors,
        authorized.application_id,
      );
      const reserve = members.length
        ? minimumSponsorFunding(members[0].sponsor)
        : 0n;
      const routingFee = members.length
        ? 21000n * BigInt(members[0].sponsor.maxFeePerGas) +
          BigInt(members[0].sponsor.l1FeeReserveWei)
        : 0n;
      return {
        application_id: authorized.application_id,
        ...(funding?.health
          ? {
              funding_state: funding.health.state,
              checked_at: funding.health.checked_at,
            }
          : {}),
        ...(funding ? { funding_address: funding.address } : {}),
        chain_id: providerNetwork(this.network).caip,
        sponsor_count: pool.sponsorCount,
        ready_sponsors: members.filter((m) => m.status === 'ready').length,
        minimum_initial_funding_wei: (
          BigInt(pool.sponsorCount) *
          ((reserve * 11n) / 10n + routingFee)
        ).toString(),
        status: funding ? ('ready' as const) : ('unprovisioned' as const),
      };
    });
  }
  start() {
    this.stopped = false;
    const schedule = () => {
      if (this.stopped) return;
      this.timer = setTimeout(() => {
        this.running = this.tick()
          .catch(() => undefined)
          .finally(() => {
            this.running = undefined;
            schedule();
          });
      }, 2000);
      this.timer.unref();
    };
    schedule();
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
  async tick() {
    const ids = await this.transaction((registry) =>
      Object.keys(registry.applicationFunding ?? {}),
    );
    // Per-application queues are bounded; a failed RPC cannot cause an unbounded worker backlog.
    for (const id of ids) {
      if (this.stopped) break;
      const health = await this.distribute(id).catch(() => 'paused' as const);
      await this.transaction((registry) => {
        const record = registry.applicationFunding?.[id];
        if (record)
          record.health = {
            state: health,
            checked_at: new Date().toISOString(),
          };
      }).catch(() => undefined);
    }
  }
  async distribute(applicationId: string) {
    return this.resources.withRpc(
      applicationId,
      (endpoints) => this.distributeAt(applicationId, endpoints),
      this.transport,
    );
  }
  private async distributeAt(applicationId: string, endpoints: string[]) {
    const obligation = await this.resources.acceptedSponsorship(applicationId);
    const terms = fingerprint(obligation);
    const agreement = obligation.value as ApplicationObligations['sponsorship'];
    const gas = sponsorshipGas(agreement);
    const acceptedEndpoints = await this.resources.rpcEndpoints(applicationId);
    const submission = await this.resources.rpcEndpoints(
      applicationId,
      'rpc-submission',
    );
    const readers = endpoints.map(
      (url) => new RpcReader(url, this.transport, 4, true),
    );
    const observer = new QuorumExecutionObserver(
      endpoints,
      this.genesisHash,
      10000,
      this.transport,
      this.network,
      this.resources.rpcVerification,
    );
    const anchor = toQuantity(BigInt(await observer.anchor()));
    const blocks = await Promise.all(
      readers.map((r) => r.call('eth_getBlockByNumber', [anchor, false])),
    );
    const block = blocks[0] as { hash?: string; number?: string };
    if (
      !/^0x[0-9a-f]{64}$/i.test(block?.hash ?? '') ||
      blocks.some(
        (b) =>
          (b as typeof block)?.hash !== block.hash ||
          (b as typeof block)?.number !== anchor,
      )
    )
      deny();
    const balanceAtAnchor = async (address: string) => {
      const balances = await Promise.all(
        readers.map((r) => r.call('eth_getBalance', [address, anchor])),
      );
      if (
        balances.some(
          (v) =>
            typeof v !== 'string' ||
            !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v) ||
            v !== balances[0],
        )
      )
        deny();
      return BigInt(String(balances[0]));
    };
    const saved = await this.transaction((registry) =>
      structuredClone(registry.applicationFunding?.[applicationId] ?? deny()),
    );
    saved.nextNonce ??= Math.max(0, ...saved.transfers.map((t) => t.nonce + 1));
    saved.totalDistributedWei ??= saved.transfers
      .reduce((sum, t) => sum + BigInt(t.value), 0n)
      .toString();
    if (saved.finalizedCheckpoint) {
      const checkpoint = saved.finalizedCheckpoint;
      const canonical = await Promise.all(
        readers.map((r) =>
          r.call('eth_getBlockByNumber', [checkpoint.blockNumber, false]),
        ),
      );
      if (
        canonical.some(
          (b) =>
            (b as { hash?: string })?.hash?.toLowerCase() !==
            checkpoint.blockHash.toLowerCase(),
        )
      )
        deny();
    }
    const finalizedHeads = saved.transfers.length
      ? await Promise.all(
          readers.map((r) =>
            r.call('eth_getBlockByNumber', ['finalized', false]),
          ),
        ).catch(() => [])
      : [];
    let finalizedHeight = -1n;
    for (const head of finalizedHeads) {
      const number = (head as { number?: string })?.number;
      if (
        typeof number !== 'string' ||
        !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(number) ||
        BigInt(number) > BigInt(anchor)
      )
        deny();
      if (finalizedHeight < 0n || BigInt(number) < finalizedHeight)
        finalizedHeight = BigInt(number);
    }
    let archived = 0;
    let checkpoint = saved.finalizedCheckpoint;
    const members = await this.transaction((registry) =>
      poolMembers(registry.applicationSponsors, applicationId),
    );
    const pool = await this.resources.poolConfiguration(applicationId);
    if (
      members.length !== pool.sponsorCount ||
      members.some(
        (m) =>
          m.status !== 'ready' ||
          m.sponsor.fundingAgreement !== agreement.funding_agreement,
      )
    )
      deny();
    const current = async () => {
      if (
        fingerprint(await this.resources.acceptedSponsorship(applicationId)) !==
          terms ||
        fingerprint(await this.resources.rpcEndpoints(applicationId)) !==
          fingerprint(acceptedEndpoints) ||
        fingerprint(
          await this.resources.rpcEndpoints(applicationId, 'rpc-submission'),
        ) !== fingerprint(submission)
      )
        deny();
    };
    // Revalidate every retained nonce before advancing. Reorgs rebroadcast the same bytes.
    for (let offset = 0; offset < saved.transfers.length; offset += 4) {
      const batch = await Promise.all(
        saved.transfers.slice(offset, offset + 4).map(async (transfer) => {
          const receipts = await Promise.all(
            readers.map((r) =>
              r.call('eth_getTransactionReceipt', [transfer.hash]),
            ),
          );
          const height = (receipts[0] as { blockNumber?: string } | null)
            ?.blockNumber;
          const blocks =
            receipts.every((r) => r !== null) &&
            typeof height === 'string' &&
            /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(height)
              ? await Promise.all(
                  readers.map((r) =>
                    r.call('eth_getBlockByNumber', [height, false]),
                  ),
                )
              : undefined;
          return { transfer, receipts, blocks };
        }),
      );
      for (const { transfer, receipts, blocks } of batch) {
        if (receipts.every((r) => r !== null)) {
          const receipt = receipts[0] as {
            transactionHash: string;
            blockHash: string;
            blockNumber: string;
            status: string;
          };
          if (
            receipts.some((r) => {
              const v = r as typeof receipt;
              return (
                v.transactionHash?.toLowerCase() !== transfer.hash ||
                v.blockHash?.toLowerCase() !==
                  receipt.blockHash?.toLowerCase() ||
                v.blockNumber !== receipt.blockNumber ||
                v.status !== '0x1'
              );
            }) ||
            !/^0x[0-9a-f]{64}$/i.test(receipt.blockHash)
          )
            deny();
          if (
            !blocks ||
            blocks.some(
              (b) =>
                (b as { hash?: string })?.hash?.toLowerCase() !==
                receipt.blockHash.toLowerCase(),
            )
          )
            deny();
          // A receipt newer than the balance snapshot cannot justify another top-up.
          // Wait for a fresh sealed anchor so that snapshot includes the incoming value.
          if (BigInt(receipt.blockNumber) > BigInt(anchor))
            return 'routing' as const;
          if (
            archived < saved.transfers.length &&
            transfer === saved.transfers[archived] &&
            BigInt(receipt.blockNumber) <= finalizedHeight
          ) {
            archived++;
            checkpoint = {
              blockNumber: receipt.blockNumber,
              blockHash: receipt.blockHash,
            };
          }
          continue;
        }
        if (
          transfer.terms !== terms ||
          !members.some((m) => m.sponsor.binding.address === transfer.to)
        )
          deny();
        await current();
        await this.broadcast(saved, transfer, agreement, current, submission);
        return 'routing' as const;
      }
    }
    if (archived) {
      await this.transaction((registry) => {
        const record = registry.applicationFunding?.[applicationId] ?? deny();
        if (fingerprint(record.transfers) !== fingerprint(saved.transfers))
          deny();
        record.transfers.splice(0, archived);
        record.nextNonce = saved.nextNonce;
        record.totalDistributedWei = saved.totalDistributedWei;
        record.finalizedCheckpoint = checkpoint;
      });
      saved.transfers.splice(0, archived);
    }
    // Bound unsettled history; finalized prefixes compact without resetting nonce or allowance.
    if (saved.transfers.length >= 256) deny();
    const minimum = minimumSponsorFunding(gas);
    let target: string | undefined,
      value = 0n;
    for (const member of members) {
      const balance = BigInt(
        await balanceAtAnchor(member.sponsor.binding.address),
      );
      if (balance < minimum && (minimum * 11n) / 10n - balance > value) {
        target = member.sponsor.binding.address;
        value = (minimum * 11n) / 10n - balance;
      }
    }
    if (!target) return 'healthy' as const;
    const codes = await Promise.all(
      readers.map((r) => r.call('eth_getCode', [target, anchor])),
    );
    if (codes.some((code) => code !== '0x')) deny();
    const feeReserve =
      21000n * BigInt(gas.maxFeePerGas) + BigInt(gas.l1FeeReserveWei);
    if (BigInt(await balanceAtAnchor(saved.address)) < value + feeReserve)
      return 'needs-funding' as const;
    if (
      BigInt(saved.totalDistributedWei) + value >
      BigInt(agreement.maximum_gas_budget_wei)
    )
      deny();
    // A dedicated nonce lane has no external transaction writers. Conflicting activity pauses funding.
    const counts = await Promise.all(
      readers.map((r) =>
        r.call('eth_getTransactionCount', [saved.address, 'pending']),
      ),
    );
    if (
      counts.some((n) => n !== counts[0]) ||
      BigInt(String(counts[0])) !== BigInt(saved.nextNonce)
    )
      deny();
    const networkFees = await quoteNetworkFees(readers[0], gas);
    const raw = await new Wallet(this.cipher.open(saved.key)).signTransaction({
      type: 2,
      chainId: providerNetwork(this.network).chainId,
      nonce: saved.nextNonce,
      to: target,
      value,
      data: '0x',
      gasLimit: 21000,
      maxFeePerGas: networkFees.maxFeePerGas,
      maxPriorityFeePerGas: networkFees.maxPriorityFeePerGas,
    });
    const transfer: Distribution = {
      id: randomUUID(),
      nonce: saved.nextNonce,
      to: target,
      value: value.toString(),
      hash: keccak256(raw),
      terms,
      feeReserve: feeReserve.toString(),
      raw: this.cipher.seal(
        {
          application_id: applicationId,
          reference: 'private-gas-distribution',
          revision: String(saved.nextNonce + 1),
          origin: '',
          status: 'active',
        },
        raw,
      ),
    };
    await current();
    const retained = await this.transaction((registry) => {
      const record = registry.applicationFunding?.[applicationId] ?? deny();
      const nextNonce =
        record.nextNonce ??
        Math.max(0, ...record.transfers.map((t) => t.nonce + 1));
      if (nextNonce !== saved.nextNonce) return false;
      record.nextNonce = nextNonce + 1;
      record.totalDistributedWei = (
        BigInt(saved.totalDistributedWei!) + value
      ).toString();
      record.transfers.push(transfer);
      return true;
    });
    if (retained)
      await this.broadcast(saved, transfer, agreement, current, submission);
    return 'routing' as const;
  }
  private async broadcast(
    saved: ApplicationFundingRecord,
    transfer: Distribution,
    agreement: ApplicationObligations['sponsorship'],
    current: () => Promise<void>,
    endpoints: string[],
  ) {
    const application =
      this.resources.onboardingPolicy.applications.find(
        (a) =>
          runtimeApplicationId(a.issuer, a.clientId) === saved.applicationId,
      ) ?? deny();
    const budgetId = applicationGasBudgetId(
      this.resources.onboardingPolicy.provider.origin,
      application.issuer,
      application.clientId,
    );
    await this.database.setBudget(
      budgetId,
      agreement.maximum_gas_budget_wei,
      this.revision,
    );
    const request = createWalletAttemptRequest(
      'application-gas-routing-v1',
      'application-gas-routing-v1',
      'relay_transaction',
      saved.accountId,
      transfer.id,
      saved.accountId + ':' + transfer.nonce,
      { hash: transfer.hash, terms: transfer.terms },
    );
    await this.database.admitAttempt({
      request,
      budgetId,
      units: transfer.feeReserve,
    });
    const claim = await this.database.journal.claim(request);
    if (claim.state === 'conflict') deny();
    await current();
    const raw = this.cipher.open(transfer.raw);
    if (keccak256(raw) !== transfer.hash) deny();
    const accepted = await this.resources.withSubmissionRpc(
      saved.applicationId,
      async (endpoint) => {
        const capacity = rpcCapacity(this.transport, endpoint);
        let response: Response;
        try {
          response = await this.transport(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_sendRawTransaction',
              params: [raw],
            }),
            signal: AbortSignal.timeout(10000),
            redirect: 'error',
          });
        } catch {
          capacity.recordReadFailure();
          throw new WalletProviderError(
            'wallet_provider_unavailable',
            'unknown',
          );
        }
        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          capacity.recordReadFailure();
          throw new WalletProviderError(
            'wallet_provider_unavailable',
            'unknown',
          );
        }
        let result: {
          result?: string;
          error?: { code?: number };
        };
        try {
          const value: unknown = await response.json();
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error();
          result = value as typeof result;
        } catch {
          capacity.recordReadFailure();
          throw new WalletProviderError(
            'wallet_provider_unavailable',
            'unknown',
          );
        }
        if (
          [-32603, -32005, -32016, 15, 429].includes(result.error?.code ?? 0)
        ) {
          capacity.recordReadFailure();
          throw new WalletProviderError(
            'wallet_provider_unavailable',
            'unknown',
          );
        }
        return response.ok && result.result?.toLowerCase() === transfer.hash;
      },
      this.transport,
    );
    if (accepted && claim.state === 'dispatch')
      await this.database.journal.complete(request, claim.leaseToken, {
        kind: 'relay_transaction',
        transactionId: transfer.id,
      });
  }
}
