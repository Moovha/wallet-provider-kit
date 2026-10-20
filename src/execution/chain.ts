import { record } from '../domain/json.js';

import { rpcCapacity, type RpcCapacity } from './rpc-capacity.js';
import { WalletProviderError } from '../domain/signing.js';
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
  if (!value || typeof value !== 'object' || Array.isArray(value))
    unavailable();
  return value as Record<string, unknown>;
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
  /** Opaque endpoint/transport identity for bounded read-only inspection batching. */
  get readScope(): object {
    return this.capacity;
  }
  /** Cache only the public fee sample briefly; each caller applies its current spending ceilings. */
  async feeHistory() {
    return this.capacity.feedRead('network-fee-history-75', 500, () =>
      this.call('eth_feeHistory', ['0x5', 'latest', [75]]),
    );
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
