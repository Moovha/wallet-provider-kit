import { WalletProviderError } from '../domain/signing.js';
import type {
  ExecutionConfiguration,
  ExecutionDispatchContext,
  ExecutionProvider,
  TransferExecutionPlan,
} from './types.js';
import { signedServiceClient, type ServiceIdentity } from '../executor/auth.js';
import {
  executionPlanHash,
  type ExecutionDispatch,
  type ExecutorReceipt,
} from '../executor/protocol.js';
import { record } from '../providers/relayer-client.js';

/** Only the designated service owns upstream dispatch; transport retries preserve its durable identity. */
export function createRemoteExecutionProvider(
  config: ExecutionConfiguration,
  identity: ServiceIdentity,
  request: typeof fetch = fetch,
): ExecutionProvider {
  const selected = structuredClone(config.service);
  if (
    !selected ||
    !['erc3009-executor-v1', 'approved-evm-executor-v1'].includes(
      config.profile,
    )
  )
    throw new WalletProviderError('wallet_provider_configuration');
  const call = signedServiceClient(identity, selected.url, request);
  function checked(
    value: unknown,
    plan: TransferExecutionPlan,
    id: string,
  ): ExecutorReceipt {
    if (
      !record(value) ||
      value.contract !== 'execution-dispatch-v1' ||
      value.execution_id !== id ||
      value.plan_hash !== executionPlanHash(plan) ||
      !['not_started', 'pending', 'accepted', 'unknown', 'failed'].includes(
        String(value.dispatch_status),
      ) ||
      (value.transaction_hash !== undefined &&
        (typeof value.transaction_hash !== 'string' ||
          !/^0x[0-9a-f]{64}$/.test(value.transaction_hash)))
    )
      throw new WalletProviderError('wallet_provider_response', 'unknown');
    return value as unknown as ExecutorReceipt;
  }
  async function status(plan: TransferExecutionPlan, id: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        id,
      )
    )
      throw new WalletProviderError('wallet_provider_input');
    return checked(
      await call('status', 'GET', '/v1/dispatches/' + id),
      plan,
      id,
    );
  }
  return {
    async prepare() {
      const value = await call(
        'capabilities',
        'GET',
        '/v1/executor-capabilities',
      );
      if (
        !record(value) ||
        value.contract !== 'execution-dispatch-v1' ||
        !Array.isArray(value.profiles) ||
        !value.profiles.includes(config.profile) ||
        !Array.isArray(value.providers) ||
        !value.providers.some(
          (provider) =>
            record(provider) &&
            provider.id === selected.providerId &&
            provider.revision === selected.providerRevision,
        )
      )
        throw new WalletProviderError('wallet_provider_configuration');
    },
    async submit(plan, context?: ExecutionDispatchContext) {
      if (!context)
        throw new WalletProviderError('wallet_authorization_denied');
      await context.authorizeEffect?.();
      const dispatch: ExecutionDispatch = {
        contract: 'execution-dispatch-v1',
        execution_id: context.executionId,
        provider_id: selected.providerId,
        provider_revision: selected.providerRevision,
        wallet_attempt: context.request,
        plan,
      };
      const result = checked(
        await call('dispatch', 'POST', '/v1/dispatches', dispatch),
        plan,
        context.executionId,
      );
      if (result.dispatch_status !== 'accepted')
        throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
      return result.execution_id;
    },
    async transactionHash(plan, id) {
      return (await status(plan, id)).transaction_hash;
    },
    async recover(plan, context) {
      const result = await status(plan, context.executionId);
      return {
        accepted: result.dispatch_status === 'accepted',
        transactionId: result.execution_id,
        transactionHash: result.transaction_hash,
      };
    },
  };
}
