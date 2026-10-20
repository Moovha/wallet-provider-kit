import { WalletProviderError } from '../domain/signing.js';
import { rpcCapacity, rpcTransportScope } from './rpc-capacity.js';

/** Rotate complete read operations; retries never mix providers inside one proof. */
const groups = new WeakMap<
  typeof fetch,
  Map<
    string,
    { cursor: number; active: number[]; assigned: Map<string, number> }
  >
>();
export class RpcEndpointPool {
  private readonly state: {
    cursor: number;
    active: number[];
    assigned: Map<string, number>;
  };
  private get cursor() {
    return this.state.cursor;
  }
  private set cursor(value: number) {
    this.state.cursor = value;
  }
  private get active() {
    return this.state.active;
  }
  private readonly cooldowns = new Map<string, number>();
  private get assigned() {
    return this.state.assigned;
  }
  cooldown(endpoint: string) {
    this.cooldowns.set(endpoint, Date.now() + 1000);
  }
  constructor(
    private readonly endpoints: string[],
    private readonly transport: typeof fetch = fetch,
    private readonly preferResponsiveEndpoints = false,
  ) {
    if (
      !endpoints.length ||
      endpoints.length > 3 ||
      new Set(endpoints).size !== endpoints.length
    )
      throw new WalletProviderError('wallet_provider_configuration');
    const scope = rpcTransportScope(transport);
    let transportGroups = groups.get(scope);
    if (!transportGroups) {
      transportGroups = new Map();
      groups.set(scope, transportGroups);
    }
    const key = JSON.stringify(endpoints);
    this.state = transportGroups.get(key) ?? {
      cursor: 0,
      active: endpoints.map(() => 0),
      assigned: new Map(),
    };
    transportGroups.set(key, this.state);
  }
  async run<T>(
    work: (endpoint: string) => Promise<T>,
    requirements: string[] = [],
  ): Promise<T> {
    const attempted = new Set<number>();
    for (;;) {
      const candidates = this.endpoints
        .map((_, i) => (this.cursor + i) % this.endpoints.length)
        .filter(
          (i) =>
            !attempted.has(i) &&
            requirements.every((feature) =>
              rpcCapacity(this.transport, this.endpoints[i]).supports(feature),
            ) &&
            (this.cooldowns.get(this.endpoints[i]) ?? 0) <= Date.now() &&
            rpcCapacity(this.transport, this.endpoints[i]).retryAfter <=
              Date.now(),
        );
      candidates.sort((a, b) => {
        if (!this.preferResponsiveEndpoints)
          return this.active[a] - this.active[b];
        const capacity = (i: number) =>
          rpcCapacity(this.transport, this.endpoints[i]);
        const probe = (i: number) =>
          this.active[i] === 0 &&
          capacity(i).readPressure === 0 &&
          Date.now() -
            Math.max(
              capacity(i).lastReadAt,
              this.assigned.get(this.endpoints[i]) ?? 0,
            ) >=
            30000;
        if (probe(a) !== probe(b)) return probe(a) ? -1 : 1;
        return (
          (Math.max(
            this.active[a],
            capacity(a).readPressure / capacity(a).maximumConcurrentReads,
          ) +
            1) *
            capacity(a).readLatencyMs -
          (Math.max(
            this.active[b],
            capacity(b).readPressure / capacity(b).maximumConcurrentReads,
          ) +
            1) *
            capacity(b).readLatencyMs
        );
      });
      const index = candidates[0];
      if (index === undefined)
        throw new WalletProviderError('wallet_provider_unavailable', 'unknown');
      attempted.add(index);
      this.assigned.set(this.endpoints[index], Date.now());
      this.cursor = (index + 1) % this.endpoints.length;
      this.active[index]++;
      try {
        return await work(this.endpoints[index]);
      } catch (error) {
        // Only endpoint availability failures permit a retry. Policy or proof failures remain failures.
        if (
          !(error instanceof WalletProviderError) ||
          error.code !== 'wallet_provider_unavailable' ||
          (requirements.every((feature) =>
            rpcCapacity(this.transport, this.endpoints[index]).supports(
              feature,
            ),
          ) &&
            rpcCapacity(this.transport, this.endpoints[index]).retryAfter <=
              Date.now() &&
            (this.cooldowns.get(this.endpoints[index]) ?? 0) <= Date.now())
        )
          throw error;
      } finally {
        this.active[index]--;
      }
    }
  }
}
