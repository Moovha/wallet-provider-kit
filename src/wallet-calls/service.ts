import { randomBytes, randomUUID } from 'node:crypto';
import { getAddress } from 'ethers';
import type { VerifiedPrincipal } from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import type { SupportedActions } from '../deployment/actions.js';
import type { SafeExecutionQueue } from '../execution/queue.js';
import type { ApprovedExecutionCoordinator } from '../execution/coordinator.js';
import { WalletCallsError } from './errors.js';
import type { WalletCallsStatus } from './types.js';

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const quantityPattern = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/;
export function walletCallsId(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 8194) return false;
  if (/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) return value.length <= 8194;
  return (
    Buffer.byteLength(value, 'utf8') <= 4096 &&
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      value,
    )
  );
}
function object(
  value: unknown,
  fields?: string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (!fields || Object.keys(value).every((key) => fields.includes(key)))
  );
}
function invalid(): never {
  throw new WalletCallsError(-32602);
}
function address(value: unknown): string {
  if (typeof value !== 'string' || !addressPattern.test(value)) invalid();
  try {
    return getAddress(value);
  } catch {
    return invalid();
  }
}
function capabilities(value: unknown) {
  if (value === undefined) return;
  if (!object(value) || Object.keys(value).length > 16) invalid();
  for (const capability of Object.values(value)) {
    if (
      !object(capability) ||
      (capability.optional !== undefined &&
        typeof capability.optional !== 'boolean')
    )
      invalid();
    if (capability.optional !== true) throw new WalletCallsError(5700);
  }
}
/** Account-scoped EIP-5792 adapter. Only the durable Safe queue can admit new effects. */
export class WalletCallsService {
  constructor(
    private readonly actions: SupportedActions,
    private readonly queue: SafeExecutionQueue,
    private readonly execution: ApprovedExecutionCoordinator,
  ) {
    if (!actions.onboarding.runtimeContracts)
      throw new WalletProviderError('wallet_provider_configuration');
  }
  async request(
    principal: VerifiedPrincipal,
    accountId: string,
    method: string,
    params: unknown[],
  ): Promise<unknown> {
    if (method === 'wallet_getCapabilities')
      return this.getCapabilities(principal, accountId, params);
    if (method === 'wallet_sendCalls')
      return this.sendCalls(principal, accountId, params);
    if (method === 'wallet_getCallsStatus')
      return this.getCallsStatus(principal, accountId, params);
    if (method === 'wallet_showCallsStatus') throw new WalletCallsError(4200);
    throw new WalletCallsError(-32601);
  }
  private async getCapabilities(
    principal: VerifiedPrincipal,
    accountId: string,
    params: unknown[],
  ) {
    if (params.length < 1 || params.length > 2) invalid();
    const sender = address(params[0]);
    const chains = params[1];
    if (
      chains !== undefined &&
      (!Array.isArray(chains) ||
        chains.length > 64 ||
        chains.some(
          (chain) => typeof chain !== 'string' || !quantityPattern.test(chain),
        ))
    )
      invalid();
    if (!principal.scopes.includes('wallet:execute:read'))
      throw new WalletCallsError(4100);
    const binding = await this.actions.walletCallsAccount(principal, accountId);
    if (sender !== binding.address) throw new WalletCallsError(4100);
    return chains === undefined ||
      (chains as string[]).some((chain) => BigInt(chain) === 84532n)
      ? { '0x14a34': { atomic: { status: 'supported' } } }
      : {};
  }
  private async sendCalls(
    principal: VerifiedPrincipal,
    accountId: string,
    params: unknown[],
  ) {
    if (
      params.length !== 1 ||
      !object(params[0], [
        'version',
        'id',
        'from',
        'chainId',
        'atomicRequired',
        'calls',
        'capabilities',
      ])
    )
      invalid();
    const input = params[0];
    if (
      input.version !== '2.0.0' ||
      typeof input.atomicRequired !== 'boolean' ||
      typeof input.chainId !== 'string' ||
      !quantityPattern.test(input.chainId) ||
      (input.id !== undefined && !walletCallsId(input.id)) ||
      !Array.isArray(input.calls) ||
      !input.calls.length
    )
      invalid();
    if (BigInt(input.chainId) !== 84532n) throw new WalletCallsError(5710);
    if (input.calls.length > 16) throw new WalletCallsError(5740);
    capabilities(input.capabilities);
    const from = input.from === undefined ? undefined : address(input.from);
    const calls = input.calls.map((call) => {
      if (!object(call, ['to', 'data', 'value', 'capabilities'])) invalid();
      // Contract creation and empty native transfers are outside this registered-method profile.
      const to = address(call.to);
      const data = call.data ?? '0x',
        value = call.value ?? '0x0';
      if (
        typeof data !== 'string' ||
        !/^0x(?:[0-9a-fA-F]{2})*$/.test(data) ||
        typeof value !== 'string' ||
        !quantityPattern.test(value)
      )
        invalid();
      if (data.length > 8194) throw new WalletCallsError(5740);
      capabilities(call.capabilities);
      return { to, data: data.toLowerCase(), value: BigInt(value).toString() };
    });
    if (
      calls.reduce((bytes, call) => bytes + (call.data.length - 2) / 2, 0) >
      2048
    )
      throw new WalletCallsError(5740);
    const binding = await this.actions.walletCallsAccount(principal, accountId);
    if (from !== undefined && from !== binding.address)
      throw new WalletCallsError(4100);
    if (
      calls.length > binding.snapshot.policy.maximum_calls ||
      Buffer.byteLength(JSON.stringify([binding.snapshot, calls]), 'utf8') >
        8192
    )
      throw new WalletCallsError(5740);
    try {
      await this.execution.assertWalletCallsSize(principal, {
        account_id: accountId,
        kind: 'contract-call',
        calls,
      });
    } catch (error) {
      if (
        error instanceof WalletProviderError &&
        error.code === 'wallet_provider_input'
      )
        throw new WalletCallsError(5740);
      throw error;
    }
    const id =
      (input.id as string | undefined) ??
      '0x' + randomBytes(32).toString('hex');
    await this.queue.enqueue(
      { principal, idempotencyKey: randomUUID() },
      { account_id: accountId, kind: 'contract-call', calls },
      {
        version: '2.0.0',
        id,
        sender: binding.address,
        policyHash: binding.snapshot.policy_hash,
        policyRevision: binding.snapshot.revision,
      },
    );
    return { id };
  }
  private async getCallsStatus(
    principal: VerifiedPrincipal,
    accountId: string,
    params: unknown[],
  ): Promise<WalletCallsStatus> {
    if (params.length !== 1 || !walletCallsId(params[0])) invalid();
    if (!principal.scopes.includes('wallet:execute:read'))
      throw new WalletCallsError(4100);
    const id = params[0];
    let stored = await this.queue.walletCallsRecord(principal, accountId, id);
    let fresh = true;
    if (stored.actionId) {
      try {
        await this.execution.refresh(stored.actionId);
      } catch {
        fresh = false;
      }
      stored = await this.queue.walletCallsRecord(principal, accountId, id);
    }
    const observation = stored.execution?.observation;
    const confirmed =
      (fresh || observation?.chain_status === 'finalized') &&
      !stored.execution?.integrityFailure &&
      observation?.verification === 'rpc-quorum' &&
      ['included', 'safe', 'finalized'].includes(observation.chain_status);
    const receipts =
      confirmed && observation?.callsReceipt
        ? [observation.callsReceipt]
        : undefined;
    const status =
      confirmed && observation?.outcome === 'reverted'
        ? 500
        : confirmed && observation?.outcome === 'succeeded' && receipts
          ? 200
          : ['cancelled', 'expired'].includes(stored.status)
            ? 400
            : 100;
    return {
      version: '2.0.0',
      id,
      chainId: '0x14a34',
      status,
      atomic: true,
      ...(receipts ? { receipts } : {}),
    };
  }
}
export function walletCallsFailure(error: unknown): WalletCallsError {
  if (error instanceof WalletCallsError) return error;
  if (error instanceof WalletProviderError) {
    if (error.code === 'wallet_authorization_denied')
      return new WalletCallsError(4100);
    if (error.code === 'wallet_provider_input')
      return new WalletCallsError(-32602);
    if (
      error.code === 'wallet_attempt_pending' ||
      error.code === 'wallet_attempt_conflict'
    )
      return new WalletCallsError(5740);
    return new WalletCallsError(4900);
  }
  return new WalletCallsError(-32603);
}
