import { providerNetwork, type ProviderNetwork } from '../networks.js';
import { rpcCapacity, type RpcCapacity } from './rpc-capacity.js';
import { verifyAdapterEffects } from './adapter-effects.js';
import { adapterInput } from './operation-adapters.js';
import { serviceHash } from '../executor/auth.js';
import { initialFees } from './replacement.js';
import { readSafeState } from './safe-state-reader.js';
import type { WalletCallsReceipt } from '../wallet-calls/types.js';
import type { NonceSnapshot } from './recovery.js';
import {
  approvedCallData,
  implementationSlot,
  allowsEmptyRecipientCode,
  safeInterface,
  tokenInterface,
  vaultInterface,
  type SafeAccountBinding,
  type ApprovedCallIntent,
} from './approved-calls.js';
import {
  Interface,
  TypedDataEncoder,
  keccak256,
  toQuantity,
  zeroPadValue,
} from 'ethers';
import { WalletProviderError } from '../domain/signing.js';
import { record } from '../providers/relayer-client.js';
import type {
  ChainObservation,
  ExecutionObserver,
  TransferExecutionPlan,
} from './types.js';

export const transferInterface = new Interface([
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function authorizationState(address authorizer,bytes32 nonce) view returns (bool)',
  'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
const bytesPattern = /^0x(?:[0-9a-fA-F]{2})*$/;
const rpcReadMethods = [
  'eth_getTransactionCount',
  'eth_chainId',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_call',
  'eth_getBalance',
  'eth_getLogs',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_feeHistory',
  'eth_maxPriorityFeePerGas',
] as const;
type RpcMethod = (typeof rpcReadMethods)[number];
class RpcThrottled extends Error {}
class RpcReadRetryable extends Error {}
export class RpcStateOverrideUnsupported extends WalletProviderError {
  constructor() {
    super('wallet_provider_unavailable', 'not_dispatched');
  }
}

function unavailable(): never {
  throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
}
function checked(value: unknown): Record<string, unknown> {
  if (!record(value)) unavailable();
  return value;
}
function quantity(value: unknown): bigint {
  if (
    typeof value !== 'string' ||
    !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value)
  )
    unavailable();
  return BigInt(value);
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !hashPattern.test(value)) unavailable();
  return value.toLowerCase();
}
function address(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    unavailable();
  return value.toLowerCase();
}

/** Receipt metadata is retained only with validated ordering and exact transaction/block bindings. */
function callsReceipt(
  receipt: Record<string, unknown>,
  candidate: string,
  blockHash: string,
  blockNumber: bigint,
  safe: string,
): WalletCallsReceipt | undefined {
  if (receipt.gasUsed === undefined) return undefined;
  const logs: WalletCallsReceipt['logs'] = [];
  let previous = -1n;
  for (const value of receipt.logs as unknown[]) {
    const log = checked(value),
      index = quantity(log.logIndex);
    if (
      log.removed !== false ||
      hash(log.transactionHash) !== candidate ||
      hash(log.blockHash) !== blockHash ||
      quantity(log.blockNumber) !== blockNumber ||
      index <= previous ||
      typeof log.data !== 'string' ||
      !bytesPattern.test(log.data) ||
      log.data.length > 131074 ||
      !Array.isArray(log.topics) ||
      log.topics.length > 4
    )
      unavailable();
    previous = index;
    const topics = log.topics.map(hash);
    const emitter = address(log.address);
    if (emitter !== safe.toLowerCase())
      logs.push({ address: emitter, data: log.data.toLowerCase(), topics });
  }
  return {
    logs,
    status: toQuantity(quantity(receipt.status)),
    blockHash,
    blockNumber: toQuantity(blockNumber),
    gasUsed: toQuantity(quantity(receipt.gasUsed)),
    transactionHash: candidate,
  };
}

/** Read-only JSON-RPC transport with fixed methods, bounded concurrency and throttling recovery. */
export class RpcReader {
  verifyGenesis(key: string, work: () => Promise<void>) {
    return this.capacity.verifyGenesis(key, work);
  }
  private readonly pending: Promise<unknown>[];
  private cursor = 0;
  private queued = 0;
  private readonly capacity: RpcCapacity;
  constructor(
    private readonly endpoint: string,
    private readonly request: typeof fetch,
    concurrency = 1,
    private readonly coalesceReads = false,
    private readonly retryMode: 'bounded' | 'endpoint-failover' = 'bounded',
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
      throw new WalletProviderError('wallet_provider_configuration');
    this.pending = Array.from({ length: concurrency }, () => Promise.resolve());
    this.capacity = rpcCapacity(request, endpoint);
    try {
      const url = new URL(endpoint);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
      )
        throw new Error();
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }
  async feed(
    method: 'eth_chainId' | 'eth_getBlockByNumber',
    params: unknown[],
  ) {
    const tag = params[0];
    if (method === 'eth_chainId' && params.length !== 0)
      throw new WalletProviderError('wallet_provider_input');
    if (
      method === 'eth_getBlockByNumber' &&
      (!['latest', 'safe', 'finalized'].includes(String(tag)) ||
        params[1] !== false)
    )
      throw new WalletProviderError('wallet_provider_input');
    const ttl =
      method === 'eth_chainId' ? 60000 : tag === 'latest' ? 250 : 15000;
    return this.capacity.feedRead(JSON.stringify([method, params]), ttl, () =>
      this.call(method, params),
    );
  }
  async call(method: RpcMethod, params: unknown[]): Promise<unknown> {
    if (!rpcReadMethods.includes(method))
      throw new WalletProviderError('wallet_provider_input');
    let captured: unknown[];
    try {
      captured = structuredClone(params);
    } catch {
      throw new WalletProviderError('wallet_provider_input');
    }
    if (this.queued >= 64) unavailable();
    this.queued++;
    const dispatch = () => {
      const lane = this.cursor;
      this.cursor = (this.cursor + 1) % this.pending.length;
      const result = this.pending[lane].then(() =>
        this.readWithRetry(method, captured),
      );
      this.pending[lane] = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    };
    try {
      return await (this.coalesceReads
        ? this.capacity.shareRead(JSON.stringify([method, captured]), dispatch)
        : dispatch());
    } finally {
      this.queued--;
    }
  }
  private async readWithRetry(
    method: RpcMethod,
    params: unknown[],
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const delay = this.capacity.retryAfter - Date.now();
      if (delay > 0 && this.retryMode === 'endpoint-failover') unavailable();
      // Long server backoffs fail closed without keeping a financial request open.
      if (delay > 2000) unavailable();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        return await this.read(method, params);
      } catch (error) {
        if (error instanceof RpcStateOverrideUnsupported) throw error;
        if (this.retryMode === 'endpoint-failover') {
          if (error instanceof RpcThrottled) {
            this.capacity.retryAfter = Math.max(
              this.capacity.retryAfter,
              Date.now() + 500,
            );
            unavailable();
          }
          if (error instanceof RpcReadRetryable) {
            this.capacity.recordReadFailure();
            unavailable();
          }
        }
        if (error instanceof RpcThrottled && attempt === 2)
          this.capacity.retryAfter = Math.max(
            this.capacity.retryAfter,
            Date.now() + 500,
          );
        if (error instanceof RpcReadRetryable && attempt === 2)
          this.capacity.recordReadFailure();
        if (
          !(
            error instanceof RpcThrottled || error instanceof RpcReadRetryable
          ) ||
          attempt === 2
        )
          unavailable();
        if (error instanceof RpcReadRetryable)
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * (attempt + 1)),
          );
      }
    }
    return unavailable();
  }
  private async read(method: RpcMethod, params: unknown[]): Promise<unknown> {
    return this.capacity.run(() => this.readRequest(method, params));
  }
  private async readRequest(
    method: RpcMethod,
    params: unknown[],
  ): Promise<unknown> {
    // A different reader can receive a backoff while this request waits for capacity.
    if (this.capacity.retryAfter > Date.now()) throw new RpcThrottled();
    const started = performance.now();
    try {
      const response = await this.request(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(3000),
      });
      if (response.status === 429) {
        this.capacity.invalidateGenesis();
        const header = response.headers.get('retry-after');
        const seconds =
          header && /^[0-9]+$/.test(header) ? Number(header) * 1000 : undefined;
        const date = header && seconds === undefined ? Date.parse(header) : NaN;
        const delay =
          seconds ??
          (Number.isFinite(date) ? Math.max(0, date - Date.now()) : 500);
        this.capacity.retryAfter = Math.max(
          this.capacity.retryAfter,
          Date.now() + delay,
        );
        await response.body?.cancel();
        throw new RpcThrottled();
      }
      if (!response.ok && response.status >= 500) {
        await response.body?.cancel();
        this.capacity.recordReadFailure();
        unavailable();
      }
      const reader = response.body?.getReader();
      if (!reader) unavailable();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 262144) unavailable();
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      const envelope = checked(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
      );
      if (
        method === 'eth_call' &&
        params.length === 3 &&
        envelope.jsonrpc === '2.0' &&
        envelope.id === 1 &&
        record(envelope.error) &&
        ([-32601, -32602, -32004].includes(envelope.error.code as number) ||
          (envelope.error.code === 12 &&
            typeof envelope.error.message === 'string' &&
            /route your request to suitable provider/i.test(
              envelope.error.message,
            )))
      ) {
        this.capacity.unsupportedFor('state-overrides');
        throw new RpcStateOverrideUnsupported();
      }
      if (!response.ok) unavailable();
      if (
        method === 'eth_getBlockByNumber' &&
        params[0] === '0x0' &&
        record(envelope.error) &&
        envelope.error.code === 4444
      )
        this.capacity.unsupportedFor('genesis');
      if (
        envelope.jsonrpc === '2.0' &&
        envelope.id === 1 &&
        record(envelope.error) &&
        (envelope.error.code === -32603 ||
          (method === 'eth_getBlockByNumber' &&
            envelope.error.code === 4444 &&
            typeof envelope.error.message === 'string' &&
            /pruned history unavailable/i.test(envelope.error.message)))
      )
        throw new RpcReadRetryable();
      if (
        envelope.jsonrpc === '2.0' &&
        envelope.id === 1 &&
        recordErrorLimit(envelope.error)
      ) {
        this.capacity.invalidateGenesis();
        this.capacity.retryAfter = Math.max(
          this.capacity.retryAfter,
          Date.now() + 1000,
        );
        throw new RpcThrottled();
      }
      if (
        envelope.jsonrpc !== '2.0' ||
        envelope.id !== 1 ||
        'error' in envelope ||
        !('result' in envelope)
      ) {
        if (
          method === 'eth_feeHistory' &&
          envelope.error &&
          typeof envelope.error === 'object' &&
          [-32601, -32004].includes((envelope.error as { code: number }).code)
        )
          this.capacity.recordReadFailure();
        unavailable();
      }
      this.capacity.recordReadSuccess(performance.now() - started);
      return envelope.result;
    } catch (error) {
      if (
        error instanceof RpcThrottled ||
        error instanceof RpcReadRetryable ||
        error instanceof RpcStateOverrideUnsupported
      )
        throw error;
      if (!(error instanceof WalletProviderError))
        this.capacity.recordReadFailure();
      return unavailable();
    }
  }
}

function recordErrorLimit(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown };
  return (
    [15, -32005, -32016, 429].includes(value.code as number) &&
    typeof value.message === 'string' &&
    /rate.limit|too many requests|request.limit|throughput|capacity|compute units per second/i.test(
      value.message,
    )
  );
}

interface Heads {
  latest: bigint;
  safe: bigint;
  finalized: bigint;
}

/** Agreement of configured RPC providers is trusted node evidence, not a light-client proof. */
export class QuorumExecutionObserver implements ExecutionObserver {
  private readonly readers: RpcReader[];
  private static readonly proofCaches = new WeakMap<
    typeof fetch,
    Map<string, { expiresAt: number; observation: ChainObservation }>
  >();
  private readonly inclusionProofs: Map<
    string,
    { expiresAt: number; observation: ChainObservation }
  >;
  private readonly overrideBackoff = new WeakMap<RpcReader, number>();
  constructor(
    private readonly endpoints: string[],
    private readonly genesisHash: string,
    private readonly maxLogRange: number,
    private readonly request: typeof fetch = fetch,
    private readonly network?: ProviderNetwork,
    private readonly verificationMode: 'single' | 'quorum' = 'quorum',
    private readonly reuseInclusionProofs = false,
    private readonly aggregateSafeReads = false,
  ) {
    providerNetwork(network);
    this.endpoints = [...endpoints];
    let proofs = QuorumExecutionObserver.proofCaches.get(request);
    if (!proofs) {
      proofs = new Map();
      QuorumExecutionObserver.proofCaches.set(request, proofs);
    }
    this.inclusionProofs = proofs;
    try {
      if (
        endpoints.length < (verificationMode === 'single' ? 1 : 2) ||
        (verificationMode === 'single' && endpoints.length !== 1) ||
        endpoints.length > 3 ||
        new Set(endpoints.map((endpoint) => new URL(endpoint).origin)).size !==
          endpoints.length ||
        !hashPattern.test(genesisHash) ||
        !Number.isSafeInteger(maxLogRange) ||
        maxLogRange < 100 ||
        maxLogRange > 10000
      )
        throw new Error();
      this.readers = endpoints.map(
        (endpoint) =>
          new RpcReader(
            endpoint,
            request,
            4,
            reuseInclusionProofs,
            verificationMode === 'single' && reuseInclusionProofs
              ? 'endpoint-failover'
              : 'bounded',
          ),
      );
    } catch {
      throw new WalletProviderError('wallet_provider_configuration');
    }
  }

  private validatePlanNetwork(plan: TransferExecutionPlan): void {
    const network = providerNetwork(this.network);
    if (
      plan.action.chain_id !== network.caip ||
      plan.action.payload.domain.chainId !== network.chainId ||
      !plan.action.chain_account_id.startsWith(network.caip + ':')
    )
      unavailable();
  }

  private async identity(reader: RpcReader): Promise<void> {
    const verifyGenesis = async () => {
      const genesis = checked(
        await reader.call('eth_getBlockByNumber', ['0x0', false]),
      );
      if (
        hash(genesis.hash) !== this.genesisHash.toLowerCase() ||
        quantity(genesis.number) !== 0n
      )
        unavailable();
    };
    const [chain] = await Promise.all([
      reader.call('eth_chainId', []),
      this.reuseInclusionProofs && this.verificationMode === 'single'
        ? reader.verifyGenesis(this.genesisHash.toLowerCase(), verifyGenesis)
        : verifyGenesis(),
    ]);
    if (quantity(chain) !== BigInt(providerNetwork(this.network).chainId))
      unavailable();
  }
  async verifyNetwork(): Promise<void> {
    await Promise.all(this.readers.map((reader) => this.identity(reader)));
  }
  async anchor(): Promise<string> {
    const heights = await Promise.all(
      this.readers.map(async (reader) => {
        const [, block] = await Promise.all([
          this.identity(reader),
          reader.call('eth_getBlockByNumber', ['latest', false]),
        ]);
        return quantity(checked(block).number);
      }),
    );
    return heights.reduce((a, b) => (a < b ? a : b)).toString();
  }
  /** Read-only Safe simulation using its owner's prevalidated signature; never a dispatch payload. */
  async preflightUnsigned(plan: TransferExecutionPlan): Promise<void> {
    try {
      this.validatePlanNetwork(plan);
      if (!plan.intent) unavailable();
      const owner = plan.action.chain_account_id.split(':')[2];
      const signature = zeroPadValue(owner, 32) + '00'.repeat(32) + '01';
      const preview = structuredClone(plan);
      preview.data = approvedCallData(plan.action, signature);
      await this.preflightCalls(preview, owner);
    } catch {
      unavailable();
    }
  }
  async preflight(plan: TransferExecutionPlan): Promise<void> {
    try {
      await this.preflightRead(structuredClone(plan));
    } catch {
      unavailable();
    }
  }
  private async preflightRead(plan: TransferExecutionPlan): Promise<void> {
    this.validatePlanNetwork(plan);
    if (plan.intent) return this.preflightCalls(plan);
    const token = String(plan.action.payload.domain.verifyingContract);
    const owner = String(plan.action.payload.message.from);
    const nonce = String(plan.action.payload.message.nonce);
    const expectedDomain = TypedDataEncoder.hashDomain(
      plan.action.payload.domain,
    ).toLowerCase();
    await Promise.all(
      this.readers.map(async (reader) => {
        await this.identity(reader);
        const [code, domain, used, balance, simulation] = await Promise.all([
          reader.call('eth_getCode', [token, 'latest']),
          reader.call('eth_call', [
            {
              to: token,
              data: transferInterface.encodeFunctionData('DOMAIN_SEPARATOR'),
            },
            'latest',
          ]),
          reader.call('eth_call', [
            {
              to: token,
              data: transferInterface.encodeFunctionData('authorizationState', [
                owner,
                nonce,
              ]),
            },
            'latest',
          ]),
          reader.call('eth_getBalance', [
            plan.sponsor.binding.address,
            'latest',
          ]),
          reader.call('eth_call', [
            {
              from: plan.sponsor.binding.address,
              to: token,
              data: plan.data,
              value: '0x0',
              gas: toQuantity(BigInt(plan.sponsor.gasLimit)),
              maxFeePerGas: toQuantity(BigInt(plan.sponsor.maxFeePerGas)),
              maxPriorityFeePerGas: toQuantity(
                BigInt(plan.sponsor.maxPriorityFeePerGas),
              ),
            },
            'latest',
          ]),
        ]);
        if (
          typeof code !== 'string' ||
          !bytesPattern.test(code) ||
          code === '0x' ||
          keccak256(code).toLowerCase() !== plan.tokenCodeHash!.toLowerCase() ||
          hash(domain) !== expectedDomain ||
          used !== '0x' + '0'.repeat(64) ||
          simulation !== '0x' ||
          quantity(balance) <
            BigInt(plan.sponsor.gasLimit) * BigInt(plan.sponsor.maxFeePerGas) +
              BigInt(plan.sponsor.l1FeeReserveWei)
        )
          unavailable();
      }),
    );
  }
  private async safeAccount(
    reader: RpcReader,
    binding: SafeAccountBinding,
    owner: string,
    tag = 'latest',
    identityVerified = false,
  ) {
    const identity = identityVerified
      ? Promise.resolve()
      : this.identity(reader);
    if (
      this.aggregateSafeReads &&
      (this.overrideBackoff.get(reader) ?? 0) <= Date.now()
    ) {
      try {
        const [, nonce] = await Promise.all([
          identity,
          readSafeState(reader, binding, owner, tag),
        ]);
        return nonce;
      } catch (error) {
        if (!(error instanceof RpcStateOverrideUnsupported)) throw error;
        this.overrideBackoff.set(reader, Date.now() + 300000);
      }
    }
    const call = (name: string, args: unknown[] = []) =>
      reader.call('eth_call', [
        {
          to: binding.address,
          data: safeInterface.encodeFunctionData(name, args),
        },
        tag,
      ]);
    const [
      proxy,
      singleton,
      implementation,
      owners,
      threshold,
      version,
      nonce,
      modules,
    ] = await Promise.all([
      reader.call('eth_getCode', [binding.address, tag]),
      reader.call('eth_getCode', [binding.singleton.address, tag]),
      call('masterCopy'),
      call('getOwners'),
      call('getThreshold'),
      call('VERSION'),
      call('nonce'),
      call('getModulesPaginated', [
        '0x0000000000000000000000000000000000000001',
        1,
      ]),
      identity,
    ]);
    const modulePage = safeInterface.decodeFunctionResult(
      'getModulesPaginated',
      String(modules),
    );
    if (
      modulePage[0].length !== 0 ||
      String(modulePage[1]).toLowerCase() !==
        '0x0000000000000000000000000000000000000001'
    )
      unavailable();
    if (
      typeof proxy !== 'string' ||
      typeof singleton !== 'string' ||
      keccak256(proxy) !== binding.codeHash ||
      keccak256(singleton) !== binding.singleton.codeHash ||
      String(
        safeInterface.decodeFunctionResult(
          'masterCopy',
          String(implementation),
        )[0],
      ).toLowerCase() !== binding.singleton.address.toLowerCase() ||
      serviceOwners(owners).length !== 1 ||
      serviceOwners(owners)[0].toLowerCase() !== owner.toLowerCase() ||
      safeInterface.decodeFunctionResult(
        'getThreshold',
        String(threshold),
      )[0] !== 1n ||
      safeInterface.decodeFunctionResult('VERSION', String(version))[0] !==
        '1.4.1'
    )
      unavailable();
    if (this.aggregateSafeReads) {
      const slots = [
        'guard_manager.guard.address',
        'fallback_manager.handler.address',
      ].map((value) => keccak256(Buffer.from(value)));
      const values = await Promise.all(
        slots.map((slot) =>
          reader.call('eth_getStorageAt', [binding.address, slot, tag]),
        ),
      );
      if (
        values.some(
          (value) =>
            typeof value !== 'string' ||
            value.toLowerCase() !== '0x' + '0'.repeat(64),
        )
      )
        unavailable();
    }
    return safeInterface
      .decodeFunctionResult('nonce', String(nonce))[0]
      .toString() as string;
  }
  /** Read a nonce for unsigned intent construction; preflight verifies current account authority before signing. */
  async actionNonce(binding: SafeAccountBinding): Promise<string> {
    const values = await Promise.all(
      this.readers.map(async (reader) => {
        const [, nonce] = await Promise.all([
          this.identity(reader),
          reader.call('eth_call', [
            {
              to: binding.address,
              data: safeInterface.encodeFunctionData('nonce'),
            },
            'latest',
          ]),
        ]);
        return safeInterface
          .decodeFunctionResult('nonce', String(nonce))[0]
          .toString() as string;
      }),
    );
    if (values.some((value) => value !== values[0])) unavailable();
    return values[0];
  }
  /** Read-only verified account binding and common nonce before constructing an approved action. */
  async contractNonce(
    binding: SafeAccountBinding,
    owner: string,
    _principal?: import('../domain/principal.js').VerifiedPrincipal,
  ): Promise<string> {
    try {
      const values = await Promise.all(
        this.readers.map((reader) => this.safeAccount(reader, binding, owner)),
      );
      if (values.some((value) => value !== values[0])) unavailable();
      return values[0];
    } catch {
      return unavailable();
    }
  }
  private async pinnedCalls(
    reader: RpcReader,
    intent: ApprovedCallIntent,
    tag: string,
  ) {
    await Promise.all(
      [...intent.contracts, intent.multiSend].map(async (contract) => {
        const code = await reader.call('eth_getCode', [contract.address, tag]);
        if (
          typeof code !== 'string' ||
          (code === '0x' &&
            !allowsEmptyRecipientCode(intent, contract.address)) ||
          keccak256(code) !== contract.codeHash
        )
          unavailable();
        if (contract.implementation) {
          const [slot, implementation] = await Promise.all([
            reader.call('eth_getStorageAt', [
              contract.address,
              implementationSlot,
              tag,
            ]),
            reader.call('eth_getCode', [contract.implementation.address, tag]),
          ]);
          if (
            hash(slot) !==
              zeroPadValue(contract.implementation.address.toLowerCase(), 32) ||
            typeof implementation !== 'string' ||
            keccak256(implementation) !== contract.implementation.codeHash
          )
            unavailable();
        }
      }),
    );
    if (adapterInput(intent).kind === 'vault-deposit') {
      const vault = intent.effects[1].token,
        asset = intent.effects[0].token;
      const result = await reader.call('eth_call', [
        { to: vault, data: vaultInterface.encodeFunctionData('asset') },
        tag,
      ]);
      if (
        String(
          vaultInterface.decodeFunctionResult('asset', String(result))[0],
        ).toLowerCase() !== asset.toLowerCase()
      )
        unavailable();
    }
  }
  private async preflightCalls(
    plan: TransferExecutionPlan,
    unsignedOwner?: string,
  ) {
    const intent = plan.intent!;
    const fees = plan.networkFees ? initialFees(plan) : plan.sponsor;
    // The full atomic simulation verifies solvency, including native funds received by earlier calls.
    await Promise.all(
      this.readers.map(async (reader) => {
        const owner = plan.action.chain_account_id.split(':')[2];
        const tag = 'latest';
        const [nonce, , balance, simulation] = await Promise.all([
          this.safeAccount(reader, intent.account, owner, tag),
          this.pinnedCalls(reader, intent, tag),
          reader.call('eth_getBalance', [plan.sponsor.binding.address, tag]),
          reader.call('eth_call', [
            {
              from: unsignedOwner ?? plan.sponsor.binding.address,
              to: intent.account.address,
              data: plan.data,
              value: '0x0',
              gas: toQuantity(BigInt(plan.sponsor.gasLimit)),
              ...(unsignedOwner
                ? { gasPrice: '0x0' }
                : {
                    maxFeePerGas: toQuantity(BigInt(fees.maxFeePerGas)),
                    maxPriorityFeePerGas: toQuantity(
                      BigInt(fees.maxPriorityFeePerGas),
                    ),
                  }),
            },
            tag,
          ]),
        ]);
        if (
          nonce !== intent.nonce ||
          quantity(balance) <
            BigInt(plan.sponsor.gasLimit) * BigInt(fees.maxFeePerGas) +
              BigInt(plan.sponsor.l1FeeReserveWei) ||
          safeInterface.decodeFunctionResult(
            'execTransaction',
            String(simulation),
          )[0] !== true
        )
          unavailable();
      }),
    );
  }
  private async findCalls(
    reader: RpcReader,
    plan: TransferExecutionPlan,
    latest: bigint,
    from: bigint,
  ): Promise<string[]> {
    if (latest < from) return [];
    const maximum = from + BigInt(this.maxLogRange) - 1n;
    const logs = await reader.call('eth_getLogs', [
      {
        address: plan.intent!.account.address,
        fromBlock: toQuantity(from),
        toBlock: toQuantity(latest < maximum ? latest : maximum),
        topics: [
          [
            safeInterface.getEvent('ExecutionSuccess')!.topicHash,
            safeInterface.getEvent('ExecutionFailure')!.topicHash,
          ],
        ],
      },
    ]);
    if (!Array.isArray(logs) || logs.length > 256) unavailable();
    return logs.flatMap((entry) => {
      const log = checked(entry);
      if (log.removed === true) return [];
      const parsed = safeInterface.parseLog({
        topics: log.topics as string[],
        data: String(log.data),
      });
      return parsed?.args.txHash.toLowerCase() === plan.action.payload_hash
        ? [hash(log.transactionHash)]
        : [];
    });
  }
  private proofKey(
    plan: TransferExecutionPlan,
    candidate: string,
    ownHash?: string,
  ) {
    return this.reuseInclusionProofs &&
      this.verificationMode === 'single' &&
      plan.runtimePolicy
      ? serviceHash([
          this.endpoints[0],
          this.aggregateSafeReads,
          plan,
          candidate,
          ownHash ?? null,
        ])
      : undefined;
  }
  private async verifyCalls(
    reader: RpcReader,
    plan: TransferExecutionPlan,
    candidate: string,
    ownHash: string | undefined,
    heads: Heads,
    prefetched?: { receipt?: [unknown, unknown]; block?: unknown },
  ): Promise<ChainObservation | null | 'reorged'> {
    const proofKey = this.proofKey(plan, candidate, ownHash);
    const proof = proofKey ? this.inclusionProofs.get(proofKey) : undefined;
    if (proof && proof.expiresAt > Date.now()) {
      const number = BigInt(proof.observation.block_number!);
      const block =
        prefetched && 'block' in prefetched
          ? prefetched.block
          : await reader.call('eth_getBlockByNumber', [
              toQuantity(number),
              false,
            ]);
      if (
        !block ||
        hash(checked(block).hash) !== proof.observation.block_hash
      ) {
        this.inclusionProofs.delete(proofKey!);
        return 'reorged';
      }
      if (quantity(checked(block).number) !== number || heads.latest < number)
        unavailable();
      const chain_status =
        heads.finalized >= number
          ? 'finalized'
          : heads.safe >= number
            ? 'safe'
            : 'included';
      return {
        ...structuredClone(proof.observation),
        chain_status,
        settlement:
          chain_status === 'finalized'
            ? (proof.observation.outcome as 'succeeded' | 'reverted')
            : 'pending',
        observed_at: new Date().toISOString(),
      };
    }
    const [rawReceipt, rawTransaction] =
      prefetched?.receipt ??
      (await Promise.all([
        reader.call('eth_getTransactionReceipt', [candidate]),
        reader.call('eth_getTransactionByHash', [candidate]),
      ]));
    if (!rawReceipt || !rawTransaction) return null;
    const receipt = checked(rawReceipt),
      transaction = checked(rawTransaction),
      intent = plan.intent!;
    const blockHash = hash(receipt.blockHash),
      blockNumber = quantity(receipt.blockNumber),
      tag = toQuantity(blockNumber);
    if (
      hash(receipt.transactionHash) !== candidate ||
      hash(transaction.hash) !== candidate ||
      hash(transaction.blockHash) !== blockHash ||
      quantity(transaction.blockNumber) !== blockNumber ||
      heads.latest < blockNumber
    )
      unavailable();
    if (
      address(transaction.to) !== intent.account.address.toLowerCase() ||
      address(receipt.to) !== intent.account.address.toLowerCase() ||
      quantity(transaction.value) !== 0n ||
      quantity(transaction.chainId) !==
        BigInt(providerNetwork(this.network).chainId) ||
      String(transaction.input).toLowerCase() !== plan.data
    )
      return null;
    const sender = address(transaction.from);
    if (address(receipt.from) !== sender) unavailable();
    if (
      sender === plan.sponsor.binding.address.toLowerCase() &&
      (transaction.type !== '0x2' ||
        quantity(transaction.gas) !== BigInt(plan.sponsor.gasLimit) ||
        quantity(transaction.maxFeePerGas) >
          BigInt(plan.sponsor.maxFeePerGas) ||
        quantity(transaction.maxPriorityFeePerGas) >
          BigInt(plan.sponsor.maxPriorityFeePerGas))
    )
      unavailable();
    // safeAccount verifies proxy and singleton code as part of the complete binding.
    const [block, verifiedNonce] = await Promise.all([
      reader.call('eth_getBlockByNumber', [tag, false]),
      this.safeAccount(
        reader,
        intent.account,
        plan.action.chain_account_id.split(':')[2],
        tag,
        true,
      ),
      this.pinnedCalls(reader, intent, tag),
    ]);
    if (!block || hash(checked(block).hash) !== blockHash) return 'reorged';
    if (quantity(checked(block).number) !== blockNumber) unavailable();
    const status = quantity(receipt.status);
    if (status === 1n && BigInt(verifiedNonce) <= BigInt(intent.nonce))
      unavailable();
    if (status !== 0n && status !== 1n) unavailable();
    if (
      status === 0n &&
      (candidate !== ownHash?.toLowerCase() ||
        sender !== plan.sponsor.binding.address.toLowerCase())
    )
      return null;
    if (!Array.isArray(receipt.logs) || receipt.logs.length > 512)
      unavailable();
    let callFailed = false;
    if (status === 1n) {
      const successes = receipt.logs.filter((entry) => {
        const log = checked(entry);
        if (address(log.address) !== intent.account.address.toLowerCase())
          return false;
        try {
          const parsed = safeInterface.parseLog({
            topics: log.topics as string[],
            data: String(log.data),
          });
          return (
            parsed?.name === 'ExecutionSuccess' &&
            parsed.args.txHash.toLowerCase() === plan.action.payload_hash &&
            parsed.args.payment === 0n
          );
        } catch {
          return false;
        }
      });
      const failures = receipt.logs.filter((entry) => {
        const log = checked(entry);
        if (address(log.address) !== intent.account.address.toLowerCase())
          return false;
        try {
          const parsed = safeInterface.parseLog({
            topics: log.topics as string[],
            data: String(log.data),
          });
          return (
            parsed?.name === 'ExecutionFailure' &&
            parsed.args.txHash.toLowerCase() === plan.action.payload_hash &&
            parsed.args.payment === 0n
          );
        } catch {
          return false;
        }
      });
      if (successes.length !== 1 || failures.length) {
        if (
          plan.runtimePolicy &&
          intent.input.kind === 'contract-call' &&
          !successes.length &&
          failures.length === 1
        )
          callFailed = true;
        else return null;
      }
      if (
        !callFailed &&
        !(await verifyAdapterEffects(
          reader,
          intent,
          receipt.logs.map((entry) => {
            const l = checked(entry);
            return {
              address: address(l.address),
              topics: l.topics as string[],
              data: String(l.data),
            };
          }),
          tag,
        ))
      )
        return null;
    }
    const chainStatus =
        heads.finalized >= blockNumber
          ? 'finalized'
          : heads.safe >= blockNumber
            ? 'safe'
            : 'included',
      outcome = status === 1n && !callFailed ? 'succeeded' : 'reverted';
    const metadata = plan.runtimePolicy
      ? callsReceipt(
          receipt,
          candidate,
          blockHash,
          blockNumber,
          intent.account.address,
        )
      : undefined;
    const observation: ChainObservation = {
      ...(metadata ? { callsReceipt: metadata } : {}),
      safe_nonce_consumed: status === 1n,
      chain_status: chainStatus,
      verification:
        this.verificationMode === 'single' ? 'rpc-single' : 'rpc-quorum',
      outcome,
      settlement: chainStatus === 'finalized' ? outcome : 'pending',
      observed_at: new Date(Date.now()).toISOString(),
      transaction_hash: candidate,
      block_hash: blockHash,
      block_number: blockNumber.toString(),
      execution_origin:
        sender === plan.sponsor.binding.address.toLowerCase()
          ? 'sponsor'
          : 'external',
    };
    if (proofKey) {
      for (const [key, value] of this.inclusionProofs)
        if (value.expiresAt <= Date.now()) this.inclusionProofs.delete(key);
      if (this.inclusionProofs.size >= 256)
        this.inclusionProofs.delete(this.inclusionProofs.keys().next().value!);
      this.inclusionProofs.set(proofKey, {
        expiresAt: Date.now() + 60000,
        observation: structuredClone(observation),
      });
    }
    return observation;
  }
  /** Explicit reconciliation bypasses every inclusion-proof cache. */
  observeFresh(
    plan: TransferExecutionPlan,
    candidates: string[],
    ownHash?: string,
  ) {
    return new QuorumExecutionObserver(
      this.endpoints,
      this.genesisHash,
      this.maxLogRange,
      this.request,
      this.network,
      this.verificationMode,
      false,
      this.aggregateSafeReads,
    ).observe(plan, candidates, ownHash);
  }
  /** Restore only a trusted local full proof, then use the ordinary fresh canonical guard. */
  async recheckInclusion(
    plan: TransferExecutionPlan,
    observation: ChainObservation,
    ownHash?: string,
  ): Promise<ChainObservation | undefined> {
    if (
      observation.verification !== 'rpc-single' ||
      !['included', 'safe', 'finalized'].includes(observation.chain_status) ||
      !['succeeded', 'reverted'].includes(observation.outcome) ||
      !observation.transaction_hash ||
      !observation.block_hash ||
      !observation.block_number
    )
      return undefined;
    const key = this.proofKey(
      plan,
      hash(observation.transaction_hash),
      ownHash,
    );
    if (!key) return undefined;
    hash(observation.block_hash);
    if (!/^(0|[1-9][0-9]{0,77})$/.test(observation.block_number)) unavailable();
    if (this.inclusionProofs.size >= 256)
      this.inclusionProofs.delete(this.inclusionProofs.keys().next().value!);
    this.inclusionProofs.set(key, {
      expiresAt: Date.now() + 60000,
      observation: structuredClone(observation),
    });
    return this.observe(plan, [observation.transaction_hash], ownHash);
  }
  private async heads(reader: RpcReader): Promise<Heads> {
    const [, values] = await Promise.all([
      this.identity(reader),
      Promise.all(
        ['latest', 'safe', 'finalized'].map((tag) =>
          reader.call('eth_getBlockByNumber', [tag, false]),
        ),
      ),
    ]);
    const [latest, safe, finalized] = values.map((value) => {
      const block = checked(value);
      hash(block.hash);
      return quantity(block.number);
    });
    if (finalized > safe || safe > latest) unavailable();
    return { latest, safe, finalized };
  }
  private async find(
    reader: RpcReader,
    plan: TransferExecutionPlan,
    latest: bigint,
    from: bigint,
  ): Promise<string[]> {
    if (plan.intent) return this.findCalls(reader, plan, latest, from);
    if (latest < from) return [];
    const maximum = from + BigInt(this.maxLogRange) - 1n;
    const logs = await reader.call('eth_getLogs', [
      {
        address: String(plan.action.payload.domain.verifyingContract),
        fromBlock: toQuantity(from),
        toBlock: toQuantity(latest < maximum ? latest : maximum),
        topics: [
          transferInterface.getEvent('AuthorizationUsed')!.topicHash,
          zeroPadValue(String(plan.action.payload.message.from), 32),
          String(plan.action.payload.message.nonce),
        ],
      },
    ]);
    if (!Array.isArray(logs) || logs.length > 4) unavailable();
    return logs
      .map((entry) => {
        const log = checked(entry);
        if (log.removed === true) return undefined;
        return hash(log.transactionHash);
      })
      .filter((value): value is string => !!value);
  }
  private async verify(
    reader: RpcReader,
    plan: TransferExecutionPlan,
    candidate: string,
    ownHash: string | undefined,
    heads: Heads,
    prefetched?: { receipt?: [unknown, unknown]; block?: unknown },
  ): Promise<ChainObservation | null | 'reorged'> {
    if (plan.intent)
      return this.verifyCalls(
        reader,
        plan,
        candidate,
        ownHash,
        heads,
        prefetched,
      );
    const [rawReceipt, rawTransaction] = await Promise.all([
      reader.call('eth_getTransactionReceipt', [candidate]),
      reader.call('eth_getTransactionByHash', [candidate]),
    ]);
    if (rawReceipt === null || rawTransaction === null) return null;
    const receipt = checked(rawReceipt);
    const transaction = checked(rawTransaction);
    const token = String(
      plan.action.payload.domain.verifyingContract,
    ).toLowerCase();
    const message = plan.action.payload.message;
    if (
      hash(receipt.transactionHash) !== candidate ||
      hash(transaction.hash) !== candidate
    )
      unavailable();
    const blockHash = hash(receipt.blockHash);
    const blockNumber = quantity(receipt.blockNumber);
    if (
      hash(transaction.blockHash) !== blockHash ||
      quantity(transaction.blockNumber) !== blockNumber ||
      heads.latest < blockNumber
    )
      unavailable();
    const [rawBlock, code] = await Promise.all([
      reader.call('eth_getBlockByNumber', [toQuantity(blockNumber), false]),
      reader.call('eth_getCode', [token, toQuantity(blockNumber)]),
    ]);
    if (rawBlock === null || hash(checked(rawBlock).hash) !== blockHash)
      return 'reorged';
    if (
      quantity(checked(rawBlock).number) !== blockNumber ||
      typeof code !== 'string' ||
      !bytesPattern.test(code) ||
      keccak256(code).toLowerCase() !== plan.tokenCodeHash!.toLowerCase()
    )
      unavailable();
    if (
      address(transaction.to) !== token ||
      address(receipt.to) !== token ||
      quantity(transaction.value) !== 0n ||
      quantity(transaction.chainId) !==
        BigInt(providerNetwork(this.network).chainId) ||
      typeof transaction.input !== 'string' ||
      transaction.input.toLowerCase() !== plan.data.toLowerCase()
    )
      return null;
    const sender = address(transaction.from);
    if (address(receipt.from) !== sender) unavailable();
    if (
      sender === plan.sponsor.binding.address.toLowerCase() &&
      (transaction.type !== '0x2' ||
        quantity(transaction.gas) !== BigInt(plan.sponsor.gasLimit) ||
        quantity(transaction.maxFeePerGas) >
          BigInt(plan.sponsor.maxFeePerGas) ||
        quantity(transaction.maxPriorityFeePerGas) >
          BigInt(plan.sponsor.maxPriorityFeePerGas))
    )
      unavailable();
    const outcome = quantity(receipt.status);
    if (outcome !== 0n && outcome !== 1n) unavailable();
    if (
      outcome === 0n &&
      (candidate !== ownHash ||
        sender !== plan.sponsor.binding.address.toLowerCase())
    )
      return null;
    if (!Array.isArray(receipt.logs) || receipt.logs.length > 512)
      unavailable();
    if (outcome === 1n) {
      let authorizations = 0;
      let transfers = 0;
      for (const item of receipt.logs) {
        const log = checked(item);
        if (address(log.address) !== token) continue;
        if (
          hash(log.blockHash) !== blockHash ||
          hash(log.transactionHash) !== candidate ||
          quantity(log.blockNumber) !== blockNumber ||
          log.removed === true ||
          !Array.isArray(log.topics) ||
          typeof log.data !== 'string' ||
          !bytesPattern.test(log.data)
        )
          unavailable();
        const parsed = transferInterface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (
          parsed?.name === 'AuthorizationUsed' &&
          address(parsed.args.authorizer) ===
            String(message.from).toLowerCase() &&
          hash(parsed.args.nonce) === String(message.nonce).toLowerCase()
        )
          authorizations++;
        if (
          parsed?.name === 'Transfer' &&
          address(parsed.args.from) === String(message.from).toLowerCase() &&
          address(parsed.args.to) === String(message.to).toLowerCase() &&
          parsed.args.value.toString() === String(message.value)
        )
          transfers++;
      }
      if (authorizations !== 1 || transfers !== 1) return null;
    }
    const chainStatus =
      heads.finalized >= blockNumber
        ? 'finalized'
        : heads.safe >= blockNumber
          ? 'safe'
          : 'included';
    const result = outcome === 1n ? 'succeeded' : 'reverted';
    return {
      chain_status: chainStatus,
      verification:
        this.verificationMode === 'single' ? 'rpc-single' : 'rpc-quorum',
      outcome: result,
      settlement: chainStatus === 'finalized' ? result : 'pending',
      observed_at: new Date(Date.now()).toISOString(),
      transaction_hash: candidate,
      block_hash: blockHash,
      block_number: blockNumber.toString(),
      execution_origin:
        sender === plan.sponsor.binding.address.toLowerCase()
          ? 'sponsor'
          : 'external',
    };
  }
  /** Native balance at a common canonical block, with chain identity and block-hash agreement. */
  async payerBalance(sponsor: string): Promise<string> {
    const heads = await Promise.all(
      this.readers.map((reader) => this.heads(reader)),
    );
    const height = heads.reduce(
      (minimum, head) => (head.latest < minimum ? head.latest : minimum),
      heads[0].latest,
    );
    const values = await Promise.all(
      this.readers.map(async (reader) => {
        const [rawBlock, balance] = await Promise.all([
          reader.call('eth_getBlockByNumber', [toQuantity(height), false]),
          reader.call('eth_getBalance', [address(sponsor), toQuantity(height)]),
        ]);
        const block = checked(rawBlock);
        if (quantity(block.number) !== height) unavailable();
        return {
          hash: hash(block.hash),
          balance: quantity(balance).toString(),
        };
      }),
    );
    if (
      values.some(
        (value) => JSON.stringify(value) !== JSON.stringify(values[0]),
      )
    )
      unavailable();
    return values[0].balance;
  }
  /** Read-only nonce diagnostics at common canonical block heights; pending counts are explicitly local hints. */
  async nonceSnapshot(
    plan: TransferExecutionPlan,
    ownHash?: string,
  ): Promise<NonceSnapshot> {
    plan = structuredClone(plan);
    this.validatePlanNetwork(plan);
    if (plan.genesisHash.toLowerCase() !== this.genesisHash.toLowerCase())
      unavailable();
    const heads = await Promise.all(
      this.readers.map((reader) => this.heads(reader)),
    );
    const latest = heads.reduce(
      (minimum, head) => (head.latest < minimum ? head.latest : minimum),
      heads[0].latest,
    );
    const finalized = heads.reduce(
      (minimum, head) => (head.finalized < minimum ? head.finalized : minimum),
      heads[0].finalized,
    );
    const values = await Promise.all(
      this.readers.map(async (reader) => {
        const sponsor = plan.sponsor.binding.address;
        const [
          rawHead,
          rawFinal,
          confirmed,
          finalNonce,
          pending,
          balance,
          transaction,
        ] = await Promise.all([
          reader.call('eth_getBlockByNumber', [toQuantity(latest), false]),
          reader.call('eth_getBlockByNumber', [toQuantity(finalized), false]),
          reader.call('eth_getTransactionCount', [sponsor, toQuantity(latest)]),
          reader.call('eth_getTransactionCount', [
            sponsor,
            toQuantity(finalized),
          ]),
          reader.call('eth_getTransactionCount', [sponsor, 'pending']),
          reader.call('eth_getBalance', [sponsor, toQuantity(latest)]),
          ownHash
            ? reader.call('eth_getTransactionByHash', [hash(ownHash)])
            : Promise.resolve(null),
        ]);
        const head = checked(rawHead),
          final = checked(rawFinal);
        if (
          quantity(head.number) !== latest ||
          quantity(final.number) !== finalized ||
          quantity(finalNonce) > quantity(confirmed)
        )
          unavailable();
        let transactionNonce: string | undefined;
        let transactionEvidence: Partial<NonceSnapshot> = {};
        if (transaction !== null) {
          const tx = checked(transaction);
          if (
            hash(tx.hash) !== hash(ownHash!) ||
            address(tx.from) !== sponsor.toLowerCase() ||
            address(tx.to) !==
              String(
                plan.action.payload.domain.verifyingContract,
              ).toLowerCase() ||
            quantity(tx.value) !== 0n ||
            quantity(tx.chainId) !==
              BigInt(providerNetwork(this.network).chainId) ||
            String(tx.input).toLowerCase() !== plan.data.toLowerCase() ||
            tx.type !== '0x2' ||
            quantity(tx.gas) !== BigInt(plan.sponsor.gasLimit) ||
            quantity(tx.maxFeePerGas) > BigInt(plan.sponsor.maxFeePerGas) ||
            quantity(tx.maxPriorityFeePerGas) >
              BigInt(plan.sponsor.maxPriorityFeePerGas)
          )
            unavailable();
          transactionNonce = quantity(tx.nonce).toString();
          transactionEvidence = {
            transactionHash: hash(tx.hash),
            transactionMaxFeePerGas: quantity(tx.maxFeePerGas).toString(),
            transactionMaxPriorityFeePerGas: quantity(
              tx.maxPriorityFeePerGas,
            ).toString(),
            transactionPending:
              tx.blockNumber === null &&
              tx.blockHash === null &&
              Array.isArray(tx.accessList) &&
              tx.accessList.length === 0,
          };
        }
        let safeNonce: string | undefined;
        if (plan.intent) {
          const account = plan.intent.account;
          const code = await reader.call('eth_getCode', [
            account.address,
            toQuantity(latest),
          ]);
          if (typeof code !== 'string' || keccak256(code) !== account.codeHash)
            unavailable();
          safeNonce = await this.safeAccount(
            reader,
            account,
            plan.action.chain_account_id.split(':')[2],
            toQuantity(latest),
          );
        }
        return {
          ...transactionEvidence,
          headHash: hash(head.hash),
          finalHash: hash(final.hash),
          confirmedNonce: quantity(confirmed).toString(),
          finalizedNonce: quantity(finalNonce).toString(),
          balanceWei: quantity(balance).toString(),
          baseFeePerGas: quantity(head.baseFeePerGas).toString(),
          ...(transactionNonce !== undefined ? { transactionNonce } : {}),
          ...(safeNonce !== undefined ? { safeNonce } : {}),
          pending: quantity(pending),
        };
      }),
    );
    const { pending: _pending, ...first } = values[0];
    if (
      values.some(
        ({ pending: _hint, ...value }) =>
          JSON.stringify(value) !== JSON.stringify(first),
      )
    )
      unavailable();
    const { headHash: _head, finalHash: _final, ...snapshot } = first;
    return {
      ...snapshot,
      pendingNonceMinimum: values
        .reduce((a, v) => (a < v.pending ? a : v.pending), values[0].pending)
        .toString(),
      pendingNonceMaximum: values
        .reduce((a, v) => (a > v.pending ? a : v.pending), values[0].pending)
        .toString(),
    };
  }
  async observe(
    plan: TransferExecutionPlan,
    candidates: string[],
    ownHash?: string,
    scanFromBlock?: string,
  ): Promise<ChainObservation & { scanNextBlock?: string }> {
    try {
      return await this.observeRead(
        structuredClone(plan),
        [...candidates],
        ownHash,
        scanFromBlock,
      );
    } catch {
      return unavailable();
    }
  }
  private async observeRead(
    plan: TransferExecutionPlan,
    input: string[],
    ownHash?: string,
    scanFromBlock = plan.scanFromBlock,
  ): Promise<ChainObservation & { scanNextBlock?: string }> {
    this.validatePlanNetwork(plan);
    if (plan.genesisHash.toLowerCase() !== this.genesisHash.toLowerCase())
      unavailable();
    const known = [
      ...new Set([...(ownHash ? [ownHash] : []), ...input].map(hash)),
    ].slice(0, 8);
    const first = known[0];
    const key = first ? this.proofKey(plan, first, ownHash) : undefined;
    const proof = key ? this.inclusionProofs.get(key) : undefined;
    const quoteAge = plan.networkFees
      ? Date.now() - Date.parse(plan.networkFees.quotedAt)
      : Infinity;
    let earlyReceipts: unknown[] | undefined;
    if (
      this.reuseInclusionProofs &&
      this.verificationMode === 'single' &&
      plan.intent &&
      plan.runtimePolicy &&
      ownHash &&
      known.length === 1 &&
      quoteAge >= 0 &&
      quoteAge < 30000 &&
      (!proof || proof.expiresAt <= Date.now())
    ) {
      earlyReceipts = await Promise.all(
        this.readers.map((reader) =>
          reader.call('eth_getTransactionReceipt', [first]),
        ),
      );
      if (earlyReceipts.every((receipt) => receipt === null))
        return {
          scanNextBlock: scanFromBlock,
          chain_status: 'pending',
          verification: 'unverified',
          outcome: 'unknown',
          settlement: 'pending',
          observed_at: new Date().toISOString(),
        };
    }
    const reads = await Promise.all(
      this.readers.map(async (reader, index) => {
        const read = async (): Promise<
          { receipt?: [unknown, unknown]; block?: unknown } | undefined
        > => {
          if (!first || !plan.intent || !this.reuseInclusionProofs)
            return undefined;
          if (proof && proof.expiresAt > Date.now())
            return {
              block: await reader.call('eth_getBlockByNumber', [
                toQuantity(BigInt(proof.observation.block_number!)),
                false,
              ]),
            };
          if (earlyReceipts)
            return {
              receipt: [
                earlyReceipts[index],
                await reader.call('eth_getTransactionByHash', [first]),
              ],
            };
          return {
            receipt: await Promise.all([
              reader.call('eth_getTransactionReceipt', [first]),
              reader.call('eth_getTransactionByHash', [first]),
            ]),
          };
        };
        const [heads, prefetched] = await Promise.all([
          this.heads(reader),
          read(),
        ]);
        return { heads, prefetched };
      }),
    );
    const heads = reads.map((r) => r.heads);
    const from = BigInt(scanFromBlock);
    if (from < BigInt(plan.scanFromBlock)) unavailable();
    const end = from + BigInt(this.maxLogRange) - 1n;
    const finalized = heads.reduce(
      (minimum, head) => (head.finalized < minimum ? head.finalized : minimum),
      heads[0].finalized,
    );
    // Advance only across finalized history; re-scan the unfinalized tail after reorgs.
    const next = (end < finalized ? end : finalized) + 1n;
    const scanNextBlock = (next > from ? next : from).toString();
    let reorged = false;
    let pending = false;
    const verifyCandidates = async (
      candidates: string[],
      nextBlock: string,
    ): Promise<(ChainObservation & { scanNextBlock: string }) | undefined> => {
      for (const candidate of candidates) {
        const observations = await Promise.all(
          this.readers.map((reader, index) =>
            this.verify(
              reader,
              plan,
              candidate,
              ownHash?.toLowerCase(),
              heads[index],
              candidate === first ? reads[index].prefetched : undefined,
            ),
          ),
        );
        if (observations.includes('reorged')) {
          reorged = true;
          continue;
        }
        if (observations.some((value) => value === null)) {
          pending = true;
          continue;
        }
        const values = observations as ChainObservation[];
        if (
          values.some(
            (value) =>
              value.transaction_hash !== values[0].transaction_hash ||
              value.block_hash !== values[0].block_hash ||
              value.block_number !== values[0].block_number ||
              value.outcome !== values[0].outcome ||
              value.safe_nonce_consumed !== values[0].safe_nonce_consumed ||
              value.execution_origin !== values[0].execution_origin ||
              serviceHash(value.callsReceipt ?? null) !==
                serviceHash(values[0].callsReceipt ?? null),
          )
        )
          unavailable();
        const status = values.every(
          (value) => value.chain_status === 'finalized',
        )
          ? 'finalized'
          : values.every(
                (value) =>
                  value.chain_status === 'safe' ||
                  value.chain_status === 'finalized',
              )
            ? 'safe'
            : 'included';
        return {
          ...values[0],
          scanNextBlock: nextBlock,
          chain_status: status,
          settlement:
            status === 'finalized'
              ? (values[0].outcome as 'succeeded' | 'reverted')
              : 'pending',
          observed_at: new Date(Date.now()).toISOString(),
        };
      }
      return undefined;
    };
    // Exact known receipts need no history scan, but still require every RPC's full verification.
    const direct = await verifyCandidates(known, scanFromBlock);
    if (direct) return direct;
    const found = await Promise.all(
      this.readers.map((reader, index) =>
        this.find(reader, plan, heads[index].latest, from),
      ),
    );
    const common = found[0]
      .filter(
        (candidate) =>
          !known.includes(candidate) &&
          found.every((group) => group.includes(candidate)),
      )
      .slice(0, 8 - known.length);
    const discovered = await verifyCandidates(common, scanNextBlock);
    if (discovered) return discovered;
    return {
      scanNextBlock,
      chain_status: reorged ? 'reorged' : pending ? 'pending' : 'unobserved',
      verification: 'unverified',
      outcome: 'unknown',
      settlement: 'pending',
      observed_at: new Date(Date.now()).toISOString(),
    };
  }
}

function serviceOwners(value: unknown): string[] {
  return [
    ...safeInterface.decodeFunctionResult('getOwners', String(value))[0],
  ] as string[];
}

/** Compatibility name for existing transfer integrations. */
export { QuorumExecutionObserver as QuorumTransferObserver };
