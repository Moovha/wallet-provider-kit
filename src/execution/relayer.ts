import { providerNetwork } from '../networks.js';
import { initialFees, replacementProviderContract } from './replacement.js';
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
  const network = providerNetwork(configuration.network);
  function validateNetwork(plan: TransferExecutionPlan) {
    if (
      plan.action.chain_id !== network.caip ||
      plan.action.payload.domain.chainId !== network.chainId ||
      !plan.action.chain_account_id.startsWith(network.caip + ':')
    )
      throw new WalletProviderError('wallet_authorization_denied');
  }
  const sponsors = structuredClone(configuration.sponsors);
  for (const sponsor of sponsors)
    if (!sponsor.binding.relayerId || !sponsor.binding.signerId)
      throw new WalletProviderError('wallet_provider_configuration');
  const client = createRelayerClient(
    {
      url: configuration.relayer.url,
      apiKey,
      network: configuration.network,
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
        (value.max_priority_fee_per_gas != null &&
          (!/^[0-9]+$/.test(String(value.max_priority_fee_per_gas)) ||
            BigInt(String(value.max_priority_fee_per_gas)) >
              BigInt(sponsor.maxPriorityFeePerGas))) ||
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
    async supportsReplacement(selected) {
      const checked = selected
        ? sponsors.filter(
            (sponsor) => fingerprint(sponsor) === fingerprint(selected),
          )
        : sponsors;
      if (!checked.length) return false;
      for (const sponsor of checked) {
        const binding = await client.binding(sponsor.accountId);
        if (
          binding?.metadata.wpk_replacement_contract !==
            replacementProviderContract ||
          !record(binding.metadata.policies) ||
          binding.metadata.policies.gas_limit_estimation !== false ||
          binding.metadata.policies.eip1559_pricing !== true ||
          binding.metadata.policies.gas_price_cap !==
            Number(sponsor.maxFeePerGas)
        )
          return false;
      }
      return true;
    },
    async prepare(plan) {
      validateNetwork(plan);
      const selected = await client.binding(plan.sponsor.accountId);
      const policies = selected?.metadata.policies;
      if (
        !selected ||
        (plan.networkFees &&
          selected.metadata.wpk_replacement_contract !==
            replacementProviderContract) ||
        (plan.replacement &&
          (selected.metadata.wpk_replacement_contract !==
            replacementProviderContract ||
            !record(selected.metadata.policies) ||
            selected.metadata.policies.eip1559_pricing !== true ||
            selected.metadata.policies.gas_price_cap !==
              Number(plan.sponsor.maxFeePerGas))) ||
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
      validateNetwork(plan);
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
          max_fee_per_gas: Number(initialFees(plan).maxFeePerGas),
          max_priority_fee_per_gas: Number(
            initialFees(plan).maxPriorityFeePerGas,
          ),
          valid_until: plan.action.expires_at,
        }),
      );
      return response(plan, accepted).id;
    },
    async replace(plan, transactionId, proposal, authorizeEffect) {
      validateNetwork(plan);
      if (!plan.replacement || !uuid.test(transactionId))
        throw new WalletProviderError('wallet_authorization_denied');
      const current = await client.binding(plan.sponsor.accountId);
      if (
        !current ||
        fingerprint(current.binding) !== fingerprint(plan.sponsor.binding) ||
        current.metadata.wpk_replacement_contract !==
          replacementProviderContract ||
        !record(current.metadata.policies) ||
        current.metadata.policies.gas_limit_estimation !== false ||
        current.metadata.policies.eip1559_pricing !== true ||
        current.metadata.policies.gas_price_cap !==
          Number(plan.sponsor.maxFeePerGas)
      )
        throw new WalletProviderError('wallet_provider_configuration');
      const path = `/relayers/${plan.sponsor.binding.relayerId}/transactions/${transactionId}`;
      const previous = await client.call('GET', path);
      const original = response(plan, previous);
      if (
        !previous ||
        original.id !== transactionId ||
        original.hash !== proposal.previousTransactionHash ||
        String(previous.nonce) !== proposal.nonce ||
        String(previous.max_fee_per_gas) !== proposal.previousMaxFeePerGas ||
        String(previous.max_priority_fee_per_gas) !==
          proposal.previousMaxPriorityFeePerGas ||
        !['pending', 'sent', 'submitted'].includes(String(previous.status)) ||
        BigInt(proposal.maxFeePerGas) > BigInt(plan.sponsor.maxFeePerGas) ||
        BigInt(proposal.maxPriorityFeePerGas) >
          BigInt(plan.sponsor.maxPriorityFeePerGas)
      )
        throw new WalletProviderError('wallet_authorization_denied');
      await authorizeEffect();
      if (Date.parse(plan.action.expires_at) <= Date.now())
        throw new WalletProviderError('wallet_authorization_denied');
      const value = await client.call(
        'PUT',
        path,
        JSON.stringify({
          to: String(plan.action.payload.domain.verifyingContract),
          value: toQuantity(0n),
          data: plan.data,
          gas_limit: Number(plan.sponsor.gasLimit),
          max_fee_per_gas: Number(proposal.maxFeePerGas),
          max_priority_fee_per_gas: Number(proposal.maxPriorityFeePerGas),
          valid_until: plan.action.expires_at,
        }),
      );
      const accepted = response(plan, value);
      if (
        !value ||
        accepted.id !== transactionId ||
        !accepted.hash ||
        String(value.nonce) !== proposal.nonce ||
        String(value.max_fee_per_gas) !== proposal.maxFeePerGas ||
        String(value.max_priority_fee_per_gas) !== proposal.maxPriorityFeePerGas
      )
        throw new WalletProviderError('wallet_provider_response', 'unknown');
      return accepted.hash;
    },
    async inspect(plan, transactionId) {
      validateNetwork(plan);
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
      validateNetwork(plan);
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
