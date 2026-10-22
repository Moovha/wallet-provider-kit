import { WalletProviderError } from '../domain/signing.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const backgroundReads = new AsyncLocalStorage<boolean>();
/** Historical observation yields endpoint capacity to current requests without changing read freshness. */
export function runWithBackgroundRpcReads<T>(
  work: () => Promise<T>,
): Promise<T> {
  return backgroundReads.run(true, work);
}

const transportScopes = new WeakMap<typeof fetch, typeof fetch>();
export function rpcTransportScope(transport: typeof fetch): typeof fetch {
  return transportScopes.get(transport) ?? transport;
}
export function bindRpcTransport(transport: typeof fetch, base: typeof fetch) {
  transportScopes.set(transport, rpcTransportScope(base));
}

/** Shared across application observers using the same transport and exact endpoint. */
export class RpcCapacity {
  private genesis?: { key: string; expiresAt: number };
  private checkingGenesis?: { key: string; promise: Promise<void> };
  private identityEpoch = 0;
  invalidateGenesis() {
    this.identityEpoch++;
    this.genesis = undefined;
  }
  async verifyGenesis(key: string, work: () => Promise<void>) {
    if (this.genesis?.key === key && this.genesis.expiresAt > Date.now())
      return;
    if (this.checkingGenesis?.key === key) return this.checkingGenesis.promise;
    const epoch = this.identityEpoch;
    const promise = work()
      .then(() => {
        if (epoch === this.identityEpoch)
          this.genesis = { key, expiresAt: Date.now() + 60000 };
      })
      .finally(() => {
        if (this.checkingGenesis?.promise === promise)
          this.checkingGenesis = undefined;
      });
    this.checkingGenesis = { key, promise };
    return promise;
  }
  private readonly unsupported = new Map<string, number>();
  supports(feature: string) {
    return (this.unsupported.get(feature) ?? 0) <= Date.now();
  }
  unsupportedFor(feature: string) {
    this.unsupported.set(feature, Date.now() + 300000);
  }
  private readonly feed = new Map<
    string,
    { value: unknown; expiresAt: number }
  >();
  async feedRead(key: string, ttl: number, work: () => Promise<unknown>) {
    const cached = this.feed.get(key);
    if (cached && cached.expiresAt > Date.now())
      return structuredClone(cached.value);
    return this.shareRead('feed:' + key, async () => {
      const value = await work();
      this.feed.set(key, {
        value: structuredClone(value),
        expiresAt: Date.now() + ttl,
      });
      return value;
    });
  }
  private latency?: number;
  lastReadAt = 0;
  get readLatencyMs() {
    return this.latency ?? 1000;
  }
  recordReadSuccess(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    const sample = Math.max(1, Math.min(3000, milliseconds));
    this.latency =
      this.latency === undefined ? sample : this.latency * 0.8 + sample * 0.2;
    this.lastReadAt = Date.now();
  }
  private readonly reads = new Map<string, Promise<unknown>>();
  /** Share only overlapping identical reads; completed or failed responses are never cached. */
  async shareRead(key: string, work: () => Promise<unknown>): Promise<unknown> {
    let pending = this.reads.get(key);
    if (!pending) {
      if (this.reads.size >= 128) return work();
      pending = work().finally(() => {
        if (this.reads.get(key) === pending) this.reads.delete(key);
      });
      this.reads.set(key, pending);
    }
    return structuredClone(await pending);
  }
  retryAfter = 0;
  readonly maximumConcurrentReads = 8;
  private active = 0;
  private backgroundActive = 0;
  private readFailures = 0;
  private lastReadFailure = -Infinity;
  recordReadFailure() {
    this.invalidateGenesis();
    const now = Date.now();
    this.readFailures =
      now - this.lastReadFailure >= 30000
        ? 1
        : Math.min(5, this.readFailures + 1);
    this.lastReadFailure = now;
    this.retryAfter = Math.max(
      this.retryAfter,
      now + Math.min(15000, 1000 * 2 ** (this.readFailures - 1)),
    );
  }
  private readonly waiting: {
    resume: () => void;
    timer: ReturnType<typeof setTimeout>;
    background: boolean;
  }[] = [];
  get readPressure() {
    return this.active + this.waiting.length;
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    const background = backgroundReads.getStore() === true;
    if (
      this.active >= this.maximumConcurrentReads ||
      (background && this.backgroundActive >= 2) ||
      this.waiting.some((entry) => !entry.background)
    ) {
      if (
        this.waiting.length >= 64 ||
        (background &&
          this.waiting.filter((entry) => entry.background).length >= 32)
      )
        throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
      await new Promise<void>((resolve, reject) => {
        const entry = {
          resume: resolve,
          background,
          timer: setTimeout(() => {
            const index = this.waiting.indexOf(entry);
            if (index >= 0) this.waiting.splice(index, 1);
            reject(
              new WalletProviderError('wallet_provider_unavailable', 'unknown'),
            );
          }, 3000),
        };
        this.waiting.push(entry);
      });
    } else {
      this.active++;
      if (background) this.backgroundActive++;
    }
    try {
      return await work();
    } finally {
      this.active--;
      if (background) this.backgroundActive--;
      this.resumeWaiting();
    }
  }
  private resumeWaiting() {
    while (this.active < this.maximumConcurrentReads && this.waiting.length) {
      let index = this.waiting.findIndex((entry) => !entry.background);
      if (index < 0) {
        if (this.backgroundActive >= 2) return;
        index = 0;
      }
      const [next] = this.waiting.splice(index, 1);
      clearTimeout(next.timer);
      this.active++;
      if (next.background) this.backgroundActive++;
      next.resume();
    }
  }
}
const transports = new WeakMap<typeof fetch, Map<string, RpcCapacity>>();
export function rpcCapacity(
  transport: typeof fetch,
  endpoint: string,
): RpcCapacity {
  transport = rpcTransportScope(transport);
  let endpoints = transports.get(transport);
  if (!endpoints) {
    endpoints = new Map();
    transports.set(transport, endpoints);
  }
  let capacity = endpoints.get(endpoint);
  if (!capacity) {
    capacity = new RpcCapacity();
    endpoints.set(endpoint, capacity);
  }
  return capacity;
}
