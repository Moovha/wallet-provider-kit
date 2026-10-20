import { RpcSignals } from './rpc-signals.js';
import { providerNetwork } from '../networks.js';
import { QuorumExecutionObserver } from './chain.js';
import type { ProviderNetwork } from '../networks.js';
import type { ExecutionObserver } from './types.js';
import { RpcEndpointPool } from './rpc-pool.js';

/** One trusted RPC supplies each complete observation; healthy supplied endpoints share the work. */
export class SingleRpcExecutionObserver implements ExecutionObserver {
  private readonly pool: RpcEndpointPool;
  private readonly signals: RpcSignals;
  private readonly observers: Map<string, QuorumExecutionObserver>;
  constructor(
    endpoints: string[],
    genesisHash: string,
    maxLogRange: number,
    request: typeof fetch = fetch,
    network?: ProviderNetwork,
    reuseInclusionProofs = false,
    aggregateSafeReads = false,
  ) {
    this.signals = new RpcSignals(
      endpoints,
      String(providerNetwork(network).chainId),
    );
    this.pool = new RpcEndpointPool(endpoints, request, reuseInclusionProofs);
    this.observers = new Map(
      endpoints.map((endpoint) => [
        endpoint,
        new QuorumExecutionObserver(
          [endpoint],
          genesisHash,
          maxLogRange,
          request,
          network,
          'single',
          reuseInclusionProofs,
          aggregateSafeReads,
        ),
      ]),
    );
  }
  private run<T>(
    work: (observer: QuorumExecutionObserver, endpoint: string) => Promise<T>,
  ) {
    return this.pool.run((endpoint) =>
      work(this.observers.get(endpoint)!, endpoint),
    );
  }
  async subscribe(
    _plan: import('./types.js').TransferExecutionPlan,
    wake: () => void,
  ) {
    return this.signals.subscribe(wake);
  }
  anchor() {
    return this.run((o) => o.anchor());
  }
  verifyNetwork() {
    return this.run((o) => o.verifyNetwork());
  }
  preflightUnsigned(
    ...args: Parameters<QuorumExecutionObserver['preflightUnsigned']>
  ) {
    return this.run((o) => o.preflightUnsigned(...args));
  }
  preflight(...args: Parameters<QuorumExecutionObserver['preflight']>) {
    return this.run((o) => o.preflight(...args));
  }
  observeFresh(...args: Parameters<QuorumExecutionObserver['observeFresh']>) {
    return this.run(async (o, endpoint) => {
      const result = await o.observeFresh(...args);
      return result.verification === 'rpc-single'
        ? { ...result, rpc_source_origin: new URL(endpoint).origin }
        : result;
    });
  }
  recheckInclusion(
    ...args: Parameters<QuorumExecutionObserver['recheckInclusion']>
  ) {
    return this.run(async (o, endpoint) => {
      const result = await o.recheckInclusion(...args);
      return result?.verification === 'rpc-single'
        ? { ...result, rpc_source_origin: new URL(endpoint).origin }
        : result;
    });
  }
  observe(...args: Parameters<QuorumExecutionObserver['observe']>) {
    this.signals.track([...(args[1] ?? []), ...(args[2] ? [args[2]] : [])]);
    return this.run(async (o, endpoint) => {
      const result = await o.observe(...args);
      const preconfirmation = this.signals.preconfirmation([
        ...(args[1] ?? []),
        ...(args[2] ? [args[2]] : []),
      ]);
      if (preconfirmation && result.verification === 'unverified')
        result.preconfirmation = preconfirmation;
      return result.verification === 'rpc-single'
        ? { ...result, rpc_source_origin: new URL(endpoint).origin }
        : result;
    });
  }
  contractNonce(...args: Parameters<QuorumExecutionObserver['contractNonce']>) {
    return this.run((o) => o.contractNonce(...args));
  }
  actionNonce(...args: Parameters<QuorumExecutionObserver['actionNonce']>) {
    return this.run((o) => o.actionNonce(...args));
  }
  payerBalance(...args: Parameters<QuorumExecutionObserver['payerBalance']>) {
    return this.run((o) => o.payerBalance(...args));
  }
  nonceSnapshot(...args: Parameters<QuorumExecutionObserver['nonceSnapshot']>) {
    return this.run((o) => o.nonceSnapshot(...args));
  }
}
export function createRpcObserver(
  endpoints: string[],
  genesisHash: string,
  maxLogRange: number,
  request: typeof fetch = fetch,
  network?: ProviderNetwork,
  mode: 'single' | 'quorum' = 'quorum',
  reuseInclusionProofs = false,
  aggregateSafeReads = false,
) {
  return mode === 'single'
    ? new SingleRpcExecutionObserver(
        endpoints,
        genesisHash,
        maxLogRange,
        request,
        network,
        reuseInclusionProofs,
        aggregateSafeReads,
      )
    : new QuorumExecutionObserver(
        endpoints,
        genesisHash,
        maxLogRange,
        request,
        network,
        'quorum',
        reuseInclusionProofs,
        aggregateSafeReads,
      );
}
