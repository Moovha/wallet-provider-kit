import type { RelayerBinding } from '../providers/relayer-client.js';
import { toQuantity } from 'ethers';
import { fingerprint } from '../onboarding/policy.js';
import { WalletProviderError } from '../domain/signing.js';
import {
  createRelayerClient,
  record,
  uuid,
} from '../providers/relayer-client.js';
import type {
  ExecutionConfiguration,
  ExecutionProvider,
  TransferExecutionPlan,
} from './types.js';

/** Dedicated sponsor queue. The token, zero native value and calldata come only from the stored plan. */
export function createTransferExecutionProvider(
  configuration: ExecutionConfiguration,
  apiKey: string,
  request: typeof fetch = fetch,
): ExecutionProvider {
  if (!configuration.relayer)
    throw new WalletProviderError('wallet_provider_configuration');
  const sponsors = structuredClone(configuration.sponsors);
  for (const sponsor of sponsors)
    if (!sponsor.binding.relayerId || !sponsor.binding.signerId)
      throw new WalletProviderError('wallet_provider_configuration');
  const client = createRelayerClient(
    {
      url: configuration.relayer.url,
      apiKey,
      resolveAccount: async (id) =>
        (sponsors.find((sponsor) => sponsor.accountId === id)?.binding as
          RelayerBinding | undefined) ?? null,
    },
    request,
  );
  function response(
    plan: TransferExecutionPlan,
    value: Record<string, unknown> | null,
  ) {
    const sponsor = plan.sponsor;
    try {
      if (
        !value ||
        typeof value.id !== 'string' ||
        !uuid.test(value.id) ||
        value.relayer_id !== sponsor.binding.relayerId ||
        typeof value.from !== 'string' ||
        value.from.toLowerCase() !== sponsor.binding.address.toLowerCase() ||
        typeof value.to !== 'string' ||
        value.to.toLowerCase() !==
          String(plan.action.payload.domain.verifyingContract).toLowerCase() ||
        typeof value.value !== 'string' ||
        !/^(?:0x[0-9a-fA-F]{1,64}|0|[1-9][0-9]{0,77})$/.test(value.value) ||
        BigInt(value.value) !== 0n ||
        value.data !== plan.data ||
        value.gas_limit !== Number(sponsor.gasLimit) ||
        typeof value.status !== 'string' ||
        ![
          'pending',
          'sent',
          'submitted',
          'mined',
          'confirmed',
          'failed',
          'expired',
          'canceled',
        ].includes(value.status) ||
        (value.hash != null &&
          (typeof value.hash !== 'string' ||
            !/^0x[0-9a-fA-F]{64}$/.test(value.hash))) ||
        (value.max_fee_per_gas != null &&
          (!/^[0-9]+$/.test(String(value.max_fee_per_gas)) ||
            BigInt(String(value.max_fee_per_gas)) >
              BigInt(sponsor.maxFeePerGas)))
      )
        throw new Error();
      return {
        id: value.id,
        hash: value.hash == null ? undefined : String(value.hash).toLowerCase(),
      };
    } catch {
      throw new WalletProviderError('wallet_provider_response', 'unknown');
    }
  }
  return {
    async prepare(plan) {
      const selected = await client.binding(plan.sponsor.accountId);
      const policies = selected?.metadata.policies;
      if (
        !selected ||
        fingerprint(selected.binding) !== fingerprint(plan.sponsor.binding) ||
        !record(policies) ||
        policies.gas_limit_estimation !== false ||
        !Number.isSafeInteger(policies.gas_price_cap) ||
        Number(policies.gas_price_cap) <= 0 ||
        BigInt(Number(policies.gas_price_cap)) >
          BigInt(plan.sponsor.maxFeePerGas)
      )
        throw new WalletProviderError('wallet_provider_configuration');
    },
    async submit(plan, context) {
      await client.current(
        plan.sponsor.accountId,
        plan.sponsor.binding as RelayerBinding,
      );
      await context?.authorizeEffect?.();
      if (Date.parse(plan.action.expires_at) <= Date.now())
        throw new WalletProviderError('wallet_authorization_denied');
      const sponsor = plan.sponsor;
      const accepted = await client.call(
        'POST',
        `/relayers/${sponsor.binding.relayerId}/transactions`,
        JSON.stringify({
          to: String(plan.action.payload.domain.verifyingContract),
          value: toQuantity(0n),
          data: plan.data,
          gas_limit: Number(sponsor.gasLimit),
          max_fee_per_gas: Number(sponsor.maxFeePerGas),
          max_priority_fee_per_gas: Number(sponsor.maxPriorityFeePerGas),
          valid_until: plan.action.expires_at,
        }),
      );
      return response(plan, accepted).id;
    },
    async inspect(plan, transactionId) {
      if (!uuid.test(transactionId))
        throw new WalletProviderError('wallet_authorization_denied');
      await client.current(
        plan.sponsor.accountId,
        plan.sponsor.binding as RelayerBinding,
      );
      const value = await client.call(
        'GET',
        `/relayers/${plan.sponsor.binding.relayerId}/transactions/${transactionId}`,
      );
      const accepted = response(plan, value);
      if (accepted.id !== transactionId || !value)
        throw new WalletProviderError('wallet_provider_response', 'unknown');
      const rawNonce = value.nonce;
      if (
        rawNonce != null &&
        !(
          typeof rawNonce === 'number' &&
          Number.isSafeInteger(rawNonce) &&
          rawNonce >= 0
        ) &&
        !(
          typeof rawNonce === 'string' &&
          /^(0|[1-9][0-9]{0,19})$/.test(rawNonce) &&
          BigInt(rawNonce) < 2n ** 64n
        )
      )
        throw new WalletProviderError('wallet_provider_response', 'unknown');
      return {
        status: String(value.status),
        ...(rawNonce != null ? { nonce: String(rawNonce) } : {}),
        ...(accepted.hash ? { transactionHash: accepted.hash } : {}),
      };
    },
    async transactionHash(plan, transactionId) {
      if (!uuid.test(transactionId))
        throw new WalletProviderError('wallet_authorization_denied');
      await client.current(
        plan.sponsor.accountId,
        plan.sponsor.binding as RelayerBinding,
      );
      const accepted = response(
        plan,
        await client.call(
          'GET',
          `/relayers/${plan.sponsor.binding.relayerId}/transactions/${transactionId}`,
        ),
      );
      if (accepted.id !== transactionId)
        throw new WalletProviderError('wallet_provider_response', 'unknown');
      return accepted.hash;
    },
  };
}
