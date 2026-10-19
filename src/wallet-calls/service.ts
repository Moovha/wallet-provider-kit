import type { WalletCallsDriver } from '../sponsorship/execution-types.js';
import type { ProviderState } from '../onboarding/types.js';
import { runtimeApplicationId } from '../runtime-configuration/service.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { getAddress } from 'ethers';
import type { VerifiedPrincipal } from '../domain/principal.js';
import { WalletProviderError } from '../domain/signing.js';
import type { SupportedActions } from '../deployment/actions.js';
import type { SafeExecutionQueue } from '../execution/queue.js';
import type { ExecutionCoordinatorPort } from '../execution/application-coordinator.js';
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
function capabilities(
  value: unknown,
  paymasterSupported = false,
  allowAction = false,
) {
  if (value === undefined) return;
  if (!object(value) || Object.keys(value).length > 16) invalid();
  for (const [name, capability] of Object.entries(value)) {
    if (
      !object(capability) ||
      (capability.optional !== undefined &&
        typeof capability.optional !== 'boolean')
    )
      invalid();
    if (name === 'applicationAction' && allowAction) continue;
    if (name === 'paymasterService' && paymasterSupported) continue;
    if (capability.optional !== true) throw new WalletCallsError(5700);
  }
}
/** Account-scoped EIP-5792 adapter. The server selects the durable execution driver for each account. */
export class WalletCallsService {
  private readonly queue?: SafeExecutionQueue;
  private readonly execution?: ExecutionCoordinatorPort;
  private readonly driver?: WalletCallsDriver;
  constructor(actions: SupportedActions, driver: WalletCallsDriver);
  constructor(
    actions: SupportedActions,
    queue: SafeExecutionQueue,
    execution: ExecutionCoordinatorPort,
    driver?: WalletCallsDriver,
  );
  constructor(
    private readonly actions: SupportedActions,
    queueOrDriver: SafeExecutionQueue | WalletCallsDriver,
    execution?: ExecutionCoordinatorPort,
    driver?: WalletCallsDriver,
  ) {
    if (!actions.onboarding.runtimeContracts)
      throw new WalletProviderError('wallet_provider_configuration');
    if (execution) {
      this.queue = queueOrDriver as SafeExecutionQueue;
      this.execution = execution;
      this.driver = driver;
    } else this.driver = queueOrDriver as WalletCallsDriver;
  }
  private selected(accountId: string) {
    if (this.driver?.handles(accountId)) return this.driver;
    if (!this.queue) throw new WalletCallsError(4100);
    return undefined;
  }
  async list(
    principal: VerifiedPrincipal,
    authorizeOperator?: (state: ProviderState) => void,
  ) {
    if (!this.queue) return this.driver!.list(principal, authorizeOperator);
    const { records, truncated } = await this.queue.walletCallsList(
      principal,
      authorizeOperator,
    );
    const extra = this.driver
      ? await this.driver.list(principal, authorizeOperator)
      : { truncated: false, batches: [] };
    return {
      truncated:
        truncated ||
        extra.truncated ||
        records.length + extra.batches.length > 100,
      batches: [
        ...records.map((record) => ({
          account_id: record.input.account_id,
          sender: record.walletCalls!.sender,
          queue_stage: record.status,
          policy_revision: record.walletCalls!.policyRevision,
          expires_at: record.expiresAt,
          application_id: runtimeApplicationId(
            record.principal.issuer,
            record.principal.clientId,
          ),
          ...this.status(
            record,
            record.execution?.observation?.chain_status === 'finalized',
          ),
        })),
        ...extra.batches,
      ].slice(0, 100),
    };
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
    const driver = this.selected(accountId);
    if (driver) await driver.capabilities(principal, accountId);
    return chains === undefined ||
      (chains as string[]).some(
        (chain) => BigInt(chain) === BigInt(this.actions.network.chainId),
      )
      ? {
          [this.actions.network.hex]: {
            atomic: { status: 'supported' },
            ...(binding.snapshot.policy.action_requirements
              ? { applicationAction: { supported: true } }
              : {}),
            ...(driver ? { paymasterService: { supported: true } } : {}),
          },
        }
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
    if (BigInt(input.chainId) !== BigInt(this.actions.network.chainId))
      throw new WalletCallsError(5710);
    if (input.calls.length > 16) throw new WalletCallsError(5740);
    const driver = this.selected(accountId);
    capabilities(input.capabilities, !!driver, true);
    if (driver)
      driver.acceptPaymaster(
        object(input.capabilities)
          ? input.capabilities.paymasterService
          : undefined,
      );
    const applicationAction = object(input.capabilities)
      ? input.capabilities.applicationAction
      : undefined;
    if (
      applicationAction !== undefined &&
      (!object(applicationAction, ['name', 'payload', 'optional']) ||
        typeof applicationAction.name !== 'string' ||
        !object(applicationAction.payload) ||
        Object.values(applicationAction.payload).some(
          (v) => typeof v !== 'string',
        ))
    )
      invalid();
    const actionContext =
      applicationAction === undefined
        ? {}
        : {
            application_action: {
              name: (applicationAction as { name: string }).name,
              payload: (
                applicationAction as { payload: Record<string, string> }
              ).payload,
            },
          };
    const from = input.from === undefined ? undefined : address(input.from);
    const calls = input.calls.map((call) => {
      if (!object(call, ['to', 'data', 'value', 'capabilities'])) invalid();
      // Contract creation is outside this account-bound profile.
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
      await (
        driver
          ? driver.assertSize.bind(driver)
          : this.execution!.assertWalletCallsSize.bind(this.execution!)
      )(principal, {
        account_id: accountId,
        kind: 'contract-call',
        ...actionContext,
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
    await (
      driver
        ? driver.enqueue.bind(driver)
        : this.queue!.enqueue.bind(this.queue!)
    )(
      { principal, idempotencyKey: randomUUID() },
      { account_id: accountId, kind: 'contract-call', ...actionContext, calls },
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
    const driver = this.selected(accountId);
    if (driver) return driver.status(principal, accountId, id);
    let stored = await this.queue!.walletCallsRecord(principal, accountId, id);
    let fresh = true;
    if (stored.actionId && !['cancelled', 'expired'].includes(stored.status)) {
      try {
        await this.execution!.refresh(stored.actionId);
      } catch {
        fresh = false;
      }
      stored = await this.queue!.walletCallsRecord(principal, accountId, id);
    }
    return this.status(stored, fresh);
  }
  private status(
    stored: Awaited<ReturnType<SafeExecutionQueue['walletCallsRecord']>>,
    fresh: boolean,
  ): WalletCallsStatus {
    const id = stored.walletCalls!.id;
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
      chainId: this.actions.network.hex,
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
